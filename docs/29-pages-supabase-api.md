# H5 Pages Functions 接入新加坡 Supabase（受限 Edge 网关）

更新：2026-10-01。新加坡项目 `yinghuo-h5-singapore`，项目 URL `https://wabohmofgmgfffpmaorh.supabase.co`；悉尼项目不切换、不迁移数据。

## 为什么改成 Edge 网关

Supabase 连接插件可以部署 Edge Function 和管理数据库，但不会把 `sb_secret_...` 明文交给会话或 Cloudflare。预发布链路因此改为：

1. Cloudflare Pages Function 继续处理同域 Cookie、CSRF、业务路由和 Workers AI。
2. Pages 只持有一枚随机、可轮换的 `SUPABASE_EDGE_SHARED_SECRET`，请求受限的 `yinghuo-data-gateway`。
3. Supabase 只保存该令牌的 SHA-256 哈希；Edge Function 使用平台自动注入的 `SUPABASE_SECRET_KEYS` 访问 Data API。
4. 网关只允许萤火当前需要的 8 张表、4 个 RPC 和 GET/POST/PATCH，不提供任意 SQL，也不把数据库 Secret key 传给 Cloudflare、浏览器、GitHub或聊天。

原 `yinghuo-h5-preview` 没有网关 Secret，继续运行临时 KV 演示；独立项目 `yinghuo-h5-sg-stage` 检测到 `SUPABASE_EDGE_SHARED_SECRET` 后自动走新加坡数据库。这样不依赖会被根 `wrangler.jsonc` 在部署时覆盖的普通仪表盘变量。

## 代码与数据库

- `functions/api/v1/[[path]].js`：本地可用 `APP_BACKEND=supabase` 切换；Cloudflare 预发布按专用 Secret 自动切换。
- `lib/pages-supabase-h5.js`：优先调用 Edge 网关；保留直接 Secret key 模式作为本地/未来托管后端的兼容路径。
- `supabase/functions/yinghuo-data-gateway/index.ts`：验证服务令牌哈希并执行严格白名单内的数据请求。
- `infra/migrations/0007_edge_gateway_token.sql`：创建启用 RLS、无匿名策略的令牌哈希表。
- `GET /api/v1/health` 在网关模式下执行真实鉴权和数据库连通检查，不写入测试数据。

## Cloudflare 预发布变量

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| `SUPABASE_EDGE_SHARED_SECRET` | 加密 Secret | 专用服务令牌，只存在 Cloudflare；同时作为预发布模式开关 |
| `SESSION_SECRET` | 加密 Secret | Guest Cookie/CSRF 派生 |
| `AI` | Workers AI 绑定 | 授权后的文字聊天 |

`SUPABASE_EDGE_GATEWAY_URL` 仅作为本地或未来环境的可选覆盖；新加坡网关公开地址已固定在服务端代码中。不要把 `SUPABASE_SECRET_KEY`、共享令牌或 `.env` 提交到仓库。关闭浏览器 Cookie 会失去当前访客身份；账号找回尚未实现。本阶段仍只使用虚构人物资料。

## 验收

- 单元测试必须覆盖：旧的直接 Data API 兼容路径、网关请求不携带数据库密钥、网关健康检查。
- 线上 `/api/v1/health` 必须返回 `mode=supabase`、`persistence=supabase-edge-gateway`、`databaseStatus=connected`。
- 再验证访客建档、记忆、私密故事、刷新恢复、逐次勾选记忆后聊天，以及另一访客的数据隔离。
- 正式接收用户前仍需账号找回、数据导出/删除、Stripe 到账与退款闭环、国内手机网络、正式域名及法务文本验收。
