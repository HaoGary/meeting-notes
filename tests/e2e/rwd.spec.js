import { test, expect } from '@playwright/test';
import { login, trackErrors } from './helpers';

// RWD 冒煙測試：手機與平板寬度下主要頁面不可出現水平捲動，選單、篩選、卡片可正常操作
const noHScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test.describe('手機 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test('漢堡選單、篩選收合、卡片列表', async ({ page }) => {
    const err = trackErrors(page);
    await login(page, 'meetings');
    await expect(page.getByText('2027 Q1 日本線產品規劃會議')).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0); // 手機改用卡片
    await noHScroll(page);
    await page.getByRole('button', { name: '篩選條件' }).click();
    await expect(page.getByText('日期：新到舊')).toBeVisible();
    await page.getByRole('button', { name: '開啟選單' }).click();
    await page.locator('[aria-label="主選單"]').getByText('帳號管理').click();
    await expect(page.getByRole('button', { name: /新增帳號/ })).toBeVisible();
    await noHScroll(page);
    await page.goto('./#permissions'); await noHScroll(page);
    await page.goto('./#account'); await noHScroll(page);
    err.assertNone();
  });
});

test.describe('平板 768×1024', () => {
  test.use({ viewport: { width: 768, height: 1024 } });
  test('側邊選單可收合展開、表格可操作', async ({ page }) => {
    const err = trackErrors(page);
    await login(page, 'meetings');
    await expect(page.locator('table')).toHaveCount(1);
    await page.getByRole('button', { name: '展開選單' }).click();
    await expect(page.locator('[aria-label="主選單"]').getByText('權限管理')).toBeVisible();
    await page.getByRole('button', { name: '收合選單' }).click();
    await noHScroll(page);
    err.assertNone();
  });
});
