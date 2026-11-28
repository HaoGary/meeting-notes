// AI 圖片向量化：代為呼叫 Recraft Vectorize API（標準版 v1，US$0.01／次）
// POST /functions/v1/vectorize-ai   multipart/form-data: file（PNG/JPG/WEBP）, width, height
//
// - Recraft 金鑰存在 Supabase Secrets（RECRAFT_API_TOKEN），不會出現在前端
// - 權限：需要「AI 圖片向量化」（tools.vectorize_ai）
// - 每日上限：以使用者身分呼叫 ai_vectorize_reserve() 預扣；Recraft 失敗時不計入
// - 開啟零資料保留（zdr），結果以 b64_json 直接回傳，Recraft 不保存輸入與結果
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const envKey = (json: string, legacy: string) => {
  try { const k = JSON.parse(Deno.env.get(json) ?? '{}').default; if (k) return k as string; } catch { /* 使用舊金鑰 */ }
  return Deno.env.get(legacy)!;
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRET_KEY = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const PUBLISHABLE_KEY = envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const RECRAFT_TOKEN = Deno.env.get('RECRAFT_API_TOKEN') || '';
const RECRAFT_URL = 'https://external.api.recraft.ai/v1/images/vectorize';

const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SECRET_KEY, clientOpts);

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 20 * 1024 * 1024;

class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'ERROR') { super(message); }
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Postgres 自訂錯誤：errcode 'PT<status>'，hint 為錯誤代碼（見 public.api_error）
function fromDb(err: { code?: string; message?: string; hint?: string }) {
  const m = /^PT(\d{3})$/.exec(err.code || '');
  return new ApiError(m ? Number(m[1]) : 500, err.message || '資料庫錯誤', err.hint || 'DB_ERROR');
}

function recraftError(status: number, text: string) {
  if (status === 401 || status === 403) return new ApiError(502, 'Recraft API 金鑰無效，請聯絡系統管理員', 'RECRAFT_AUTH');
  if (status === 402 || /balance|credit|insufficient/i.test(text)) return new ApiError(502, 'Recraft 帳戶餘額不足，請聯絡系統管理員', 'RECRAFT_BALANCE');
  if (status === 429) return new ApiError(503, 'Recraft 服務忙碌中，請稍後再試', 'RECRAFT_BUSY');
  if (status === 400 || status === 422) return new ApiError(422, `Recraft 無法處理這張圖片：${text.slice(0, 200) || '格式或尺寸不符'}`, 'RECRAFT_INPUT');
  return new ApiError(502, `Recraft 服務暫時無法使用（HTTP ${status}），請稍後再試`, 'RECRAFT_ERROR');
}

const decodeB64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let usageId: string | null = null;
  try {
    if (req.method !== 'POST') throw new ApiError(405, '只接受 POST', 'METHOD');
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new ApiError(401, '請先登入', 'NOT_LOGGED_IN');
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth.user) throw new ApiError(401, '登入已失效，請重新登入', 'SESSION_EXPIRED');

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw new ApiError(400, '沒有收到圖片', 'NO_FILE');
    if (!TYPES.includes(file.type)) throw new ApiError(422, '只支援 PNG、JPG、WEBP', 'TYPE');
    if (file.size > MAX_BYTES) throw new ApiError(422, '圖片超過 20 MB', 'SIZE');
    const width = Number(form!.get('width')), height = Number(form!.get('height'));
    if (!(width >= 256 && height >= 256 && width <= 4096 && height <= 4096 && width * height <= 16_000_000)) {
      throw new ApiError(422, '圖片尺寸需在 256–4096 px 之間，且不超過 1,600 萬像素', 'DIMENSIONS');
    }
    if (!RECRAFT_TOKEN) throw new ApiError(503, 'AI 向量化尚未設定（缺少 Recraft API 金鑰），請聯絡系統管理員', 'NOT_CONFIGURED');

    // 以使用者身分預扣額度（權限、帳號狀態、每日上限都在資料庫檢查）
    const asUser = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { ...clientOpts, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: reserve, error: resErr } = await asUser.rpc('ai_vectorize_reserve', { p_width: width, p_height: height, p_bytes: file.size });
    if (resErr) throw fromDb(resErr);
    usageId = reserve.id;

    const body = new FormData();
    body.append('file', file, file.name || 'image');
    body.append('response_format', 'b64_json');
    body.append('zdr', 'true');
    let res: Response;
    try {
      res = await fetch(RECRAFT_URL, {
        method: 'POST', headers: { Authorization: `Bearer ${RECRAFT_TOKEN}` }, body, signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      throw new ApiError(504, e instanceof DOMException && e.name === 'TimeoutError' ? 'Recraft 回應逾時，請稍後再試' : '無法連線到 Recraft，請稍後再試', 'RECRAFT_NETWORK');
    }
    if (!res.ok) throw recraftError(res.status, await res.text().catch(() => ''));
    const out = await res.json();
    const b64 = out?.image?.b64_json;
    if (typeof b64 !== 'string') throw new ApiError(502, 'Recraft 回傳格式不正確', 'RECRAFT_FORMAT');
    const svg = decodeB64(b64);
    if (!/<svg[\s>]/i.test(svg)) throw new ApiError(502, 'Recraft 沒有回傳 SVG', 'RECRAFT_FORMAT');

    await admin.rpc('ai_vectorize_finish', { p_id: usageId, p_status: 'success', p_credits: out.credits ?? null, p_error: null });
    usageId = null;
    return json(200, { svg, credits: out.credits ?? null, quota: { limit: reserve.limit, used: reserve.used, remaining: reserve.remaining } });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, '伺服器錯誤，請稍後再試', 'INTERNAL');
    if (!(e instanceof ApiError)) console.error(e);
    if (usageId) await admin.rpc('ai_vectorize_finish', { p_id: usageId, p_status: 'failed', p_credits: null, p_error: `${err.code}: ${err.message}` });
    return json(err.status, { error: { message: err.message, code: err.code } });
  }
});
