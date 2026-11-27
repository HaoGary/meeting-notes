import { createContext, useCallback, useContext, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudDoneOutlined from '@mui/icons-material/CloudDoneOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutline';
import Refresh from '@mui/icons-material/Refresh';
import { MEETING_STATUS } from '../../services/seed';

// ── Toast（MUI Alert 堆疊） ─────────────
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  // action: { label, onClick } → 顯示在通知右側的按鈕（例如「復原」），停留時間較長
  const push = useCallback((msg, type = 'success', action) => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, type: type === 'info' ? 'success' : type, action }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), action ? 7000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <Stack spacing={1} role="status" aria-live="polite"
        sx={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, alignItems: 'center', pointerEvents: 'none' }}>
        {items.map((t) => (
          <Alert key={t.id} severity={t.type} variant="filled" sx={{ boxShadow: 6, py: 0.25, maxWidth: '90vw', pointerEvents: t.action ? 'auto' : 'none', alignItems: 'center' }}
            action={t.action && (
              <Button color="inherit" size="small" sx={{ fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}
                onClick={() => { t.action.onClick(); setItems((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</Button>)}>
            {t.msg}
          </Alert>
        ))}
      </Stack>
    </ToastCtx.Provider>
  );
}

// ── Dialog 包裝 ─────────────────────────
export function AppDialog({ open, title, children, onClose, actions, maxWidth = 'xs' }) {
  return (
    <Dialog open={!!open} onClose={onClose} maxWidth={maxWidth} fullWidth>
      <DialogTitle sx={{ pr: 6, fontSize: 17 }}>
        {title}
        {onClose && <IconButton aria-label="關閉" onClick={onClose} sx={{ position: 'absolute', right: 10, top: 10 }}><CloseIcon fontSize="small" /></IconButton>}
      </DialogTitle>
      <DialogContent sx={{ color: 'text.secondary' }}>{children}</DialogContent>
      {actions && <DialogActions sx={{ px: 3, pb: 2 }}>{actions}</DialogActions>}
    </Dialog>
  );
}

// ── Avatar ──────────────────────────────
// 外部人員（無系統帳號）：依名字固定配色，與系統成員同樣式顯示
const GUEST_COLORS = ['#0d9488', '#9333ea', '#e11d48', '#2563eb', '#ca8a04', '#0891b2', '#ea580c', '#4f46e5'];
export const guestUser = (name = '') => {
  let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return { id: `guest:${name}`, name, color: GUEST_COLORS[h % GUEST_COLORS.length], external: true };
};
// 會議主持人：有外部主持人名字時優先顯示
export const hostOf = (m, users = []) => (m?.hostName ? guestUser(m.hostName) : users.find((u) => u.id === m?.hostId));

export function UserAvatar({ user, size = 24, sx }) {
  if (!user) return <Avatar sx={{ width: size, height: size, fontSize: size * 0.45, ...sx }}>?</Avatar>;
  return (
    <Tooltip title={user.name}>
      <Avatar alt={user.name} sx={{ width: size, height: size, fontSize: size * 0.42, fontWeight: 600, bgcolor: user.color, ...sx }}>
        {user.name.replace(/[A-Za-z]+ /, '').slice(0, 1)}
      </Avatar>
    </Tooltip>
  );
}

// ── 儲存狀態 ─────────────────────────────
export function SaveStatus({ status, savedAt, error, onRetry }) {
  const time = savedAt ? new Date(savedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '';
  const base = { fontSize: 12.5, fontWeight: 500, height: 30, display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, borderRadius: 4, whiteSpace: 'nowrap' };
  if (status === 'saving') return <Box sx={{ ...base, color: 'text.secondary' }}><CircularProgress size={13} thickness={6} />儲存中…</Box>;
  if (status === 'dirty') return <Box sx={{ ...base, color: 'text.secondary' }}><Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'warning.main' }} />尚未儲存</Box>;
  if (status === 'error')
    return (
      <Tooltip title={error?.message || ''}>
        <Box sx={{ ...base, color: 'error.main', bgcolor: '#fef2f2', pr: 0.5 }}>
          <ErrorOutline sx={{ fontSize: 16 }} />儲存失敗
          <Button size="small" variant="contained" color="error" startIcon={<Refresh sx={{ fontSize: '14px !important' }} />} onClick={onRetry}
            sx={{ minHeight: 0, py: 0.1, px: 1, fontSize: 12, borderRadius: 3 }}>重新儲存</Button>
        </Box>
      </Tooltip>
    );
  if (status === 'conflict') return <Box sx={{ ...base, color: 'error.main', bgcolor: '#fef2f2' }}><ErrorOutline sx={{ fontSize: 16 }} />內容衝突</Box>;
  return (
    <Box sx={{ ...base, color: 'success.main' }}>
      <CloudDoneOutlined sx={{ fontSize: 17 }} />已儲存{time && <Box component="span" sx={{ color: 'text.disabled', display: { xs: 'none', sm: 'inline' } }}>{time}</Box>}
    </Box>
  );
}

const STATUS_COLOR = { draft: ['#fef3c7', '#92400e'], done: ['#d1fae5', '#065f46'], archived: ['#eceef1', '#5b6170'] };
export function StatusChip({ status, size = 'small' }) {
  const [bg, fg] = STATUS_COLOR[status];
  return <Chip size={size} label={MEETING_STATUS[status]} sx={{ bgcolor: bg, color: fg, fontWeight: 600, height: 22, fontSize: 12 }} />;
}
export const STATUS_DOT = { draft: '#f59e0b', done: '#059669', archived: '#c4c8d0' };

export const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getMonth() + 1}/${dt.getDate()}（${'日一二三四五六'[dt.getDay()]}）`;
};
export const fmtRel = (ts) => {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  return new Date(ts).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
