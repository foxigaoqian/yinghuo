import { test, expect } from '@playwright/test';

test('assistant paragraphs use separate bubbles and pending messages keep a stable width', async ({
  page,
}) => {
  const now = new Date().toISOString();
  await page.route('**/api/v1/app-state*', async (route) => {
    await route.fulfill({
      json: {
        session: { userId: 'user-1', csrfToken: 'csrf-1', mock: false },
        bootstrap: {
          appVersion: 'test',
          features: { textChat: true, publicSquare: true },
          csrfToken: 'csrf-1',
          accountState: 'guest',
          recoveryConfigured: true,
        },
        products: [],
        profiles: [
          {
            id: 'profile-1',
            ownerId: 'user-1',
            name: '朋友',
            relationship: '朋友',
            nickname: '',
            avatarUrl: null,
            callMe: '',
            story: '',
            aiConsent: true,
            createdAt: now,
          },
        ],
        currentProfileId: 'profile-1',
        memories: [],
        messages: [
          {
            id: 'assistant-1',
            profileId: 'profile-1',
            ownerId: 'user-1',
            role: 'assistant',
            text: '先好好吃饭，别总忙到忘了照顾自己。\n\n有空的时候，也多陪陪家里人。',
            createdAt: now,
            mock: false,
          },
        ],
        orders: [],
        posts: [],
      },
    });
  });

  let releaseReply!: () => void;
  const replyGate = new Promise<void>((resolve) => {
    releaseReply = resolve;
  });
  await page.route('**/api/v1/profiles/*/messages', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await replyGate;
    await route.fulfill({
      json: {
        items: [
          {
            id: 'assistant-2',
            profileId: 'profile-1',
            ownerId: 'user-1',
            role: 'assistant',
            text: '我在听呢。',
            createdAt: new Date().toISOString(),
            mock: false,
          },
        ],
      },
    });
  });

  await page.goto('/pages/chat/index?profileId=profile-1');
  await expect(page.locator('.assistant-segment')).toHaveCount(2);
  await expect(page.locator('.assistant-segment').nth(0)).toHaveText(
    '先好好吃饭，别总忙到忘了照顾自己。',
  );
  await expect(page.locator('.assistant-segment').nth(1)).toHaveText(
    '有空的时候，也多陪陪家里人。',
  );

  const longMessage = '想你'.repeat(70);
  await page.locator('.chat-input input').fill(longMessage);
  await page.getByRole('button', { name: '发送消息' }).click();

  try {
    const pendingBubble = page.locator('.pending-message .bubble');
    const thread = page.locator('.conversation-thread');
    await expect(pendingBubble).toBeVisible();
    await expect(page.locator('.typing-bubble')).toBeVisible();
    const [pendingBox, threadBox, typingBox] = await Promise.all([
      pendingBubble.boundingBox(),
      thread.boundingBox(),
      page.locator('.typing-bubble').boundingBox(),
    ]);
    expect(pendingBox).not.toBeNull();
    expect(threadBox).not.toBeNull();
    expect(typingBox).not.toBeNull();
    expect(pendingBox!.width).toBeLessThanOrEqual(threadBox!.width * 0.8);
    expect(typingBox!.width).toBeGreaterThanOrEqual(57);
    expect(typingBox!.width).toBeLessThanOrEqual(59);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBeTruthy();
  } finally {
    releaseReply();
  }
});
