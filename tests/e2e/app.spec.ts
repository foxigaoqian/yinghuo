import { test, expect, type Page } from '@playwright/test';

async function firstMemory(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '写下第一条记忆', exact: true }).click();
  await expect(page).toHaveURL(/create/);
  await page.getByRole('button', { name: '其他', exact: true }).click();
  await page.locator('input').first().fill('演示妈妈');
  await page.locator('textarea').first().fill('每周末做番茄鸡蛋面。');
  await page.reload();
  await expect(page.locator('textarea').first()).toHaveValue('每周末做番茄鸡蛋面。');
  await page.getByRole('button', { name: '保存第一条记忆', exact: true }).click();
  await expect(page).toHaveURL(/space/);
  await expect(page.getByRole('heading', { name: '演示妈妈的萤火', exact: true })).toBeVisible();
}

async function seed(page: Page, path: string, data: unknown) {
  const state = await (await page.request.get('/api/v1/app-state')).json();
  const response = await page.request.post('/api/v1' + path, {
    data,
    headers: { 'x-csrf-token': state.session.csrfToken },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function fitsFirstScreen(page: Page, name: string) {
  const box = await page.getByRole('button', { name, exact: true }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}

test('15 routes load without errors or horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const route of [
    'home',
    'login',
    'create',
    'space',
    'memories',
    'memory-edit',
    'memory',
    'chat',
    'restore',
    'plans',
    'orders',
    'me',
    'square',
    'story',
    'compose',
  ]) {
    await page.goto('/pages/' + route + '/index');
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBeTruthy();
  }
  await page.goto('/');
  await expect(page.locator('.hero-art .mascot')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.getByText('开发演示 · 不发送短信、不真实扣款')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('one-page creation, body-only save, draft recovery and square writing use the same library', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await firstMemory(page);
  await fitsFirstScreen(page, '再记下一件小事');
  await expect(page.getByText('记忆已保存到空间，只有你能看到。', { exact: true })).toBeVisible();
  await expect(page.getByText('内容已保存，跨设备找回还未设置。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '再记下一件小事', exact: true }).click();
  await expect(page.getByText('关于 演示妈妈 · 保存后仅自己可见', { exact: true })).toBeVisible();
  await page.locator('textarea').first().fill('窗台上总有一束花。她每天都换水。');
  await page.reload();
  await expect(page.locator('textarea').first()).toHaveValue('窗台上总有一束花。她每天都换水。');
  await expect(page.locator('input').first()).toHaveValue('');
  await page.getByRole('button', { name: '保存记忆', exact: true }).click();
  await expect(page.getByRole('heading', { name: '窗台上总有一束花', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '窗台上总有一束花', exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('button', { name: '广场', exact: true })
    .click();
  await page.getByRole('button', { name: '记录记忆', exact: true }).click();
  await expect(page).toHaveURL(/memory-edit/);
  await page.locator('textarea').first().fill('她喜欢在窗台养花。');
  await page.getByRole('button', { name: '保存记忆', exact: true }).click();
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('button', { name: '记忆', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '窗台上总有一束花', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '她喜欢在窗台养花', exact: true })).toBeVisible();
  await page.goto('/pages/chat/index');
  await expect(page.getByRole('heading', { name: '记忆对话暂时无法使用' })).toBeVisible();
  await page.goto('/pages/plans/index');
  await expect(page.getByText('¥99')).toBeVisible();
});

test('all-person library retains historical private stories and offers a scoped record action', async ({
  page,
}) => {
  await firstMemory(page);
  await seed(page, '/profiles', {
    name: '演示外婆',
    relationship: '外婆',
    story: '她教我做的第一道菜。',
    aiConsent: false,
  });
  await seed(page, '/square', {
    title: '旧版私密故事',
    body: '以前保存的内容仍能找到。',
    visibility: 'private',
    publicConsent: false,
  });
  await page.goto('/pages/memories/index');
  await expect(page.getByRole('heading', { name: '旧版私密故事', exact: true })).toBeVisible();
  await expect(page.getByText('她教我做的第一道菜。', { exact: true })).toBeVisible();
  await expect(page.getByText('每周末做番茄鸡蛋面。', { exact: true })).toBeVisible();
  await page
    .locator('.library-filters')
    .getByRole('button', { name: '演示外婆', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '旧版私密故事', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '再记下一件小事', exact: true }).click();
  await expect(page.getByText('关于 演示外婆 · 保存后仅自己可见', { exact: true })).toBeVisible();
});

test('failed saving keeps text and a retry saves without a required title', async ({ page }) => {
  await firstMemory(page);
  await page.getByRole('button', { name: '再记下一件小事', exact: true }).click();
  await page.locator('textarea').first().fill('下雨时她总让我带伞。');
  let fail = true;
  await page.route('**/api/v1/profiles/*/memories', async (route) => {
    if (route.request().method() === 'POST' && fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'TEST_UNAVAILABLE', message: '暂时无法保存' } }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: '保存记忆', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('暂时无法保存');
  await expect(page.locator('textarea').first()).toHaveValue('下雨时她总让我带伞。');
  await page.reload();
  await expect(page.locator('textarea').first()).toHaveValue('下雨时她总让我带伞。');
  await page.getByRole('button', { name: '保存记忆', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '下雨时她总让我带伞', exact: true }),
  ).toBeVisible();
});

test('chat identifies the assistant, requires consent and sends only selected memory IDs', async ({
  page,
}) => {
  await firstMemory(page);
  await page.route('**/api/v1/app-state*', async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    state.bootstrap.features.textChat = true;
    await route.fulfill({ response, json: state });
  });
  let releaseReply!: () => void;
  const replyGate = new Promise<void>((resolve) => {
    releaseReply = resolve;
  });
  let payload: Record<string, unknown> | undefined;
  await page.route('**/api/v1/profiles/*/messages', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    payload = route.request().postDataJSON();
    await replyGate;
    await route.fulfill({
      json: {
        items: [
          {
            id: 'test-assistant',
            profileId: 'test-profile',
            role: 'assistant',
            text: '我们可以慢慢整理这段记忆。',
            mock: false,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });
  });
  await page.goto('/pages/chat/index');
  await expect(page.getByRole('heading', { name: '小萤 · AI 记忆助手' })).toBeVisible();
  await expect(
    page.getByText('陪你回看与整理记忆。回复由 AI 生成，不代表演示妈妈本人。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '聊聊一件小事', exact: true }).click();
  await expect(page.locator('.chat-input input')).toHaveValue('我想聊聊关于演示妈妈的一件小事。');
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.locator('.chat-consent').click();
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.locator('.pending-message')).toContainText('我想聊聊关于演示妈妈的一件小事。');
  await expect(page.locator('.chat-input input')).toBeDisabled();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('yinghuo.chatDraft.'))
        .map((key) => localStorage.getItem(key))
        .join(''),
    ),
  ).toContain('我想聊聊关于演示妈妈的一件小事。');
  releaseReply();
  await expect(page.getByText('我们可以慢慢整理这段记忆。', { exact: true })).toBeVisible();
  expect(payload?.aiConsent).toBe(true);
  expect(payload?.memoryIds).toEqual([]);
  await page.locator('.context-toggle').click();
  await page.locator('.chat-memory-picker').getByRole('button').first().click();
  await page.locator('.chat-input input').fill('想再聊一会。');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => (payload?.memoryIds as string[] | undefined)?.length).toBe(1);
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const box = await page.locator('.chat-input').boundingBox();
        return Boolean(box && box.y >= 0 && box.y + box.height <= viewport.height + 1);
      })
      .toBeTruthy();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBeTruthy();
  }
});

test('loading remains distinct from an empty library', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/app-state*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/pages/memories/index');
  await expect(page.locator('.loading-state')).toBeVisible();
  await expect(page.getByRole('heading', { name: '还没有留下记忆', exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: '还没有留下记忆', exact: true })).toBeVisible();
});

test('small phones and landscape do not overflow and the first action is visible', async ({
  page,
}) => {
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.wordmark')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBeTruthy();
    if (viewport.height === 667) await fitsFirstScreen(page, '写下第一条记忆');
  }
});

test('sharing uses an explicit independent copy and does not edit the private memory', async ({
  page,
}) => {
  await firstMemory(page);
  await page.route('**/api/v1/app-state*', async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    state.bootstrap.features.publicSquare = true;
    await route.fulfill({ response, json: state });
  });
  await page.goto('/pages/memories/index');
  await page.locator('.library-item').first().click();
  const originalURL = page.url();
  await page.getByRole('button', { name: '分享到广场', exact: true }).click();
  await expect(page).toHaveURL(/compose.*memoryId=/);
  await expect(
    page.getByText('这是独立的分享副本。原记忆仍然私密，修改或删除原记忆不会自动更新副本。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('textarea').first()).toHaveValue('每周末做番茄鸡蛋面。');
  await expect(page.getByRole('button', { name: '确认并申请公开', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.locator('textarea').first().fill('只修改分享副本的文字。');
  await page.reload();
  await expect(page.locator('textarea').first()).toHaveValue('只修改分享副本的文字。');
  await page.goto(originalURL);
  await expect(page.locator('.prose')).toHaveText('每周末做番茄鸡蛋面。');
});

test('a library request waits for homepage hydration and still fetches its posts', async ({
  page,
}) => {
  await firstMemory(page);
  await seed(page, '/square', {
    title: '并发加载时的旧故事',
    body: '主页加载完成后也不能遗漏。',
    visibility: 'private',
    publicConsent: false,
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  await page.route('**/api/v1/app-state*', async (route) => {
    if (!held && !route.request().url().includes('includePosts=1')) {
      held = true;
      await gate;
    }
    await route.continue();
  });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('button', { name: '记忆', exact: true })
    .click();
  await expect(page.locator('.loading-state')).toBeVisible();
  release();
  await expect(
    page.getByRole('heading', { name: '并发加载时的旧故事', exact: true }),
  ).toBeVisible();
});

test('a missing edit target does not silently create a new memory', async ({ page }) => {
  await firstMemory(page);
  await page.goto('/pages/memory-edit/index?id=missing-memory');
  await expect(page.getByRole('alert')).toContainText('这条记忆暂时找不到');
  await expect(page.getByRole('button', { name: '保存修改', exact: true })).toHaveCount(0);
});
