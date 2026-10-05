-- Launch hardening: single-RPC state hydration, recover-and-merge, profile deletion,
-- explainable story moderation metadata, complete exports, and feedback context.

alter table public.messages
  add column if not exists context_memory_ids uuid[];

alter table public.private_stories
  add column if not exists consent_version varchar(40),
  add column if not exists consented_at timestamptz,
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz;

create index if not exists private_stories_moderation_created_idx
  on public.private_stories(moderation, created_at desc)
  where deleted_at is null;

alter table public.user_feedback
  add column if not exists page_url text,
  add column if not exists user_agent varchar(240),
  add column if not exists app_version varchar(40),
  add column if not exists request_id varchar(80);

create or replace function public.yinghuo_recover_guest_session_v2(
  p_family_code text,
  p_code_hash bytea,
  p_attempt_hash bytea,
  p_refresh_hash bytea,
  p_device_label text,
  p_expires_at timestamptz,
  p_guest_user_id uuid default null,
  p_guest_refresh_hash bytea default null,
  p_merge_guest boolean default false
)
returns table(
  status text,
  user_id uuid,
  account_kind varchar,
  family_code varchar,
  expires_at timestamptz,
  merged boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result record;
  v_guest_valid boolean := false;
begin
  select * into v_result
  from public.yinghuo_recover_guest_session(
    p_family_code,
    p_code_hash,
    p_attempt_hash,
    p_refresh_hash,
    p_device_label,
    p_expires_at
  );

  if v_result.status <> 'ok' or v_result.user_id is null then
    return query select
      v_result.status,
      v_result.user_id,
      v_result.account_kind,
      v_result.family_code,
      v_result.expires_at,
      false;
    return;
  end if;

  if p_merge_guest
     and p_guest_user_id is not null
     and p_guest_user_id <> v_result.user_id
     and p_guest_refresh_hash is not null
     and pg_catalog.octet_length(p_guest_refresh_hash) = 32 then
    select exists(
      select 1
      from public.sessions s
      join public.app_users u on u.id = s.user_id
      where s.user_id = p_guest_user_id
        and s.refresh_hash = p_guest_refresh_hash
        and s.revoked_at is null
        and s.expires_at > pg_catalog.now()
        and u.status = 'active'
        and u.deleted_at is null
        and u.account_kind = 'guest'
    ) into v_guest_valid;
  end if;

  if v_guest_valid then
    -- Move the user-created assets that are currently exposed by the H5 app.
    update public.profiles set creator_user_id = v_result.user_id
      where creator_user_id = p_guest_user_id and deleted_at is null;
    update public.memories set owner_user_id = v_result.user_id
      where owner_user_id = p_guest_user_id and deleted_at is null;
    update public.conversations set user_id = v_result.user_id
      where user_id = p_guest_user_id;
    update public.profile_members set user_id = v_result.user_id
      where user_id = p_guest_user_id;
    update public.profile_preferences set user_id = v_result.user_id
      where user_id = p_guest_user_id;
    update public.consents set user_id = v_result.user_id
      where user_id = p_guest_user_id;
    update public.private_stories set owner_user_id = v_result.user_id
      where owner_user_id = p_guest_user_id and deleted_at is null;
    update public.profile_avatars set owner_user_id = v_result.user_id
      where owner_user_id = p_guest_user_id;
    update public.user_feedback set user_id = v_result.user_id
      where user_id = p_guest_user_id;
    update public.support_tickets set user_id = v_result.user_id
      where user_id = p_guest_user_id;

    update public.app_users
    set free_slot_consumed_at = coalesce(free_slot_consumed_at, pg_catalog.now())
    where id = v_result.user_id and exists (
      select 1 from public.profiles where creator_user_id = v_result.user_id and deleted_at is null
    );

    -- Local H5 drafts remain on-device; stale server drafts must not shadow the target account.
    delete from public.user_drafts where user_id = p_guest_user_id;
    delete from public.account_recovery_codes where user_id = p_guest_user_id;
    delete from public.sessions where user_id = p_guest_user_id;

    update public.app_users
    set display_name = '已合并用户',
        status = 'deleted',
        account_kind = 'merged',
        merged_into_user_id = v_result.user_id,
        phone_hash = null,
        encrypted_phone = null,
        phone_last4 = null,
        phone_verified = false,
        phone_bound_at = null,
        family_code = null,
        deleted_at = coalesce(deleted_at, pg_catalog.now()),
        updated_at = pg_catalog.now(),
        version = version + 1
    where id = p_guest_user_id;
  end if;

  return query select
    v_result.status,
    v_result.user_id,
    v_result.account_kind,
    v_result.family_code,
    v_result.expires_at,
    v_guest_valid;
end;
$$;

create or replace function public.yinghuo_delete_profile(
  p_user_id uuid,
  p_profile_id uuid,
  p_refresh_hash bytea
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
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
$$;

create or replace function public.yinghuo_get_app_state(
  p_refresh_hash bytea,
  p_expires_at timestamptz,
  p_requested_profile_id uuid default null,
  p_include_messages boolean default false,
  p_include_posts boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_account_kind varchar;
  v_family_code varchar;
  v_free_slot_consumed_at timestamptz;
  v_phone_last4 varchar;
  v_phone_verified boolean;
  v_gender varchar;
  v_birth_year smallint;
  v_current_profile_id uuid;
  v_recent_conversation_id uuid;
  v_conversation_id uuid;
  v_conversation_epoch integer;
  v_profiles jsonb := '[]'::jsonb;
  v_memories jsonb := '[]'::jsonb;
  v_messages jsonb := '[]'::jsonb;
  v_posts jsonb := '[]'::jsonb;
  v_recovery_configured boolean := false;
  v_recovery_updated_at timestamptz;
begin
  if p_refresh_hash is null or pg_catalog.octet_length(p_refresh_hash) <> 32
     or p_expires_at <= pg_catalog.now()
     or p_expires_at > pg_catalog.now() + interval '90 days' then
    return null;
  end if;

  select u.id, u.account_kind, u.family_code, u.free_slot_consumed_at,
         u.phone_last4, u.phone_verified, u.gender, u.birth_year
  into v_user_id, v_account_kind, v_family_code, v_free_slot_consumed_at,
       v_phone_last4, v_phone_verified, v_gender, v_birth_year
  from public.sessions s
  join public.app_users u on u.id = s.user_id
  where s.refresh_hash = p_refresh_hash
    and s.revoked_at is null
    and s.expires_at > pg_catalog.now()
    and u.status = 'active'
    and u.deleted_at is null
  limit 1;

  if v_user_id is null then return null; end if;

  update public.sessions
  set expires_at = p_expires_at
  where refresh_hash = p_refresh_hash and user_id = v_user_id;

  select c.profile_id, c.id
  into v_current_profile_id, v_recent_conversation_id
  from public.conversations c
  join public.profiles p on p.id = c.profile_id
  where c.user_id = v_user_id
    and p.creator_user_id = v_user_id
    and p.status = 'active'
    and p.deleted_at is null
  order by c.last_message_at desc nulls last, c.created_at desc
  limit 1;

  if p_requested_profile_id is not null and exists (
    select 1 from public.profiles
    where id = p_requested_profile_id
      and creator_user_id = v_user_id
      and status = 'active'
      and deleted_at is null
  ) then
    v_current_profile_id := p_requested_profile_id;
  elsif v_current_profile_id is null then
    select p.id into v_current_profile_id
    from public.profiles p
    where p.creator_user_id = v_user_id
      and p.status = 'active'
      and p.deleted_at is null
    order by p.created_at desc
    limit 1;
  end if;

  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
  into v_profiles
  from (
    select p.created_at,
      jsonb_build_object(
        'id', p.id,
        'ownerId', v_user_id,
        'name', p.display_name,
        'relationship', coalesce(p.relationship, p.display_name),
        'nickname', case when p.display_name <> coalesce(p.relationship, p.display_name) then p.display_name else '' end,
        'avatarUrl', case when a.sha256_hex is not null then '/api/v1/profiles/' || p.id || '/avatar?v=' || left(a.sha256_hex, 12) else null end,
        'callMe', coalesce(pref.call_me, ''),
        'story', coalesce(story.body, ''),
        'aiConsent', exists(
          select 1 from public.consents con
          where con.profile_id = p.id and con.user_id = v_user_id
            and con.purpose = 'ai_persona_simulation' and con.revoked_at is null
        ),
        'createdAt', p.created_at
      ) as item
    from public.profiles p
    left join public.profile_preferences pref
      on pref.profile_id = p.id and pref.user_id = v_user_id
    left join public.profile_avatars a
      on a.profile_id = p.id and a.owner_user_id = v_user_id
    left join lateral (
      select m.body from public.memories m
      where m.profile_id = p.id and m.owner_user_id = v_user_id
        and m.source_type = 'profile_story' and m.deleted_at is null
      order by m.created_at asc limit 1
    ) story on true
    where p.creator_user_id = v_user_id
      and p.status = 'active'
      and p.deleted_at is null
  ) profile_items;

  if v_current_profile_id is not null then
    select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
    into v_memories
    from (
      select m.created_at,
        jsonb_build_object(
          'id', m.id, 'profileId', m.profile_id, 'ownerId', m.owner_user_id,
          'title', coalesce(m.title, '一段记忆'), 'body', m.body,
          'useForAi', m.use_for_ai, 'createdAt', m.created_at
        ) as item
      from public.memories m
      where m.profile_id = v_current_profile_id
        and m.owner_user_id = v_user_id
        and m.deleted_at is null
      order by m.created_at desc
      limit 200
    ) memory_items;

    if p_include_messages then
      select c.id, c.epoch into v_conversation_id, v_conversation_epoch
      from public.conversations c
      where c.profile_id = v_current_profile_id and c.user_id = v_user_id
      limit 1;
      if v_conversation_id is not null then
        select coalesce(jsonb_agg(item order by created_at asc, id asc), '[]'::jsonb)
        into v_messages
        from (
          select m.id, m.created_at,
            jsonb_build_object(
              'id', m.id, 'profileId', v_current_profile_id, 'ownerId', v_user_id,
              'role', case when m.role = 'assistant' then 'assistant' else 'user' end,
              'text', coalesce(m.text, ''), 'createdAt', m.created_at,
              'mock', m.status <> 'live_completed'
            ) as item
          from public.messages m
          where m.conversation_id = v_conversation_id and m.epoch = v_conversation_epoch
          order by m.created_at desc, m.id desc
          limit 80
        ) message_items;
      end if;
    end if;
  end if;

  if p_include_posts then
    select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
    into v_posts
    from (
      select s.created_at,
        jsonb_build_object(
          'id', s.id, 'ownerId', s.owner_user_id, 'title', s.title, 'body', s.body,
          'visibility', s.visibility, 'moderation', s.moderation,
          'moderationReason', s.moderation_reason, 'createdAt', s.created_at
        ) as item
      from public.private_stories s
      where s.owner_user_id = v_user_id and s.deleted_at is null
      order by s.created_at desc
      limit 100
    ) post_items;
  end if;

  select true, coalesce(r.rotated_at, r.created_at)
  into v_recovery_configured, v_recovery_updated_at
  from public.account_recovery_codes r
  where r.user_id = v_user_id
  limit 1;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'userId', v_user_id, 'accountKind', v_account_kind,
      'familyCode', v_family_code, 'mock', false
    ),
    'bootstrap', jsonb_build_object(
      'appVersion', '0.2.0', 'phase', 'A',
      'features', jsonb_build_object(
        'guestSession', true, 'profiles', true, 'textChat', true,
        'manualMemories', true, 'memoryCandidates', false, 'phoneRecovery', false,
        'photoUpload', true, 'profileAvatar', true, 'payment', false,
        'publicSquare', true, 'profileDeletion', true, 'accountMerge', true
      ),
      'terms', jsonb_build_object('aiDisclosure', 'ai-disclosure-v1'),
      'paymentCapabilities', '[]'::jsonb,
      'canCreateFreeProfile', v_free_slot_consumed_at is null,
      'accountState', case when v_phone_verified then 'bound' else 'guest' end,
      'boundPhone', case when v_phone_last4 is not null then '未验证 · 尾号 ' || v_phone_last4 else null end,
      'phoneVerified', coalesce(v_phone_verified, false),
      'gender', v_gender, 'birthYear', v_birth_year,
      'profileCount', jsonb_array_length(v_profiles),
      'recentProfileId', v_current_profile_id,
      'recentConversationId', v_recent_conversation_id,
      'recoveryConfigured', coalesce(v_recovery_configured, false),
      'recoveryUpdatedAt', v_recovery_updated_at,
      'pendingTaskCount', 0
    ),
    'profiles', v_profiles,
    'currentProfileId', v_current_profile_id,
    'memories', v_memories,
    'messages', v_messages,
    'orders', '[]'::jsonb,
    'posts', v_posts
  );
end;
$$;

revoke all on function public.yinghuo_recover_guest_session_v2(text, bytea, bytea, bytea, text, timestamptz, uuid, bytea, boolean)
  from public, anon, authenticated;
revoke all on function public.yinghuo_delete_profile(uuid, uuid, bytea)
  from public, anon, authenticated;
revoke all on function public.yinghuo_get_app_state(bytea, timestamptz, uuid, boolean, boolean)
  from public, anon, authenticated;

grant execute on function public.yinghuo_recover_guest_session_v2(text, bytea, bytea, bytea, text, timestamptz, uuid, bytea, boolean)
  to service_role;
grant execute on function public.yinghuo_delete_profile(uuid, uuid, bytea)
  to service_role;
grant execute on function public.yinghuo_get_app_state(bytea, timestamptz, uuid, boolean, boolean)
  to service_role;


create or replace function public.yinghuo_reset_conversation(
  p_user_id uuid, p_profile_id uuid, p_refresh_hash bytea
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_conversation_id uuid; v_epoch integer;
begin
  if not exists (
    select 1 from public.sessions s join public.app_users u on u.id = s.user_id
    where s.user_id = p_user_id and s.refresh_hash = p_refresh_hash
      and s.revoked_at is null and s.expires_at > pg_catalog.now()
      and u.status = 'active' and u.deleted_at is null
  ) then return false; end if;
  perform 1 from public.profiles
  where id = p_profile_id and creator_user_id = p_user_id and deleted_at is null
  for update;
  if not found then return false; end if;
  select id, epoch into v_conversation_id, v_epoch from public.conversations
  where profile_id = p_profile_id and user_id = p_user_id for update;
  if v_conversation_id is null then return true; end if;
  update public.messages set status = 'archived'
  where conversation_id = v_conversation_id and epoch = v_epoch and status = 'live_completed';
  update public.conversations set epoch = v_epoch + 1, last_message_at = null
  where id = v_conversation_id;
  return true;
end;
$$;
revoke all on function public.yinghuo_reset_conversation(uuid, uuid, bytea) from public, anon, authenticated;
grant execute on function public.yinghuo_reset_conversation(uuid, uuid, bytea) to service_role;
