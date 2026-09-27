import { createHmac, timingSafeEqual } from 'node:crypto';

export type CheckoutSession = { id: string; url: string };

/** Low-level Stripe transport. Orders, price lookup and fulfillment stay on the server. */
export class StripeCheckoutGateway {
  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!secretKey.startsWith('sk_') || !webhookSecret.startsWith('whsec_'))
      throw new Error('Stripe server credentials are required');
  }

  async createAnnualSession(input: {
    orderId: string;
    amountMinor: number;
    currency: string;
    name: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession> {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0)
      throw new Error('Invalid server-side amount');
    if (!/^[a-z]{3}$/i.test(input.currency)) throw new Error('Invalid currency');
    for (const value of [input.successUrl, input.cancelUrl]) {
      if (new URL(value).protocol !== 'https:') throw new Error('Checkout return URLs require HTTPS');
    }
    const form = new URLSearchParams({
      mode: 'payment',
      client_reference_id: input.orderId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': input.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(input.amountMinor),
      'line_items[0][price_data][product_data][name]': input.name,
    });
    let response: Response;
    try {
      response = await this.fetcher('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
          'idempotency-key': `yinghuo-checkout-${input.orderId}`,
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Stripe checkout rejected');
      const data = (await response.json()) as Partial<CheckoutSession>;
      const checkoutUrl = new URL(data.url || 'http://invalid.example');
      if (!data.id?.startsWith('cs_') || checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com')
        throw new Error('Unexpected Stripe checkout response');
      return { id: data.id!, url: data.url! };
    } catch {
      // No Stripe error payload or credentials should reach the browser.
      throw new Error('支付暂时不可用，请稍后重试');
    }
  }

  /** Verify the raw HTTP body before parsing or using any webhook event. */
  verifyWebhook(rawBody: Buffer, signature: string, nowSeconds = Math.floor(Date.now() / 1000)) {
    const timestamp = Number(signature.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1]);
    const candidates = [...signature.matchAll(/(?:^|,)v1=([0-9a-f]{64})(?=,|$)/g)].map((m) => m[1]);
    if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || !candidates.length)
      throw new Error('Invalid Stripe webhook signature');
    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest();
    if (!candidates.some((hex) => timingSafeEqual(Buffer.from(hex, 'hex'), expected)))
      throw new Error('Invalid Stripe webhook signature');
    try {
      return JSON.parse(rawBody.toString('utf8')) as {
        id: string;
        type: string;
        data: { object: Record<string, unknown> };
      };
    } catch {
      throw new Error('Invalid Stripe webhook JSON');
    }
  }
}
