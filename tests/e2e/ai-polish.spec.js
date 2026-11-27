import { test, expect } from '@playwright/test';
import { login, trackErrors } from './helpers';

// AI 潤飾（手動模式）：複製指令 → 模擬 AI 回覆 → 貼回 → 預覽 → 套用 → 復原
test('AI 潤飾：複製指令、貼回回覆、預覽並套用', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const err = trackErrors(page);
  await login(page, 'meeting-m1');
  await page.getByRole('button', { name: 'AI 潤飾' }).click();
  await page.getByRole('button', { name: '複製指令' }).click();
  await expect(page.getByRole('button', { name: /已複製/ })).toBeVisible();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('會議紀錄');
  // 模擬 AI：每段文字後面加上標記
  const input = JSON.parse(prompt.slice(prompt.lastIndexOf('輸入：') + 3).trim());
  const reply = { sections: input.sections.map((s) => ({ index: s.index, blocks: s.blocks.map((b) => (b.type === 'keep' ? b : { ...b, text: `${b.text}【潤】` })) })) };
  await page.getByLabel('AI 回覆').fill('好的，以下是整理結果：\n```json\n' + JSON.stringify(reply) + '\n```');
  await page.getByRole('button', { name: '預覽結果' }).click();
  await expect(page.getByText('潤飾後（預覽）')).toBeVisible();
  await page.getByRole('button', { name: '套用' }).click();
  await expect(page.locator('.prose[contenteditable="true"]')).toContainText('【潤】');
  await page.getByRole('button', { name: '復原', exact: true }).click();
  await expect(page.locator('.prose[contenteditable="true"]')).not.toContainText('【潤】');
  err.assertNone();
});

test('AI 潤飾：貼上無法解析的內容會提示', async ({ page }) => {
  await login(page, 'meeting-m1');
  await page.getByRole('button', { name: 'AI 潤飾' }).click();
  await page.getByLabel('AI 回覆').fill('抱歉，我無法處理');
  await page.getByRole('button', { name: '預覽結果' }).click();
  await expect(page.getByText(/看不懂這段回覆/)).toBeVisible();
});

test('AI 潤飾：分類模式可把內容移到其他區塊並新增標準區塊', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const err = trackErrors(page);
  await login(page, 'meeting-m1');
  await page.getByRole('button', { name: 'AI 潤飾' }).click();
  await expect(page.getByRole('checkbox', { name: /依內容分類到各區塊/ })).toBeChecked();
  await page.getByRole('button', { name: '複製指令' }).click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('newSections');
  const input = JSON.parse(prompt.slice(prompt.lastIndexOf('輸入：') + 3).trim());
  // 模擬 AI：把「討論事項」第一個重點移到「決議事項」，並新增「待辦事項」區塊
  const src = input.sections.find((s) => s.heading === '討論事項');
  const dst = input.sections.find((s) => s.heading === '決議事項');
  const moved = src.blocks.find((b) => b.type !== 'keep');
  const sections = input.sections.map((s) => ({ index: s.index,
    blocks: s.index === src.index ? s.blocks.filter((b) => b !== moved) : s.index === dst.index ? [...s.blocks, { type: 'bullet', text: `${moved.text}（移入）` }] : s.blocks }));
  const hasTodo = input.sections.some((s) => s.heading === '待辦事項');
  const reply = { sections, newSections: hasTodo ? [] : [{ heading: '待辦事項', blocks: [{ type: 'task', text: '王大明：提供報價（12/03）', checked: false }] }] };
  await page.getByLabel('AI 回覆').fill(JSON.stringify(reply));
  await page.getByRole('button', { name: '預覽結果' }).click();
  await page.getByRole('button', { name: '套用' }).click();
  const prose = page.locator('.prose[contenteditable="true"]');
  await expect(prose).toContainText('（移入）');
  if (!hasTodo) await expect(prose.locator('h2', { hasText: '待辦事項' })).toHaveCount(1);
  // 移入的內容在「決議事項」標題之後
  const order = await prose.evaluate((el) => { const t = el.innerText; return [t.indexOf('決議事項'), t.indexOf('（移入）')]; });
  expect(order[1]).toBeGreaterThan(order[0]);
  err.assertNone();
});
