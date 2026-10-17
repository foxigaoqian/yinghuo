alter function public.yinghuo_get_app_state(bytea, timestamptz, uuid, boolean, boolean)
  rename to yinghuo_get_app_state_core;

create function public.yinghuo_get_app_state(
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
  v_state jsonb;
  v_user_id uuid;
  v_avatar_hash text;
  v_avatar_url text;
begin
  v_state := public.yinghuo_get_app_state_core(
    p_refresh_hash,
    p_expires_at,
    p_requested_profile_id,
    p_include_messages,
    p_include_posts
  );
  if v_state is null then return null; end if;

  v_user_id := (v_state #>> '{session,userId}')::uuid;
  select u.avatar_sha256_hex
  into v_avatar_hash
  from public.app_users u
  where u.id = v_user_id and u.deleted_at is null
  limit 1;

  if v_avatar_hash is not null then
    v_avatar_url := '/api/v1/square/authors/' || v_user_id || '/avatar?v=' || left(v_avatar_hash, 12);
  end if;

  return jsonb_set(
    v_state,
    '{bootstrap,userAvatarUrl}',
    coalesce(to_jsonb(v_avatar_url), 'null'::jsonb),
    true
  );
end;
$$;

revoke all on function public.yinghuo_get_app_state_core(bytea, timestamptz, uuid, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.yinghuo_get_app_state(bytea, timestamptz, uuid, boolean, boolean)
  from public, anon, authenticated;

grant execute on function public.yinghuo_get_app_state_core(bytea, timestamptz, uuid, boolean, boolean)
  to service_role;
grant execute on function public.yinghuo_get_app_state(bytea, timestamptz, uuid, boolean, boolean)
  to service_role;
