-- V1.2 Guest-first identity, recovery and merge support.
-- Apply after 0001_baseline.sql and 0002_v1_gaps.sql.
-- This migration is additive. Do not rewrite 0001/0002 after release.
BEGIN;

ALTER TABLE app_users
  ADD COLUMN account_kind varchar(20) NOT NULL DEFAULT 'guest'
    CHECK (account_kind IN ('guest','bound','merged'));

ALTER TABLE app_users
  ADD COLUMN family_code varchar(24);

ALTER TABLE app_users
  ADD COLUMN merged_into_user_id uuid REFERENCES app_users(id);

-- Existing rows that already have a stable phone or non-guest identity are treated as bound.
UPDATE app_users u
SET account_kind = 'bound'
WHERE u.phone_hash IS NOT NULL
   OR EXISTS (
     SELECT 1
     FROM identities i
     WHERE i.user_id = u.id
       AND i.provider <> 'guest'
   );

CREATE UNIQUE INDEX app_users_family_code_unique
  ON app_users(family_code)
  WHERE family_code IS NOT NULL;

CREATE INDEX app_users_merged_into
  ON app_users(merged_into_user_id)
  WHERE merged_into_user_id IS NOT NULL;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_merge_target_valid
  CHECK (merged_into_user_id IS NULL OR merged_into_user_id <> id);

-- OTP verification may discover that the verified phone belongs to another User.
-- A short-lived server-side ticket makes the merge explicit and auditable.
CREATE TABLE account_recovery_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_user_id uuid NOT NULL REFERENCES app_users(id),
  target_user_id uuid NOT NULL REFERENCES app_users(id),
  token_hash bytea NOT NULL UNIQUE,
  state varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','consumed','expired','cancelled')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (guest_user_id <> target_user_id)
);

CREATE INDEX account_recovery_tickets_guest
  ON account_recovery_tickets(guest_user_id, state, expires_at);

CREATE INDEX account_recovery_tickets_target
  ON account_recovery_tickets(target_user_id, state, expires_at);

-- Optional server-side drafts for flows where refresh/cross-page recovery matters.
-- The browser may still keep a local copy; this table is the recoverable server snapshot,
-- not a source of truth for confirmed memories.
CREATE TABLE user_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  profile_id uuid REFERENCES profiles(id),
  draft_type varchar(40) NOT NULL
    CHECK (draft_type IN ('profile_create','story','chat_input','support','checkout_context')),
  draft_key varchar(160) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, draft_type, draft_key)
);

CREATE INDEX user_drafts_lookup
  ON user_drafts(user_id, draft_type, updated_at DESC);

-- Guardrails:
-- 1. family_code is a public lookup/help code only; never authenticate by it alone.
-- 2. guest -> bound on first successful phone binding keeps the same app_users.id.
-- 3. guest -> existing bound account requires an account_recovery_ticket and explicit merge transaction.
-- 4. merge must revoke source guest sessions and write audit_logs; implement in application transaction.
-- 5. memory_candidates remain suggested until explicit confirmation; drafts must never be indexed as facts.

COMMIT;
