const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.APP_MODE = 'demo';
process.env.DEMO_DATA_FILE = ':memory:';
const { createApp } = require('../dist/bootstrap');
const { validateEnvironment } = require('../dist/config');
const { DemoStore } = require('../dist/demo-store');
const { MockChatProvider } = require('../dist/providers');

describe('local demo API', () => {
  let app, server, a, b, csrf, otherCsrf, profile, order;
  before(async () => {
    app = await createApp();
    server = app.getHttpServer();
    a = request.agent(server);
    b = request.agent(server);
    csrf = (await a.post('/api/v1/dev/session').send({})).body.csrfToken;
    otherCsrf = (await b.post('/api/v1/dev/session').send({})).body.csrfToken;
  });
  after(async () => {
    await app.close();
  });
  it('reports honest capabilities and no live services', async () => {
    const r = await request(server).get('/api/v1/health').expect(200);
    assert.equal(r.body.liveServices, false);
    assert.equal(r.body.mode, 'demo');
  });
  it('denies anonymous access', async () => {
    await request(server).get('/api/v1/profiles').expect(401);
  });
  it('sets an HttpOnly SameSite strict session cookie', async () => {
    const r = await a.post('/api/v1/dev/session').send({}).expect(201);
    csrf = r.body.csrfToken;
    assert.match(r.headers['set-cookie'][0], /HttpOnly/);
    assert.match(r.headers['set-cookie'][0], /SameSite=Strict/);
  });
  it('rejects cross-origin login and missing CSRF', async () => {
    await request(server)
      .post('/api/v1/dev/session')
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
    await a.post('/api/v1/profiles').send({ name: '妈妈', aiConsent: true }).expect(403);
  });
  it('validates consent and rejects client owner injection', async () => {
    await a
      .post('/api/v1/profiles')
      .set('x-csrf-token', csrf)
      .send({ name: '妈妈', aiConsent: false })
      .expect(400);
    await a
      .post('/api/v1/profiles')
      .set('x-csrf-token', csrf)
      .send({ name: '妈妈', aiConsent: true, ownerId: 'other' })
      .expect(400);
  });
  it('creates a space with defaults', async () => {
    const r = await a
      .post('/api/v1/profiles')
      .set('x-csrf-token', csrf)
      .send({ name: '演示妈妈', aiConsent: true })
      .expect(201);
    profile = r.body;
    assert.equal(profile.callMe, '');
    assert.ok(profile.id);
  });
  it('isolates profiles and memories between users', async () => {
    await b.get('/api/v1/profiles/' + profile.id).expect(404);
    await b
      .post('/api/v1/profiles/' + profile.id + '/memories')
      .set('x-csrf-token', otherCsrf)
      .send({ title: '越权', body: 'test' })
      .expect(404);
    assert.equal((await b.get('/api/v1/profiles')).body.items.length, 0);
  });
  it('persists private text memory and defaults AI access off', async () => {
    const r = await a
      .post('/api/v1/profiles/' + profile.id + '/memories')
      .set('x-csrf-token', csrf)
      .send({ title: '私人秘密', body: '不能用于AI' })
      .expect(201);
    assert.equal(r.body.useForAi, false);
    assert.equal(
      (await a.get('/api/v1/profiles/' + profile.id + '/memories')).body.items.length,
      1,
    );
  });
  it('labels mock chat and excludes unconsented memories', async () => {
    const r = await a
      .post('/api/v1/profiles/' + profile.id + '/messages')
      .set('x-csrf-token', csrf)
      .send({ text: '今天有点累' })
      .expect(201);
    assert.equal(r.body.items[1].mock, true);
    assert.match(r.body.items[1].text, /AI 演示/);
    assert.doesNotMatch(r.body.items[1].text, /私人秘密/);
    await b.get('/api/v1/profiles/' + profile.id + '/messages').expect(404);
  });
  it('sets prices server-side and makes duplicate orders idempotent', async () => {
    const payload = { profileId: profile.id, productId: 'memory-year' };
    await a
      .post('/api/v1/orders')
      .set('x-csrf-token', csrf)
      .set('idempotency-key', 'tamper-key')
      .send({ ...payload, priceFen: 1 })
      .expect(400);
    const r = await a
      .post('/api/v1/orders')
      .set('x-csrf-token', csrf)
      .set('idempotency-key', 'order-key-1')
      .send(payload)
      .expect(201);
    order = r.body;
    assert.equal(order.priceFen, 9900);
    assert.equal(order.status, 'pending_payment');
    const again = await a
      .post('/api/v1/orders')
      .set('x-csrf-token', csrf)
      .set('idempotency-key', 'order-key-1')
      .send(payload);
    assert.equal(again.body.id, order.id);
    await a
      .post('/api/v1/orders')
      .set('x-csrf-token', csrf)
      .set('idempotency-key', 'order-key-1')
      .send({ ...payload, productId: 'photo-restore' })
      .expect(409);
  });
  it('enforces order ownership and transitions', async () => {
    await b
      .post('/api/v1/orders/' + order.id + '/dev-pay')
      .set('x-csrf-token', otherCsrf)
      .send({ confirmMock: true })
      .expect(404);
    await a
      .post('/api/v1/orders/' + order.id + '/dev-refund')
      .set('x-csrf-token', csrf)
      .send({ confirmMock: true })
      .expect(409);
    const p = await a
      .post('/api/v1/orders/' + order.id + '/dev-pay')
      .set('x-csrf-token', csrf)
      .send({ confirmMock: true })
      .expect(201);
    assert.equal(p.body.status, 'paid');
    const r = await a
      .post('/api/v1/orders/' + order.id + '/dev-refund')
      .set('x-csrf-token', csrf)
      .send({ confirmMock: true })
      .expect(201);
    assert.equal(r.body.status, 'refunded');
    await a
      .post('/api/v1/orders/' + order.id + '/dev-pay')
      .set('x-csrf-token', csrf)
      .send({ confirmMock: true })
      .expect(409);
  });
  it('holds public stories for review, private by default', async () => {
    const draft = await a
      .post('/api/v1/square')
      .set('x-csrf-token', csrf)
      .send({ title: '演示故事', body: '虚构素材' })
      .expect(201);
    assert.equal(draft.body.visibility, 'private');
    await a
      .post('/api/v1/square')
      .set('x-csrf-token', csrf)
      .send({ title: '故事', body: '正文', visibility: 'public' })
      .expect(400);
    const pub = await a
      .post('/api/v1/square')
      .set('x-csrf-token', csrf)
      .send({ title: '故事', body: '正文', visibility: 'public', publicConsent: true })
      .expect(201);
    assert.equal(pub.body.moderation, 'pending');
    assert.equal((await b.get('/api/v1/square')).body.items.length, 0);
    assert.equal((await b.get('/api/v1/square?view=mine')).body.items.length, 0);
  });
  it('keeps admin closed until a strong token is configured', async () => {
    await request(server).get('/api/v1/dev/admin/overview').expect(403);
  });
  it('revokes current session on logout', async () => {
    await a.post('/api/v1/auth/logout').set('x-csrf-token', csrf).send({}).expect(201);
    await a.get('/api/v1/profiles').expect(401);
  });
});
describe('configuration safety', () => {
  it('refuses production and incomplete live adapters', () => {
    assert.throws(() => validateEnvironment({ NODE_ENV: 'production' }));
    assert.throws(() => validateEnvironment({ APP_MODE: 'live' }));
    assert.throws(() => validateEnvironment({ AI_PROVIDER: 'openai' }));
    assert.throws(() => validateEnvironment({ API_PORT: 'oops' }));
  });
  it('keeps local data across store instances', () => {
    const { mkdtempSync, rmSync } = require('node:fs');
    const { tmpdir } = require('node:os');
    const { join } = require('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'yinghuo-store-'));
    try {
      process.env.DEMO_DATA_FILE = join(dir, 'demo.json');
      const first = new DemoStore();
      first.state.profiles.push({ id: 'test' });
      first.save();
      assert.equal(new DemoStore().state.profiles.length, 1);
    } finally {
      process.env.DEMO_DATA_FILE = ':memory:';
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('only uses explicitly consented memory', async () => {
    const result = await new MockChatProvider().reply({
      profile: {},
      text: '你好',
      memories: [
        { title: 'secret', useForAi: false },
        { title: 'consented', useForAi: true },
      ],
    });
    assert.match(result.text, /consented/);
    assert.doesNotMatch(result.text, /secret/);
  });
});
