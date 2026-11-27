// 忘記密碼：輸入 Email → 寄送重設連結 → 提示已寄出
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import LockResetOutlined from '@mui/icons-material/LockResetOutlined';
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { useForm } from '../../hooks/useForm';
import { forgotSchema } from '../../utils/validators';
import { AuthHeader, AuthLayout, FormStack, Field, SubmitButton, TextLink } from '../../components/auth/AuthForm';
import { useToast } from '../../components/common/ui';
import { netMessage } from './LoginPage';

export default function ForgotPasswordPage({ api, go }) {
  const toast = useToast();
  const form = useForm({ email: '' }, forgotSchema);
  const [sent, setSent] = useState(null); // maskedEmail
  const [alert, setAlert] = useState(null);
  const [left, setLeft] = useState(0);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((x) => x - 1), 1000); return () => clearTimeout(t); }, [left]);

  const send = async (email) => {
    setAlert(null);
    try {
      const r = await api.auth.requestPasswordReset(email);
      setSent(r.maskedEmail); setLeft(60);
      toast('重設密碼信已寄出');
    } catch (e) { setAlert(netMessage(e)); toast(netMessage(e), 'error'); }
  };
  const submit = form.handleSubmit((v) => send(v.email));

  if (sent) {
    return (
      <AuthLayout>
        <AuthHeader title="請檢查您的信箱" subtitle={<>若 <b>{sent}</b> 已註冊，您將收到一封重設密碼的郵件。請盡快點擊信中連結設定新密碼，連結有使用期限。</>} />
        {alert && <Alert severity="error" sx={{ mb: 2.5 }}>{alert}</Alert>}
        <Box sx={{ mb: 2.5, px: 2, py: 1.5, borderRadius: '8px', border: 1, borderColor: 'divider', bgcolor: 'background.paper', color: 'text.secondary', fontSize: 14 }}>
          請確認垃圾郵件匣，或確認 Email 是否正確。
        </Box>
        <Button variant="contained" size="large" fullWidth sx={{ height: 46 }} onClick={() => go({ page: 'login' })}>返回登入</Button>
        <Stack alignItems="center" gap={1.25} sx={{ mt: 3 }}>
          <Typography fontSize={14} color="text.secondary">
            {left > 0 ? <Box component="span" color="text.disabled">{left} 秒後可重新寄送</Box> : <TextLink onClick={() => send(form.values.email)}>重新寄送</TextLink>}
          </Typography>
          <Typography fontSize={14}><TextLink onClick={() => { setSent(null); form.reset({ email: '' }); }}>使用其他 Email</TextLink></Typography>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Button startIcon={<ArrowBack />} color="inherit" onClick={() => go({ page: 'login' })} sx={{ mb: 3, ml: -1, color: 'text.secondary' }}>返回登入</Button>
      <AuthHeader title="忘記密碼" subtitle="輸入註冊時使用的 Email，我們會寄送重設密碼連結給您。" />
      {alert && <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setAlert(null)}>{alert}</Alert>}
      <FormStack onSubmit={submit}>
        <Field id="forgot-email" label="Email" type="email" placeholder="name@company.com" autoComplete="email" autoFocus {...form.field('email')} />
        <SubmitButton loading={form.submitting}>寄送連結</SubmitButton>
      </FormStack>
    </AuthLayout>
  );
}
