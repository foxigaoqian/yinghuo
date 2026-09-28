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
  await expect(page.getByText('开发演示 · 不发送短信、不真实扣款')).toHaveCount(0);
  await expect(page.getByText('正在处理，请稍候…')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('first visit → first memory → private square story → planned price', async ({ page }) => {
  await page.goto('/#/pages/home/index');
  await page.getByText('为 TA 建立记忆空间', { exact: true }).click();
  await expect(page).toHaveURL(/create/);
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
  await page.getByText('保存并进入 TA 的空间', { exact: true }).click();
  await expect(page).toHaveURL(/space/);
  await expect(page.getByText('演示妈妈的萤火', { exact: true })).toBeVisible();
  await expect(page.getByText('每周末做番茄鸡蛋面。', { exact: true })).toBeVisible();
  await expect(page.getByText('第一条记忆 · 仅自己可见', { exact: true })).toBeVisible();
  await page.getByText('再记录一段记忆', { exact: true }).click();
  await page.locator('input').first().fill('周末的面');
  await page.locator('textarea').first().fill('每周末做番茄鸡蛋面。');
  await page.getByText('保存记忆', { exact: true }).click();
  await expect(page.getByText('周末的面', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('周末的面', { exact: true })).toBeVisible();
  await page.goto('/#/pages/square/index');
  await page.getByText('写故事', { exact: true }).click();
  await expect(page, '写故事应进入编辑页，失败时先检查当前页面与提示').toHaveURL(/compose/, { timeout: 10000 });
  console.log('compose state:', page.url(), (await page.locator('body').innerText()).slice(0, 650));
  await page.locator('input').first().fill('窗边的下午');
  await page.locator('textarea').first().fill('她喜欢在窗台养花。');
  await page.getByText('保存给自己', { exact: true }).click();
  await expect(page).toHaveURL(/view=mine/);
  await expect(page.getByText('窗边的下午', { exact: true })).toBeVisible();
  await page.goto('/#/pages/chat/index');
  await expect(page.getByText('对话功能正在准备')).toBeVisible();
  await expect(page.locator('.chat-input input')).toHaveCount(0);
  await page.goto('/#/pages/plans/index');
  await expect(page.getByText('¥99')).toBeVisible();
  await expect(page.getByText('选择年费 · 模拟下单')).toHaveCount(0);
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
