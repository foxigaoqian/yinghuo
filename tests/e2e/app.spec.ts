import { test, expect } from '@playwright/test';
test('15 page routes load, IP renders, no horizontal overflow', async ({ page }) => {
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
    await page.goto('/#/pages/' + route + '/index');
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBeTruthy();
  }
  await page.goto('/#/pages/home/index');
  await expect(page.locator('.hero-art .mascot')).toBeVisible();
  expect(errors).toEqual([]);
});
test('create → remember → chat → reload → mock payment', async ({ page }) => {
  await page.goto('/#/pages/login/index');
  await page.getByText('进入演示账号', { exact: true }).click();
  await expect(page).toHaveURL(/space/);
  await page.getByText('创建 TA 的萤火', { exact: true }).click();
  // uni-app's H5 placeholder is rendered as a sibling hint rather than a
  // native placeholder attribute in some browser builds.
  await page.locator('input').first().fill('演示妈妈');
  await page.getByText('继续', { exact: true }).click();
  await page.locator('input').first().fill('小宇');
  await page.getByText('继续', { exact: true }).click();
  await page.locator('textarea').first().fill('每周末做番茄鸡蛋面。');
  await page.reload();
  await expect(page.getByText('分享一点关于 TA 的记忆', { exact: true })).toBeVisible();
  await expect(page.locator('textarea').first()).toHaveValue('每周末做番茄鸡蛋面。');
  await page.getByText('我理解对话由 AI 生成，不代表本人。', { exact: true }).click();
  await page.getByText('创建并开始聊天', { exact: true }).click();
  await expect(page.getByText('演示妈妈的萤火', { exact: true })).toBeVisible();
  await page.goto('/#/pages/space/index');
  await page.getByText('记录一段记忆', { exact: true }).click();
  await page.locator('input').first().fill('周末的面');
  await page.locator('textarea').first().fill('每周末做番茄鸡蛋面。');
  await page.getByText('保存记忆', { exact: true }).click();
  await expect(page.getByText('周末的面', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('周末的面', { exact: true })).toBeVisible();
  await page.goto('/#/pages/chat/index');
  await page.locator('.chat-input input').fill('今天工作有点累');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('.chat-input input')).toHaveValue('今天工作有点累');
  await page.locator('.chat-input input').press('Enter');
  await expect(
    page.locator('.bubble').filter({ hasText: '【AI 演示回复，并非本人】' }),
  ).toBeVisible();
  await page.goto('/#/pages/plans/index');
  await page.getByText('选择年费 · 模拟下单', { exact: true }).click();
  await expect(page.getByText('待模拟支付', { exact: true })).toBeVisible();
  await page.getByText('继续模拟支付', { exact: true }).click();
  await page.getByText('OK', { exact: true }).click();
  await expect(page.getByText('模拟已支付', { exact: true })).toBeVisible();
});
test('small phone and landscape remain within viewport', async ({ page }) => {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/pages/home/index');
    await expect(page.locator('.wordmark')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBeTruthy();
  }
});
