do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_avatar_fields_consistent'
  ) then
    alter table public.app_users
      add constraint app_users_avatar_fields_consistent
      check (
        (avatar_mime is null and avatar_body_base64 is null and avatar_sha256_hex is null)
        or
        (avatar_mime is not null and avatar_body_base64 is not null and avatar_sha256_hex is not null)
      );
  end if;
end $$;

create or replace function public.yinghuo_clear_deleted_user_avatar()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.deleted_at is not null or new.status <> 'active' then
    new.avatar_mime := null;
    new.avatar_body_base64 := null;
    new.avatar_sha256_hex := null;
  end if;
  return new;
end;
$function$;

revoke all on function public.yinghuo_clear_deleted_user_avatar() from public, anon, authenticated;

drop trigger if exists app_users_clear_deleted_avatar on public.app_users;
create trigger app_users_clear_deleted_avatar
before insert or update of deleted_at, status on public.app_users
for each row
execute function public.yinghuo_clear_deleted_user_avatar();
