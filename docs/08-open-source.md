# GitHub开源复用调研与采用建议

核对日期：2026-09-18。证据为仓库README、许可证、package.json与默认分支提交记录。**本轮未安装、启动、压测这些项目，不将文档审阅等同于可直接上线。** 提交快照见[原始元数据摘要](research/open-source-snapshot.json)。

## 1. 结论

本轮核对的项目中，没有一个已被验证能直接覆盖“国内H5/小程序、家庭记忆权限、微信支付、试听、权益与售后”的完整萤火流程。建议复用跨端模板、UI组件、后端框架和队列，自建核心业务模型。数字人项目用于评估局部能力，避免为删掉其桌面/Live2D/训练工作流付出更大成本。

优先组合：**unibest + Wot UI + NestJS + PostgreSQL，收费任务加入BullMQ，记忆扩大后加入pgvector；后台评估Vben的单个应用。** 声音和影像首发走服务端供应商适配器。此为针对三人团队、其中一人负责研发的产品工程判断。

## 2. 核对结果

日期是核对时默认分支最近一次提交的UTC日期，不是发布版本日期；最近提交可能仅改文档。不能以star多或“最近推送”代替兼容性和质量验证。

| 项目与一手来源 | 最近提交 | 许可口径 | 能复用什么 | 萤火判断 |
|---|---|---|---|---|
| [feige996/unibest](https://github.com/feige996/unibest) | 2026-09-15 | MIT | uni-app/Vue3/TS工程、请求与路由基础 | **用户端首选候选**；先验证两端构建 |
| [Moonofweisheng/wot-design-uni](https://github.com/Moonofweisheng/wot-design-uni) | 2026-08-13 | MIT | 跨端表单、弹层、上传等组件 | **采用候选**；重做主题与业务聊天组件 |
| [nestjs/typescript-starter](https://github.com/nestjs/typescript-starter) | 2026-09-16 | package.json声明MIT；框架MIT | TypeScript后端工程与基础测试配置 | **后端起点**；订单/权限均需自建 |
| [vbenjs/vue-vben-admin](https://github.com/vbenjs/vue-vben-admin) | 2026-09-18 | MIT | 后台布局、表格、表单与权限展示 | **后台候选**；只取一个应用及必需包 |
| [taskforcesh/bullmq](https://github.com/taskforcesh/bullmq) | 2026-09-18 | MIT核心 | 异步调度、重试、并发控制 | **收费任务采用**；不代替业务账本 |
| [pgvector/pgvector](https://github.com/pgvector/pgvector) | 2026-09-08 | PostgreSQL许可文本 | 同库向量检索 | **规模增长后采用**；先做权限正确性 |
| [NervJS/taro](https://github.com/NervJS/taro) | 2026-08-31 | MIT主体及第三方说明 | React/Vue跨端方案 | **替代路线**；团队若熟React再做同等小样验证 |
| [langgenius/dify](https://github.com/langgenius/dify) | 2026-09-18 | 修改版Apache-2.0，附额外条件 | 内部Prompt/RAG工作流试验 | **暂不作主后端**；具体部署先核许可条件 |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | 2026-09-18 | Apache-2.0开源代码 | 记忆提取/检索思路与SDK | **参考/后续评测**；不能自动写入未经确认事实 |
| [RVC-Boss/GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) | 2026-08-18 | 仓库代码MIT | 声音模型与自部署推理评估 | **后续自部署候选**；权重/依赖另核，不是现成SaaS |
| [xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | 2024-04-02 | BSD-3-Clause代码 | 图像增强推理 | **离线对照候选**；维护间隔较长，先测依赖和样片 |
| [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) | 2026-05-15 | MIT代码；Live2D示例另许可 | 语音交互适配思路 | **不整套采用**；README说明规划v2重写，v1修bug |
| [Mindverse/Second-Me](https://github.com/Mindverse/Second-Me) | 2025-09-19 | Apache-2.0 | 本地记忆与AI self原型 | **研究参考**；与轻量家庭云产品实施方向不同 |

全部上述仓库在本次API元数据中均未标记archived；这不代表都活跃维护。许可证名称核对到代码仓库层，不包含所有模型权重、素材、云服务或商业扩展的授权。

## 3. 可直接省下哪些工作

### 用户端：unibest + Wot UI

unibest提供H5和小程序开发/构建脚本。旧`unibest-tech/unibest`地址此次返回迁移，当前API指向`feige996/unibest`、默认分支`base`；不要继续跟旧地址或旧教程。README与package.json的环境要求存在时间差，以固定提交的package.json和实际CI为准。[固定提交](https://github.com/feige996/unibest/commit/dc3af8ddb99b78fa806078c80434b664a4b1ce93)

此次package.json为4.4.1，声明Node>=20、pnpm>=9、packageManager pnpm10.10.0；这只是审阅快照，不是要求以后永远锁旧依赖。`base`并未列出Wot依赖，不假定模板生成后已经带好组件，须选对应模板或显式安装兼容版本。[包配置](https://github.com/feige996/unibest/blob/dc3af8ddb99b78fa806078c80434b664a4b1ce93/package.json)

保留路由、请求层和工程工具；删除示例业务与无关平台依赖。自建TA卡片、聊天气泡、记忆时间线、声音试听、价格及交付组件。Wot组件只作基础，不沿用默认科技蓝；按萤火磨砂配色覆写主题。[Wot说明](https://github.com/Moonofweisheng/wot-design-uni)

### 后端：NestJS

用官方starter了解工程入口，实际业务通过CLI/最小骨架建立；不会把示例项目说成带用户系统和微信支付。此次starter已经是Nest12、ESM与Vitest相关配置，不沿用旧教程的版本假设。其仓库元数据license为null，但package.json声明MIT，框架仓库有MIT许可；若直接复制starter代码需补核完整许可文件与版权归属。[starter配置](https://github.com/nestjs/typescript-starter/blob/102b0391f8ada7df804288e64b12738275170e95/package.json)、[框架许可](https://github.com/nestjs/nest/blob/master/LICENSE)

### 后台：Vben

Vben是前端后台工程，不提供萤火的服务端RBAC、真实订单或退款能力。先选一个应用，保留登录布局/表格/表单及依赖的workspace包；不能只复制apps目录后假定能运行，也不把整个多应用工程塞进用户端。[仓库](https://github.com/vbenjs/vue-vben-admin)

当前包配置要求Node `^22.18.0 || ^24.12.0`、pnpm>=11，与unibest的锁文件不同。先独立构建验证，再统一工作区工具链或保留独立锁文件；不直接运行模板的升级全部依赖命令。[包配置](https://github.com/vbenjs/vue-vben-admin/blob/7823b1269b99f5c64536377964f8092108ec149e/package.json)

## 4. AI整套项目为什么暂不采用

Dify可商用作后端的范围与额外条件应看许可证原文：多租户条件以其workspace定义，并有前端标识限制。不能简单说“所有商用都收费”，也不能当作完全无额外条件的Apache-2.0。萤火可用其内部环境试Prompt，但不因此把家庭数据权限、订单和删除生命周期迁入它。[许可原文](https://github.com/langgenius/dify/blob/main/LICENSE)

Mem0的当前README区分托管平台评测与开源SDK，不能把宣传分数当开源版本在萤火数据上的效果；其自动记忆策略也不等于用户确认的家庭事实。先自建可编辑事实库，必要时用统一测试集比较。[README](https://github.com/mem0ai/mem0)

Open-LLM-VTuber适合研究语音与角色适配；其实时语音、Live2D、桌面角色并非当前萤火需要的交付，README还说明长期记忆当时暂移除。不要把角色互动演示看成家庭记忆平台已完成。[项目说明](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)、[许可](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/blob/main/LICENSE)

Second-Me强调本地训练和托管AI self，这对后续研究有用，但对三人团队首发会增加训练和部署工作；本次只做README与许可审阅，不宣称全面审计了它所有功能。[项目说明](https://github.com/Mindverse/Second-Me)

## 5. 许可与供应链采用步骤

1. 选定具体发布版或提交，记录来源、许可证、改动和必要NOTICE；参考快照不是生产依赖锁。
2. 安装前检查package scripts、postinstall/prepare、示例密钥和外部下载；先在隔离开发环境安装。
3. 执行H5、小程序与后台构建、依赖漏洞检查、最小业务冒烟；保留实际结果再决策。
4. 代码许可、模型权重、演示照片/音频和云API条款分别核对；MIT代码不自动授予所有演示素材使用权。
5. 本轮不复制第三方源码、不自动给萤火选择MIT许可证。下一轮引入时维护`THIRD_PARTY_NOTICES`及锁文件。

## 6. 两天技术小样（工作量建议）

做一个无真实家庭数据的移动端H5小样：普通手机浏览器与微信内置浏览器共用表单 → 录音或上传 → 模拟异步任务 → 断线恢复聊天 → 模拟重复支付回调 → 再次打开读取结果。另验证后台查订单和工单；小程序迁移放到V2，不作为本轮通过条件。

若uni-app跨端音频或消息恢复无法达到要求，再对Taro做同场景比较；不要同时维护两套用户端。没有这个小样，不承诺“复制模板即可上线”或省下某个未经验证的开发百分比。
