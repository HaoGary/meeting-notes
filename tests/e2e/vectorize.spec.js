import { test, expect } from '@playwright/test';
import { login, trackErrors } from './helpers';
import { readFileSync } from 'node:fs';

const fixture = (f) => new URL(`../fixtures/${f}`, import.meta.url).pathname;

async function openTool(page) {
  await login(page, 'vectorize');
  await expect(page.getByRole('heading', { name: '圖片向量化' })).toBeVisible();
}

test('左側選單有「文件工具 › 圖片向量化」', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '圖片向量化' }).click();
  await expect(page).toHaveURL(/#vectorize$/);
  await expect(page.getByText('拖曳圖片到這裡，或點擊選擇檔案')).toBeVisible();
});

test('PNG 轉 SVG：產生實際向量路徑並可下載', async ({ page }) => {
  const err = trackErrors(page);
  await openTool(page);
  await page.getByTestId('vectorize-file').setInputFiles(fixture('logo.png'));
  const stats = page.getByTestId('vectorize-stats');
  await expect(stats).toBeVisible({ timeout: 30_000 });
  await expect(stats).toContainText('路徑');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載 SVG' }).click()]);
  expect(dl.suggestedFilename()).toBe('logo.svg');
  const svg = readFileSync(await dl.path(), 'utf8');
  expect(svg).toMatch(/^<\?xml/);
  expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(svg).toContain('viewBox="0 0 480 320"');
  expect(svg).toMatch(/width="480"/);
  expect(svg).not.toMatch(/<image|base64/);              // 不是把點陣圖包進 SVG
  expect((svg.match(/<path\b/g) || []).length).toBeGreaterThan(1);
  expect(svg).toMatch(/\sd="M[\d.]/);                     // 有實際路徑資料
  err.assertNone();
});

test('黑白、灰階模式與顏色數量', async ({ page }) => {
  await openTool(page);
  await page.getByTestId('vectorize-file').setInputFiles(fixture('photo.jpg'));
  const stats = page.getByTestId('vectorize-stats');
  await expect(stats).toBeVisible({ timeout: 30_000 });

  await page.getByRole('group', { name: '色彩模式' }).getByRole('button', { name: '黑白' }).click();
  await expect(stats).toContainText(/顏色 [12]\b/, { timeout: 30_000 });

  await page.getByRole('group', { name: '色彩模式' }).getByRole('button', { name: '灰階' }).click();
  await expect(page.getByText('灰階層數')).toBeVisible();
  await expect(stats).toBeVisible({ timeout: 30_000 });

  await page.getByRole('group', { name: '色彩模式' }).getByRole('button', { name: '彩色' }).click();
  const slider = page.getByRole('slider', { name: '顏色數量' });
  await slider.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  await expect(stats).toContainText(/顏色 [1-4]\b/, { timeout: 30_000 });
});

test('WEBP 可轉換；不支援的格式會提示', async ({ page }) => {
  await openTool(page);
  await page.getByTestId('vectorize-file').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText(/不支援的檔案格式/)).toBeVisible();
  await page.getByTestId('vectorize-file').setInputFiles(fixture('photo.webp'));
  await expect(page.getByTestId('vectorize-stats')).toBeVisible({ timeout: 30_000 });
});

test('可取消轉換', async ({ page }) => {
  await openTool(page);
  await page.getByTestId('vectorize-file').setInputFiles(fixture('photo.jpg'));
  const cancel = page.getByRole('button', { name: '取消', exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(page.getByText('已取消轉換')).toBeVisible();
  await expect(page.getByText('參數已變更').or(page.getByRole('button', { name: '重新產生' }))).toBeVisible();
  // 取消後可重新產生
  await page.getByRole('button', { name: '重新產生' }).click();
  await expect(page.getByTestId('vectorize-stats')).toBeVisible({ timeout: 30_000 });
});
