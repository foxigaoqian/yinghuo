alter table public.app_users
  add column if not exists phone_last4 varchar(4),
  add column if not exists phone_verified boolean not null default false,
  add column if not exists gender varchar(8),
  add column if not exists birth_year smallint,
  add column if not exists phone_bound_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_phone_last4_format'
  ) then
    alter table public.app_users
      add constraint app_users_phone_last4_format
      check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_gender_values'
  ) then
    alter table public.app_users
      add constraint app_users_gender_values
      check (gender is null or gender in ('male', 'female'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_birth_year_range'
  ) then
    alter table public.app_users
      add constraint app_users_birth_year_range
      check (birth_year is null or birth_year between 1900 and 2026);
  end if;
end
$$;

revoke all on table public.app_users from anon, authenticated;
grant select, insert, update, delete on table public.app_users to service_role;

notify pgrst, 'reload schema';
