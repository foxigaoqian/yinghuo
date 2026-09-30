# H5 Pages Functions 接入新加坡 Supabase（开发阶段）

更新：2026-09-30。新加坡项目 `yinghuo-h5-singapore`，公开项目 URL `https://wabohmofgmgfffpmaorh.supabase.co`；现有悉尼项目不切换、不迁移数据。

## 代码与切换点

- `functions/api/v1/[[path]].js`：保持现有预览路由；只有 Cloudflare Pages 环境变量 `APP_BACKEND=supabase` 才把 API 切到 `lib/pages-supabase-h5.js`。此模块放在 `functions` 目录外，避免 Pages 将帮助代码识别成独立 URL 路由。
- 新路由使用 Pages Functions 原生 Fetch/Web Crypto；将 Supabase Secret API key 仅放在服务器环境，通过 `apikey` 请求头访问 Data API（新式密钥不是 JWT，不能作为 Bearer token），浏览器不调用 Supabase Data API。
- 已覆盖匿名访客、Cookie 会话、CSRF、资料创建/修改、文字记忆、私密故事、当次选择记忆的 AI 文字聊天；订单和广场公开投稿继续关闭。预览 KV 路由不变。
- 新加坡项目的六份数据库迁移已执行，RLS 与访客 RPC 权限经 SQL 实查；参考 [H5 首发路线](28-h5-launch-route-stripe.md)。
- Supabase 安全顾问返回 60 条 [`rls_enabled_no_policy` 信息提示](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)；这是本项目「前端不直连数据库、所有 public 表拒绝匿名/普通身份、仅后端密钥访问」设计的预期结果。若以后开放浏览器直连，需重新设计逐表 RLS 策略。

## 独立预发布环境

已创建 Cloudflare Pages 项目 [`yinghuo-h5-sg-stage`](https://dash.cloudflare.com/?to=/:account/pages/view/yinghuo-h5-sg-stage)，域名 `https://yinghuo-h5-sg-stage.pages.dev`，绑定本仓库 `main`、H5 构建、Workers AI。原 `yinghuo-h5-preview` 继续运行临时 KV 演示，不切换现有访客。预发布环境缺少 Supabase Secret key 时主动返回 503，不接收真实用户数据。

| 名称                  | 状态                                                  | 可公开 |
| --------------------- | ----------------------------------------------------- | ------ |
| `APP_BACKEND`         | 已设置 `supabase`                                     | 是     |
| `SUPABASE_URL`        | 已指向新加坡项目                                      | 是     |
| `SUPABASE_SECRET_KEY` | **待填入新加坡项目的新式 Secret key**，须为 Pages Secret | 否     |
| `SESSION_SECRET`      | 已生成并保存为 Pages Secret                           | 否     |
| `AI`                  | 已绑定 Cloudflare Workers AI                          | 不适用 |

`APP_BACKEND` 未设置时默认运行原预览；设置了 `supabase` 却缺少服务端密钥时 API 明确返回 503。切勿把旧悉尼项目的密钥、在聊天中发过的密钥或 `.env` 文件提交到 GitHub。关闭浏览器 Cookie 会失去当前访客身份，账号找回尚未实现；本阶段仍限虚构人物测试，不收集真实家庭资料。

仅剩的配置：在新加坡 Supabase 项目的 **Settings → API Keys** 创建或复制 `sb_secret_...` 新式密钥；在 Cloudflare Pages 项目 `yinghuo-h5-sg-stage` 的 **Settings → Environment variables → Production** 把它填入 `SUPABASE_SECRET_KEY`，选择加密 Secret 类型并重新部署。部署后用真实站点完成下文验收，**不要把密钥发到聊天或仓库**。

## 验收

运行 `pnpm test`、`pnpm --filter @yinghuo/client build:h5`。单独预发布站确认 `/api/v1/capabilities` 为 `mode=supabase`，建立访客→建档→记忆→私密故事→刷新后恢复→逐次勾选聊天记忆；另一访客无法读取资料和故事；未同意 AI 时模型不调用；模型失败不保存消息。`/api/v1/orders` 不接受购买，广场公开投稿不开放。正式接收用户前还需账号找回、数据导出/删除、Stripe 到账与退款闭环、国内手机网络及正式域名验收。
