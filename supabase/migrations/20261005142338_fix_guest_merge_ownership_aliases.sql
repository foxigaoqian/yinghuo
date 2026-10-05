-- Qualify ownership columns in a RETURNS TABLE function and preserve real historical message labels.
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
    update public.conversations as moved set user_id = v_result.user_id
      where moved.user_id = p_guest_user_id;
    update public.profile_members as moved set user_id = v_result.user_id
      where moved.user_id = p_guest_user_id;
    update public.profile_preferences as moved set user_id = v_result.user_id
      where moved.user_id = p_guest_user_id;
    update public.consents as moved set user_id = v_result.user_id
      where moved.user_id = p_guest_user_id;
    update public.private_stories set owner_user_id = v_result.user_id
      where owner_user_id = p_guest_user_id and deleted_at is null;
    update public.profile_avatars set owner_user_id = v_result.user_id
      where owner_user_id = p_guest_user_id;
    update public.user_feedback as moved set user_id = v_result.user_id
      where moved.user_id = p_guest_user_id;
    update public.support_tickets as moved set user_id = v_result.user_id
      where moved.user_id = p_guest_user_id;

    update public.app_users
    set free_slot_consumed_at = coalesce(free_slot_consumed_at, pg_catalog.now())
    where id = v_result.user_id and exists (
      select 1 from public.profiles where creator_user_id = v_result.user_id and deleted_at is null
    );

    -- Local H5 drafts remain on-device; stale server drafts must not shadow the target account.
    delete from public.user_drafts as stale where stale.user_id = p_guest_user_id;
    delete from public.account_recovery_codes as stale where stale.user_id = p_guest_user_id;
    delete from public.sessions as stale where stale.user_id = p_guest_user_id;

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
              'mock', m.status not in ('live_completed', 'archived', 'context_excluded')
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

