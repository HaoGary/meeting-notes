// AI 向量化（Recraft）面板：說明、今日額度、執行按鈕；有「權限管理」者可調整每日上限。
import { useState } from 'react';
import { Alert, Box, Button, Divider, InputBase, LinearProgress, Stack, Typography } from '@mui/material';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';

export default function AiPanel({ quota, busy, done, onRun, onSetLimit, image, aiSize }) {
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const remaining = quota?.remaining ?? 0;
  const pct = quota?.limit ? Math.min(100, (quota.used / quota.limit) * 100) : 100;

  const save = async () => {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 0 || n > 1000) return setErr('請輸入 0–1000 的整數');
    setSaving(true); setErr('');
    try { await onSetLimit(n); setEditing(false); } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Box>
      <Box sx={{ px: 2, py: 1.75 }}>
        <Stack direction="row" alignItems="center" gap={0.75} mb={0.75}>
          <AutoAwesomeOutlined sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography fontSize={14} fontWeight={600}>Recraft AI 向量化</Typography>
        </Stack>
        <Typography fontSize={12.5} color="text.secondary" lineHeight={1.7}>
          由 Recraft 的 AI 描圖，線條與曲線通常比本機引擎乾淨，適合標誌、圖示與插畫。AI 模式沒有參數可調。
        </Typography>
        <Alert severity="info" icon={<CloudUploadOutlined fontSize="small" />} sx={{ mt: 1.25, py: 0.25, fontSize: 12.5, '& .MuiAlert-message': { py: 0.75 } }}>
          圖片會上傳到 Recraft 處理，並開啟零資料保留（Recraft 不保存圖片與結果）。
        </Alert>
      </Box>
      <Divider />

      <Box sx={{ px: 2, py: 1.75 }}>
        <Stack direction="row" alignItems="baseline" gap={1}>
          <Typography fontSize={13.5} flex={1}>今日剩餘次數</Typography>
          <Typography fontSize={20} fontWeight={700} color={remaining ? 'text.primary' : 'error.main'} sx={{ fontVariantNumeric: 'tabular-nums' }} data-testid="ai-remaining">
            {quota ? remaining : '—'}
          </Typography>
          <Typography fontSize={13} color="text.disabled">/ {quota?.limit ?? '—'} 次</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={pct} color={remaining ? 'primary' : 'error'} sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: 'action.hover' }} />
        <Typography fontSize={12} color="text.disabled" mt={0.75}>每人每日上限，台北時間午夜重置；轉換失敗不計次。同一張圖轉換後不會重複計費。</Typography>

        {quota?.canConfigure && (
          editing ? (
            <Box mt={1.25}>
              <Stack direction="row" gap={0.75} alignItems="center">
                <InputBase autoFocus value={limit} onChange={(e) => { setLimit(e.target.value.replace(/\D/g, '')); setErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                  inputProps={{ 'aria-label': '每人每日上限', inputMode: 'numeric', maxLength: 4 }}
                  sx={{ width: 90, fontSize: 14, height: 32, px: 1, borderRadius: 1.5, border: 1, borderColor: err ? 'error.main' : 'primary.main' }} />
                <Typography fontSize={13} color="text.secondary">次／人／日</Typography>
                <Box flex={1} />
                <Button size="small" variant="contained" disableElevation disabled={saving} onClick={save}>儲存</Button>
                <Button size="small" color="inherit" onClick={() => { setEditing(false); setErr(''); }} sx={{ color: 'text.secondary', minWidth: 0 }}>取消</Button>
              </Stack>
              {err && <Typography fontSize={12} color="error" mt={0.5}>{err}</Typography>}
              <Typography fontSize={12} color="text.disabled" mt={0.5}>標準版每次 US$0.01。設為 0 可暫停所有人使用。</Typography>
            </Box>
          ) : (
            <Button size="small" sx={{ mt: 1, px: 0, minWidth: 0 }} onClick={() => { setLimit(String(quota.limit)); setEditing(true); }}>調整每日上限</Button>
          )
        )}
      </Box>
      <Divider />

      <Box sx={{ px: 2, py: 1.75 }}>
        <Button fullWidth variant="contained" size="large" startIcon={<AutoAwesomeOutlined />} disabled={!image || busy || done || !quota || remaining <= 0} onClick={onRun}>
          {done ? '已完成 AI 轉換' : busy ? '轉換中…' : 'AI 轉換（使用 1 次）'}
        </Button>
        {aiSize && (
          <Typography fontSize={12} color="text.disabled" mt={0.75}>
            {aiSize.scaled ? `會以 ${aiSize.width}×${aiSize.height} 送出（Recraft 限制每邊 256–4096 px），輸出仍維持原圖尺寸。` : `以原圖尺寸 ${aiSize.width}×${aiSize.height} 送出。`}
          </Typography>
        )}
        {quota && remaining <= 0 && !done && <Typography fontSize={12.5} color="error" mt={0.75}>今天的次數已用完，可切換回「本機」引擎繼續轉換。</Typography>}
      </Box>
    </Box>
  );
}
