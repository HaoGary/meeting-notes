// AI 潤飾（手動模式）：不需要 API 金鑰、不經過後端。
// 1. 複製「整理指令＋會議內容」→ 2. 貼到自己的 AI（Claude、ChatGPT、Gemini…）→ 3. 把 AI 回覆貼回來
// → 預覽前後對照 → 套用（可復原）。使用的是每個人自己的 AI 訂閱，系統本身不呼叫任何 AI 服務。
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, Stack, Tab, Tabs, TextField, Typography, useMediaQuery,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import ContentCopy from '@mui/icons-material/ContentCopy';
import CheckCircle from '@mui/icons-material/CheckCircle';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { buildPrompt, parseJsonLoose, toSections, sectionsPayload, fromSections, missingNumbers } from './polishService';
import ClassifyToggle, { NumberCheck } from './ClassifyToggle';
import { Pane } from './AiPolishDialog';

export const MANUAL_MAX_CHARS = 30000; // 一般 AI 對話視窗可接受的長度，超過請分段
const AI_LINKS = [['Claude', 'https://claude.ai/new'], ['ChatGPT', 'https://chatgpt.com/'], ['Gemini', 'https://gemini.google.com/app']];

function Step({ n, title, children, done }) {
  return (
    <Stack direction="row" gap={1.5} alignItems="flex-start">
      <Box sx={{ width: 24, height: 24, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
        bgcolor: done ? 'success.main' : 'primary.main', color: '#fff', mt: 0.25 }}>{done ? <CheckCircle sx={{ fontSize: 18 }} /> : n}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography fontWeight={600} fontSize={14} mb={0.75}>{title}</Typography>
        {children}
      </Box>
    </Stack>
  );
}

export default function ManualPolishDialog({ open, onClose, editor, onApplied }) {
  const narrow = useMediaQuery((t) => t.breakpoints.down('md'));
  const [source, setSource] = useState(null);   // 複製當下的內容快照
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [reply, setReply] = useState('');
  const [result, setResult] = useState(null);   // { doc, keptSections, total }
  const [error, setError] = useState('');
  const [tab, setTab] = useState('after');
  const [classify, setClassify] = useState(true);

  const prepared = useMemo(() => {
    if (!source) return null;
    const parsed = toSections(source);
    const payload = sectionsPayload(parsed.sections, { all: classify });
    const chars = payload.reduce((n, s) => n + s.blocks.reduce((m, b) => m + (b.text?.length || 0), 0), 0);
    return { parsed, payload, chars, prompt: chars ? buildPrompt(payload, { classify }) : '' };
  }, [source, classify]);

  useEffect(() => {
    if (!open || !editor) return;
    setSource(editor.getJSON()); setCopied(false); setCopyFailed(false); setReply(''); setResult(null); setError(''); setTab('after');
  }, [open]); // eslint-disable-line

  const empty = prepared && !prepared.chars;
  const tooLong = prepared && prepared.chars > MANUAL_MAX_CHARS;

  const copy = async () => {
    try { await navigator.clipboard.writeText(prepared.prompt); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); } // 瀏覽器不允許時改為手動選取複製
  };

  const preview = () => {
    setError('');
    const out = parseJsonLoose(reply);
    const sections = Array.isArray(out?.sections) ? out.sections : null;
    if (!sections) { setError('看不懂這段回覆。請確認貼上的是 AI 回覆的完整內容（應該是以 { 開頭、} 結尾的 JSON）。'); return; }
    const known = new Set(prepared.payload.map((s) => s.index));
    const usable = sections.filter((s) => known.has(s?.index) && Array.isArray(s.blocks));
    if (!usable.length) { setError('回覆中沒有對應到這份會議的內容，可能貼錯了對話。請重新複製指令再試一次。'); return; }
    const built = fromSections(source, prepared.parsed, { sections: usable, newSections: out.newSections }, { classify });
    setResult({ doc: built.doc, total: prepared.payload.length, missing: prepared.payload.length - usable.length, numbers: missingNumbers(source, built.doc) });
  };

  const changedSinceCopy = result && editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(source);
  const apply = () => { editor.chain().focus().setContent(result.doc, true).run(); onClose(); onApplied?.(); };

  return (
    <Dialog open={!!open} onClose={onClose} maxWidth={result ? 'lg' : 'sm'} fullWidth fullScreen={narrow && !!result}
      PaperProps={{ sx: { height: result ? (narrow ? '100%' : '86vh') : 'auto' } }}>
      <DialogTitle sx={{ pr: 6, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeOutlined color="primary" />AI 文案潤飾
        <IconButton aria-label="關閉" onClick={onClose} sx={{ position: 'absolute', right: 10, top: 10 }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      {!result ? (
        <>
          <DialogContent>
            <Typography fontSize={13.5} color="text.secondary" mb={2.5}>
              用你自己的 AI 整理會議紀錄，人名、數字、日期與連結都會保留。系統不會把內容傳給任何 AI。
            </Typography>
            {empty ? <Alert severity="info">目前沒有可以整理的文字內容。</Alert>
              : tooLong ? <Alert severity="warning">內容約 {prepared.chars.toLocaleString()} 字，超過 {MANUAL_MAX_CHARS.toLocaleString()} 字，AI 可能無法完整處理，建議分成幾場會議或先刪減內容。</Alert>
              : prepared && (
              <Stack gap={2.5}>
                <ClassifyToggle checked={classify} onChange={(v) => { setClassify(v); setCopied(false); setCopyFailed(false); setReply(''); setError(''); }} />
                <Step n={1} title="複製指令（含會議內容）" done={copied}>
                  <Button variant={copied ? 'outlined' : 'contained'} startIcon={copied ? <CheckCircle /> : <ContentCopy />} onClick={copy}>
                    {copied ? '已複製，可再按一次' : '複製指令'}
                  </Button>
                  {copyFailed && (
                    <Box mt={1}>
                      <Typography fontSize={12.5} color="warning.main" mb={0.5}>瀏覽器不允許自動複製，請點下方文字框、全選後手動複製。</Typography>
                      <TextField multiline fullWidth minRows={3} maxRows={6} value={prepared.prompt} slotProps={{ htmlInput: { readOnly: true, 'aria-label': '整理指令', style: { fontSize: 12 } } }}
                        onFocus={(e) => e.target.select()} />
                    </Box>
                  )}
                </Step>
                <Step n={2} title="貼到你的 AI 並送出">
                  <Typography fontSize={13} color="text.secondary">
                    例如 {AI_LINKS.map(([n, u], i) => <span key={n}>{i ? '、' : ''}<Link href={u} target="_blank" rel="noopener noreferrer">{n}</Link></span>)}。請確認公司允許使用。
                  </Typography>
                </Step>
                <Step n={3} title="貼回 AI 的完整回覆">
                  <TextField multiline fullWidth minRows={4} maxRows={10} value={reply} onChange={(e) => { setReply(e.target.value); setError(''); }}
                    placeholder={'{"sections":[ … ]}'} slotProps={{ htmlInput: { 'aria-label': 'AI 回覆' } }} />
                  {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
                </Step>
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
            <Button color="inherit" onClick={onClose}>取消</Button>
            <Button variant="contained" onClick={preview} disabled={!reply.trim() || empty || tooLong}>預覽結果</Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pb: 1 }}>
            {result.missing > 0 && <Alert severity="info" sx={{ py: 0 }}>AI 回覆少了 {result.missing} 個區塊，這些區塊保留原文{classify ? '，可能有內容重複出現，請檢查' : ''}。</Alert>}
            <NumberCheck missing={result.numbers} />
            {changedSinceCopy && <Alert severity="warning" sx={{ py: 0 }}>複製指令後，會議內容又有修改。套用會以複製當時的內容為準，之後的修改會被取代。</Alert>}
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {narrow ? (
                <>
                  <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 40, mb: 1, '& .MuiTab-root': { minHeight: 40 } }}>
                    <Tab value="before" label="原文" /><Tab value="after" label="潤飾後" />
                  </Tabs>
                  {tab === 'before' ? <Pane title="原文" doc={source} /> : <Pane title="潤飾後（預覽）" doc={result.doc} highlight />}
                </>
              ) : (
                <Stack direction="row" gap={1.5} sx={{ flex: 1, minHeight: 0 }}>
                  <Pane title="原文" doc={source} />
                  <Pane title="潤飾後（預覽）" doc={result.doc} highlight />
                </Stack>
              )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider', gap: 1, flexWrap: 'wrap' }}>
            <Typography fontSize={12.5} color="text.disabled" sx={{ mr: 'auto', display: { xs: 'none', sm: 'block' } }}>AI 可能出錯，請確認內容正確後再套用；套用後可復原</Typography>
            <Button color="inherit" startIcon={<ArrowBack />} onClick={() => setResult(null)}>重新貼上</Button>
            <Button variant="contained" startIcon={<AutoAwesomeOutlined />} onClick={apply}>套用</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
