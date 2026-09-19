# 首发后台接口与操作权限

V1.1。使用/api/v1/admin前缀，独立adminCookie；不接受用户端session升级为管理员。通过企业OIDC及MFA登录，由部署环境配置issuer/clientId/JWKS/audience；不在公开文档放初始管理员密码。外部身份唯一映射admin_accounts；停用立即拒绝。

## 1. 首发操作

请求响应细节见12；以下scope必须由服务端再次校验，不靠菜单隐藏。

| 模块 | 操作 | scope | 限制 |
|---|---|---|---|
| B01 | GET /admin/users、/admin/profiles | account.read | 脱敏账号、归属、状态；无私聊正文 |
| B01 | POST /admin/users/{id}/suspend | account.manage | 原因必填，不删除其订单/资料 |
| B02 | GET /admin/products | catalog.read | 查看版本和开关 |
| B02 | POST /admin/products/{id}/versions | catalog.write | 新建不可变版本，不修改历史快照 |
| B02 | POST /admin/products/{id}/publish、/disable | catalog.publish | 需条款确认及渠道验收证据；乐观锁 |
| B02 | POST /admin/profiles/{id}/compensations | entitlement.compensate | 期限/理由/工单必填，append-only grant/ledger |
| B03 | GET /admin/orders、/admin/refunds | finance.read | buyer脱敏；财务与素材权限分离 |
| B03 | POST /admin/refunds/{id}/decision | finance.refund | approve/reject；锁订单/支付核累计退款；同次幂等重放 |
| B03 | POST /admin/reconciliations；GET /admin/reconciliations | finance.reconcile | 日期/渠道/账号；异步任务，结果差异可追踪 |
| B03 | GET /admin/reconciliation-items；POST /admin/reconciliation-items/{id}/resolve | finance.reconcile | 关联已验证的补偿/退款/重放记录，不能直接改金额 |
| B04 | GET /admin/tasks；POST /admin/tasks/{id}/retry | task.manage | 只补缺失交付，不生成第二份付费任务 |
| B07 | GET /admin/support-tickets；POST /admin/support-tickets/{id}/replies | support.manage | 无附件授权时不能访问家庭素材 |
| B07 | POST /admin/support-tickets/{id}/resolve | support.manage | 回复/解决原因，用户端可见状态 |
| B08 | GET /admin/data-requests；POST /admin/data-requests/{id}/retry | data.manage | 只重放既有申请，不能扩大导出范围 |
| 审计 | GET /admin/audit-events | audit.read | 按操作者/对象/时间查，不返回secret/原文 |

B05声音质检、B06用户社区审核在C1/C2补相应契约，不把占位菜单宣称已交付。A/B运营故事用版本控制的授权内容种子，发布前审核来源。

## 2. 写操作事务模板

验证admin会话+scope+MFA新鲜度 → 检查请求幂等 → 锁目标对象 → 核对expectedVersion/业务前置状态 → 写业务流水+audit_events+outbox → 提交 → 返回实际状态。

审计字段actor、scope、action、targetType/targetId、reason、requestId、前后状态摘要、关联工单；禁止记录完整请求体中的私聊或签名密钥。后台响应也携带traceId。普通客服没有finance.refund或data.manage权限。

冻结账号不妨碍处理已付款订单、退款和履约；用户请求登录时提示账号不可用及客服入口，不暴露内部调查信息。上线开关与停售只暂停新订单，后台仍能查历史与退款。

## 3. 数据保护与售后闭环

工单附件由用户显式勾选，ticket附件授权只对处理该工单且具有scope的人有效。素材下载用专用审计访问，不能复用用户端任意assetId接口穿透。客户撤回附件授权后立刻拒绝新访问；旧短链有效期仍有明确边界。

退款审批产生refund_requests的approved或rejected，Worker调用渠道；外部超时保持processing/reconciling。客服回复“已提交退款”不能变成“已到账”。成功退款后才对对应grant冲正；部分退款不自动撤销全部套餐。

数据请求retry不改变requester、scopeSnapshot、consentRevision或已撤销访问资格；重新验权后继续。删除任务逐项记录database/object_storage/provider/index/backup_tombstone，不因某一供应商失败宣称彻底删除。

## 4. 管理员身份与错误

GET /admin/auth/authorize与callback使用一次性state/nonce+PKCE；登录回调验证OIDC token issuer/audience/signature/exp和MFA声明后才签发adminCookie。MFA声明不可由前端参数替代。POST /admin/auth/logout撤销会话。

401未登录/会话撤销；403缺scope或MFA过期；404对象不可见；409幂等/版本/状态冲突；422理由/退款金额不合法；503渠道暂不可用。任何500不能同时留下未入审计的人工开通。

验收必须覆盖：普通账号调用admin被拒、客服无法退款、反复审批同一请求只执行一次、两个管理员竞争审批、无附件授权无法查看、对账差异不能随意“标记解决”。

后台商品DTO的catalogVersion对应products.version，商品内容version对应product_versions.version；expectedVersion使用catalogVersion，不能混用。任务和数据申请DTO均返回version供重试并发检查。
