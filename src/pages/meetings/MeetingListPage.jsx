// 會議紀錄列表頁（後台資料表）
import { useMemo, useState } from 'react';
import {
  AvatarGroup, Box, Button, Chip, IconButton, InputAdornment, ListItemIcon, Menu, MenuItem, Paper, Stack, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Tabs, TextField, Tooltip, Typography, Skeleton,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Search from '@mui/icons-material/Search';
import MoreVert from '@mui/icons-material/MoreVert';
import OpenInNewOutlined from '@mui/icons-material/EditNoteOutlined';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import ShareDialog from '../../components/meetings/ShareDialog';
import { MEETING_TYPES, MEETING_STATUS } from '../../services/seed';
import PageHeader from '../../components/common/PageHeader';
import FilterBar from '../../components/common/FilterBar';
import { useDevice } from '../../hooks/useDevice';
import TablePager, { usePaged } from '../../components/common/TablePager';
import { AppDialog, StatusChip, UserAvatar, fmtDate, fmtRel } from '../../components/common/ui';

const TABS = [['all', '全部'], ['draft', '草稿'], ['done', '已完成'], ['archived', '已封存']];
const SORTS = [['date:desc', '日期：新到舊'], ['date:asc', '日期：舊到新'], ['updatedAt:desc', '最後修改：新到舊'], ['title:asc', '會議名稱：A → Z'], ['title:desc', '會議名稱：Z → A']];

// 手機版：每場會議一張卡片，欄位與桌面表格相同，不省略資訊
function MeetingCards({ loading, rows, users, empty, hasAny, canCreate, onNew, onOpen, onMenu }) {
  if (loading) return <Stack sx={{ borderTop: 1, borderColor: 'divider' }}>{[0, 1, 2].map((i) => <Box key={i} sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Skeleton width="70%" /><Skeleton width="40%" /><Skeleton width="55%" /></Box>)}</Stack>;
  if (empty) {
    return (
      <Box sx={{ py: 8, textAlign: 'center', borderTop: 1, borderColor: 'divider' }}>
        <EventNoteOutlined sx={{ fontSize: 36, color: 'text.disabled' }} />
        <Typography color="text.secondary" mt={1}>{hasAny ? '沒有符合條件的會議' : '尚無會議紀錄'}</Typography>
        {!hasAny && canCreate && <Button sx={{ mt: 1.5 }} variant="contained" startIcon={<Add />} onClick={onNew}>新增會議</Button>}
      </Box>
    );
  }
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider' }}>
      {rows.map((m) => {
        const h = users.find((u) => u.id === m.hostId);
        return (
          <Box component="li" key={m.id} sx={{ borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
            <Box role="button" tabIndex={0} onClick={() => onOpen(m.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(m.id); }}
              sx={{ display: 'flex', gap: 1, px: 2, py: 1.75, cursor: 'pointer', '&:active': { bgcolor: 'action.hover' } }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontWeight={600} fontSize={15} sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{m.title}</Typography>
                <Typography fontSize={12.5} color="text.disabled" noWrap>{m.location || (m.onlineUrl ? '線上會議' : '—')}</Typography>
                <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ mt: 1 }}>
                  <StatusChip status={m.status} />
                  <Chip size="small" label={m.type} variant="outlined" sx={{ borderColor: 'divider', height: 24 }} />
                  <Typography fontSize={13} color="text.secondary">{fmtDate(m.date)} {m.start}–{m.end}</Typography>
                </Stack>
                <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1 }}>
                  <UserAvatar user={h} size={22} />
                  <Typography fontSize={13} noWrap sx={{ minWidth: 0 }}>{h?.name}<Box component="span" color="text.disabled">・{m.attendeeCount + (m.guests?.length || 0)} 人參與</Box></Typography>
                  <Typography fontSize={12} color="text.disabled" sx={{ ml: 'auto', flex: 'none' }}>更新 {fmtRel(m.updatedAt)}</Typography>
                </Stack>
              </Box>
              <Box onClick={(e) => e.stopPropagation()} sx={{ flex: 'none', mr: -1, mt: -0.5 }}>
                <IconButton aria-label={`${m.title} 更多操作`} onClick={(e) => onMenu(e.currentTarget, m)}><MoreVert fontSize="small" /></IconButton>
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export default function MeetingListPage({ api, onOpenShare, meetings, loading, users, canCreate, onOpen, onNew, onSetStatus, onDelete }) {
  const { isMobile } = useDevice();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [host, setHost] = useState('');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [rpp, setRpp] = useState(10);
  const [rowMenu, setRowMenu] = useState(null); // { el, m }
  const [del, setDel] = useState(null);
  const [shareM, setShareM] = useState(null);

  const counts = useMemo(() => {
    const c = { all: 0, draft: 0, done: 0, archived: 0 };
    meetings.forEach((m) => { c[m.status]++; if (m.status !== 'archived') c.all++; });
    return c;
  }, [meetings]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const list = meetings.filter((m) =>
      (tab === 'all' ? m.status !== 'archived' : m.status === tab) &&
      (!type || m.type === type) && (!host || m.hostId === host) &&
      (!kw || m.title.toLowerCase().includes(kw) || (m.location || '').toLowerCase().includes(kw)));
    const val = (m) => (sort.key === 'date' ? m.date + m.start : sort.key === 'updatedAt' ? m.updatedAt : m.title);
    return list.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * (sort.dir === 'asc' ? 1 : -1));
  }, [meetings, tab, q, type, host, sort]);

  const { pageRows: paged, page: curPage } = usePaged(rows, page, rpp);
  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  // 權限旗標由後端列表 API 回傳
  const canManage = (m) => m.canArchive;
  const canDelete = (m) => m.canDelete;
  const resetPage = (fn) => (...a) => { fn(...a); setPage(0); };

  return (
    <Box sx={{ flex: 1, overflow: 'auto' }}>
      <PageHeader crumbs={[{ label: '會議管理' }, { label: '會議紀錄' }]} title="會議紀錄"
        subtitle="管理所有會議的基本資料與內容" />

      <Box sx={{ px: { xs: 1.5, sm: 2, md: 3 }, pb: 12 }}>
        <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
          <Tabs value={tab} onChange={resetPage((_, v) => setTab(v))} variant="scrollable"
            sx={{ px: 1.5, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 48, px: 1.5, minWidth: 0 } }}>
            {TABS.map(([k, label]) => (
              <Tab key={k} value={k} label={
                <Stack direction="row" gap={0.75} alignItems="center">{label}
                  <Chip size="small" label={counts[k]} sx={{ height: 18, fontSize: 11, bgcolor: tab === k ? 'primary.light' : 'grey.100', color: tab === k ? 'primary.dark' : 'text.secondary' }} />
                </Stack>} />
            ))}
          </Tabs>

          <FilterBar activeCount={(type ? 1 : 0) + (host ? 1 : 0)}
            search={<TextField fullWidth placeholder="搜尋會議名稱或地點" value={q} onChange={resetPage((e) => setQ(e.target.value))}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />}
            filters={[
              <TextField key="type" select fullWidth value={type} onChange={resetPage((e) => setType(e.target.value))}
                slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': '會議類型' } }}>
                <MenuItem value="">所有類型</MenuItem>
                {MEETING_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>,
              <TextField key="host" select fullWidth value={host} onChange={resetPage((e) => setHost(e.target.value))}
                slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': '主持人' } }}>
                <MenuItem value="">所有主持人</MenuItem>
                {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
              </TextField>,
              // 手機版沒有表頭可點，改用下拉選單排序
              ...(isMobile ? [
                <TextField key="sort" select fullWidth value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort({ key, dir }); }}
                  slotProps={{ htmlInput: { 'aria-label': '排序方式' } }}>
                  {SORTS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                </TextField>] : []),
            ]}
            action={canCreate && <Button variant="contained" startIcon={<Add />} onClick={onNew} sx={{ height: 40 }}>新增會議</Button>} />

          {isMobile ? (
            <MeetingCards loading={loading} rows={paged} users={users} empty={!rows.length} hasAny={meetings.length > 0} canCreate={canCreate}
              onNew={onNew} onOpen={onOpen} onMenu={(el, m) => setRowMenu({ el, m })} />
          ) : (
          <TableContainer>
            <Table size="medium" sx={{ minWidth: 880, '& th': { bgcolor: '#f9fafb', color: 'text.secondary', fontSize: 12.5, fontWeight: 600, py: 1.25, whiteSpace: 'nowrap' }, '& td': { fontSize: 13.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell><TableSortLabel active={sort.key === 'title'} direction={sort.dir} onClick={() => sortBy('title')}>會議名稱</TableSortLabel></TableCell>
                  <TableCell><TableSortLabel active={sort.key === 'date'} direction={sort.dir} onClick={() => sortBy('date')}>日期時間</TableSortLabel></TableCell>
                  <TableCell>類型</TableCell>
                  <TableCell>主持人 / 參與</TableCell>
                  <TableCell>狀態</TableCell>
                  <TableCell>
                    <TableSortLabel active={sort.key === 'updatedAt'} direction={sort.dir} onClick={() => sortBy('updatedAt')}>最後修改</TableSortLabel>
                  </TableCell>
                  <TableCell align="right" sx={{ width: 56 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && [0, 1, 2].map((i) => (
                  <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))}
                {!loading && paged.map((m) => {
                  const h = users.find((u) => u.id === m.hostId);
                  return (
                    <TableRow key={m.id} hover onClick={() => onOpen(m.id)} sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ maxWidth: 320 }}>
                        <Typography fontWeight={600} fontSize={14} noWrap>{m.title}</Typography>
                        <Typography fontSize={12} color="text.disabled" noWrap>{m.location || (m.onlineUrl ? '線上會議' : '—')}</Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(m.date)}<Typography component="div" fontSize={12} color="text.disabled">{m.start}–{m.end}</Typography>
                      </TableCell>
                      <TableCell><Chip size="small" label={m.type} variant="outlined" sx={{ borderColor: 'divider', height: 24 }} /></TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <UserAvatar user={h} size={26} />
                          <Box>
                            <Typography fontSize={13.5} noWrap>{h?.name}</Typography>
                            <Typography fontSize={12} color="text.disabled">{m.attendeeCount + (m.guests?.length || 0)} 人參與</Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell><StatusChip status={m.status} /></TableCell>
                      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{fmtRel(m.updatedAt)}</TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <IconButton size="small" aria-label="更多操作" onClick={(e) => setRowMenu({ el: e.currentTarget, m })}><MoreVert fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && !rows.length && (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ py: 8, textAlign: 'center', borderBottom: 0 }}>
                      <EventNoteOutlined sx={{ fontSize: 36, color: 'text.disabled' }} />
                      <Typography color="text.secondary" mt={1}>{meetings.length ? '沒有符合條件的會議' : '尚無會議紀錄'}</Typography>
                      {!meetings.length && canCreate && <Button sx={{ mt: 1.5 }} variant="contained" startIcon={<Add />} onClick={onNew}>新增會議</Button>}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          )}
          <TablePager count={rows.length} page={curPage} size={rpp} onPage={setPage} onSize={setRpp} />
        </Paper>
      </Box>

      <Menu anchorEl={rowMenu?.el} open={!!rowMenu} onClose={() => setRowMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={() => { const id = rowMenu.m.id; setRowMenu(null); onOpen(id); }}><ListItemIcon><OpenInNewOutlined fontSize="small" /></ListItemIcon>開啟編輯</MenuItem>
        {rowMenu?.m.canShare && <MenuItem onClick={() => { setShareM(rowMenu.m); setRowMenu(null); }}><ListItemIcon><ShareOutlined fontSize="small" /></ListItemIcon>分享</MenuItem>}
        {rowMenu && canManage(rowMenu.m) && (rowMenu.m.status === 'archived'
          ? <MenuItem onClick={() => { onSetStatus(rowMenu.m.id, 'done'); setRowMenu(null); }}><ListItemIcon><UnarchiveOutlined fontSize="small" /></ListItemIcon>取消封存</MenuItem>
          : <MenuItem onClick={() => { onSetStatus(rowMenu.m.id, 'archived'); setRowMenu(null); }}><ListItemIcon><ArchiveOutlined fontSize="small" /></ListItemIcon>封存</MenuItem>)}
        {rowMenu && canDelete(rowMenu.m) && (
          <MenuItem onClick={() => { setDel(rowMenu.m); setRowMenu(null); }} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteOutline fontSize="small" color="error" /></ListItemIcon>刪除
          </MenuItem>
        )}
      </Menu>

      {shareM && <ShareDialog open onClose={() => setShareM(null)} api={api} meetingId={shareM.id} title={shareM.title}
        onPreview={(token) => { setShareM(null); onOpenShare(token); }} />}

      <AppDialog open={!!del} title="刪除會議紀錄" onClose={() => setDel(null)}
        actions={<>
          <Button color="inherit" onClick={() => setDel(null)}>取消</Button>
          <Button variant="contained" color="error" onClick={async () => { await onDelete(del.id); setDel(null); }}>確認刪除</Button>
        </>}>
        <Typography mb={1}>確定要刪除「{del?.title}」嗎？會議內容與修改紀錄將一併刪除，此操作無法復原。</Typography>
        <Typography fontSize={13} color="text.disabled">若只是不想再看到，建議改用「封存」。</Typography>
      </AppDialog>
    </Box>
  );
}
