// 語音輸入面板：與任何輸入元件搭配（傳入 onInsert），顯示錄音狀態、即時辨識文字與可編輯的辨識結果。
import { useEffect, useRef } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, IconButton, InputBase, MenuItem, Select, Stack, Tooltip, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import MicNoneOutlined from '@mui/icons-material/MicNoneOutlined';
import StopRounded from '@mui/icons-material/StopRounded';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import KeyboardReturn from '@mui/icons-material/KeyboardReturn';
import { speechDev } from './speechSetup';

const pulse = keyframes`0%{box-shadow:0 0 0 0 rgba(220,38,38,.55)}70%{box-shadow:0 0 0 8px rgba(220,38,38,0)}100%{box-shadow:0 0 0 0 rgba(220,38,38,0)}`;
const bar = keyframes`0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}`;
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
export const LANGS = [['zh-TW', '繁體中文'], ['en-US', 'English'], ['ja-JP', '日本語']];

function StatusLine({ phase, elapsed }) {
  if (phase === 'starting') return <Stack direction="row" alignItems="center" gap={1}><CircularProgress size={14} thickness={6} /><Typography fontSize={13} color="text.secondary">正在啟動麥克風…（若瀏覽器詢問權限，請點選「允許」）</Typography></Stack>;
  if (phase === 'listening') return (
    <Stack direction="row" alignItems="center" gap={1.25} role="status" aria-live="polite">
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main', animation: `${pulse} 1.4s infinite` }} />
      <Typography fontSize={13} fontWeight={600} color="error.main">錄音中</Typography>
      <Typography fontSize={13} color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(elapsed)}</Typography>
      <Stack direction="row" alignItems="center" gap="3px" sx={{ height: 16 }} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => <Box key={i} sx={{ width: 3, height: 16, borderRadius: 2, bgcolor: 'error.light', transformOrigin: 'center', animation: `${bar} ${0.7 + i * 0.13}s ease-in-out ${i * 0.08}s infinite` }} />)}
      </Stack>
    </Stack>
  );
  if (phase === 'finishing') return <Stack direction="row" alignItems="center" gap={1} role="status"><CircularProgress size={14} thickness={6} /><Typography fontSize={13} color="text.secondary">辨識中，正在整理最後一段文字…</Typography></Stack>;
  if (phase === 'stopped') return <Stack direction="row" alignItems="center" gap={1}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'grey.400' }} /><Typography fontSize={13} color="text.secondary">已停止錄音{elapsed ? `（${fmt(elapsed)}）` : ''}，可修改下方文字後插入</Typography></Stack>;
  return <Typography fontSize={13} color="text.secondary">點擊「開始錄音」後即可說話</Typography>;
}

export default function SpeechToTextPanel({ speech, language, onLanguage, onInsert, onClose, insertHint }) {
  const { phase, error, draft, setDraft, interim, elapsed, start, stop, clear } = speech;
  const busy = phase === 'starting' || phase === 'finishing';
  const active = phase === 'listening' || phase === 'starting';
  const boxRef = useRef(null);
  useEffect(() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight; }, [draft, interim]);

  const insert = () => { if (draft.trim() && onInsert(draft.trim())) clear(); };

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: active ? '#fffafa' : '#fbfbfc', px: { xs: 1.5, md: 2.5 }, py: 1.5, transition: 'background .2s' }}
      role="region" aria-label="語音輸入">
      <Box sx={{ maxWidth: 860, mx: 'auto' }}>
        <Stack direction="row" alignItems="center" gap={1} mb={1.25} flexWrap="wrap">
          <MicNoneOutlined fontSize="small" sx={{ color: active ? 'error.main' : 'text.secondary' }} />
          <Typography fontWeight={650} fontSize={14}>語音輸入</Typography>
          <Select size="small" value={language} onChange={(e) => onLanguage(e.target.value)} disabled={phase !== 'idle' && phase !== 'stopped'}
            inputProps={{ 'aria-label': '辨識語言' }} sx={{ height: 28, fontSize: 12.5, ml: 0.5, '.MuiSelect-select': { py: 0.25 } }}>
            {LANGS.map(([k, l]) => <MenuItem key={k} value={k} sx={{ fontSize: 13 }}>{l}</MenuItem>)}
          </Select>
          {speechDev.mode !== 'real' && <Chip size="small" label="預覽模擬" color="warning" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
          <Box flex={1} />
          <StatusLine phase={phase} elapsed={elapsed} />
          <Tooltip title="關閉語音輸入"><IconButton size="small" onClick={onClose} aria-label="關閉語音輸入"><CloseIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>

        {error && (
          <Alert severity={error.code === 'no-speech' ? 'warning' : 'error'} sx={{ mb: 1.25, py: 0.25 }}
            action={error.retry && <Button color="inherit" size="small" onClick={start} sx={{ whiteSpace: 'nowrap' }}>再試一次</Button>}>
            <b>{error.title}</b>　{error.message}
          </Alert>
        )}

        <Box ref={boxRef} sx={{ bgcolor: '#fff', border: 1, borderColor: active ? 'error.light' : 'divider', borderRadius: 2, px: 1.5, py: 1, maxHeight: 180, overflow: 'auto',
          transition: 'border-color .2s', '&:focus-within': { borderColor: 'primary.main', boxShadow: (t) => `0 0 0 3px ${t.palette.primary.light}` } }}>
          <InputBase multiline fullWidth minRows={2} value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={active ? '請開始說話…' : '辨識結果會顯示在這裡，您可以直接修改'}
            inputProps={{ 'aria-label': '辨識結果（可編輯）' }} sx={{ fontSize: 14.5, lineHeight: 1.7 }} />
          {interim && (
            <Typography fontSize={14.5} lineHeight={1.7} color="text.disabled" sx={{ fontStyle: 'italic' }} aria-live="polite">
              {interim}<Box component="span" sx={{ display: 'inline-block', width: 2, height: 16, bgcolor: 'error.main', ml: 0.25, verticalAlign: 'text-bottom', animation: `${bar} 1s infinite` }} />
            </Typography>
          )}
        </Box>

        <Stack direction="row" alignItems="center" gap={1} mt={1.25} flexWrap="wrap">
          {active ? (
            <Button variant="contained" color="error" startIcon={<StopRounded />} onClick={stop} disabled={phase === 'starting'}>停止錄音</Button>
          ) : (
            <Button variant={draft ? 'outlined' : 'contained'} color={draft ? 'inherit' : 'primary'} startIcon={busy ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <MicNoneOutlined />}
              onClick={start} disabled={busy}>{phase === 'finishing' ? '辨識中…' : draft ? '繼續錄音' : '開始錄音'}</Button>
          )}
          <Button color="inherit" startIcon={<DeleteOutline />} onClick={clear} disabled={!draft} sx={{ color: 'text.secondary' }}>清除</Button>
          <Box flex={1} />
          {insertHint && <Typography fontSize={12.5} color="text.disabled" sx={{ display: { xs: 'none', sm: 'block' } }}>{insertHint}</Typography>}
          <Button variant="contained" startIcon={<KeyboardReturn />} onClick={insert} disabled={!draft.trim() || busy}>插入內容</Button>
        </Stack>
      </Box>
    </Box>
  );
}
