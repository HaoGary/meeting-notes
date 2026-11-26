// AI 文案潤飾：檢查 Claude 登入 → 逐區塊整理（顯示進度）→ 預覽前後對照 → 套用（可復原）
// 中途停止（額度用完、登入過期、網路等）時說明目前狀態，可套用已完成部分或稍後繼續。
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, AlertTitle, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Tab, Tabs, Typography, useMediaQuery,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import Refresh from '@mui/icons-material/Refresh';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import ReadOnlyContent from '../editor/ReadOnlyContent';
import { CLAUDE_LOGIN_URL, polishDocument, toSections, sectionsPayload } from './polishService';

function Pane({ title, doc, highlight, loading }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', border: 1, borderColor: highlight ? 'primary.main' : 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1, bgcolor: highlight ? 'primary.light' : 'grey.50', borderBottom: 1, borderColor: highlight ? 'primary.main' : 'divider' }}>
        <Typography fontSize={13} fontWeight={600} color={highlight ? 'primary.dark' : 'text.secondary'}>{title}</Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', '& .prose': { minHeight: 0, p: '16px 20px', fontSize: 14 } }}>
        {loading ? <Stack gap={1.5} p={2.5}>{[90, 70, 85, 60, 75].map((w, i) => <Box key={i} sx={{ height: 12, width: `${w}%`, borderRadius: 1, bgcolor: 'grey.100', animation: 'pulse 1.4s ease-in-out infinite', '@keyframes pulse': { '50%': { opacity: 0.45 } } }} />)}</Stack>
          : doc && <ReadOnlyContent doc={doc} raw />}
      </Box>
    </Box>
  );
}

// 中途停止時，依原因說明目前狀態與下一步
function StopNotice({ error, steps, onLogin }) {
  const p = error.partial;
  const doneNames = steps.filter((s) => s.status === 'done').map((s) => s.heading || '開頭內容');
  const status = p
    ? (p.done ? `已完成 ${p.done} / ${p.total} 個區塊（${doneNames.join('、')}），其餘 ${p.total - p.done} 個區塊保留原文。` : `${p.total} 個區塊都尚未處理。`)
    : '';
  const next = {
    usage_limit: p?.done ? '您可以先「套用已完成部分」，或等額度恢復後按「繼續整理」接續處理剩下的區塊。' : '請等 Claude 使用額度恢復後，再按「繼續整理」。',
    rate_limited: '請稍候片刻再按「繼續整理」。',
    session_expired: '請重新登入 Claude，回到此頁面後按「繼續整理」。',
    aborted: p?.done ? '可「套用已完成部分」，或按「繼續整理」接續處理。' : '可按「繼續整理」重新開始。',
  }[error.code] || (error.retry ? '可按「繼續整理」再試一次。' : '');
  const severity = error.code === 'aborted' ? 'info' : error.code === 'usage_limit' || error.code === 'rate_limited' ? 'warning' : 'error';
  return (
    <Alert severity={severity} action={error.code === 'session_expired' && (
      <Button color="inherit" size="small" startIcon={<LoginRounded />} component="a" href={CLAUDE_LOGIN_URL} target="_blank" rel="noopener noreferrer" onClick={onLogin}>登入 Claude</Button>)}>
      <AlertTitle sx={{ fontSize: 14, mb: 0.25 }}>{error.message}</AlertTitle>
      <Typography fontSize={13}>目前狀態：{status}<b>會議內容尚未變更。</b></Typography>
      {next && <Typography fontSize={13} mt={0.25}>{next}</Typography>}
      {!['aborted', 'usage_limit'].includes(error.code) && <Typography fontSize={11.5} sx={{ opacity: 0.7, mt: 0.5 }}>錯誤代碼：{error.code}</Typography>}
    </Alert>
  );
}

export default function AiPolishDialog({ open, onClose, editor, onApplied }) {
  const narrow = useMediaQuery((t) => t.breakpoints.down('md'));
  const [state, setState] = useState({ phase: 'idle' }); // loading | done | error
  const [source, setSource] = useState(null);
  const [steps, setSteps] = useState([]);
  const [tab, setTab] = useState('after');
  const ctrl = useRef(null);

  const initSteps = (doc) => {
    const payload = sectionsPayload(toSections(doc).sections);
    setSteps(payload.map((s) => ({ index: s.index, heading: s.heading, status: 'pending' })));
  };
  const setStep = (index, status) => setSteps((list) => list.map((s) => (s.index === index ? { ...s, status } : s)));

  const run = async (doc, { fresh = false, resume = {} } = {}) => {
    ctrl.current?.abort();
    const ac = new AbortController(); ctrl.current = ac;
    setState({ phase: 'loading', partialDoc: state.error?.partial?.doc });
    setSteps((list) => list.map((s) => (resume[s.index] ? { ...s, status: 'done' } : { ...s, status: 'pending' })));
    try {
      const r = await polishDocument(doc, { signal: ac.signal, fresh, resume, onStep: setStep });
      if (!ac.signal.aborted) setState({ phase: 'done', ...r });
    } catch (e) {
      if (e.code === 'aborted' && ac !== ctrl.current) return;
      setState({ phase: 'error', error: e });
    }
  };
  useEffect(() => {
    if (!open || !editor) return;
    const doc = editor.getJSON();
    setSource(doc); setTab('after'); initSteps(doc); run(doc);
    return () => ctrl.current?.abort();
  }, [open]); // eslint-disable-line

  const close = () => { ctrl.current?.abort(); ctrl.current = null; setState({ phase: 'idle' }); onClose(); };
  const apply = (doc) => { editor.chain().focus().setContent(doc, true).run(); close(); onApplied?.(); };

  const loading = state.phase === 'loading';
  const err = state.phase === 'error' ? state.error : null;
  const partial = err?.partial;
  const after = state.phase === 'done' ? state.doc : partial?.done ? partial.doc : null;
  const loginNeeded = err?.code === 'login_required';
  const working = steps.find((s) => s.status === 'working');
  const doneCount = useMemo(() => steps.filter((s) => s.status === 'done').length, [steps]);

  return (
    <Dialog open={!!open} onClose={loading ? undefined : close} maxWidth={loginNeeded ? 'xs' : 'lg'} fullWidth fullScreen={narrow && !loginNeeded}
      PaperProps={{ sx: { height: loginNeeded ? 'auto' : narrow ? '100%' : '86vh' } }}>
      <DialogTitle sx={{ pr: 6, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeOutlined color="primary" />AI 文案潤飾
        <IconButton aria-label="關閉" onClick={close} sx={{ position: 'absolute', right: 10, top: 10 }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      {loginNeeded ? (
        <>
          <DialogContent>
            <Stack alignItems="center" textAlign="center" gap={1.5} py={2}>
              <Box sx={{ width: 52, height: 52, borderRadius: 3, bgcolor: 'primary.light', color: 'primary.main', display: 'grid', placeItems: 'center' }}><LoginRounded /></Box>
              <Typography variant="h6" fontSize={18}>請先登入 Claude 帳號</Typography>
              <Typography fontSize={14} color="text.secondary">AI 潤飾會使用您的 Claude 帳號與使用額度。請先登入 Claude，並在 Claude 中開啟此頁面後再使用。</Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
            <Button color="inherit" onClick={close}>關閉</Button>
            <Button variant="contained" startIcon={<LoginRounded />} component="a" href={CLAUDE_LOGIN_URL} target="_blank" rel="noopener noreferrer">前往登入 Claude</Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pb: 1 }}>
            <Typography fontSize={13} color="text.secondary">
              逐一整理各區塊：口語改為精簡書面條列，保留人名、數字、日期與連結；標題、表格與圖片不會變動。使用您的 Claude 帳號額度，額度用完時會自動停止。
            </Typography>
            {loading && (
              <Typography fontSize={12.5} color="text.secondary">
                {working ? `正在整理「${working.heading || '開頭內容'}」（${doneCount + 1} / ${steps.length}）…` : '準備中…'}
                {doneCount === 0 && '　第一次使用時，Claude 會詢問是否允許此頁面使用您的帳號。'}
              </Typography>
            )}
            {err && !['empty', 'too_long', 'unavailable'].includes(err.code) && <StopNotice error={err} steps={steps} />}
            {err && ['empty', 'too_long'].includes(err.code) && <Alert severity="info">{err.message}</Alert>}
            {state.phase === 'done' && state.done < state.total && <Alert severity="info" sx={{ py: 0 }}>有 {state.total - state.done} 個區塊未處理，已保留原文。</Alert>}

            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {narrow ? (
                <>
                  <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 40, mb: 1, '& .MuiTab-root': { minHeight: 40 } }}>
                    <Tab value="before" label="原文" /><Tab value="after" label="潤飾後" />
                  </Tabs>
                  {tab === 'before' ? <Pane title="原文" doc={source} /> : <Pane title="潤飾後（預覽）" doc={after} highlight loading={loading && !after} />}
                </>
              ) : (
                <Stack direction="row" gap={1.5} sx={{ flex: 1, minHeight: 0 }}>
                  <Pane title="原文" doc={source} />
                  <Pane title={partial?.done ? `已完成部分（${partial.done} / ${partial.total}）` : '潤飾後（預覽）'} doc={after} highlight loading={loading} />
                </Stack>
              )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider', gap: 1, flexWrap: 'wrap' }}>
            <Typography fontSize={12.5} color="text.disabled" sx={{ mr: 'auto', display: { xs: 'none', sm: 'block' } }}>AI 可能出錯，請確認內容正確後再套用；套用後可復原</Typography>
            {loading && <Button color="inherit" onClick={() => ctrl.current?.abort()}>停止</Button>}
            {state.phase === 'done' && <Button color="inherit" startIcon={<Refresh />} onClick={() => { initSteps(source); run(source, { fresh: true }); }}>重新產生</Button>}
            {err?.retry && <Button color="inherit" startIcon={<PlayArrowRounded />} onClick={() => run(source, { fresh: true, resume: partial?.results || {} })}>繼續整理</Button>}
            {err && partial?.done > 0
              ? <Button variant="contained" startIcon={<AutoAwesomeOutlined />} onClick={() => apply(partial.doc)}>套用已完成部分</Button>
              : <Button variant="contained" startIcon={loading ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <AutoAwesomeOutlined />}
                  disabled={state.phase !== 'done'} onClick={() => apply(state.doc)}>套用</Button>}
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
