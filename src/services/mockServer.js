// ─────────────────────────────────────────────────────────────
// 模擬後端（僅供預覽）。正式版會換成既有專案的 API，
// 但權限檢查（角色權限 + 會議參與權限）、版本衝突（409）等規則會在後端以同樣邏輯實作。
// 資料表對應：meetings / meeting_content / meeting_attendees / meeting_history
//            roles / role_permissions / users(.role_id) / permission_audit_logs / meeting_shares
//            sessions / auth_tokens（驗證碼、重設密碼） / outbox（模擬寄信）
// ─────────────────────────────────────────────────────────────
import { buildSeed, PERMISSIONS, DEMO_PASSWORD } from './seed';
import { validateAll, registerSchema, resetSchema, passwordIssues, EMAIL_RE, USERNAME_RE, changePasswordSchema, profileSchema, adminUserSchema } from '../utils/validators';

const KEY = 'meeting-notes-preview-db-v6';
let db = load();
export const devFlags = { failSaves: false, latency: 450 };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return buildSeed();
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
}
export function resetDb() { db = buildSeed(); ready = ensurePasswords(); persist(); }

// ── 密碼與 Token 雜湊（正式版於伺服器端以 bcrypt / Argon2 實作） ──
const enc = new TextEncoder();
const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n = 16) => toHex(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(str) { return toHex(await crypto.subtle.digest('SHA-256', enc.encode(str))); }
async function hashPassword(password, salt = randomHex(16)) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return { salt, hash: toHex(bits) };
}
function safeEqual(a, b) { // 固定時間比較，避免時序攻擊
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, user.passwordSalt);
  return safeEqual(hash, user.passwordHash);
}
// 示範帳號：首次載入時把預設密碼雜湊後存入（不保存明文）
async function ensurePasswords() {
  let changed = false;
  for (const u of db.users) {
    if (!u.passwordHash && !u.pendingInvite) { const { salt, hash } = await hashPassword(DEMO_PASSWORD); u.passwordSalt = salt; u.passwordHash = hash; changed = true; }
    if (u.failedAttempts === undefined) { u.failedAttempts = 0; u.lockedUntil = null; }
  }
  ['sessions', 'authTokens', 'outbox'].forEach((k) => { if (!db[k]) { db[k] = []; changed = true; } });
  if (!db.seededDevices) { // 示範：Gary 另有一台手機登入中
    db.sessions.push({ id: uid('s'), tokenHash: randomHex(32), userId: 'u1', remember: true, device: 'Safari · iPhone',
      createdAt: Date.now() - 2 * 864e5, lastActiveAt: Date.now() - 3 * 3600e3, expiresAt: Date.now() + 28 * 864e5 });
    db.seededDevices = true; changed = true;
  }
  if (changed) persist();
}
let ready = ensurePasswords();
const SENSITIVE = ['passwordHash', 'passwordSalt', 'failedAttempts'];
const safeUser = (u) => Object.fromEntries(Object.entries(u).filter(([k]) => !SENSITIVE.includes(k)));
// 產生符合密碼規則、易於轉告的臨時密碼（排除易混淆字元）
function tempPassword() {
  const pick = (set, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => set[x % set.length]).join('');
  const raw = pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 3) + pick('abcdefghijkmnpqrstuvwxyz', 5) + pick('23456789', 4);
  return raw.split('').sort(() => crypto.getRandomValues(new Uint8Array(1))[0] - 128).join('');
}

class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data; this.code = data?.code; }
}
const delay = async (ms = devFlags.latency) => { await ready; await new Promise((r) => setTimeout(r, ms * (0.6 + Math.random() * 0.8))); };
const uid = (p) => p + Math.random().toString(36).slice(2, 9);
const clone = (x) => JSON.parse(JSON.stringify(x));
const permLabel = (k) => PERMISSIONS.find((p) => p.key === k)?.label || k;

// ── Session ──────────────────────────────
const SESSION_TTL = 8 * 3600e3;        // 未勾選「記住我」：閒置 8 小時失效（滑動延長）
const REMEMBER_TTL = 30 * 864e5;       // 勾選「記住我」：30 天
async function createSession(user, remember, device = '未知裝置') {
  const token = randomHex(32);
  db.sessions = db.sessions.filter((x) => x.expiresAt > Date.now());
  db.sessions.push({ id: uid('s'), tokenHash: await sha256(token), userId: user.id, remember: !!remember, device,
    createdAt: Date.now(), lastActiveAt: Date.now(), expiresAt: Date.now() + (remember ? REMEMBER_TTL : SESSION_TTL) });
  persist();
  return { token, expiresAt: Date.now() + (remember ? REMEMBER_TTL : SESSION_TTL) };
}
function revokeSessions(userId, exceptId) { db.sessions = db.sessions.filter((x) => x.userId !== userId || x.id === exceptId); }

// ── 一次性 Token（Email 驗證碼 / 驗證連結 / 重設密碼連結），只儲存雜湊 ──
async function issueToken(user, kind, ttl) {
  db.authTokens = db.authTokens.filter((t) => !(t.userId === user.id && t.kind === kind)); // 舊的立即失效
  const raw = randomHex(20);
  const code = kind === 'verify' ? String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0') : null;
  db.authTokens.push({ id: uid('t'), userId: user.id, kind, tokenHash: await sha256(raw), codeHash: code ? await sha256(code) : null,
    attempts: 0, createdAt: Date.now(), expiresAt: Date.now() + ttl, usedAt: null });
  return { raw, code };
}
function sendMail(to, subject, body, extra = {}) {
  db.outbox.unshift({ id: uid('mail'), to, subject, body, at: Date.now(), read: false, ...extra });
}
const maskEmail = (e) => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.max(2, b.length)) + c);
const findByEmail = (email) => db.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
const findByIdentifier = (id) => { const v = String(id).trim().toLowerCase(); return db.users.find((u) => u.username.toLowerCase() === v || u.email.toLowerCase() === v); };
function permsOf(user) {
  return new Set(db.roles.find((r) => r.id === user.roleId)?.permissions || []);
}
function requirePerm(user, key) {
  if (!permsOf(user).has(key)) throw new ApiError(403, `沒有「${permLabel(key)}」權限`);
}

// ── 會議層級權限：角色權限 + 參與者設定 ─────────
function meetingAccess(user, m) {
  const perms = permsOf(user);
  const a = db.attendees.find((x) => x.meetingId === m.id && x.userId === user.id);
  const own = m.hostId === user.id || m.createdBy === user.id;
  let permission = null;
  if (perms.has('meeting.edit_all') || own) permission = 'editor';
  else if (a) permission = a.permission;
  else if (perms.has('meeting.view_all')) permission = 'viewer';
  return {
    permission,
    canArchive: permission === 'editor' && perms.has('meeting.archive'),
    canShare: permission === 'editor' && perms.has('meeting.share'),
    canDelete: perms.has('meeting.delete_all') || (own && perms.has('meeting.delete_own')),
  };
}
function getMeetingOr404(id) {
  const m = db.meetings.find((x) => x.id === id);
  if (!m) throw new ApiError(404, '找不到此會議，可能已被刪除');
  return m;
}
function assertCan(user, meetingId, need) {
  const m = getMeetingOr404(meetingId);
  const acc = meetingAccess(user, m);
  if (!acc.permission) throw new ApiError(403, '您沒有檢視此會議的權限');
  if (need === 'edit') {
    if (acc.permission !== 'editor') throw new ApiError(403, '您只有檢視權限，無法修改');
    if (m.status === 'archived') throw new ApiError(423, '會議已封存，請先取消封存');
  }
  return acc;
}
function log(meetingId, userId, action) {
  db.history.unshift({ id: uid('h'), meetingId, userId, action, at: Date.now() });
}
function audit(userId, action) {
  db.auditLogs.unshift({ id: uid('a'), userId, action, at: Date.now() });
}
// ── 即時更新（預覽：同一個分頁內的事件匯流排，模擬 Supabase Realtime） ──
const bus = new Set();
function emit(e) { setTimeout(() => bus.forEach((f) => { try { f(e); } catch { /* ignore */ } }), 0); }

function touch(meetingId) {
  const m = db.meetings.find((x) => x.id === meetingId);
  if (m) m.updatedAt = Date.now();
}
function maybeFail() {
  if (devFlags.failSaves) throw new ApiError(503, '網路連線失敗（模擬）');
}
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
const publicUser = (u) => ({ id: u.id, name: u.name, color: u.color, active: u.active });

// ── API ─────────────────────────────────────
const demoNotifications = [
  { id: 1, type: 'meeting_added', meetingId: 'm1', title: '你已被加入會議「2027 Q1 日本線產品規劃會議」', body: '林怡君 將你加入，權限：可編輯', read: false, at: Date.now() - 25 * 60e3 },
  { id: 2, type: 'meeting_updated', meetingId: 'm2', title: '「每週業務例會」的時間已變更', body: '林怡君 更新為 週四 09:30–10:30', read: false, at: Date.now() - 5 * 3600e3 },
  { id: 3, type: 'role_changed', meetingId: null, title: '你的角色已變更為「系統管理員」', body: '由 系統 變更，可使用的功能可能有所不同', read: true, at: Date.now() - 3 * 864e5 },
];
export function createApi(getToken, { onUnauthorized } = {}) {
  // 由 Session token 解析目前登入者；token 失效時通知前端登出
  let currentSession = null;
  // allowPending：帳號需強制變更密碼時，只允許少數 API（me、變更密碼、登出）
  const me = async ({ allowPending = false } = {}) => {
    await ready;
    const token = getToken();
    if (!token) throw new ApiError(401, '請先登入', { code: 'NOT_LOGGED_IN' });
    const h = await sha256(token);
    const sess = db.sessions.find((x) => x.tokenHash === h);
    const fail = (msg, code) => { const e = new ApiError(401, msg, { code }); onUnauthorized?.(e); return e; };
    if (!sess || sess.expiresAt < Date.now()) {
      if (sess) db.sessions = db.sessions.filter((x) => x !== sess);
      throw fail('登入已逾時，請重新登入', 'SESSION_EXPIRED');
    }
    const u = db.users.find((x) => x.id === sess.userId);
    if (!u || !u.active) { revokeSessions(sess.userId); persist(); throw fail('此帳號已停用，請聯絡系統管理員', 'ACCOUNT_DISABLED'); }
    if (!sess.remember) sess.expiresAt = Date.now() + SESSION_TTL;
    sess.lastActiveAt = Date.now();
    currentSession = sess;
    if (u.mustChangePassword && !allowPending) throw new ApiError(403, '請先變更密碼後再繼續使用', { code: 'PASSWORD_CHANGE_REQUIRED' });
    return u;
  };
  return {
    // 目前登入者與其權限（前端只用來決定顯示，真正的檢查都在後端）
    async me() {
      await delay(120);
      const u = await me({ allowPending: true });
      const role = db.roles.find((r) => r.id === u.roleId);
      return clone({ user: { ...safeUser(u), roleName: role?.name }, permissions: [...permsOf(u)] });
    },
    // 一般使用者清單（選主持人、參與人員用）
    async listUsers() {
      await delay(120);
      (await me());
      return clone(db.users.filter((u) => u.active).map(publicUser));
    },
    async listExternalMembers() {
      await delay(80);
      (await me());
      if (!db.externals) {
        db.externals = [...new Set(db.meetings.flatMap((m) => [...(m.guests || []), ...(m.hostName ? [m.hostName] : [])]))];
        persist();
      }
      return clone([...db.externals].sort((a, b) => a.localeCompare(b, 'zh-Hant')));
    },
    async addExternalMember(name) {
      await delay(80);
      (await me());
      const n = (name || '').trim();
      if (!n || n.length > 40) throw new ApiError(422, '名字需為 1–40 個字');
      db.externals = db.externals || [];
      if (!db.externals.some((x) => x.toLowerCase() === n.toLowerCase())) { db.externals.push(n); persist(); }
      return n;
    },

    async listMeetings() {
      await delay(200);
      const u = (await me());
      return clone(
        db.meetings
          .map((m) => ({ m, acc: meetingAccess(u, m) }))
          .filter(({ acc }) => acc.permission)
          .sort((a, b) => (b.m.date + b.m.start).localeCompare(a.m.date + a.m.start))
          .map(({ m, acc }) => ({ ...m, ...acc, attendeeCount: db.attendees.filter((a) => a.meetingId === m.id).length }))
      );
    },

    async getMeeting(id) {
      await delay(250);
      const u = (await me());
      const acc = assertCan(u, id, 'view');
      return clone({
        meeting: getMeetingOr404(id),
        attendees: db.attendees.filter((a) => a.meetingId === id),
        content: db.content[id],
        ...acc,
      });
    },

    async getContent(id) {
      await delay(150);
      const u = (await me());
      assertCan(u, id, 'view');
      return clone(db.content[id]);
    },

    async createMeeting(data) {
      await delay();
      maybeFail();
      const u = (await me());
      requirePerm(u, 'meeting.create');
      const now = Date.now();
      const m = {
        id: uid('m'), title: data.title || '未命名會議', date: data.date, start: data.start || '10:00', end: data.end || '11:00',
        location: '', onlineUrl: '', hostId: u.id, type: data.type || '例行會議', status: 'draft', guests: [],
        createdBy: u.id, createdAt: now, updatedAt: now,
      };
      db.meetings.push(m);
      db.attendees.push({ meetingId: m.id, userId: u.id, permission: 'editor' });
      db.content[m.id] = { version: 1, doc: data.doc, updatedAt: now, updatedBy: u.id };
      log(m.id, u.id, '建立會議');
      persist();
      emit({ type: 'meeting', id: m.id });
      return clone(m);
    },

    async updateMeeting(id, patch) {
      await delay();
      maybeFail();
      const u = (await me());
      const m = getMeetingOr404(id);
      const onlyStatus = Object.keys(patch).length === 1 && 'status' in patch;
      if (onlyStatus) {
        const acc = meetingAccess(u, m);
        if (acc.permission !== 'editor') throw new ApiError(403, '您只有檢視權限，無法修改');
        if ((patch.status === 'archived' || m.status === 'archived') && !acc.canArchive) throw new ApiError(403, '沒有「封存會議」權限');
      } else assertCan(u, id, 'edit');
      if ('guests' in patch) {
        const g = [...new Set((patch.guests || []).map((x) => String(x).trim()).filter(Boolean))];
        if (g.some((x) => x.length > 40)) throw new ApiError(422, '名字最多 40 個字');
        if (g.length > 50) throw new ApiError(422, '外部參與人員最多 50 位');
        patch = { ...patch, guests: g };
      }
      if ('hostName' in patch) {
        const n = (patch.hostName || '').trim() || null;
        if (n && n.length > 40) throw new ApiError(422, '名字最多 40 個字');
        patch = { ...patch, hostName: n };
      }
      const allowed = ['title', 'date', 'start', 'end', 'location', 'onlineUrl', 'hostId', 'type', 'status', 'guests', 'hostName'];
      allowed.forEach((k) => { if (k in patch) m[k] = patch[k]; });
      m.updatedAt = Date.now();
      if ('status' in patch) log(id, u.id, `變更狀態為「${{ draft: '草稿', done: '已完成', archived: '已封存' }[patch.status]}」`);
      else log(id, u.id, '修改會議資料');
      persist();
      emit({ type: 'meeting', id, meeting: clone(m), by: u.id });
      return clone(m);
    },

    async deleteMeeting(id) {
      await delay();
      maybeFail();
      const u = (await me());
      const m = getMeetingOr404(id);
      if (!meetingAccess(u, m).canDelete) throw new ApiError(403, '沒有刪除此會議的權限');
      db.meetings = db.meetings.filter((x) => x.id !== id);
      db.attendees = db.attendees.filter((x) => x.meetingId !== id);
      db.shares = db.shares.filter((x) => x.meetingId !== id); // 刪除會議時一併失效分享連結
      delete db.content[id];
      persist();
      emit({ type: 'deleted', id });
      return { ok: true };
    },

    async setAttendees(id, list) {
      await delay();
      maybeFail();
      const u = (await me());
      assertCan(u, id, 'edit');
      db.attendees = db.attendees.filter((x) => x.meetingId !== id).concat(list.map((a) => ({ ...a, meetingId: id })));
      touch(id);
      log(id, u.id, '更新參與人員');
      persist();
      emit({ type: 'attendees', id });
      return clone(db.attendees.filter((x) => x.meetingId === id));
    },

    // 樂觀鎖：baseVersion 與伺服器不同 → 409 衝突
    async saveContent(id, doc, baseVersion) {
      await delay();
      maybeFail();
      const u = (await me());
      assertCan(u, id, 'edit');
      const cur = db.content[id];
      if (cur.version !== baseVersion) throw new ApiError(409, '此會議已被其他人更新', clone(cur));
      const next = { version: cur.version + 1, doc, updatedAt: Date.now(), updatedBy: u.id };
      db.content[id] = next;
      touch(id);
      const last = db.history.filter((h) => h.meetingId === id).sort((a, b) => b.at - a.at)[0];
      const label = `編輯內容（版本 ${next.version}）`;
      if (last && last.userId === u.id && last.action.startsWith('編輯內容') && Date.now() - last.at < 120e3) {
        last.action = label; last.at = Date.now();
      } else log(id, u.id, label);
      persist();
      emit({ type: 'content', id, version: next.version, updatedBy: u.id });
      return { version: next.version, updatedAt: next.updatedAt };
    },

    async listHistory(meetingId) {
      await delay(200);
      assertCan((await me()), meetingId, 'view');
      return clone(db.history.filter((h) => h.meetingId === meetingId).sort((a, b) => b.at - a.at).slice(0, 50));
    },

    // 圖片上傳：正式版改用既有雲端儲存（回傳 URL），預覽以 data URL 代替
    async uploadImage(meetingId, file) {
      assertCan((await me()), meetingId, 'edit');
      if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) throw new ApiError(415, '僅支援 PNG、JPG、GIF、WebP');
      if (file.size > 5 * 1024 * 1024) throw new ApiError(413, '圖片不可超過 5MB');
      await delay(400);
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve({ url: r.result });
        r.onerror = () => reject(new ApiError(500, '讀取圖片失敗'));
        r.readAsDataURL(file);
      });
    },

    // ── 分享（meeting_shares） ─────────────────────
    async getShare(meetingId) {
      await delay(150);
      const u = (await me());
      const acc = assertCan(u, meetingId, 'view');
      if (!acc.canShare) throw new ApiError(403, '沒有「分享會議」權限');
      return clone(db.shares.find((s) => s.meetingId === meetingId) || null);
    },
    // patch: { enabled, scope: 'org'|'public', expiresInDays: 7|30|0 }
    async updateShare(meetingId, patch) {
      await delay(300);
      maybeFail();
      const u = (await me());
      const m = getMeetingOr404(meetingId);
      if (!meetingAccess(u, m).canShare) throw new ApiError(403, '沒有「分享會議」權限');
      let s = db.shares.find((x) => x.meetingId === meetingId);
      if (!s) {
        s = { meetingId, token: newToken(), enabled: true, scope: 'org', expiresAt: Date.now() + 30 * 864e5, createdBy: u.id, createdAt: Date.now(), viewCount: 0 };
        db.shares.push(s);
        log(meetingId, u.id, '建立分享連結');
      }
      if ('scope' in patch) {
        if (!['org', 'public'].includes(patch.scope)) throw new ApiError(422, '無效的分享範圍');
        if (patch.scope !== s.scope) log(meetingId, u.id, `分享範圍改為「${patch.scope === 'public' ? '任何知道連結的人' : '僅限公司成員'}」`);
        s.scope = patch.scope;
      }
      if ('expiresInDays' in patch) s.expiresAt = patch.expiresInDays ? Date.now() + patch.expiresInDays * 864e5 : null;
      if ('enabled' in patch && patch.enabled !== s.enabled) {
        s.enabled = !!patch.enabled;
        log(meetingId, u.id, s.enabled ? '開啟分享連結' : '關閉分享連結');
      }
      persist();
      return clone(s);
    },
    // 重設連結：舊連結立即失效
    async resetShareToken(meetingId) {
      await delay(300);
      maybeFail();
      const u = (await me());
      const m = getMeetingOr404(meetingId);
      if (!meetingAccess(u, m).canShare) throw new ApiError(403, '沒有「分享會議」權限');
      const s = db.shares.find((x) => x.meetingId === meetingId);
      if (!s) throw new ApiError(404, '尚未建立分享連結');
      s.token = newToken();
      s.viewCount = 0;
      log(meetingId, u.id, '重設分享連結（舊連結已失效）');
      persist();
      return clone(s);
    },
    // 讀取分享內容：只回傳預覽需要的欄位（不含 email、修改紀錄等）
    async getSharedMeeting(token) {
      await delay(300);
      const s = db.shares.find((x) => x.token === token);
      if (!s || !s.enabled) throw new ApiError(404, '此分享連結不存在或已關閉');
      if (s.expiresAt && s.expiresAt < Date.now()) throw new ApiError(410, '此分享連結已過期');
      if (s.scope === 'org') {
        try { await me(); } catch { throw new ApiError(401, "此會議僅限公司成員檢視，請先登入", { code: "LOGIN_REQUIRED" }); }
      }
      const m = getMeetingOr404(s.meetingId);
      const name = (id) => { const x = db.users.find((y) => y.id === id); return x ? { id: x.id, name: x.name, color: x.color } : null; };
      s.viewCount++;
      persist();
      return clone({
        meeting: { title: m.title, date: m.date, start: m.start, end: m.end, location: m.location, onlineUrl: m.onlineUrl, type: m.type, status: m.status },
        host: m.hostName ? { id: null, name: m.hostName, external: true } : name(m.hostId),
        attendees: db.attendees.filter((a) => a.meetingId === m.id).map((a) => name(a.userId)).filter(Boolean),
        guests: m.guests || [],
        doc: db.content[m.id].doc,
        updatedAt: db.content[m.id].updatedAt,
        scope: s.scope,
        expiresAt: s.expiresAt,
      });
    },

    // ── 個人帳號設定（登入者本人） ─────────────────
    account: {
      async updateProfile(data) {
        await delay(400);
        maybeFail();
        const u = await me();
        const errs = validateAll(profileSchema, data);
        if (Object.keys(errs).length) throw new ApiError(422, '資料格式有誤', { code: 'VALIDATION', fields: errs });
        u.name = data.name.trim();
        persist();
        return clone(safeUser(u));
      },
      // 一般變更需驗證目前密碼；被要求強制變更（臨時密碼）時免輸入
      async changePassword({ current, password, confirm }) {
        await delay(700);
        maybeFail();
        const u = await me({ allowPending: true });
        const forced = !!u.mustChangePassword;
        const errs = validateAll(forced ? resetSchema : changePasswordSchema, { current, password, confirm });
        if (Object.keys(errs).length) throw new ApiError(422, '資料格式有誤', { code: 'VALIDATION', fields: errs });
        if (!forced && !(await verifyPassword(current, u))) throw new ApiError(422, '目前密碼不正確', { code: 'WRONG_PASSWORD', fields: { current: '目前密碼不正確' } });
        if (await verifyPassword(password, u)) throw new ApiError(422, '新密碼不可與目前密碼相同', { code: 'SAME_PASSWORD', fields: { password: '新密碼不可與目前密碼相同' } });
        const { salt, hash } = await hashPassword(password);
        u.passwordSalt = salt; u.passwordHash = hash; u.mustChangePassword = false;
        revokeSessions(u.id, currentSession?.id); // 其他裝置全部登出，保留目前這台
        sendMail(u.email, '您的密碼已變更', `${u.name} 您好，\n\n您的帳號密碼已於 ${new Date().toLocaleString('zh-TW')} 變更，其他裝置已登出。\n\n若這不是您本人的操作，請立即使用「忘記密碼」重設並聯絡系統管理員。`);
        persist();
        return { ok: true };
      },
      // 預覽：驗證密碼後直接變更（正式版會先寄確認信）
      async requestEmailChange({ email, password }) {
        await delay(500);
        maybeFail();
        const u = await me();
        const next = String(email || '').trim().toLowerCase();
        const fields = {};
        if (!EMAIL_RE.test(next)) fields.email = 'Email 格式不正確';
        else if (next === u.email.toLowerCase()) fields.email = '與目前的 Email 相同';
        else if (db.users.some((x) => x.id !== u.id && x.email.toLowerCase() === next)) fields.email = '此 Email 已被其他帳號使用';
        if (!password) fields.password = '請輸入目前密碼';
        if (Object.keys(fields).length) throw new ApiError(422, '資料格式有誤', { code: 'VALIDATION', fields });
        if (!(await verifyPassword(password, u))) throw new ApiError(422, '目前密碼不正確', { code: 'WRONG_PASSWORD', fields: { password: '目前密碼不正確' } });
        const prev = u.email; u.email = next;
        sendMail(prev, '您的 Email 已變更', `${u.name} 您好，\n\n您的帳號 Email 已由 ${prev} 變更為 ${next}。若這不是您本人的操作，請立即聯絡系統管理員。`);
        persist();
        return { pending: false, email: next, current: prev };
      },
      async listSessions() {
        await delay(200);
        const u = await me();
        return clone(db.sessions.filter((x) => x.userId === u.id && x.expiresAt > Date.now())
          .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0))
          .map((x) => ({ id: x.id, device: x.device || '未知裝置', createdAt: x.createdAt, lastActiveAt: x.lastActiveAt || x.createdAt, remember: x.remember, current: x.id === currentSession?.id })));
      },
      async revokeSession(id) {
        await delay(300);
        maybeFail();
        const u = await me();
        if (id === currentSession?.id) throw new ApiError(422, '無法登出目前使用中的裝置，請使用右上角「登出」');
        db.sessions = db.sessions.filter((x) => !(x.id === id && x.userId === u.id));
        persist();
        return { ok: true };
      },
      async revokeOtherSessions() {
        await delay(300);
        maybeFail();
        const u = await me();
        const before = db.sessions.filter((x) => x.userId === u.id).length;
        revokeSessions(u.id, currentSession?.id);
        persist();
        return { count: before - 1 };
      },
    },

    // 帳號停用、或這台裝置被登出時回傳 false
    async sessionOk() {
      // 其他分頁（例如另一台「裝置」）可能已撤銷登入，先同步儲存的 session 與帳號狀態
      try { const raw = localStorage.getItem(KEY); if (raw) { const f = JSON.parse(raw); db.sessions = f.sessions; db.users = f.users; } } catch { /* ignore */ }
      const token = getToken();
      if (!token) return false;
      const h = await sha256(token);
      const sess = db.sessions.find((x) => x.tokenHash === h && x.expiresAt > Date.now());
      const u = sess && db.users.find((x) => x.id === sess.userId);
      return !!(u && u.active);
    },

    realtime: {
      onMeetingsChange(cb) { const f = (e) => { if (['meeting', 'deleted', 'attendees'].includes(e.type)) cb(); }; bus.add(f); return () => bus.delete(f); },
      watchMeeting(id, { onContent, onMeeting, onAttendees, onDeleted }) {
        const f = (e) => {
          if (e.id !== id) return;
          if (e.type === 'content') onContent?.({ version: e.version, updatedBy: e.updatedBy });
          else if (e.type === 'meeting' && e.meeting) onMeeting?.(e.meeting);
          else if (e.type === 'attendees') onAttendees?.();
          else if (e.type === 'deleted') onDeleted?.();
        };
        bus.add(f); return () => bus.delete(f);
      },
      presence(_id, _me, onSync) { onSync([]); return () => {}; }, // 預覽只有自己
    },

    // ── 通知（預覽：示範資料存在記憶體） ──
    notifications: {
      async list() {
        await delay(150);
        await me();
        return clone(demoNotifications);
      },
      async markRead(id) { const n = demoNotifications.find((x) => x.id === id); if (n) n.read = true; return { ok: true }; },
      async markAllRead() { const c = demoNotifications.filter((x) => !x.read).length; demoNotifications.forEach((x) => { x.read = true; }); return { count: c }; },
      subscribe() { return () => {}; },
    },

    // ── 帳號驗證（不需登入） ───────────────────
    auth: {
      async login({ identifier, password, remember, device }) {
        await delay(600);
        maybeFail();
        if (!identifier?.trim() || !password) throw new ApiError(422, '請輸入帳號與密碼', { code: 'VALIDATION' });
        const u = findByIdentifier(identifier);
        // 依需求明確提示「帳號不存在」；若需防止帳號列舉，可改為統一的「帳號或密碼錯誤」
        if (!u) throw new ApiError(404, '找不到此帳號，請確認帳號或 Email 是否正確', { code: 'ACCOUNT_NOT_FOUND' });
        if (u.lockedUntil && u.lockedUntil > Date.now()) {
          const min = Math.ceil((u.lockedUntil - Date.now()) / 60000);
          throw new ApiError(423, `密碼錯誤次數過多，帳號已暫時鎖定，請於 ${min} 分鐘後再試，或使用「忘記密碼」重設`, { code: 'ACCOUNT_LOCKED' });
        }
        if (!u.passwordHash) throw new ApiError(403, '此帳號尚未設定密碼，請使用邀請信中的連結設定，或使用「忘記密碼」', { code: 'PASSWORD_NOT_SET' });
        if (!(await verifyPassword(password, u))) {
          u.failedAttempts = (u.failedAttempts || 0) + 1;
          const left = 5 - u.failedAttempts;
          if (left <= 0) { u.lockedUntil = Date.now() + 15 * 60e3; u.failedAttempts = 0; persist();
            throw new ApiError(423, '密碼錯誤次數過多，帳號已暫時鎖定 15 分鐘，或使用「忘記密碼」重設', { code: 'ACCOUNT_LOCKED' }); }
          persist();
          throw new ApiError(401, `密碼錯誤${left <= 2 ? `，再錯 ${left} 次帳號將暫時鎖定` : ''}`, { code: 'INVALID_PASSWORD', left });
        }
        if (!u.active) throw new ApiError(403, '此帳號已停用，請聯絡系統管理員', { code: 'ACCOUNT_DISABLED' });
        if (!u.emailVerified) throw new ApiError(403, '尚未完成 Email 驗證，請先驗證後再登入', { code: 'EMAIL_NOT_VERIFIED', email: u.email });
        u.failedAttempts = 0; u.lockedUntil = null; u.lastLoginAt = Date.now();
        const sess = await createSession(u, remember, device);
        return { ...sess, user: { name: u.name } };
      },

      async logout(token) {
        await ready;
        if (token) { const h = await sha256(token); db.sessions = db.sessions.filter((x) => x.tokenHash !== h); persist(); }
        return { ok: true };
      },

      // 即時檢查帳號 / Email 是否可用（註冊時離開欄位觸發）
      async checkAvailability({ username, email }) {
        await delay(250);
        maybeFail();
        if (username && db.users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) return { field: 'username', available: false };
        if (email && findByEmail(email)) return { field: 'email', available: false };
        return { available: true };
      },

      async register(data) {
        await delay(700);
        maybeFail();
        const errs = validateAll(registerSchema, data); // 後端再驗證一次，不信任前端
        if (Object.keys(errs).length) throw new ApiError(422, '資料格式有誤，請檢查欄位', { code: 'VALIDATION', fields: errs });
        if (db.users.some((u) => u.username.toLowerCase() === data.username.trim().toLowerCase()))
          throw new ApiError(409, '此帳號已被使用，請換一個', { code: 'DUPLICATE', fields: { username: '此帳號已被使用，請換一個' } });
        if (findByEmail(data.email))
          throw new ApiError(409, '此 Email 已註冊', { code: 'DUPLICATE', fields: { email: '此 Email 已註冊，可直接登入或使用忘記密碼' } });
        const { salt, hash } = await hashPassword(data.password);
        const colors = ['#0d9488', '#9333ea', '#e11d48', '#2563eb', '#ca8a04'];
        const u = {
          id: uid('u'), username: data.username.trim(), name: data.name.trim(), email: data.email.trim().toLowerCase(),
          roleId: 'viewer', active: true, emailVerified: false, color: colors[db.users.length % colors.length],
          passwordSalt: salt, passwordHash: hash, failedAttempts: 0, lockedUntil: null, createdAt: Date.now(), lastLoginAt: null,
        };
        db.users.push(u);
        await sendVerification(u);
        persist();
        return { email: u.email, maskedEmail: maskEmail(u.email) };
      },

      async resendVerification(email) {
        await delay(400);
        maybeFail();
        const u = findByEmail(email);
        if (!u || u.emailVerified) return { ok: true }; // 不透露帳號狀態
        const last = db.authTokens.find((t) => t.userId === u.id && t.kind === 'verify');
        if (last && last.expiresAt > Date.now() && last.attempts < 5 && Date.now() - last.createdAt < 60e3)
          throw new ApiError(429, `請稍候 ${Math.ceil((60e3 - (Date.now() - last.createdAt)) / 1000)} 秒後再重新寄送`, { code: 'TOO_SOON' });
        await sendVerification(u);
        persist();
        return { ok: true };
      },

      // 以 6 位數驗證碼或信中連結完成驗證
      async verifyEmail({ email, code, token }) {
        await delay(500);
        maybeFail();
        let t;
        if (token) {
          const h = await sha256(token);
          t = db.authTokens.find((x) => x.kind === 'verify' && x.tokenHash === h);
          if (!t) throw new ApiError(410, '驗證連結無效或已被使用', { code: 'TOKEN_INVALID' });
        } else {
          const u = findByEmail(email);
          t = u && db.authTokens.find((x) => x.kind === 'verify' && x.userId === u.id);
          if (u?.emailVerified) return { ok: true, already: true };
          if (!t) throw new ApiError(410, '驗證碼已失效，請重新寄送', { code: 'CODE_EXPIRED' });
        }
        if (t.expiresAt < Date.now()) throw new ApiError(410, '驗證碼已過期，請重新寄送驗證信', { code: 'CODE_EXPIRED' });
        if (!token) {
          if (t.attempts >= 5) throw new ApiError(429, '錯誤次數過多，請重新寄送驗證碼', { code: 'TOO_MANY' });
          if (!safeEqual(await sha256(String(code).trim()), t.codeHash)) {
            t.attempts++; persist();
            const left = 5 - t.attempts;
            throw new ApiError(422, left > 0 ? `驗證碼錯誤，還可嘗試 ${left} 次` : '錯誤次數過多，請重新寄送驗證碼', { code: left > 0 ? 'CODE_INVALID' : 'TOO_MANY' });
          }
        }
        const u = db.users.find((x) => x.id === t.userId);
        u.emailVerified = true;
        db.authTokens = db.authTokens.filter((x) => x !== t);
        persist();
        return { ok: true, email: u.email, username: u.username };
      },

      // 為避免洩漏哪些 Email 已註冊，無論是否存在都回傳相同結果
      async requestPasswordReset(email) {
        await delay(600);
        maybeFail();
        if (!EMAIL_RE.test(String(email || '').trim())) throw new ApiError(422, 'Email 格式不正確', { code: 'VALIDATION' });
        const u = findByEmail(email);
        if (u && u.active) {
          const last = db.authTokens.find((t) => t.userId === u.id && t.kind === 'reset');
          if (!last || Date.now() - last.createdAt > 60e3) {
            const { raw } = await issueToken(u, 'reset', 30 * 60e3);
            sendMail(u.email, '重設您的密碼', `${u.name} 您好，\n\n我們收到重設密碼的申請。請點擊下方連結設定新密碼，連結 30 分鐘內有效且只能使用一次。\n\n若您沒有提出申請，請忽略此信，您的密碼不會被變更。`,
              { link: `#reset-${raw}`, linkLabel: '重設密碼' });
            persist();
          }
        }
        return { ok: true, maskedEmail: maskEmail(String(email).trim().toLowerCase()) };
      },

      async checkResetToken(token) {
        await delay(300);
        maybeFail();
        const t = await findResetToken(token);
        const u = db.users.find((x) => x.id === t.userId);
        return { maskedEmail: maskEmail(u.email) };
      },

      async resetPassword({ token, password, confirm }) {
        await delay(700);
        maybeFail();
        const t = await findResetToken(token);
        const errs = validateAll(resetSchema, { password, confirm });
        if (Object.keys(errs).length) throw new ApiError(422, '密碼不符合規則', { code: 'VALIDATION', fields: errs });
        const u = db.users.find((x) => x.id === t.userId);
        if (u.passwordHash && await verifyPassword(password, u)) throw new ApiError(422, '新密碼不可與目前密碼相同', { code: 'SAME_PASSWORD', fields: { password: '新密碼不可與目前密碼相同' } });
        const { salt, hash } = await hashPassword(password);
        u.passwordSalt = salt; u.passwordHash = hash; u.failedAttempts = 0; u.lockedUntil = null;
        u.mustChangePassword = false; if (u.pendingInvite) { u.pendingInvite = false; u.emailVerified = true; }
        t.usedAt = Date.now();
        revokeSessions(u.id); // 重設後所有裝置需重新登入
        sendMail(u.email, '您的密碼已變更', `${u.name} 您好，\n\n您的帳號密碼已於 ${new Date().toLocaleString('zh-TW')} 重設成功，所有裝置已登出。\n\n若這不是您本人的操作，請立即聯絡系統管理員。`);
        persist();
        return { ok: true, username: u.username };
      },
    },

    // ── 權限管理（皆需 system.permissions） ─────────────
    admin: {
      async listRoles() {
        await delay(200);
        requirePerm((await me()), 'system.permissions');
        return clone(db.roles.map((r) => ({ ...r, userCount: db.users.filter((u) => u.roleId === r.id).length })));
      },
      async saveRolePermissions(changes) { // { roleId: [perms] }
        await delay();
        maybeFail();
        const u = (await me());
        requirePerm(u, 'system.permissions');
        Object.entries(changes).forEach(([roleId, perms]) => {
          const r = db.roles.find((x) => x.id === roleId);
          if (!r) throw new ApiError(404, '角色不存在');
          if (r.locked) throw new ApiError(403, `「${r.name}」為系統角色，無法修改`);
          const valid = perms.filter((p) => PERMISSIONS.some((x) => x.key === p));
          const added = valid.filter((p) => !r.permissions.includes(p)).map(permLabel);
          const removed = r.permissions.filter((p) => !valid.includes(p)).map(permLabel);
          r.permissions = valid;
          const parts = [added.length && `新增「${added.join('、')}」`, removed.length && `移除「${removed.join('、')}」`].filter(Boolean);
          if (parts.length) audit(u.id, `更新「${r.name}」權限：${parts.join('；')}`);
        });
        persist();
        return clone(db.roles);
      },
      async createRole({ name, desc, copyFrom }) {
        await delay();
        maybeFail();
        const u = (await me());
        requirePerm(u, 'system.permissions');
        if (!name?.trim()) throw new ApiError(422, '請輸入角色名稱');
        if (db.roles.some((r) => r.name === name.trim())) throw new ApiError(409, '角色名稱已存在');
        const src = db.roles.find((r) => r.id === copyFrom);
        const r = { id: uid('r'), name: name.trim(), desc: desc?.trim() || '', color: '#9333ea', permissions: src && !src.locked ? [...src.permissions] : [] };
        db.roles.push(r);
        audit(u.id, `新增角色「${r.name}」`);
        persist();
        return clone(r);
      },
      async deleteRole(roleId) {
        await delay();
        maybeFail();
        const u = (await me());
        requirePerm(u, 'system.permissions');
        const r = db.roles.find((x) => x.id === roleId);
        if (!r) return { ok: true };
        if (r.locked) throw new ApiError(403, '系統角色無法刪除');
        const n = db.users.filter((x) => x.roleId === roleId).length;
        if (n) throw new ApiError(409, `仍有 ${n} 位使用者屬於此角色，請先變更他們的角色`);
        db.roles = db.roles.filter((x) => x.id !== roleId);
        audit(u.id, `刪除角色「${r.name}」`);
        persist();
        return { ok: true };
      },
      async listUsers() {
        await delay(200);
        requirePerm((await me()), 'system.permissions');
        return clone(db.users.map((x) => ({
          ...safeUser(x), meetingCount: db.attendees.filter((a) => a.userId === x.id).length,
        })));
      },
      async updateUser(userId, patch) {
        await delay(350);
        maybeFail();
        const u = (await me());
        if ('roleId' in patch) requirePerm(u, 'system.permissions');
        if ('active' in patch) requirePerm(u, 'system.accounts');
        const t = db.users.find((x) => x.id === userId);
        if (!t) throw new ApiError(404, '找不到使用者');
        if (userId === u.id) throw new ApiError(403, '無法變更自己的角色或狀態，以免失去管理權限');
        const adminsLeft = db.users.filter((x) => x.id !== userId && x.active && x.roleId === 'admin').length;
        if (t.roleId === 'admin' && (patch.roleId && patch.roleId !== 'admin' || patch.active === false) && adminsLeft < 1)
          throw new ApiError(409, '至少需保留一位啟用中的系統管理員');
        if ('roleId' in patch) {
          const r = db.roles.find((x) => x.id === patch.roleId);
          if (!r) throw new ApiError(422, '角色不存在');
          t.roleId = r.id;
          audit(u.id, `將「${t.name}」的角色設為「${r.name}」`);
        }
        if ('active' in patch) {
          t.active = !!patch.active;
          if (!t.active) revokeSessions(t.id); // 停用時立即登出該帳號所有裝置
          audit(u.id, `${t.active ? '啟用' : '停用'}帳號「${t.name}」`);
        }
        persist();
        return clone(safeUser(t));
      },
      // ── 帳號管理（system.accounts） ──
      async listAccounts() {
        await delay(250);
        requirePerm(await me(), 'system.accounts');
        const now = Date.now();
        return clone(db.users.map((x) => ({
          ...safeUser(x),
          locked: !!(x.lockedUntil && x.lockedUntil > now),
          sessionCount: db.sessions.filter((s) => s.userId === x.id && s.expiresAt > now).length,
          meetingCount: db.attendees.filter((a) => a.userId === x.id).length,
          roleName: db.roles.find((r) => r.id === x.roleId)?.name,
        })));
      },
      async createAccount(data) {
        await delay(600);
        maybeFail();
        const u = await me();
        requirePerm(u, 'system.accounts');
        const errs = validateAll(adminUserSchema, data);
        if (Object.keys(errs).length) throw new ApiError(422, '資料格式有誤', { code: 'VALIDATION', fields: errs });
        if (db.users.some((x) => x.username.toLowerCase() === data.username.trim().toLowerCase()))
          throw new ApiError(409, '此帳號已被使用', { code: 'DUPLICATE', fields: { username: '此帳號已被使用，請換一個' } });
        if (findByEmail(data.email)) throw new ApiError(409, '此 Email 已註冊', { code: 'DUPLICATE', fields: { email: '此 Email 已有帳號' } });
        if (!db.roles.some((r) => r.id === data.roleId)) throw new ApiError(422, '角色不存在');
        if (data.roleId === 'admin') requirePerm(u, 'system.permissions');
        const colors = ['#0d9488', '#9333ea', '#e11d48', '#2563eb', '#ca8a04', '#0891b2'];
        const t = {
          id: uid('u'), username: data.username.trim(), name: data.name.trim(), email: data.email.trim().toLowerCase(), roleId: data.roleId,
          active: true, emailVerified: true, color: colors[db.users.length % colors.length], failedAttempts: 0, lockedUntil: null,
          createdAt: Date.now(), lastLoginAt: null, createdBy: u.id,
        };
        let temp = null;
        if (data.method === 'temp') {
          temp = tempPassword();
          const { salt, hash } = await hashPassword(temp);
          Object.assign(t, { passwordSalt: salt, passwordHash: hash, mustChangePassword: true });
        } else {
          t.pendingInvite = true; t.emailVerified = false;
        }
        db.users.push(t);
        if (!temp) {
          const { raw } = await issueToken(t, 'reset', 72 * 3600e3);
          sendMail(t.email, '您的帳號已建立，請設定密碼', `${t.name} 您好，\n\n${u.name} 已為您建立會議紀錄系統帳號（帳號：${t.username}）。請於 72 小時內點擊下方連結設定密碼後登入。`, { link: `#reset-${raw}`, linkLabel: '設定密碼' });
        }
        audit(u.id, `新增帳號「${t.name}」（${temp ? '臨時密碼' : '寄送邀請信'}）`);
        persist();
        return clone({ user: safeUser(t), tempPassword: temp });
      },
      async updateAccount(userId, data) {
        await delay(450);
        maybeFail();
        const u = await me();
        requirePerm(u, 'system.accounts');
        const t = db.users.find((x) => x.id === userId);
        if (!t) throw new ApiError(404, '找不到使用者');
        const errs = validateAll({ name: adminUserSchema.name, email: adminUserSchema.email, username: adminUserSchema.username }, data);
        if (Object.keys(errs).length) throw new ApiError(422, '資料格式有誤', { code: 'VALIDATION', fields: errs });
        if (db.users.some((x) => x.id !== userId && x.username.toLowerCase() === data.username.trim().toLowerCase()))
          throw new ApiError(409, '此帳號已被使用', { code: 'DUPLICATE', fields: { username: '此帳號已被使用，請換一個' } });
        const dupe = findByEmail(data.email);
        if (dupe && dupe.id !== userId) throw new ApiError(409, '此 Email 已被使用', { code: 'DUPLICATE', fields: { email: '此 Email 已被其他帳號使用' } });
        const changes = [];
        if (t.name !== data.name.trim()) changes.push('姓名');
        if (t.email !== data.email.trim().toLowerCase()) changes.push('Email');
        if (t.username !== data.username.trim()) changes.push('帳號');
        Object.assign(t, { name: data.name.trim(), email: data.email.trim().toLowerCase(), username: data.username.trim() });
        if (changes.length) audit(u.id, `修改「${t.name}」的${changes.join('、')}`);
        persist();
        return clone(safeUser(t));
      },
      // method: 'email'（寄送重設信）| 'temp'（產生臨時密碼，下次登入強制變更）
      async resetAccountPassword(userId, method) {
        await delay(500);
        maybeFail();
        const u = await me();
        requirePerm(u, 'system.accounts');
        const t = db.users.find((x) => x.id === userId);
        if (!t) throw new ApiError(404, '找不到使用者');
        if (t.id === u.id) throw new ApiError(403, '請至「帳號設定」變更自己的密碼');
        let temp = null;
        if (method === 'temp') {
          temp = tempPassword();
          const { salt, hash } = await hashPassword(temp);
          Object.assign(t, { passwordSalt: salt, passwordHash: hash, mustChangePassword: true, lockedUntil: null, failedAttempts: 0 });
          revokeSessions(t.id);
          sendMail(t.email, '管理員已重設您的密碼', `${t.name} 您好，\n\n系統管理員已重設您的密碼，所有裝置已登出。請向管理員取得臨時密碼，登入後需立即設定新密碼。`);
        } else {
          const { raw } = await issueToken(t, 'reset', 30 * 60e3);
          sendMail(t.email, '重設您的密碼', `${t.name} 您好，\n\n系統管理員為您發送了重設密碼連結，請於 30 分鐘內點擊下方連結設定新密碼。`, { link: `#reset-${raw}`, linkLabel: '重設密碼' });
        }
        audit(u.id, `重設「${t.name}」的密碼（${temp ? '臨時密碼' : '寄送重設信'}）`);
        persist();
        return { tempPassword: temp };
      },
      async unlockAccount(userId) {
        await delay(300);
        maybeFail();
        const u = await me();
        requirePerm(u, 'system.accounts');
        const t = db.users.find((x) => x.id === userId);
        t.lockedUntil = null; t.failedAttempts = 0;
        audit(u.id, `解除「${t.name}」的登入鎖定`);
        persist();
        return { ok: true };
      },
      async revokeAccountSessions(userId) {
        await delay(300);
        maybeFail();
        const u = await me();
        requirePerm(u, 'system.accounts');
        const t = db.users.find((x) => x.id === userId);
        if (t.id === u.id) throw new ApiError(403, '請至「帳號設定」管理自己的登入裝置');
        revokeSessions(t.id);
        audit(u.id, `強制登出「${t.name}」的所有裝置`);
        persist();
        return { ok: true };
      },
      async resendInvite(userId) {
        await delay(400);
        maybeFail();
        const u = await me();
        requirePerm(u, 'system.accounts');
        const t = db.users.find((x) => x.id === userId);
        if (t.pendingInvite) {
          const { raw } = await issueToken(t, 'reset', 72 * 3600e3);
          sendMail(t.email, '您的帳號已建立，請設定密碼', `${t.name} 您好，\n\n這是重新寄送的帳號邀請（帳號：${t.username}）。請於 72 小時內點擊下方連結設定密碼後登入。`, { link: `#reset-${raw}`, linkLabel: '設定密碼' });
        } else if (!t.emailVerified) await sendVerification(t);
        persist();
        return { ok: true };
      },
      async listAuditLogs() {
        await delay(200);
        requirePerm((await me()), 'system.permissions');
        return clone([...db.auditLogs].sort((a, b) => b.at - a.at).slice(0, 100));
      },
    },
  };
}

async function sendVerification(u) {
  const { raw, code } = await issueToken(u, 'verify', 10 * 60e3);
  sendMail(u.email, '請驗證您的 Email', `${u.name} 您好，\n\n感謝註冊會議紀錄系統。您的驗證碼為：${code}\n驗證碼 10 分鐘內有效。\n\n也可以直接點擊下方連結完成驗證。`,
    { code, link: `#confirm-${raw}`, linkLabel: '驗證 Email' });
}
async function findResetToken(token) {
  await ready;
  const h = await sha256(String(token || ''));
  const t = db.authTokens.find((x) => x.kind === 'reset' && x.tokenHash === h);
  if (!t) throw new ApiError(410, '此重設密碼連結無效，可能已被新的申請取代', { code: 'RESET_INVALID' });
  if (t.usedAt) throw new ApiError(410, '此連結已使用過，每個重設連結只能使用一次', { code: 'RESET_USED' });
  if (t.expiresAt < Date.now()) throw new ApiError(410, '此重設密碼連結已過期（有效時間 30 分鐘）', { code: 'RESET_EXPIRED' });
  return t;
}

// ── 開發工具（預覽控制台用，不經權限） ─────────
export async function devLogin(userId, device) {
  await ready;
  const u = db.users.find((x) => x.id === userId);
  return createSession(u, false, device);
}
export function devOutbox() { return clone(db.outbox || []); }
export function devMarkRead(id) { const m = db.outbox.find((x) => x.id === id); if (m) { m.read = true; persist(); } }
export function devExpireTokens() { (db.authTokens || []).forEach((t) => { t.expiresAt = Date.now() - 1000; }); persist(); }
export function devUsers() {
  return clone(db.users.map((u) => ({ ...safeUser(u), roleName: db.roles.find((r) => r.id === u.roleId)?.name })));
}
export function simulateOtherUserEdit(meetingId, userId = 'u2') {
  const cur = db.content[meetingId];
  if (!cur) return false;
  const doc = clone(cur.doc);
  doc.content.push({ type: 'paragraph', content: [{ type: 'text', text: '（林怡君 剛剛補充：請一併評估沖繩線的機位。）', marks: [{ type: 'italic' }] }] });
  db.content[meetingId] = { version: cur.version + 1, doc, updatedAt: Date.now(), updatedBy: userId };
  log(meetingId, userId, `編輯內容（版本 ${cur.version + 1}）`);
  touch(meetingId);
  persist();
  emit({ type: 'content', id: meetingId, version: cur.version + 1, updatedBy: userId });
  return true;
}
