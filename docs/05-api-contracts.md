# API契约草案

本文件是实施合同，不是已运行接口。基础路径`/api/v1`。所有受保护接口从会话取得actor；UUID不作为权限凭据。客户端不传用户身份来决定归属。

## 1. 通用规则

- JSON使用camelCase；时间RFC3339 UTC；金额字段`*Fen`为整数；文件容量`*Bytes`为整数。
- 成功返回`{data, traceId}`；列表`data={items,nextCursor}`，默认20、最多50，稳定按createdAt+id排序。
- 错误返回`{error:{code,message,retryable,fieldErrors?},traceId}`。401登录；404用于无权识别的私人资源；403用于已知功能无权限；409状态/版本冲突；422输入不可用；429临时限流；503服务暂不可用。
- 创建TA、发送消息、下单、申请退款、提交生成、确认上传均需`Idempotency-Key`。相同键相同体返回原结果；不同体返回409 `IDEMPOTENCY_CONFLICT`。建议至少保存24小时；财务结果由订单/交易唯一键长期兜底。
- 更新人物/记忆/帖子传`expectedVersion`；409返回最新version，前端保留草稿，让用户处理差异。
- 客户端不可传最终金额、会员价、套餐有效期、providerVoiceId或任意存储objectKey决定业务。

## 2. 全模块接口目录

下列路径均相对`/api/v1`。`{id}`为相应对象ID；各写接口应采用以上幂等/版本规则。

| 域 | 接口 | 核心输入/返回 |
|---|---|---|
| 公共 | GET /bootstrap；GET /home；GET /legal/{type} | 能力开关、当前商品版本/协议版本、首页状态 |
| 登录 | POST /auth/otp；POST /auth/otp/verify | phone+purpose；challengeId+code，建立会话 |
| 平台身份 | POST /auth/wechat；POST /auth/identities/link | code/appId/channel；经验证绑定，冲突显式返回 |
| 会话 | POST /auth/refresh；POST /auth/logout；GET /me/sessions；DELETE /me/sessions/{id} | 轮换、撤销本人会话 |
| 账号 | GET/PATCH /me | 个人昵称/公开简介/时区/字号；手机号变更另验证 |
| 人物 | GET/POST /profiles；GET/PATCH /profiles/{id} | 称呼、可选关系；返回draft/active及capabilities |
| 个人设置 | GET/PATCH /profiles/{id}/preferences | callMe/replyLength/voiceEnabled，不改共享资料 |
| 成员 | GET /profiles/{id}/members；PATCH/DELETE /profiles/{id}/members/{userId} | role/expectedVersion；不允许移除最后owner |
| 邀请 | POST /profiles/{id}/invitations；GET /invitations/{token}；POST /invitations/{token}/accept；DELETE /invitations/{id} | 邀请预览最小信息；接受需登录；撤销需owner |
| 记忆 | GET/POST /profiles/{id}/memories；GET/PATCH/DELETE /memories/{id} | type/body/visibility/useForAi/assetIds；确认后版本化 |
| 候选 | GET /profiles/{id}/memory-candidates；POST /memory-candidates/{id}/confirm；POST /memory-candidates/{id}/reject | 用户确认文本与范围，不采用模型自动事实 |
| 文件 | POST /uploads；POST /uploads/{id}/complete；GET /assets/{id}/access | purpose/profileId/size/mime；返回短时上传参数；完成后返回assetId |
| 对话 | POST /profiles/{id}/conversation；GET /conversations/{id}/messages | 幂等取得本人主对话；cursor与搜索query |
| 发送 | POST /conversations/{id}/messages；GET /generations/{id} | clientMessageId+kind+text/assetId；返回generationId与消息ID |
| 生成事件 | GET /generations/{id}/events?afterSeq=n | H5可用SSE；JSON轮询为跨端基线，同一seq协议 |
| 消息恢复 | POST /generations/{id}/retry；POST /generations/{id}/cancel | 只有失败/取消可重试；正在处理返回原状态 |
| 清空 | POST /conversations/{id}/clear | expectedEpoch，取消未完成生成并更新epoch |
| 声音 | POST /profiles/{id}/voice-trials；GET /voice-profiles/{id}；POST /voice-profiles/{id}/revision | assetIds+consentId；检查资格、素材与修正次数 |
| 声音管理 | DELETE /voice-profiles/{id}；GET /voice-profiles/{id}/works | 撤销与删除任务；只返回本人权限内结果 |
| 留声作品 | POST /work-packages/{id}/slots/{slotNo}/generate | text/voiceProfileId/inputRevision；成功交付才扣slot |
| 工具 | GET /tools；POST /media/preflight | kind+assetIds+settings；返回可交付规格和inputRevision |
| 任务 | GET /tasks/{id}；POST /tasks/{id}/retry | 订单派生生成自动入队，不通过前端“支付成功”启动 |
| 作品 | GET /works；GET /works/{id}；POST /works/{id}/save-to-profile；DELETE /works/{id} | 归属校验；保存TA时检查容量与权限 |
| 商品 | GET /products；GET /products/{code} | 生效版本、真实售价、可售状态、适用渠道 |
| 交易 | POST /quotes；POST /orders；POST /orders/{id}/payment | 商品+目标+输入版本→报价；quoteId→订单；渠道→支付参数 |
| 查单 | GET /orders；GET /orders/{id}；POST /orders/{id}/reconcile；POST /orders/{id}/cancel | 订单buyer才可读；reconcile有频控、仅可信渠道查单 |
| 回调 | POST /payments/{channel}/notify；POST /refunds/{channel}/notify | 无用户会话；必须渠道验签、解密、防重放、业务核对 |
| 售后 | POST /orders/{id}/refunds；GET /refunds/{id} | reason/requestFen?/supportingAssetIds；后端核可退额 |
| 权益 | GET /profiles/{id}/entitlements；GET /me/services | 当前能力、到期时间、容量、留声slot；不返回分钟余额 |
| 社区 | GET/POST /posts；GET/PATCH/DELETE /posts/{id}；POST /posts/{id}/publish | 草稿版本、公开副本与授权；已审核版本才可公开 |
| 互动 | GET/POST /posts/{id}/comments；DELETE /comments/{id}；PUT/DELETE /posts/{id}/likes；PUT/DELETE /posts/{id}/favorite | 评论需审核策略；点赞/收藏幂等 |
| 作者 | GET /authors/{id}；PUT/DELETE /authors/{id}/follow；GET /me/favorites | 只读公开信息；撤回内容不从收藏回流 |
| 举报 | POST /reports | targetType/targetId/reason；举报人不公开 |
| 通知 | GET /notifications；POST /notifications/read | 指定ID或可见范围内全部已读 |
| 提醒 | GET/POST /reminders；PATCH/DELETE /reminders/{id}；GET/POST /profiles/{id}/anniversaries；PATCH/DELETE /anniversaries/{id} | timezone/calendar/leapMonth/consent；默认关闭 |
| 数据权利 | GET /me/consents；POST /consents；POST /consents/{id}/revoke；POST /exports；GET /exports；GET /exports/{id} | 授权版本/范围；导出当前有权对象 |
| 删除 | POST /profiles/{id}/deletion-requests；POST /me/deletion-requests；GET /deletion-requests/{id} | 再验证、影响确认；不共用普通PATCH |
| 帮助 | GET /help；POST /support-tickets；GET /support-tickets；GET /support-tickets/{id}；POST /support-tickets/{id}/replies | 本人工单、授权附件；服务器追加状态事件 |

## 3. 关键请求响应示例

### 创建TA

```json
{"displayName":"妈妈","relationship":"mother","callMe":"小雨"}
```

返回201：

```json
{"data":{"id":"<uuid>","status":"active","version":1,"capabilities":{"textChat":true,"familyWrite":false,"voiceMessages":false},"nextPage":"P19"},"traceId":"<trace>"}
```

免费资格用完则创建`draft`并返回`requiresPlan:true`、`nextPage:P38`；前端P07在提交前已通过bootstrap/资格展示这一条件。订单支付后激活该同一draft，不再新建第二个TA。

### 发送消息

```json
{"clientMessageId":"<uuid>","kind":"text","text":"我想记录你做饭的故事","conversationEpoch":1}
```

返回202：

```json
{"data":{"userMessageId":"<uuid>","assistantMessageId":"<uuid>","generationId":"<uuid>","status":"queued","nextSeq":0},"traceId":"<trace>"}
```

事件类型`started/text_delta/audio_ready/completed/failed/cancelled`；每项包含generationId、seq、messageId。断线后用afterSeq续读；事件已过期时返回`SNAPSHOT_REQUIRED`并从GET generation取完整正文，不能靠重新POST消息恢复。

客户端按messageId更新同一气泡，按seq去重。完成正文和状态由后端落库；取消尽力而为，已经发生的供应商费用仍计入成本但不向用户另收分钟费。

### 上传

POST /uploads：`{profileId?,purpose:"memory_original",filename,mimeType,sizeBytes}`，返回uploadSessionId、受限上传参数、expiresAt。客户端上传后POST complete，后端确认对象大小、校验值、格式和归属。返回asset的状态`checking/ready/rejected`；未ready不能用于生成。

### 报价和订单

```json
{"productCode":"memory_year","profileId":"<uuid>","operation":"new","inputRevision":null,"creditSourceIds":[]}
```

服务端返回报价：

```json
{"data":{"quoteId":"<uuid>","productVersion":1,"currency":"CNY","listPriceFen":9900,"discountFen":0,"creditFen":0,"payableFen":9900,"expiresAt":"<RFC3339>","termsVersion":"<version>","specs":{"durationDays":365,"storageBytes":5000000000}},"traceId":"<trace>"}
```

创建订单仅传`{quoteId,acceptedTermsVersion,returnContext:{pageId:"P10",profileId:"<uuid>"}}`，返回orderId、真实应付与状态。支付参数需要`channel`但金额不可更改；渠道不支持返回`CHANNEL_UNAVAILABLE`，不假装支付成功。

### 权益

GET entitlements返回`{profileId,asOf,capabilities,storage:{usedBytes,reservedBytes,limitBytes},plans,voiceBeneficiaryUserId?,workPackages}`。`asOf`用于显示服务器判断时间。前端只能据此决定UI，不把上一次缓存结果当授权。

## 4. 错误码

| code | 页面处理 |
|---|---|
| AUTH_REQUIRED / SESSION_EXPIRED | 登录后回原路；保存草稿 |
| RESOURCE_NOT_FOUND | 私有资源不存在或无权；不透露成员名称 |
| ENTITLEMENT_REQUIRED | 展示可选套餐和继续基础功能 |
| PRODUCT_NOT_FOR_SALE / CHANNEL_UNAVAILABLE | 保留配置，说明尚不可购买 |
| QUOTE_EXPIRED / INPUT_REVISION_CHANGED | 重新报价，必须再次确认 |
| PAYMENT_PENDING | 查原订单，不引导重买 |
| CAPACITY_EXCEEDED | 清理/导出/扩容；旧资料仍可读 |
| INVITE_EXPIRED / MEMBER_LIMIT_REACHED | 联系邀请者或管理成员 |
| MATERIAL_UNSUITABLE / CONSENT_REQUIRED | 明确缺什么材料/授权，未付款不扣费 |
| VERSION_CONFLICT | 保留本地草稿并比较最新值 |
| PROVIDER_UNCERTAIN | 展示核对中，不直接重新下游提交 |
| GENERATION_FAILED | 给重试/售后；原订单可达 |

## 5. 后台接口

路径`/api/v1/admin`，单独后台会话与scope。最低集合：users/profiles、products及publish/disable-sale、orders及reconcile、refunds及approve/reject、tasks及retry、voice-reviews、moderation及publish/reject/withdraw、support-tickets、exports/deletions及审计日志查询。

读写权限分离，金额调整、退款、授权素材查看必须填原因且有审计。禁止后台提供任意SQL执行或绕过支付账本的“直接改会员到期日”；人工补偿走补偿grant事件。普通客服不能修改商品售价或导出全部用户资料。

实施第一步将本目录转成OpenAPI，先覆盖A和B阶段；后续在CI检查生成客户端与服务端契约一致。本文示例的尖括号值为占位，不是可执行测试凭据。
