# 萤火 V1 数据库实施规格

版本：V1.0  
数据库：PostgreSQL 16+  
适用范围：移动端 H5 首发，微信 H5 支付，NestJS API + Worker

本文把 04 数据模型中的概念表落到可执行的 PostgreSQL 设计。正式迁移前仍需在 staging 使用真实数据库跑迁移、回滚和恢复演练；本文不包含任何真实用户数据或生产密钥。

## 1. 数据库原则

- 主键统一使用 UUID；服务端生成，不接受前端指定业务主键。
- 时间统一使用 timestamptz 存 UTC；用户时区只用于展示和纪念日计算。
- 金额统一使用 bigint 人民币分；不使用浮点数。
- 重要业务状态使用枚举或受约束的 text；禁止前端直接写状态。
- 可编辑对象使用 version 乐观锁；交易、权益、账本和审计记录追加写入。
- 私有数据依赖服务端授权查询；不把 PostgreSQL 行可见性误当成完整业务权限。
- 付款、退款、权益和交付分别保存；不使用一个 paid 字段覆盖整个交易生命周期。
- 删除采用状态、撤权、异步清理和最小审计记录分层处理。

## 2. 迁移顺序

~~~text
001_extensions_and_enums
002_users_identities_sessions
003_profiles_members_consents
004_uploads_assets_memories
005_conversations_messages_generations
006_products_quotes_orders
007_payments_refunds_entitlements
008_tasks_attempts_works_outbox
009_indexes_constraints_audit
010_seed_v1_products_and_terms
~~~

每个迁移必须：

1. 可重复执行或明确记录版本；
2. 先向前兼容，再发布依赖新字段的应用；
3. 不在迁移中调用模型、支付或媒体供应商；
4. 在 staging 备份恢复副本上验证；
5. 记录执行人、版本、开始时间、耗时和结果。

## 3. 扩展与枚举

首期只需要 pgcrypto；向量检索等能力等选定 embedding 模型后再单独迁移。

~~~sql
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
~~~

## 4. 账号、身份和TA空间

手机号原文不作为业务主键。手机号登录使用规范化值的安全摘要；如业务确实需要展示或变更手机号，使用受控加密字段，不在普通日志输出。

~~~sql
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
  lifecycle profile_status NOT NULL DEFAULT 'draft',
  avatar_asset_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX profiles_creator_status
  ON profiles(creator_user_id, lifecycle, created_at DESC);

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
~~~

约束要求：

- profile_members 的 owner 数量、最多5名有效成员必须在事务中锁 profile 后检查；
- invitation token 只保存 hash，接受时在事务内核验、消费和写成员；
- profile 的 creator_user_id 不自动代表可读所有成员私聊；
- V1 不写小程序 code 或 openid 字段；V2 使用 identities(provider, app_id, subject)。

## 5. 上传、媒体和记忆

对象存储 key 必须由服务端生成。数据库只保存对象元数据、授权和状态；访问对象前每次重新校验当前账号权限。

~~~sql
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
~~~

V1 先允许 embedding 为空，文本检索可以使用受控关键词或已确认条目；模型确定后再把 embedding jsonb 替换为固定维度的 pgvector 列和索引，不能在未确定维度时锁死生产结构。

## 6. 对话与生成

~~~sql
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
~~~

清空私聊时只递增 conversations.epoch 并按策略隐藏旧消息；在途 generation 必须比较 epoch，旧任务不能重新写回当前对话。

## 7. 商品、订单、支付和权益

~~~sql
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
~~~

支付回调事务必须锁 orders 行，校验订单金额和累计实收，再写 payments、payment_events、orders、entitlement_grants 和 outbox_events。前端跳转不能直接写任何支付状态。

## 8. 异步任务、作品和 Outbox

~~~sql
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
~~~

Outbox 事件在业务事务中产生；Worker 领取使用租约，供应商超时先查状态，不依据网络异常盲目创建第二个任务。

## 9. 幂等、索引与业务不变量

必须在代码测试和数据库约束中同时保证：

| 不变量 | 实现要求 |
|---|---|
| 一个手机号挑战不能被重复消费 | auth_challenges consumed_at + 行锁 |
| 一个TA只有一个有效owner | partial unique index + 成员事务锁 |
| 一个账号最多一个免费active TA | users行锁 + profiles查询 |
| 同一消息不产生两条用户消息 | messages conversation_id + client_message_id唯一 |
| 同一用户消息只有一条生成运行 | generation_runs.user_message_id唯一 |
| 同一支付回调不重复落账 | payment_events channel + event_id唯一 |
| 同一渠道交易不重复记账 | payments channel + provider_trade_no唯一 |
| 同一订单权益不重复发放 | entitlement_grants order_item_id + type唯一 |
| 累计退款不超过实付 | 锁订单后聚合退款成功/处理中金额 |
| 同一留声slot不重复消费 | package_slots package_id + slot_no唯一并锁行 |
| Outbox事件可重试 | status、attempts、available_at、last_error |

金额聚合、库存/容量预留、成员人数和免费资格不能只靠前端或缓存判断。

## 10. 删除、导出和备份

- 删除TA先写删除请求、撤销新访问和检索资格，再异步清理媒体、衍生物和供应商音色。
- 删除不应抹掉财务、退款、支付回调和最小审计记录。
- 导出任务生成独立导出包；生成和下载时都重新检查当前权限。
- 已经发出的短时下载地址无法保证远程收回，页面必须提前说明。
- 备份恢复后重放删除墓碑；恢复演练必须验证已删除对象不会重新出现在 API 和对象存储索引。
- 财务留存、原始素材、导出包和日志的实际保留期限由合规评审后写入配置，不在代码中硬编码“永久”。

## 11. Schema 验收

迁移完成后至少执行：

- 并发创建免费TA，确认只成功一个active；
- 并发接受最后一个邀请，确认不会出现第6个成员；
- 重复微信回调和查单同时到达，确认只生成一个payment事实和一个grant；
- 同时申请两个退款，确认累计金额不超过实付；
- 上传超时释放reserved_bytes；
- 清空对话后旧generation不能写回；
- 删除TA后新读取、检索、导出都重新校验权限；
- 从备份恢复后验证删除墓碑、支付账本和outbox状态。

所有迁移在进入 B 阶段前必须有 staging 实测记录和回滚方案。