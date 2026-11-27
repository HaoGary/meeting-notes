// 帳號驗證頁共用元件：沿用後台 MUI theme（色彩、字體、圓角、按鈕、輸入框）
import { useState } from 'react';
import { Box, Button, CircularProgress, IconButton, InputAdornment, Link, Stack, TextField, Tooltip, Typography } from '@mui/material';
import Visibility from '@mui/icons-material/VisibilityOutlined';
import VisibilityOff from '@mui/icons-material/VisibilityOffOutlined';
import CheckCircle from '@mui/icons-material/CheckCircle';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import { PASSWORD_RULES } from '../../utils/validators';
import brandBg from '../../assets/auth/brand-bg.webp';
import logo from '../../assets/auth/logo.png';
import logoWhite from '../../assets/auth/logo-white.png';

// ── 版面：左側品牌區（桌面）＋ 右側表單 ──
// 品牌區依 Figma 設計稿（會議紀錄系統 › 01–03）：背景插圖、Meeting Notes 標誌（105×40）、主色標語
function BrandLogo() {
  return <Box component="img" src={logo} alt="Meeting Notes" sx={{ width: 105, height: 40, display: 'block' }} />;
}

export function AuthLayout({ children }) {
  const features = [
    [EventNoteOutlined, '會議紀錄與自動儲存', '像文件一樣編輯，停止輸入即自動儲存'],
    [ShareOutlined, '安全的唯讀分享', '可設定範圍與期限，隨時撤銷連結'],
    [ShieldOutlined, '角色權限管理', '所有權限皆由後端驗證'],
  ];
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: 'background.default' }}>
      <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', width: '42%', maxWidth: 560, p: 6, color: '#fff',
        position: 'relative', overflow: 'hidden', bgcolor: 'primary.dark',
        // 背景插圖上疊一層品牌藍紫色遮罩（設計稿：rgba(24,13,204,.4)）
        backgroundImage: `linear-gradient(rgba(24,13,204,.4), rgba(24,13,204,.4)), url(${brandBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <Box component="img" src={logoWhite} alt="Meeting Notes" sx={{ width: 105, height: 40, display: 'block' }} />
        <Box sx={{ my: 'auto', pb: '144px', position: 'relative' }}>
          <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: '32px', color: '#fff', mb: 4 }}>讓每一場會議<br />都留下清楚紀錄</Typography>
          <Stack gap={2.5}>
            {features.map(([I, t, d]) => (
              <Stack key={t} direction="row" alignItems="center" gap={1.75}>
                <Box sx={{ width: 38, height: 38, flex: 'none', borderRadius: '10px', bgcolor: 'rgba(255,255,255,.12)', color: '#fff', display: 'grid', placeItems: 'center' }}><I sx={{ fontSize: 20 }} /></Box>
                <Box><Typography fontWeight={700} fontSize={15} lineHeight={1.4}>{t}</Typography><Typography fontSize={13} sx={{ color: 'rgba(255,255,255,.75)' }}>{d}</Typography></Box>
              </Stack>
            ))}
          </Stack>
        </Box>
        <Typography fontSize={12} sx={{ color: 'rgba(255,255,255,.6)' }}>© {new Date().getFullYear()} 管理後台</Typography>
      </Box>

      <Stack flex={1} alignItems="center" justifyContent="center" sx={{ px: { xs: 2.5, sm: 4 }, py: { xs: 4, sm: 6 } }}>
        <Box sx={{ width: '100%', maxWidth: 420 }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' }, mb: 4 }}><BrandLogo /></Box>
          {children}
        </Box>
      </Stack>
    </Box>
  );
}

// 標題區不放圖示（依設計稿）
export function AuthHeader({ title, subtitle }) {
  return (
    <Box sx={{ mb: 3.5 }}>
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
  return <Link component="button" type="button" underline="hover" onClick={onClick} sx={{ fontWeight: 600, fontSize: 'inherit', verticalAlign: 'baseline', py: { xs: 1.25, sm: 0 }, my: { xs: -1.25, sm: 0 } }} {...p}>{children}</Link>;
}
