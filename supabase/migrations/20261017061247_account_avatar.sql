alter table public.app_users
  add column if not exists avatar_mime text,
  add column if not exists avatar_body_base64 text,
  add column if not exists avatar_sha256_hex text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_avatar_mime_format'
  ) then
    alter table public.app_users
      add constraint app_users_avatar_mime_format
      check (avatar_mime is null or avatar_mime in ('image/jpeg', 'image/png', 'image/webp'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_avatar_body_size'
  ) then
    alter table public.app_users
      add constraint app_users_avatar_body_size
      check (avatar_body_base64 is null or length(avatar_body_base64) <= 80000);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_avatar_sha256_format'
  ) then
    alter table public.app_users
      add constraint app_users_avatar_sha256_format
      check (avatar_sha256_hex is null or avatar_sha256_hex ~ '^[0-9a-f]{64}$');
  end if;
end $$;
