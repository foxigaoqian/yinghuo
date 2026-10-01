# Cloudflare Worker 部署

正式 H5 入口是 Cloudflare Worker，不是 Pages。Worker 同时承载静态 H5 与 `/api/v1/*`，因此 Cookie、CSRF、Workers AI 和 Supabase 数据访问保持同源。

## 运行结构

- 静态资源：Workers Static Assets，目录为 `apps/client/dist/build/h5`。
- API：`worker/index.js` 将 `/api/v1/*` 转发给现有 API 处理器。
- 数据库：Worker 使用 `SUPABASE_EDGE_SHARED_SECRET` 调用受限的 Supabase Edge gateway。
- AI：通过 `AI` binding 调用 Workers AI。
- SPA：未知页面路径回退到 `index.html`；API 路径始终优先执行 Worker 代码。
- 日志：Worker Observability 已启用。

## 部署

```bash
pnpm deploy:worker
```

该命令先构建 contracts 和 H5，再使用固定版本 Wrangler 与 `wrangler.worker.jsonc` 部署。

运行时必须存在以下加密 Secret：

- `SESSION_SECRET`
- `SUPABASE_EDGE_SHARED_SECRET`

共享令牌不得写入仓库、普通变量或前端构建产物。公开的 gateway URL 可作为普通变量。

## 当前环境

- Worker：`yinghuo-h5-sg-stage`
- 主入口：`https://yinghuo.soocly.com`
- `workers.dev` 仅作为海外调试备用，不作为面向用户的访问地址
- 数据：Supabase Singapore 项目 `yinghuo-h5-singapore`
- Pages 项目 `yinghuo-h5-sg-stage` 暂时仅作回滚快照；完成观察期后再单独下线。

连接 Cloudflare Workers Builds 时，生产分支使用 `main`，部署命令使用 `pnpm deploy:worker`。Worker 名必须与配置中的 `name` 完全一致。
