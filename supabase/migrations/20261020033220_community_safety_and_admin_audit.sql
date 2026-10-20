alter table public.conversations
  add column if not exists safety_state text not null default 'normal'
  check (safety_state in ('normal', 'awaiting_confirmation'));

alter table public.app_users
  add column if not exists community_name text;

alter table public.app_users
  drop constraint if exists app_users_community_name_length;

alter table public.app_users
  add constraint app_users_community_name_length
  check (community_name is null or char_length(community_name) between 1 and 20);

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.story_comments(id) on delete cascade,
  story_id uuid not null references public.private_stories(id) on delete cascade,
  reporter_user_id uuid not null references public.app_users(id) on delete cascade,
  reason text not null default '不友善或不合适',
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (comment_id, reporter_user_id)
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists comment_reports_status_created_idx
  on public.comment_reports (status, created_at desc);
create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc);

alter table public.comment_reports enable row level security;
alter table public.admin_audit_logs enable row level security;

revoke all on public.comment_reports from anon, authenticated;
revoke all on public.admin_audit_logs from anon, authenticated;
grant select, insert, update, delete on public.comment_reports to service_role;
grant select, insert, update, delete on public.admin_audit_logs to service_role;

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
  v_state jsonb;
  v_user_id uuid;
  v_avatar_hash text;
  v_avatar_url text;
  v_community_name text;
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
  select u.avatar_sha256_hex, u.community_name
  into v_avatar_hash, v_community_name
  from public.app_users u
  where u.id = v_user_id and u.deleted_at is null
  limit 1;

  if v_avatar_hash is not null then
    v_avatar_url := '/api/v1/square/authors/' || v_user_id || '/avatar?v=' || left(v_avatar_hash, 12);
  end if;

  v_state := jsonb_set(
    v_state,
    '{bootstrap,userAvatarUrl}',
    coalesce(to_jsonb(v_avatar_url), 'null'::jsonb),
    true
  );
  return jsonb_set(
    v_state,
    '{bootstrap,communityName}',
    to_jsonb(coalesce(v_community_name, '')),
    true
  );
end;
$$;
