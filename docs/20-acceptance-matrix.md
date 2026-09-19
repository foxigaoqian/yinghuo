# 首发验收与文档一致性

V1.1。此文件定义可执行测试的输入和期望，不代表业务代码或真实支付已经通过测试。

## 1. 文档校验

```sh
python -m pip install -r tools/spec-requirements.txt
python tools/check_specs.py
```

检查：OpenAPI可解析、内部引用可解析、operationId唯一、路径参数齐全；A/B页面引用的方法/路径存在；受保护API不能意外匿名；后台使用adminCookie/scope；写请求有幂等与CSRF；Webhook声明签名验证；迁移引用表存在；AI和验收样例ID唯一。生成research/v1-traceability.json供逐页评审。可通过--check检查生成结果未过期。

静态检查不能证明业务正确、数据库可恢复、页面好用或支付账号获批。README和验收记录必须区分这些状态。

## 2. 业务测试输入

[acceptance-cases.json](research/acceptance-cases.json)每项包含phase、given、when、then、layer。测试人员可直接把fixture与操作转成API/数据库/端到端测试。虚构账号A/B/C，TA甲/乙；每次使用隔离数据库，不向真实用户发送短信或消息。

| 分组 | 最重要通过条件 | 阶段 |
|---|---|---|
| 账号/私有数据 | 切账号不能读前一用户缓存；同TA的owner不能看别人私聊 | A |
| 记忆/聊天 | 更正用新版；撤权停止在途输出；刷新不产生重复消息 | A |
| 上传/数据权利 | 容量并发不超额；导出下载重验权；删除恢复后不复活 | A |
| 协作 | 同时接受最后一个名额只成功一个；角色修改不越权 | B |
| 支付/退款 | 回跳不算成功；重复/乱序Webhook只发一次；退款成功才冲正 | B |
| 任务 | 供应商超时先查询；旧租约不得交付；仅补缺失输出 | B |
| 后台 | 客服不能退款；操作有原因和审计；对账差异可追踪 | A/B |
| 真实通道 | 每个启用通道完成真实支付、退款、查单、对账和移动端矩阵 | B |

## 3. 数据库启动验证

仅在全新测试库按0001、0002顺序执行；这不是已有线上库升级脚本。未来任何已发布迁移不得直接改写，另写递增迁移。

```sh
psql "$SPEC_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/migrations/0001_baseline.sql
psql "$SPEC_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/migrations/0002_v1_gaps.sql
```

SPEC_TEST_DATABASE_URL只能指向隔离测试库。安装后检查约束、触发器/业务事务、并发锁、回滚和删除墓碑恢复。0002对新列SET NOT NULL基于空库成立；有数据的库须单独回填方案，不能直接套用。

Worker领取任务：FOR UPDATE SKIP LOCKED→lease_until/owner/fencing_token+1→提交→调用供应商；心跳延期必须匹配owner与token。交付事务重新校验token/授权/epoch并写唯一(task_id,delivery_index)；旧Worker即使后来成功，也不能覆盖新结果。

## 4. CI实施要求

文档PR跑check_specs --check。应用PR在此基础上运行锁文件安装、类型检查、迁移空库执行、权限与交易集成测试、H5构建、核心流程E2E。暂未存在应用工程，不增加假成功的应用CI。

结果记录：commit、运行环境、caseId、pass/fail、traceId/截图、执行人、时间；不能只勾选“已测”。候选模型未验收、正式通道未开或外部条款未签署时，对应功能保持关闭，允许A内测继续。

## 5. 本次文档验证记录（2026-09-19）

OpenAPI 3.0规范校验、内部引用、首发页面映射、鉴权/CSRF声明与PostgreSQL SQL语法解析通过；115个接口操作、39个首发页面/运营简版、58张表。迁移文件尚未在PostgreSQL实例执行，权限/交易/移动端/模型/真实支付用例均未运行；这些是后续工程验收，不写成已经通过。
