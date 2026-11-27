// 「依內容分類到各區塊」開關（AI 潤飾兩種模式共用）
import { Box, FormControlLabel, Switch, Typography } from '@mui/material';

export default function ClassifyToggle({ checked, onChange, disabled }) {
  return (
    <FormControlLabel sx={{ alignItems: 'flex-start', ml: 0, mr: 0, gap: 1 }} disabled={disabled}
      control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} sx={{ mt: -0.5 }} />}
      label={
        <Box>
          <Typography fontSize={14} fontWeight={600}>依內容分類到各區塊</Typography>
          <Typography fontSize={12.5} color="text.secondary">討論、決議、待辦自動歸位，適合語音逐字稿。</Typography>
        </Box>
      } />
  );
}

// 數字檢查提示：原文中的數字在結果裡找不到時提醒
export function NumberCheck({ missing }) {
  if (!missing?.length) return null;
  return (
    <Typography component="div" fontSize={13} sx={{ px: 1.5, py: 1, borderRadius: 1.5, bgcolor: '#fffbeb', color: 'warning.dark', border: 1, borderColor: '#fde68a' }}>
      請確認：以下數字在潤飾後找不到，可能被 AI 改寫或遺漏——{missing.slice(0, 8).join('、')}{missing.length > 8 ? ` 等 ${missing.length} 個` : ''}
    </Typography>
  );
}
