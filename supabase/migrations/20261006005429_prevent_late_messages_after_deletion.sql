-- Serialize message inserts with profile/account erasure across all Worker versions.
-- The lock is acquired only during persistence, never while the AI model runs.
create or replace function public.yinghuo_lock_message_writes(
  p_user_id uuid, p_exclusive boolean
) returns void
language plpgsql security invoker volatile set search_path = '' as $$
declare
  v_key bigint;
begin
  if p_user_id is null then return; end if;
  v_key := pg_catalog.hashtextextended('yinghuo:message-writes:' || p_user_id::text, 0);
  if p_exclusive then
    perform pg_catalog.pg_advisory_xact_lock(v_key);
  else
    perform pg_catalog.pg_advisory_xact_lock_shared(v_key);
  end if;
end;
$$;

create or replace function public.yinghuo_guard_message_insert()
returns trigger
language plpgsql security invoker volatile set search_path = '' as $$
declare
  v_user_id uuid;
begin
  select c.user_id into v_user_id
  from public.conversations c where c.id = new.conversation_id;
  if v_user_id is null then
    raise exception using errcode = '23503', message = 'Message conversation is unavailable';
  end if;

  perform public.yinghuo_lock_message_writes(v_user_id, false);

  -- Re-read after acquiring the lock: a concurrent deletion may have completed
  -- while this insert was waiting. VOLATILE uses a fresh statement snapshot.
  if not exists (
    select 1
    from public.conversations c
    join public.profiles p on p.id = c.profile_id
    join public.app_users u on u.id = c.user_id
    where c.id = new.conversation_id and c.user_id = v_user_id
      and p.creator_user_id = c.user_id
      and p.status = 'active' and p.deleted_at is null
      and u.status = 'active' and u.deleted_at is null
  ) then
    raise exception using errcode = '23514', message = 'Message write requires an active account and profile';
  end if;
  return new;
end;
$$;

revoke all on function public.yinghuo_lock_message_writes(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.yinghuo_guard_message_insert()
  from public, anon, authenticated;
grant execute on function public.yinghuo_lock_message_writes(uuid, boolean) to service_role;
grant execute on function public.yinghuo_guard_message_insert() to service_role;

drop trigger if exists yinghuo_message_insert_guard on public.messages;
create trigger yinghuo_message_insert_guard
before insert on public.messages
for each row execute function public.yinghuo_guard_message_insert();

CREATE OR REPLACE FUNCTION public.yinghuo_delete_account(p_user_id uuid, p_refresh_hash bytea)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_deleted integer;
begin
  -- Take the erasure lock before touching rows, so an earlier insert commits
  -- before redaction and a later insert must re-check the deleted state.
  perform public.yinghuo_lock_message_writes(p_user_id, true);
  if p_refresh_hash is null or pg_catalog.octet_length(p_refresh_hash) <> 32 then
    return false;
  end if;
  if not exists (
    select 1 from public.sessions
    where user_id = p_user_id
      and refresh_hash = p_refresh_hash
      and revoked_at is null
      and expires_at > pg_catalog.now()
  ) then
    return false;
  end if;

  -- Keep only an anonymous tombstone for referential and audit integrity.
  -- User-authored text, avatar data, contact information and credentials are
  -- erased synchronously before the session cookie is cleared by the Worker.
  update public.private_stories
  set title = '已删除故事',
      body = '该故事已由作者删除',
      visibility = 'private',
      deleted_at = coalesce(deleted_at, pg_catalog.now())
  where owner_user_id = p_user_id;

  update public.memory_versions mv
  set body = '已删除'
  where exists (
    select 1 from public.memories m
    where m.id = mv.memory_id and m.owner_user_id = p_user_id
  );

  update public.memory_chunks
  set embedding = null
  where owner_user_id = p_user_id;

  update public.memories
  set title = null,
      body = '已删除',
      use_for_ai = false,
      active_for_basic = false,
      deleted_at = coalesce(deleted_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where owner_user_id = p_user_id;

  update public.messages msg
  set text = '[内容已删除]',
      asset_id = null,
      generation_id = null
  where exists (
    select 1 from public.conversations c
    where c.id = msg.conversation_id and c.user_id = p_user_id
  );

  delete from public.profile_avatars where owner_user_id = p_user_id;

  update public.profile_preferences
  set call_me = null,
      updated_at = pg_catalog.now()
  where user_id = p_user_id;

  update public.profiles
  set display_name = '已删除',
      relationship = null,
      avatar_asset_id = null,
      deleted_at = coalesce(deleted_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where creator_user_id = p_user_id;

  delete from public.account_recovery_codes where user_id = p_user_id;
  delete from public.user_feedback where user_id = p_user_id;
  delete from public.sessions where user_id = p_user_id;

  update public.app_users
  set display_name = '已删除用户',
      status = 'deleted',
      phone_hash = null,
      encrypted_phone = null,
      phone_last4 = null,
      phone_verified = false,
      phone_bound_at = null,
      family_code = null,
      gender = null,
      birth_year = null,
      deleted_at = coalesce(deleted_at, pg_catalog.now()),
      updated_at = pg_catalog.now(),
      version = version + 1
  where id = p_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$function$;
CREATE OR REPLACE FUNCTION public.yinghuo_delete_profile(p_user_id uuid, p_profile_id uuid, p_refresh_hash bytea)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_updated integer;
begin
  -- Take the erasure lock before touching rows, so an earlier insert commits
  -- before redaction and a later insert must re-check the deleted state.
  perform public.yinghuo_lock_message_writes(p_user_id, true);
  if p_refresh_hash is null or pg_catalog.octet_length(p_refresh_hash) <> 32 then
    return false;
  end if;
  if not exists (
    select 1 from public.sessions
    where user_id = p_user_id
      and refresh_hash = p_refresh_hash
      and revoked_at is null
      and expires_at > pg_catalog.now()
  ) then
    return false;
  end if;
  perform 1 from public.profiles
  where id = p_profile_id and creator_user_id = p_user_id and deleted_at is null
  for update;
  if not found then return false; end if;

  update public.messages msg
  set text = '[内容已删除]',
      asset_id = null,
      generation_id = null,
      context_memory_ids = null,
      status = 'archived'
  where exists (
    select 1 from public.conversations c
    where c.id = msg.conversation_id
      and c.profile_id = p_profile_id
      and c.user_id = p_user_id
  );

  update public.memory_versions mv
  set body = '已删除'
  where exists (
    select 1 from public.memories m
    where m.id = mv.memory_id
      and m.profile_id = p_profile_id
      and m.owner_user_id = p_user_id
  );

  update public.memory_chunks
  set embedding = null
  where profile_id = p_profile_id and owner_user_id = p_user_id;

  update public.memories
  set title = null,
      body = '已删除',
      use_for_ai = false,
      active_for_basic = false,
      deleted_at = coalesce(deleted_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where profile_id = p_profile_id and owner_user_id = p_user_id;

  delete from public.profile_avatars
  where profile_id = p_profile_id and owner_user_id = p_user_id;

  update public.profile_preferences
  set call_me = null, updated_at = pg_catalog.now()
  where profile_id = p_profile_id and user_id = p_user_id;

  update public.consents
  set revoked_at = coalesce(revoked_at, pg_catalog.now())
  where profile_id = p_profile_id and user_id = p_user_id;

  update public.profile_members
  set status = 'removed', removed_at = coalesce(removed_at, pg_catalog.now())
  where profile_id = p_profile_id and user_id = p_user_id;

  update public.profiles
  set display_name = '已删除',
      relationship = null,
      avatar_asset_id = null,
      status = 'deleted',
      deleted_at = coalesce(deleted_at, pg_catalog.now()),
      updated_at = pg_catalog.now(),
      version = version + 1
  where id = p_profile_id and creator_user_id = p_user_id and deleted_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 1 and not exists (
    select 1 from public.profiles where creator_user_id = p_user_id and deleted_at is null
  ) then
    update public.app_users set free_slot_consumed_at = null where id = p_user_id;
  end if;
  return v_updated = 1;
end;
$function$;