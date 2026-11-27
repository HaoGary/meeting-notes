import { test, expect } from '@playwright/test';
import { ADMIN, login, trackErrors } from './helpers';

const openDemo = async (page) => { await page.getByRole('button', { name: /預覽控制台/ }).click(); };

test('他人更新內容時自動載入最新版本', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'meeting-m1');
  await expect(page.locator('.prose')).toBeVisible();
  await openDemo(page);
  await page.getByRole('button', { name: '模擬他人同時修改內容' }).click();
  await expect(page.getByText(/林怡君 更新了內容，已載入最新版本/)).toBeVisible();
  await expect(page.locator('.prose')).toContainText('沖繩線');
  err.assertNone();
});

test('有未儲存修改時，他人更新會提示而不覆蓋', async ({ page }) => {
  await login(page, 'meeting-m1');
  const prose = page.locator('.prose[contenteditable="true"]');
  await prose.click(); await page.keyboard.press('End'); await page.keyboard.type('我的修改');
  await openDemo(page);
  await page.getByRole('button', { name: '模擬他人同時修改內容' }).click();
  await expect(page.getByText(/剛更新了這份紀錄|內容衝突/).first()).toBeVisible();
  await expect(prose).toContainText('我的修改');
});

test('變更自己的 Email', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'account');
  await page.getByRole('button', { name: '變更 Email' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('#email-change-new').fill('gary.new@example.com');
  await dlg.locator('#email-change-password').fill('wrong-pass');
  await dlg.getByRole('button', { name: '寄送確認信' }).click();
  await expect(dlg.getByText('目前密碼不正確')).toBeVisible();
  await dlg.locator('#email-change-password').fill(ADMIN.password);
  await dlg.getByRole('button', { name: '寄送確認信' }).click();
  await expect(page.getByText('Email 已變更')).toBeVisible();
  await expect(page.getByLabel('目前的 Email')).toHaveValue('gary.new@example.com');
  err.assertNone();
});

test('被管理員強制登出（session 撤銷）後，這台會自動登出', async ({ page }) => {
  await login(page, 'meetings');
  await expect(page.getByText('2027 Q1 日本線產品規劃會議')).toBeVisible();
  // 模擬後端撤銷所有登入 session（等同管理員按「強制登出所有裝置」）
  await page.evaluate((key) => { const db = JSON.parse(localStorage.getItem(key)); db.sessions = []; localStorage.setItem(key, JSON.stringify(db)); }, 'meeting-notes-preview-db-v6');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(/你已被登出/)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#login-password')).toBeVisible();
});
