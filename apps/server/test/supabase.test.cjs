const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { SupabaseDataApi, SupabaseDataApiError } = require('../dist/supabase-data-api');
const { SupabaseGuestAuth } = require('../dist/supabase-auth');
const { SupabasePublicController } = require('../dist/supabase-app');
const { validateEnvironment } = require('../dist/config');

describe('Supabase server integration', () => {
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
