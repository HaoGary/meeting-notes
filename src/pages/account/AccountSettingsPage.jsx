// 個人帳號設定：個人資料、變更密碼、登入裝置
import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, IconButton, List, ListItem, ListItemIcon, ListItemText, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import LaptopMacOutlined from '@mui/icons-material/LaptopMacOutlined';
import PhoneIphoneOutlined from '@mui/icons-material/PhoneIphoneOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import PageHeader from '../../components/common/PageHeader';
import { AppDialog, UserAvatar, fmtRel, useToast } from '../../components/common/ui';
import { useForm } from '../../hooks/useForm';
import { changePasswordSchema, profileSchema } from '../../utils/validators';
import { PasswordChecklist, PasswordField } from '../../components/auth/AuthForm';

function Section({ title, desc, children }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
      <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography fontWeight={650} fontSize={15.5}>{title}</Typography>
        {desc && <Typography fontSize={13} color="text.secondary" mt={0.25}>{desc}</Typography>}
      </Box>
      <Box sx={{ p: 3 }}>{children}</Box>
    </Paper>
  );
}
const ReadOnly = ({ label, value, hint }) => (
  <Box>
    <Typography fontSize={13} fontWeight={600} mb={1}>{label}</Typography>
    <TextField fullWidth value={value} disabled slotProps={{ input: { sx: { bgcolor: 'grey.50' } } }} />
    {hint && <Typography fontSize={12.5} color="text.disabled" mt={0.75}>{hint}</Typography>}
  </Box>
);

function ProfileSection({ api, user, onUpdated }) {
  const toast = useToast();
  const form = useForm({ name: user.name }, profileSchema);
  const dirty = form.values.name.trim() !== user.name;
  const submit = form.handleSubmit(async (v) => {
    try { await api.account.updateProfile(v); toast('已更新個人資料'); onUpdated(); }
    catch (e) { if (e.data?.fields) Object.entries(e.data.fields).forEach(([k, m]) => form.setFieldError(k, m)); else toast(e.message, 'error'); }
  });
  return (
    <Section title="個人資料" desc="其他成員在會議與參與人員中看到的名稱">
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <UserAvatar user={{ ...user, name: form.values.name || user.name }} size={56} />
        <Box>
          <Typography fontWeight={650} fontSize={16}>{form.values.name || user.name}</Typography>
          <Typography fontSize={13} color="text.secondary">{user.roleName}</Typography>
        </Box>
      </Stack>
      <Stack component="form" noValidate onSubmit={submit} gap={2.5}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
          <Box>
            <Typography component="label" htmlFor="acc-name" fontSize={13} fontWeight={600} sx={{ display: 'block', mb: 1 }}>姓名</Typography>
            <TextField fullWidth {...form.field('name')} slotProps={{ htmlInput: { id: 'acc-name' }, formHelperText: { sx: { mx: 0 } } }} />
          </Box>
          <ReadOnly label="帳號" value={user.username} hint="帳號無法自行變更" />
          <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
            <ReadOnly label="Email" value={user.email} hint="如需變更 Email，請聯絡系統管理員" />
          </Box>
        </Box>
        <Stack direction="row" justifyContent="flex-end" gap={1}>
          {dirty && <Button color="inherit" onClick={() => form.reset({ name: user.name })}>取消</Button>}
          <Button type="submit" variant="contained" disabled={!dirty || form.submitting}
            startIcon={form.submitting && <CircularProgress size={16} sx={{ color: 'inherit' }} />}>{form.submitting ? '儲存中…' : '儲存變更'}</Button>
        </Stack>
      </Stack>
    </Section>
  );
}

function PasswordSection({ api, onChanged }) {
  const toast = useToast();
  const empty = { current: '', password: '', confirm: '' };
  const form = useForm(empty, changePasswordSchema, { dependents: { password: ['confirm'] } });
  const submit = form.handleSubmit(async (v) => {
    try {
      await api.account.changePassword(v);
      toast('密碼已變更，其他裝置已登出');
      form.reset(empty); onChanged();
    } catch (e) { if (e.data?.fields) Object.entries(e.data.fields).forEach(([k, m]) => form.setFieldError(k, m)); else toast(e.message, 'error'); }
  });
  return (
    <Section title="變更密碼" desc="變更後，除了目前這台裝置以外的所有裝置都會被登出">
      <Stack component="form" noValidate onSubmit={submit} gap={2.5} sx={{ maxWidth: 440 }}>
        <PasswordField id="acc-current" label="目前密碼" autoComplete="current-password" {...form.field('current')} />
        <PasswordField id="acc-new" label="新密碼" autoComplete="new-password" {...form.field('password')} below={<PasswordChecklist value={form.values.password} />} />
        <PasswordField id="acc-confirm" label="確認新密碼" autoComplete="new-password" {...form.field('confirm')} />
        <Box>
          <Button type="submit" variant="contained" disabled={form.submitting}
            startIcon={form.submitting && <CircularProgress size={16} sx={{ color: 'inherit' }} />}>{form.submitting ? '處理中…' : '變更密碼'}</Button>
        </Box>
      </Stack>
    </Section>
  );
}

function SessionsSection({ api, refreshKey }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const load = () => api.account.listSessions().then(setList).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, [refreshKey]); // eslint-disable-line
  const revoke = async (s) => {
    try { await api.account.revokeSession(s.id); toast(`已登出「${s.device}」`); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const revokeAll = async () => {
    setConfirmAll(false);
    try { const r = await api.account.revokeOtherSessions(); toast(`已登出 ${r.count} 台其他裝置`); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const others = (list || []).filter((s) => !s.current).length;
  return (
    <Section title="登入裝置" desc="若發現不認得的裝置，請登出該裝置並立即變更密碼">
      {!list ? <Stack alignItems="center" py={2}><CircularProgress size={22} /></Stack> : (
        <>
          <List disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
            {list.map((s, i) => (
              <ListItem key={s.id} divider={i < list.length - 1} sx={{ py: 1.5, pr: 1 }}
                secondaryAction={!s.current && (
                  <Tooltip title="登出此裝置"><IconButton onClick={() => revoke(s)} aria-label={`登出 ${s.device}`}><LogoutOutlined fontSize="small" /></IconButton></Tooltip>
                )}>
                <ListItemIcon sx={{ minWidth: 44 }}>
                  {/iPhone|Android/.test(s.device) ? <PhoneIphoneOutlined color="action" /> : <LaptopMacOutlined color="action" />}
                </ListItemIcon>
                <ListItemText
                  primary={<Stack direction="row" alignItems="center" gap={1}>{s.device}{s.current && <Chip size="small" color="success" label="目前裝置" sx={{ height: 20, fontSize: 11 }} />}</Stack>}
                  secondary={`${s.current ? '使用中' : `最後活動 ${fmtRel(s.lastActiveAt)}`}・登入於 ${new Date(s.createdAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${s.remember ? '・記住我' : ''}`}
                  slotProps={{ primary: { fontSize: 14, fontWeight: 500, component: 'div' }, secondary: { fontSize: 12.5 } }} />
              </ListItem>
            ))}
          </List>
          <Stack direction="row" justifyContent="flex-end" mt={2}>
            <Button color="error" variant="outlined" disabled={!others} onClick={() => setConfirmAll(true)}>登出全裝置{others ? `（${others}）` : ''}</Button>
          </Stack>
        </>
      )}
      <AppDialog open={confirmAll} title="登出全裝置" onClose={() => setConfirmAll(false)}
        actions={<><Button color="inherit" onClick={() => setConfirmAll(false)}>取消</Button><Button variant="contained" color="error" onClick={revokeAll}>全部登出</Button></>}>
        <Typography>除了目前這台裝置，其他 {others} 台裝置都會立即登出，需要重新輸入密碼才能再次登入。</Typography>
      </AppDialog>
    </Section>
  );
}

export default function AccountSettingsPage({ api, user, onUpdated }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <Box sx={{ flex: 1, overflow: 'auto' }}>
      <PageHeader crumbs={[{ label: '帳號設定' }]} title="帳號設定" subtitle="管理您的個人資料、密碼與登入裝置" />
      <Stack gap={2.5} sx={{ px: { xs: 2, md: 3 }, pb: 12, maxWidth: 820 }}>
        <ProfileSection api={api} user={user} onUpdated={onUpdated} />
        <PasswordSection api={api} onChanged={() => setRefreshKey((k) => k + 1)} />
        <SessionsSection api={api} refreshKey={refreshKey} />
      </Stack>
    </Box>
  );
}

