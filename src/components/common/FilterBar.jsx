// 列表上方的搜尋＋篩選＋主要按鈕列（所有列表共用）
// 平板／桌面：同一列排開，主要按鈕靠右。
// 手機：搜尋欄＋「篩選」按鈕一列，篩選條件可展開／收合，主要按鈕獨立一列、滿版好點擊。
import { useState } from 'react';
import { Badge, Box, Button, Collapse, Stack } from '@mui/material';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import { useDevice } from '../../hooks/useDevice';

export default function FilterBar({ search, filters = [], activeCount = 0, action }) {
  const { isMobile } = useDevice();
  const [open, setOpen] = useState(false);

  if (!isMobile) {
    return (
      <Stack direction="row" flexWrap="wrap" gap={1.25} alignItems="center" sx={{ p: 1.5 }}>
        {search && <Box sx={{ flex: '1 1 220px', maxWidth: { lg: 340 }, minWidth: 0 }}>{search}</Box>}
        {filters.map((f, i) => <Box key={i} sx={{ flex: { xs: '1 1 140px', lg: 'none' }, minWidth: 140 }}>{f}</Box>)}
        {action && <Box sx={{ flex: 'none', ml: 'auto' }}>{action}</Box>}
      </Stack>
    );
  }

  return (
    <Stack gap={1.25} sx={{ p: 1.5 }}>
      <Stack direction="row" gap={1} alignItems="stretch">
        {search && <Box sx={{ flex: 1, minWidth: 0 }}>{search}</Box>}
        {filters.length > 0 && (
          <Button variant={open ? 'contained' : 'outlined'} color={open ? 'primary' : 'inherit'} onClick={() => setOpen((x) => !x)}
            aria-expanded={open} aria-label="篩選條件"
            sx={{ flex: 'none', minWidth: 0, px: 1.5, borderColor: 'divider', color: open ? undefined : 'text.secondary' }}
            startIcon={<Badge color="primary" variant="dot" invisible={!activeCount || open}><TuneOutlined fontSize="small" /></Badge>}>
            篩選{activeCount ? `（${activeCount}）` : ''}
          </Button>
        )}
      </Stack>
      {filters.length > 0 && (
        <Collapse in={open} unmountOnExit>
          <Stack gap={1.25}>{filters.map((f, i) => <Box key={i}>{f}</Box>)}</Stack>
        </Collapse>
      )}
      {action && <Box sx={{ '& > .MuiButton-root': { width: '100%', height: 44 } }}>{action}</Box>}
    </Stack>
  );
}
