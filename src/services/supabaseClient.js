// Supabase client（只在 supabase 模式建立）
// 「記住我」：勾選 → localStorage（關閉瀏覽器仍保留）；未勾選 → sessionStorage
import { createClient } from '@supabase/supabase-js';
import { IS_SUPABASE } from './config';

export const AUTH_STORAGE_KEY = 'mn-auth';
const REMEMBER_KEY = 'mn-remember';
const safe = (fn) => { try { return fn(); } catch { return null; } };

export const authStorage = {
  getItem: (k) => safe(() => sessionStorage.getItem(k)) ?? safe(() => localStorage.getItem(k)),
  setItem: (k, v) => {
    const remember = safe(() => localStorage.getItem(REMEMBER_KEY)) === '1';
    safe(() => (remember ? localStorage : sessionStorage).setItem(k, v));
    safe(() => (remember ? sessionStorage : localStorage).removeItem(k));
  },
  removeItem: (k) => { safe(() => sessionStorage.removeItem(k)); safe(() => localStorage.removeItem(k)); },
};
export const setRemember = (v) => safe(() => localStorage.setItem(REMEMBER_KEY, v ? '1' : '0'));

// 同步讀取目前儲存的 access token（App 啟動時判斷是否已登入）
export function storedAccessToken() {
  const raw = authStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw).access_token || null; } catch { return null; }
}

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = IS_SUPABASE
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storage: authStorage,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit', // 邀請信、重設信在其他瀏覽器開啟也能使用
    },
  })
  : null;

// 信件連結（邀請、重設密碼）回到的網址：目前網站的根目錄
export const appUrl = () => `${location.origin}${location.pathname}`;

// 處理從信件連結回來的網址：#access_token=…&type=recovery → 建立 session 後導向設定密碼頁
export async function handleAuthRedirect() {
  if (!supabase) return;
  const h = location.hash.slice(1);
  if (!/(^|&)(access_token|error_description|error_code|message)=/.test(h)) return;
  const p = new URLSearchParams(h);
  const base = `${location.pathname}${location.search}`;
  if (p.get('error_description') || p.get('error_code')) {
    history.replaceState(null, '', `${base}#reset-invalid`);
    return;
  }
  // 變更 Email（安全模式需新舊信箱都確認）：第一封確認後 Supabase 只回傳 message，提示還要確認另一封
  if (p.get('message') && !p.get('access_token')) {
    try { sessionStorage.setItem('mn-auth-notice', 'email-change-half'); } catch {}
    history.replaceState(null, '', `${base}#account`);
    return;
  }
  const type = p.get('type');
  await supabase.auth.getSession(); // supabase-js 解析網址中的 token 並建立 session
  if (type === 'email_change') {
    try { sessionStorage.setItem('mn-auth-notice', 'email-changed'); } catch {}
    history.replaceState(null, '', `${base}#account`);
    return;
  }
  history.replaceState(null, '', `${base}${type === 'recovery' || type === 'invite' ? `#reset-${type}` : '#meetings'}`);
}
