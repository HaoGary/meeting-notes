// 文件工具 › 圖片向量化：PNG / JPG / WEBP → SVG（VTracer + WebAssembly，於瀏覽器內的 Web Worker 執行）。
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, FormControlLabel, LinearProgress, Stack, Switch, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import PageHeader from '../../components/common/PageHeader';
import { useToast } from '../../components/common/ui';
import CompareViewer from '../../features/vectorize/components/CompareViewer';
import ParamsPanel from '../../features/vectorize/components/ParamsPanel';
import { DEFAULT_PARAMS, MAX_SIZES, MODES } from '../../features/vectorize/engine/params';
import { ACCEPT, MAX_FILE_MB, loadImageFile, releaseImage } from '../../features/vectorize/engine/image';
import { STAGES, VectorizerClient } from '../../features/vectorize/engine/VectorizerClient';

const fmtBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${Math.max(0.1, b / 1024).toFixed(1)} KB`);
const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} 秒` : `${Math.round(ms)} ms`);
const PARAMS_KEY = 'mn-vectorize-params';

// 讀回上次的參數：只接受型別正確、在範圍內的值（舊版或被竄改的資料一律改用預設）
function loadParams() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PARAMS_KEY) || '{}') || {}; } catch { /* 使用預設 */ }
  const num = (v, lo, hi, d) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : d);
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const D = DEFAULT_PARAMS;
  return {
    mode: Object.keys(MODES).includes(saved.mode) ? saved.mode : D.mode,
    colors: num(saved.colors, 0, 64, D.colors) === 1 ? 2 : num(saved.colors, 0, 64, D.colors),
    grays: num(saved.grays, 2, 32, D.grays),
    threshold: num(saved.threshold, 1, 254, D.threshold),
    autoThreshold: bool(saved.autoThreshold, D.autoThreshold),
    detail: num(saved.detail, 0, 100, D.detail),
    smooth: num(saved.smooth, 0, 100, D.smooth),
    noise: num(saved.noise, 0, 100, D.noise),
    transparent: bool(saved.transparent, D.transparent),
    ignoreWhite: bool(saved.ignoreWhite, D.ignoreWhite),
    maxSize: MAX_SIZES.includes(saved.maxSize) ? saved.maxSize : D.maxSize,
  };
}

function DropZone({ onPick, dragging }) {
  return (
    <Box role="button" tabIndex={0} onClick={onPick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick())}
      aria-label="選擇或拖曳圖片"
      sx={{ flex: 1, minHeight: 320, m: { xs: 1.5, md: 3 }, borderRadius: 3, border: '2px dashed', borderColor: dragging ? 'primary.main' : 'divider',
        bgcolor: dragging ? 'primary.light' : 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        cursor: 'pointer', transition: 'all .15s', '&:hover, &:focus-visible': { borderColor: 'primary.main', outline: 'none' } }}>
      <Stack alignItems="center" gap={1.25} px={3}>
        <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: 'primary.light', color: 'primary.main', display: 'grid', placeItems: 'center' }}>
          <UploadFileOutlined />
        </Box>
        <Typography fontWeight={600} fontSize={16}>拖曳圖片到這裡，或點擊選擇檔案</Typography>
        <Typography fontSize={13} color="text.secondary">支援 PNG、JPG、WEBP，單檔 {MAX_FILE_MB} MB 以內。也可以直接貼上（Ctrl / ⌘ + V）</Typography>
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: 'text.disabled', fontSize: 12, mt: 0.5 }}>
          <LockOutlined sx={{ fontSize: 14 }} />圖片只在你的瀏覽器中處理，不會上傳到任何伺服器
        </Stack>
      </Stack>
    </Box>
  );
}

export default function VectorizePage() {
  const toast = useToast();
  const clientRef = useRef(null);
  if (!clientRef.current) clientRef.current = new VectorizerClient();
  const client = clientRef.current;

  const [image, setImage] = useState(null);
  const [params, setParams] = useState(loadParams);
  const [autoRun, setAutoRun] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [job, setJob] = useState(null); // { stage, pct, started }
  const [elapsed, setElapsed] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [layout, setLayout] = useState('split');
  const [stale, setStale] = useState(false);
  const fileInput = useRef(null);
  const imageRef = useRef(null);
  imageRef.current = image;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => () => client.dispose(), [client]);
  // 換圖或離開頁面時才釋放舊圖片（先換上新圖再釋放，預覽不會閃出破圖）
  useEffect(() => () => releaseImage(image), [image]);
  useEffect(() => { try { localStorage.setItem(PARAMS_KEY, JSON.stringify(params)); } catch {} }, [params]);

  // 處理中顯示經過時間
  useEffect(() => {
    if (!job) return undefined;
    const t = setInterval(() => setElapsed(performance.now() - job.started), 100);
    return () => clearInterval(t);
  }, [job]);

  const run = useCallback(async (img, p) => {
    if (!img) return;
    setError(null);
    const current = () => img === imageRef.current; // 結果回來時圖片可能已經更換
    const hit = client.cached(img, p);
    if (hit) { if (client.pending) client.cancel(); setJob(null); setResult({ ...hit, cached: true }); setStale(false); return; }
    const started = performance.now();
    setJob({ stage: 'init', pct: 2, started });
    setElapsed(0);
    try {
      const r = await client.run(img, p, { onProgress: (stage, pct) => setJob((j) => j && { ...j, stage, pct }) });
      if (!current()) return;
      setResult(r);
      setStale(false);
      setJob(null);
    } catch (e) {
      if (e.code === 'CANCELLED' || !current()) return; // 取消或被新的工作取代：由發起者處理狀態
      setJob(null);
      setError(e.message || '轉換失敗');
    }
  }, [client]);

  const cancel = () => {
    if (client.cancel()) { setJob(null); toast('已取消轉換', 'info'); setStale(true); }
  };

  const openFile = async (file) => {
    if (job) client.cancel();
    setJob(null);
    try {
      const img = await loadImageFile(file);
      imageRef.current = img;
      setImage(img);
      setResult(null);
      setError(null);
      setStale(false);
      run(img, paramsRef.current);
    } catch (e) {
      // 已有圖片時保留目前的結果，只提示這個檔案無法使用
      if (imageRef.current) toast(e.message, 'error'); else setError(e.message);
    }
  };

  // 參數變更：自動更新時延遲執行（連續調整只算最後一次）；否則標示需要重新產生
  const firstParams = useRef(true);
  useEffect(() => {
    if (firstParams.current) { firstParams.current = false; return undefined; }
    if (!image) return undefined;
    if (!autoRun) { setStale(!client.cached(image, params)); return undefined; }
    // 計時器觸發時讀取「當下」的圖片與參數，避免期間換圖後又用舊圖重算
    const t = setTimeout(() => run(imageRef.current, paramsRef.current), 350);
    return () => clearTimeout(t);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // 重新開啟自動更新時，若結果已過期就立即更新
  useEffect(() => {
    if (autoRun && stale && imageRef.current && !client.pending) run(imageRef.current, paramsRef.current);
  }, [autoRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // 拖曳上傳（整個頁面）與貼上
  useEffect(() => {
    const onPaste = (e) => {
      const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); openFile(f); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
  const dropHandlers = {
    onDragOver: (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDragging(true); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); },
    onDrop: (e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) openFile(f); },
  };

  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${image.name}.svg` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.svg); toast('已複製 SVG 程式碼'); } catch { toast('無法存取剪貼簿', 'error'); }
  };

  const busy = !!job;
  const s = result?.stats;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: { xs: 'auto', md: 'hidden' } }} {...dropHandlers}>
      <PageHeader crumbs={[{ label: '文件工具' }, { label: '圖片向量化' }]} title="圖片向量化"
        subtitle="把 PNG、JPG、WEBP 轉成可編輯的 SVG 向量圖，可在 Illustrator、Figma 開啟。所有處理都在瀏覽器內完成。"
        actions={image && (
          <>
            <Button variant="outlined" color="inherit" startIcon={<ImageOutlined />} onClick={() => fileInput.current?.click()}
              sx={{ borderColor: 'divider', display: { xs: 'none', sm: 'inline-flex' } }}>更換圖片</Button>
            <Button variant="contained" startIcon={<FileDownloadOutlined />} disabled={!result || busy} onClick={download}>下載 SVG</Button>
          </>
        )} />
      <input ref={fileInput} type="file" hidden accept={ACCEPT.join(',')} data-testid="vectorize-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openFile(f); }} />

      {!image ? (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {error && <Alert severity="error" sx={{ mx: { xs: 1.5, md: 3 } }} onClose={() => setError(null)}>{error}</Alert>}
          <DropZone onPick={() => fileInput.current?.click()} dragging={dragging} />
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, borderTop: 1, borderColor: 'divider' }}>
          {/* 預覽區 */}
          <Box sx={{ position: 'relative', flex: 1, minWidth: 0, minHeight: { xs: '62vh', md: 0 }, display: 'flex', flexDirection: 'column', order: { xs: 0, md: 1 } }}>
            {dragging && (
              <Box sx={{ position: 'absolute', inset: 8, zIndex: 5, border: '2px dashed', borderColor: 'primary.main', borderRadius: 2, bgcolor: 'rgba(238,242,255,.85)',
                display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                <Typography fontWeight={600} color="primary.main">放開以更換圖片</Typography>
              </Box>
            )}
            {/* 狀態列 */}
            <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 2, minHeight: 48, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexWrap: 'wrap' }}>
              <Typography fontSize={13.5} fontWeight={600} noWrap sx={{ minWidth: 0, maxWidth: { xs: '100%', sm: 260 } }} title={image.name}>{image.name}</Typography>
              <Typography fontSize={12.5} color="text.disabled">{image.width}×{image.height}</Typography>
              <Box flex={1} />
              <ToggleButtonGroup size="small" exclusive value={layout} onChange={(_, v) => v && setLayout(v)} aria-label="預覽版面"
                sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.25, fontSize: 12.5 } }}>
                <ToggleButton value="split">左右比較</ToggleButton>
                <ToggleButton value="original">原圖</ToggleButton>
                <ToggleButton value="svg">SVG</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            {busy && <LinearProgress variant="determinate" value={job.pct} sx={{ height: 3 }} aria-label="轉換進度" />}

            <CompareViewer originalUrl={image.url} svg={result?.svg} width={image.width} height={image.height} busy={busy} layout={layout}
              emptySvg={(busy || !error) && (
                <Stack alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0, color: 'text.disabled', gap: 1, pointerEvents: 'none' }}>
                  {busy ? <><CircularProgress size={28} /><Typography fontSize={13}>產生中…</Typography></>
                    : <Typography fontSize={13}>已取消轉換，按「重新產生」再試一次</Typography>}
                </Stack>
              )} />

            {/* 進度 / 結果資訊 */}
            <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', minHeight: 48, display: 'flex', alignItems: 'center' }}>
              {busy ? (
                <Stack direction="row" alignItems="center" gap={1.5} sx={{ width: '100%' }} role="status" aria-live="polite">
                  <CircularProgress size={16} />
                  <Typography fontSize={13}>{STAGES[job.stage] || '處理中'}…</Typography>
                  <Typography fontSize={13} color="text.disabled" sx={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(job.pct)}% · {fmtMs(elapsed)}</Typography>
                  <Button size="small" variant="outlined" color="inherit" onClick={cancel} sx={{ borderColor: 'divider', color: 'text.secondary', py: 0, minWidth: 0, px: 1.25 }}>取消</Button>
                </Stack>
              ) : error ? (
                <Alert severity="error" sx={{ py: 0, width: '100%' }} action={<Button size="small" color="inherit" onClick={() => run(image, params)}>重試</Button>}>{error}</Alert>
              ) : s ? (
                <Stack direction="row" alignItems="center" columnGap={2} rowGap={0.5} flexWrap="wrap" sx={{ width: '100%', fontSize: 12.5, color: 'text.secondary' }} data-testid="vectorize-stats">
                  <span>路徑 <b>{s.paths}</b></span>
                  <span>顏色 <b>{s.colors}</b></span>
                  <span>節點 <b>{s.nodes.toLocaleString()}</b></span>
                  <Tooltip title={`最佳化前 ${fmtBytes(s.rawBytes)}，SVGO 精簡 ${Math.max(0, Math.round((1 - s.bytes / s.rawBytes) * 100))}%`}>
                    <span>大小 <b>{fmtBytes(s.bytes)}</b></span>
                  </Tooltip>
                  {result.scaled && <span>處理尺寸 {result.width}×{result.height}</span>}
                  <Tooltip title={result.cached ? '參數與先前相同，直接使用已產生的結果'
                    : `前處理 ${fmtMs(result.timings.preprocess)}・描圖 ${fmtMs(result.timings.trace)}・最佳化 ${fmtMs(result.timings.optimize)}`}>
                    <span>處理時間 <b>{fmtMs(result.timings.total)}</b>{result.cached && '（快取）'}</span>
                  </Tooltip>
                  <Box flex={1} />
                  {stale && <Typography fontSize={12.5} color="warning.main">參數已變更</Typography>}
                  <Tooltip title="複製 SVG 程式碼"><Button size="small" color="inherit" startIcon={<ContentCopyOutlined sx={{ fontSize: '16px !important' }} />} onClick={copy} sx={{ color: 'text.secondary' }}>複製</Button></Tooltip>
                </Stack>
              ) : null}
            </Box>
          </Box>

          {/* 參數面板 */}
          <Box sx={{ width: { xs: '100%', md: 300 }, flex: 'none', borderRight: { md: 1 }, borderTop: { xs: 1, md: 0 }, borderColor: { xs: 'divider', md: 'divider' },
            bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', minHeight: 0, order: { xs: 1, md: 0 } }}>
            <Box sx={{ flex: 1, overflowY: { md: 'auto' } }}>
              <ParamsPanel params={params} onChange={setParams} result={result} image={image} />
            </Box>
            <Divider />
            <Stack gap={1} sx={{ p: 2 }}>
              <FormControlLabel sx={{ mx: 0, justifyContent: 'space-between', '& .MuiFormControlLabel-label': { fontSize: 13.5 } }} labelPlacement="start"
                label="調整參數後自動更新" control={<Switch size="small" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />} />
              <Stack direction="row" gap={1}>
                <Button fullWidth variant={stale && !autoRun ? 'contained' : 'outlined'} startIcon={<RefreshOutlined />} disabled={busy} onClick={() => run(image, params)}>
                  重新產生
                </Button>
                <Button color="inherit" onClick={() => setParams(DEFAULT_PARAMS)} sx={{ color: 'text.secondary', flex: 'none' }}>重設</Button>
              </Stack>
              <Button variant="outlined" color="inherit" startIcon={<ImageOutlined />} onClick={() => fileInput.current?.click()}
                sx={{ borderColor: 'divider', display: { sm: 'none' } }}>更換圖片</Button>
            </Stack>
          </Box>
        </Box>
      )}
    </Box>
  );
}
