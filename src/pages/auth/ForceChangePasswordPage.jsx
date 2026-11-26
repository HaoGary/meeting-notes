// 使用臨時密碼登入後，必須先設定新密碼才能使用系統（後端同步限制其他 API）
import { useState } from 'react';
import { Alert, Button, Typography } from '@mui/material';
import LockResetOutlined from '@mui/icons-material/LockResetOutlined';
import { useForm } from '../../hooks/useForm';
import { resetSchema } from '../../utils/validators';
import { AuthHeader, AuthLayout, FormStack, PasswordChecklist, PasswordField, SubmitButton } from '../../components/auth/AuthForm';
import { useToast } from '../../components/common/ui';
import { netMessage } from './LoginPage';

export default function ForceChangePasswordPage({ api, user, onDone, onLogout }) {
  const toast = useToast();
  const form = useForm({ password: '', confirm: '' }, resetSchema, { dependents: { password: ['confirm'] } });
  const [alert, setAlert] = useState(null);
  const submit = form.handleSubmit(async (v) => {
    setAlert(null);
    try { await api.account.changePassword(v); toast('密碼已設定完成'); onDone(); }
    catch (e) {
      if (e.data?.fields) Object.entries(e.data.fields).forEach(([k, m]) => form.setFieldError(k, m));
      else { setAlert(netMessage(e)); toast(netMessage(e), 'error'); }
    }
  });
  return (
    <AuthLayout>
      <AuthHeader icon={<LockResetOutlined />} title="請設定新密碼" subtitle={<>{user.name}，您目前使用的是管理員提供的臨時密碼，為了帳號安全，請先設定自己的密碼。</>} />
      {alert && <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setAlert(null)}>{alert}</Alert>}
      <FormStack onSubmit={submit}>
        <PasswordField id="force-password" label="新密碼" autoComplete="new-password" autoFocus {...form.field('password')} below={<PasswordChecklist value={form.values.password} />} />
        <PasswordField id="force-confirm" label="確認新密碼" autoComplete="new-password" {...form.field('confirm')} />
        <SubmitButton loading={form.submitting}>設定密碼並繼續</SubmitButton>
      </FormStack>
      <Typography textAlign="center" fontSize={14} sx={{ mt: 3 }}>
        <Button color="inherit" onClick={onLogout} sx={{ color: 'text.secondary' }}>登出</Button>
      </Typography>
    </AuthLayout>
  );
}
