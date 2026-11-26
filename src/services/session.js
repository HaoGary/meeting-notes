// 前端 Session token 保存：勾選「記住我」→ localStorage（關閉瀏覽器仍保留），否則 → sessionStorage。
// Supabase 模式由 supabase-js 管理 session（見 supabaseClient.js），這裡只回報目前是否有登入憑證。
import { IS_SUPABASE } from './config';
import { storedAccessToken } from './supabaseClient';

const KEY = 'mn-session';
const LAST_ID = 'mn-last-identifier';
let memory = null;

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

export function getToken() {
  if (IS_SUPABASE) return memory ?? storedAccessToken();
  return memory ?? safe(() => sessionStorage.getItem(KEY)) ?? safe(() => localStorage.getItem(KEY));
}
export function setToken(token, remember) {
  memory = token;
  if (IS_SUPABASE) return; // 已由 supabase-js 依「記住我」儲存
  safe(() => { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); });
  safe(() => (remember ? localStorage : sessionStorage).setItem(KEY, token));
}
export function clearToken() {
  memory = null;
  safe(() => { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); });
}
// 「記住我」時記下帳號，下次自動帶入（不保存密碼）
export const getLastIdentifier = () => safe(() => localStorage.getItem(LAST_ID)) || '';
export const setLastIdentifier = (v) => safe(() => (v ? localStorage.setItem(LAST_ID, v) : localStorage.removeItem(LAST_ID)));
