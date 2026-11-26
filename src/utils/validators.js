// 共用表單驗證規則：前端即時驗證與後端 API 使用同一份規則，避免兩邊不一致。
export const PASSWORD_RULES = [
  { id: 'len', label: '至少 8 個字元', test: (v) => v.length >= 8 },
  { id: 'upper', label: '包含大寫英文字母', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: '包含小寫英文字母', test: (v) => /[a-z]/.test(v) },
  { id: 'num', label: '包含數字', test: (v) => /\d/.test(v) },
];
export const passwordIssues = (v = '') => PASSWORD_RULES.filter((r) => !r.test(v));

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_.]{3,19}$/;

// 每個規則回傳 (value, allValues) => 錯誤訊息 | null
export const rules = {
  required: (msg = '此欄位為必填') => (v) => (v === undefined || v === null || !String(v).trim() ? msg : null),
  email: (msg = 'Email 格式不正確，例如 name@company.com') => (v) => (v && !EMAIL_RE.test(String(v).trim()) ? msg : null),
  username: (msg = '帳號需為 4–20 個字元，以英文字母開頭，可包含數字、底線或句點') => (v) => (v && !USERNAME_RE.test(v) ? msg : null),
  maxLen: (n, msg) => (v) => (v && String(v).length > n ? msg || `不可超過 ${n} 個字元` : null),
  password: (msg = '密碼不符合安全規則') => (v) => (v && passwordIssues(v).length ? msg : null),
  match: (field, msg = '兩次輸入的密碼不一致') => (v, all) => (v && v !== all[field] ? msg : null),
  checked: (msg) => (v) => (!v ? msg : null),
  code: (len = 6, msg = `請輸入 ${len} 位數驗證碼`) => (v) => (v && !new RegExp(`^\\d{${len}}$`).test(v) ? msg : null),
};

// 依 schema 驗證單一欄位：回傳第一個錯誤
export function validateField(schema, name, values) {
  for (const rule of schema[name] || []) {
    const err = rule(values[name], values);
    if (err) return err;
  }
  return null;
}
// 驗證全部欄位：回傳 { field: message }
export function validateAll(schema, values) {
  const errors = {};
  Object.keys(schema).forEach((k) => { const e = validateField(schema, k, values); if (e) errors[k] = e; });
  return errors;
}

// ── 各表單的 schema（前後端共用） ──
export const loginSchema = {
  identifier: [rules.required('請輸入帳號或 Email')],
  password: [rules.required('請輸入密碼')],
};
export const registerSchema = {
  name: [rules.required('請輸入姓名'), rules.maxLen(30)],
  email: [rules.required('請輸入 Email'), rules.email()],
  username: [rules.required('請輸入帳號'), rules.username()],
  password: [rules.required('請輸入密碼'), rules.password()],
  confirm: [rules.required('請再次輸入密碼'), rules.match('password')],
  agree: [rules.checked('請閱讀並同意服務條款及隱私權政策')],
};
export const forgotSchema = {
  email: [rules.required('請輸入註冊時使用的 Email'), rules.email()],
};
export const resetSchema = {
  password: [rules.required('請輸入新密碼'), rules.password()],
  confirm: [rules.required('請再次輸入新密碼'), rules.match('password')],
};
export const verifySchema = {
  code: [rules.required('請輸入驗證碼'), rules.code(6)],
};
export const changePasswordSchema = {
  current: [rules.required('請輸入目前密碼')],
  password: [rules.required('請輸入新密碼'), rules.password()],
  confirm: [rules.required('請再次輸入新密碼'), rules.match('password')],
};
export const profileSchema = {
  name: [rules.required('請輸入姓名'), rules.maxLen(30)],
};
export const adminUserSchema = {
  name: [rules.required('請輸入姓名'), rules.maxLen(30)],
  email: [rules.required('請輸入 Email'), rules.email()],
  username: [rules.required('請輸入帳號'), rules.username()],
  roleId: [rules.required('請選擇角色')],
};
