// Email 驗證：輸入 6 位數驗證碼（註冊後 / 登入時尚未驗證），或透過信中連結（ConfirmLinkPage）
import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import { useForm } from '../../hooks/useForm';
import { verifySchema } from '../../utils/validators';
import { AuthHeader, AuthLayout, FormStack, Field, SubmitButton, TextLink } from '../../components/auth/AuthForm';
import { useToast } from '../../components/common/ui';
import { netMessage } from './LoginPage';

const mask = (e = '') => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.max(2, b.length)) + c);

function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((x) => x - 1), 1000); return () => clearTimeout(t); }, [left]);
  return [left, setLeft];
}

export function VerifiedView({ go, username }) {
  return (
    <AuthLayout>
      <AuthHeader icon={<CheckCircleOutline />} title="Email 驗證完成" subtitle="您的帳號已啟用，現在可以登入了。" />
      <Button variant="contained" size="large" fullWidth sx={{ height: 46 }} onClick={() => go({ page: 'login', prefill: username })}>前往登入</Button>
    </AuthLayout>
  );
}

export default function VerifyEmailPage({ api, go, email, resend }) {
  const toast = useToast();
  const form = useForm({ code: '' }, verifySchema);
  const [left, setLeft] = useCountdown();
  const [done, setDone] = useState(null);
  const [needResend, setNeedResend] = useState(false);
  const [alert, setAlert] = useState(null);

  const doResend = async (silent) => {
    setAlert(null);
    try {
      await api.auth.resendVerification(email);
      setLeft(60); setNeedResend(false); form.reset({ code: '' });
      if (!silent) toast('已重新寄送驗證信');
    } catch (e) {
      if (e.code === 'TOO_SOON') { setLeft(parseInt(e.message.match(/\d+/)?.[0] || '60', 10)); if (!silent) toast(e.message, 'error'); }
      else { setAlert(netMessage(e)); toast(netMessage(e), 'error'); }
    }
  };
  // 從登入頁進來（尚未驗證）時自動重寄一封
  useEffect(() => { if (resend) doResend(true); else setLeft(60); }, []); // eslint-disable-line

  const submit = form.handleSubmit(async (v) => {
    setAlert(null);
    try {
      const r = await api.auth.verifyEmail({ email, code: v.code });
      toast('Email 驗證完成');
      setDone(r.username || '');
    } catch (e) {
      if (['CODE_INVALID', 'CODE_EXPIRED', 'TOO_MANY'].includes(e.code)) {
        form.setFieldError('code', e.message);
        if (e.code !== 'CODE_INVALID') { setNeedResend(true); setLeft(0); }
      } else { setAlert(netMessage(e)); toast(netMessage(e), 'error'); }
    }
  });

  if (!email) {
    return (
      <AuthLayout>
        <AuthHeader icon={<LinkOffOutlined />} title="找不到待驗證的 Email" subtitle="請重新登入，系統會引導您完成驗證。" />
        <Button variant="contained" size="large" fullWidth sx={{ height: 46 }} onClick={() => go({ page: 'login' })}>返回登入</Button>
      </AuthLayout>
    );
  }
  if (done !== null) return <VerifiedView go={go} username={done} />;

  return (
    <AuthLayout>
      <AuthHeader icon={<MarkEmailReadOutlined />} title="驗證您的 Email"
        subtitle={<>我們已寄送 6 位數驗證碼至 <b>{mask(email)}</b>，請於 10 分鐘內輸入。也可以直接點擊信中的驗證連結。</>} />
      {alert && <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setAlert(null)}>{alert}</Alert>}
      <FormStack onSubmit={submit}>
        <Field id="verify-code" label="驗證碼" placeholder="000000" autoFocus autoComplete="one-time-code" {...form.field('code')}
          onChange={(e) => form.setValue('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
          slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6, style: { letterSpacing: '0.5em', fontSize: 20, fontWeight: 600, textAlign: 'center' } } }} />
        <SubmitButton loading={form.submitting} disabled={needResend}>驗證</SubmitButton>
      </FormStack>
      <Stack alignItems="center" gap={1.5} sx={{ mt: 3 }}>
        <Typography fontSize={14} color="text.secondary">
          沒收到信？{left > 0
            ? <Box component="span" color="text.disabled">{left} 秒後可重新寄送</Box>
            : <TextLink onClick={() => doResend(false)}>重新寄送驗證信</TextLink>}
        </Typography>
        <Typography fontSize={14} color="text.secondary"><TextLink onClick={() => go({ page: 'login' })}>返回登入</TextLink></Typography>
      </Stack>
    </AuthLayout>
  );
}

// 透過信中連結驗證
export function ConfirmLinkPage({ api, go, token }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    api.auth.verifyEmail({ token }).then((r) => setState({ ok: true, username: r.username })).catch((e) => setState({ error: e }));
  }, [api, token]);
  if (state.loading) return <AuthLayout><Stack alignItems="center" gap={2} py={8}><CircularProgress size={28} /><Typography color="text.secondary">正在驗證…</Typography></Stack></AuthLayout>;
  if (state.ok) return <VerifiedView go={go} username={state.username} />;
  return (
    <AuthLayout>
      <AuthHeader icon={<LinkOffOutlined />} title="驗證連結已失效" subtitle={`${netMessage(state.error)}。請登入後依指示重新寄送驗證信。`} />
      <Button variant="contained" size="large" fullWidth sx={{ height: 46 }} onClick={() => go({ page: 'login' })}>前往登入</Button>
    </AuthLayout>
  );
}
