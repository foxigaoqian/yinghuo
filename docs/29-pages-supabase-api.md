# H5 Pages Functions 接入新加坡 Supabase（开发阶段）

更新：2026-09-28。新加坡项目 `yinghuo-h5-singapore`，公开项目 URL `https://wabohmofgmgfffpmaorh.supabase.co`；现有悉尼项目不切换、不迁移数据。

## 代码与切换点

- `functions/api/v1/[[path]].js`：保持现有预览路由；只有 Cloudflare Pages 环境变量 `APP_BACKEND=supabase` 才把 API 切到 `lib/pages-supabase-h5.js`。此模块放在 `functions` 目录外，避免 Pages 将帮助代码识别成独立 URL 路由。
- 新路由使用 Pages Functions 原生 Fetch/Web Crypto；将 Supabase Secret API key 仅放在服务器环境，通过 `apikey` 请求头访问 Data API（新式密钥不是 JWT，不能作为 Bearer token），浏览器不调用 Supabase Data API。
- 已覆盖匿名访客、Cookie 会话、CSRF、资料创建/修改、文字记忆、私密故事、当次选择记忆的 AI 文字聊天；订单和广场公开投稿继续关闭。预览 KV 路由不变。
- 新加坡项目的六份数据库迁移已执行，RLS 与访客 RPC 权限经 SQL 实查；参考 [H5 首发路线](28-h5-launch-route-stripe.md)。
- Supabase 安全顾问返回 60 条 [`rls_enabled_no_policy` 信息提示](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)；这是本项目「前端不直连数据库、所有 public 表拒绝匿名/普通身份、仅后端密钥访问」设计的预期结果。若以后开放浏览器直连，需重新设计逐表 RLS 策略。

## 独立预发布环境所需配置

在**单独的 Cloudflare Pages 项目**设置以下环境变量或 Secret，随后部署同一仓库和 H5 构建命令。不要直接修改 `yinghuo-h5-preview` 项目，以免正在使用的演示账号突然失效。

| 名称                  | 值与来源                                                      | 可公开 |
| --------------------- | ------------------------------------------------------------- | ------ |
| `APP_BACKEND`         | `supabase`                                                    | 是     |
| `SUPABASE_URL`        | `https://wabohmofgmgfffpmaorh.supabase.co`                    | 是     |
| `SUPABASE_SECRET_KEY` | 新加坡项目 Dashboard 的**新 Secret key**，仅设为 Pages Secret | 否     |
| `SESSION_SECRET`      | 新生成的至少 32 个随机字符，设为 Pages Secret                 | 否     |
| `AI`                  | Cloudflare Workers AI 绑定，须在这个 Pages 项目单独绑定       | 不适用 |

`APP_BACKEND` 未设置时默认运行原预览；设置了 `supabase` 却缺少服务端密钥时 API 明确返回 503。切勿把旧悉尼项目的密钥、在聊天中发过的密钥或 `.env` 文件提交到 GitHub。关闭浏览器 Cookie 会失去当前访客身份，账号找回尚未实现；本阶段仍限虚构人物测试，不收集真实家庭资料。

## 验收

运行 `pnpm test`、`pnpm --filter @yinghuo/client build:h5`。单独预发布站确认 `/api/v1/capabilities` 为 `mode=supabase`，建立访客→建档→记忆→私密故事→刷新后恢复→逐次勾选聊天记忆；另一访客无法读取资料和故事；未同意 AI 时模型不调用；模型失败不保存消息。`/api/v1/orders` 不接受购买，广场公开投稿不开放。正式接收用户前还需账号找回、数据导出/删除、Stripe 到账与退款闭环、国内手机网络及正式域名验收。
