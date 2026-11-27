// 以 Supabase 實作與 mockServer 相同介面的 createApi()
// 頁面只依賴這組方法與回傳格式（camelCase、時間為毫秒），後端從模擬換成 Supabase 時頁面不需修改。
// 權限檢查都在資料庫（RLS、RPC）與 Edge Function 執行，這裡只做格式轉換與錯誤對應。
import { createClient } from '@supabase/supabase-js';
import { supabase as sb, setRemember, appUrl, SUPABASE_URL, SUPABASE_KEY } from './supabaseClient';
import { validateAll, resetSchema, changePasswordSchema, profileSchema, EMAIL_RE } from '../utils/validators';

export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data; this.code = data?.code; }
}

// ── 格式轉換 ───────────────────────────────────
const ms = (t) => (t ? Date.parse(t) : null);
const hhmm = (t) => (t ? String(t).slice(0, 5) : t);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maskEmail = (e = '') => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.max(2, b.length)) + c);

const toMeeting = (r) => ({
  id: r.id, title: r.title, date: r.meeting_date, start: hhmm(r.start_time), end: hhmm(r.end_time),
  location: r.location, onlineUrl: r.online_url, hostId: r.host_id, type: r.type, status: r.status, guests: r.guests || [],
  createdBy: r.created_by, createdAt: ms(r.created_at), updatedAt: ms(r.updated_at),
  ...('permission' in r ? {
    permission: r.permission, canArchive: !!r.can_archive, canShare: !!r.can_share,
    canDelete: !!r.can_delete, attendeeCount: r.attendee_count,
  } : {}),
});
const MEETING_COLUMNS = { title: 'title', date: 'meeting_date', start: 'start_time', end: 'end_time',
  location: 'location', onlineUrl: 'online_url', hostId: 'host_id', type: 'type', guests: 'guests' };
// 外部參與人員（無系統帳號）：去除空白與重複，名字最多 40 字、最多 50 位
export const cleanGuests = (list = []) => {
  const out = [...new Set(list.map((g) => String(g).trim()).filter(Boolean))];
  if (out.some((g) => g.length > 40)) throw new ApiError(422, '名字最多 40 個字', { code: 'VALIDATION' });
  if (out.length > 50) throw new ApiError(422, '外部參與人員最多 50 位', { code: 'VALIDATION' });
  return out;
};
const toAttendee = (a) => ({ meetingId: a.meeting_id, userId: a.user_id, permission: a.permission });
const toContent = (c) => c && ({ version: c.version, doc: c.doc, updatedAt: ms(c.updated_at), updatedBy: c.updated_by });
const toShare = (s) => s && ({
  meetingId: s.meeting_id, token: s.token, enabled: s.enabled, scope: s.scope, expiresAt: ms(s.expires_at),
  createdBy: s.created_by, createdAt: ms(s.created_at), viewCount: s.view_count,
});
const toHistory = (h) => ({ id: h.id, meetingId: h.meeting_id, userId: h.user_id, action: h.action, at: ms(h.created_at) });
const toProfile = (p, roles = {}) => ({
  id: p.id, username: p.username, name: p.name, email: p.email, roleId: p.role_id, roleName: roles[p.role_id],
  active: p.active, color: p.color, mustChangePassword: !!p.must_change_password,
  createdAt: ms(p.created_at), createdBy: p.created_by ?? null,
  ...('email_confirmed_at' in p ? { emailVerified: !!p.email_confirmed_at } : {}),
  ...('last_sign_in_at' in p ? { lastLoginAt: ms(p.last_sign_in_at) } : {}),
  ...('pending_invite' in p ? { pendingInvite: !!p.pending_invite } : {}),
  ...('session_count' in p ? { sessionCount: Number(p.session_count) } : {}),
  locked: false, // 依需求不做登入鎖定
});

export function createApi(_getToken, { onUnauthorized, onSignedOut } = {}) {
  let expectingSignOut = false; // 主動登出時不觸發「登入已逾時」
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && !expectingSignOut) {
      onUnauthorized?.(new ApiError(401, '登入已逾時或已在其他地方登出，請重新登入', { code: 'SESSION_EXPIRED' }));
    }
  });
  const signOut = async (scope) => {
    expectingSignOut = true;
    try { await sb.auth.signOut({ scope }); } finally { expectingSignOut = false; }
    onSignedOut?.(); // 讓畫面清除登入狀態（例如重設密碼後）
  };
  const unauthorized = (msg = '登入已逾時，請重新登入', code = 'SESSION_EXPIRED') => {
    const e = new ApiError(401, msg, { code });
    onUnauthorized?.(e);
    return e;
  };

  // 資料庫錯誤 → ApiError（RPC 以 SQLSTATE 'PT<HTTP 狀態>' 回傳，hint 為錯誤代碼）
  const dbError = (error) => {
    const c = error.code || '';
    if (/^PT\d{3}$/.test(c)) {
      if (c === 'PT401' && error.hint !== 'LOGIN_REQUIRED') return unauthorized(error.message, error.hint);
      return new ApiError(Number(c.slice(2)), error.message, { code: error.hint || undefined });
    }
    if (c === 'PGRST301' || c === 'PGRST303' || /jwt expired/i.test(error.message)) return unauthorized();
    if (c === '42501') return new ApiError(403, '您沒有執行此操作的權限', { code: 'FORBIDDEN' });
    if (c === '23514') return new ApiError(422, '資料不符合規則，請檢查欄位（例如結束時間需晚於開始時間）', { code: 'VALIDATION' });
    if (c === '23505') return new ApiError(409, '資料重複', { code: 'DUPLICATE' });
    if (c === '22P02') return new ApiError(404, '找不到資料', { code: 'NOT_FOUND' });
    if (!c && /fetch|network/i.test(error.message || '')) return new ApiError(0, '網路連線失敗，請稍後再試', { code: 'NETWORK' });
    return new ApiError(400, error.message || '操作失敗，請稍後再試', { code: c || undefined });
  };
  const run = async (promise) => {
    let res;
    try { res = await promise; } catch { throw new ApiError(0, '網路連線失敗，請稍後再試', { code: 'NETWORK' }); }
    if (res.error) throw dbError(res.error);
    return res.data;
  };
  const rpc = (name, args) => run(sb.rpc(name, args));

  // Edge Function：accounts
  const fn = async (action, params = {}) => {
    const { data, error } = await sb.functions.invoke('accounts', { body: { action, ...params } });
    if (!error) return data;
    let body = null;
    try { body = await error.context?.json(); } catch { /* 非 JSON 回應 */ }
    const status = error.context?.status || 0;
    const er = body?.error || {};
    if (status === 401) throw unauthorized(er.message, er.code);
    throw new ApiError(status, er.message || (status ? '操作失敗，請稍後再試' : '網路連線失敗，請稍後再試'),
      { code: er.code, fields: er.fields });
  };

  const sessionUser = async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw unauthorized('請先登入', 'NOT_LOGGED_IN');
    return data.session.user;
  };
  const roleNames = async () => Object.fromEntries((await run(sb.from('roles').select('id, name'))).map((r) => [r.id, r.name]));

  return {
    // ── 目前登入者 ──
    async me() {
      const data = await rpc('my_profile');
      if (!data) throw unauthorized('找不到帳號資料，請重新登入', 'NOT_LOGGED_IN');
      const u = data.user;
      if (!u.active) {
        await signOut('local');
        throw unauthorized('此帳號已停用，請聯絡系統管理員', 'ACCOUNT_DISABLED');
      }
      return { user: toProfile(u, await roleNames()), permissions: data.permissions };
    },
    async listUsers() {
      const rows = await run(sb.from('profiles').select('id, name, color, active').eq('active', true).order('created_at'));
      return rows;
    },

    // ── 會議 ──
    async listMeetings() {
      return (await rpc('list_meetings')).map(toMeeting);
    },
    async getMeeting(id) {
      if (!UUID_RE.test(id)) throw new ApiError(404, '找不到此會議，可能已被刪除', { code: 'NOT_FOUND' });
      const [m, a, c, acc] = await Promise.all([
        run(sb.from('meetings').select('*').eq('id', id).maybeSingle()),
        run(sb.from('meeting_attendees').select('*').eq('meeting_id', id).order('added_at')),
        run(sb.from('meeting_contents').select('*').eq('meeting_id', id).maybeSingle()),
        rpc('get_meeting_access', { p_meeting: id }),
      ]);
      if (!m) throw new ApiError(404, '找不到此會議，可能已被刪除，或您沒有檢視權限', { code: 'NOT_FOUND' });
      return {
        meeting: toMeeting(m), attendees: a.map(toAttendee), content: toContent(c),
        permission: acc.permission, canArchive: acc.can_archive, canShare: acc.can_share, canDelete: acc.can_delete,
      };
    },
    // 只取內容（收到他人更新通知時重新載入）
    async getContent(id) {
      const c = await run(sb.from('meeting_contents').select('*').eq('meeting_id', id).maybeSingle());
      if (!c) throw new ApiError(404, '找不到此會議', { code: 'NOT_FOUND' });
      return toContent(c);
    },
    async createMeeting(d) {
      return toMeeting(await rpc('create_meeting', {
        p_title: d.title, p_date: d.date, p_start: d.start, p_end: d.end, p_type: d.type, p_doc: d.doc ?? null,
      }));
    },
    async updateMeeting(id, patch) {
      if (Object.keys(patch).length === 1 && 'status' in patch) {
        return toMeeting(await rpc('set_meeting_status', { p_meeting: id, p_status: patch.status }));
      }
      if ('guests' in patch) patch = { ...patch, guests: cleanGuests(patch.guests) };
      const row = {};
      Object.entries(patch).forEach(([k, v]) => { if (MEETING_COLUMNS[k]) row[MEETING_COLUMNS[k]] = v; });
      const rows = await run(sb.from('meetings').update(row).eq('id', id).select());
      if (!rows.length) throw new ApiError(403, '無法修改：您只有檢視權限，或會議已封存', { code: 'FORBIDDEN' });
      return toMeeting(rows[0]);
    },
    async deleteMeeting(id) {
      const rows = await run(sb.from('meetings').delete().eq('id', id).select('id'));
      if (!rows.length) throw new ApiError(403, '沒有刪除此會議的權限', { code: 'FORBIDDEN' });
      return { ok: true };
    },
    async setAttendees(id, list) {
      const rows = await rpc('set_meeting_attendees', {
        p_meeting: id, p_attendees: list.map((x) => ({ user_id: x.userId, permission: x.permission })),
      });
      return rows.map(toAttendee);
    },
    // 樂觀鎖：版本不同時丟出 409，data 為伺服器上的最新內容（與模擬後端相同）
    async saveContent(id, doc, baseVersion) {
      const r = await rpc('save_meeting_content', { p_meeting: id, p_doc: doc, p_base_version: baseVersion });
      if (r.conflict) {
        throw new ApiError(409, '此會議已被其他人更新',
          { code: 'CONFLICT', version: r.version, doc: r.doc, updatedAt: ms(r.updated_at), updatedBy: r.updated_by });
      }
      return { version: r.version, updatedAt: ms(r.updated_at) };
    },
    async listHistory(meetingId) {
      const rows = await run(sb.from('meeting_history').select('*').eq('meeting_id', meetingId)
        .order('created_at', { ascending: false }).limit(50));
      return rows.map(toHistory);
    },
    async uploadImage(meetingId, file) {
      if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) throw new ApiError(415, '僅支援 PNG、JPG、GIF、WebP');
      if (file.size > 5 * 1024 * 1024) throw new ApiError(413, '圖片不可超過 5MB');
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[file.type];
      const path = `${meetingId}/${crypto.randomUUID()}.${ext}`;
      const bucket = sb.storage.from('meeting-images');
      const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new ApiError(error.statusCode === '403' ? 403 : 400, error.statusCode === '403' ? '沒有上傳圖片的權限' : `上傳失敗：${error.message}`);
      return { url: bucket.getPublicUrl(path).data.publicUrl };
    },

    // ── 分享 ──
    async getShare(meetingId) {
      return toShare(await run(sb.from('meeting_shares').select('*').eq('meeting_id', meetingId).maybeSingle()));
    },
    async updateShare(meetingId, patch) {
      const p = {};
      if ('enabled' in patch) p.enabled = patch.enabled;
      if ('scope' in patch) p.scope = patch.scope;
      if ('expiresInDays' in patch) p.expires_in_days = patch.expiresInDays;
      return toShare(await rpc('update_share', { p_meeting: meetingId, p_patch: p }));
    },
    async resetShareToken(meetingId) {
      return toShare(await rpc('reset_share_token', { p_meeting: meetingId }));
    },
    async getSharedMeeting(token) {
      const r = await rpc('get_shared_meeting', { p_token: token });
      const m = r.meeting;
      return {
        meeting: { title: m.title, date: m.meeting_date, start: hhmm(m.start_time), end: hhmm(m.end_time),
          location: m.location, onlineUrl: m.online_url, type: m.type, status: m.status },
        host: r.host, attendees: r.attendees, guests: r.guests || [], doc: r.doc, updatedAt: ms(r.updated_at), scope: r.scope, expiresAt: ms(r.expires_at),
      };
    },

    // ── 個人帳號設定 ──
    account: {
      async updateProfile(data) {
        const errs = validateAll(profileSchema, data);
        if (Object.keys(errs).length) throw new ApiError(422, '資料格式有誤', { code: 'VALIDATION', fields: errs });
        const u = await sessionUser();
        const rows = await run(sb.from('profiles').update({ name: data.name.trim() }).eq('id', u.id).select('id'));
        if (!rows.length) throw new ApiError(403, '無法更新個人資料', { code: 'FORBIDDEN' });
        return { ok: true };
      },
      // 一般變更需驗證目前密碼；被要求強制變更（臨時密碼）時免輸入
      async changePassword({ current, password, confirm }) {
        const u = await sessionUser();
        const forced = !!(await rpc('my_profile'))?.user?.must_change_password;
        const errs = validateAll(forced ? resetSchema : changePasswordSchema, { current, password, confirm });
        if (Object.keys(errs).length) throw new ApiError(422, '資料格式有誤', { code: 'VALIDATION', fields: errs });
        if (!forced) {
          // 用獨立的暫時 client 驗證目前密碼（不影響目前登入狀態；產生的 session 稍後一併登出）
          const check = createClient(SUPABASE_URL, SUPABASE_KEY,
            { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'mn-verify' } });
          const { error } = await check.auth.signInWithPassword({ email: u.email, password: current });
          if (error) throw new ApiError(422, '目前密碼不正確', { code: 'WRONG_PASSWORD', fields: { current: '目前密碼不正確' } });
        }
        const { error } = await sb.auth.updateUser({ password });
        if (error) {
          if (error.code === 'same_password') throw new ApiError(422, '新密碼不可與目前密碼相同', { code: 'SAME_PASSWORD', fields: { password: '新密碼不可與目前密碼相同' } });
          if (error.code === 'weak_password') throw new ApiError(422, '密碼強度不足', { code: 'VALIDATION', fields: { password: '密碼強度不足，請換一個' } });
          throw new ApiError(400, `變更密碼失敗：${error.message}`);
        }
        if (forced) await rpc('complete_password_change');
        await sb.auth.signOut({ scope: 'others' }); // 其他裝置全部登出，保留目前這台
        return { ok: true };
      },
      // 變更自己的 Email：驗證目前密碼後，由 Supabase 寄出確認信；點信中連結後才生效
      async requestEmailChange({ email, password }) {
        const u = await sessionUser();
        const next = String(email || '').trim().toLowerCase();
        const fields = {};
        if (!EMAIL_RE.test(next)) fields.email = 'Email 格式不正確';
        else if (next === String(u.email).toLowerCase()) fields.email = '與目前的 Email 相同';
        if (!password) fields.password = '請輸入目前密碼';
        if (Object.keys(fields).length) throw new ApiError(422, '資料格式有誤', { code: 'VALIDATION', fields });
        const check = createClient(SUPABASE_URL, SUPABASE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'mn-verify' } });
        const { error: pwErr } = await check.auth.signInWithPassword({ email: u.email, password });
        if (pwErr) throw new ApiError(422, '目前密碼不正確', { code: 'WRONG_PASSWORD', fields: { password: '目前密碼不正確' } });
        await check.auth.signOut({ scope: 'local' }).catch(() => {});
        const { error } = await sb.auth.updateUser({ email: next }, { emailRedirectTo: appUrl() });
        if (error) {
          if (error.code === 'email_exists') throw new ApiError(422, '此 Email 已被使用', { code: 'DUPLICATE', fields: { email: '此 Email 已被其他帳號使用' } });
          if (error.code === 'over_email_send_rate_limit') throw new ApiError(429, '寄信次數過多，請稍後再試');
          throw new ApiError(400, `無法變更 Email：${error.message}`);
        }
        return { pending: true, email: next, current: u.email };
      },
      async listSessions() {
        const { sessions } = await fn('listSessions');
        return sessions.map((s) => ({ ...s, createdAt: ms(s.createdAt), lastActiveAt: ms(s.lastActiveAt), remember: false }));
      },
      async revokeSession(id) {
        return fn('revokeSession', { sessionId: id });
      },
      async revokeOtherSessions() {
        const { sessions } = await fn('listSessions');
        await sb.auth.signOut({ scope: 'others' });
        return { count: sessions.filter((s) => !s.current).length };
      },
    },

    // ── 登入、密碼（不需登入） ──
    auth: {
      async login({ identifier, password, remember }) {
        const email = String(identifier || '').trim().toLowerCase();
        if (!EMAIL_RE.test(email)) throw new ApiError(422, '請輸入正確的 Email', { code: 'ACCOUNT_NOT_FOUND' });
        setRemember(remember);
        let res;
        try { res = await sb.auth.signInWithPassword({ email, password }); } catch { throw new ApiError(0, '網路連線失敗，請稍後再試', { code: 'NETWORK' }); }
        const { data, error } = res;
        if (error) {
          if (!error.status || /fetch/i.test(error.message)) throw new ApiError(0, '網路連線失敗，請稍後再試', { code: 'NETWORK' });
          if (error.code === 'invalid_credentials') throw new ApiError(401, 'Email 或密碼錯誤', { code: 'INVALID_PASSWORD' });
          if (error.code === 'email_not_confirmed') throw new ApiError(403, '尚未完成 Email 驗證，請先驗證後再登入', { code: 'EMAIL_NOT_VERIFIED', email });
          if (error.code === 'user_banned') throw new ApiError(403, '此帳號已停用，請聯絡系統管理員', { code: 'ACCOUNT_DISABLED' });
          if (error.status === 429) throw new ApiError(429, '嘗試次數過多，請稍後再試', { code: 'TOO_MANY' });
          throw new ApiError(error.status || 400, error.message || '登入失敗，請稍後再試');
        }
        return { token: data.session.access_token, expiresAt: data.session.expires_at * 1000,
          user: { name: data.user.user_metadata?.name || email } };
      },
      async logout() {
        await signOut('local');
        return { ok: true };
      },
      async checkAvailability() { return { available: true }; },
      async register() {
        throw new ApiError(403, '目前不開放自行註冊，請聯絡系統管理員建立帳號', { code: 'SIGNUP_DISABLED' });
      },
      async resendVerification(email) {
        const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl() } });
        if (error?.status === 429) throw new ApiError(429, '請稍候 60 秒後再重新寄送', { code: 'TOO_SOON' });
        return { ok: true };
      },
      async verifyEmail({ email, code, token }) {
        if (token) throw new ApiError(410, '驗證連結無效或已被使用', { code: 'TOKEN_INVALID' });
        const { error } = await sb.auth.verifyOtp({ email, token: String(code).trim(), type: 'signup' });
        if (error) {
          if (error.code === 'otp_expired') throw new ApiError(410, '驗證碼錯誤或已過期，請重新寄送', { code: 'CODE_EXPIRED' });
          throw new ApiError(422, '驗證碼錯誤，請再確認一次', { code: 'CODE_INVALID' });
        }
        await signOut('local'); // 驗證完成後回登入頁重新登入
        return { ok: true, email, username: email };
      },
      // 為避免洩漏哪些 Email 已註冊，無論是否存在都回傳相同結果
      async requestPasswordReset(email) {
        const v = String(email || '').trim().toLowerCase();
        if (!EMAIL_RE.test(v)) throw new ApiError(422, 'Email 格式不正確', { code: 'VALIDATION' });
        const { error } = await sb.auth.resetPasswordForEmail(v, { redirectTo: appUrl() });
        if (error?.status === 429) throw new ApiError(429, '申請太頻繁，請稍後再試', { code: 'TOO_SOON' });
        return { ok: true, maskedEmail: maskEmail(v) };
      },
      // 信件連結回來時已由 handleAuthRedirect 建立 session；token 為 recovery / invite / invalid
      async checkResetToken(token) {
        const { data } = await sb.auth.getSession();
        if (!['recovery', 'invite'].includes(token) || !data.session) {
          throw new ApiError(410, '此連結無效或已過期', { code: 'RESET_EXPIRED' });
        }
        return { maskedEmail: maskEmail(data.session.user.email) };
      },
      async resetPassword({ token, password, confirm }) {
        const errs = validateAll(resetSchema, { password, confirm });
        if (Object.keys(errs).length) throw new ApiError(422, '密碼不符合規則', { code: 'VALIDATION', fields: errs });
        const { data } = await sb.auth.getSession();
        if (!['recovery', 'invite'].includes(token) || !data.session) {
          throw new ApiError(410, '此連結無效或已過期', { code: 'RESET_EXPIRED' });
        }
        const email = data.session.user.email;
        const { error } = await sb.auth.updateUser({ password });
        if (error) {
          if (error.code === 'same_password') throw new ApiError(422, '新密碼不可與目前密碼相同', { code: 'SAME_PASSWORD', fields: { password: '新密碼不可與目前密碼相同' } });
          throw new ApiError(400, `設定密碼失敗：${error.message}`);
        }
        try { await rpc('complete_password_change'); } catch { /* 沒有待變更旗標時忽略 */ }
        await signOut('global'); // 重設後所有裝置需重新登入
        return { ok: true, username: email };
      },
    },

    // ── 登入狀態檢查：帳號被停用、或這台裝置被強制登出時回傳 false；網路異常時回傳 null（不判定） ──
    async sessionOk() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return false;
      const { data: ok, error } = await sb.rpc('session_ok');
      if (error) return null;
      return !!ok;
    },

    // ── 即時更新（Realtime，仍受 RLS 限制）；每個函式都回傳取消訂閱函式 ──
    realtime: {
      // 會議列表：任何會議或參與人員變動
      onMeetingsChange(cb) {
        const ch = sb.channel(`meetings-list-${Math.random().toString(36).slice(2)}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => cb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_attendees' }, () => cb())
          .subscribe();
        return () => sb.removeChannel(ch);
      },
      // 單一會議：內容、基本資料、參與人員、刪除
      watchMeeting(id, { onContent, onMeeting, onAttendees, onDeleted }) {
        const ch = sb.channel(`meeting-${id}-${Math.random().toString(36).slice(2)}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meeting_contents', filter: `meeting_id=eq.${id}` },
            (p) => onContent?.({ version: p.new.version, updatedBy: p.new.updated_by }))
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meetings', filter: `id=eq.${id}` }, (p) => onMeeting?.(toMeeting(p.new)))
          // Realtime 的 DELETE 事件無法加 filter，改為自行比對主鍵
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meetings' }, (p) => { if (p.old?.id === id) onDeleted?.(); })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meeting_attendees', filter: `meeting_id=eq.${id}` }, () => onAttendees?.())
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meeting_attendees', filter: `meeting_id=eq.${id}` }, () => onAttendees?.())
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meeting_attendees' }, (p) => { if (p.old?.meeting_id === id) onAttendees?.(); })
          .subscribe();
        return () => sb.removeChannel(ch);
      },
      // 誰也在看這場會議（Presence）
      presence(id, me, onSync) {
        const ch = sb.channel(`presence-meeting-${id}`, { config: { presence: { key: `${me.id}-${Math.random().toString(36).slice(2, 8)}` } } });
        ch.on('presence', { event: 'sync' }, () => {
          const seen = new Map();
          Object.values(ch.presenceState()).flat().forEach((x) => { if (x.id && x.id !== me.id) seen.set(x.id, { id: x.id, name: x.name, color: x.color, editing: !!x.editing }); });
          onSync([...seen.values()]);
        }).subscribe((st) => { if (st === 'SUBSCRIBED') ch.track({ id: me.id, name: me.name, color: me.color }); });
        return () => sb.removeChannel(ch);
      },
    },

    // ── 通知（只能讀、標記自己的；新增由資料庫觸發器產生） ──
    notifications: {
      async list() {
        const rows = await run(sb.from('notifications').select('id, type, meeting_id, title, body, read_at, created_at')
          .order('created_at', { ascending: false }).limit(50));
        return rows.map((n) => ({ id: n.id, type: n.type, meetingId: n.meeting_id, title: n.title, body: n.body, read: !!n.read_at, at: ms(n.created_at) }));
      },
      async markRead(id) {
        await run(sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null));
        return { ok: true };
      },
      async markAllRead() {
        return { count: await rpc('mark_all_notifications_read') };
      },
      // 新通知即時推送（Realtime，仍受 RLS 限制）；回傳取消訂閱函式
      subscribe(onInsert) {
        let channel = null; let stopped = false;
        sb.auth.getSession().then(({ data }) => {
          const uid = data.session?.user?.id;
          if (!uid || stopped) return;
          channel = sb.channel(`notifications-${uid}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => onInsert())
            .subscribe();
        });
        return () => { stopped = true; if (channel) sb.removeChannel(channel); };
      },
    },

    // ── 權限管理、帳號管理 ──
    admin: {
      async listRoles() {
        const [roles, rp, profiles] = await Promise.all([
          run(sb.from('roles').select('*').order('sort')),
          run(sb.from('role_permissions').select('role_id, permission_key')),
          run(sb.from('profiles').select('role_id')),
        ]);
        return roles.map((r) => ({
          id: r.id, name: r.name, desc: r.description, color: r.color, locked: r.locked,
          permissions: rp.filter((x) => x.role_id === r.id).map((x) => x.permission_key),
          userCount: profiles.filter((p) => p.role_id === r.id).length,
        }));
      },
      async saveRolePermissions(changes) {
        await rpc('save_role_permissions', { p_changes: changes });
        return this.listRoles();
      },
      async createRole({ name, desc, copyFrom }) {
        const r = await rpc('create_role', { p_name: name, p_description: desc || '', p_copy_from: copyFrom || null });
        const perms = await run(sb.from('role_permissions').select('permission_key').eq('role_id', r.id));
        return { id: r.id, name: r.name, desc: r.description, color: r.color, locked: r.locked, permissions: perms.map((x) => x.permission_key), userCount: 0 };
      },
      async deleteRole(roleId) {
        await rpc('delete_role', { p_role: roleId });
        return { ok: true };
      },
      async listUsers() {
        const [rows, roles] = await Promise.all([
          run(sb.from('profiles').select('id, username, name, role_id, active, color, must_change_password, created_at').order('created_at')),
          roleNames(),
        ]);
        return rows.map((p) => toProfile(p, roles));
      },
      async updateUser(userId, patch) {
        if ('roleId' in patch) await rpc('set_user_role', { p_user: userId, p_role: patch.roleId });
        if ('active' in patch) await fn('setActive', { userId, active: !!patch.active });
        return { ok: true };
      },
      async listAccounts() {
        const [rows, roles] = await Promise.all([rpc('list_accounts'), roleNames()]);
        return rows.map((p) => toProfile(p, roles));
      },
      async createAccount(data) {
        const r = await fn('create', data);
        return { user: toProfile(r.user, await roleNames()), tempPassword: r.tempPassword };
      },
      async updateAccount(userId, data) {
        const r = await fn('update', { userId, ...data });
        return toProfile(r.user, await roleNames());
      },
      async resetAccountPassword(userId, method) {
        return fn('resetPassword', { userId, method });
      },
      async unlockAccount() {
        throw new ApiError(400, '此版本沒有登入鎖定功能', { code: 'NOT_SUPPORTED' });
      },
      async revokeAccountSessions(userId) {
        return fn('revokeSessions', { userId });
      },
      async resendInvite(userId) {
        return fn('resendInvite', { userId });
      },
      async listAuditLogs() {
        const rows = await run(sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100));
        return rows.map((a) => ({ id: a.id, userId: a.actor_id, action: a.action, at: ms(a.created_at) }));
      },
    },
  };
}
