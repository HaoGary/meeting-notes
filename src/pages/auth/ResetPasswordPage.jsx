// 重設密碼：從信中連結進入 → 檢查連結 → 設定新密碼 → 成功後返回登入
import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import LockResetOutlined from '@mui/icons-material/LockResetOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import { useForm } from '../../hooks/useForm';
import { resetSchema } from '../../utils/validators';
import { AuthHeader, AuthLayout, FormStack, PasswordChecklist, PasswordField, SubmitButton, TextLink } from '../../components/auth/AuthForm';
import { useToast } from '../../components/common/ui';
import { netMessage } from './LoginPage';

export default function ResetPasswordPage({ api, go, token }) {
  const toast = useToast();
  const form = useForm({ password: '', confirm: '' }, resetSchema, { dependents: { password: ['confirm'] } });
  const [state, setState] = useState({ loading: true }); // loading | invalid | form | done
  const [alert, setAlert] = useState(null);

  const check = () => {
    setState({ loading: true });
    api.auth.checkResetToken(token)
      .then((r) => setState({ form: true, maskedEmail: r.maskedEmail }))
      .catch((e) => setState(e.status === 503 ? { network: e } : { invalid: e }));
  };
  useEffect(check, [api, token]); // eslint-disable-line

  const submit = form.handleSubmit(async (v) => {
    setAlert(null);
    try {
      const r = await api.auth.resetPassword({ token, ...v });
      toast('密碼已重設成功');
      setState({ done: true, username: r.username });
    } catch (e) {
      if (e.data?.fields) Object.entries(e.data.fields).forEach(([k, m]) => form.setFieldError(k, m));
      else if (e.status === 410) setState({ invalid: e });
      else { setAlert(netMessage(e)); toast(netMessage(e), 'error'); }
    }
  });

  if (state.loading) return <AuthLayout><Stack alignItems="center" gap={2} py={8}><CircularProgress size={28} /><Typography color="text.secondary">正在確認連結…</Typography></Stack></AuthLayout>;

  if (state.network) {
    return (
      <AuthLayout>
        <AuthHeader title="無法確認連結" subtitle={netMessage(state.network)} />
        <Button variant="contained" size="large" fullWidth sx={{ height: 46 }} onClick={check}>重新整理</Button>
      </AuthLayout>
    );
  }
  if (state.invalid) {
    return (
      <AuthLayout>
        <AuthHeader title="重設密碼連結已失效" subtitle={`${state.invalid.message}。請重新申請一次。`} />
        <Button variant="contained" size="large" fullWidth sx={{ height: 46 }} onClick={() => go({ page: 'forgot-password' })}>重新申請重設密碼</Button>
        <Typography textAlign="center" fontSize={14} sx={{ mt: 3 }}><TextLink onClick={() => go({ page: 'login' })}>返回登入</TextLink></Typography>
      </AuthLayout>
    );
  }
  if (state.done) {
    return (
      <AuthLayout>
        <AuthHeader title="密碼已重設" subtitle="為了安全，所有裝置都已登出。請使用新密碼重新登入。" />
        <Button variant="contained" size="large" fullWidth sx={{ height: 46 }} onClick={() => go({ page: 'login', prefill: state.username })}>返回登入</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthHeader title="設定新密碼" subtitle={<>為 <b>{state.maskedEmail}</b> 設定新密碼。</>} />
      {alert && <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setAlert(null)}>{alert}</Alert>}
      <FormStack onSubmit={submit}>
        <PasswordField id="reset-password" label="新密碼" placeholder="輸入新密碼" autoComplete="new-password" autoFocus {...form.field('password')}
          below={<PasswordChecklist value={form.values.password} />} />
        <PasswordField id="reset-confirm" label="確認新密碼" placeholder="再次輸入新密碼" autoComplete="new-password" {...form.field('confirm')} />
        <SubmitButton loading={form.submitting}>送出</SubmitButton>
      </FormStack>
    </AuthLayout>
  );
}
