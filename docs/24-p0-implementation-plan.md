# P0 开发实施计划 · V1.2

版本：2026-09-23

本文件把 21–23 的产品体验基线、12 的 OpenAPI V1.2 和 0003 Guest-first 迁移转成可直接开发的 P0 工作包。目标不是一次做完整产品，而是先完成一个真正可用的纵向闭环：

> 首次访问自动匿名身份 → 3 步创建 TA → 第一次聊天 → AI 提出候选记忆 → 用户确认 → 刷新/第二次回来仍能找到 → 绑定手机号 → 换设备恢复。

## 1. P0 完成标准

P0 完成后，测试用户不看教程也能在 2 分钟内创建第一个 TA 并发出第一条消息。用户不绑定手机号也能完成核心体验；产生内容后可以用手机号保护和找回。AI 不得把未确认推断当作真实记忆。

P0 不以声音复刻、照片动态化、视频、公开社区、复杂会员或正式支付为完成条件。

## 2. 工作包

| ID | 工作包 | 依赖 | 完成条件 |
|---|---|---|---|
| P0-01 | 工程骨架 | 无 | apps/client、apps/server、共享 contracts；H5 可启动；dev/staging 环境分离 |
| P0-02 | Guest-first 会话 | P0-01 | POST /auth/guest 幂等建立/复用匿名 User + HttpOnly Session；familyCode 只展示不认证 |
| P0-03 | 数据迁移 0003 | P0-01 | account_kind、family_code、merge target、recovery ticket、draft 表可在全新测试库执行 |
| P0-04 | Bootstrap 状态 | P0-02 | 返回 accountState、boundPhone、personCount、recentProfileId、recentConversationId、pendingTaskCount |
| P0-05 | 3 步创建 TA | P0-02 | 关系 → TA 称呼 → TA 如何称呼用户；第三步直接进入聊天；草稿可恢复 |
| P0-06 | 文本聊天 | P0-05 | 一人一 TA 私有主对话；消息幂等；断线恢复；刷新不重复发消息 |
| P0-07 | 候选记忆 | P0-06 | 模型只能创建 memory_candidates；确认后才生成/更新 confirmed memory；拒绝后不可检索 |
| P0-08 | 新用户/回访首页 | P0-05,P0-06 | 新用户显示创建；已有 TA 直接显示最近 TA 和“继续聊聊”；未完成状态可恢复 |
| P0-09 | 我的家庭空间 | P0-05,P0-07 | 显示人物、记忆计数、最近动作、数据保护入口；不做传统账户字段中心 |
| P0-10 | 手机号保护/找回 | P0-02,P0-03 | protect_records 绑定到当前 guest User；recover_account 可恢复旧 User；有 guest 资产时显式 merge |
| P0-11 | 草稿与异常恢复 | P0-05,P0-06 | 创建/故事/聊天输入刷新和切后台可恢复；断网、发送失败不清空 |
| P0-12 | 微信环境引导 | P0-08 | 微信内首次显示可关闭的“右上角…→浏览器打开”；关闭后不重复强弹 |
| P0-13 | 隐私与删除 | P0-07,P0-09 | 上传/记忆就地说明用途；删除单条记忆；删除 TA 高风险二次确认 |
| P0-14 | E2E 验收 | 全部 | UX01–UX14 中与 P0 相关用例通过；普通移动浏览器 + 微信内置浏览器都跑通 |

## 3. 后端实现顺序

### 3.1 POST /auth/guest

规则：

- 当前已有有效 Session：返回 200，复用当前用户，不新建 User。
- 没有 Session：事务内创建 app_users(account_kind=guest) + guest identity（可选）+ session，返回 201。
- familyCode 由服务端生成并保证唯一；它不是密码。
- Cookie 使用 HttpOnly、Secure、SameSite=Lax 或更严格设置。
- 频控按 IP/设备风险信号做滥用控制，不影响普通首次访问。

### 3.2 手机号绑定

purpose=protect_records：

- 当前必须已有 guest/bound Session。
- 手机号未绑定其他用户：绑定到当前 user_id，account_kind→bound。
- 手机号已属于当前 user：幂等返回。
- 手机号已属于其他 user：返回 merge_required，不自动切换账号。

purpose=recover_account：

- 手机号验证后若当前 guest 没有需要保留的业务资产，可显式恢复旧账号。
- 当前 guest 已有 TA、记忆、聊天、订单等资产时，返回 mergeTicket，要求用户确认合并。

### 3.3 合并事务

POST /auth/recovery/merge：

1. 校验 mergeTicket、有效期、guestUser、targetUser。
2. 锁 guest 与 target User。
3. 再检查 ticket 未消费。
4. 按允许范围迁移/合并 guest 资源。
5. 避免 profile/member/identity 唯一键冲突。
6. 订单、退款、支付流水不得“复制”；只能迁移归属或建立明确引用。
7. 撤销 guest 全部 Session。
8. guest account_kind→merged，merged_into_user_id=target。
9. 消费 ticket。
10. 写 audit_logs。
11. 为 target 建立新 Session。

## 4. 前端页面最小集合

P0 不需要一次实现 52 页。第一轮只需要以下真实页面/状态：

1. 首页：新用户态 / 回访态
2. 创建 TA Step 1
3. 创建 TA Step 2
4. 创建 TA Step 3
5. 聊天页
6. 候选记忆确认卡（聊天内组件）
7. 记忆列表
8. 添加一段记忆
9. 我的家庭空间
10. 保护记录 / 手机号绑定
11. 找回家庭空间
12. 合并确认
13. 隐私/删除确认
14. 微信环境提示层

这些页面可以继续沿用原 P 编号映射，但产品验收以 21–23 的结构为准。

## 5. 前端状态

建议最小状态字段：

- sessionReady
- accountState: guest | bound
- boundPhone
- activeProfileId
- recentProfileId
- recentConversationId
- profileCreateDraft
- chatDraftByConversation
- pendingMemoryCandidates
- wechatGuideDismissed
- offline
- pendingRequestIds

Pinia/本地存储只保存必要 UI 状态和草稿，不把完整私聊长期明文缓存为权威数据。

## 6. 记忆写入规则

### 手动记忆

用户主动点击“留下这段记忆”或新增记忆页提交，可直接创建 confirmed memory。

### AI 候选

聊天模型输出不得直接 POST /memories。正确链路：

message completed → candidate extractor → memory_candidates(suggested) → 前端卡片 → confirm/reject → confirmed memory / rejected candidate。

检索层必须过滤：

- confirmation_state != confirmed
- revoked use_for_ai
- 不属于当前 profile/user 可见范围
- 已删除或旧版本
- 过期/撤权素材

## 7. 草稿恢复

第一版至少做到：

- 创建 TA 每一步自动保存草稿。
- 聊天输入 500ms–1s debounce 本地保存。
- 手动故事长文本自动保存。
- 页面刷新后优先恢复草稿，并显示“已恢复你刚才写的内容”。
- 成功提交后清理对应草稿。
- 用户切换账户/恢复旧账户时，禁止把 A 用户草稿自动带入 B 用户。

0003 提供 user_drafts 服务端表，是否在 P0 第一周启用跨端草稿由实现复杂度决定；本地恢复是最低验收线。

## 8. 微信环境

客户端识别微信 WebView，仅用于体验提示，不作为安全授权依据。

首次满足以下条件时显示：

- isWeChat = true
- 不是桌面/PWA模式
- 本设备未关闭过提示

内容：

> 点击右上角 ···  
> 选择「在浏览器打开」  
> 之后可以添加到手机桌面，想起 TA 的时候直接回来。

必须支持手动关闭；自动消失；本设备记住关闭状态。

## 9. P0 测试矩阵

| Case | 操作 | 必须结果 |
|---|---|---|
| P0-E2E-01 | 新浏览器打开 | 自动 guest，不弹手机号 |
| P0-E2E-02 | 创建到第 2 步刷新 | 已填内容恢复 |
| P0-E2E-03 | 完成 3 步 | 直接进入聊天 |
| P0-E2E-04 | 发消息后刷新 | 不重复用户消息/助手消息 |
| P0-E2E-05 | 模型识别记忆 | 只出现 suggested candidate |
| P0-E2E-06 | 不确认候选后继续聊天 | 该候选不可作为事实检索 |
| P0-E2E-07 | 确认候选 | 记忆中心可见并参与后续检索 |
| P0-E2E-08 | 第二天回来 | 直接显示最近 TA/继续聊天 |
| P0-E2E-09 | guest 绑定新手机号 | 数据不迁移、不丢失，user_id 保持 |
| P0-E2E-10 | guest + 已有手机号 | 出现 merge_required，不静默覆盖 |
| P0-E2E-11 | 合并后旧 guest cookie | 不再可继续写入 |
| P0-E2E-12 | 微信内打开 | 指引可关闭且不重复骚扰 |
| P0-E2E-13 | 网络断开写长文本 | 输入保留 |
| P0-E2E-14 | 删除一条记忆 | 后续检索不再使用 |
| P0-E2E-15 | A 用户访问 B profile | 404/拒绝且不泄露对象详情 |

## 10. 本阶段不要做

- 不做公开社区首页。
- 不做声音年费。
- 不做视频通话/数字人视频。
- 不做复杂代理/返佣。
- 不做微信聊天记录自动导入。
- 不做十几个字段的人物资料页作为首次门槛。
- 不因为支付尚未接通而阻塞文字记录闭环。
- 不以 mock 固定回复冒充模型已经接通。

## 11. 第一个可演示版本

当以下路径真实跑通时，才算“第一版可以给人体验”：

> 新用户微信打开 → 关闭/按提示去浏览器 → 自动 guest → 创建妈妈 → 开始聊天 → 用户说“妈妈以前总问我吃饭没” → AI 提议保存这段记忆 → 用户确认 → 返回首页 → 刷新/第二天回来 → 继续和妈妈聊 → 看到系统正确使用刚才确认过的记忆。

这条路径比先做 30 个页面更重要。
