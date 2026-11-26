import { expect } from '@playwright/test';

// 預設示範帳號（見 src/services/seed.js）
export const ADMIN = { id: 'gary', password: 'Demo1234' };

export async function login(page, hash = '', user = ADMIN) {
  await page.goto(`./${hash ? `#${hash}` : ''}`);
  await page.fill('#login-identifier', user.id);
  await page.fill('#login-password', user.password);
  await page.click('button[type=submit]');
}

// 收集頁面上的 JS 錯誤，測試結束時應為空
export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { assertNone: () => expect(errors).toEqual([]) };
}

export const saveStatus = (page) => page.getByText(/已儲存|尚未儲存|儲存中|儲存失敗|內容衝突/).first();
