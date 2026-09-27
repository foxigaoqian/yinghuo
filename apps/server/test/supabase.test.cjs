const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { SupabaseDataApi, SupabaseDataApiError } = require('../dist/supabase-data-api');
const { SupabaseGuestAuth } = require('../dist/supabase-auth');
const { SupabasePublicController, SupabaseProfilesController } = require('../dist/supabase-app');
const { LiveChatProvider } = require('../dist/live-chat');
const { StripeCheckoutGateway } = require('../dist/stripe-checkout');
const { createHmac } = require('node:crypto');
const { validateEnvironment } = require('../dist/config');

describe('Supabase server integration', () => {
  it('creates a one-time annual Checkout request with server price and stable idempotency', async () => {
    let request;
    const stripe = new StripeCheckoutGateway('sk_test_demo', 'whsec_demo', async (url, options) => {
      request = { url, options };
      return Response.json({ id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/test' });
    });
    const session = await stripe.createAnnualSession({
      orderId: 'order-123', amountMinor: 9900, currency: 'CNY', name: '萤火记忆年费',
      successUrl: 'https://example.com/orders?result=success', cancelUrl: 'https://example.com/orders?result=cancel',
    });
    const form = new URLSearchParams(request.options.body);
    assert.equal(request.url, 'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(form.get('mode'), 'payment');
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '9900');
    assert.equal(form.get('client_reference_id'), 'order-123');
    assert.equal(request.options.headers['idempotency-key'], 'yinghuo-checkout-order-123');
    assert.equal(session.id, 'cs_test_abc');
  });

  it('verifies the exact raw Stripe webhook body and rejects stale or tampered events', () => {
    const gateway = new StripeCheckoutGateway('sk_test_demo', 'whsec_demo');
    const body = Buffer.from(JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed', data: { object: { id: 'cs_test_abc' } } }));
    const now = Math.floor(Date.now() / 1000);
    const digest = createHmac('sha256', 'whsec_demo').update(`${now}.`).update(body).digest('hex');
    assert.equal(gateway.verifyWebhook(body, `t=${now},v1=${digest}`).id, 'evt_123');
    assert.throws(() => gateway.verifyWebhook(Buffer.from('tampered'), `t=${now},v1=${digest}`));
    assert.throws(() => gateway.verifyWebhook(body, `t=${now - 301},v1=${digest}`, now));
  });
  it('sends only explicitly selected memories to AI after per-message consent', async () => {
    const previousProvider = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'openai_compatible';
    const calls = [];
    const profileId = 'b4179cb2-ec5a-44ea-9dfd-940929959a44';
    const selectedId = 'a4179cb2-ec5a-44ea-9dfd-940929959a44';
    const fakeDb = {
      async select(table, query) {
        calls.push({ table, query });
        if (table === 'profiles')
          return [{ id: profileId, creator_user_id: 'owner', display_name: '爸爸', status: 'active' }];
        if (table === 'profile_preferences' || table === 'consents') return [];
        if (table === 'memories') {
          if (query.source_type) return [];
          return [{ id: selectedId, profile_id: profileId, owner_user_id: 'owner', title: '家事', body: '一起做饭', use_for_ai: false }];
        }
        if (table === 'conversations') return [];
        throw new Error('unexpected table: ' + table);
      },
      async upsert() { return [{ id: 'conversation', epoch: 0 }]; },
      async insert(_table, rows) {
        return rows.map((row, i) => ({ ...row, id: 'm' + i }));
      },
      async patch() { return []; },
    };
    let sent;
    const controller = new SupabaseProfilesController(fakeDb, {
      async reply(input) { sent = input; return { text: '谢谢分享。', mock: false }; },
    });
    const req = { demoSession: { userId: 'owner' } };
    try {
      await assert.rejects(
        controller.send(req, profileId, { text: '你好', memoryIds: [selectedId] }),
        { status: 403 },
      );
      assert.equal(sent, undefined);
      assert.equal(calls.some((call) => call.table === 'memories' && call.query.id), false);
      const result = await controller.send(req, profileId, {
        text: '你好', aiConsent: true, memoryIds: [selectedId],
      });
      assert.equal(sent.memories.length, 1);
      assert.equal(sent.memories[0].id, selectedId);
      assert.equal(calls.find((call) => call.table === 'memories' && call.query.id).query.id, 'in.(' + selectedId + ')');
      assert.deepEqual(result.items.map((m) => m.mock), [false, false]);
    } finally {
      if (previousProvider === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = previousProvider;
    }
  });

  it('does not save a chat turn when the AI provider fails', async () => {
    const previousProvider = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'openai_compatible';
    let writes = 0;
    const db = {
      async select(table, query) {
        if (table === 'profiles') return [{ id: 'b4179cb2-ec5a-44ea-9dfd-940929959a44', creator_user_id: 'owner', display_name: '爸爸', status: 'active' }];
        if (table === 'conversations' || table === 'profile_preferences' || table === 'memories' || table === 'consents') return [];
        throw new Error('unexpected table');
      },
      async upsert() { writes++; return []; },
      async insert() { writes++; return []; },
    };
    try {
      const controller = new SupabaseProfilesController(db, { async reply() { throw new Error('provider down'); } });
      await assert.rejects(controller.send({ demoSession: { userId: 'owner' } }, 'b4179cb2-ec5a-44ea-9dfd-940929959a44', { text: '你好', aiConsent: true, memoryIds: [] }), /provider down/);
      assert.equal(writes, 0);
    } finally {
      if (previousProvider === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = previousProvider;
    }
  });

  it('uses a server-only HTTPS chat endpoint and rejects impersonation', async () => {
    let request;
    const chat = new LiveChatProvider('https://ai.example.com/v1', 'server-key', 'demo-model', async (url, options) => {
      request = { url: String(url), options };
      return Response.json({ choices: [{ message: { content: '你留下的记忆里写着一起做饭。' } }] });
    });
    const answer = await chat.reply({ profile: { name: '爸爸' }, text: '聊聊', memories: [], history: [] });
    assert.equal(answer.mock, false);
    assert.equal(request.url, 'https://ai.example.com/v1/chat/completions');
    assert.equal(request.options.headers.authorization, 'Bearer server-key');
    assert.doesNotMatch(JSON.stringify(JSON.parse(request.options.body).messages), /一起做饭/);
    const bad = new LiveChatProvider('https://ai.example.com/v1', 'key', 'model', async () => Response.json({ choices: [{ message: { content: '我记得你爸爸。' } }] }));
    await assert.rejects(bad.reply({ profile: { name: '爸爸' }, text: '你好', memories: [] }), { status: 503 });
  });
  it('uses the secret key only in server-side Data API headers', async () => {
    let seen;
    const api = new SupabaseDataApi(
      'https://demo.supabase.co',
      'sb_secret_example',
      async (url, init) => {
        seen = { url: new URL(url), init };
        return new Response('[{"id":"one"}]', { status: 200 });
      },
    );
    const rows = await api.select('profiles', { select: 'id', creator_user_id: 'eq.user-1' });
    assert.deepEqual(rows, [{ id: 'one' }]);
    assert.equal(seen.url.pathname, '/rest/v1/profiles');
    assert.equal(seen.url.searchParams.get('creator_user_id'), 'eq.user-1');
    assert.equal(seen.init.headers.apikey, 'sb_secret_example');
    assert.equal(seen.init.headers.authorization, 'Bearer sb_secret_example');
    assert.equal(seen.init.cache, 'no-store');
  });

  it('sends session hash arguments to the restricted guest RPC', async () => {
    let sent;
    const api = new SupabaseDataApi(
      'https://demo.supabase.co',
      'sb_secret_example',
      async (url, init) => {
        sent = { url: new URL(url), body: JSON.parse(init.body) };
        return new Response('true', { status: 200 });
      },
    );
    await api.rpc('yinghuo_revoke_guest_session', { p_refresh_hash: '\\x' + 'ab'.repeat(32) });
    assert.equal(sent.url.pathname, '/rest/v1/rpc/yinghuo_revoke_guest_session');
    assert.equal(sent.body.p_refresh_hash, '\\x' + 'ab'.repeat(32));
  });

  it('does not expose Supabase error response bodies', async () => {
    const api = new SupabaseDataApi(
      'https://demo.supabase.co',
      'sb_secret_example',
      async () =>
        new Response('{"code":"42501","message":"sb_secret_example must not leak"}', {
          status: 403,
        }),
    );
    await assert.rejects(api.select('profiles', { select: '*' }), (error) => {
      assert.ok(error instanceof SupabaseDataApiError);
      assert.equal(error.code, '42501');
      assert.doesNotMatch(error.message, /sb_secret_example/);
      return true;
    });
  });

  it('creates a guest session with a hash-only database token and verifies CSRF', async () => {
    const calls = [];
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    const fakeDb = {
      async rpc(name, args) {
        calls.push({ name, args });
        if (name === 'yinghuo_create_guest_session')
          return [{ user_id: 'user-1', family_code: 'AB12CD34' }];
        if (name === 'yinghuo_get_guest_session')
          return [
            {
              user_id: 'user-1',
              account_kind: 'guest',
              family_code: 'AB12CD34',
              expires_at: expiresAt,
            },
          ];
        if (name === 'yinghuo_revoke_guest_session') return true;
        throw new Error('unexpected RPC');
      },
    };
    const auth = new SupabaseGuestAuth(fakeDb, 'a'.repeat(48), false);
    let cookie;
    const response = {
      cookie(name, value, options) {
        cookie = { name, value, options };
      },
      clearCookie(name, options) {
        cookie = { name, options, cleared: true };
      },
    };
    const opened = await auth.open({ cookies: {}, header: () => 'test browser' }, response);
    assert.equal(cookie.name, 'yinghuo_session');
    assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.sameSite, 'strict');
    assert.equal(opened.userId, 'user-1');
    assert.equal(opened.mock, false);
    assert.equal(calls[0].name, 'yinghuo_create_guest_session');
    assert.match(calls[0].args.p_refresh_hash, /^\\x[0-9a-f]{64}$/);

    const session = await auth.read({ cookies: { yinghuo_session: cookie.value } });
    assert.equal(session.userId, 'user-1');
    assert.equal(auth.verifyCsrf(session, opened.csrfToken), true);
    assert.equal(auth.verifyCsrf(session, 'wrong'), false);
    await auth.close({ cookies: { yinghuo_session: cookie.value } }, response);
    assert.equal(calls.at(-1).name, 'yinghuo_revoke_guest_session');
    assert.equal(cookie.cleared, true);
  });

  it('requires backend Supabase and session secrets but keeps production blocked', () => {
    assert.throws(() => validateEnvironment({ APP_MODE: 'supabase', NODE_ENV: 'test' }));
    assert.doesNotThrow(() =>
      validateEnvironment({
        APP_MODE: 'supabase',
        NODE_ENV: 'test',
        SUPABASE_URL: 'https://demo.supabase.co',
        SUPABASE_SECRET_KEY: 'sb_secret_example',
        SESSION_SECRET: 'x'.repeat(48),
      }),
    );
    assert.throws(
      () =>
        validateEnvironment({
          APP_MODE: 'supabase',
          NODE_ENV: 'production',
          SUPABASE_URL: 'https://demo.supabase.co',
          SUPABASE_SECRET_KEY: 'sb_secret_example',
          SESSION_SECRET: 'x'.repeat(48),
        }),
      /Production launch is blocked/,
    );
  });

  it('bootstraps only the current Supabase guest and restores their recent conversation', async () => {
    const session = {
      userId: 'user-1',
      accountKind: 'guest',
      familyCode: 'AB12CD34',
      csrfToken: 'csrf',
    };
    const fakeAuth = {
      async read() {
        return session;
      },
    };
    const fakeDb = {
      async select(table) {
        if (table === 'app_users') return [{ account_kind: 'guest', free_slot_consumed_at: null }];
        if (table === 'profiles') return [{ id: 'profile-1' }, { id: 'profile-2' }];
        if (table === 'conversations') return [{ id: 'conversation-1', profile_id: 'profile-2' }];
        throw new Error('unexpected table ' + table);
      },
    };
    const bootstrap = await new SupabasePublicController(fakeAuth, fakeDb).bootstrap({
      cookies: {},
    });
    assert.equal(bootstrap.accountState, 'guest');
    assert.equal(bootstrap.csrfToken, 'csrf');
    assert.equal(bootstrap.canCreateFreeProfile, true);
    assert.equal(bootstrap.profileCount, 2);
    assert.equal(bootstrap.recentProfileId, 'profile-2');
    assert.equal(bootstrap.recentConversationId, 'conversation-1');
    assert.equal(bootstrap.features.memoryCandidates, false);
  });
});
