// 帳號驗證頁共用元件：沿用後台 MUI theme（色彩、字體、圓角、按鈕、輸入框）
import { useState } from 'react';
import { Box, Button, CircularProgress, IconButton, InputAdornment, Link, Stack, TextField, Tooltip, Typography } from '@mui/material';
import Visibility from '@mui/icons-material/VisibilityOutlined';
import VisibilityOff from '@mui/icons-material/VisibilityOffOutlined';
import CheckCircle from '@mui/icons-material/CheckCircle';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import { PASSWORD_RULES } from '../../utils/validators';

// ── 版面：左側品牌區（桌面）＋ 右側表單 ──
export function AuthLayout({ children }) {
  const features = [
    [EventNoteOutlined, '會議紀錄與自動儲存', '像文件一樣編輯，停止輸入即自動儲存'],
    [ShareOutlined, '安全的唯讀分享', '可設定範圍與期限，隨時撤銷連結'],
    [ShieldOutlined, '角色權限管理', '所有權限皆由後端驗證'],
  ];
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: 'background.default' }}>
      <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', width: '42%', maxWidth: 560, p: 6, color: '#fff',
        background: 'linear-gradient(155deg, #4f46e5 0%, #3730a3 70%, #312e81 100%)', position: 'relative', overflow: 'hidden' }}>
        <Box sx={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', right: -160, bottom: -140, bgcolor: 'rgba(255,255,255,.06)' }} />
        <Box sx={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', right: 60, top: -120, bgcolor: 'rgba(255,255,255,.05)' }} />
        <Stack direction="row" alignItems="center" gap={1.25}>
          <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: 'rgba(255,255,255,.16)', display: 'grid', placeItems: 'center' }}><DashboardOutlined sx={{ fontSize: 20 }} /></Box>
          <Typography fontWeight={700} fontSize={17}>管理後台</Typography>
        </Stack>
        <Box sx={{ my: 'auto', position: 'relative' }}>
          <Typography sx={{ fontSize: 30, fontWeight: 700, lineHeight: 1.35, mb: 1.5 }}>讓每一場會議<br />都留下清楚的紀錄</Typography>
          <Typography sx={{ opacity: 0.8, mb: 5 }}>集中管理會議內容、決議與參與人員。</Typography>
          <Stack gap={2.5}>
            {features.map(([I, t, d]) => (
              <Stack key={t} direction="row" gap={1.75}>
                <Box sx={{ width: 38, height: 38, flex: 'none', borderRadius: 2, bgcolor: 'rgba(255,255,255,.12)', display: 'grid', placeItems: 'center' }}><I sx={{ fontSize: 20 }} /></Box>
                <Box><Typography fontWeight={600}>{t}</Typography><Typography fontSize={13} sx={{ opacity: 0.75 }}>{d}</Typography></Box>
              </Stack>
            ))}
          </Stack>
        </Box>
        <Typography fontSize={12} sx={{ opacity: 0.6 }}>© {new Date().getFullYear()} 管理後台</Typography>
      </Box>

      <Stack flex={1} alignItems="center" justifyContent="center" sx={{ px: { xs: 2.5, sm: 4 }, py: { xs: 4, sm: 6 } }}>
        <Box sx={{ width: '100%', maxWidth: 420 }}>
          <Stack direction="row" alignItems="center" gap={1.25} sx={{ display: { xs: 'flex', md: 'none' }, mb: 4 }}>
            <Box sx={{ width: 32, height: 32, borderRadius: 1.75, bgcolor: 'primary.main', color: '#fff', display: 'grid', placeItems: 'center' }}><DashboardOutlined sx={{ fontSize: 19 }} /></Box>
            <Typography fontWeight={700} fontSize={16}>管理後台</Typography>
          </Stack>
          {children}
        </Box>
      </Stack>
    </Box>
  );
}

export function AuthHeader({ icon, title, subtitle }) {
  return (
    <Box sx={{ mb: 3.5 }}>
      {icon && <Box sx={{ width: 48, height: 48, borderRadius: 2.5, bgcolor: 'primary.light', color: 'primary.main', display: 'grid', placeItems: 'center', mb: 2.5 }}>{icon}</Box>}
      <Typography component="h1" sx={{ fontSize: 26, fontWeight: 700, mb: 0.75 }}>{title}</Typography>
      {subtitle && <Typography color="text.secondary" fontSize={14.5}>{subtitle}</Typography>}
    </Box>
  );
}

// 主要按鈕：Hover / Loading / Disabled 狀態
export function SubmitButton({ loading, children, ...props }) {
  return (
    <Button type="submit" variant="contained" size="large" fullWidth disabled={loading || props.disabled} aria-busy={loading || undefined}
      sx={{ height: 46, fontSize: 15, mt: 0.5, '&:hover': { bgcolor: 'primary.dark' }, '&.Mui-disabled': { bgcolor: loading ? 'primary.main' : undefined, color: loading ? '#fff' : undefined, opacity: loading ? 0.85 : 1 } }} {...props}>
      {loading ? <Stack direction="row" alignItems="center" gap={1}><CircularProgress size={18} thickness={5} sx={{ color: '#fff' }} />處理中…</Stack> : children}
    </Button>
  );
}

// 表單容器：欄位之間統一 20px 間距
export function FormStack({ children, ...props }) {
  return <Stack component="form" noValidate gap={2.5} {...props}>{children}</Stack>;
}

// 欄位：標籤 → 輸入框 → 提示／錯誤（有內容才出現）→ 附加內容（如密碼規則）
export function Field({ label, below, ...props }) {
  return (
    <Box>
      <Typography component="label" htmlFor={props.id} fontSize={13.5} fontWeight={600} color="text.primary" sx={{ display: 'block', mb: 1 }}>{label}</Typography>
      <TextField fullWidth size="medium" {...props} label={undefined}
        slotProps={{ ...props.slotProps, formHelperText: { sx: { mx: 0, mt: 0.75, fontSize: 12.5, lineHeight: 1.5 } }, htmlInput: { ...props.slotProps?.htmlInput, id: props.id } }}
        sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', height: 46 }, ...props.sx }} />
      {below && <Box sx={{ mt: 1.25 }}>{below}</Box>}
    </Box>
  );
}

export function PasswordField(props) {
  const [show, setShow] = useState(false);
  return (
    <Field {...props} type={show ? 'text' : 'password'}
      slotProps={{ ...props.slotProps, input: { endAdornment: (
        <InputAdornment position="end">
          <Tooltip title={show ? '隱藏密碼' : '顯示密碼'}>
            <IconButton edge="end" onClick={() => setShow((x) => !x)} onMouseDown={(e) => e.preventDefault()} aria-label={show ? '隱藏密碼' : '顯示密碼'}>
              {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </IconButton>
          </Tooltip>
        </InputAdornment>) } }} />
  );
}

// 即時顯示密碼規則達成狀況
export function PasswordChecklist({ value = '' }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 1.5, rowGap: 0.75, p: 1.25, borderRadius: 1.5, bgcolor: 'grey.50', border: 1, borderColor: 'divider' }} aria-live="polite">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <Stack key={r.id} direction="row" alignItems="center" gap={0.75} sx={{ fontSize: 12.5, color: ok ? 'success.main' : 'text.disabled' }}>
            {ok ? <CheckCircle sx={{ fontSize: 15 }} /> : <RadioButtonUnchecked sx={{ fontSize: 15 }} />}{r.label}
          </Stack>
        );
      })}
    </Box>
  );
}

export function TextLink({ onClick, children, ...p }) {
  return <Link component="button" type="button" underline="hover" onClick={onClick} sx={{ fontWeight: 600, fontSize: 'inherit', verticalAlign: 'baseline' }} {...p}>{children}</Link>;
}
