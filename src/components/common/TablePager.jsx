// 共用表格分頁：左側筆數資訊，右側每頁筆數＋頁碼。所有列表共用，確保一致。
import { Box, MenuItem, Pagination, Select, Stack, Typography } from '@mui/material';

export function usePaged(rows, page, size) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(page, pages - 1);
  return { pageRows: rows.slice(p * size, p * size + size), pages, page: p };
}

export default function TablePager({ count, page, size, onPage, onSize, sizes = [10, 20, 50], unit = '筆' }) {
  const pages = Math.max(1, Math.ceil(count / size));
  const from = count ? page * size + 1 : 0;
  const to = Math.min(count, (page + 1) * size);
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.5}
      sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: 'divider', bgcolor: '#fcfcfd' }}>
      <Typography fontSize={13} color="text.secondary" sx={{ flex: 1, textAlign: { xs: 'center', sm: 'left' } }}>
        {count ? <>顯示第 <Box component="b" color="text.primary">{from}–{to}</Box> {unit}，共 <Box component="b" color="text.primary">{count}</Box> {unit}</> : `共 0 ${unit}`}
      </Typography>
      <Stack direction="row" alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-end' }} gap={2} flexWrap="wrap">
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography fontSize={13} color="text.secondary">每頁</Typography>
          <Select size="small" value={size} onChange={(e) => { onSize(+e.target.value); onPage(0); }} inputProps={{ 'aria-label': '每頁筆數' }}
            sx={{ fontSize: 13, height: 32, bgcolor: '#fff', '.MuiSelect-select': { py: 0.5, pl: 1.25, pr: '28px !important' } }}>
            {sizes.map((s) => <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>{s}</MenuItem>)}
          </Select>
          <Typography fontSize={13} color="text.secondary">{unit}</Typography>
        </Stack>
        {pages > 1 && (
          <Pagination count={pages} page={page + 1} onChange={(_, p) => onPage(p - 1)} shape="rounded" size="small" color="primary"
            showFirstButton={pages > 5} showLastButton={pages > 5} siblingCount={1}
            getItemAriaLabel={(type, p) => ({ page: `第 ${p} 頁`, first: '第一頁', last: '最後一頁', next: '下一頁', previous: '上一頁' }[type])}
            sx={{ '& .MuiPaginationItem-root': { fontSize: 13, minWidth: 30, height: 30, borderRadius: 1.5 }, '& .Mui-selected': { fontWeight: 600 } }} />
        )}
      </Stack>
    </Stack>
  );
}
