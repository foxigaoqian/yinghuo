const test = require('node:test');
const assert = require('node:assert/strict');

function fakeSupabase() {
  const sessions = new Map();
  const recoveryCodes = new Map();
  const recoveryAttempts = new Map();
  const profiles = [];
  const memories = [];
  const conversations = [];
  const messages = [];
  const recoveryRows = [];
  const users = [];
  const calls = [];
  const table = {
    app_users: users,
    profiles,
    profile_avatars: [],
    memories,
    conversations,
    messages,
    profile_preferences: [],
    consents: [],
    private_stories: [],
    story_reactions: [],
    story_comments: [],
    story_comment_reports: [],
    account_recovery_codes: recoveryRows,
    user_feedback: [],
  };
  const matches = (row, query) =>
    [...query.entries()].every(([key, value]) => {
      if (['select', 'limit', 'offset', 'order', 'on_conflict'].includes(key)) return true;
      if (value === 'is.null') return row[key] == null;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]));
      throw Error('unexpected query ' + key + '=' + value);
    });
  return {
    calls,
    table,
    async fetch(url, options) {
      const address = new URL(url);
      assert.equal(address.hostname, 'sg.supabase.co');
      assert.equal(options.headers.apikey, 'test-server-only-key');
      assert.equal(options.headers.authorization, undefined);
      const path = address.pathname.slice('/rest/v1/'.length);
      const input = options.body ? JSON.parse(options.body) : undefined;
      calls.push({ path, method: options.method, query: address.searchParams, input });
      if (path.startsWith('rpc/')) {
        const name = path.slice(4);
        if (name === 'yinghuo_create_guest_session') {
          const user = {
            id: crypto.randomUUID(),
            display_name: '',
            status: 'active',
            account_kind: 'guest',
            family_code: 'TEST1234',
            free_slot_consumed_at: null,
            phone_hash: null,
            phone_last4: null,
            phone_verified: false,
            gender: null,
            birth_year: null,
            merged_into_user_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
          };
          users.push(user);
          sessions.set(input.p_refresh_hash, user.id);
          return Response.json([{ user_id: user.id, family_code: 'TEST1234' }]);
        }
        if (name === 'yinghuo_get_guest_session') {
          const userId = sessions.get(input.p_refresh_hash);
          const user = users.find((item) => item.id === userId);
          return Response.json(
            user
              ? [
                  {
                    user_id: user.id,
                    account_kind: user.account_kind,
                    family_code: user.family_code,
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
        if (name === 'yinghuo_set_recovery_code') {
          const user = users.find((item) => item.id === input.p_user_id);
          if (!user) return Response.json(false);
          recoveryCodes.set(user.id, input.p_code_hash);
          const existing = recoveryRows.find((item) => item.user_id === user.id);
          if (existing) existing.rotated_at = new Date().toISOString();
          else
            recoveryRows.push({
              user_id: user.id,
              created_at: new Date().toISOString(),
              rotated_at: null,
            });
          return Response.json(true);
        }
        if (
          name === 'yinghuo_recover_guest_session' ||
          name === 'yinghuo_recover_guest_session_v2'
        ) {
          const attempts = recoveryAttempts.get(input.p_attempt_hash) || 0;
          if (attempts >= 8) {
            return Response.json([
              {
                status: 'rate_limited',
                user_id: null,
                account_kind: null,
                family_code: null,
                expires_at: null,
              },
            ]);
          }
          recoveryAttempts.set(input.p_attempt_hash, attempts + 1);
          const user = users.find(
            (item) =>
              item.family_code === input.p_family_code &&
              recoveryCodes.get(item.id) === input.p_code_hash,
          );
          if (!user) {
            return Response.json([
              {
                status: 'invalid',
                user_id: null,
                account_kind: null,
                family_code: null,
                expires_at: null,
              },
            ]);
          }
          sessions.set(input.p_refresh_hash, user.id);
          return Response.json([
            {
              status: 'ok',
              user_id: user.id,
              account_kind: user.account_kind,
              family_code: user.family_code,
              expires_at: input.p_expires_at,
            },
          ]);
        }
        if (name === 'yinghuo_get_app_state') {
          const owner = sessions.get(input.p_refresh_hash);
          const user = users.find((item) => item.id === owner);
          if (!user) return Response.json(null);
          const own = profiles.filter((item) => item.creator_user_id === owner && !item.deleted_at);
          const current = own.find((p) => p.id === input.p_requested_profile_id) || own[0];
          const mapped = own.map((p) => ({
            id: p.id,
            ownerId: owner,
            name: p.display_name,
            relationship: p.relationship || p.display_name,
            aiConsent: false,
          }));
          return Response.json({
            session: { userId: owner, accountKind: 'guest', familyCode: user.family_code },
            bootstrap: {
              features: { textChat: true },
              recoveryConfigured: recoveryCodes.has(owner),
            },
            profiles: mapped,
            currentProfileId: current?.id || null,
            memories: memories
              .filter(
                (m) => m.owner_user_id === owner && m.profile_id === current?.id && !m.deleted_at,
              )
              .map((m) => ({ id: m.id, body: m.body })),
            messages: [],
            posts: [],
            orders: [],
          });
        }
        if (name === 'yinghuo_reset_conversation') {
          const c = conversations.find(
            (c) => c.user_id === input.p_user_id && c.profile_id === input.p_profile_id,
          );
          if (c) {
            messages
              .filter((m) => m.conversation_id === c.id && m.epoch === c.epoch)
              .forEach((m) => (m.status = 'archived'));
            c.epoch += 1;
          }
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
        const offset = Number(address.searchParams.get('offset') || 0);
        results = results.slice(offset);
        if (address.searchParams.has('limit'))
          results = results.slice(0, Number(address.searchParams.get('limit')));
        return Response.json(results);
      }
      if (options.method === 'POST') {
        if (path === 'messages' && Array.isArray(input) && input.length > 1) {
          const expectedKeys = Object.keys(input[0]).sort();
          for (const row of input.slice(1)) {
            assert.deepEqual(
              Object.keys(row).sort(),
              expectedKeys,
              'PostgREST bulk inserts require every object to use the same keys',
            );
          }
        }
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
        if ((path === '/auth/guest' || path === '/auth/recover') && res.ok) csrf = data.csrfToken;
        return { status: res.status, data, res };
      },
      async raw(method, path) {
        const req = new Request('https://preview.example.com/api/v1' + path, {
          method,
          headers: {
            ...(cookie ? { cookie } : {}),
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          },
        });
        return onRequest({ request: req, env });
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
    const recoveryBundle = await a.request('POST', '/auth/recovery-code');
    assert.equal(recoveryBundle.status, 200);
    assert.equal(recoveryBundle.data.familyCode, 'TEST1234');
    assert.match(recoveryBundle.data.recoveryCode, /^YH(?:-[A-HJ-NP-Z2-9]{4}){5}$/);
    assert.equal(
      (await a.request('POST', '/auth/bind-phone', { phone: '12800000000' })).status,
      400,
    );
    const bound = await a.request('POST', '/auth/bind-phone', {
      phone: '13800138000',
    });
    assert.equal(bound.status, 200);
    assert.equal(bound.data.boundPhone, '尾号 8000');
    assert.equal(bound.data.phoneVerified, false);
    const boundBootstrap = await a.request('GET', '/bootstrap');
    assert.equal(boundBootstrap.data.accountState, 'guest');
    assert.equal(boundBootstrap.data.boundPhone, '尾号 8000');
    assert.ok(
      backend.calls.every((call) => !JSON.stringify(call.input || '').includes('13800138000')),
      'the full phone number is never persisted to Supabase',
    );
    a.setCsrf('bad');
    assert.equal((await a.request('POST', '/profiles', { name: '爸爸' })).status, 403);
    a.setCsrf(opened.data.csrfToken);
    const profile = await a.request('POST', '/profiles', {
      name: '老爸',
      relationship: '爸爸',
      nickname: '老爸',
      avatarDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      callMe: '小宇',
      story: '第一次做饭',
      aiConsent: false,
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.data.name, '老爸');
    assert.equal(profile.data.relationship, '爸爸');
    assert.equal(profile.data.nickname, '老爸');
    assert.match(
      profile.data.avatarUrl,
      new RegExp('/api/v1/profiles/' + profile.data.id + '/avatar'),
    );
    const avatar = await a.raw('GET', '/profiles/' + profile.data.id + '/avatar');
    assert.equal(avatar.status, 200);
    assert.equal(avatar.headers.get('content-type'), 'image/png');
    assert.equal(profile.data.aiConsent, false);
    assert.equal((await a.request('GET', '/profiles')).data.items.length, 1);
    const recovered = client();
    assert.equal(
      (
        await recovered.request('POST', '/auth/recover', {
          familyCode: 'TEST1234',
          recoveryCode: 'YH-AAAA-AAAA-AAAA-AAAA-AAAA',
        })
      ).status,
      400,
    );
    const restored = await recovered.request('POST', '/auth/recover', recoveryBundle.data);
    assert.equal(restored.status, 200);
    assert.equal(restored.data.userId, opened.data.userId);
    assert.equal((await recovered.request('GET', '/profiles')).data.items.length, 1);
    const recoveryPassword = '灯下的晚风2026';
    const passwordSet = await a.request('POST', '/auth/recovery-password', {
      password: recoveryPassword,
    });
    assert.equal(passwordSet.status, 200);
    assert.equal(passwordSet.data.recoveryConfigured, true);
    const phoneRecovered = client();
    const restoredByPhone = await phoneRecovered.request('POST', '/auth/recover', {
      identifier: '13800138000',
      password: recoveryPassword,
    });
    assert.equal(restoredByPhone.status, 200);
    assert.equal(restoredByPhone.data.userId, opened.data.userId);
    assert.equal((await a.request('GET', '/bootstrap')).data.canCreateFreeProfile, false);
    const memories = await a.request('GET', '/profiles/' + profile.data.id + '/memories');
    assert.equal(memories.data.items[0].body, '第一次做饭');
    const callsBeforeState = backend.calls.length;
    const appState = await a.request('GET', '/app-state?profileId=' + profile.data.id);
    assert.equal(appState.status, 200);
    assert.equal(appState.data.session.userId, opened.data.userId);
    assert.equal(appState.data.currentProfileId, profile.data.id);
    assert.equal(appState.data.profiles.length, 1);
    assert.equal(appState.data.memories[0].body, '第一次做饭');
    assert.equal(appState.data.bootstrap.recoveryConfigured, true);
    assert.deepEqual(appState.data.messages, []);
    assert.deepEqual(appState.data.posts, []);
    assert.equal(backend.calls.length - callsBeforeState, 1, 'state hydration uses one RPC');
    assert.equal(
      backend.calls
        .slice(callsBeforeState)
        .some((call) => call.path === 'messages' || call.path === 'private_stories'),
      false,
    );
    const selected = await a.request('POST', '/profiles/' + profile.data.id + '/memories', {
      title: '晚饭',
      body: '一起做饭',
      useForAi: false,
    });
    assert.equal(selected.status, 200);
    const another = await b.request('POST', '/auth/guest');
    assert.notEqual(another.data.userId, opened.data.userId);
    assert.equal(
      (await b.request('POST', '/auth/bind-phone', { phone: '13800138000' })).status,
      409,
    );
    assert.equal((await b.request('GET', '/profiles/' + profile.data.id)).status, 404);
    assert.equal((await b.request('GET', '/profiles')).data.items.length, 0);
    const privateStory = await a.request('POST', '/square', {
      title: '窗边的下午',
      body: '她喜欢在窗台养花。',
      visibility: 'private',
    });
    assert.equal(privateStory.status, 200);
    assert.equal(privateStory.data.moderation, 'private');
    assert.equal(privateStory.data.authorName, '我');
    const ownStories = await a.request('GET', '/square?view=mine');
    assert.equal(ownStories.data.items[0].title, '窗边的下午');
    assert.equal(ownStories.data.items[0].authorName, '我');
    assert.equal((await a.request('GET', '/square/' + privateStory.data.id)).data.authorName, '我');
    assert.equal((await a.request('GET', '/square')).data.items.length, 0);
    assert.equal((await b.request('GET', '/square?view=mine')).data.items.length, 0);
    const removable = await a.request('POST', '/profiles/' + profile.data.id + '/memories', {
      title: '准备删除',
      body: '这是一条删除功能测试记忆',
      useForAi: false,
    });
    assert.equal((await b.request('DELETE', '/memories/' + removable.data.id)).status, 404);
    assert.equal((await a.request('DELETE', '/memories/' + removable.data.id)).status, 200);
    assert.equal(
      (await a.request('GET', '/profiles/' + profile.data.id + '/memories')).data.items.some(
        (item) => item.id === removable.data.id,
      ),
      false,
    );
    const publicStory = await a.request('POST', '/square', {
      title: '公开',
      body: '等待审核后展示',
      media: ['data:image/jpeg;base64,/9j/2Q=='],
      visibility: 'public',
      publicConsent: true,
    });
    assert.equal(publicStory.status, 200);
    assert.equal(publicStory.data.visibility, 'public');
    assert.equal(publicStory.data.moderation, 'pending');
    assert.equal((await a.request('GET', '/square?view=public')).data.items.length, 0);
    assert.equal((await a.request('GET', '/admin/stories')).status, 401);
    env.ADMIN_REVIEW_TOKEN = 'review-test-token-long-enough';
    const reviewer = { authorization: 'Bearer ' + env.ADMIN_REVIEW_TOKEN };
    const overview = await a.request('GET', '/admin/overview', undefined, reviewer);
    assert.equal(overview.status, 200);
    assert.equal(overview.data.users.total, 2);
    assert.equal(overview.data.profiles, 1);
    assert.equal(overview.data.stories.pending, 1);
    const managedUsers = await a.request('GET', '/admin/users', undefined, reviewer);
    assert.equal(managedUsers.status, 200);
    assert.equal(managedUsers.data.items.length, 2);
    assert.ok(managedUsers.data.items.some((item) => item.profileCount === 1));
    const suspended = await a.request(
      'PATCH',
      '/admin/users/' + another.data.userId,
      { status: 'suspended' },
      reviewer,
    );
    assert.equal(suspended.status, 200);
    assert.equal(suspended.data.status, 'suspended');
    assert.equal(
      (
        await a.request(
          'PATCH',
          '/admin/users/' + another.data.userId,
          { status: 'active' },
          reviewer,
        )
      ).data.status,
      'active',
    );
    assert.equal((await a.request('GET', '/admin/feedback', undefined, reviewer)).status, 200);
    const reviewStories = await a.request('GET', '/admin/stories', undefined, reviewer);
    assert.equal(reviewStories.data.items.length, 1);
    assert.deepEqual(reviewStories.data.items[0].media, ['data:image/jpeg;base64,/9j/2Q==']);
    const published = await a.request(
      'PATCH',
      '/admin/stories/' + publicStory.data.id,
      { decision: 'published' },
      reviewer,
    );
    assert.equal(published.status, 200);
    const publicStories = await b.request('GET', '/square?view=public');
    assert.equal(publicStories.data.items.length, 1);
    assert.equal(publicStories.data.items[0].authorName, '一位萤火朋友');
    const rejected = await a.request(
      'PATCH',
      '/admin/stories/' + publicStory.data.id,
      { decision: 'rejected', reason: '请移除可识别的信息' },
      reviewer,
    );
    assert.equal(rejected.status, 200);
    assert.equal((await b.request('GET', '/square?view=public')).data.items.length, 0);
    const contact = await a.request('POST', '/square', {
      title: '联系我',
      body: '手机号 13800138000',
      visibility: 'public',
      publicConsent: true,
    });
    assert.equal(contact.data.moderation, 'rejected');
    const ordinary = await a.request('POST', '/square', {
      title: '那通电话',
      body: '还记得爸爸打电话叮嘱我带伞。',
      visibility: 'public',
      publicConsent: true,
    });
    assert.equal(ordinary.data.moderation, 'pending');
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
    assert.match(prompts[0].input.messages[0].content, /人物对用户的称呼："小宇"/);
    assert.match(prompts[0].input.messages[0].content, /不要主动解释身份/);
    assert.match(prompts[0].input.messages[0].content, /先直接回答用户字面上说的话/);
    assert.match(prompts[0].input.messages[0].content, /不要分析用户情绪/);
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
    env.AI.run = async (model, input) => {
      prompts.push({ model, input });
      return { response: '听起来你今天很想念他。今天是什么让你想起他的？' };
    };
    const withoutMemory = await a.request('POST', '/profiles/' + profile.data.id + '/messages', {
      text: '我今天又想起他了',
      aiConsent: true,
      memoryIds: [],
      clientMessageId: crypto.randomUUID(),
    });
    assert.equal(withoutMemory.status, 200);
    assert.equal(prompts.length, 2);
    assert.doesNotMatch(prompts[1].input.messages[0].content, /一起做饭/);
    assert.deepEqual(
      prompts[1].input.messages.slice(1, -1).map((message) => message.role),
      [],
    );
    const promptsBeforeCrisis = prompts.length;
    const crisis = await a.request('POST', '/profiles/' + profile.data.id + '/messages', {
      text: '爷爷，我不想活了，想去陪你',
      aiConsent: true,
      memoryIds: [],
      clientMessageId: crypto.randomUUID(),
    });
    assert.equal(crisis.status, 200);
    assert.match(crisis.data.items[1].text, /12356/);
    assert.match(crisis.data.items[1].text, /110 或 120/);
    assert.equal(prompts.length, promptsBeforeCrisis, '危机消息不应进入普通模型生成');
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
      6,
    );
    const reset = await a.request('POST', '/profiles/' + profile.data.id + '/messages/reset');
    assert.equal(reset.status, 200);
    assert.ok(
      backend.calls.some((call) => call.path === 'rpc/yinghuo_reset_conversation'),
      'reset runs as a single database transaction',
    );
    assert.equal(
      (await a.request('GET', '/profiles/' + profile.data.id + '/messages')).data.items.length,
      0,
    );
    env.AI.run = async (model, input) => {
      prompts.push({ model, input });
      return { response: '我们可以从现在重新聊起。' };
    };
    const afterReset = await a.request('POST', '/profiles/' + profile.data.id + '/messages', {
      text: '重新开始吧',
      aiConsent: true,
      memoryIds: [],
      clientMessageId: crypto.randomUUID(),
    });
    assert.equal(afterReset.status, 200);
    assert.deepEqual(prompts.at(-1).input.messages.slice(1, -1), []);
    const conversation = backend.table.conversations.find(
      (row) => row.profile_id === profile.data.id,
    );
    for (let i = 0; i < 1001; i++)
      backend.table.messages.push({
        id: crypto.randomUUID(),
        conversation_id: conversation.id,
        role: 'user',
        text: `分页导出验证 ${i}`,
        status: 'archived',
        epoch: 0,
        created_at: new Date().toISOString(),
      });
    const exported = await a.request('GET', '/account/export');
    assert.equal(exported.status, 200);
    assert.equal(
      exported.data.messages.length,
      1009,
      'export includes every page and archived conversations',
    );
    for (const key of ['profilePreferences', 'profileAvatars', 'consents', 'feedback']) {
      assert.ok(Array.isArray(exported.data[key]), `export includes ${key}`);
    }
    assert.equal((await a.request('POST', '/orders', { profileId: profile.data.id })).status, 503);
    assert.equal((await a.request('POST', '/auth/logout')).status, 200);
    assert.equal((await a.request('GET', '/auth/session')).data.userId, null);
    assert.ok(
      backend.calls.every((call) => !JSON.stringify(call).includes('test-server-only-key')),
    );
    assert.ok(
      backend.calls.every(
        (call) => !JSON.stringify(call).includes(recoveryBundle.data.recoveryCode),
      ),
    );
  } finally {
    global.fetch = previousFetch;
  }
});

test('Supabase H5 Pages adapter auto-detects a scoped Edge gateway without a database key', async () => {
  const { onRequest } = await import('../functions/api/v1/[[path]].js');
  const previousFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    assert.equal(
      String(url),
      'https://wabohmofgmgfffpmaorh.supabase.co/functions/v1/yinghuo-data-gateway',
    );
    assert.equal(options.headers['x-yinghuo-backend-token'], 'test-edge-token');
    assert.equal(options.headers['x-region'], 'ap-southeast-1');
    assert.equal(options.headers.apikey, undefined);
    const payload = JSON.parse(options.body);
    if (payload.operation === 'health') {
      return Response.json({ status: 'ok', database: 'connected' });
    }
    assert.equal(payload.operation, 'database');
    assert.equal(payload.resource, 'rpc/yinghuo_create_guest_session');
    assert.equal(payload.method, 'POST');
    return Response.json([{ user_id: crypto.randomUUID(), family_code: 'TEST1234' }]);
  };
  try {
    const response = await onRequest({
      request: new Request('https://stage.example.com/api/v1/health'),
      env: {
        SUPABASE_EDGE_SHARED_SECRET: 'test-edge-token',
        SESSION_SECRET: 'x'.repeat(48),
        AI: { run() {} },
      },
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.mode, 'supabase');
    assert.equal(data.persistence, 'supabase-edge-gateway');
    assert.equal(data.databaseStatus, 'connected');

    const guest = await onRequest({
      request: new Request('https://stage.example.com/api/v1/auth/guest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://stage.example.com',
        },
        body: '{}',
      }),
      env: {
        SUPABASE_EDGE_SHARED_SECRET: 'test-edge-token',
        SESSION_SECRET: 'x'.repeat(48),
        AI: { run() {} },
      },
    });
    assert.equal(guest.status, 200);
    assert.equal(typeof (await guest.json()).userId, 'string');
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = previousFetch;
  }
});

test('OpenAI moderation publishes safe stories and routes flagged content to review', async () => {
  const { moderatePublicStory } = await import('../lib/pages-supabase-h5.js');
  const previousFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return Response.json({ results: [{ flagged: false }] });
  };
  try {
    const safe = await moderatePublicStory(
      { OPENAI_API_KEY: 'test-openai-secret' },
      '窗边的花',
      '今天也想起了你。',
      ['data:image/jpeg;base64,/9j/2Q=='],
    );
    assert.deepEqual(safe, { moderation: 'published', reason: '自动审核通过' });
    assert.equal(requests[0].url, 'https://api.openai.com/v1/moderations');
    assert.equal(requests[0].options.headers.authorization, 'Bearer test-openai-secret');
    const sent = JSON.parse(requests[0].options.body);
    assert.equal(sent.model, 'omni-moderation-latest');
    assert.equal(sent.input[0].type, 'text');
    assert.equal(sent.input[1].type, 'image_url');
    assert.doesNotMatch(requests[0].options.body, /test-openai-secret/);

    global.fetch = async () => Response.json({ results: [{ flagged: true }] });
    const flagged = await moderatePublicStory(
      { OPENAI_API_KEY: 'test-openai-secret' },
      '需要确认',
      '这段内容需要进一步审核。',
    );
    assert.equal(flagged.moderation, 'pending');
    assert.match(flagged.reason, /人工审核/);

    global.fetch = async () => new Response('unauthorized', { status: 401 });
    const unavailable = await moderatePublicStory(
      { OPENAI_API_KEY: 'test-openai-secret' },
      '接口异常',
      '内容不会被误放行。',
    );
    assert.equal(unavailable.moderation, 'pending');
  } finally {
    global.fetch = previousFetch;
  }
});

test('AI router prefers SquareFace and falls back to Workers AI without exposing the key', async () => {
  const { aiProvider, generateAiReply } = await import('../lib/yinghuo-ai.js');
  const previousFetch = global.fetch;
  const requests = [];
  let fallbackCalls = 0;
  const env = {
    SQUAREFACE_API_KEY: 'test-squareface-secret',
    SQUAREFACE_BASE_URL: 'https://api.sqface.sbs/v1',
    SQUAREFACE_CHAT_MODEL: 'claude-sonnet-5',
    AI: {
      async run(model, input) {
        fallbackCalls += 1;
        assert.equal(model, '@cf/meta/llama-3.1-8b-instruct-fp8');
        assert.equal(input.messages[0].content, 'system prompt');
        return { response: 'Workers AI 回退正常。' };
      },
    },
  };
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return Response.json({ choices: [{ message: { content: '中转站主模型响应正常。' } }] });
  };
  try {
    assert.equal(aiProvider(env), 'squareface-with-workers-ai-fallback');
    const messages = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: '你好' },
    ];
    assert.equal(await generateAiReply(env, messages), '中转站主模型响应正常。');
    assert.equal(requests[0].url, 'https://api.sqface.sbs/v1/chat/completions');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer test-squareface-secret');
    const sent = JSON.parse(requests[0].options.body);
    assert.equal(sent.model, 'claude-sonnet-5');
    assert.deepEqual(sent.messages, messages);
    assert.doesNotMatch(requests[0].options.body, /test-squareface-secret/);
    assert.equal(fallbackCalls, 0);

    global.fetch = async () =>
      Response.json({ choices: [{ message: { content: '我记得你们一起做饭。' } }] });
    assert.equal(await generateAiReply(env, messages), 'Workers AI 回退正常。');
    assert.equal(fallbackCalls, 1);

    global.fetch = async () =>
      Response.json({
        choices: [{ message: { content: '我不是你的爷爷哦，我是萤火 AI 记忆陪伴助手。' } }],
      });
    assert.equal(await generateAiReply(env, messages), 'Workers AI 回退正常。');
    assert.equal(fallbackCalls, 2);

    global.fetch = async () => new Response('upstream unavailable', { status: 502 });
    assert.equal(await generateAiReply(env, messages), 'Workers AI 回退正常。');
    assert.equal(fallbackCalls, 3);
  } finally {
    global.fetch = previousFetch;
  }
});
