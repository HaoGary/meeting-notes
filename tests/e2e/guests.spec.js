import { test, expect } from '@playwright/test';
import { login, trackErrors } from './helpers';

test('新增沒有系統帳號的外部參與人員', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'meeting-m1');
  await expect(page.locator('.prose')).toBeVisible();
  const expandBtn = page.getByRole('button', { name: '展開會議資料' });
  if (await expandBtn.isVisible().catch(() => false)) await expandBtn.click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  const input = page.getByLabel('外部參與人員名字');
  await input.fill('王大明（旅行社）');
  await input.press('Enter');
  const chip = page.locator('.MuiChip-root', { hasText: '王大明（旅行社）' });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('外部');
  // 重複名字提示
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.getByLabel('外部參與人員名字').fill('王大明（旅行社）');
  await page.getByRole('button', { name: '加入' }).click();
  await expect(page.getByText('已在參與人員中')).toBeVisible();
  await page.keyboard.press('Escape');
  // 重新整理後仍保存
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('.MuiChip-root', { hasText: '王大明（旅行社）' })).toBeVisible();
  // 刪除
  await page.locator('.MuiChip-root', { hasText: '王大明（旅行社）' }).locator('.MuiChip-deleteIcon').click();
  await expect(page.locator('.MuiChip-root', { hasText: '王大明（旅行社）' })).toHaveCount(0);
  err.assertNone();
});
