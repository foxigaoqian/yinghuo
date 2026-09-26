# Cloudflare H5 在线演示

## 地址与构建

- Pages 项目：yinghuo-h5-preview
- 地址：https://yinghuo-h5-preview.pages.dev
- 来源：GitHub main；推送后自动构建。
- 构建命令：corepack enable && corepack prepare pnpm@11.19.0 --activate && pnpm install --frozen-lockfile && pnpm --filter @yinghuo/contracts build && pnpm --filter @yinghuo/client build:h5
- 产物目录：apps/client/dist/build/h5
- Pages Functions：functions/api/v1/[[path]].js，处理同域 /api/v1/\*
- Pages Functions 绑定：DEMO_DATA，连接单独的 KV namespace yinghuo-h5-preview-demo

## 演示数据

登录按钮创建独立访客会话；安全 Cookie 只保存随机会话编号，人物资料、记忆、对话、订单和自己提交的故事暂存于 KV，每次保存起 24 小时后过期。退出演示账号会删除对应数据。请只用虚构资料测试；该项目没有接入 Supabase 正式账户、短信、真实模型、图片修复或支付。

对话回复明确标识为模拟生成。订单只可执行模拟支付和退款，不会创建支付链接或真实权益。广场的公开投稿只进入「待审核」，不会自动出现在公共内容流。

## 本地检查

1. 运行 pnpm --filter @yinghuo/contracts build
2. 运行 node --test tests/cloudflare-preview-api.test.cjs
3. 运行 pnpm --filter @yinghuo/client typecheck

线上核对：GET /api/v1/health、首页无连接错误、创建 TA、发送演示消息、价格页模拟下单、订单状态变化。正式上线前应以 Supabase 数据层和正式 API 替换该预览接口，并单独验收支付与隐私流程。
