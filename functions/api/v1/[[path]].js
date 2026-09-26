import contracts from '../../../packages/contracts/dist/index.js';

const { profileInput, memoryInput, chatInput, postInput, orderInput, idParam, PRODUCTS } =
  contracts;

const COOKIE = '__Host-yinghuo_demo';
const SESSION_TTL = 24 * 60 * 60;
const MAX_PROFILES = 3;
const MAX_MEMORIES = 20;
const MAX_MESSAGES = 100;
const MAX_POSTS = 5;
const MAX_ORDERS = 10;

class ApiFailure extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) {
  throw new ApiFailure(status, code, message);
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function errorResponse(error) {
  if (!(error instanceof ApiFailure)) {
    console.error('Yinghuo preview API failed:', error);
    return json(
      {
        error: { code: 'PREVIEW_ERROR', message: '演示服务暂时不可用，请稍后重试' },
        requestId: crypto.randomUUID(),
      },
      500,
    );
  }
  return json(
    { error: { code: error.code, message: error.message }, requestId: crypto.randomUUID() },
    error.status,
  );
}

function validate(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    fail(400, 'BAD_REQUEST', parsed.error.issues[0]?.message || '请求参数不正确');
  return parsed.data;
}

function validId(id) {
  return validate(idParam, id);
}

async function readBody(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json'))
    fail(415, 'UNSUPPORTED_MEDIA_TYPE', '请求内容必须是 JSON');
  const text = await request.text();
  if (text.length > 12000) fail(413, 'PAYLOAD_TOO_LARGE', '内容太长，请精简后重试');
  try {
    return JSON.parse(text);
  } catch {
    fail(400, 'BAD_JSON', '请求内容格式不正确');
  }
}

function checkOrigin(request, url) {
  if (request.method === 'GET') return;
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) fail(403, 'BAD_ORIGIN', '请求来源不正确');
}

function sessionToken(request) {
  const cookies = (request.headers.get('cookie') || '').split(';');
  const entry = cookies.map((x) => x.trim()).find((x) => x.startsWith(COOKIE + '='));
  const token = entry?.slice(COOKIE.length + 1) || '';
  return /^[a-f0-9-]{36}$/.test(token) ? token : '';
}

async function readSession(kv, request) {
  const token = sessionToken(request);
  if (!token) return null;
  const data = await kv.get('session:' + token, 'json');
  if (!data || typeof data.userId !== 'string' || typeof data.csrfToken !== 'string') return null;
  return { key: 'session:' + token, data };
}

async function saveSession(kv, session) {
  await kv.put(session.key, JSON.stringify(session.data), { expirationTtl: SESSION_TTL });
}

function requireSession(session) {
  if (!session) fail(401, 'UNAUTHORIZED', '请先进入演示账号');
  return session;
}

function ownProfile(session, id) {
  validId(id);
  const profile = session.data.profiles.find((p) => p.id === id);
  if (!profile) fail(404, 'NOT_FOUND', '记忆空间不存在或不可访问');
  return profile;
}

function bootstrap(session) {
  const profiles = session?.data.profiles || [];
  const mostRecent = [...profiles].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return {
    appVersion: '0.1.0',
    phase: 'A',
    features: {
      guestSession: true,
      profiles: true,
      textChat: true,
      manualMemories: true,
      memoryCandidates: false,
      phoneRecovery: false,
      photoUpload: false,
      payment: false,
      publicSquare: false,
      hostedPreview: true,
    },
    products: [],
    terms: { aiDisclosure: 'ai-disclosure-v1' },
    csrfToken: session?.data.csrfToken || null,
    paymentCapabilities: [],
    canCreateFreeProfile: Boolean(session && profiles.length === 0),
    accountState: session ? 'guest' : null,
    boundPhone: null,
    profileCount: profiles.length,
    recentProfileId: mostRecent?.id || null,
    recentConversationId: null,
    pendingTaskCount: 0,
  };
}

function makeSession() {
  return {
    userId: crypto.randomUUID(),
    csrfToken: crypto.randomUUID(),
    profiles: [],
    memories: [],
    messages: [],
    orders: [],
    posts: [],
    chatReplay: {},
    orderReplay: {},
  };
}

function makeMessage(session, profileId, role, text) {
  return {
    id: crypto.randomUUID(),
    ownerId: session.data.userId,
    profileId,
    role,
    text,
    createdAt: new Date().toISOString(),
    mock: true,
  };
}

async function handle(request, env) {
  if (!env?.DEMO_DATA) fail(503, 'STORAGE_NOT_READY', '演示数据服务尚未配置');
  const url = new URL(request.url);
  const base = '/api/v1/';
  if (!url.pathname.startsWith(base)) fail(404, 'NOT_FOUND', '接口不存在');
  const parts = url.pathname.slice(base.length).split('/').filter(Boolean);
  const route = parts.join('/');
  const method = request.method;
  checkOrigin(request, url);

  if (method === 'GET' && route === 'health')
    return json({ status: 'ok', mode: 'demo', persistence: 'temporary-kv', liveServices: false });
  if (method === 'GET' && route === 'capabilities')
    return json({
      mode: 'demo',
      chat: 'mock',
      payment: 'mock',
      sms: 'not-connected',
      storage: 'temporary-kv',
      restoration: 'not-connected',
      moderation: 'pending-only',
    });
  if (method === 'GET' && route === 'products')
    return json({ items: PRODUCTS, mock: true, pricesFinal: false });

  let session = await readSession(env.DEMO_DATA, request);
  if (method === 'GET' && route === 'auth/session')
    return json({
      userId: session?.data.userId || null,
      csrfToken: session?.data.csrfToken || null,
      mock: true,
    });
  if (method === 'GET' && route === 'bootstrap') return json(bootstrap(session));

  if (method === 'POST' && route === 'dev/session') {
    await readBody(request);
    if (!session) {
      const token = crypto.randomUUID();
      session = { key: 'session:' + token, data: makeSession() };
      await saveSession(env.DEMO_DATA, session);
      return json(
        { userId: session.data.userId, csrfToken: session.data.csrfToken, mock: true },
        200,
        {
          'set-cookie':
            COOKIE +
            '=' +
            token +
            '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' +
            SESSION_TTL,
        },
      );
    }
    return json({ userId: session.data.userId, csrfToken: session.data.csrfToken, mock: true });
  }

  requireSession(session);
  if (method !== 'GET' && request.headers.get('x-csrf-token') !== session.data.csrfToken)
    fail(403, 'BAD_CSRF', '请求校验失败，请刷新后重试');

  if (method === 'POST' && route === 'auth/logout') {
    await readBody(request);
    await env.DEMO_DATA.delete(session.key);
    return json({ ok: true }, 200, {
      'set-cookie': COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    });
  }

  if (method === 'GET' && route === 'profiles') return json({ items: session.data.profiles });
  if (method === 'POST' && route === 'profiles') {
    const input = validate(profileInput, await readBody(request));
    if (session.data.profiles.length >= MAX_PROFILES)
      fail(409, 'PREVIEW_LIMIT', '演示账号最多创建 3 个记忆空间');
    const profile = {
      id: crypto.randomUUID(),
      ownerId: session.data.userId,
      ...input,
      createdAt: new Date().toISOString(),
    };
    session.data.profiles.push(profile);
    await saveSession(env.DEMO_DATA, session);
    return json(profile);
  }

  if (parts[0] === 'profiles' && parts.length >= 2) {
    const profile = ownProfile(session, parts[1]);
    if (parts.length === 2 && method === 'GET') return json(profile);
    if (parts.length === 2 && method === 'PATCH') {
      Object.assign(profile, validate(profileInput, await readBody(request)));
      await saveSession(env.DEMO_DATA, session);
      return json(profile);
    }
    if (parts.length === 3 && parts[2] === 'memories') {
      if (method === 'GET')
        return json({ items: session.data.memories.filter((m) => m.profileId === profile.id) });
      if (method === 'POST') {
        const input = validate(memoryInput, await readBody(request));
        if (session.data.memories.length >= MAX_MEMORIES)
          fail(409, 'PREVIEW_LIMIT', '演示账号最多保存 20 条记忆');
        const memory = {
          id: crypto.randomUUID(),
          profileId: profile.id,
          ownerId: session.data.userId,
          ...input,
          createdAt: new Date().toISOString(),
        };
        session.data.memories.unshift(memory);
        await saveSession(env.DEMO_DATA, session);
        return json(memory);
      }
    }
    if (parts.length === 3 && parts[2] === 'messages') {
      if (method === 'GET')
        return json({ items: session.data.messages.filter((m) => m.profileId === profile.id) });
      if (method === 'POST') {
        const input = validate(chatInput, await readBody(request));
        const replayKey = input.clientMessageId ? profile.id + ':' + input.clientMessageId : '';
        const replay = replayKey && session.data.chatReplay[replayKey];
        if (replay)
          return json({ items: session.data.messages.filter((m) => replay.includes(m.id)) });
        if (session.data.messages.length >= MAX_MESSAGES)
          fail(409, 'PREVIEW_LIMIT', '演示对话已达上限');
        const allowed = session.data.memories.find((m) => m.profileId === profile.id && m.useForAi);
        const context = allowed
          ? '你保存的「' + allowed.title + '」可以作为记忆线索。'
          : '你可以慢慢补充一些愿意用于对话的记忆。';
        const user = makeMessage(session, profile.id, 'user', input.text);
        const assistant = makeMessage(
          session,
          profile.id,
          'assistant',
          '【AI 演示回复，并非本人】我听到你说：“' +
            input.text.slice(0, 80) +
            '”。' +
            context +
            '当前还未连接真实模型。',
        );
        session.data.messages.push(user, assistant);
        if (replayKey) session.data.chatReplay[replayKey] = [user.id, assistant.id];
        await saveSession(env.DEMO_DATA, session);
        return json({ items: [user, assistant] });
      }
    }
  }

  if (parts[0] === 'memories' && parts.length === 2 && method === 'DELETE') {
    const id = validId(parts[1]);
    const index = session.data.memories.findIndex((m) => m.id === id);
    if (index < 0) fail(404, 'NOT_FOUND', '记忆不存在或不可访问');
    session.data.memories.splice(index, 1);
    await saveSession(env.DEMO_DATA, session);
    return json({ ok: true });
  }

  if (route === 'orders' && method === 'GET') return json({ items: session.data.orders });
  if (route === 'orders' && method === 'POST') {
    const input = validate(orderInput, await readBody(request));
    ownProfile(session, input.profileId);
    const key = request.headers.get('idempotency-key') || '';
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key))
      fail(400, 'BAD_IDEMPOTENCY_KEY', '需要 8–128 位 Idempotency-Key');
    const fingerprint = JSON.stringify(input);
    const replay = session.data.orderReplay[key];
    if (replay) {
      if (replay.fingerprint !== fingerprint)
        fail(409, 'IDEMPOTENCY_CONFLICT', '同一个请求编号不能用于不同订单');
      return json(session.data.orders.find((o) => o.id === replay.orderId));
    }
    if (session.data.orders.length >= MAX_ORDERS) fail(409, 'PREVIEW_LIMIT', '演示订单已达上限');
    const product = PRODUCTS.find((item) => item.id === input.productId);
    const order = {
      id: crypto.randomUUID(),
      ownerId: session.data.userId,
      ...input,
      priceFen: product.priceFen,
      status: 'pending_payment',
      mock: true,
      createdAt: new Date().toISOString(),
    };
    session.data.orders.unshift(order);
    session.data.orderReplay[key] = { fingerprint, orderId: order.id };
    await saveSession(env.DEMO_DATA, session);
    return json(order);
  }
  if (parts[0] === 'orders' && parts.length === 3 && method === 'POST') {
    const id = validId(parts[1]);
    const order = session.data.orders.find((o) => o.id === id);
    if (!order) fail(404, 'NOT_FOUND', '订单不存在或不可访问');
    const input = await readBody(request);
    if (!input || input.confirmMock !== true || Object.keys(input).length !== 1)
      fail(400, 'BAD_REQUEST', '仅支持确认模拟支付或退款');
    if (parts[2] === 'dev-pay') {
      if (order.status === 'refunded') fail(409, 'ORDER_CONFLICT', '已退款的订单不能再支付');
      order.status = 'paid';
    } else if (parts[2] === 'dev-refund') {
      if (order.status === 'pending_payment') fail(409, 'ORDER_CONFLICT', '尚未付款，不能退款');
      order.status = 'refunded';
    } else fail(404, 'NOT_FOUND', '接口不存在');
    await saveSession(env.DEMO_DATA, session);
    return json(order);
  }

  if (route === 'square' && method === 'GET')
    return json({
      items: url.searchParams.get('view') === 'mine' ? session.data.posts : [],
      mock: true,
    });
  if (route === 'square' && method === 'POST') {
    const input = validate(postInput, await readBody(request));
    if (session.data.posts.length >= MAX_POSTS)
      fail(409, 'PREVIEW_LIMIT', '演示账号最多保存 5 篇故事');
    const post = {
      id: crypto.randomUUID(),
      ownerId: session.data.userId,
      title: input.title,
      body: input.body,
      visibility: input.visibility,
      moderation: input.visibility === 'public' ? 'pending' : 'private',
      createdAt: new Date().toISOString(),
    };
    session.data.posts.unshift(post);
    await saveSession(env.DEMO_DATA, session);
    return json(post);
  }

  fail(404, 'NOT_FOUND', '接口不存在');
}

export async function onRequest({ request, env }) {
  try {
    return await handle(request, env);
  } catch (error) {
    return errorResponse(error);
  }
}
