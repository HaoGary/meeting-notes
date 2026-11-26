import { test, expect } from '@playwright/test';
import { login, trackErrors } from './helpers';

test('開啟分享連結並預覽唯讀分享頁', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'meeting-m1');
  await page.getByRole('button', { name: '分享' }).click();
  const toggle = page.getByLabel('開啟分享連結');
  if (!(await toggle.isChecked())) await toggle.click();
  await expect(page.getByText('分享連結已開啟')).toBeVisible();
  const url = await page.getByRole('dialog').locator('input[type=text]').first().inputValue();
  expect(url).toMatch(/#share-/);
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('2027 Q1 日本線產品規劃會議');
  await expect(page.locator('.prose[contenteditable="true"]')).toHaveCount(0);
  err.assertNone();
});

test('後台頁面：帳號管理、權限管理、個人帳號設定', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'accounts');
  await expect(page.getByRole('button', { name: '新增帳號' })).toBeVisible();
  await page.locator('[aria-label="主選單"]').getByText('權限管理').click();
  await expect(page.getByRole('button', { name: '新增角色' })).toBeVisible();
  await page.locator('header').getByText('Gary Chen').click();
  await page.getByRole('menuitem', { name: '帳號設定' }).click();
  await expect(page.getByRole('button', { name: '登出全裝置' })).toBeVisible();
  err.assertNone();
});
