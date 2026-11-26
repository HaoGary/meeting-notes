// 分享設定：開關、存取範圍、有效期限、複製／預覽／重設連結
import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, FormControlLabel, InputAdornment, MenuItem, Radio, RadioGroup, Stack,
  Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import ContentCopy from '@mui/icons-material/ContentCopy';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import Refresh from '@mui/icons-material/Refresh';
import BusinessOutlined from '@mui/icons-material/BusinessOutlined';
import PublicOutlined from '@mui/icons-material/PublicOutlined';
import { AppDialog, useToast } from '../common/ui';

export const shareUrl = (token) => `${location.href.split('#')[0]}#share-${token}`;
const daysLeft = (ts) => (ts ? Math.max(0, Math.ceil((ts - Date.now()) / 864e5)) : null);

export default function ShareDialog({ open, onClose, api, meetingId, title, onPreview }) {
  const toast = useToast();
  const [share, setShare] = useState(undefined); // undefined=loading, null=未建立
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setShare(undefined);
    api.getShare(meetingId).then(setShare).catch((e) => { toast(e.message, 'error'); onClose(); });
  }, [open, api, meetingId]); // eslint-disable-line

  const update = async (patch, msg) => {
    setBusy(true);
    try { setShare(await api.updateShare(meetingId, patch)); if (msg) toast(msg); }
    catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const reset = async () => {
    setConfirmReset(false); setBusy(true);
    try { setShare(await api.resetShareToken(meetingId)); toast('已產生新連結，舊連結已失效'); }
    catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const copy = async () => {
    const url = shareUrl(share.token);
    try { await navigator.clipboard.writeText(url); toast('已複製分享連結'); }
    catch { inputRef.current?.select(); toast('請按 Ctrl/⌘ + C 複製已選取的連結', 'info'); }
  };

  const on = !!share?.enabled;
  const left = daysLeft(share?.expiresAt);
  const expiresValue = !share?.expiresAt ? 0 : left <= 7 ? 7 : 30;

  return (
    <AppDialog open={open} onClose={onClose} title="分享會議紀錄" maxWidth="sm">
      {share === undefined ? (
        <Stack alignItems="center" py={4}><CircularProgress size={24} /></Stack>
      ) : (
        <Stack gap={2}>
          <Typography fontSize={13.5} color="text.secondary">
            產生唯讀連結分享「{title}」。對方只能預覽內容，無法編輯；內容會隨最新儲存版本更新。
          </Typography>

          <Stack direction="row" alignItems="center" justifyContent="space-between"
            sx={{ p: 1.5, borderRadius: 2, bgcolor: on ? 'primary.light' : 'grey.50', border: 1, borderColor: on ? 'transparent' : 'divider' }}>
            <Box>
              <Typography fontWeight={600} color="text.primary">{on ? '分享連結已開啟' : '分享連結已關閉'}</Typography>
              <Typography fontSize={12.5} color="text.secondary">
                {on ? `已被檢視 ${share.viewCount} 次${left !== null ? `・${left} 天後到期` : '・不限期'}` : '開啟後即可產生連結'}
              </Typography>
            </Box>
            <Switch checked={on} disabled={busy} onChange={(e) => update({ enabled: e.target.checked }, e.target.checked ? '已開啟分享' : '已關閉分享，連結立即失效')}
              slotProps={{ input: { 'aria-label': '開啟分享連結' } }} />
          </Stack>

          {on && (
            <>
              <TextField inputRef={inputRef} fullWidth value={shareUrl(share.token)} onFocus={(e) => e.target.select()}
                slotProps={{ input: { readOnly: true, sx: { fontSize: 13, fontFamily: 'ui-monospace,Menlo,monospace' },
                  endAdornment: <InputAdornment position="end"><Button size="small" variant="contained" startIcon={<ContentCopy sx={{ fontSize: '15px !important' }} />} onClick={copy}>複製</Button></InputAdornment> },
                  htmlInput: { 'aria-label': '分享連結' } }} />

              <Box>
                <Typography fontSize={13} fontWeight={600} color="text.primary" mb={0.5}>誰可以檢視</Typography>
                <RadioGroup value={share.scope} onChange={(e) => update({ scope: e.target.value }, '已更新分享範圍')}>
                  <FormControlLabel value="org" disabled={busy} control={<Radio size="small" />} label={
                    <Stack direction="row" gap={1} alignItems="center"><BusinessOutlined fontSize="small" color="action" />
                      <Box><Typography fontSize={14}>僅限公司成員</Typography><Typography fontSize={12} color="text.disabled">需登入公司帳號才能檢視（建議）</Typography></Box>
                    </Stack>} sx={{ mb: 0.5 }} />
                  <FormControlLabel value="public" disabled={busy} control={<Radio size="small" />} label={
                    <Stack direction="row" gap={1} alignItems="center"><PublicOutlined fontSize="small" color="action" />
                      <Box><Typography fontSize={14}>任何知道連結的人</Typography><Typography fontSize={12} color="text.disabled">不需登入，適合分享給客戶或外部夥伴</Typography></Box>
                    </Stack>} />
                </RadioGroup>
                {share.scope === 'public' && <Alert severity="warning" sx={{ mt: 1, py: 0 }}>持有連結的任何人都能看到會議內容與參與人姓名，請確認內容不含機密資訊。</Alert>}
              </Box>

              <Stack direction="row" alignItems="center" gap={1.5}>
                <Typography fontSize={13} fontWeight={600} color="text.primary">有效期限</Typography>
                <TextField select value={expiresValue} disabled={busy} onChange={(e) => update({ expiresInDays: +e.target.value }, '已更新有效期限')} sx={{ minWidth: 150 }}
                  slotProps={{ htmlInput: { 'aria-label': '有效期限' } }}>
                  <MenuItem value={7}>7 天</MenuItem>
                  <MenuItem value={30}>30 天</MenuItem>
                  <MenuItem value={0}>不限期</MenuItem>
                </TextField>
              </Stack>

              <Divider />
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Button variant="outlined" startIcon={<VisibilityOutlined />} onClick={() => onPreview(share.token)}>預覽分享頁</Button>
                <Box flex={1} />
                <Tooltip title="產生新連結，舊連結立即失效">
                  <Button color="inherit" startIcon={<Refresh />} disabled={busy} onClick={() => setConfirmReset(true)}>重設連結</Button>
                </Tooltip>
              </Stack>
            </>
          )}
        </Stack>
      )}

      <AppDialog open={confirmReset} title="重設分享連結" onClose={() => setConfirmReset(false)}
        actions={<><Button color="inherit" onClick={() => setConfirmReset(false)}>取消</Button><Button variant="contained" color="error" onClick={reset}>重設</Button></>}>
        <Typography>重設後，目前已分享出去的連結將立即失效，需要重新傳送新連結給對方。</Typography>
      </AppDialog>
    </AppDialog>
  );
}

