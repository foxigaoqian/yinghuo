# Supabase H5 接入状态

更新时间：2026-09-25

## 已实现的服务端路径

- `APP_MODE=supabase` 时加载独立 API 模块；默认 `APP_MODE=demo` 仍运行本地演示。
- `GET /bootstrap` 按当前 Guest 会话返回功能开关、免费 TA 资格、TA 数量和最近 TA/对话；H5 使用此结果恢复最近访问状态。手机号、支付和未实现能力明确返回关闭状态。
- 首次 H5 访问无感创建 Guest 用户和服务端会话；Cookie 使用 HttpOnly、SameSite Strict，服务端只保存随机会话令牌的 SHA-256 哈希。
- CSRF token 由服务端 HMAC 派生并逐请求校验；退出会撤销 Supabase `sessions` 行。
- TA 档案、AI 告知同意、初始故事、手动记忆、AI 对话消息和对话均写入 Supabase；每次查询按当前服务端会话的 `user_id` 限定。
- 创建 TA 已按现有交互方案实现为三步；创建草稿按 Guest 用户隔离并支持刷新恢复。未发送聊天草稿按用户和 TA 隔离，发送时复用稳定的 `clientMessageId`，成功后才清除。
- 会话、档案和聊天通过 Supabase Data API 的服务端凭据操作。密钥只存在后端环境变量，不进入 H5。
- Supabase 模式明确报告 AI 回复仍为模拟；订单、支付、媒体存储和广场发布保持关闭，不返回虚假支付或处理成功。

## 数据库迁移

`0001`–`0005` 已应用到当前连接的 Supabase 项目。`0005`（`supabase_guest_api`，2026-09-25）增加 Guest 会话创建/查询/撤销与原子创建档案函数。数据库检查确认四个函数均使用 `SECURITY INVOKER`，只授予 `service_role` 执行；匿名和普通用户角色无权调用。会话表也不能由匿名或普通用户直接读取。

新建环境需按 `0001`–`0005` 的顺序执行迁移，再启动 Supabase 模式 API。

Supabase 顾问目前提示 60 张表启用了 RLS、没有客户端策略。这是当前后端专用访问方式的预期状态：H5 只调用 NestJS API，匿名/普通客户端没有表权限。性能顾问还列出全库 72 个未覆盖索引的外键和 19 个未使用索引；这些需要结合真实查询监控排序后处理，不应为消除提示而给敏感表开放访问。

## 服务端配置

```dotenv
APP_MODE=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SESSION_SECRET=<至少32个随机字符>
```

这些变量只配置在 API 服务器或部署平台的 Secret 环境中。不要使用 `VITE_`、`NEXT_PUBLIC_` 等会暴露到浏览器的前缀；不要把密钥写入 Git、H5 静态资源、截图或聊天。

本地需要在轮换已暴露的旧密钥后，把新 Secret Key 写到被 `.gitignore` 忽略的 `.env`。生产环境密钥应在托管平台控制台配置。`APP_MODE=supabase` 的 H5 使用服务端 Guest 会话；演示模式仍可用原本的 `/dev/session`。

## 尚未达到上线条件

- 真实模型、记忆候选确认 UI、短信找回、私有 Storage 上传、图片处理、内容审核和支付尚未接入。
- 生产启动继续被配置检查阻止，直到供应商和业务验收完成。
- 当前接入需在轮换后的 Secret Key 环境中做一次真实 Supabase 集成验收：Guest 创建/恢复/撤销、档案创建、记忆写入读取、聊天刷新恢复、用户隔离、CSRF 与密钥不出现在浏览器。
- 本迁移仅覆盖 Guest-first MVP 所需的数据库函数；后续迁移继续使用单调递增版本号，不能改写已应用的 `0001`–`0005`。

## 本次开发验证

- `pnpm typecheck`：通过。
- `pnpm test`：通过（服务端 24 项、Worker 3 项）。
- `pnpm build`：通过（H5、服务端、Worker、后台）。
- `pnpm format:check`：通过。
- 浏览器 E2E 覆盖三步创建草稿刷新恢复、聊天草稿恢复和原有主流程；提交后由 GitHub Actions 安装 Chromium 并执行。
