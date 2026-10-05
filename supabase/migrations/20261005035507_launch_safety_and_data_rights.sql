begin;

-- A phone number is contact information until SMS verification exists. It must
-- not become an account identifier or block another guest from saving it.
alter table public.app_users
  drop constraint if exists app_users_phone_hash_key;

create table if not exists public.user_feedback (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  category varchar(20) not null check (category in ('problem', 'suggestion', 'privacy')),
  body text not null check (length(body) between 2 and 2000),
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists user_feedback_user_created_idx
  on public.user_feedback(user_id, created_at desc);

alter table public.user_feedback enable row level security;
revoke all on table public.user_feedback from public, anon, authenticated;
grant select, insert, update, delete on table public.user_feedback to service_role;

create or replace function public.yinghuo_touch_guest_session(
  p_user_id uuid,
  p_refresh_hash bytea,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_refresh_hash is null or pg_catalog.octet_length(p_refresh_hash) <> 32
     or p_expires_at <= pg_catalog.now()
     or p_expires_at > pg_catalog.now() + interval '90 days' then
    return false;
  end if;
  update public.sessions
  set expires_at = p_expires_at
  where user_id = p_user_id
    and refresh_hash = p_refresh_hash
    and revoked_at is null
    and expires_at > pg_catalog.now();
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.yinghuo_delete_account(
  p_user_id uuid,
  p_refresh_hash bytea
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
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
$$;

revoke all on function public.yinghuo_touch_guest_session(uuid, bytea, timestamptz)
  from public, anon, authenticated;
revoke all on function public.yinghuo_delete_account(uuid, bytea)
  from public, anon, authenticated;
grant execute on function public.yinghuo_touch_guest_session(uuid, bytea, timestamptz)
  to service_role;
grant execute on function public.yinghuo_delete_account(uuid, bytea)
  to service_role;

notify pgrst, 'reload schema';
commit;
