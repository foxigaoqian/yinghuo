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
