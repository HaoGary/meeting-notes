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
  const input = page.getByLabel('搜尋或輸入名字');
  await input.fill('志中');
  await input.press('Enter');
  const chip = page.locator('.MuiChip-root', { hasText: '志中' });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('外部');
  // 重複名字提示
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.getByLabel('搜尋或輸入名字').fill('志中');
  await expect(page.getByRole('menuitem', { name: /志中/ })).toContainText('已加入');
  await page.getByLabel('搜尋或輸入名字').press('Enter');
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
  await page.getByLabel('搜尋或輸入名字').fill('Vivian');
  await page.getByLabel('搜尋或輸入名字').press('Enter');
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

test('外部成員統一名單：新增過的人可以在主持人與參與人員中直接選', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'meeting-m1');
  await expandMeta(page);
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.getByLabel('搜尋或輸入名字').fill('Annie');
  await page.getByRole('menuitem', { name: '新增外部成員「Annie」' }).click();
  await expect(page.locator('.MuiChip-root', { hasText: 'Annie' })).toBeVisible();
  // 主持人選單可直接選 Annie
  await page.getByRole('button', { name: '主持人' }).click();
  await page.getByLabel('搜尋或輸入名字').fill('ann');
  await page.getByRole('menuitem', { name: /Annie/ }).click();
  await expect(page.getByRole('button', { name: '主持人' })).toContainText('Annie');
  // 其他會議也可選
  await page.waitForTimeout(800);
  await page.goto(page.url().replace('meeting-m1', 'meeting-m2'));
  await expandMeta(page);
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Annie/ })).toBeVisible();
  err.assertNone();
});

test('外部成員可以改名與從名單移除', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'meeting-m1');
  await expandMeta(page);
  // 先加入 Amy
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.getByLabel('搜尋或輸入名字').fill('Amy');
  await page.getByLabel('搜尋或輸入名字').press('Enter');
  await expect(page.locator('.MuiChip-root', { hasText: 'Amy' })).toBeVisible();
  // 改名 → 會議中的名字一起更新
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.getByRole('button', { name: '改名 Amy' }).click();
  const edit = page.getByLabel('Amy 新名字');
  await edit.fill('Amy Lin');
  await edit.press('Enter');
  await expect(page.getByText('已將「Amy」改名為「Amy Lin」')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.MuiChip-root', { hasText: 'Amy Lin' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.MuiChip-root', { hasText: 'Amy Lin' })).toBeVisible();
  // 從名單移除 → 會議中仍保留名字，但選單不再出現
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.getByRole('button', { name: '移除 Amy Lin' }).click();
  await page.getByRole('button', { name: '移除', exact: true }).click();
  await expect(page.getByText('已從外部成員名單移除「Amy Lin」')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Amy Lin/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.MuiChip-root', { hasText: 'Amy Lin' })).toBeVisible();
  err.assertNone();
});
