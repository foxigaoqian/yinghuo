const test = require('node:test');
const assert = require('node:assert/strict');

test('conversation recall keeps earlier user details and excludes assistant inventions', async () => {
  const { buildConversationRecall } = await import('../lib/pages-supabase-h5.js');
  const messages = [
    { role: 'user', text: '我十岁时和你在田里抓过蚂蚱。' },
    { role: 'assistant', text: '我还记得我们一起爬过柿子树。' },
    ...Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      text: index % 2 === 0 ? `后来聊到的第 ${index} 件小事。` : `模型回复 ${index}`,
    })),
  ];

  const recall = buildConversationRecall(messages);

  assert.ok(recall.some((message) => message.includes('抓过蚂蚱')));
  assert.ok(!recall.some((message) => message.includes('柿子树')));
  assert.ok(recall.every((message) => !message.startsWith('模型回复')));
});

test('conversation recall deduplicates repeated user messages and respects its character budget', async () => {
  const { buildConversationRecall } = await import('../lib/pages-supabase-h5.js');
  const messages = [
    { role: 'user', text: '同一件小事' },
    { role: 'user', text: '同一件小事' },
    { role: 'user', text: '另一件小事很重要' },
  ];

  const recall = buildConversationRecall(messages, 48, 20);

  assert.equal(recall.filter((message) => message === '同一件小事').length, 1);
  assert.ok(recall.join('').length <= 20);
});
