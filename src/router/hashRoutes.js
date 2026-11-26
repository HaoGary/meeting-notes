
// Hash 路由：網址形如 #meetings、#meeting-<id>。
// 使用 hash 可直接部署在 GitHub Pages 等靜態主機，重新整理或分享連結都不需要伺服器轉址設定。
// 公開：#login #register #forgot-password #verify-email #confirm-<token> #reset-<token> #share-<token>
// 需登入：#meetings（後台首頁） #meeting-<id> #accounts #permissions #account（個人帳號設定）
export const AUTH_PAGES = ['login', 'register', 'forgot-password', 'verify-email', 'confirm', 'reset'];
export const PUBLIC_PAGES = [...AUTH_PAGES, 'share'];
export const HOME = { page: 'meetings' };
export const PENDING_EMAIL = 'mn-pending-email';

export function parseHash() {
  const h = location.hash.slice(1);
  for (const [prefix, page, key] of [['meeting-', 'meeting', 'id'], ['share-', 'share', 'token'], ['reset-', 'reset', 'token'], ['confirm-', 'confirm', 'token']]) {
    if (h.startsWith(prefix)) return { page, [key]: h.slice(prefix.length) };
  }
  if (h === 'verify-email') { let email = null; try { email = sessionStorage.getItem(PENDING_EMAIL); } catch {} return { page: 'verify-email', email }; }
  if (['login', 'register', 'forgot-password', 'permissions', 'accounts', 'account', 'meetings'].includes(h)) return { page: h };
  return HOME;
}
export const toHash = (r) => ({ meeting: `meeting-${r.id}`, share: `share-${r.token}`, reset: `reset-${r.token}`, confirm: `confirm-${r.token}` }[r.page] || r.page);
