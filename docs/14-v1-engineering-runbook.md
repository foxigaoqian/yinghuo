# 萤火 V1 工程运行手册

版本：V1.0  
目标：把产品文档落成可运行、可测试、可发布的移动端 H5

## 1. V1 交付边界

### 必须交付

- 移动端 H5：登录、创建TA、保存记忆、文字对话、照片/故事上传；
- 基础权限：TA空间、家庭成员、私人聊天和素材隔离；
- 作品入口：至少一种经过样片验收的影像工具；
- 商品、报价、订单、按16验收的支付通道、订单恢复、退款申请；
- 服务端回调、主动查单、Outbox、Worker、权益激活；
- 后台：用户/空间、商品/权益、订单/退款/对账、任务、工单；
- 数据导出、删除、撤销AI/声音授权；
- 普通手机浏览器与微信内置浏览器的验收记录。

### V1 明确不做

- 微信小程序 code 登录、小程序 openid 和 wx.requestPayment（公众号 openid 与网页 JSAPI 属于 V1 条件通道）；
- 小程序原生录音、订阅消息和小程序分享；
- 实时电话、实时视频、复杂数字人；
- 自动续费和按分钟计费；
- 真实人物模型训练；
- 未通过样片和成本验收的声音年费。

## 2. 推荐仓库结构

~~~text
yinghuo/
├── apps/
│   ├── client/       # uni-app + Vue3 + TypeScript，V1只构建H5
│   ├── server/       # NestJS HTTP API、鉴权、交易、回调
│   ├── worker/       # 队列消费者、生成、导出、对账
│   └── admin/        # 运营后台
├── packages/
│   ├── contracts/    # OpenAPI生成的请求/响应类型
│   ├── domain/       # 金额、权益、状态机、幂等纯逻辑
│   └── design-tokens/
├── infra/
│   ├── migrations/
│   ├── seed/
│   ├── docker/
│   └── deploy/
├── docs/
│   ├── 12-openapi.yaml
│   └── ...
├── pnpm-workspace.yaml
├── package.json
├── pnpm-lock.yaml
├── .env.example
└── README.md
~~~

不要把前端、API、Worker和后台塞进一个无法独立启动的应用。所有跨层调用优先经过 packages/contracts 或领域服务，不从前端复制业务规则。

## 3. Node、包管理和本地启动

默认候选：

- Node.js 24.x，确定补丁版本后写入 .nvmrc 或 mise 配置；
- 用户端候选pnpm 10.x；若采用Vben，其独立包要求按08核验，不能强行共用10.x。M0构建通过后固定版本/锁文件；
- PostgreSQL 16+；
- Redis兼容服务，仅用于队列和短期缓存；
- S3兼容私有对象存储；
- Docker Compose 只用于本地开发，不作为生产架构。

推荐脚本：

~~~text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm db:seed
pnpm dev:server
pnpm dev:worker
pnpm dev:client:h5
pnpm build:h5
pnpm test:integration
pnpm test:e2e
~~~

第一条纵向小样只要求 H5 在普通手机浏览器和微信内置浏览器跑通：

创建TA → 保存文字记忆 → 发送消息 → 刷新恢复 → 再次读取。

模拟供应商必须显式标记，不允许用固定回复冒充模型已经接入。

## 4. 环境变量约定

.env.example 只放变量名、格式说明和示例占位，不放真实值。

### 应用和数据库

~~~text
APP_ENV=development|staging|production
APP_VERSION=...
API_PORT=...
PUBLIC_WEB_ORIGIN=https://...
PUBLIC_API_ORIGIN=https://...
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
TRUSTED_PROXY_CIDRS=...
SESSION_COOKIE_NAME=yinghuo_session
SESSION_COOKIE_DOMAIN=...
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
CSRF_ORIGIN_ALLOWLIST=https://...
LOG_LEVEL=info
~~~

### 对象存储

~~~text
STORAGE_ENDPOINT=...
STORAGE_REGION=...
STORAGE_BUCKET_PRIVATE=...
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_SIGNED_URL_SECONDS=300
~~~

对象存储桶默认私有。密钥只在 server/worker 使用，客户端只能拿服务端生成的短时上传参数或短时读取地址。

### 短信

~~~text
SMS_PROVIDER=...
SMS_SIGNING_NAME=...
SMS_TEMPLATE_LOGIN=...
SMS_ACCESS_KEY_ID=...
SMS_ACCESS_KEY_SECRET=...
~~~

A-02 前必须用真实账号确定一家短信供应商，并记录发送区域、价格、签名、模板审核、频控和故障切换。验证码只保存 hash，不能记录明文。

### 微信 H5 支付

~~~text
PAYMENT_MODE=disabled|staging|live
WECHAT_H5_ENABLED=false
WECHAT_MCHID=...
WECHAT_H5_APPID=...
WECHAT_API_V3_KEY=...
WECHAT_MERCHANT_SERIAL=...
WECHAT_MERCHANT_PRIVATE_KEY=...
WECHAT_PLATFORM_CERT_OR_PUBLIC_KEY=...
WECHAT_NOTIFY_URL=https://api.example.com/api/v1/payments/wechat_h5/notify
WECHAT_REFUND_NOTIFY_URL=https://api.example.com/api/v1/refunds/wechat_h5/notify
WECHAT_APP_URL=https://app.example.com
~~~

生产环境禁止用前端提交的 appid、mchid、notify_url、金额、IP或回跳地址覆盖这些配置。支付默认关闭；完成 M0-03、回调联调、金额核对和小额正式验证后才打开 WECHAT_H5_ENABLED。

### AI和媒体适配器

~~~text
TEXT_PROVIDER=...
TEXT_MODEL=...
ASR_PROVIDER=...
TTS_PROVIDER=...
VOICE_PROVIDER=...
IMAGE_PROVIDER=...
MODEL_DATA_REGION=...
MODEL_TIMEOUT_MS=...
MODEL_MAX_RETRIES=...
~~~

每个供应商适配器必须有超时、重试、查询、取消能力标志、原始请求审计摘要和成本记录。供应商 URL 不直接作为用户长期作品地址。

## 5. Node/NestJS 支付实现边界

后端使用 NestJS，不把 Java SDK 代码直接搬进 Node 项目。PaymentModule 应拆成：

~~~text
apps/server/src/modules/payment/
├── payment.module.ts
├── payment.controller.ts
├── payment.service.ts
├── payment-reconcile.service.ts
├── adapters/
│   └── wechat-h5.adapter.ts
├── callback/
│   ├── wechat-signature.service.ts
│   ├── wechat-resource-decryptor.ts
│   └── wechat-notify.controller.ts
├── dto/
└── payment.repository.ts
~~~

wechat-h5.adapter.ts 必须提供：

- createPrepay(orderSnapshot)；
- queryByOutTradeNo(outTradeNo)；
- close(outTradeNo)；
- createRefund(refundSnapshot)；
- queryRefund(providerRefundNo)；
- downloadTradeBill(date)；
- verifyBillDigest(file, digest)。

实现方式在 M0-03 锁定为“通过审核的 Node SDK”或“按官方 HTTP 协议使用 Node crypto 自行签名”。无论选哪一种，必须用官方字段和真实商户测试完成：

- 请求签名；
- H5 下单和 h5_url；
- 支付回调验签、解密；
- 查单、关单；
- 退款、退款回调；
- 交易账单下载和摘要校验。

支付回调控制器必须拿到原始 body，不能先由 JSON middleware 改写。验签、解密、商户/订单/金额核对失败不能发权益。

## 6. 商品和价格初始化

V1 开发环境使用商品版本 seed；正式销售前由产品负责人确认并锁定 termsVersion。

首发建议先只打开一个付费商品：

~~~text
memory_year
priceFen: 9900
durationDays: 365
storageBytes: 5000000000
maxFamilyMembers: 5
termsVersion: memory-year-v1
saleEnabled: false
~~~

声音年费、留声包、扩容和其他影像商品先建立为 saleEnabled=false，只有通过样片、成本、退款和供应商稳定性验收后才打开。前端价格来自 bootstrap 或产品接口，不写死 ¥99、¥299 等数字。

正式收费前必须把以下决定写入产品版本：

- 售价和会员价；
- 绑定TA和购买账号；
- 服务起算时间；
- 退款窗口和交付失败处理；
- 容量、作品规格和期限；
- 条款版本和用户确认记录。

## 7. H5 域名和支付回跳

至少准备三个地址：

~~~text
staging web: https://staging-app.example.com
staging api: https://staging-api.example.com
production web: https://app.example.com
production api: https://api.example.com
~~~

替换为实际域名后：

- 全站 HTTPS；
- API 回调地址公网可访问；
- notify_url 不带查询串；
- H5 返回结果只携带订单恢复上下文；
- returnContext 必须是服务端生成的内部页面标识；
- 禁止开放跳转和客户端自定义回跳地址；
- 微信内置浏览器和普通手机浏览器都跑支付取消、返回、关闭、超时。

支付结果页永远先 GET 订单；浏览器回跳不等于支付成功。

## 8. CI、测试和发布

### Pull Request 必须通过

~~~text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build:h5
~~~

B 阶段增加：

- PostgreSQL迁移测试；
- 权限矩阵测试；
- 幂等和并发交易测试；
- H5支付回调验签/解密测试；
- 查单与回调竞态测试；
- 退款超时查回测试；
- Outbox/Worker重试测试；
- 订单、权益、作品和退款对账测试。

### 发布顺序

1. 备份并确认恢复点；
2. 执行向前兼容数据库迁移；
3. 部署 API；
4. 部署 Worker；
5. 部署 H5；
6. 执行健康检查和关键链路；
7. 记录开关、迁移、版本和回滚方法；
8. 需要时再打开新商品或支付开关。

回滚应用不能回滚已经发生的支付事实；交易和权益优先按账本对账修复。

## 9. 日志、监控和告警

所有请求使用 traceId。允许记录：

- traceId、userId哈希、profileId、orderId、taskId；
- 状态、耗时、重试次数、错误分类；
- providerTradeNo和refundNo的脱敏值；
- 成本估算和实际账单摘要。

禁止记录：

- APIv3 key、商户私钥、短信密钥；
- 完整支付回调密文；
- 完整手机号；
- 私人聊天正文；
- 原始家庭照片、声音和下载地址。

首发告警：

- API 5xx、登录验证码异常、上传失败；
- 未交付已付款；
- payment pending 超时；
- 回调验签/解密失败；
- 金额不匹配和重复交易；
- Outbox积压、Worker最老任务；
- 退款超时；
- 对账差异；
- 对象存储容量和成本异常。

## 10. 备份、恢复和数据删除

- PostgreSQL 开启自动备份和 PITR 能力；
- 每月至少一次恢复演练，首发前必须演练一次；
- 备份恢复后验证删除墓碑和支付账本；
- 对象存储启用版本或受控删除策略；
- 导出包短期有效，生成和下载都重新验权；
- 账号注销、TA删除、撤AI授权和清空聊天分别处理；
- 删除任务保留最小审计，不删除财务和退款事实。

RPO≤24小时、RTO≤4小时只是内部初始目标；演练后用实测值替换建议值。

## 11. 真实收费上线门槛

以下全部通过后才把 B 阶段商品和支付开关打开：

- [ ] 价格版本、售后条款和隐私/AI说明已确认；
- [ ] staging 普通浏览器和微信内置浏览器支付流程通过；
- [ ] 正式商户资质、appid、mchid、证书和回调已核对；
- [ ] 小额正式支付能查单、对账和退款；
- [ ] 重复回调只产生一个权益；
- [ ] 支付成功关闭网页仍可恢复订单和作品；
- [ ] 退款超时可查回，不重复退款；
- [ ] 数据库恢复和删除墓碑演练通过；
- [ ] 关键日志未泄露敏感信息；
- [ ] 客服、工单和人工对账责任人已确定；
- [ ] 首批内部试用和10–20个自愿家庭观察完成；
- [ ] 高风险对话、公开内容和素材授权规则已上线。

## 12. 故障处理

### 支付异常

暂停新售入口，保留历史订单查询、查单、交付和退款。先查支付渠道和账单，再修复本地状态，不通过后台直接改“会员已开通”。

### 供应商异常

暂停相关商品或生成入口；已有订单进入 reconciling，Worker先查询再重试。保留原始输入、授权和任务状态，不让用户重复付费。

### 越权或隐私事件

立即关闭受影响读取/分享入口，保留订单和售后入口；记录影响范围、对象、时间、修复和通知决定。涉及法律义务时交由合规负责人处理。

### 数据库故障

API进入只读或维护页；不接受新的收费、退款和删除请求，除非账本和幂等状态可安全写入。恢复后先对账和重放缺失Outbox，再恢复新售。

## 13. V2 迁移触发条件

只有以下指标稳定后才立项小程序迁移：

- H5创建到首次记忆完成率；
- H5支付转化率和支付失败原因；
- 退款率、影像交付成功率和客服处理时长；
- 内容安全事件和授权撤回处理结果；
- H5用户明确存在原生录音、分享或订阅消息需求。

V2 新增小程序身份、wx.requestPayment 和原生媒体能力；网页JSAPI和H5真机验收在V1完成；订单、权益、退款、对账和后台交易核心保持不变。


> V1.1实施对齐（2026-09-19）：首发范围与开发默认值见[17](17-v1-contract-completion.md)，支付见[16](16-payment-routing-and-stripe.md)，后台见[18](18-admin-api-and-operations.md)，AI落地见[19](19-ai-provider-and-evaluation.md)，验收见[20](20-acceptance-matrix.md)。A/B接口以[12](12-openapi.yaml)为准；新增数据库定义见[补充迁移](../infra/migrations/0002_v1_gaps.sql)。C/D仍按阶段评审。


### V1.1增加的服务端配置

PAYMENT_CHANNELS、STRIPE_SECRET_KEY、STRIPE_WEBHOOK_SECRET、STRIPE_ACCOUNT_ID、STRIPE_API_VERSION、STRIPE_CHECKOUT_ENABLED=false；WECHAT_JSAPI_ENABLED=false、WECHAT_OFFICIAL_APPID、WECHAT_OFFICIAL_SECRET、WECHAT_OAUTH_CALLBACK；ADMIN_OIDC_ISSUER、ADMIN_OIDC_CLIENT_ID、ADMIN_OIDC_CLIENT_SECRET、ADMIN_OIDC_REDIRECT_URI。生产密钥不写入本文件。管理端与用户端Cookie隔离；统一API路径见12。
