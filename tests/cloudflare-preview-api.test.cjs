const test = require('node:test');
const assert = require('node:assert/strict');

function fakeKV() {
  const items = new Map();
  return {
    async get(key, format) {
      const value = items.get(key);
      return !value ? null : format === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      items.set(key, value);
    },
    async delete(key) {
      items.delete(key);
    },
  };
}

async function makeClient(kv) {
  const { onRequest } = await import('../functions/api/v1/[[path]].js');
  let cookie = '';
  let csrf = '';
  return {
    async request(method, path, input, headers = {}) {
      const request = new Request('https://preview.example.com/api/v1' + path, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
          ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        ...(method === 'GET' ? {} : { body: JSON.stringify(input ?? {}) }),
      });
      const response = await onRequest({ request, env: { DEMO_DATA: kv } });
      if (response.headers.has('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      const body = await response.json();
      if (path === '/dev/session' && response.ok) csrf = body.csrfToken;
      return { status: response.status, body, response };
    },
    clearCsrf() {
      csrf = '';
    },
  };
}

test('Cloudflare H5 preview starts with JSON and walks through the demo flow', async () => {
  const kv = fakeKV();
  const client = await makeClient(kv);
  const caps = await client.request('GET', '/capabilities');
  assert.equal(caps.status, 200);
  assert.equal(caps.body.mode, 'demo');
  assert.match(caps.response.headers.get('content-type'), /application\/json/);

  const anonymous = await client.request('GET', '/auth/session');
  assert.equal(anonymous.body.userId, null);
  assert.equal((await client.request('GET', '/bootstrap')).body.features.hostedPreview, true);

  const login = await client.request('POST', '/dev/session');
  assert.equal(login.status, 200);
  assert.match(login.response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);

  const badCsrf = await client.request(
    'POST',
    '/profiles',
    { name: '阿树', callMe: '', story: '', aiConsent: true },
    { 'x-csrf-token': 'invalid' },
  );
  assert.equal(badCsrf.status, 403);
  assert.equal(badCsrf.body.error.code, 'BAD_CSRF');

  const created = await client.request('POST', '/profiles', {
    name: '阿树',
    callMe: '小宇',
    story: '虚构的演示人物',
    aiConsent: true,
  });
  assert.equal(created.status, 200);
  assert.equal((await client.request('GET', '/profiles')).body.items[0].name, '阿树');

  const memory = await client.request('POST', '/profiles/' + created.body.id + '/memories', {
    title: '窗边的花',
    body: '这是一段虚构记忆。',
    useForAi: true,
  });
  assert.equal(memory.status, 200);

  const messageId = crypto.randomUUID();
  const sent = await client.request('POST', '/profiles/' + created.body.id + '/messages', {
    text: '今天过得好吗？',
    clientMessageId: messageId,
  });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.items.length, 2);
  assert.match(sent.body.items[1].text, /并非本人/);
  const retry = await client.request('POST', '/profiles/' + created.body.id + '/messages', {
    text: '今天过得好吗？',
    clientMessageId: messageId,
  });
  assert.deepEqual(
    retry.body.items.map((m) => m.id),
    sent.body.items.map((m) => m.id),
  );
  assert.equal(
    (await client.request('GET', '/profiles/' + created.body.id + '/messages')).body.items.length,
    2,
  );

  const post = await client.request('POST', '/square', {
    title: '虚构的故事',
    body: '这是一段虚构内容。',
    visibility: 'public',
    publicConsent: true,
  });
  assert.equal(post.body.moderation, 'pending');
  assert.equal((await client.request('GET', '/square')).body.items.length, 0);
  assert.equal((await client.request('GET', '/square?view=mine')).body.items.length, 1);

  const key = crypto.randomUUID();
  const order = await client.request(
    'POST',
    '/orders',
    { productId: 'memory-year', profileId: created.body.id },
    { 'idempotency-key': key },
  );
  assert.equal(order.status, 200);
  assert.equal(order.body.priceFen, 9900);
  const orderRetry = await client.request(
    'POST',
    '/orders',
    { productId: 'memory-year', profileId: created.body.id },
    { 'idempotency-key': key },
  );
  assert.equal(orderRetry.body.id, order.body.id);
  assert.equal((await client.request('GET', '/orders')).body.items.length, 1);
  const paid = await client.request('POST', '/orders/' + order.body.id + '/dev-pay', {
    confirmMock: true,
  });
  assert.equal(paid.body.status, 'paid');

  const other = await makeClient(kv);
  await other.request('POST', '/dev/session');
  assert.equal((await other.request('GET', '/profiles')).body.items.length, 0);
  assert.equal((await other.request('GET', '/profiles/' + created.body.id)).status, 404);

  assert.equal((await client.request('GET', '/missing')).status, 404);
  assert.equal((await client.request('POST', '/auth/logout')).status, 200);
  assert.equal((await client.request('GET', '/auth/session')).body.userId, null);
});
