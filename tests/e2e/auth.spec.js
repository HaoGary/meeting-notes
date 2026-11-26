import { test, expect } from '@playwright/test';
import { ADMIN, login, trackErrors } from './helpers';

test('未登入時導向登入頁，登入後回到原本要去的頁面', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'permissions');
  await expect(page.getByRole('button', { name: '新增角色' })).toBeVisible();
  await expect(page).toHaveURL(/#permissions$/);
  err.assertNone();
});

test('帳號或密碼錯誤時顯示錯誤訊息', async ({ page }) => {
  await login(page, '', { id: ADMIN.id, password: 'wrong-pass' });
  await expect(page.getByText(/密碼錯誤/).first()).toBeVisible();
});

test('註冊、忘記密碼頁面可開啟並驗證欄位', async ({ page }) => {
  const err = trackErrors(page);
  await page.goto('./#register');
  await page.click('button[type=submit]');
  await expect(page.locator('.Mui-error').first()).toBeVisible();
  await page.goto('./#forgot-password');
  await expect(page.locator('button[type=submit]')).toBeVisible();
  err.assertNone();
});

test('登出後回到登入頁', async ({ page }) => {
  await login(page);
  await expect(page.locator('.MuiTable-root tbody tr').first()).toBeVisible();
  await page.locator('header').getByText('Gary Chen').click();
  await page.getByRole('menuitem', { name: /登出/ }).click();
  await expect(page.locator('#login-identifier')).toBeVisible();
});
