# 萤火 · Firefly

保存重要的记忆，让爱继续发光。

面向国内家庭的移动优先记忆产品：记录重要的人的照片、声音和故事，在明确的 AI 标识下进行对话，并支持家人共同记录。
首期采用移动端 H5 验证真实转化，确认需求后再迁移微信小程序。

**当前状态：可运行的 H5 MVP 工程框架已纳入仓库。** 默认 demo 模式可本地演示；Guest-first 身份与核心档案、记忆、聊天已接入 Supabase 服务端路径（当前项目的 0001–0005 数据库迁移已应用；运行 API 仍需配置服务端密钥）。AI 仍为模拟服务，支付、短信、媒体处理、内容审核和生产部署尚未接通，当前不是可直接商用版本。

## 从这里开始

| 文档 | 解决什么问题 |
|---|---|
| [产品开发总纲](docs/01-product-and-scope.md) | 用户、核心价值、首发范围、商业规则、产品经理决策 |
| [前端与52页规格](docs/02-frontend-pages.md) | 每页路径、阶段、数据接口、操作、空态和异常 |
| [后端架构与业务逻辑](docs/03-backend-architecture.md) | 服务边界、鉴权、任务、跨端与部署 |
| [数据模型与权限](docs/04-data-and-access.md) | 实体、关键字段、索引、生命周期和隔离规则 |
| [API契约](docs/05-api-contracts.md) | 接口清单、请求响应、错误码、幂等和聊天传输 |
| [交易与权益状态机](docs/06-commerce.md) | 报价、支付、升级、交付、退款和到期 |
| [微信 H5 支付实施](docs/11-wechat-h5-payment.md) | 微信 H5 下单、回调、退款、对账和上线检查 |
| [OpenAPI 契约](docs/12-openapi.yaml) | 可供前后端生成类型和校验的 V1 H5 API |
| [数据库实施规格](docs/13-database-schema.md) | PostgreSQL表、约束、索引、迁移和恢复验收 |
| [V1 工程运行手册](docs/14-v1-engineering-runbook.md) | 工程骨架、环境变量、支付实现、部署和上线门槛 |
| [合规与内容安全](docs/15-compliance-and-content-safety.md) | 授权、AI标识、社区审核、数据权利和上线检查 |
| [AI、记忆与媒体管线](docs/07-ai-and-media.md) | 记忆检索、声音试听、影像生成、效果验证 |
| [GitHub开源复用调研](docs/08-open-source.md) | 哪些直接采用、哪些参考、许可证与维护证据 |
| [开发任务与验收](docs/09-delivery-plan.md) | 依赖顺序、三人分工、测试、监控与发布门槛 |
| [支付路由与Stripe](docs/16-payment-routing-and-stripe.md) | 主体资格、H5/网页JSAPI/Stripe、Webhook和退款 |
| [首发契约与规则](docs/17-v1-contract-completion.md) | 阶段边界、开发默认规则、字段权威来源 |
| [后台接口与操作](docs/18-admin-api-and-operations.md) | 管理员认证、scope、退款和审计 |
| [AI适配与评测](docs/19-ai-provider-and-evaluation.md) | 提示词、类型契约、虚构测试用例、供应商开关 |
| [验收矩阵](docs/20-acceptance-matrix.md) | 文档检查、迁移步骤、业务测试输入与发布门槛 |
| [MVP 产品体验优化 V2](docs/21-mvp-ux-v2.md) | 匿名账号、渐进式创建、状态恢复、家庭共建、主动消息与付费体验 |
| [全站页面文案与交互文案](docs/22-copy-and-microcopy.md) | 首页、创建、聊天、记忆、空状态、支付、异常与微文案统一标准 |
| [全站页面结构与交互原型](docs/23-page-structure-and-interaction.md) | 移动端信息架构、用户状态机、页面结构、交互规则与 P0/P1/P2 优先级 |
| [P0 开发实施计划](docs/24-p0-implementation-plan.md) | Guest-first 纵向闭环的开发顺序、接口、状态、测试矩阵与第一版演示路径 |
| [H5 + Supabase 接入状态](docs/25-supabase-h5-integration.md) | 已实现能力、环境变量、安全边界与尚未接通的上线项目 |
| [决策记录与待办](docs/10-decisions.md) | 已有方向、此次技术建议和仍需实测的事项 |

产品伙伴先读 01、21、22、23、06、09、15；前端先读 21–23，再读 02、05、12；后端读 03–07、12–14，并用 21/23 校验匿名账号、状态恢复和记忆确认链路；准备采用开源代码时先读 08。若旧页面规格与 21–23 的用户体验基线冲突，产品交互与文案以 21–23 为准，接口/权限/交易契约仍以 05、12–20 为准。

## 推荐实施路线

- 用户端：uni-app + Vue 3 + TypeScript，优先评估 unibest 模板与 Wot UI；V1 只构建移动端 H5，组件和 API 保持可迁移到微信小程序，V2 再做小程序真机适配。
- 服务端：NestJS 模块化单体，独立 Worker 处理耗时任务；PostgreSQL、对象存储，收费任务阶段加入 BullMQ 与兼容 Redis 的托管服务。
- AI：首发由可替换的服务端适配器接入模型 API；记忆和权限保留在自有数据库。达到检索规模后使用 pgvector。
- 先交付“创建 → 保存记忆 → 文字对话 → 再次找到”，再交付“购买 → 作品交付 → 退款”；声音年费在效果和成本验证通过后销售。

以上是本次建议架构，不代表依赖已安装、兼容性已实测。具体依据与替代方案见开源调研。


## 本地运行 H5 MVP

- Node.js 24、pnpm 11；先运行 `pnpm install`。
- 复制 `.env.example` 为 `.env`，默认 `APP_MODE=demo`；运行 `pnpm dev` 后用 H5 与本地 API 演示 Guest-first 主流程。
- 当前项目已按序应用 `infra/migrations/0001`–`0005`；新环境按序执行迁移，再仅在服务端配置 `APP_MODE=supabase`、`SUPABASE_URL`、`SUPABASE_SECRET_KEY` 和至少 32 位的 `SESSION_SECRET`。不要把 Secret Key 配到 H5 构建变量或提交到仓库。
- 代码检查：`pnpm test` 与 `pnpm build`。Supabase 接入明细和当前限制见 [接入说明](docs/25-supabase-h5-integration.md)。

## 版本与约定

- 开发规格 V1.2，2026-09-23；产品基线为《萤火产品完整方案 V2》，最新 UX 基线见 21–23。
- `P01`–`P52` 是用户页面标识；`B01`–`B08` 是后台模块。52个模板不等于首发必须上线52页。
- `A/B/C/D` 表示交付阶段；前端隐藏入口与后端关闭能力必须同步。
- 本仓库当前为公开仓库。示例使用虚构数据，不提交真实家庭素材、聊天、手机号、API密钥或支付证书。
- 上游开源许可证不等于本项目已选定开源许可证；复制代码时保留其版权与许可说明。

## 调研证据

[开源快照](docs/research/open-source-snapshot.json) 记录核对日期、分支、提交与许可元数据。它不是依赖锁文件，不应自动安装这些项目的最新分支。

应用代码开始后，逐项将本规格里的“计划”改为实现状态，并在相关PR中链接页面编号、接口和验收项。



## V1.2交付状态

- 支付：微信外H5、微信内网页JSAPI、Stripe Checkout三个条件通道；只开放实际资格及实测通过的通道，未声明任何账号已开通。
- 首发接口：12覆盖A/B页面和后台；C/D另行实施。
- 数据库：[新库迁移](infra/migrations/0001_baseline.sql)、[补充迁移](infra/migrations/0002_v1_gaps.sql)及 [Guest-first 迁移](infra/migrations/0003_guest_first_identity.sql)，不是已执行的生产变更。
- 检查：`python -m pip install -r tools/spec-requirements.txt`，然后`python tools/check_specs.py --check`。
- [逐页追踪](docs/research/v1-traceability.json)、[28个验收场景](docs/research/acceptance-cases.json)、[12个AI起始用例](docs/research/ai-eval-cases.json)；业务测试状态均为not_run。
- 接入与发布仍需真实账号、供应商评测、正式条款、数据库及支付联调；不把文档静态检查说成应用验收完成。


## 2026-09-23 UX 基线更新

- 首次访问改为 **Guest-first**：系统先自动建立匿名身份，不以手机号注册作为开始使用的门槛。
- 创建 TA 改为 **3 步最小创建**：关系、称呼、TA 如何称呼用户；照片、声音、生平、聊天记录全部后置。
- 记忆改为 **候选记忆 → 用户确认 → 核心记忆**，AI 推断和生成内容不得自动成为事实。
- 首页区分 **新用户态 / 回访态**；回访优先恢复最近 TA、最近聊天、草稿和未完成动作。
- “我的”改为 **我的家庭空间**，重点展示已经留下的记忆资产、继续动作、家庭共建和数据保护，而不是账户字段。
- 微信环境、PWA/桌面入口、断网、刷新、支付失败、跨设备找回等均纳入状态连续性验收。
- P0 先保证匿名账号、恢复、聊天、记忆确认、草稿、找回和删除；高级声音、视频、公开社区后置。
- **契约状态**：OpenAPI 12 已升级为 V1.2，加入 guest 会话、手机号保护/恢复与显式 merge；0003 已补 Guest-first 数据迁移。仍需在实际测试库运行迁移并重新生成 traceability/执行 `check_specs --check`。
