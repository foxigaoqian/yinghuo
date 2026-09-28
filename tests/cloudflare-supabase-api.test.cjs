const test = require('node:test');
const assert = require('node:assert/strict');

function fakeSupabase() {
  const sessions = new Map();
  const profiles = [];
  const memories = [];
  const conversations = [];
  const messages = [];
  const users = [];
  const calls = [];
  const table = {
    app_users: users,
    profiles,
    memories,
    conversations,
    messages,
    profile_preferences: [],
    consents: [],
  };
  const matches = (row, query) =>
    [...query.entries()].every(([key, value]) => {
      if (['select', 'limit', 'order', 'on_conflict'].includes(key)) return true;
      if (value === 'is.null') return row[key] == null;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]));
      throw Error('unexpected query ' + key + '=' + value);
    });
  return {
    calls,
    async fetch(url, options) {
      const address = new URL(url);
      assert.equal(address.hostname, 'sg.supabase.co');
      assert.equal(options.headers.apikey, 'test-server-only-key');
      assert.equal(options.headers.authorization, 'Bearer test-server-only-key');
      const path = address.pathname.slice('/rest/v1/'.length);
      const input = options.body ? JSON.parse(options.body) : undefined;
      calls.push({ path, method: options.method, query: address.searchParams, input });
      if (path.startsWith('rpc/')) {
        const name = path.slice(4);
        if (name === 'yinghuo_create_guest_session') {
          const user = {
            id: crypto.randomUUID(),
            account_kind: 'guest',
            free_slot_consumed_at: null,
            deleted_at: null,
          };
          users.push(user);
          sessions.set(input.p_refresh_hash, user.id);
          return Response.json([{ user_id: user.id, family_code: 'TEST1234' }]);
        }
        if (name === 'yinghuo_get_guest_session') {
          const userId = sessions.get(input.p_refresh_hash);
          return Response.json(
            userId
              ? [
                  {
                    user_id: userId,
                    account_kind: 'guest',
                    family_code: 'TEST1234',
                    expires_at: new Date(Date.now() + 86400000).toISOString(),
                  },
                ]
              : [],
          );
        }
        if (name === 'yinghuo_revoke_guest_session') {
          sessions.delete(input.p_refresh_hash);
          return Response.json(true);
        }
        if (name === 'yinghuo_create_profile') {
          const profile = {
            id: crypto.randomUUID(),
            creator_user_id: input.p_user_id,
            display_name: input.p_display_name,
            status: 'active',
            deleted_at: null,
            created_at: new Date().toISOString(),
          };
          profiles.push(profile);
          const user = users.find((item) => item.id === input.p_user_id);
          user.free_slot_consumed_at = new Date().toISOString();
          table.profile_preferences.push({
            profile_id: profile.id,
            user_id: user.id,
            call_me: input.p_call_me,
          });
          if (input.p_story)
            memories.push({
              id: crypto.randomUUID(),
              profile_id: profile.id,
              owner_user_id: user.id,
              title: '关于TA',
              body: input.p_story,
              use_for_ai: false,
              source_type: 'profile_story',
              confirmation_state: 'confirmed',
              deleted_at: null,
              created_at: new Date().toISOString(),
            });
          return Response.json([profile]);
        }
        throw Error('unexpected RPC: ' + name);
      }
      const data = table[path];
      if (!data) throw Error('unexpected table: ' + path);
      if (options.method === 'GET') {
        let results = data.filter((row) => matches(row, address.searchParams));
        if (address.searchParams.has('limit'))
          results = results.slice(0, Number(address.searchParams.get('limit')));
        return Response.json(results);
      }
      if (options.method === 'POST') {
        const entries = Array.isArray(input) ? input : [input];
        const saved = [];
        for (const row of entries) {
          const existing =
            options.headers.prefer?.includes('merge-duplicates') &&
            data.find((old) => old.profile_id === row.profile_id && old.user_id === row.user_id);
          if (existing) {
            Object.assign(existing, row);
            saved.push(existing);
          } else {
            const record = {
              id: crypto.randomUUID(),
              deleted_at: null,
              created_at: new Date().toISOString(),
              ...row,
            };
            data.push(record);
            saved.push(record);
          }
        }
        return Response.json(saved);
      }
      if (options.method === 'PATCH') {
        const found = data.filter((row) => matches(row, address.searchParams));
        found.forEach((row) => Object.assign(row, input));
        return Response.json(found);
      }
      throw Error('unexpected method');
    },
  };
}

test('Supabase H5 Pages adapter persists a private guest space and never opens payment', async () => {
  const { onRequest } = await import('../functions/api/v1/[[path]].js');
  const backend = fakeSupabase();
  const previousFetch = global.fetch;
  global.fetch = backend.fetch;
  const prompts = [];
  const env = {
    APP_BACKEND: 'supabase',
    SUPABASE_URL: 'https://sg.supabase.co',
    SUPABASE_SECRET_KEY: 'test-server-only-key',
    SESSION_SECRET: 'x'.repeat(48),
    AI: {
      async run(model, input) {
        prompts.push({ model, input });
        return { response: '你留下的记忆里写着一起做饭。' };
      },
    },
  };
  function client() {
    let cookie = '';
    let csrf = '';
    return {
      async request(method, path, input, extra = {}) {
        const req = new Request('https://preview.example.com/api/v1' + path, {
          method,
          headers: {
            ...(cookie ? { cookie } : {}),
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
            ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
            ...extra,
          },
          ...(method === 'GET' ? {} : { body: JSON.stringify(input ?? {}) }),
        });
        const res = await onRequest({ request: req, env });
        if (res.headers.has('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
        const data = await res.json();
        if (path === '/auth/guest' && res.ok) csrf = data.csrfToken;
        return { status: res.status, data, res };
      },
      setCsrf(value) {
        csrf = value;
      },
    };
  }
  try {
    const a = client();
    const b = client();
    assert.equal((await a.request('GET', '/capabilities')).data.mode, 'supabase');
    assert.equal((await a.request('GET', '/bootstrap')).data.features.payment, false);
    assert.equal((await a.request('GET', '/auth/session')).data.userId, null);
    const opened = await a.request('POST', '/auth/guest');
    assert.equal(opened.status, 200);
    assert.match(opened.res.headers.get('set-cookie'), /__Host-yinghuo_session=.*HttpOnly; Secure/);
    assert.equal((await a.request('GET', '/auth/session')).data.userId, opened.data.userId);
    a.setCsrf('bad');
    assert.equal((await a.request('POST', '/profiles', { name: '爸爸' })).status, 403);
    a.setCsrf(opened.data.csrfToken);
    const profile = await a.request('POST', '/profiles', {
      name: '爸爸',
      callMe: '小宇',
      story: '第一次做饭',
      aiConsent: false,
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.data.aiConsent, false);
    assert.equal((await a.request('GET', '/profiles')).data.items.length, 1);
    assert.equal((await a.request('GET', '/bootstrap')).data.canCreateFreeProfile, false);
    const memories = await a.request('GET', '/profiles/' + profile.data.id + '/memories');
    assert.equal(memories.data.items[0].body, '第一次做饭');
    const selected = await a.request('POST', '/profiles/' + profile.data.id + '/memories', {
      title: '晚饭',
      body: '一起做饭',
      useForAi: false,
    });
    assert.equal(selected.status, 200);
    const another = await b.request('POST', '/auth/guest');
    assert.notEqual(another.data.userId, opened.data.userId);
    assert.equal((await b.request('GET', '/profiles/' + profile.data.id)).status, 404);
    assert.equal((await b.request('GET', '/profiles')).data.items.length, 0);
    const foreign = await b.request('POST', '/profiles', { name: '朋友', aiConsent: false });
    const badMemory = await b.request('POST', '/profiles/' + foreign.data.id + '/messages', {
      text: '聊聊',
      aiConsent: true,
      memoryIds: [selected.data.id],
    });
    assert.equal(badMemory.status, 400);
    assert.equal(prompts.length, 0);
    const denied = await a.request('POST', '/profiles/' + profile.data.id + '/messages', {
      text: '今天怎么样',
      memoryIds: [selected.data.id],
    });
    assert.equal(denied.status, 403);
    assert.equal(prompts.length, 0);
    const messageId = crypto.randomUUID();
    const sent = await a.request('POST', '/profiles/' + profile.data.id + '/messages', {
      text: '今天怎么样',
      memoryIds: [selected.data.id],
      aiConsent: true,
      clientMessageId: messageId,
    });
    assert.equal(sent.status, 200);
    assert.deepEqual(
      sent.data.items.map((m) => m.mock),
      [false, false],
    );
    assert.match(prompts[0].input.messages[0].content, /一起做饭/);
    assert.doesNotMatch(prompts[0].input.messages[0].content, /第一次做饭/);
    const again = await a.request('POST', '/profiles/' + profile.data.id + '/messages', {
      text: '今天怎么样',
      memoryIds: [selected.data.id],
      aiConsent: true,
      clientMessageId: messageId,
    });
    assert.equal(again.status, 200);
    assert.equal(prompts.length, 1);
    assert.equal(
      (await a.request('GET', '/profiles/' + profile.data.id + '/messages')).data.items.length,
      2,
    );
    env.AI.run = async () => {
      throw Error('model temporarily unavailable');
    };
    const failed = await a.request('POST', '/profiles/' + profile.data.id + '/messages', {
      text: '还有呢',
      aiConsent: true,
      memoryIds: [],
      clientMessageId: crypto.randomUUID(),
    });
    assert.equal(failed.status, 503);
    assert.equal(
      (await a.request('GET', '/profiles/' + profile.data.id + '/messages')).data.items.length,
      2,
    );
    assert.equal((await a.request('POST', '/orders', { profileId: profile.data.id })).status, 503);
    assert.equal((await a.request('POST', '/auth/logout')).status, 200);
    assert.equal((await a.request('GET', '/auth/session')).data.userId, null);
    assert.ok(
      backend.calls.every((call) => !JSON.stringify(call).includes('test-server-only-key')),
    );
  } finally {
    global.fetch = previousFetch;
  }
});
