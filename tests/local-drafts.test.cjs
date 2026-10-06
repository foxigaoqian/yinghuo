const test = require('node:test');
const assert = require('node:assert/strict');

test('recovery keeps both conflicting drafts and exports only the current account', async () => {
  const { mergeLocalAccountData, exportLocalDrafts, clearLocalAccountData } = await import(
    '../apps/client/src/services/local-drafts.ts'
  );
  const records = new Map([
    ['yinghuo.profileDraft.source', { story: '临时草稿' }],
    ['yinghuo.profileDraft.target', { story: '已有草稿' }],
    ['yinghuo.memoryDraft.source.profile-a', { body: '合并的记忆草稿' }],
    ['yinghuo.storyDraft.other', { body: '其他账号私密草稿' }],
    ['yinghuo.lastUserId', 'target'],
  ]);
  const storage = {
    getStorageInfoSync: () => ({ keys: [...records.keys()] }),
    getStorageSync: (key) => records.get(key),
    setStorageSync: (key, value) => records.set(key, value),
    removeStorageSync: (key) => records.delete(key),
  };
  assert.equal(mergeLocalAccountData(storage, 'source', 'target'), 1);
  const exported = JSON.stringify(exportLocalDrafts(storage, 'target'));
  assert.match(exported, /临时草稿/);
  assert.match(exported, /已有草稿/);
  assert.match(exported, /合并的记忆草稿/);
  assert.doesNotMatch(exported, /其他账号私密草稿/);
  clearLocalAccountData(storage, 'target', 'profile-a');
  assert.doesNotMatch(JSON.stringify(exportLocalDrafts(storage, 'target')), /合并的记忆草稿/);
  clearLocalAccountData(storage, 'target');
  assert.deepEqual(exportLocalDrafts(storage, 'target'), []);
  assert.equal(storage.getStorageSync('yinghuo.lastUserId'), undefined);
  assert.equal(records.get('yinghuo.storyDraft.other').body, '其他账号私密草稿');
});

test('optional titles use the original words and keep Unicode boundaries', async () => {
  const { memoryTitle } = await import('../apps/client/src/services/experience.ts');
  assert.equal(memoryTitle('', '  周末一起做面。后来又聊起了小时候。  '), '周末一起做面');
  assert.equal(memoryTitle('', '第一行\n第二行'), '第一行');
  assert.equal(memoryTitle('  我自己的标题  ', '另一段内容'), '我自己的标题');
  assert.equal(memoryTitle('', '花'.repeat(59) + '🌷尾句', 60), '花'.repeat(59));
  assert.equal(memoryTitle('', '  ', 60), '');
});

test('profile erasure also clears editing and share-copy drafts without touching other profiles', async () => {
  const { exportLocalDrafts, clearLocalAccountData } = await import(
    '../apps/client/src/services/local-drafts.ts'
  );
  const records = new Map([
    ['yinghuo.memoryDraft.owner.profile-a.edit.memory-a', { body: '编辑草稿' }],
    ['yinghuo.storyDraft.owner.profile.profile-a.memory.memory-a', { body: '分享副本草稿' }],
    ['yinghuo.memoryDraft.owner.profile-b', { body: '另一位人物' }],
  ]);
  const storage = {
    getStorageInfoSync: () => ({ keys: [...records.keys()] }),
    getStorageSync: (key) => records.get(key),
    setStorageSync: (key, value) => records.set(key, value),
    removeStorageSync: (key) => records.delete(key),
  };
  clearLocalAccountData(storage, 'owner', 'profile-a');
  assert.deepEqual(
    exportLocalDrafts(storage, 'owner').map((d) => d.value.body),
    ['另一位人物'],
  );
});
