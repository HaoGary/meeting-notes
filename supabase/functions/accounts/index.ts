// 帳號相關的伺服器端操作（需要 secret key，不能放在前端）
// POST /functions/v1/accounts  body: { action, ...params }
//
// 管理員（需「帳號管理」權限）：
//   create         新增帳號：method 'temp'（臨時密碼）或 'invite'（寄邀請信）
//   update         修改他人姓名、帳號、Email
//   setActive      停用／啟用（同步封鎖 Auth 帳號並登出所有裝置）
//   resetPassword  重設他人密碼：method 'temp' 或 'email'
//   revokeSessions 強制登出某人所有裝置
//   resendInvite   重寄邀請信
// 登入者本人：
//   listSessions   列出自己的登入裝置
//   revokeSession  登出自己的某一個裝置（不可登出目前這台）
import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'ERROR', public fields?: Record<string, string>) {
    super(message);
  }
}

const envKey = (json: string, legacy: string) => {
  try { const k = JSON.parse(Deno.env.get(json) ?? '{}').default; if (k) return k as string; } catch { /* 使用舊金鑰 */ }
  return Deno.env.get(legacy)!;
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRET_KEY = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const PUBLISHABLE_KEY = envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const APP_URL = Deno.env.get('APP_URL') || undefined; // 信件連結回到的前台網址（未設定時使用 Auth 的 Site URL）

const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SECRET_KEY, clientOpts);
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_.]{3,19}$/;

// ── 共用 ───────────────────────────────────────
type Caller = { id: string; name: string; perms: Set<string>; token: string; sessionId: string | null };

function jwtClaims(token: string): Record<string, unknown> {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')));
  } catch { return {}; }
}

async function getCaller(req: Request, { allowPending = false } = {}): Promise<Caller> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new ApiError(401, '請先登入', 'NOT_LOGGED_IN');
  const { data, error } = await admin.auth.getUser(token); // 由 Auth 伺服器驗證 token
  if (error || !data.user) throw new ApiError(401, '登入已失效，請重新登入', 'SESSION_EXPIRED');
  const [p] = await sql`
    select p.id, p.name, p.active, p.must_change_password,
           coalesce(array_agg(rp.permission_key) filter (where rp.permission_key is not null), '{}') as perms
      from public.profiles p left join public.role_permissions rp on rp.role_id = p.role_id
     where p.id = ${data.user.id} group by p.id`;
  if (!p || !p.active) throw new ApiError(403, '此帳號已停用，請聯絡系統管理員', 'ACCOUNT_DISABLED');
  if (p.must_change_password && !allowPending) throw new ApiError(403, '請先變更密碼後再繼續使用', 'PASSWORD_CHANGE_REQUIRED');
  return { id: p.id, name: p.name, perms: new Set(p.perms), token, sessionId: (jwtClaims(token).session_id as string) ?? null };
}

const requirePerm = (me: Caller, key: string, label: string) => {
  if (!me.perms.has(key)) throw new ApiError(403, `沒有「${label}」權限`, 'FORBIDDEN');
};

async function getTarget(userId: string) {
  if (!userId) throw new ApiError(422, '缺少使用者', 'VALIDATION');
  const [t] = await sql`
    select p.id, p.name, p.username::text as username, p.email, p.role_id, p.active,
           u.last_sign_in_at, u.invited_at, u.email_confirmed_at
      from public.profiles p join auth.users u on u.id = p.id where p.id = ${userId}`;
  if (!t) throw new ApiError(404, '找不到使用者', 'NOT_FOUND');
  return t;
}

const audit = (actorId: string, action: string) =>
  sql`insert into public.audit_logs (actor_id, action) values (${actorId}, ${action})`;

// 刪除 Auth session（連帶失效 refresh token）；已發出的 access token 會在到期（預設 1 小時）後失效
const revokeAllSessions = (userId: string) => sql`delete from auth.sessions where user_id = ${userId}`;

function tempPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789'];
  const all = sets.join('');
  const rand = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = [...sets.map((s) => s[rand(s.length)]), ...Array.from({ length: 9 }, () => all[rand(all.length)])];
  for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

function validateAccount(d: Record<string, unknown>) {
  const f: Record<string, string> = {};
  const name = String(d.name ?? '').trim(), email = String(d.email ?? '').trim().toLowerCase(), username = String(d.username ?? '').trim();
  if (!name) f.name = '請輸入姓名'; else if (name.length > 30) f.name = '不可超過 30 個字元';
  if (!email) f.email = '請輸入 Email'; else if (!EMAIL_RE.test(email)) f.email = 'Email 格式不正確，例如 name@company.com';
  if (!username) f.username = '請輸入帳號';
  else if (!USERNAME_RE.test(username)) f.username = '帳號需為 4–20 個字元，以英文字母開頭，可包含數字、底線或句點';
  if (Object.keys(f).length) throw new ApiError(422, '資料格式有誤', 'VALIDATION', f);
  return { name, email, username };
}

async function assertUnique(username: string, email: string, exceptId: string | null) {
  const [u] = await sql`select 1 from public.profiles where lower(username::text) = lower(${username}) and id is distinct from ${exceptId}`;
  if (u) throw new ApiError(409, '此帳號已被使用', 'DUPLICATE', { username: '此帳號已被使用，請換一個' });
  const [e] = await sql`select 1 from public.profiles where email = ${email} and id is distinct from ${exceptId}`;
  if (e) throw new ApiError(409, '此 Email 已被使用', 'DUPLICATE', { email: '此 Email 已有帳號' });
}

function deviceLabel(ua: string | null) {
  if (!ua) return '未知裝置';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '瀏覽器';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser}・${os}` : browser;
}

// ── 各項操作 ────────────────────────────────────
const actions: Record<string, (me: Caller, b: Record<string, any>) => Promise<unknown>> = {
  async create(me, b) {
    requirePerm(me, 'system.accounts', '帳號管理');
    const { name, email, username } = validateAccount(b);
    const roleId = String(b.roleId ?? '');
    const [role] = await sql`select id, name from public.roles where id = ${roleId}`;
    if (!role) throw new ApiError(422, '角色不存在', 'VALIDATION', { roleId: '請選擇角色' });
    if (roleId === 'admin') requirePerm(me, 'system.permissions', '權限管理');
    await assertUnique(username, email, null);

    let userId: string, temp: string | null = null;
    if (b.method === 'temp') {
      temp = tempPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email, password: temp, email_confirm: true,
        user_metadata: { name, username },
        app_metadata: { role_id: roleId, must_change_password: true, created_by: me.id },
      });
      if (error || !data.user) throw new ApiError(400, `建立帳號失敗：${error?.message ?? '未知錯誤'}`, 'AUTH_ERROR');
      userId = data.user.id;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { name, username }, redirectTo: APP_URL });
      if (error || !data.user) throw new ApiError(400, `寄送邀請信失敗：${error?.message ?? '未知錯誤'}`, 'AUTH_ERROR');
      userId = data.user.id;
      // 邀請 API 無法設定 app_metadata，改由伺服器直接設定角色
      await sql`update public.profiles set role_id = ${roleId}, created_by = ${me.id} where id = ${userId}`;
    }
    await audit(me.id, `新增帳號「${name}」（${temp ? '臨時密碼' : '寄送邀請信'}）`);
    return { user: await getTarget(userId), tempPassword: temp };
  },

  async update(me, b) {
    requirePerm(me, 'system.accounts', '帳號管理');
    const t = await getTarget(b.userId);
    const { name, email, username } = validateAccount(b);
    await assertUnique(username, email, t.id);
    const changes: string[] = [];
    if (email !== t.email) {
      const { error } = await admin.auth.admin.updateUserById(t.id, { email, email_confirm: true }); // 觸發器同步到 profiles
      if (error) throw new ApiError(400, `更新 Email 失敗：${error.message}`, 'AUTH_ERROR');
      changes.push('Email');
    }
    if (name !== t.name) changes.push('姓名');
    if (username !== t.username) changes.push('帳號');
    await sql`update public.profiles set name = ${name}, username = ${username} where id = ${t.id}`;
    if (changes.length) await audit(me.id, `修改「${t.name}」的${changes.join('、')}`);
    return { user: await getTarget(t.id) };
  },

  async setActive(me, b) {
    requirePerm(me, 'system.accounts', '帳號管理');
    const t = await getTarget(b.userId);
    const active = !!b.active;
    // 由資料庫函式檢查（不可停用自己、至少保留一位管理員）並寫入異動紀錄
    const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY,
      { ...clientOpts, global: { headers: { Authorization: `Bearer ${me.token}` } } });
    const { error } = await userClient.rpc('set_user_active', { p_user: t.id, p_active: active });
    if (error) throw new ApiError(error.code?.startsWith('PT') ? Number(error.code.slice(2)) : 400, error.message, error.hint || 'ERROR');
    const { error: banErr } = await admin.auth.admin.updateUserById(t.id, { ban_duration: active ? 'none' : '876000h' });
    if (banErr) throw new ApiError(400, `更新登入狀態失敗：${banErr.message}`, 'AUTH_ERROR');
    if (!active) await revokeAllSessions(t.id);
    return { user: await getTarget(t.id) };
  },

  async resetPassword(me, b) {
    requirePerm(me, 'system.accounts', '帳號管理');
    const t = await getTarget(b.userId);
    if (t.id === me.id) throw new ApiError(403, '請至「帳號設定」變更自己的密碼', 'SELF');
    let temp: string | null = null;
    if (b.method === 'temp') {
      temp = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(t.id, { password: temp });
      if (error) throw new ApiError(400, `重設密碼失敗：${error.message}`, 'AUTH_ERROR');
      await sql`update public.profiles set must_change_password = true where id = ${t.id}`;
      await revokeAllSessions(t.id);
    } else {
      const pub = createClient(SUPABASE_URL, PUBLISHABLE_KEY, clientOpts);
      const { error } = await pub.auth.resetPasswordForEmail(t.email, { redirectTo: APP_URL });
      if (error) throw new ApiError(400, `寄送重設信失敗：${error.message}`, 'AUTH_ERROR');
    }
    await audit(me.id, `重設「${t.name}」的密碼（${temp ? '臨時密碼' : '寄送重設信'}）`);
    return { tempPassword: temp };
  },

  async revokeSessions(me, b) {
    requirePerm(me, 'system.accounts', '帳號管理');
    const t = await getTarget(b.userId);
    if (t.id === me.id) throw new ApiError(403, '請至「帳號設定」管理自己的登入裝置', 'SELF');
    await revokeAllSessions(t.id);
    await audit(me.id, `強制登出「${t.name}」的所有裝置`);
    return { ok: true };
  },

  async resendInvite(me, b) {
    requirePerm(me, 'system.accounts', '帳號管理');
    const t = await getTarget(b.userId);
    if (t.last_sign_in_at) throw new ApiError(409, '此帳號已登入過，請改用「重設密碼」', 'ALREADY_ACTIVE');
    const { error } = await admin.auth.admin.inviteUserByEmail(t.email, { redirectTo: APP_URL });
    if (error) throw new ApiError(400, `重寄邀請信失敗：${error.message}`, 'AUTH_ERROR');
    return { ok: true };
  },

  async listSessions(me) {
    const rows = await sql`
      select id, created_at, coalesce(refreshed_at, updated_at, created_at) as last_active_at, user_agent, host(ip) as ip
        from auth.sessions
       where user_id = ${me.id} and (not_after is null or not_after > now())
       order by coalesce(refreshed_at, updated_at, created_at) desc`;
    return {
      sessions: rows.map((s) => ({
        id: s.id, device: deviceLabel(s.user_agent), ip: s.ip, createdAt: s.created_at,
        lastActiveAt: s.last_active_at, current: s.id === me.sessionId,
      })),
    };
  },

  async revokeSession(me, b) {
    if (!b.sessionId) throw new ApiError(422, '缺少裝置', 'VALIDATION');
    if (b.sessionId === me.sessionId) throw new ApiError(422, '無法登出目前使用中的裝置，請使用右上角「登出」', 'CURRENT_SESSION');
    const res = await sql`delete from auth.sessions where id = ${b.sessionId} and user_id = ${me.id}`;
    if (!res.count) throw new ApiError(404, '找不到此裝置，可能已登出', 'NOT_FOUND');
    return { ok: true };
  },
};

const SELF_ACTIONS = new Set(['listSessions', 'revokeSession']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    if (req.method !== 'POST') throw new ApiError(405, '只接受 POST', 'METHOD_NOT_ALLOWED');
    const body = await req.json().catch(() => ({}));
    const fn = actions[body.action];
    if (!fn) throw new ApiError(400, '未知的操作', 'UNKNOWN_ACTION');
    const me = await getCaller(req, { allowPending: SELF_ACTIONS.has(body.action) });
    return reply(200, await fn(me, body));
  } catch (e) {
    if (e instanceof ApiError) return reply(e.status, { error: { message: e.message, code: e.code, fields: e.fields } });
    console.error(e);
    return reply(500, { error: { message: '伺服器發生錯誤，請稍後再試', code: 'INTERNAL' } });
  }
});
