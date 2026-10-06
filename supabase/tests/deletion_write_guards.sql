-- Run with a privileged connection against an isolated/test or production database.
-- All synthetic rows and writes are rolled back; no existing account is touched.
begin;
set local role service_role;

do $$
declare
  v_guest record;
  v_profile record;
  v_conversation uuid;
  v_hash bytea;
  v_blocked boolean;
begin
  v_hash := decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex');
  select * into v_guest from public.yinghuo_create_guest_session(v_hash, 'deletion-guard-rollback-test', now() + interval '1 hour');
  select * into v_profile from public.yinghuo_create_profile(v_guest.user_id, '删除保护测试', '', '', false);
  insert into public.conversations(profile_id, user_id) values(v_profile.id, v_guest.user_id) returning id into v_conversation;

  insert into public.messages(conversation_id, role, text, status, epoch, context_memory_ids)
  values(v_conversation, 'user', 'ordinary-write-before-profile-delete', 'live_completed', 0, array[]::uuid[]),
        (v_conversation, 'assistant', 'ordinary-reply-before-profile-delete', 'live_completed', 0, array[]::uuid[]);
  if (select count(*) from public.messages where conversation_id = v_conversation) <> 2 then
    raise exception 'Ordinary message persistence failed';
  end if;

  if public.yinghuo_delete_profile(v_guest.user_id, v_profile.id, decode(repeat('00', 32), 'hex')) then
    raise exception 'Invalid session was allowed to delete a profile';
  end if;
  if not public.yinghuo_delete_profile(v_guest.user_id, v_profile.id, v_hash) then
    raise exception 'Profile deletion failed';
  end if;
  if exists (select 1 from public.messages where conversation_id = v_conversation and text <> '[内容已删除]') then
    raise exception 'An earlier message was not erased';
  end if;
  v_blocked := false;
  begin
    insert into public.messages(conversation_id, role, text, status)
    values(v_conversation, 'assistant', 'late-after-profile-delete', 'live_completed');
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'A late profile reply was persisted'; end if;

  -- Deleting the final profile restores its slot; validate the independent
  -- account-erasure path with a fresh active profile and normal message.
  select * into v_profile from public.yinghuo_create_profile(v_guest.user_id, '账号删除保护测试', '', '', false);
  insert into public.conversations(profile_id, user_id) values(v_profile.id, v_guest.user_id) returning id into v_conversation;
  insert into public.messages(conversation_id, role, text, status)
  values(v_conversation, 'user', 'ordinary-write-before-account-delete', 'live_completed');
  if not public.yinghuo_delete_account(v_guest.user_id, v_hash) then
    raise exception 'Account deletion failed';
  end if;
  if exists (select 1 from public.messages where conversation_id = v_conversation and text <> '[内容已删除]') then
    raise exception 'Account deletion missed an earlier message';
  end if;
  v_blocked := false;
  begin
    insert into public.messages(conversation_id, role, text, status)
    values(v_conversation, 'assistant', 'late-after-account-delete', 'live_completed');
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'A late account reply was persisted'; end if;
  if exists (select 1 from public.sessions where user_id = v_guest.user_id) then
    raise exception 'Account deletion left a valid session';
  end if;
end;
$$;

rollback;
select 'PASS: normal writes, session ownership, erasure, and late-reply rejection' as result;
