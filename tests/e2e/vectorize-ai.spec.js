import { test, expect } from '@playwright/test';
import { login, trackErrors } from './helpers';
import { readFileSync } from 'node:fs';

const fixture = (f) => new URL(`../fixtures/${f}`, import.meta.url).pathname;
const engine = (page, name) => page.getByRole('group', { name: '轉換引擎' }).getByRole('button', { name });

test('AI 向量化：有權限者可使用、扣額度、同一張圖不重複計費', async ({ page }) => {
  const err = trackErrors(page);
  await login(page, 'vectorize');
  await page.getByTestId('vectorize-file').setInputFiles(fixture('logo.png'));
  await expect(page.getByTestId('vectorize-stats')).toBeVisible({ timeout: 30_000 });

  await engine(page, 'AI（Recraft）').click();
  await expect(page.getByText('圖片會上傳到 Recraft 處理')).toBeVisible();
  await expect(page.getByTestId('ai-remaining')).toHaveText('20');
  await page.getByRole('button', { name: 'AI 轉換（使用 1 次）' }).click();
  const stats = page.getByTestId('vectorize-stats');
  await expect(stats).toContainText('Recraft AI', { timeout: 15_000 });
  await expect(page.getByTestId('ai-remaining')).toHaveText('19');
  await expect(page.getByRole('button', { name: '已完成 AI 轉換' })).toBeDisabled();

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載 SVG' }).click()]);
  expect(dl.suggestedFilename()).toBe('logo-ai.svg');
  const svg = readFileSync(await dl.path(), 'utf8');
  expect(svg).toMatch(/width="480"/);
  expect(svg).toMatch(/<path\b/);

  // 切回本機：顯示本機結果；再切回 AI：沿用已轉換結果，不再扣次
  await engine(page, '本機（免費）').click();
  await expect(stats).not.toContainText('Recraft AI');
  await engine(page, 'AI（Recraft）').click();
  await expect(stats).toContainText('Recraft AI');
  await expect(page.getByTestId('ai-remaining')).toHaveText('19');
  err.assertNone();
});

test('AI 向量化：管理員可調整每日上限，用完後無法再轉換', async ({ page }) => {
  await login(page, 'vectorize');
  await page.getByTestId('vectorize-file').setInputFiles(fixture('logo.png'));
  await engine(page, 'AI（Recraft）').click();
  await page.getByRole('button', { name: '調整每日上限' }).click();
  const input = page.getByLabel('每人每日上限');
  await input.fill('1');
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(page.getByTestId('ai-remaining')).toHaveText('1');
  await page.getByRole('button', { name: 'AI 轉換（使用 1 次）' }).click();
  await expect(page.getByTestId('ai-remaining')).toHaveText('0', { timeout: 15_000 });
  await page.getByTestId('vectorize-file').setInputFiles(fixture('photo.jpg'));
  await expect(page.getByRole('button', { name: 'AI 轉換（使用 1 次）' })).toBeDisabled();
  await expect(page.getByText('今天的次數已用完')).toBeVisible();
});

test('AI 向量化：沒有權限的角色看不到 AI 引擎', async ({ page }) => {
  await login(page, 'vectorize', { id: 'daming', password: 'Demo1234' });
  await page.getByTestId('vectorize-file').setInputFiles(fixture('logo.png'));
  await expect(page.getByTestId('vectorize-stats')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('group', { name: '轉換引擎' })).toHaveCount(0);
});
