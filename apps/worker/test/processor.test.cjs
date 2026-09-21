const test = require('node:test');
const assert = require('node:assert/strict');
const { processDemoJob } = require('../dist/processor');
test('restoration never fabricates a finished asset', async () => {
  const result = await processDemoJob({ type: 'photo-restore', mock: true, referenceId: 'a' });
  assert.equal(result.outputAssetId, null);
  assert.equal(result.status, 'provider_not_connected');
});
test('moderation never auto-approves public content', async () => {
  assert.equal(
    (await processDemoJob({ type: 'moderation', mock: true, referenceId: 'b' })).status,
    'pending_manual_review',
  );
});
test('live jobs are rejected', async () => {
  await assert.rejects(processDemoJob({ type: 'photo-restore', mock: false }));
});
