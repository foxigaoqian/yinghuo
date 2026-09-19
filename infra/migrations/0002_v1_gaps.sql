-- Apply after 0001 to a new PostgreSQL database. No production migration has run.
BEGIN;
ALTER TABLE app_users ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE app_users ADD COLUMN font_size varchar(12) NOT NULL DEFAULT 'normal';
ALTER TABLE profiles ADD COLUMN memory_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE profile_preferences ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE profile_preferences ADD COLUMN memory_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE profile_members ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE invitations ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE products ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE refund_requests ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);

CREATE TABLE idempotency_records (
  actor_key varchar(160) NOT NULL,
  operation varchar(160) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash bytea NOT NULL,
  state varchar(20) NOT NULL CHECK(state IN ('processing','completed','failed')),
  resource_type varchar(60), resource_id uuid, response_status integer,
  lease_until timestamptz, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_key,operation,idempotency_key)
);
CREATE INDEX idempotency_cleanup ON idempotency_records(expires_at);

CREATE TABLE oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash bytea NOT NULL UNIQUE,
  user_id uuid REFERENCES app_users(id), session_id uuid REFERENCES sessions(id),
  provider varchar(40) NOT NULL, app_id varchar(100) NOT NULL,
  return_path varchar(500) NOT NULL, nonce_hash bytea,
  encrypted_pkce_verifier bytea, browser_binding_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL, consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memory_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id), user_id uuid NOT NULL REFERENCES app_users(id),
  source_message_ids jsonb NOT NULL DEFAULT '[]', proposed_body text NOT NULL,
  state varchar(20) NOT NULL DEFAULT 'suggested' CHECK(state IN ('suggested','confirmed','rejected')),
  confirmed_memory_id uuid REFERENCES memories(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tasks ADD COLUMN lease_owner varchar(160);
ALTER TABLE tasks ADD COLUMN lease_until timestamptz;
ALTER TABLE tasks ADD COLUMN heartbeat_at timestamptz;
ALTER TABLE tasks ADD COLUMN deadline_at timestamptz;
ALTER TABLE tasks ADD COLUMN fencing_token bigint NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN required_outputs integer NOT NULL DEFAULT 1 CHECK(required_outputs>0);
ALTER TABLE tasks ADD COLUMN completed_outputs integer NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE tasks ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE tasks ADD CONSTRAINT output_counts_valid CHECK(completed_outputs>=0 AND completed_outputs<=required_outputs);
CREATE INDEX task_claim ON tasks(status,lease_until,created_at);
ALTER TABLE task_attempts ADD COLUMN provider varchar(80);
ALTER TABLE task_attempts ADD COLUMN submit_key varchar(160) UNIQUE;
ALTER TABLE task_attempts ADD COLUMN fencing_token bigint;
ALTER TABLE task_attempts ADD COLUMN model_version varchar(160);
ALTER TABLE task_attempts ADD COLUMN cost_currency char(3);
ALTER TABLE task_attempts ADD COLUMN cost_estimate numeric(18,8) CHECK(cost_estimate>=0);
ALTER TABLE task_attempts ADD COLUMN cost_actual numeric(18,8) CHECK(cost_actual>=0);
ALTER TABLE task_attempts ADD COLUMN unit_price_version varchar(80);
ALTER TABLE task_attempts ADD COLUMN error_class varchar(80);
ALTER TABLE outbox_events ADD COLUMN lease_until timestamptz;
ALTER TABLE outbox_events ADD COLUMN lease_owner varchar(160);

ALTER TABLE works ADD COLUMN owner_user_id uuid REFERENCES app_users(id);
ALTER TABLE works ADD COLUMN profile_id uuid REFERENCES profiles(id);
ALTER TABLE works ADD COLUMN delivery_index integer NOT NULL DEFAULT 0 CHECK(delivery_index>=0);
ALTER TABLE works ADD COLUMN output_asset_id uuid REFERENCES assets(id);
ALTER TABLE works ADD COLUMN ai_generated boolean NOT NULL DEFAULT true;
ALTER TABLE works ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE works ADD COLUMN deleted_at timestamptz;
CREATE UNIQUE INDEX works_delivery_once ON works(task_id,delivery_index);
-- New-install baseline: every work insertion must supply owner and primary asset.
ALTER TABLE works ALTER COLUMN owner_user_id SET NOT NULL;
ALTER TABLE works ALTER COLUMN output_asset_id SET NOT NULL;

CREATE TABLE media_preflights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES app_users(id), profile_id uuid REFERENCES profiles(id),
  consent_id uuid NOT NULL REFERENCES consents(id), kind varchar(60) NOT NULL,
  input_revision integer NOT NULL CHECK(input_revision>0), input_snapshot jsonb NOT NULL,
  product_version_id uuid NOT NULL REFERENCES product_versions(id),
  state varchar(20) NOT NULL CHECK(state IN ('ready','rejected')),
  rejection_code varchar(80), expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quotes ADD COLUMN preflight_id uuid REFERENCES media_preflights(id);

CREATE TABLE payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider varchar(30) NOT NULL CHECK(provider IN ('wechat','stripe')),
  external_account_id varchar(160) NOT NULL, country varchar(2) NOT NULL,
  livemode boolean NOT NULL DEFAULT false, enabled boolean NOT NULL DEFAULT false,
  capabilities jsonb NOT NULL DEFAULT '{}', api_version varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,external_account_id,livemode)
);
ALTER TABLE payments DROP CONSTRAINT payments_channel_check;
ALTER TABLE payments ADD CONSTRAINT payments_channel_check CHECK(channel IN ('wechat_h5','wechat_jsapi','stripe_checkout'));
ALTER TABLE payments ADD COLUMN provider_account_id uuid REFERENCES payment_accounts(id);
ALTER TABLE payments ADD COLUMN livemode boolean NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN provider_session_id varchar(200);
ALTER TABLE payments ADD COLUMN payment_method varchar(80);
ALTER TABLE payments ADD COLUMN provider_balance_transaction_id varchar(200);
ALTER TABLE payments DROP CONSTRAINT payments_channel_out_trade_no_key;
ALTER TABLE payments DROP CONSTRAINT payments_channel_provider_trade_no_key;
ALTER TABLE payments ALTER COLUMN provider_account_id SET NOT NULL;
CREATE UNIQUE INDEX payment_merchant_reference ON payments(provider_account_id,livemode,out_trade_no);
CREATE UNIQUE INDEX payment_provider_reference ON payments(provider_account_id,livemode,provider_trade_no) WHERE provider_trade_no IS NOT NULL;
CREATE UNIQUE INDEX payment_session_reference ON payments(provider_account_id,livemode,provider_session_id) WHERE provider_session_id IS NOT NULL;
ALTER TABLE payment_events DROP CONSTRAINT payment_events_channel_event_id_key;
ALTER TABLE payment_events ADD COLUMN provider_account_id uuid REFERENCES payment_accounts(id);
ALTER TABLE payment_events ALTER COLUMN provider_account_id SET NOT NULL;
ALTER TABLE payment_events ADD COLUMN livemode boolean NOT NULL DEFAULT false;
ALTER TABLE payment_events ADD COLUMN object_id varchar(200);
ALTER TABLE payment_events ADD COLUMN normalized_event jsonb NOT NULL DEFAULT '{}';
ALTER TABLE payment_events ADD COLUMN processed_at timestamptz;
CREATE UNIQUE INDEX payment_event_once ON payment_events(provider_account_id,livemode,event_id);

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
  payment_id uuid REFERENCES payments(id), provider_account_id uuid NOT NULL REFERENCES payment_accounts(id),
  channel varchar(40) NOT NULL CHECK(channel IN ('wechat_h5','wechat_jsapi','stripe_checkout')),
  state varchar(30) NOT NULL CHECK(state IN ('creating','pending','unknown','succeeded','failed','closed')),
  provider_idempotency_key varchar(200) NOT NULL UNIQUE,
  provider_session_id varchar(200), expires_at timestamptz, closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_open_attempt_per_order ON payment_attempts(order_id) WHERE state IN ('creating','pending','unknown');
ALTER TABLE refund_requests ADD COLUMN payment_id uuid REFERENCES payments(id);
ALTER TABLE refund_requests ALTER COLUMN payment_id SET NOT NULL;
ALTER TABLE refund_requests ADD COLUMN provider_idempotency_key varchar(200) UNIQUE;
ALTER TABLE refund_requests ADD COLUMN reviewed_by uuid;

CREATE TABLE payment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES payments(id),
  provider_dispute_id varchar(200) NOT NULL UNIQUE, amount_fen bigint NOT NULL CHECK(amount_fen>0),
  currency char(3) NOT NULL, status varchar(60) NOT NULL, reason varchar(200),
  evidence_due_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_account_id uuid NOT NULL REFERENCES payment_accounts(id),
  channel varchar(40) NOT NULL, bill_date date NOT NULL,
  status varchar(20) NOT NULL CHECK(status IN ('queued','processing','completed','failed')),
  difference_count integer NOT NULL DEFAULT 0, bill_digest bytea,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES reconciliation_runs(id),
  order_id uuid REFERENCES orders(id), kind varchar(80) NOT NULL, provider_object_id varchar(200),
  amount_fen bigint NOT NULL DEFAULT 0 CHECK(amount_fen>=0), currency char(3) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  resolution_type varchar(40), evidence_reference varchar(200), reason text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);

CREATE TABLE export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requester_id uuid NOT NULL REFERENCES app_users(id),
  profile_id uuid REFERENCES profiles(id), conversation_id uuid REFERENCES conversations(id),
  scope varchar(30) NOT NULL CHECK(scope IN ('account','profile','conversation')),
  scope_snapshot jsonb NOT NULL, include_assets boolean NOT NULL, consent_revision bigint NOT NULL,
  status varchar(30) NOT NULL CHECK(status IN ('queued','processing','ready','failed','expired','cancelled')),
  output_asset_id uuid REFERENCES assets(id), task_id uuid REFERENCES tasks(id), expires_at timestamptz,
  error_code varchar(80), version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requester_id uuid NOT NULL REFERENCES app_users(id),
  target_type varchar(20) NOT NULL CHECK(target_type IN ('user','profile')), target_id uuid NOT NULL,
  scope_snapshot jsonb NOT NULL, reason text, reauthenticated_at timestamptz NOT NULL,
  status varchar(30) NOT NULL CHECK(status IN ('requested','access_revoked','processing','completed','failed')),
  error_code varchar(80), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE deletion_steps (
  request_id uuid NOT NULL REFERENCES deletion_requests(id), system varchar(60) NOT NULL,
  object_reference varchar(250) NOT NULL, status varchar(30) NOT NULL, attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz, provider_request_id varchar(200), error_code varchar(80),
  PRIMARY KEY(request_id,system,object_reference)
);
CREATE TABLE deletion_tombstones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid REFERENCES deletion_requests(id),
  target_type varchar(60) NOT NULL, target_id uuid NOT NULL, storage_key_hash bytea,
  deletion_revision bigint NOT NULL, deleted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_type,target_id,deletion_revision)
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id),
  kind varchar(60) NOT NULL, title varchar(200) NOT NULL, body text NOT NULL,
  page_id varchar(10) NOT NULL, target_id uuid, source_event_id uuid NOT NULL,
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,source_event_id)
);
CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id),
  order_id uuid REFERENCES orders(id), task_id uuid REFERENCES tasks(id), kind varchar(60) NOT NULL,
  title varchar(200) NOT NULL, body text NOT NULL, status varchar(30) NOT NULL DEFAULT 'open',
  version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE support_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES support_tickets(id),
  author_type varchar(20) NOT NULL CHECK(author_type IN ('user','support')), author_id uuid NOT NULL,
  body text NOT NULL, asset_ids jsonb NOT NULL DEFAULT '[]', attachment_consent_id uuid REFERENCES consents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), issuer varchar(250) NOT NULL, subject varchar(200) NOT NULL,
  display_name varchar(100) NOT NULL, enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(issuer,subject)
);
CREATE TABLE admin_scopes (
  admin_id uuid NOT NULL REFERENCES admin_accounts(id), scope varchar(100) NOT NULL,
  PRIMARY KEY(admin_id,scope)
);
CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  token_hash bytea NOT NULL UNIQUE, mfa_verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL, revoked_at timestamptz
);
ALTER TABLE refund_requests ADD CONSTRAINT refund_reviewer_fk FOREIGN KEY(reviewed_by) REFERENCES admin_accounts(id);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_type varchar(20) NOT NULL, actor_id uuid,
  scope varchar(100) NOT NULL, action varchar(100) NOT NULL, target_type varchar(100) NOT NULL,
  target_id varchar(160) NOT NULL, reason text NOT NULL, trace_id varchar(128) NOT NULL,
  before_summary jsonb, after_summary jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_target ON audit_events(target_type,target_id,created_at DESC);
CREATE TABLE release_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind varchar(60) NOT NULL,
  reference varchar(250) NOT NULL, approved_by uuid NOT NULL REFERENCES admin_accounts(id),
  approved_at timestamptz NOT NULL DEFAULT now(), version varchar(80) NOT NULL
);
CREATE TABLE compensation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES profiles(id),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id), approved_by uuid NOT NULL REFERENCES admin_accounts(id),
  grant_type varchar(40) NOT NULL, duration_days integer NOT NULL CHECK(duration_days BETWEEN 1 AND 365),
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE entitlement_grants ALTER COLUMN order_item_id DROP NOT NULL;
ALTER TABLE entitlement_grants ADD COLUMN compensation_id uuid REFERENCES compensation_records(id);
ALTER TABLE entitlement_grants ADD CONSTRAINT grant_source CHECK((order_item_id IS NOT NULL) <> (compensation_id IS NOT NULL));
CREATE UNIQUE INDEX compensation_grant_once ON entitlement_grants(compensation_id,type) WHERE compensation_id IS NOT NULL;
CREATE TABLE legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type varchar(60) NOT NULL,
  version varchar(80) NOT NULL, title varchar(200) NOT NULL, body text NOT NULL,
  published_at timestamptz, UNIQUE(type,version)
);
CREATE TABLE content_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind varchar(20) NOT NULL CHECK(kind IN ('story','help')),
  title varchar(200) NOT NULL, body text NOT NULL, asset_id uuid REFERENCES assets(id),
  source_label varchar(200), rights_reference varchar(200), published_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version>0)
);

-- Legacy C/D concepts (credits, voice_profiles, package_slots, posts, reminders)
-- are intentionally not executable in A/B. Add their migrations before enabling C/D.
COMMIT;
