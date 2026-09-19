-- V1.1 new-install baseline; not run against any production database.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleting', 'deleted');
CREATE TYPE profile_status AS ENUM ('draft', 'active', 'deleting', 'deleted');
CREATE TYPE member_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE member_status AS ENUM ('active', 'removed', 'pending');
CREATE TYPE memory_visibility AS ENUM ('private', 'family');
CREATE TYPE confirmation_state AS ENUM ('suggested', 'confirmed', 'rejected');
CREATE TYPE asset_status AS ENUM ('checking', 'ready', 'rejected', 'deleting', 'deleted');
CREATE TYPE order_status AS ENUM ('pending_payment', 'paid', 'cancelled', 'closed');
CREATE TYPE payment_state AS ENUM ('created', 'pending', 'succeeded', 'failed');
CREATE TYPE fulfillment_state AS ENUM ('pending', 'activating', 'processing', 'delivered', 'failed');
CREATE TYPE refund_state AS ENUM ('requested', 'reviewing', 'approved', 'processing', 'succeeded', 'rejected', 'failed');
CREATE TYPE task_status AS ENUM ('queued', 'preflight', 'submitted', 'processing', 'verifying', 'succeeded', 'partial', 'retry_wait', 'reconciling', 'failed', 'cancelled');
CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'sent', 'failed');

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name varchar(80) NOT NULL DEFAULT '',
  status user_status NOT NULL DEFAULT 'active',
  timezone varchar(64) NOT NULL DEFAULT 'Asia/Shanghai',
  phone_hash bytea UNIQUE,
  encrypted_phone bytea,
  free_slot_consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  provider varchar(40) NOT NULL,
  app_id varchar(128) NOT NULL DEFAULT '',
  subject varchar(255) NOT NULL,
  verified_at timestamptz,
  encrypted_phone bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, app_id, subject)
);

CREATE TABLE auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose varchar(40) NOT NULL,
  identity_hash bytea NOT NULL,
  code_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_challenges_lookup
  ON auth_challenges(identity_hash, purpose, created_at DESC);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  refresh_hash bytea NOT NULL UNIQUE,
  device_label varchar(120),
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_active
  ON sessions(user_id, revoked_at, expires_at);

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id uuid NOT NULL REFERENCES app_users(id),
  display_name varchar(80) NOT NULL,
  relationship varchar(40),
  status profile_status NOT NULL DEFAULT 'draft',
  avatar_asset_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX profiles_creator_status
  ON profiles(creator_user_id, status, created_at DESC);

CREATE TABLE profile_members (
  profile_id uuid NOT NULL REFERENCES profiles(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  role member_role NOT NULL,
  status member_status NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  PRIMARY KEY(profile_id, user_id)
);

CREATE UNIQUE INDEX one_active_owner_per_profile
  ON profile_members(profile_id)
  WHERE role = 'owner' AND status = 'active';

CREATE INDEX profile_members_user_active
  ON profile_members(user_id, status, profile_id);

CREATE TABLE profile_preferences (
  profile_id uuid NOT NULL REFERENCES profiles(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  call_me varchar(40),
  reply_length varchar(20) NOT NULL DEFAULT 'normal',
  voice_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(profile_id, user_id)
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  inviter_id uuid NOT NULL REFERENCES app_users(id),
  token_hash bytea NOT NULL UNIQUE,
  intended_role member_role NOT NULL DEFAULT 'viewer',
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES app_users(id),
  status varchar(20) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  profile_id uuid REFERENCES profiles(id),
  purpose varchar(60) NOT NULL,
  subject_type varchar(40),
  subject_id uuid,
  version varchar(40) NOT NULL,
  asset_scope jsonb,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX consents_scope_lookup
  ON consents(user_id, profile_id, purpose, revoked_at);

CREATE TABLE storage_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES app_users(id),
  profile_id uuid REFERENCES profiles(id),
  used_bytes bigint NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  capacity_bytes bigint NOT NULL CHECK (capacity_bytes >= 0),
  revision bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX storage_scope_owner_profile
  ON storage_scopes(owner_user_id, COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  profile_id uuid REFERENCES profiles(id),
  purpose varchar(40) NOT NULL,
  expected_bytes bigint NOT NULL CHECK (expected_bytes > 0),
  reserved_bytes bigint NOT NULL CHECK (reserved_bytes >= 0),
  object_key varchar(500) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES app_users(id),
  profile_id uuid REFERENCES profiles(id),
  storage_scope_id uuid REFERENCES storage_scopes(id),
  kind varchar(40) NOT NULL,
  object_key varchar(500) NOT NULL UNIQUE,
  bytes bigint NOT NULL CHECK (bytes >= 0),
  mime varchar(120) NOT NULL,
  source_type varchar(40) NOT NULL,
  sha256 bytea,
  status asset_status NOT NULL DEFAULT 'checking',
  consent_id uuid REFERENCES consents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX assets_profile_status
  ON assets(profile_id, status, created_at DESC);

CREATE TABLE asset_refs (
  asset_id uuid NOT NULL REFERENCES assets(id),
  target_type varchar(40) NOT NULL,
  target_id uuid NOT NULL,
  visibility memory_visibility,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(asset_id, target_type, target_id)
);

CREATE TABLE memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  owner_user_id uuid NOT NULL REFERENCES app_users(id),
  title varchar(120),
  body text NOT NULL,
  visibility memory_visibility NOT NULL,
  use_for_ai boolean NOT NULL DEFAULT false,
  source_type varchar(40) NOT NULL,
  confirmation_state confirmation_state NOT NULL DEFAULT 'confirmed',
  active_for_basic boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX memories_profile_visible
  ON memories(profile_id, visibility, owner_user_id, updated_at DESC);

CREATE TABLE memory_versions (
  memory_id uuid NOT NULL REFERENCES memories(id),
  version integer NOT NULL CHECK (version > 0),
  body text NOT NULL,
  actor_id uuid NOT NULL REFERENCES app_users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(memory_id, version)
);

CREATE TABLE memory_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL REFERENCES memories(id),
  memory_version integer NOT NULL,
  profile_id uuid NOT NULL REFERENCES profiles(id),
  owner_user_id uuid NOT NULL REFERENCES app_users(id),
  visibility memory_visibility NOT NULL,
  embedding_model varchar(120),
  embedding jsonb,
  status varchar(20) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(memory_id, memory_version, id)
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  status varchar(20) NOT NULL DEFAULT 'active',
  epoch integer NOT NULL DEFAULT 0 CHECK (epoch >= 0),
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, user_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  client_message_id uuid,
  role varchar(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  text text,
  status varchar(20) NOT NULL DEFAULT 'pending',
  asset_id uuid REFERENCES assets(id),
  generation_id uuid,
  epoch integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX messages_client_id
  ON messages(conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX messages_conversation_page
  ON messages(conversation_id, created_at DESC, id DESC);

CREATE TABLE generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  user_message_id uuid NOT NULL REFERENCES messages(id),
  assistant_message_id uuid REFERENCES messages(id),
  prompt_version varchar(80) NOT NULL,
  model varchar(120) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'queued',
  consent_version varchar(40),
  memory_revision bigint,
  usage jsonb,
  last_error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE UNIQUE INDEX one_generation_per_user_message
  ON generation_runs(user_message_id);

CREATE TABLE stream_events (
  generation_id uuid NOT NULL REFERENCES generation_runs(id),
  seq integer NOT NULL CHECK (seq >= 0),
  type varchar(40) NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(generation_id, seq)
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  kind varchar(40) NOT NULL,
  published_version integer,
  sale_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  version integer NOT NULL,
  price_fen bigint NOT NULL CHECK (price_fen >= 0),
  member_price_fen bigint CHECK (member_price_fen IS NULL OR member_price_fen >= 0),
  currency char(3) NOT NULL DEFAULT 'CNY',
  duration_days integer CHECK (duration_days IS NULL OR duration_days > 0),
  specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
  terms_version varchar(40) NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, version)
);

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  profile_id uuid REFERENCES profiles(id),
  product_version_id uuid NOT NULL REFERENCES product_versions(id),
  operation varchar(20) NOT NULL CHECK (operation IN ('new', 'renew', 'upgrade')),
  input_revision integer,
  price_breakdown jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES app_users(id),
  profile_id uuid REFERENCES profiles(id),
  quote_id uuid NOT NULL UNIQUE REFERENCES quotes(id),
  currency char(3) NOT NULL DEFAULT 'CNY',
  payable_fen bigint NOT NULL CHECK (payable_fen >= 0),
  status order_status NOT NULL DEFAULT 'pending_payment',
  fulfillment_status fulfillment_state NOT NULL DEFAULT 'pending',
  return_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  closed_at timestamptz
);

CREATE INDEX orders_buyer_page
  ON orders(buyer_id, created_at DESC, id DESC);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  product_version_id uuid NOT NULL REFERENCES product_versions(id),
  spec_snapshot jsonb NOT NULL,
  gross_fen bigint NOT NULL CHECK (gross_fen >= 0),
  discount_fen bigint NOT NULL DEFAULT 0 CHECK (discount_fen >= 0),
  credit_fen bigint NOT NULL DEFAULT 0 CHECK (credit_fen >= 0),
  payable_fen bigint NOT NULL CHECK (payable_fen >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, id)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  channel varchar(40) NOT NULL CHECK (channel IN ('wechat_h5')),
  out_trade_no varchar(64) NOT NULL,
  provider_trade_no varchar(128),
  provider_state varchar(40),
  currency char(3) NOT NULL DEFAULT 'CNY',
  state payment_state NOT NULL DEFAULT 'created',
  paid_fen bigint NOT NULL DEFAULT 0 CHECK (paid_fen >= 0),
  payer_client_ip inet,
  h5_url_expires_at timestamptz,
  paid_at timestamptz,
  last_reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel, out_trade_no),
  UNIQUE(channel, provider_trade_no)
);

CREATE INDEX payments_order_state
  ON payments(order_id, state, created_at DESC);

CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel varchar(40) NOT NULL,
  event_id varchar(160) NOT NULL,
  event_type varchar(80) NOT NULL,
  provider_serial varchar(160),
  payload_digest bytea NOT NULL,
  verified_at timestamptz,
  result varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel, event_id)
);

CREATE TABLE entitlement_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id),
  profile_id uuid REFERENCES profiles(id),
  beneficiary_user_id uuid REFERENCES app_users(id),
  type varchar(60) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  state varchar(20) NOT NULL DEFAULT 'active',
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_item_id, type)
);

CREATE TABLE entitlement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES entitlement_grants(id),
  event_type varchar(60) NOT NULL,
  delta jsonb NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  source_id uuid,
  revision bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(grant_id, event_type, source_id)
);

CREATE TABLE refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  applicant_id uuid NOT NULL REFERENCES app_users(id),
  reason varchar(500) NOT NULL,
  request_fen bigint NOT NULL CHECK (request_fen > 0),
  state refund_state NOT NULL DEFAULT 'requested',
  provider_refund_no varchar(64) UNIQUE,
  provider_refund_id varchar(128),
  provider_state varchar(40),
  decision jsonb,
  refund_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refunds_order_state
  ON refund_requests(order_id, state, created_at DESC);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind varchar(60) NOT NULL,
  status task_status NOT NULL DEFAULT 'queued',
  actor_id uuid REFERENCES app_users(id),
  profile_id uuid REFERENCES profiles(id),
  order_item_id uuid REFERENCES order_items(id),
  input_snapshot jsonb NOT NULL,
  output_snapshot jsonb,
  provider varchar(80),
  provider_task_id varchar(160),
  last_error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE UNIQUE INDEX tasks_provider_ref
  ON tasks(provider, provider_task_id)
  WHERE provider_task_id IS NOT NULL;

CREATE TABLE task_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id),
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  status task_status NOT NULL,
  provider_task_id varchar(160),
  usage jsonb,
  error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(task_id, attempt_no)
);

CREATE TABLE works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id),
  order_item_id uuid REFERENCES order_items(id),
  kind varchar(60) NOT NULL,
  status varchar(30) NOT NULL,
  result_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  quality_report jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type varchar(80) NOT NULL,
  aggregate_type varchar(60) NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status outbox_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX outbox_pending
  ON outbox_events(status, available_at, created_at);

COMMIT;
