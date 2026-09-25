# Supabase 项目接入说明

更新时间：2026-09-25

## 当前结论

Supabase 项目地址已提供，但当前工程**还没有真正连到 Supabase**：API 读写的是本地 JSON 演示存储，会话也是演示实现；`SUPABASE_URL`、`SUPABASE_SECRET_KEY`、`DATABASE_URL` 目前没有被业务代码消费。填写这些变量不会自动启用数据库，也不能用于生产。

工程里有 `infra/migrations/0001_baseline.sql`、`0002_v1_gaps.sql` 和一个只映射 `app_users`、`profiles` 的 Prisma 子集。现有子集明确不是完整数据库模型，禁止对 Supabase 项目运行 `prisma db push`。当前也无法确认目标 Supabase 项目已有的表、迁移记录和 Storage 桶，因此暂不对目标项目执行迁移或写入。

## 凭据安全处理

刚才发在聊天里的旧式 Supabase `service_role` 密钥应视为已泄露。请在 Supabase Dashboard 的 **Settings → API Keys** 中创建新的 `sb_secret_...` 密钥；如有服务正在使用旧密钥，先将它们迁移到新密钥，再停用泄露的 legacy `service_role` key，并确认旧密钥已失效。若没有任何服务依赖它，可以尽快停用。不要把替换后的密钥发到聊天或提交到 GitHub。Supabase 新式 publishable/secret key 可以独立轮换；旧 `service_role` 与 secret key 都拥有绕过 RLS 的高权限。见[API key 迁移说明](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)和[泄露密钥轮换步骤](https://supabase.com/docs/guides/getting-started/api-keys#rotate-a-leaked-or-compromised-key)。

Supabase 计划在 2026 年底弃用旧式 `anon` / `service_role` key；新接入直接使用 publishable/secret key。

`service_role` / `sb_secret_...` 是 Supabase API 的服务端密钥，**不是 PostgreSQL 数据库密码，也不是 `DATABASE_URL`**。Prisma 连接数据库要用 Dashboard **Connect** 面板生成的 PostgreSQL 连接字符串及数据库密码。H5 不能包含数据库连接串或任何 secret key。

## 本 MVP 推荐的连接结构

```text
H5 浏览器 → 萤火 API → Supabase PostgreSQL
                         └→ 私有 Storage（通过服务端签名 URL）
```

- 保留现有萤火 API 作为唯一业务入口。手机号登录和 HttpOnly 会话仍由萤火服务端校验；每个请求从已验证会话取得用户身份，再按家庭成员关系和资源归属查询数据库。
- PostgreSQL 连接串只配置在 API/Worker 的服务端运行环境。长期运行的 API 优先使用 direct connection；若部署环境只有 IPv4 且项目没有 IPv4 add-on，使用 Session Pooler。Prisma 迁移使用单独的 direct connection。不要自行拼接 host、端口或用户名，以 Dashboard Connect 面板给出的连接串为准。
- 照片、音频和视频存放在私有 Storage 桶。浏览器通过 API 获取短时签名上传/下载地址；不公开桶，不把服务端密钥发给 H5。
- V1 暂不让 H5 直接查询 Supabase Data API。若以后要这么做，须先接 Supabase Auth 或可靠身份映射、开启 RLS、编写并测试逐表策略和 Storage policies，再向 H5 提供 publishable key。公开 key 本身可出现在客户端，但它不能代替鉴权和 RLS。
- RLS 对经 Data API 暴露的表必须明确开启并配置策略。Supabase 的 `service_role`/secret key 会绕过 RLS；不能把它用作普通用户请求的访问控制。API 服务也必须对每个查询执行用户/家庭范围校验，不能只依赖前端传来的 `userId` 或 `profileId`。见[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 配置项含义

仓库 `.env.example` 只保留空值。实际密钥、密码仅放在本地忽略文件 `.env` 或部署平台密钥管理中。

| 环境变量                   | 用途                                                       | 当前工程状态                               |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `SUPABASE_URL`             | Supabase 项目 API URL                                      | 预留，当前未使用                           |
| `SUPABASE_PUBLISHABLE_KEY` | 仅当明确启用浏览器端 Supabase API 且有 Auth/RLS 设计时使用 | 预留，当前未使用                           |
| `SUPABASE_SECRET_KEY`      | 服务端调用 Supabase API（例如受控 Storage 操作）           | 预留，当前未使用；高权限、绕过 RLS         |
| `DATABASE_URL`             | API 的 PostgreSQL 运行时连接                               | 当前未使用；按 Connect 面板选择合适 pooler |
| `DIRECT_URL`               | Prisma 迁移/管理用直连 PostgreSQL                          | 当前未使用；只供受控迁移任务使用           |
| `SUPABASE_STORAGE_BUCKET`  | 私有媒体桶名称                                             | 预留，当前未使用                           |

示意配置（不要提交真实值）：

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
DATABASE_URL=
DIRECT_URL=
SUPABASE_STORAGE_BUCKET=private-memories
```

注意：数据库连接字符串中的数据库密码需要正确 URL 编码。不要使用 service-role key 代替数据库密码。

## 推荐接入步骤

1. **先轮换刚才暴露的密钥**，并确认旧密钥已失效。新密钥保存在本地 `.env` /部署密钥管理器，不回贴到聊天。
2. 在 Supabase Dashboard 的 **Connect** 面板复制 PostgreSQL 连接信息：运行中的 API 优先用 direct connection；IPv4-only 环境使用 Session Pooler（端口 5432）；Prisma 迁移单独用 direct connection。分别填到受控环境的 `DATABASE_URL`、`DIRECT_URL`。特殊字符密码须 URL encode。参考[数据库连接说明](https://supabase.com/docs/guides/database/connecting-to-postgres)。
3. 先只读检查目标项目当前 schema、迁移记录、RLS、Storage bucket 和项目地区/网络连通性。将现有线上 schema 与仓库 `0001`、`0002` 做差异比较；有数据时先备份并制定回滚步骤。
4. 将迁移整理成 Supabase CLI 管理的版本化迁移，明确这是“空库初始化”还是“已有项目增量迁移”。先在 Supabase development branch 或独立测试项目应用，再跑 schema、RLS、Storage 与数据隔离检查。
5. 补齐完整 Prisma schema / repository，把 `DemoStore` 和 mock session 替换为 PostgreSQL 实现；所有查询由服务端会话推导用户 ID，并强制校验 TA/家庭成员关系。演示模式继续保留，避免开发期间误连生产库。
6. 建立私有 Storage bucket、大小/MIME 限制、短时签名上传下载、删除流程和孤儿文件清理；验证未授权用户无法读写别人的对象。
7. 增加 staging 环境集成测试、迁移前后备份、恢复演练、日志脱敏和最小权限配置。通过验收后再配置生产环境。

## 本次尚未实施的原因

当前连接器对这个 Supabase 项目没有访问权限，无法读取现有 schema/迁移或安全设置；当前本地服务也被明确限制为 LOCAL DEMO ONLY。因此现在安全可做的是记录接入设计和修正环境变量说明，不能把密钥写入工程、不能假设目标库为空，也不应直接应用迁移。要继续检查 live schema，请在 Supabase 集成中为当前工作区授权访问该项目；无需提供任何密钥。

## 接入验收清单

- [ ] 已轮换聊天中暴露的旧密钥，旧密钥确认失效。
- [ ] staging / production 使用不同数据库凭据、对象桶与供应商凭据。
- [ ] `DATABASE_URL` 和 `DIRECT_URL` 来自 Connect 面板且通过连接检查；没有将 key 当作数据库密码。
- [ ] 迁移已在空库或 development branch 验证，且与目标现有 schema 做过差异比较。
- [ ] 业务表 RLS/授权策略按实际访问路径配置并测试；服务端每个读写也执行所有权/成员校验。
- [ ] Storage 为 private；跨用户读取、上传、删除均通过拒绝测试。
- [ ] 生产 API 不再使用 DemoStore；生产启动检查拒绝 mock provider 和本地 JSON 存储。
- [ ] 备份可恢复、日志不记录凭据/完整家庭素材、账号删除和数据导出流程完成验收。
