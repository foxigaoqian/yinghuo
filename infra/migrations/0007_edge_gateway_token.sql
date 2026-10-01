create table public.backend_service_tokens (
  name text primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  purpose text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

alter table public.backend_service_tokens enable row level security;

revoke all on table public.backend_service_tokens from anon, authenticated;
grant select on table public.backend_service_tokens to service_role;

comment on table public.backend_service_tokens is
  'One-way hashes for scoped server-to-server callers. Plaintext tokens must remain in the caller secret store.';
