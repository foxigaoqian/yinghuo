# 支付路由、微信网页与 Stripe

版本V1.1；官方资料核对：2026-09-19。本文替换旧稿“只做H5所以不能做JSAPI”的判断。此为开发规格，未开通任何支付账号。

## 1. Stripe是否适用

Stripe的标准收款开户支持列表没有中国大陆，中国香港在列；中文站点/国内用户能付款不代表大陆主体能开户。香港等受支持地区账号仍须完成真实主体、银行账户、业务审核。不能借用别人的账号或填写虚假地址。依据：[全球支持地区](https://stripe.com/global)。

符合条件的Stripe账号可启用WeChat Pay，支持范围还取决于账号地区、业务和控制台权限。付款用户可以在中国；不能据此保证萤火已获准收款。WeChat Pay的Checkout不使用subscription/setup模式，本项目年费统一一次购买365天、手动续费。依据：[Stripe WeChat Pay](https://docs.stripe.com/payments/wechat-pay)。

因此保留三个条件通道，不要求三条都实现才能首发。上线只开放实际可用并通过验收的通道。只有大陆主体时，先推进直连微信；已有合格Stripe账号时优先验证Checkout。未确认账号状态不阻止内测开发，阻止真实收款开关。

## 2. 支付能力与容器

| 通道 | 前端动作 | 开启前证据 |
|---|---|---|
| wechat_h5 | redirect到h5_url | 直连商户H5权限、域名与微信外浏览器实测 |
| wechat_jsapi | 微信内WeixinJSBridge参数 | 认证公众号、JSAPI权限、商户绑定、OAuth与支付目录配置 |
| stripe_checkout | redirect到Checkout Session URL | 受支持地区收款账号、对应钱包/币种权限、小额支付退款实测 |

网页JSAPI的公众号身份仅用于当前appid，不能用小程序openid代替。[微信网页支付介绍](https://pay.wechatpay.cn/doc/v3/merchant/4012062524)、[接入准备](https://pay.wechatpay.cn/doc/v3/merchant/4015423216)。

`GET /bootstrap`与`GET /payment-capabilities?container=wechat|browser`返回渠道、enabled、actionType、disabledReason。容器参数仅为展示提示，服务端仍按账号权限、商品、币种、绑定身份核验。iOS/Android、微信内/外四组合分别记录支付矩阵；未实测组合保持关闭。Stripe二维码在同一手机如何完成付款必须实测，不能把桌面扫码成功当手机H5成功。无可用通道时保留草稿、订单查询，购买入口说明当前不可用。

## 3. 统一业务接口

`POST /orders/{orderId}/payment`只接受channel，禁止前端传金额、收款账号、外部URL或openid。响应data：orderId、channel、expiresAt、resultPath、action。

```json
{"orderId":"uuid","channel":"stripe_checkout","expiresAt":"2026-09-19T10:30:00Z","resultPath":"/pages/billing/result?orderId=uuid","action":{"type":"redirect","url":"https://checkout.stripe.com/…"}}
```

微信网页action为`type=wechat_jsapi`及appId/timeStamp/nonceStr/package/signType/paySign；全部由后端取得并签名。前端无论收到完成、取消还是超时，均从本地订单API恢复状态。

公众号OAuth：已登录用户请求authorize，服务端保存一次性state摘要、session、returnTo白名单和10分钟过期；callback校验state及绑定会话，再由服务端交换code，绑定Identity(provider=wechat_official,app_id,subject)。已有绑定到另一个账号时409，不自动合并。code/state不得记录到日志；OAuth回调不等于支付完成。

## 4. Stripe Checkout实施

1. 锁订单，检查buyer、商品版本、币种、payableFen和已有支付尝试；同一订单只允许一个未关闭的支付尝试。先持久化attempt及服务端幂等键，再调用渠道。
2. 使用服务端商品快照创建Session：mode=payment；CNY金额以分；quantity=1。client_reference_id与metadata只放内部orderId/attemptId，不放TA名字、照片、私聊或人物关系。PaymentIntent metadata同样写orderId/attemptId。
3. success_url、cancel_url由服务器生成到允许的订单结果页，session_id仅作恢复线索；不信任URL中的支付状态。
4. Session expires_at从创建起30分钟；渠道返回值落库并同步订单expires_at。报价有效10分钟用于“能否创建订单”，不用于关闭已创建的渠道支付。Stripe允许的Session过期范围见[创建Session](https://docs.stripe.com/api/checkout/sessions/create)。
5. 请求超时标记unknown并复用同一个幂等键恢复；未知状态不能新建另一通道尝试。切换渠道先查原渠道并确认旧Session过期/交易关闭。无创建结果时先恢复旧请求，再判断关闭。
6. 返回统一PaymentAction。用户取消页面不立即判定订单关闭；服务端查单、关闭/expire与晚到成功通知必须串行核对。

V1禁用自动优惠码、可修改数量、运费、自动换币及未纳入报价的税费功能；如经营主体需要税务金额展示，应先更新商品/报价口径，不能让Checkout金额与订单不同。价格不能简单把9900分换成9900美分。具体费用和结算币种以账号实际条件记录到provider配置，不承诺固定费率。

## 5. Webhook、幂等与退款

Stripe回调为`POST /payments/stripe_checkout/notify`，使用原始body、Stripe-Signature与独立whsec校验。微信回调仍用微信签名/解密，不能混用。受理事件先写可重放事件和Outbox并提交，再返回2xx；写库失败返回5xx。[Webhook官方要求](https://docs.stripe.com/webhooks)

| 事件/结果 | 本地处理 |
|---|---|
| checkout.session.completed | 重新取Session/PaymentIntent；只有payment_status=paid且金额、币种、账号、livemode和订单均匹配才记成功；unpaid继续等待 |
| checkout.session.async_payment_succeeded | 重取渠道当前状态后走同一成功函数 |
| checkout.session.async_payment_failed / expired | 核对是否已成功；不能回退既有paid事实 |
| refund.created / refund.updated / refund.failed | 重取Refund核对所属payment、金额；只有succeeded才能写退款成功 |
| charge.dispute.created / updated / closed | 卡支付才需相应处理；持久化争议并转财务工单，不伪装成普通退款 |

事件去重键(providerAccountId,livemode,eventId)；收款对象去重键(providerAccountId,livemode,providerPaymentId)。不同事件可指向同一支付，必须再锁订单/支付；只发一次grant。可信晚到支付即使本地曾过期也不能忽略，进入重核与补交付/退款。两次实际收款均入账，超收部分建差异工单，绝不静默丢弃。

退款以本地refundId作为固定渠道幂等键；先锁payment校验成功+在途累计退款不超实收，再调用原通道。不将“请求已提交”显示为到账。Stripe钱包存在各自退款期限；WeChat Pay当前为180天且异步，超过期限需走人工替代退款流程，不承诺365天都能原路退。[钱包退款规则](https://docs.stripe.com/payments/wechat-pay#refunds)

每天对齐本地订单、PaymentIntent/Charge、Refund、BalanceTransaction；另查Payout和到账差异。支付成功不代表钱已到银行卡。退款/争议/手续费分别入账，币种不混算，差异由有权限人员处理。

## 6. 环境配置与验收

新增服务端配置：PAYMENT_CHANNELS、STRIPE_SECRET_KEY、STRIPE_WEBHOOK_SECRET、STRIPE_ACCOUNT_ID、STRIPE_API_VERSION、STRIPE_CHECKOUT_ENABLED=false；公众号配置WECHAT_OFFICIAL_APPID、WECHAT_OFFICIAL_SECRET、WECHAT_OAUTH_CALLBACK、WECHAT_JSAPI_ENABLED=false。API版本以账号锁定的稳定版本为准，不复制文档中的preview版本。所有私钥和secret只在服务端。

开通证据卡只记录地区、主体简称、账号内部标识、已开方法、币种、退款边界、最后验收时间和负责人；不向公开仓库上传证件或账号截图。测通过：取消/返回、关闭页面后到账、重复及乱序事件、签名错误、金额不符、test事件进live、旧尝试晚成功、部分退款、退款失败、争议、收款/结算对账。测试环境可用不等于正式钱包权限已开通。
