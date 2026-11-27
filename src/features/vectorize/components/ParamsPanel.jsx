// 向量化參數面板（只負責編輯參數，不含運算邏輯）。
import { useEffect, useState } from 'react';
import {
  Box, Chip, Divider, FormControlLabel, MenuItem, Select, Slider, Stack, Switch, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { MAX_SIZES, MODES, PRESETS } from '../engine/params';

function Section({ title, children }) {
  return (
    <Box sx={{ px: 2, py: 1.75 }}>
      {title && <Typography fontSize={12} fontWeight={600} color="text.disabled" mb={1}>{title}</Typography>}
      {children}
    </Box>
  );
}

// 拖曳時只更新畫面，放開後才送出（避免拖曳過程中重複運算）
function ParamSlider({ label, hint, value, onCommit, min = 0, max = 100, step = 1, format = (v) => v, disabled, marks, normalize = (x) => x }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const id = `vz-${label}`;
  return (
    <Box sx={{ mb: 1.25 }}>
      <Stack direction="row" alignItems="center" gap={0.5}>
        <Typography id={id} fontSize={13.5} fontWeight={500} color={disabled ? 'text.disabled' : 'text.primary'}>{label}</Typography>
        {hint && <Tooltip title={hint}><InfoOutlined sx={{ fontSize: 15, color: 'text.disabled' }} /></Tooltip>}
        <Box flex={1} />
        <Typography fontSize={13} color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{format(v)}</Typography>
      </Stack>
      <Slider size="small" value={v} min={min} max={max} step={step} marks={marks} disabled={disabled}
        onChange={(_, x) => setV(normalize(x))} onChangeCommitted={(_, x) => normalize(x) !== value && onCommit(normalize(x))}
        slotProps={{ input: { 'aria-labelledby': id } }} sx={{ mt: -0.25, py: 1.25 }} />
    </Box>
  );
}

function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <FormControlLabel disabled={disabled} sx={{ mx: 0, width: '100%', justifyContent: 'space-between', '& .MuiFormControlLabel-label': { fontSize: 13.5 } }}
      labelPlacement="start"
      label={<Stack direction="row" alignItems="center" gap={0.5}>{label}{hint && <Tooltip title={hint}><InfoOutlined sx={{ fontSize: 15, color: 'text.disabled' }} /></Tooltip>}</Stack>}
      control={<Switch size="small" checked={checked} onChange={(e) => onChange(e.target.checked)} />} />
  );
}

export default function ParamsPanel({ params, onChange, result, image }) {
  const set = (patch) => onChange({ ...params, ...patch });
  const activePreset = PRESETS.find((p) => Object.entries(p.params).every(([k, v]) => params[k] === v))?.key || '';
  const scaled = image && Math.max(image.width, image.height) > params.maxSize;

  return (
    <Box>
      <Section title="快速預設">
        <Stack direction="row" flexWrap="wrap" gap={0.75}>
          {PRESETS.map((p) => (
            <Chip key={p.key} label={p.label} size="small" clickable onClick={() => set(p.params)}
              color={activePreset === p.key ? 'primary' : 'default'} variant={activePreset === p.key ? 'filled' : 'outlined'}
              sx={{ borderColor: 'divider' }} />
          ))}
        </Stack>
      </Section>
      <Divider />

      <Section title="色彩模式">
        <ToggleButtonGroup fullWidth size="small" exclusive value={params.mode} onChange={(_, v) => v && set({ mode: v })} aria-label="色彩模式">
          {Object.entries(MODES).map(([k, v]) => <ToggleButton key={k} value={k} sx={{ fontSize: 13, py: 0.6 }}>{v}</ToggleButton>)}
        </ToggleButtonGroup>
        <Box mt={1.75}>
          {params.mode === 'color' && (
            <>
              <ParamSlider label="顏色數量" hint="輸出 SVG 使用的顏色數。數量越少越簡潔，越多越接近原圖。"
                value={params.colors || 0} min={0} max={64} normalize={(x) => (x === 1 ? 2 : x)} onCommit={(v) => set({ colors: v })}
                format={(v) => (v === 0 ? '自動' : `${v} 色`)} />
              {params.colors === 0 && <Typography fontSize={12} color="text.disabled" mt={-0.75} mb={1}>自動：由引擎依細節程度合併相近顏色</Typography>}
            </>
          )}
          {params.mode === 'gray' && (
            <ParamSlider label="灰階層數" value={params.grays} min={2} max={32} onCommit={(v) => set({ grays: v })} format={(v) => `${v} 階`} />
          )}
          {params.mode === 'bw' && (
            <>
              <Toggle label="自動判斷黑白分界" hint="以 Otsu 演算法依圖片亮度分布自動決定" checked={params.autoThreshold} onChange={(v) => set({ autoThreshold: v, ...(!v && result?.info?.threshold ? { threshold: result.info.threshold } : {}) })} />
              <ParamSlider label="黑白閾值" hint="亮度低於此值的區域會變成黑色" disabled={params.autoThreshold}
                value={params.autoThreshold && result?.info?.threshold ? result.info.threshold : params.threshold} min={1} max={254}
                onCommit={(v) => set({ threshold: v })} />
            </>
          )}
        </Box>
        {result?.info?.palette?.length > 0 && params.mode !== 'bw' && (
          <Box mt={0.5}>
            <Typography fontSize={12} color="text.disabled" mb={0.75}>使用的顏色（{result.info.palette.length}）</Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5} aria-label="使用的顏色">
              {result.info.palette.map((c) => (
                <Tooltip key={c} title={c.toUpperCase()}>
                  <Box sx={{ width: 18, height: 18, borderRadius: 0.75, bgcolor: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />
                </Tooltip>
              ))}
            </Stack>
          </Box>
        )}
      </Section>
      <Divider />

      <Section title="描圖">
        <ParamSlider label="細節程度" hint="越高保留越多細小形狀；越低越簡化。" value={params.detail} onCommit={(v) => set({ detail: v })} />
        <ParamSlider label="輪廓平滑" hint="0 為直線多邊形；越高曲線越平滑、節點越少。" value={params.smooth} onCommit={(v) => set({ smooth: v })} />
        <ParamSlider label="雜訊去除" hint="先模糊去除雜點，再移除過小的色塊。照片或掃描圖可調高。" value={params.noise} onCommit={(v) => set({ noise: v })} />
      </Section>
      <Divider />

      <Section title="背景">
        <Toggle label="保留透明背景" hint="透明區域不產生路徑；關閉時以白色背景處理" checked={params.transparent} onChange={(v) => set({ transparent: v })} />
        <Toggle label="忽略白色" hint="把接近白色的區域當作背景移除（適合白底的標誌）" disabled={params.mode === 'bw'}
          checked={params.mode !== 'bw' && params.ignoreWhite} onChange={(v) => set({ ignoreWhite: v })} />
      </Section>
      <Divider />

      <Section title="效能">
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography fontSize={13.5} flex={1}>最大處理尺寸</Typography>
          <Select size="small" value={params.maxSize} onChange={(e) => set({ maxSize: e.target.value })} inputProps={{ 'aria-label': '最大處理尺寸' }}
            sx={{ fontSize: 13, '& .MuiSelect-select': { py: 0.6 } }}>
            {MAX_SIZES.map((s) => <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>{s} px</MenuItem>)}
          </Select>
        </Stack>
        <Typography fontSize={12} color="text.disabled" mt={0.75}>
          {scaled
            ? `原圖 ${image.width}×${image.height}，會先等比例縮小到最長邊 ${params.maxSize} px 再描圖；輸出 SVG 仍維持原圖尺寸與比例。`
            : '超過此尺寸的圖片會自動等比例縮小後再處理，輸出仍維持原圖尺寸與比例。'}
        </Typography>
      </Section>
    </Box>
  );
}
