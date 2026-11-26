// 預覽專用：快速登入、模擬網路異常、模擬信箱、讓驗證碼過期…正式版不會有這個面板。
import { useEffect, useState } from 'react';
import {
  Badge, Box, Button, Chip, Divider, Fab, FormControlLabel, IconButton, List, ListItemButton, MenuItem, Paper, Stack, Switch, TextField, Typography,
} from '@mui/material';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import ExpandMore from '@mui/icons-material/ExpandMore';
import MailOutline from '@mui/icons-material/MailOutline';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { devFlags, devExpireTokens, devMarkRead, devOutbox } from '../services/mockServer';
import { DEMO_PASSWORD } from '../services/seed';
import { SPEECH_MODES, speechDev } from '../features/speech/speechSetup';

// 語音預設：一般網站（如 GitHub Pages，需 https）使用實際麥克風；
// 嵌在框架中（如 Claude 預覽頁）通常拿不到麥克風權限，改用模擬語音。可在此面板切換。
const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
speechDev.mode = inFrame ? 'demo' : 'real';
import { AppDialog, UserAvatar, fmtRel, useToast } from '../components/common/ui';

function Outbox({ open, onClose, onOpenLink }) {
  const [mails, setMails] = useState([]);
  const [sel, setSel] = useState(null);
  useEffect(() => { if (open) { const m = devOutbox(); setMails(m); setSel(m[0] || null); } }, [open]);
  useEffect(() => { if (sel && !sel.read) devMarkRead(sel.id); }, [sel]);
  return (
    <AppDialog open={open} onClose={onClose} title="模擬信箱（預覽用）" maxWidth="md">
      {!mails.length ? <Typography color="text.disabled" py={4} textAlign="center">目前沒有寄出的郵件</Typography> : (
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ minHeight: 320 }}>
          <List dense sx={{ width: { sm: 240 }, flex: 'none', borderRight: { sm: 1 }, borderColor: 'divider', pr: { sm: 1 }, maxHeight: 420, overflow: 'auto' }}>
            {mails.map((m) => (
              <ListItemButton key={m.id} selected={sel?.id === m.id} onClick={() => setSel(m)} sx={{ display: 'block', py: 1 }}>
                <Stack direction="row" alignItems="center" gap={0.75}>
                  {!m.read && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main' }} />}
                  <Typography fontSize={13.5} fontWeight={m.read ? 500 : 700} noWrap>{m.subject}</Typography>
                </Stack>
                <Typography fontSize={12} color="text.disabled" noWrap>{m.to} · {fmtRel(m.at)}</Typography>
              </ListItemButton>
            ))}
          </List>
          {sel && (
            <Box flex={1} minWidth={0}>
              <Typography fontWeight={700} fontSize={17}>{sel.subject}</Typography>
              <Typography fontSize={12.5} color="text.disabled" mb={2}>寄給 {sel.to} · {new Date(sel.at).toLocaleString('zh-TW')}</Typography>
              <Typography sx={{ whiteSpace: 'pre-line', color: 'text.primary', fontSize: 14, lineHeight: 1.8 }}>{sel.body}</Typography>
              {sel.code && (
                <Box sx={{ my: 2, p: 2, bgcolor: 'grey.50', borderRadius: 2, textAlign: 'center' }}>
                  <Typography fontSize={12} color="text.disabled">驗證碼</Typography>
                  <Typography sx={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.3em', color: 'text.primary' }}>{sel.code}</Typography>
                </Box>
              )}
              {sel.link && <Button variant="contained" endIcon={<OpenInNew />} sx={{ mt: 1 }} onClick={() => { onClose(); onOpenLink(sel.link); }}>{sel.linkLabel}</Button>}
            </Box>
          )}
        </Stack>
      )}
    </AppDialog>
  );
}

export default function DemoPanel({ users, currentUserId, onUser, onOpenLink, onSimulateEdit, onReset, meetingOpen }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [fail, setFail] = useState(devFlags.failSaves);
  const [mailOpen, setMailOpen] = useState(false);
  const [speechMode, setSpeechModeState] = useState(speechDev.mode);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1500); return () => clearInterval(t); }, []);
  const unread = devOutbox().filter((m) => !m.read).length;

  const outbox = <Outbox open={mailOpen} onClose={() => setMailOpen(false)} onOpenLink={onOpenLink} />;
  if (!open) {
    return (
      <>
        <Badge badgeContent={unread} color="error" sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1250 }}>
          <Fab variant="extended" size="small" onClick={() => setOpen(true)} sx={{ bgcolor: '#fff' }}>
            <TuneOutlined fontSize="small" sx={{ mr: 0.75 }} />預覽控制台
          </Fab>
        </Badge>
        {outbox}
      </>
    );
  }
  return (
    <Paper elevation={8} sx={{ position: 'fixed', right: 16, bottom: 16, width: 288, p: 1.5, borderRadius: 2.5, zIndex: 1250, maxHeight: 'calc(100vh - 32px)', overflow: 'auto' }}>
      <Stack gap={1.25}>
        <Stack direction="row" alignItems="center" gap={0.75}>
          <Typography fontWeight={650} fontSize={13.5}>預覽控制台</Typography>
          <Chip label="僅預覽用" size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
          <IconButton size="small" sx={{ ml: 'auto' }} onClick={() => setOpen(false)} aria-label="收合"><ExpandMore fontSize="small" /></IconButton>
        </Stack>

        <Button variant="contained" startIcon={<Badge badgeContent={unread} color="error"><MailOutline fontSize="small" /></Badge>} onClick={() => setMailOpen(true)}>
          開啟模擬信箱
        </Button>
        <Typography fontSize={11.5} color="text.disabled" mt={-0.5}>驗證信、重設密碼信會寄到這裡。</Typography>

        <Divider />
        <TextField select label="快速登入為" value={currentUserId} onChange={(e) => onUser(e.target.value)}
          slotProps={{ select: { renderValue: (id) => { if (id === 'guest') return '未登入'; const u = users.find((x) => x.id === id); return <Stack direction="row" gap={1} alignItems="center"><UserAvatar user={u} size={20} />{u?.name}</Stack>; } } }}>
          {users.map((u) => (
            <MenuItem key={u.id} value={u.id} sx={{ gap: 1 }} disabled={!u.active || !u.emailVerified}>
              <UserAvatar user={u} size={22} /><span>{u.name}</span>
              <Typography fontSize={12} color="text.disabled" ml="auto">{!u.active ? '已停用' : !u.emailVerified ? '未驗證' : u.roleName}</Typography>
            </MenuItem>
          ))}
          <MenuItem value="guest" sx={{ color: 'text.secondary' }}>登出（未登入）</MenuItem>
        </TextField>
        <Box sx={{ fontSize: 11.5, color: 'text.disabled', lineHeight: 1.6 }}>
          示範帳號：gary（管理員）、yijun、daming、xiaohua、peishan（已停用）<br />密碼皆為 <b>{DEMO_PASSWORD}</b>
        </Box>

        <Divider />
        <FormControlLabel sx={{ justifyContent: 'space-between', ml: 0 }} labelPlacement="start"
          control={<Switch size="small" color="error" checked={fail} onChange={(e) => { devFlags.failSaves = e.target.checked; setFail(e.target.checked); }} />}
          label="模擬網路異常" slotProps={{ typography: { fontSize: 13 } }} />
        <TextField select label="語音辨識" value={speechMode} onChange={(e) => { speechDev.mode = e.target.value; setSpeechModeState(e.target.value); }}>
          {SPEECH_MODES.map(([k, l]) => <MenuItem key={k} value={k} sx={{ fontSize: 14 }}>{l}</MenuItem>)}
        </TextField>
        <Button variant="outlined" color="inherit" size="small" onClick={() => { devExpireTokens(); toast('所有驗證碼與重設連結已設為過期'); }}>讓驗證碼／重設連結過期</Button>
        <Button variant="outlined" color="inherit" size="small" disabled={!meetingOpen} onClick={onSimulateEdit}>模擬他人同時修改內容</Button>
        <Button variant="outlined" color="inherit" size="small" onClick={onReset}>重置示範資料</Button>
      </Stack>
      {outbox}
    </Paper>
  );
}
