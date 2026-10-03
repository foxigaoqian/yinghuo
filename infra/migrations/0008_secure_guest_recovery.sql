-- Secure cross-device recovery for guest-first H5 accounts.
-- The public family_code is never sufficient to authenticate a user.
BEGIN;

CREATE TABLE public.account_recovery_codes (
  user_id uuid PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,
  code_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  rotated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (pg_catalog.octet_length(code_hash) = 32)
);

CREATE TABLE public.account_recovery_attempts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  actor_hash bytea NOT NULL,
  succeeded boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (pg_catalog.octet_length(actor_hash) = 32)
);

CREATE INDEX account_recovery_attempts_actor_time
  ON public.account_recovery_attempts(actor_hash, attempted_at DESC);

ALTER TABLE public.account_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_recovery_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.account_recovery_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_recovery_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_recovery_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.yinghuo_set_recovery_code(
  p_user_id uuid,
  p_code_hash bytea
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_code_hash IS NULL OR pg_catalog.octet_length(p_code_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid recovery hash' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.app_users AS u
    WHERE u.id = p_user_id
      AND u.status = 'active'
      AND u.deleted_at IS NULL
      AND u.merged_into_user_id IS NULL
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.account_recovery_codes (user_id, code_hash)
  VALUES (p_user_id, p_code_hash)
  ON CONFLICT (user_id) DO UPDATE
  SET code_hash = EXCLUDED.code_hash,
      rotated_at = pg_catalog.now();
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.yinghuo_recover_guest_session(
  p_family_code text,
  p_code_hash bytea,
  p_attempt_hash bytea,
  p_refresh_hash bytea,
  p_device_label text,
  p_expires_at timestamptz
)
RETURNS TABLE(
  status text,
  user_id uuid,
  account_kind varchar,
  family_code varchar,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_account_kind varchar(20);
  v_family_code varchar(24);
  v_recent_attempts integer;
BEGIN
  IF p_code_hash IS NULL OR pg_catalog.octet_length(p_code_hash) <> 32
     OR p_attempt_hash IS NULL OR pg_catalog.octet_length(p_attempt_hash) <> 32
     OR p_refresh_hash IS NULL OR pg_catalog.octet_length(p_refresh_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid recovery input' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at <= pg_catalog.now()
     OR p_expires_at > pg_catalog.now() + interval '90 days' THEN
    RAISE EXCEPTION 'invalid session expiry' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.account_recovery_attempts
  WHERE actor_hash = p_attempt_hash
    AND attempted_at < pg_catalog.now() - interval '1 day';

  SELECT pg_catalog.count(*)::integer
  INTO v_recent_attempts
  FROM public.account_recovery_attempts AS a
  WHERE a.actor_hash = p_attempt_hash
    AND a.attempted_at >= pg_catalog.now() - interval '15 minutes';

  IF v_recent_attempts >= 8 THEN
    RETURN QUERY SELECT 'rate_limited'::text, NULL::uuid, NULL::varchar, NULL::varchar, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT u.id, u.account_kind, u.family_code
  INTO v_user_id, v_account_kind, v_family_code
  FROM public.app_users AS u
  JOIN public.account_recovery_codes AS c ON c.user_id = u.id
  WHERE pg_catalog.upper(u.family_code) = pg_catalog.upper(pg_catalog.btrim(p_family_code))
    AND c.code_hash = p_code_hash
    AND u.status = 'active'
    AND u.deleted_at IS NULL
    AND u.merged_into_user_id IS NULL
  LIMIT 1;

  INSERT INTO public.account_recovery_attempts (actor_hash, succeeded)
  VALUES (p_attempt_hash, v_user_id IS NOT NULL);

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::varchar, NULL::varchar, NULL::timestamptz;
    RETURN;
  END IF;

  INSERT INTO public.sessions (user_id, refresh_hash, device_label, expires_at)
  VALUES (
    v_user_id,
    p_refresh_hash,
    pg_catalog.left(pg_catalog.coalesce(p_device_label, 'H5'), 120),
    p_expires_at
  );

  RETURN QUERY
  SELECT 'ok'::text, v_user_id, v_account_kind, v_family_code, p_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.yinghuo_set_recovery_code(uuid, bytea)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.yinghuo_recover_guest_session(text, bytea, bytea, bytea, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yinghuo_set_recovery_code(uuid, bytea) TO service_role;
GRANT EXECUTE ON FUNCTION public.yinghuo_recover_guest_session(text, bytea, bytea, bytea, text, timestamptz)
  TO service_role;

COMMIT;
