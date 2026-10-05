# Cloudflare Worker 部署

正式 H5 入口是 Cloudflare Worker，不是 Pages。Worker 同时承载静态 H5 与 `/api/v1/*`，因此 Cookie、CSRF、Workers AI 和 Supabase 数据访问保持同源。

## 运行结构

- 静态资源：Workers Static Assets，目录为 `apps/client/dist/build/h5`。
- API：`worker/index.js` 将 `/api/v1/*` 转发给现有 API 处理器。
- 数据库：Worker 使用 `SUPABASE_EDGE_SHARED_SECRET` 调用受限的 Supabase Edge gateway。
- AI：已部署版本通过 `AI_LEGACY_BACKEND_URL` 调用保留原密钥的旧 Worker。新 API 先验证账号、人物和明确选中的记忆，将越过会话轮次或引用已撤回记忆的历史移出模型上下文，再调用旧 Worker；失败时回退到本地 `AI` binding。新 Worker 也支持直接配置 SquareFace Key。
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
- `ADMIN_REVIEW_TOKEN`（故事审核管理员口令）
- `SQUAREFACE_API_KEY`（启用 SquareFace 主模型；不配置时继续使用 Workers AI）

共享令牌和 AI Key 不得写入仓库、普通变量、日志或前端构建产物。公开的 gateway URL、SquareFace Base URL 和模型名可作为普通变量。

SquareFace 令牌应在中转站创建为 `default` 分组，然后写入 Worker Secret：

```bash
pnpm dlx wrangler@4.145.0 secret put SQUAREFACE_API_KEY --config wrangler.worker.jsonc
```

Worker 只会向 `api.sqface.sbs` 或官方备用域名发送对话请求，避免变量误配时将记忆内容和 Key 发往未知主机。

## 当前环境

- Worker：`yinghuo-h5-sg-v2`
- 主入口：`https://yinghuo.soocly.com`
- `workers.dev` 仅作为海外调试备用，不作为面向用户的访问地址
- 数据：Supabase Singapore 项目 `yinghuo-h5-singapore`
- Pages 项目 `yinghuo-h5-sg-stage` 暂时仅作回滚快照；完成观察期后再单独下线。

连接 Cloudflare Workers Builds 时，生产分支使用 `main`，部署命令使用 `pnpm deploy:worker`。Worker 名必须与配置中的 `name` 完全一致。

## 已发布的嵌入式资源版本

2026-10-05 发布使用 `worker/production.js` 与 `worker/build-embedded.mjs`，将 H5 和审核页面压缩后拆分为 JavaScript 模块上传。预压缩响应必须使用 `encodeBody: 'manual'`，否则运行时会再次压缩，浏览器无法显示页面。正常 Wrangler 部署使用上面的 Static Assets 配置，两者调用同一份 API。

`yinghuo-h5-sg-stage` 当前承担原 AI 密钥的中转。不要对该 Worker 执行普通生产部署。它存在未启用的临时上传版本；Cloudflare 的 `inherit` 仅能实际继承最新上传版本的绑定，不能从当前服务版本取回旧密钥。

新版本需保留 `SESSION_SECRET` 和 `SUPABASE_EDGE_SHARED_SECRET`，避免原账号失去登录或数据库连接。通过版本 API 上传时设置 `bindings_inherit=strict`，检查返回的绑定列表后再调整流量。回滚仅切换 Worker 版本，数据库迁移保持向后兼容。

## 找回、数据与审核

- 状态加载调用 `yinghuo_get_app_state`，一次数据库请求返回空间、记忆和所需消息。
- 找回使用萤火号和安全恢复码；开启 `mergeGuest` 时在事务中合并临时账号数据并撤销临时登录。
- 手机号未经过短信验证，页面始终明确显示「未验证」，不作为恢复凭证。
- 清空当前对话调用事务 RPC，开启新轮次；旧消息保留在账号导出中，不再进入模型上下文。
- 单个人物删除会清除该人物内容与头像；永久删除账号保留明确的二次确认。
- `/account/export` 每次读取 500 条并继续翻页，包含头像、称呼设置、授权、反馈和历史消息。
- 网页导出额外包含本机未提交草稿；合并遇到同名草稿时保留两个版本。删除人物或账号也会清除对应的本机草稿。
- 公开申请先进入审核队列，含联系方式或链接的内容自动退回并给出原因。
- 管理入口为 `/admin`，使用 `ADMIN_REVIEW_TOKEN`，口令仅在当前标签页保存。审核通过才会出现在公开广场，退回理由会回显给作者。

可使用 `YINGHUO_ADMIN_TOKEN` 环境变量运行 `python tests/production-smoke.py` 做独立账号验证。脚本仅创建合成数据并在结束时删除自己的测试账号，不读取现有浏览器登录。
