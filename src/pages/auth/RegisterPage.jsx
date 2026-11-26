import { useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, FormHelperText, Stack, Typography } from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import { useForm } from '../../hooks/useForm';
import { registerSchema, validateField } from '../../utils/validators';
import { AuthHeader, AuthLayout, FormStack, Field, PasswordChecklist, PasswordField, SubmitButton, TextLink } from '../../components/auth/AuthForm';
import { AppDialog, useToast } from '../../components/common/ui';
import { netMessage } from './LoginPage';

const TERMS = {
  terms: ['服務條款', '使用本系統即表示您同意依公司規範使用會議紀錄功能，不得上傳違法或侵權內容。帳號僅限本人使用，請妥善保管密碼。系統管理員得依公司政策調整您的權限或停用帳號。'],
  privacy: ['隱私權政策', '我們僅蒐集提供服務所需的資料（姓名、Email、帳號），用於身分驗證、權限管理與系統通知。密碼經雜湊處理後儲存，任何人皆無法得知您的原始密碼。您可隨時聯絡系統管理員查詢或刪除個人資料。'],
};

export default function RegisterPage({ api, go }) {
  const toast = useToast();
  const form = useForm({ name: '', email: '', username: '', password: '', confirm: '', agree: false }, registerSchema, { dependents: { password: ['confirm'] } });
  const [avail, setAvail] = useState({}); // { email: true, username: true }
  const [alert, setAlert] = useState(null);
  const [doc, setDoc] = useState(null);

  // 離開欄位時即時檢查是否重複
  const checkAvail = async (name) => {
    form.onBlur(name);
    const v = form.values[name];
    if (!v || validateField(registerSchema, name, form.values)) { setAvail((a) => ({ ...a, [name]: false })); return; }
    try {
      const r = await api.auth.checkAvailability({ [name]: v });
      if (!r.available) {
        form.setFieldError(name, name === 'email' ? '此 Email 已註冊，可直接登入或使用忘記密碼' : '此帳號已被使用，請換一個');
        setAvail((a) => ({ ...a, [name]: false }));
      } else setAvail((a) => ({ ...a, [name]: true }));
    } catch { /* 網路錯誤時於送出時再檢查 */ }
  };
  const availProps = (name, okText) => {
    const f = form.field(name);
    const ok = avail[name] && !form.errors[name] && f.value;
    return { ...f, onBlur: () => checkAvail(name), helperText: ok ? <Stack component="span" direction="row" alignItems="center" gap={0.5} sx={{ color: 'success.main' }}><CheckCircle sx={{ fontSize: 14 }} />{okText}</Stack> : f.helperText };
  };

  const submit = form.handleSubmit(async (v) => {
    setAlert(null);
    try {
      const r = await api.auth.register(v);
      toast(`註冊成功！驗證信已寄至 ${r.maskedEmail}`);
      go({ page: 'verify-email', email: r.email });
    } catch (e) {
      if (e.data?.fields) Object.entries(e.data.fields).forEach(([k, m]) => form.setFieldError(k, m));
      else { setAlert(netMessage(e)); toast(netMessage(e), 'error'); }
    }
  });

  return (
    <AuthLayout>
      <AuthHeader title="建立帳號" subtitle="註冊後需完成 Email 驗證才能登入" />
      {alert && <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setAlert(null)}>{alert}</Alert>}
      <FormStack onSubmit={submit}>
        <Field id="reg-name" label="姓名" placeholder="例：王小明" autoComplete="name" autoFocus {...form.field('name')} />
        <Field id="reg-email" label="Email" placeholder="name@company.com" type="email" autoComplete="email" {...availProps('email', '此 Email 可以使用')} />
        <Field id="reg-username" label="帳號" placeholder="4–20 字元，英文字母開頭" autoComplete="username" {...availProps('username', '此帳號可以使用')} />
        <PasswordField id="reg-password" label="密碼" placeholder="設定密碼" autoComplete="new-password" {...form.field('password')}
          below={<PasswordChecklist value={form.values.password} />} />
        <PasswordField id="reg-confirm" label="確認密碼" placeholder="再次輸入密碼" autoComplete="new-password" {...form.field('confirm')} />

        <Box>
          <FormControlLabel sx={{ alignItems: 'flex-start', m: 0, gap: 1 }}
            control={<Checkbox size="small" checked={form.values.agree} onChange={(e) => { form.setValue('agree', e.target.checked); form.onBlur('agree'); }}
              sx={{ p: 0, '& .MuiSvgIcon-root': { fontSize: 20 } }} />}
            label={<Typography fontSize={14} lineHeight="20px" color="text.secondary">我已閱讀並同意<TextLink onClick={() => setDoc('terms')}>服務條款</TextLink>及<TextLink onClick={() => setDoc('privacy')}>隱私權政策</TextLink></Typography>} />
          {form.errors.agree && <FormHelperText error sx={{ ml: 3.5, mt: 0.25, fontSize: 12.5 }}>{form.errors.agree}</FormHelperText>}
        </Box>
        <SubmitButton loading={form.submitting}>註冊</SubmitButton>
      </FormStack>
      <Typography textAlign="center" fontSize={14} color="text.secondary" sx={{ mt: 3.5 }}>
        已經有帳號？<TextLink onClick={() => go({ page: 'login' })}>前往登入</TextLink>
      </Typography>

      <AppDialog open={!!doc} title={doc && TERMS[doc][0]} onClose={() => setDoc(null)}
        actions={<Button variant="contained" onClick={() => { setDoc(null); form.setValue('agree', true); }}>我已閱讀並同意</Button>}>
        <Typography lineHeight={1.8}>{doc && TERMS[doc][1]}</Typography>
      </AppDialog>
    </AuthLayout>
  );
}
