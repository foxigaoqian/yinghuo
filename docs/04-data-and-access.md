# 数据模型与权限规格

本文件是逻辑数据设计，未执行建表。实施时由迁移文件固化字段类型、外键和索引，并通过隔离与交易测试；不要把JSON自由字段当作所有数据的唯一结构。

## 1. 通用约定

主键UUID；时间存UTC timestamptz、显示按用户时区，纪念日另存历法。金额整数分，CNY；容量整数bytes。可编辑实体含version作乐观锁，时间字段created_at/updated_at，需隐藏的对象含deleted_at/status。重要外键不依赖前端约束。

TA层是共享空间；用户层是私人对话。不能只用`ta_id`实现“租户隔离”，因为同一TA里的成员也有互不可见的内容。

## 2. 身份与空间

| 表 | 关键字段 | 约束/索引 |
|---|---|---|
| users | id, display_name, status, timezone, free_slot_consumed_at | 手机号不作主键；注销后登录拒绝 |
| identities | user_id, provider, app_id, subject, verified_at, encrypted_phone | UNIQUE(provider,app_id,subject)；手机号索引用规范化值的安全摘要 |
| auth_challenges | purpose, identity_hash, code_hash, expires_at, failures, consumed_at | 校验成功与consume同事务；避免双用 |
| sessions | user_id, refresh_hash, expires_at, revoked_at, device_label | hash唯一，轮换旧token即撤销 |
| profiles | id, creator_user_id, display_name, relationship, lifecycle, avatar_asset_id, status, version | status=draft/active/deleting/deleted；日期可空 |
| profile_members | profile_id, user_id, role, status, joined_at, removed_at | UNIQUE(profile_id,user_id)；role=owner/editor/viewer；有效owner只有1个 |
| profile_preferences | profile_id, user_id, call_me, reply_length, voice_enabled | UNIQUE(profile_id,user_id)，不是共享人物资料 |
| invitations | profile_id, inviter_id, token_hash, intended_role, expires_at, accepted_by, status | token_hash唯一；一次性，默认7天，可撤销 |
| consents | user_id, profile_id?, purpose, version, asset_scope, granted_at, revoked_at | 区分协议、AI使用、声音、公开发布和推送 |

第二位TA先建draft，未付费不启用聊天/存储权益；支付开通与draft→active在同事务。首个免费资格通过锁users行发放，避免两个并发请求领两份。免费资格是否在用户主动删除后恢复尚待产品决定，默认不自动循环发放；开发不得静默改变这一规则。

## 3. 记忆、文件与聊天

| 表 | 关键字段 | 约束/索引 |
|---|---|---|
| upload_sessions | actor_id, profile_id?, purpose, expected_bytes, reserved_bytes, object_key, expires_at, status | 对象key由服务端生成；预留容量；完成时HEAD/内容检测 |
| assets | owner_user_id, profile_id?, storage_scope_id, kind, object_key, bytes, mime, source_type, status, consent_id?, sha256 | 私有对象key唯一；索引(profile_id,status)；禁止任意远程URL直接抓取 |
| asset_refs | asset_id, target_type, target_id, visibility | 引用计数/约束用于删除；不得用有一个公开引用推导原件公开 |
| memories | profile_id, owner_user_id, title?, body, visibility, use_for_ai, source_type, confirmation_state, active_for_basic, version | 索引(profile_id,visibility,owner_user_id,updated_at)；private/family；原始媒体不等于确认事实 |
| memory_versions | memory_id, version, body, actor_id, changed_at | UNIQUE(memory_id,version)；更正可追溯 |
| memory_chunks | memory_id, memory_version, profile_id, owner_user_id, visibility, embedding_model, embedding, status | 查询JOIN当前memory/授权，不信任旧副本ACL |
| memory_candidates | profile_id, user_id, source_message_ids, proposed_body, state | suggested/confirmed/rejected；不自动进入长期事实 |
| conversations | profile_id, user_id, status, last_message_at, epoch | UNIQUE(profile_id,user_id)用于首发一条主对话；清空递增epoch |
| messages | conversation_id, client_message_id, role, text, status, asset_id?, generation_id?, epoch | UNIQUE(conversation_id,client_message_id)；按(conversation_id,created_at,id)分页 |
| generation_runs | conversation_id, user_message_id, assistant_message_id, prompt_version, model, status, consent_version, memory_revision, usage | 同用户消息只有1个当前运行；重试增加attempt而非复制用户消息 |
| stream_events | generation_id, seq, type, payload, created_at | UNIQUE(generation_id,seq)，短期保留；最终正文存messages |

`source_type`明确original/transcript/user_confirmed/ai_generated。AI转写可修正但原录音不覆盖。聊天图片不自动进入家庭相册；用户主动“保存为记忆”才创建memory并选择范围。

基础20条按同一免费空间启用的确认条目数计。到期有超过20条时，旧条目仍可读；让用户选择20条参与基础对话，未选择前使用其此前已指定的基础条目与当前人物资料，不能偷偷扩大付费检索或随机选事实。记忆检索不得使用未授权、已撤回、未确认和过期旧版本。

## 4. 商业与交付

| 表 | 关键字段 | 约束/索引 |
|---|---|---|
| products | code, kind, published_version, sale_enabled | code唯一；停售不删除 |
| product_versions | product_id, version, price_fen, member_price_fen?, duration_days, specs, entitlements, terms_version | UNIQUE(product_id,version)，发布后不可变 |
| quotes | actor_id, profile_id?, product_version_id, input_revision, price_breakdown, expires_at, status | 报价金额服务端计算；一般10分钟有效，未支付需重验 |
| orders | buyer_id, profile_id?, quote_id, currency, payable_fen, status, fulfillment_status, expires_at, return_context | quote消费唯一；按(buyer_id,created_at,id)分页 |
| order_items | order_id, product_version_id, spec_snapshot, gross_fen, discount_fen, credit_fen, payable_fen | 首发1单1商品也保留明细；快照不可改 |
| payments | order_id, channel, out_trade_no, provider_trade_no, provider_state, currency, state, paid_fen, paid_at, payer_client_ip, h5_url_expires_at | V1 channel=wechat_h5；UNIQUE(channel,provider_trade_no)；可信回调或查单确认；不保存密钥 |
| payment_events | channel, event_id, event_type, provider_serial, payload_digest, verified_at, result | UNIQUE(channel,event_id)，原始请求体只按最小必要范围受控留存，严禁记录密钥 |
| entitlement_grants | order_item_id, profile_id, beneficiary_user_id?, type, starts_at, ends_at, state, snapshot | 对每种权益UNIQUE(order_item_id,type)；共享能力与个人声音分开 |
| entitlement_ledger | grant_id, event_type, delta, effective_at, source_id, revision | append-only；source事件唯一；停用/恢复都有流水 |
| credits | source_order_item_id, target_order_id?, amount_fen, state, reserved_until | 防止同一留声作品重复抵扣/重复退款；预留与consume同事务 |
| refund_requests | order_id, applicant_id, reason, request_fen, state, provider_refund_no?, provider_refund_id?, provider_state?, decision | 锁订单核对累计退款≤实付；同一幂等键不重复申请；退款回调或查退款确认成功 |
| storage_scopes | id, owner_user_id, profile_id?, used_bytes, reserved_bytes, capacity_bytes, revision | TA存储和独立作品空间分别计量 |
| work_packages | order_item_id, voice_profile_id, expires_at, total_slots, delivered_slots | 留声包3个slot，不以生成尝试数扣减 |
| package_slots | package_id, slot_no, state, work_id?, revision | UNIQUE(package_id,slot_no)；reserve/deliver/release原子化 |

独立作品不强制关联TA，保存在购买账号的作品空间。该空间的暂存与用户可读期限需在首次销售前明确；本稿建议已交付付费作品与订单关联保留，不能因用户未创建TA而自动丢失。转入TA时先校验容量并创建引用，失败也不删除原作品；避免双算同一物理文件但仍按各自逻辑配额记账。

## 5. 生成、社区与支持

| 表 | 关键字段与用途 |
|---|---|
| tasks | kind, actor_id, profile_id?, order_item_id?, input_snapshot, state, required_outputs, completed_outputs, lease_until, deadline_at |
| task_attempts | task_id, attempt_no, provider, provider_task_id, submit_key, state, cost, error_class |
| works | task_id, owner_user_id, profile_id?, kind, output_asset_id, delivery_index, spec_result, status；UNIQUE(task_id,delivery_index) |
| voice_profiles | profile_id, user_id, provider, provider_voice_id, consent_id, sample_revision, state, trial_expires_at；provider_voice_id不暴露到客户端 |
| trial_entitlements | profile_id, user_id, round, attempts_used, sample_revision；免费首轮1次+1次修正用事务保护 |
| posts/post_versions | author_id, current_public_version, state, body, source_refs, publication_consent；公开正文为副本，审核版本独立 |
| comments/reactions/follows/reports | actor_id、目标ID、状态；同用户点赞/收藏/关注唯一 |
| moderation_reviews | target_type, target_version, reviewer_id, decision, reason, reviewed_at |
| notifications | user_id, type, target_id, read_at, dedup_key；事件生成、按账号读 |
| reminder_rules/anniversaries | user_id, profile_id, calendar_type, month, day, leap_month, timezone, delivery_window, enabled, consent_version |
| support_tickets/ticket_events | user_id, order_id?, task_id?, status, authorized_asset_ids, response_events |
| export_jobs/deletion_jobs | user_id, scope, requested_at, state, auth_revision, expires_at?, result_asset_id? |
| outbox_events | id, event_type, aggregate_id, payload, published_at, attempts |
| idempotency_records | actor_id, operation, key, request_hash, result_ref, expires_at；UNIQUE(actor_id,operation,key) |
| audit_logs | actor_id, actor_type, action, resource_id, reason, trace_id, occurred_at；不存私聊正文 |

## 6. 权限矩阵（必须由服务端实现）

| 行为 | TA创建者 | editor | viewer | 非成员 |
|---|---|---|---|---|
| 读家庭记忆 | 是 | 是 | 是 | 否 |
| 读某人私人记忆/聊天 | 仅本人 | 仅本人 | 仅本人 | 否 |
| 写家庭记忆 | 有基础/协作资格 | 协作权益有效 | 否 | 否 |
| 改家庭记忆 | 是，保留作者与审计 | 默认仅自己 | 否 | 否 |
| 邀请/移除/改角色 | 协作有效且是owner | 否 | 否 | 否 |
| 消费个人声音权益 | 本人有grant才可 | 本人有grant才可 | 本人有grant才可 | 否 |
| 看订单/退款 | 仅订单buyer | 仅订单buyer | 仅订单buyer | 否 |
| 公开另一人的家庭素材 | 需素材作者另行授权 | 同左 | 不提供发布入口 | 否 |

创建者“可管理空间”不等于可读成员私人内容。移除成员即时停止新授权访问；已下载到对方设备的内容无法远程收回，应在共享提示里说明。短时签名URL有残留有效期，敏感媒体建议经鉴权代理读取；不能声称撤权能瞬时收回所有已签发URL。

邀请接受事务：锁profile → 验证套餐、邀请状态和有效期 → 若已是有效成员返回现状 → 检查有效成员少于5 → upsert成员 → 消费token → 写事件。两个邀请同时接受不能出现第6人。

## 7. 文件、容量与删除

上传前预留容量，上传完成后以服务端确认的大小入账；超时会话释放预留。原始素材建议初始单文件上限图片20MB、音频100MB、视频200MB，均是配置建议，需两端实测。校验扩展名、MIME、实际格式和解码安全；禁止SVG等主动内容直接内联执行。

存储满只阻止新增或新增生成的保存，不影响读取和导出。已承诺的收费交付先进入独立作品空间，不应因TA满额而收款后无法交付。清理引用与实际删除分开，避免一个家庭成员误删其他内容仍引用的原件。

建议暂存孤立上传24小时清理、导出包24小时后过期；这些为拟规则，正式产品需明示。原始家庭记忆和付费作品不采用短期自动清理策略。业务记录删除先撤权和检索，再异步清理原件、衍生文件和供应商音色，保留最少删除审计。

删除整个TA需强确认，并说明对所有成员的共享访问和各自私聊的影响；提出导出选项但不能向创建者打包他人私聊。实施选择“成员各自导出窗口”或即时删除政策前，不开放一键不可逆全删。账号注销、TA删除和仅清空私聊是三个不同任务。

财务留存周期、备份最长保留期和用户数据删除完成时限需在上线前确定，不在代码中随意使用“永久”或未核对的法定年限。恢复备份必须应用删除墓碑。
