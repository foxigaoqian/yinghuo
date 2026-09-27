# Cloudflare H5 在线演示

## 地址与构建

- Pages 项目：yinghuo-h5-preview
- 地址：https://yinghuo-h5-preview.pages.dev
- 来源：GitHub main；推送后自动构建。
- 构建命令：corepack enable && corepack prepare pnpm@11.19.0 --activate && pnpm install --frozen-lockfile && pnpm --filter @yinghuo/contracts build && pnpm --filter @yinghuo/client build:h5
- 产物目录：apps/client/dist/build/h5
- Pages Functions：functions/api/v1/[[path]].js，处理同域 /api/v1/\*
- Pages Functions 绑定：DEMO_DATA，连接单独的 KV namespace yinghuo-h5-preview-demo；AI，绑定 Workers AI（见根目录 wrangler.jsonc）

## 演示数据

首页点「为 TA 建立记忆空间」即创建临时访客会话；安全 Cookie 只保存随机会话编号，人物资料、记忆、对话和自己提交的故事暂存于 KV，每次保存起约 24 小时后过期。退出演示账号会删除对应数据。请只用虚构资料测试；该项目没有接入 Supabase 正式账户、短信、图片修复或支付。对话在 Cloudflare Workers AI 绑定可用后调用真实模型。

建档分三步；第三步填写的故事保存为第一条私密记忆，进入 TA 的空间后可直接看到。新用户可以继续添加文字记忆，在「广场」阅读明确标记为虚构的示例故事，或写仅自己可见的故事。全站不展示开发横条或全局处理提示，初次加载显示不跳动的骨架。模型绑定可用时，对话是 TA 空间的主入口；用户需明确同意将本次对话及自行选择的记忆发送给模型，系统不会让 AI 冒充 TA。每个体验账号最多 12 轮对话；模型失败不存储虚假回复。价格页展示拟定的 ¥99／年权益，不展示购买按钮。广场不接受公开投稿。

## 本地检查

1. 运行 pnpm --filter @yinghuo/contracts build
2. 运行 node --test tests/cloudflare-preview-api.test.cjs
3. 运行 pnpm --filter @yinghuo/client typecheck

线上核对：GET /api/v1/health、首页无开发提示和空态闪现、首页建档后三步填写、第一条私密记忆、添加记忆、私密故事写入「广场 · 我的」、普通用户路径无模拟对话/订单入口、价格页无支付按钮，以及刷新后草稿与已有内容的恢复。正式上线前应以 Supabase 数据层和正式 API 替换该预览接口，并单独验收正式账号、支付、隐私与媒体功能。
