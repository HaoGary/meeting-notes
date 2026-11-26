import { useState } from 'react';
import { Alert, Box, Button, Checkbox, Divider, FormControlLabel, Stack, Typography } from '@mui/material';
import { useForm } from '../../hooks/useForm';
import { loginSchema } from '../../utils/validators';
import { getLastIdentifier, setLastIdentifier } from '../../services/session';
import { deviceLabel } from '../../utils/device';
import { features } from '../../services/config';
import { AuthHeader, AuthLayout, FormStack, Field, PasswordField, SubmitButton, TextLink } from '../../components/auth/AuthForm';
import { useToast } from '../../components/common/ui';

export const netMessage = (e) => (e?.status === 503 ? '網路連線異常，請檢查網路後再試一次' : e?.message || '發生未預期的錯誤，請稍後再試');

export default function LoginPage({ api, go, onLoggedIn, notice, prefill }) {
  const toast = useToast();
  const last = getLastIdentifier();
  const form = useForm({ identifier: prefill || last, password: '', remember: !!last }, loginSchema);
  const [alert, setAlert] = useState(notice || null); // { severity, msg, action }

  const submit = form.handleSubmit(async (v) => {
    setAlert(null);
    try {
      const r = await api.auth.login({ identifier: v.identifier, password: v.password, remember: v.remember, device: deviceLabel() });
      setLastIdentifier(v.remember ? v.identifier.trim() : '');
      onLoggedIn(r.token, v.remember, r.user.name);
    } catch (e) {
      form.setValue('password', ''); // 保留帳號，清空密碼
      switch (e.code) {
        case 'ACCOUNT_NOT_FOUND': form.setFieldError('identifier', e.message); break;
        case 'INVALID_PASSWORD': form.setFieldError('password', e.message); break;
        case 'EMAIL_NOT_VERIFIED':
          setAlert({ severity: 'warning', msg: e.message, action: { label: '前往驗證', onClick: () => go({ page: 'verify-email', email: e.data.email, resend: true }) } });
          break;
        case 'ACCOUNT_LOCKED':
          setAlert({ severity: 'error', msg: e.message, action: { label: '忘記密碼', onClick: () => go({ page: 'forgot-password' }) } }); break;
        case 'ACCOUNT_DISABLED': setAlert({ severity: 'error', msg: e.message }); break;
        case 'PASSWORD_NOT_SET':
          setAlert({ severity: 'warning', msg: e.message, action: { label: '忘記密碼', onClick: () => go({ page: 'forgot-password' }) } }); break;
        default: setAlert({ severity: 'error', msg: netMessage(e) }); toast(netMessage(e), 'error');
      }
    }
  });

  return (
    <AuthLayout>
      <AuthHeader title="歡迎回來" subtitle="登入以繼續使用管理後台" />
      {alert && (
        <Alert severity={alert.severity} sx={{ mb: 2.5 }} onClose={() => setAlert(null)}
          action={alert.action && <Button color="inherit" size="small" onClick={alert.action.onClick} sx={{ whiteSpace: 'nowrap' }}>{alert.action.label}</Button>}>
          {alert.msg}
        </Alert>
      )}
      <FormStack onSubmit={submit}>
        <Field id="login-identifier" label={features.usernameLogin ? '帳號或 Email' : 'Email'} placeholder={features.usernameLogin ? '輸入帳號或 Email' : 'name@company.com'} autoComplete="username" autoFocus={!form.values.identifier} {...form.field('identifier')} />
        <PasswordField id="login-password" label="密碼" placeholder="輸入密碼" autoComplete="current-password" autoFocus={!!form.values.identifier} {...form.field('password')} />
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: -1.25 }}>
          <FormControlLabel control={<Checkbox size="small" checked={form.values.remember} onChange={(e) => form.setValue('remember', e.target.checked)} />}
            label="記住我" slotProps={{ typography: { fontSize: 14 } }} />
          <Typography fontSize={14}><TextLink onClick={() => go({ page: 'forgot-password' })}>忘記密碼？</TextLink></Typography>
        </Stack>
        <SubmitButton loading={form.submitting}>登入</SubmitButton>
      </FormStack>
      {features.selfSignup ? (<>
        <Divider sx={{ my: 3.5, color: 'text.disabled', fontSize: 13 }}>或</Divider>
        <Typography textAlign="center" fontSize={14} color="text.secondary">
          還沒有帳號？<TextLink onClick={() => go({ page: 'register' })}>立即註冊</TextLink>
        </Typography>
      </>) : (
        <Typography textAlign="center" fontSize={13.5} color="text.secondary" mt={3.5}>
          需要帳號請聯絡系統管理員
        </Typography>
      )}
    </AuthLayout>
  );
}
