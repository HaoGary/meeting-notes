// 後端模式：
// - supabase：正式資料庫（需要 VITE_SUPABASE_URL、VITE_SUPABASE_PUBLISHABLE_KEY）
// - mock：瀏覽器內的模擬後端（離線預覽、單檔預覽、E2E 測試）
const env = import.meta.env;
export const BACKEND = env.VITE_BACKEND || (env.VITE_SUPABASE_URL ? 'supabase' : 'mock');
export const IS_SUPABASE = BACKEND === 'supabase';

// 依後端開關的功能（Supabase 版依需求：只用 Email 登入、不開放註冊、不做登入鎖定）
export const features = {
  usernameLogin: !IS_SUPABASE, // 可用帳號登入
  selfSignup: !IS_SUPABASE,    // 開放自行註冊
  loginLock: !IS_SUPABASE,     // 密碼錯誤鎖定
  demoPanel: !IS_SUPABASE,     // 右下角預覽控制台
};
