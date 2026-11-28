// 日期／時間選擇器：取代瀏覽器原生 <input type="date|time">（無法自訂樣式），改用 MUI X Date Pickers，
// 外觀跟隨後台 theme。值一律使用字串：日期 'YYYY-MM-DD'、時間 'HH:mm'，與資料庫格式一致。
import { useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, InputAdornment, Popover, Stack, TextField, Typography } from '@mui/material';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-tw';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { zhTW } from '@mui/x-date-pickers/locales';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';

export function PickerProvider({ children }) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="zh-tw"
      localeText={{ ...zhTW.components.MuiLocalizationProvider.defaultProps.localeText, okButtonLabel: '確定', todayButtonLabel: '今天', cancelButtonLabel: '取消' }}>
      {children}
    </LocalizationProvider>
  );
}

const toDate = (s) => (s ? dayjs(s) : null);

// inline：無外框，用於會議資料（滑過顯示底色）；outlined：一般表單
function fieldProps({ variant, label, error, helperText, id, onOpen, width, iconSize = 20 }) {
  const inline = variant === 'inline';
  return {
    id, label: inline ? undefined : label, error, helperText,
    variant: inline ? 'standard' : 'outlined',
    fullWidth: !inline,
    onClick: onOpen, // 點擊欄位任一處即開啟
    InputProps: inline ? { disableUnderline: true } : undefined,
    InputLabelProps: inline ? undefined : { shrink: true },
    sx: inline ? {
      width,
      '& .MuiInputBase-root': { fontSize: 14, borderRadius: 1.5, px: 1, height: 32, cursor: 'pointer', transition: 'background .12s',
        '&:hover:not(.Mui-disabled)': { bgcolor: 'action.hover' }, '&.Mui-focused': { bgcolor: 'background.default', boxShadow: (t) => `inset 0 0 0 1px ${t.palette.primary.main}` } },
      '& .MuiInputBase-input': { cursor: 'pointer', py: 0 },
      '& .Mui-disabled': { WebkitTextFillColor: 'inherit !important', color: 'text.primary', cursor: 'default' },
      '& .Mui-error .MuiInputBase-input': { color: 'error.main' },
      // 圖示尺寸依設計稿：日期 20px、時間 18px，與文字間距約 10–12px
      '& .MuiInputAdornment-root': { ml: 0.75 },
      '& .MuiInputAdornment-root .MuiIconButton-root': { p: 0.25, mr: -0.25, color: 'text.disabled' },
      '& .MuiInputAdornment-root .MuiSvgIcon-root': { fontSize: iconSize },
      '& .MuiFormHelperText-root': { mx: 1 },
    } : { '& .MuiInputBase-input': { cursor: 'pointer' } },
  };
}

function DateInputInner({ value, onChange, disabled, variant = 'outlined', label, error, helperText, id, width = 190 }) {
  const [open, setOpen] = useState(false);
  return (
    <DatePicker value={toDate(value)} disabled={disabled} open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}
      onChange={(v) => { if (v && v.isValid()) onChange(v.format('YYYY-MM-DD')); }}
      format="YYYY/MM/DD（dd）" showDaysOutsideCurrentMonth dayOfWeekFormatter={(d) => d.format('dd')} closeOnSelect
      slots={{ openPickerIcon: CalendarMonthOutlined }}
      slotProps={{
        textField: fieldProps({ variant, label, error, helperText, id, width, iconSize: 20, onOpen: () => !disabled && setOpen(true) }),
        actionBar: { actions: ['today'] },
        calendarHeader: { format: 'YYYY年M月' },
        popper: { placement: 'bottom-start' },
        openPickerButton: { 'aria-label': '選擇日期', size: 'small' },
      }} />
  );
}

// ── 時間選擇：時／分兩欄清單（含欄位標題、捲軸），底部「現在」「確定」 ──
const pad = (n) => String(n).padStart(2, '0');
const parseHM = (v) => (v && /^\d{1,2}:\d{2}$/.test(v) ? v.split(':').map(Number) : [null, null]);

function Column({ title, items, selected, isDisabled, onPick, open }) {
  const ref = useRef(null);
  // 開啟時把已選項目捲到最上方
  useEffect(() => {
    if (!open || selected == null) return;
    const el = ref.current?.querySelector(`[data-v="${selected}"]`);
    if (el) ref.current.scrollTop = el.offsetTop - 4;
  }, [open]); // eslint-disable-line
  return (
    <Box sx={{ width: 76, display: 'flex', flexDirection: 'column', '& + &': { borderLeft: 1, borderColor: 'divider' } }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary', textAlign: 'center', py: 0.75, bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider' }}>{title}</Typography>
      <Box ref={ref} role="listbox" aria-label={title} sx={{ height: 224, overflowY: 'scroll', p: 0.5, position: 'relative',
        scrollbarWidth: 'thin', scrollbarColor: '#c4c8d0 transparent',
        '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { bgcolor: '#c4c8d0', borderRadius: 3 } }}>
        {items.map((v) => {
          const sel = v === selected; const dis = isDisabled?.(v);
          return (
            <Box key={v} data-v={v} role="option" aria-selected={sel} aria-disabled={dis || undefined} tabIndex={-1}
              onClick={() => !dis && onPick(v)}
              sx={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 1, fontSize: 14, fontVariantNumeric: 'tabular-nums',
                cursor: dis ? 'not-allowed' : 'pointer', color: sel ? '#fff' : dis ? 'text.disabled' : 'text.primary', fontWeight: sel ? 650 : 400,
                bgcolor: sel ? 'primary.main' : 'transparent', '&:hover': { bgcolor: sel ? 'primary.main' : dis ? 'transparent' : 'primary.light' } }}>
              {pad(v)}
            </Box>
          );
        })}
        <Box sx={{ height: 224 - 40 }} /> {/* 讓最後的項目也能捲到最上方 */}
      </Box>
    </Box>
  );
}

function TimeInputInner({ value, onChange, disabled, variant = 'outlined', label, error, helperText, id, minTime, width = 120, step = 1 }) {
  const [anchor, setAnchor] = useState(null);
  const [draft, setDraft] = useState([null, null]);
  const [minH, minM] = parseHM(minTime);
  const open = !!anchor;
  const show = (el) => { if (disabled) return; const [h, m] = parseHM(value); setDraft([h, m]); setAnchor(el); };
  const close = () => setAnchor(null);
  const commit = (h, m) => { if (h == null) return close(); onChange(`${pad(h)}:${pad(m ?? 0)}`); close(); };
  const hourDisabled = (h) => minH != null && (h < minH || (h === minH && minM >= 60 - step));
  const minuteDisabled = (m) => minH != null && draft[0] === minH && m <= minM;
  const now = () => {
    const d = new Date(); let h = d.getHours(); let m = Math.round(d.getMinutes() / step) * step;
    if (m >= 60) { m = 0; h = (h + 1) % 24; }
    commit(h, m);
  };
  const tf = fieldProps({ variant, label, error, helperText, id, width, iconSize: 18 });
  return (
    <>
      <TextField {...tf} value={value || ''} placeholder="--:--" disabled={disabled}
        onClick={(e) => show(e.currentTarget)}
        onKeyDown={(e) => { if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); show(e.currentTarget); } }}
        InputProps={{ ...tf.InputProps, readOnly: true,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" aria-label="選擇時間" disabled={disabled} onClick={(e) => { e.stopPropagation(); show(e.currentTarget.closest('.MuiFormControl-root')); }}>
                <ScheduleOutlined fontSize="small" />
              </IconButton>
            </InputAdornment>) }} />
      <Popover open={open} anchorEl={anchor} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 0.75, borderRadius: 2, border: 1, borderColor: 'divider', overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(17,24,39,.14), 0 2px 6px rgba(17,24,39,.06)' } } }}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(draft[0], draft[1]); }}>
        <Stack direction="row">
          <Column title="時" open={open} items={Array.from({ length: 24 }, (_, i) => i)} selected={draft[0]} isDisabled={hourDisabled}
            onPick={(h) => setDraft(([, m]) => [h, minH != null && h === minH && (m ?? 0) <= minM ? null : m ?? 0])} />
          <Column title="分" open={open} items={Array.from({ length: 60 / step }, (_, i) => i * step)} selected={draft[1]} isDisabled={minuteDisabled}
            onPick={(m) => setDraft(([h]) => [h ?? (minH ?? 0), m])} />
        </Stack>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, py: 1, borderTop: 1, borderColor: 'divider' }}>
          <Button size="small" onClick={now} sx={{ minWidth: 0, fontWeight: 600 }}>現在</Button>
          <Button size="small" variant="contained" disabled={draft[0] == null || draft[1] == null} onClick={() => commit(draft[0], draft[1])} sx={{ minWidth: 56 }}>確定</Button>
        </Stack>
      </Popover>
    </>
  );
}

// 每個選擇器自帶 LocalizationProvider（只是 context），讓日期套件只在用到的頁面才載入
export function DateInput(props) { return <PickerProvider><DateInputInner {...props} /></PickerProvider>; }
export function TimeInput(props) { return <PickerProvider><TimeInputInner {...props} /></PickerProvider>; }
