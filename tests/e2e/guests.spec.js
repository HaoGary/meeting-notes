import { test, expect } from '@playwright/test';
import { login, trackErrors } from './helpers';

const expandMeta = async (page) => {
  const btn = page.getByRole('button', { name: '展開會議資料' });
  if (await btn.isVisible().catch(() => false)) await btn.click();
};

test('新增沒有系統帳號的外部參與人員', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'meeting-m1');
  await expect(page.locator('.prose')).toBeVisible();
  await expandMeta(page);
  await page.getByRole('button', { name: '新增', exact: true }).click();
  const input = page.getByLabel('輸入名字');
  await input.fill('志中');
  await input.press('Enter');
  const chip = page.locator('.MuiChip-root', { hasText: '志中' });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('外部');
  // 重複名字提示
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.getByLabel('輸入名字').fill('志中');
  await page.getByRole('button', { name: '加入' }).click();
  await expect(page.getByText('已在名單中')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('.MuiChip-root', { hasText: '志中' })).toBeVisible();
  await page.locator('.MuiChip-root', { hasText: '志中' }).locator('.MuiChip-deleteIcon').click();
  await expect(page.locator('.MuiChip-root', { hasText: '志中' })).toHaveCount(0);
  err.assertNone();
});

test('主持人可以是外部人員，也能改回系統成員', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'meeting-m1');
  await expandMeta(page);
  const hostBtn = page.getByRole('button', { name: '主持人' });
  await hostBtn.click();
  await page.getByLabel('輸入名字').fill('Vivian');
  await page.getByLabel('輸入名字').press('Enter');
  await expect(hostBtn).toContainText('Vivian');
  await expect(hostBtn).toContainText('外部');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByRole('button', { name: '主持人' })).toContainText('Vivian');
  // 列表也顯示外部主持人
  await page.getByRole('button', { name: '主持人' }).click();
  await page.getByRole('menuitem', { name: /Gary Chen/ }).click();
  await expect(page.getByRole('button', { name: '主持人' })).toContainText('Gary Chen');
  await expect(page.getByRole('button', { name: '主持人' })).not.toContainText('外部');
  err.assertNone();
});
