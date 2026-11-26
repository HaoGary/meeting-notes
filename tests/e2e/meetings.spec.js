import { test, expect } from '@playwright/test';
import { login, saveStatus, trackErrors } from './helpers';

const TITLE = '2027 Q1 日本線產品規劃會議';

test('會議列表：搜尋與開啟會議', async ({ page }) => {
  const err = trackErrors(page);
  await login(page);
  const rows = page.locator('.MuiTable-root tbody tr');
  await expect(rows.first()).toBeVisible();
  await page.fill('input[placeholder="搜尋會議名稱或地點"]', '北海道');
  await expect(rows.filter({ hasText: '北海道' }).first()).toBeVisible();
  await page.fill('input[placeholder="搜尋會議名稱或地點"]', '');
  await page.locator('.MuiTable-root').getByText(TITLE).click();
  await expect(page.locator('.prose')).toBeVisible();
  await expect(page).toHaveURL(/#meeting-m1$/);
  err.assertNone();
});

test('編輯內容會自動儲存，重新整理後仍保留', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'meeting-m1');
  await page.locator('.prose h2').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('（E2E）');
  await expect(saveStatus(page)).toHaveText(/已儲存/, { timeout: 10_000 });
  await page.reload();
  await expect(page.locator('.prose')).toContainText('（E2E）');
  err.assertNone();
});

test('待辦清單 checkbox 可勾選', async ({ page }) => {
  await login(page, 'meeting-m1');
  const box = page.locator('.prose ul[data-type="taskList"] input[type=checkbox]').last();
  const before = await box.isChecked();
  await box.click();
  await expect(box).toBeChecked({ checked: !before });
});

test('整理按鈕直接套用並可復原', async ({ page }) => {
  await login(page, 'meeting-m1');
  await page.getByRole('button', { name: '整理' }).click();
  await expect(page.getByRole('button', { name: '復原' })).toBeVisible();
});

test('一般網站（無 Claude 環境）不顯示 AI 潤飾按鈕', async ({ page }) => {
  await login(page, 'meeting-m1');
  await expect(page.locator('.prose')).toBeVisible();
  await page.waitForTimeout(5_500); // 環境偵測最多 5 秒
  await expect(page.getByRole('button', { name: 'AI 潤飾' })).toHaveCount(0);
});

test('Claude 預覽環境未登入時，AI 潤飾提示先登入', async ({ page }) => {
  await page.addInitScript(() => { window.claude = { use: async () => null }; });
  await login(page, 'meeting-m1');
  await page.getByRole('button', { name: 'AI 潤飾' }).click();
  await expect(page.getByText('請先登入 Claude 帳號')).toBeVisible({ timeout: 10_000 });
});

test('新增會議', async ({ page }) => {
  const err = trackErrors(page);
  await login(page);
  await page.getByRole('button', { name: '新增會議' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').first().fill('E2E 測試會議');
  await dialog.getByRole('button', { name: /建立|新增/ }).last().click();
  await expect(page.locator('.prose')).toBeVisible();
  await expect(page).toHaveURL(/#meeting-/);
  err.assertNone();
});
