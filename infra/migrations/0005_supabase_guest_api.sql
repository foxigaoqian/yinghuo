-- Backend-only Guest-first API helpers for the H5 MVP.
-- These functions are SECURITY INVOKER and executable only by service_role.
-- The backend uses a Supabase Secret API key; browsers never receive it.
BEGIN;

CREATE OR REPLACE FUNCTION public.yinghuo_create_guest_session(
  p_refresh_hash bytea,
  p_device_label text,
  p_expires_at timestamptz
)
RETURNS TABLE(user_id uuid, family_code varchar)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_family_code varchar(24);
  v_attempt integer;
BEGIN
  IF p_refresh_hash IS NULL OR pg_catalog.octet_length(p_refresh_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid session hash' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at <= pg_catalog.now()
     OR p_expires_at > pg_catalog.now() + interval '90 days' THEN
    RAISE EXCEPTION 'invalid session expiry' USING ERRCODE = '22023';
  END IF;

  FOR v_attempt IN 1..8 LOOP
    v_family_code := pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
    BEGIN
      INSERT INTO public.app_users (display_name, account_kind, family_code)
      VALUES ('', 'guest', v_family_code)
      RETURNING id INTO v_user_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt = 8 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  INSERT INTO public.identities (user_id, provider, app_id, subject)
  VALUES (v_user_id, 'guest', 'h5', pg_catalog.gen_random_uuid()::text);

  INSERT INTO public.sessions (user_id, refresh_hash, device_label, expires_at)
  VALUES (v_user_id, p_refresh_hash, pg_catalog.left(coalesce(p_device_label, 'H5'), 120), p_expires_at);

  RETURN QUERY SELECT v_user_id, v_family_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.yinghuo_get_guest_session(p_refresh_hash bytea)
RETURNS TABLE(user_id uuid, account_kind varchar, family_code varchar, expires_at timestamptz)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT u.id, u.account_kind, u.family_code, s.expires_at
  FROM public.sessions AS s
  JOIN public.app_users AS u ON u.id = s.user_id
  WHERE s.refresh_hash = p_refresh_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > pg_catalog.now()
    AND u.deleted_at IS NULL
    AND u.status = 'active'
    AND u.merged_into_user_id IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.yinghuo_revoke_guest_session(p_refresh_hash bytea)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_changed integer;
BEGIN
  UPDATE public.sessions
  SET revoked_at = pg_catalog.now()
  WHERE refresh_hash = p_refresh_hash AND revoked_at IS NULL;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.yinghuo_create_profile(
  p_user_id uuid,
  p_display_name text,
  p_call_me text,
  p_story text,
  p_ai_consent boolean
)
RETURNS TABLE(id uuid, creator_user_id uuid, display_name varchar, relationship varchar, created_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF p_ai_consent IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'AI consent is required' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(coalesce(p_display_name, ''))) < 1
     OR pg_catalog.length(p_display_name) > 80
     OR pg_catalog.length(coalesce(p_call_me, '')) > 40
     OR pg_catalog.length(coalesce(p_story, '')) > 1000 THEN
    RAISE EXCEPTION 'invalid profile input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (creator_user_id, display_name, status)
  VALUES (p_user_id, pg_catalog.btrim(p_display_name), 'active')
  RETURNING profiles.id INTO v_profile_id;

  INSERT INTO public.profile_members (profile_id, user_id, role, status)
  VALUES (v_profile_id, p_user_id, 'owner', 'active');

  INSERT INTO public.profile_preferences (profile_id, user_id, call_me)
  VALUES (v_profile_id, p_user_id, nullif(pg_catalog.btrim(coalesce(p_call_me, '')), ''));

  INSERT INTO public.consents (user_id, profile_id, purpose, subject_type, subject_id, version, asset_scope)
  VALUES (
    p_user_id,
    v_profile_id,
    'ai_persona_simulation',
    'profile',
    v_profile_id,
    'ai-disclosure-v1',
    '{"chat":true,"memory_retrieval":false}'::jsonb
  );

  IF nullif(pg_catalog.btrim(coalesce(p_story, '')), '') IS NOT NULL THEN
    INSERT INTO public.memories (
      profile_id, owner_user_id, title, body, visibility, use_for_ai,
      source_type, confirmation_state, active_for_basic
    ) VALUES (
      v_profile_id, p_user_id, '关于TA', pg_catalog.btrim(p_story), 'private', false,
      'profile_story', 'confirmed', true
    );
  END IF;

  UPDATE public.app_users
  SET free_slot_consumed_at = coalesce(free_slot_consumed_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  WHERE app_users.id = p_user_id;

  RETURN QUERY
  SELECT p.id, p.creator_user_id, p.display_name, p.relationship, p.created_at
  FROM public.profiles AS p
  WHERE p.id = v_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.yinghuo_create_guest_session(bytea, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.yinghuo_get_guest_session(bytea) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.yinghuo_revoke_guest_session(bytea) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.yinghuo_create_profile(uuid, text, text, text, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.yinghuo_create_guest_session(bytea, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.yinghuo_get_guest_session(bytea) TO service_role;
GRANT EXECUTE ON FUNCTION public.yinghuo_revoke_guest_session(bytea) TO service_role;
GRANT EXECUTE ON FUNCTION public.yinghuo_create_profile(uuid, text, text, text, boolean) TO service_role;

COMMIT;
