# 微信 H5 支付实施规格

版本：V1.0  
状态：首期实施基线  
适用产品：萤火移动端 H5

> 本文件只定义**微信直连 H5 适配器**，适用微信外手机浏览器。微信内网页用 wechat_jsapi；Stripe 是条件通道。完整路由、主体资格与开关见[16](16-payment-routing-and-stripe.md)。

## 1. 范围与官方依据

首期产品仍是H5；不做小程序、自动续费或按分钟计费。微信网页JSAPI不是小程序功能，不能放到V2才处理。用户支付返回只触发服务端查单。

- [微信网页JSAPI介绍](https://pay.wechatpay.cn/doc/v3/merchant/4012062524)
- [JSAPI接入准备](https://pay.wechatpay.cn/doc/v3/merchant/4015423216)
- [官方Java H5请求模型（协议参考）](https://github.com/wechatpay-apiv3/wechatpay-java/blob/main/service/src/main/java/com/wechat/pay/java/service/payments/h5/model/PrepayRequest.java)

本文件的h5_url和H5场景信息只用于微信外浏览器。Node实现锁定SDK/API版本后验证，不把Java示例当可直接使用的Node代码。

## 2. 商户配置清单

所有密钥和证书只放后端密钥管理或受控环境变量，禁止进入前端构建产物、日志、数据库业务表和 Git 历史。

| 配置 | 用途 | 首发检查 |
|---|---|---|
| mchid | 微信支付商户号 | 与实际收款主体一致 |
| appid | H5 支付使用的应用标识 | 已绑定正确商户主体和业务场景 |
| APIv3 key | 回调资源解密、平台数据保护 | 生产与测试隔离；轮换有记录 |
| 商户 API 证书序列号 | 请求签名与证书识别 | 与商户私钥/证书匹配 |
| 商户 API 私钥 | 服务端请求签名 | 不经过浏览器、不进日志 |
| 微信支付平台证书或公钥配置 | 回调验签 | 记录序列号/公钥标识和轮换时间 |
| notify_url | 支付和退款通知 | 生产 HTTPS、稳定、无查询串 |
| 服务端可信代理配置 | 获取真实用户 IP | 明确代理链，拒绝任意 X-Forwarded-For |
| 环境标识 | dev/staging/prod 隔离 | 测试订单不能进入生产账本 |

上线前必须用实际商户账号完成证书、签名、回调、查单、关单、退款和账单权限核对。只填配置文件不算联调完成。

## 3. 交易链路

~~~text
用户点击购买
  -> 服务端读取商品/报价/订单快照
  -> 服务端计算金额与过期时间
  -> 微信 H5 预支付
  -> 返回短期 h5_url
  -> 浏览器跳转微信支付页
  -> 用户支付或取消
  -> 微信异步通知与服务端主动查单
  -> 验签、解密、核对金额和订单
  -> 事务写 Payment/Order/Outbox
  -> Worker 激活权益或执行作品任务
  -> 前端查询订单结果
~~~

两个事实必须分开：

- 浏览器跳转成功只说明用户被带到支付流程；
- 支付回调、主动查单或对账确认后，才可以把 Payment 标记为 succeeded，并在同一事务内产生权益激活事件。

## 4. H5 下单字段

服务端使用订单快照调用微信 H5 预支付，不接受客户端的金额、商户号、回调地址或任意跳转地址。

最小请求字段：

~~~json
{
  "appid": "<server-configured-appid>",
  "mchid": "<server-configured-mchid>",
  "description": "萤火记忆年费",
  "out_trade_no": "<server-generated-unique-order-no>",
  "time_expire": "<RFC3339>",
  "notify_url": "https://api.example.com/api/v1/payments/wechat_h5/notify",
  "amount": {
    "total": 9900,
    "currency": "CNY"
  },
  "scene_info": {
    "payer_client_ip": "<trusted-client-ip>",
    "h5_info": {
      "type": "WAP",
      "app_name": "萤火",
      "app_url": "https://yinghuo.example.com"
    }
  }
}
~~~

实施要求：

- out_trade_no 由服务端生成并在本地唯一，重试同一支付尝试必须复用，不因前端刷新创建新业务订单；
- time_expire 由服务端按订单策略生成，支付前要留出查单和关单时间；
- notify_url 使用生产配置，必须是 HTTPS 且不带查询串；按官方约束部署为稳定公网地址；
- amount.total 使用人民币分，必须等于订单快照应付金额；服务端再次核对，不接受前端传入金额；
- payer_client_ip 只允许来自受信任的反向代理链；缺失、不合法或代理配置不可信时拒绝 H5 下单；
- h5_info 的 type、app_name、app_url 按商户实际场景和官方当前要求配置；
- appid、mchid、API 证书、APIv3 key 必须从当前环境配置读取；
- API 响应中的 h5_url 是短期支付跳转信息，服务端要保存过期时间，但不要把它当长期作品链接。

成功响应的核心字段：

~~~json
{
  "h5_url": "https://pay.weixin.qq.com/...",
  "out_trade_no": "<merchant-order-no>"
}
~~~

实际字段以当前官方 API 和 SDK 返回为准。客户端只需要拿到统一PaymentAction、订单号、结果页路径和过期时间，不应拿到签名私钥、APIv3 key、商户配置或内部回调地址。

## 5. 萤火 API 契约

### 创建支付尝试

请求：POST /api/v1/orders/{id}/payment

~~~json
{
  "channel": "wechat_h5"
}
~~~

服务端行为：

1. 校验当前用户能访问该订单；
2. 锁订单并读取商品、金额、条款和输入版本快照；
3. 检查订单是否已支付、已关闭、已过期或已有有效支付尝试；
4. 生成或复用同一支付尝试的 out_trade_no；
5. 调用微信 H5 预支付；
6. 保存 h5_url 过期时间和渠道状态；
7. 返回短期跳转信息。

响应：

~~~json
{
  "data": {
    "orderId": "<uuid>",
    "channel": "wechat_h5",
    "action": {"type": "redirect", "url": "https://pay.weixin.qq.com/..."},
    "expiresAt": "<RFC3339>",
    "resultPath": "/pages/billing/result?orderId=<uuid>"
  },
  "traceId": "<trace>"
}
~~~

客户端不得自行拼接金额、商户号、notify_url、return URL 或 query 参数。支付页返回结果页只允许恢复 orderId，并且 orderId 仍要经过当前账号授权检查。

### 查询订单

GET /api/v1/orders/{id}

返回至少区分：

- orderState：pending_payment、paid、closed、cancelled；
- paymentState：created、pending、succeeded、failed；
- fulfillmentState：pending、activating、processing、delivered、failed；
- refundState：none、requested、processing、succeeded、rejected；
- paidFen、currency、paidAt、channel、providerTradeNo（可脱敏）；
- 可用的 resultPath、作品入口和售后入口。

### 受控主动查单

POST /api/v1/orders/{id}/reconcile

只允许当前订单拥有者或后台受权角色调用。用户侧有频率限制，支付处理中时才允许按策略重试；查单超时返回 PAYMENT_PENDING，不创建新订单。查单成功和异步通知同时到达时必须依靠数据库唯一约束和状态机去重。

### 异步回调

- POST /api/v1/payments/wechat_h5/notify
- POST /api/v1/refunds/wechat_h5/notify

回调没有用户会话。支付回调先验签和解密，再校验商户号、appid、out_trade_no、金额、币种和微信交易号。退款回调单独写退款状态，不覆盖支付成功事实。

## 6. 支付回调安全与幂等

微信支付回调必须读取原始请求体和签名相关请求头，包括时间戳、随机串、签名、证书序列号以及官方当前要求的签名类型字段。不能先把 JSON 重新序列化再验签。

处理顺序：

1. 检查时间窗口和请求头完整性；
2. 用微信平台证书或公钥验证原始 body；
3. 用 APIv3 key 解密 resource；
4. 校验商户号、appid、订单号、币种、金额、交易状态和交易号；
5. 写入 payment_events 并以 event_id 或 trade_no 去重；
6. 锁 Order，核对本地订单快照和累计实收；
7. 事务内写 Payment、Order、Outbox 和必要的 grant；
8. 提交数据库事务；
9. 成功处理返回 HTTP 200；验签失败、解密失败、业务核对失败或数据库失败返回合适的 4xx/5xx，使渠道按协议重试或进入人工核对。

实际回调资源字段以官方当前协议为准。日志只记录 traceId、orderId、eventId、providerTradeNo 脱敏值、状态和耗时；不记录 APIv3 key、私钥、完整密文或完整身份证/手机号。

重复回调只能产生一条支付事实。支付成功后生成任务、发站内消息、发短信或处理媒体都走 Outbox/Worker，不能阻塞回调，也不能在提交前调用不可逆供应商操作。

## 7. 微信状态与本地状态

| 微信原始状态 | 本地处理 |
|---|---|
| SUCCESS | Payment=succeeded；事务内写 Order=paid、Outbox 和权益激活 |
| USERPAYING | Payment=pending；继续受控查单 |
| NOTPAY | Payment=pending；到期后先查单再关单 |
| CLOSED | 订单关闭，不发权益 |
| PAYERROR | 支付失败，允许对同一订单发起新的支付尝试 |
| REFUND | Payment 保留已支付事实，单独更新 Refund |

不能只保存一个 paid 布尔值。至少保存：

- 本地 orderId、支付尝试号和 out_trade_no；
- channel、providerTradeNo、providerState；
- amountFen、currency、paidAt；
- 回调 eventId、providerSerial、verifiedAt；
- 查单时间、关单时间和最后一次错误分类。

支付成功但本地交付失败时，订单仍是已支付，进入 Outbox/售后，不得把支付状态改回未支付。

## 8. 订单到期、查单和关单

订单到期不是收款事实。订单到期前后执行：

1. 先按 out_trade_no 或微信交易号查单；
2. 若已支付，按正常支付成功流程补账和交付；
3. 若仍未支付且已达到 time_expire，调用微信关单；
4. 关单成功后本地才可关闭订单并释放抵扣；
5. 查单或关单超时，保持 PAYMENT_PENDING 并告警，不能自动创建第二个业务订单。

浏览器关闭、返回失败、网络超时都只能让前端重新 GET 订单或受控 reconcile，不能让前端自行重置订单状态。

## 9. 退款与售后

退款是独立对象，不能直接把 Order 改成 refunded。

申请退款时：

- 锁订单；
- 校验当前用户、商品条款、交付状态和已退款累计金额；
- 生成唯一 providerRefundNo；
- 请求金额以分保存，不能超过已支付且未退款金额；
- 请求超时先查退款，不重复使用新的退款号；
- 回调或查退款确认成功后，才撤销对应 grant、恢复可抵扣权益并通知用户。

退款记录至少保存：

~~~json
{
  "orderId": "<uuid>",
  "requestFen": 9900,
  "providerRefundNo": "<unique-refund-no>",
  "providerRefundId": "<wechat-refund-id>",
  "providerStatus": "PROCESSING",
  "refundSuccessTime": null
}
~~~

支付成功、退款处理中、退款成功必须分开显示和审计。已合法下载的作品和用户原始记忆不能因退款直接删除；具体撤销范围按商品条款和售后决策执行。

## 10. 交易账单与对账

首发收费前至少要具备每日人工可执行、后续可自动化的微信交易账单核对：

1. 服务端申请交易账单；
2. 保存账单下载任务和账单摘要；
3. 下载账单文件并校验摘要，失败则告警且不入账；
4. 解析 out_trade_no、transaction_id、交易状态、金额、币种、成功时间和退款信息；
5. 比对本地订单、Payment、Refund、grant、作品交付；
6. 生成差异分类：渠道已付本地未付、本地已付未交付、退款未确认、金额不一致、重复交易；
7. 每个差异生成可追踪处理记录，修复必须写原因和执行人。

账单下载文件不是前端数据，不要把支付敏感信息放入普通用户导出包。账单密钥、下载地址、完整原始文件按最小权限留存。

## 11. H5 页面状态

P40 确认订单：

- 展示商品、绑定TA、输入版本、服务期限、原价/优惠/实付、售后条款；
- 点击支付后只调用 POST /orders/{id}/payment；
- 请求重复时复用或返回当前支付尝试，不创建第二个业务订单；
- 显示“打开微信支付页”而不是“已付款”。

P41 支付结果：

- 进入页面先 GET /orders/{id}；
- pending 显示“正在核验”，提供刷新和订单入口；
- succeeded 显示权益或作品任务状态；
- cancelled/failed 显示重新支付入口，但不新建订单；
- 用户关闭支付页后从订单列表继续找回；
- 支付返回 URL 不能直接把页面状态改为 succeeded。

P42/P43 订单列表和详情：

- 待支付、核验中、已支付、交付中、退款处理中分开显示；
- 订单详情分开显示 payment、fulfillment、refund 三种状态；
- 提供订单号、售后入口、作品入口和客服/帮助入口；
- 不能把家人共同记录权限当成账单共享权限。

## 12. 监控、告警和审计

首发收费前配置：

- 微信 H5 下单成功率、h5_url 生成失败率；
- 支付回调验签失败、解密失败、金额不匹配、重复事件；
- USERPAYING/PAYMENT_PENDING 超时；
- 渠道已付本地未付、本地已付未交付；
- 退款处理中超时、退款回调重复；
- 账单摘要校验失败、对账差异数量；
- Outbox 积压、Worker 最老任务、供应商未知状态；
- 真实IP缺失和代理头异常。

每笔交易用 traceId 贯穿报价、订单、支付尝试、回调、查单、退款、对账和权益事件。支付异常可以暂停新售，但必须保留历史订单查单、交付和售后入口。

## 13. V1 上线验收清单

- [ ] 普通手机浏览器完成创建订单和微信 H5 跳转；
- [ ] 微信内置浏览器使用已开通的网页JSAPI或已实测Stripe通道；不调用微信外H5适配器；
- [ ] 正常支付、取消支付、支付页关闭、网络超时都能回到订单结果；
- [ ] 回调验签/解密通过，伪造、篡改金额和重复回调被拒绝或幂等；
- [ ] 回调与主动查单同时到达只发一次权益；
- [ ] H5 支付 URL 过期能为同一订单生成新支付尝试，不重复建业务订单；
- [ ] 订单到期先查单再关单；
- [ ] 退款申请、退款超时查回、退款通知和权益撤销可追踪；
- [ ] 微信交易账单可以下载、校验摘要并生成差异；
- [ ] 密钥、证书、完整回调密文和敏感支付数据不进前端、日志或 Git；
- [ ] V1 文档和代码没有把小程序 code、openid、JSAPI 参数当成首期依赖。

## 14. V2 小程序迁移预留

迁移时新增 wechat_mini_program 支付适配器和小程序身份适配器：

- 订单、商品、权益、退款、对账和后台交易接口保持不变；
- payment channel 增加 wechat_mini_program；
- 小程序端单独获取 code、openid 和必要的用户身份；
- 服务端根据小程序场景生成 JSAPI 参数，前端调用 wx.requestPayment；
- 小程序支付成功后仍以回调、查单和对账为准；
- 不因为新增小程序渠道而允许前端提交金额、订单号、回调地址或任意 return URL；
- 用独立的 V2 真机、审核和风控验收清单，不把 H5 已验收当作小程序已验收。

小程序迁移的前提是 H5 已有可解释的支付转化、退款率、交付成功率和真实用户反馈。


> V1.1实施对齐（2026-09-19）：首发范围与开发默认值见[17](17-v1-contract-completion.md)，支付见[16](16-payment-routing-and-stripe.md)，后台见[18](18-admin-api-and-operations.md)，AI落地见[19](19-ai-provider-and-evaluation.md)，验收见[20](20-acceptance-matrix.md)。A/B接口以[12](12-openapi.yaml)为准；新增数据库定义见[补充迁移](../infra/migrations/0002_v1_gaps.sql)。C/D仍按阶段评审。
