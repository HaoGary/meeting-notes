// 會議基本資料：屬性清單式排版（標籤在左、值在右），無外框輸入，降低視覺密度。
import { useState } from 'react';
import { AvatarGroup, Box, Button, Chip, Divider, IconButton, InputBase, ListSubheader, Menu, MenuItem, Select, Stack, Tooltip, Typography } from '@mui/material';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Add from '@mui/icons-material/Add';
import OpenInNew from '@mui/icons-material/OpenInNew';
import EventOutlined from '@mui/icons-material/EventOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import PersonOutline from '@mui/icons-material/PersonOutline';
import CategoryOutlined from '@mui/icons-material/CategoryOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import { MEETING_TYPES } from '../../services/seed';
import { UserAvatar, fmtDate, guestUser, hostOf } from '../common/ui';
import { DateInput, TimeInput } from '../common/pickers';
import ArrowForward from '@mui/icons-material/ArrowForward';

// 選人選單：輸入框可搜尋，也可新增外部成員；下方分「外部成員」（統一名單）與「系統成員」
function PersonPicker({ anchorEl, onClose, members, externals = [], onPickUser, onPickName, existing = [] }) {
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const close = () => { setQ(''); setErr(''); onClose(); };
  const kw = q.trim();
  const low = kw.toLowerCase();
  const extList = externals.filter((n) => !existing.includes(n) && (!low || n.toLowerCase().includes(low)));
  const memList = members.filter((u) => !low || u.name.toLowerCase().includes(low));
  const exact = kw && (externals.some((n) => n.toLowerCase() === low) || members.some((u) => u.name.toLowerCase() === low) || existing.some((n) => n.toLowerCase() === low));
  const pickName = (n) => {
    if (existing.some((x) => x.toLowerCase() === n.toLowerCase())) return setErr('已在名單中');
    onPickName(n); close();
  };
  const create = () => {
    if (!kw) return;
    if (kw.length > 40) return setErr('名字最多 40 個字');
    pickName(kw);
  };
  const onEnter = () => {
    if (!kw) return;
    const ext = externals.find((n) => n.toLowerCase() === low);
    const mem = members.find((u) => u.name.toLowerCase() === low);
    if (mem) { onPickUser(mem); close(); }
    else if (ext) pickName(ext);
    else create();
  };
  const head = (t) => <ListSubheader sx={{ lineHeight: '32px', fontSize: 12, bgcolor: 'background.paper' }}>{t}</ListSubheader>;
  return (
    <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={close} autoFocus={false}
      slotProps={{ paper: { sx: { width: 280, maxWidth: 'calc(100vw - 32px)', maxHeight: 420 } } }} MenuListProps={{ sx: { pt: 0 } }}>
      <Box sx={{ px: 1.5, pt: 1.5, pb: 1, position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper' }} onKeyDown={(e) => { if (e.key !== 'Escape' && e.key !== 'ArrowDown') e.stopPropagation(); }}>
        <InputBase autoFocus fullWidth value={q} placeholder="搜尋，或輸入新的外部成員名字" onChange={(e) => { setQ(e.target.value); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); onEnter(); } }}
          inputProps={{ 'aria-label': '搜尋或輸入名字', maxLength: 40 }}
          sx={{ fontSize: 14, height: 34, px: 1, borderRadius: 1.5, border: 1, borderColor: err ? 'error.main' : 'divider', '&.Mui-focused': { borderColor: err ? 'error.main' : 'primary.main' } }} />
        {err && <Typography fontSize={12} color="error" mt={0.5}>{err}</Typography>}
      </Box>
      {kw && !exact && (
        <MenuItem onClick={create} sx={{ gap: 1, color: 'primary.main' }}>
          <Add sx={{ fontSize: 20 }} />
          <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>新增外部成員「{kw}」</Box>
        </MenuItem>
      )}
      {extList.length > 0 && head('外部成員')}
      {extList.map((n) => (
        <MenuItem key={`e-${n}`} onClick={() => pickName(n)} sx={{ gap: 1 }}>
          <UserAvatar user={guestUser(n)} size={22} />{n}
          <Box component="span" sx={{ ml: 'auto', fontSize: 11.5, color: 'text.disabled' }}>外部</Box>
        </MenuItem>
      ))}
      {memList.length > 0 && head('系統成員')}
      {memList.map((u) => (
        <MenuItem key={u.id} onClick={() => { onPickUser(u); close(); }} sx={{ gap: 1 }}>
          <UserAvatar user={u} size={22} />{u.name}
        </MenuItem>
      ))}
      {kw && exact && !extList.length && !memList.length && (
        <Typography fontSize={13} color="text.disabled" sx={{ px: 2, py: 1 }}>已在名單中</Typography>
      )}
    </Menu>
  );
}

const fieldSx = {
  fontSize: 14, borderRadius: 1.5, px: 1, height: 32, transition: 'background .12s',
  '&:hover:not(.Mui-disabled)': { bgcolor: 'action.hover' },
  '&.Mui-focused': { bgcolor: 'background.default', boxShadow: (t) => `inset 0 0 0 1px ${t.palette.primary.main}` },
  '& .Mui-disabled': { WebkitTextFillColor: 'inherit !important', color: 'text.primary' },
  '& input::placeholder': { color: 'text.disabled', opacity: 1 },
};
const selectSx = { ...fieldSx, px: 0, '& .MuiSelect-select': { py: 0, pl: 1, display: 'flex', alignItems: 'center', gap: 1 }, '& .MuiSelect-icon': { opacity: 0, transition: '.12s' }, '&:hover .MuiSelect-icon': { opacity: 1 } };

function Prop({ icon: I, label, children, error, wide }) {
  return (
    <Stack direction="row" alignItems="flex-start" sx={{ minHeight: 36, gridColumn: wide ? '1 / -1' : undefined }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ width: 104, flex: 'none', height: 32, color: 'text.secondary', fontSize: 13 }}>
        <I sx={{ fontSize: 17, color: 'text.disabled' }} />{label}
      </Stack>
      <Box flex={1} minWidth={0}>
        {children}
        {error && <Typography fontSize={12} color="error" sx={{ pl: 1 }}>{error}</Typography>}
      </Box>
    </Stack>
  );
}

export default function MeetingMeta({ meeting, attendees, users, externals = [], onAddExternal, editable, onChange, onAttendees, collapsed = false, onToggle }) {
  const [addEl, setAddEl] = useState(null);
  const [hostEl, setHostEl] = useState(null);
  const guests = meeting.guests || [];
  const host = hostOf(meeting, users);
  const removeGuest = (g) => onChange({ guests: guests.filter((x) => x !== g) });
  const userOf = (id) => users.find((u) => u.id === id);
  const set = (k) => (e) => onChange({ [k]: e.target.value });
  const ro = !editable;
  const timeBad = meeting.start && meeting.end && meeting.end <= meeting.start;
  const notIn = users.filter((u) => !attendees.some((a) => a.userId === u.id));
  const togglePerm = (uid) => onAttendees(attendees.map((a) => a.userId === uid ? { ...a, permission: a.permission === 'editor' ? 'viewer' : 'editor' } : a));
  const remove = (uid) => onAttendees(attendees.filter((a) => a.userId !== uid));
  const urlOk = /^https?:\/\//.test(meeting.onlineUrl);

  // 收合時：一行摘要（日期時間、地點、主持人、參與人數），點擊即可展開
  if (collapsed) {
    const sep = <Box component="span" sx={{ color: 'divider', display: { xs: 'none', sm: 'inline' } }}>·</Box>;
    return (
      <Stack direction="row" alignItems="center" gap={1.25} onClick={onToggle} role="button" tabIndex={0} aria-expanded={false} aria-label="展開會議資料"
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())}
        sx={{ px: { xs: 2, md: 3 }, py: 0.75, minHeight: 44, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', cursor: 'pointer',
          '&:hover': { bgcolor: '#fafafb' }, '&:hover .meta-toggle': { color: 'primary.main' } }}>
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'text.secondary', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <Stack direction="row" alignItems="center" gap={0.75}><EventOutlined sx={{ fontSize: 16, color: 'text.disabled' }} />{fmtDate(meeting.date)} {meeting.start}–{meeting.end}</Stack>
          {meeting.location && <>{sep}<Stack direction="row" alignItems="center" gap={0.5} sx={{ display: { xs: 'none', sm: 'flex' }, minWidth: 0 }}><PlaceOutlined sx={{ fontSize: 16, color: 'text.disabled' }} /><Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{meeting.location}</Box></Stack></>}
          {sep}
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ display: { xs: 'none', md: 'flex' } }}><UserAvatar user={host} size={20} />{host?.name} 主持</Stack>
          <Box component="span" sx={{ color: 'divider', display: { xs: 'none', md: 'inline' } }}>·</Box>
          <Stack direction="row" alignItems="center" gap={0.75}>
            <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 22, height: 22, fontSize: 10, borderWidth: 1.5 } }}>
              {attendees.map((a) => <UserAvatar key={a.userId} user={userOf(a.userId)} size={22} />)}
              {guests.map((g) => <UserAvatar key={`g-${g}`} user={guestUser(g)} size={22} />)}
            </AvatarGroup>
            {attendees.length + guests.length} 人參與
          </Stack>
        </Stack>
        <Button className="meta-toggle" size="small" color="inherit" endIcon={<ExpandMore />} sx={{ color: 'text.secondary', flex: 'none', fontWeight: 500 }}>展開</Button>
      </Stack>
    );
  }

  return (
    <Box sx={{ position: 'relative', px: { xs: 2, md: 3 }, py: 1.5, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
      {onToggle && (
        <Button size="small" color="inherit" endIcon={<ExpandLess />} onClick={onToggle} aria-expanded aria-label="收合會議資料"
          sx={{ position: 'absolute', top: 10, right: { xs: 8, md: 16 }, color: 'text.secondary', fontWeight: 500, zIndex: 1, '&:hover': { color: 'primary.main' } }}>收合</Button>
      )}
      <Box sx={{ maxWidth: 1040, pr: { xs: 7, lg: 0 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 5, rowGap: 0.25 }}>
        <Prop icon={EventOutlined} label="日期">
          <DateInput variant="inline" id="meta-date" value={meeting.date} disabled={ro} onChange={(v) => onChange({ date: v })} width={163} />
        </Prop>
        <Prop icon={ScheduleOutlined} label="時間" error={timeBad && '結束時間需晚於開始時間'}>
          <Stack direction="row" alignItems="center" gap={0.25}>
            <TimeInput variant="inline" id="meta-start" value={meeting.start} disabled={ro} onChange={(v) => onChange({ start: v })} error={!!timeBad} width={80} />
            <ArrowForward sx={{ fontSize: 16, color: 'text.disabled' }} aria-label="至" />
            <TimeInput variant="inline" id="meta-end" value={meeting.end} disabled={ro} onChange={(v) => onChange({ end: v })} error={!!timeBad} minTime={meeting.start} width={80} />
          </Stack>
        </Prop>
        <Prop icon={PlaceOutlined} label="地點">
          <InputBase fullWidth value={meeting.location} disabled={ro} placeholder={ro ? '—' : '新增地點'} onChange={set('location')} sx={fieldSx} inputProps={{ 'aria-label': '地點' }} />
        </Prop>
        <Prop icon={VideocamOutlined} label="線上連結">
          <Stack direction="row" alignItems="center">
            <InputBase fullWidth value={meeting.onlineUrl} disabled={ro} placeholder={ro ? '—' : '貼上會議連結'} onChange={set('onlineUrl')}
              sx={{ ...fieldSx, color: urlOk ? 'primary.main' : undefined }} inputProps={{ 'aria-label': '線上會議連結' }} />
            {urlOk && (
              <Tooltip title="開啟連結">
                <IconButton size="small" component="a" href={meeting.onlineUrl} target="_blank" rel="noopener noreferrer" color="primary"><OpenInNew sx={{ fontSize: 17 }} /></IconButton>
              </Tooltip>
            )}
          </Stack>
        </Prop>
        <Prop icon={PersonOutline} label="主持人">
          <Box component="button" type="button" disabled={ro} onClick={(e) => setHostEl(e.currentTarget)} aria-label="主持人" aria-haspopup="menu"
            sx={{ ...fieldSx, border: 0, bgcolor: 'transparent', fontFamily: 'inherit', fontSize: 14, color: 'text.primary', display: 'inline-flex', alignItems: 'center', gap: 0.75, maxWidth: '100%', cursor: ro ? 'default' : 'pointer', textAlign: 'left', outline: 'none', '&:focus-visible': { boxShadow: (t) => `inset 0 0 0 1px ${t.palette.primary.main}` },
              '&:hover:not(:disabled)': { bgcolor: 'action.hover' }, '& .host-caret': { opacity: 0, transition: '.12s' }, '&:hover .host-caret': { opacity: 1 } }}>
            <UserAvatar user={host} size={22} />
            <Box component="span" sx={{ ml: 0.25, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host?.name}</Box>
            {host?.external && <Box component="span" sx={{ fontSize: 11.5, color: 'text.disabled' }}>外部</Box>}
            {!ro && <ExpandMore className="host-caret" sx={{ fontSize: 20, color: 'text.secondary' }} />}
          </Box>
          <PersonPicker anchorEl={hostEl} onClose={() => setHostEl(null)}
            members={users} externals={externals} existing={meeting.hostName ? [meeting.hostName] : []}
            onPickUser={(u) => onChange({ hostId: u.id, hostName: null })} onPickName={(n) => { onAddExternal?.(n); onChange({ hostName: n }); }} />
        </Prop>
        <Prop icon={CategoryOutlined} label="會議類型">
          <Select value={meeting.type} disabled={ro} onChange={set('type')} input={<InputBase sx={{ ...selectSx, minWidth: 170 }} />} inputProps={{ 'aria-label': '會議類型' }}
            renderValue={(v) => <Chip size="small" label={v} sx={{ height: 22, bgcolor: 'primary.light', color: 'primary.dark' }} />}>
            {MEETING_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
        </Prop>
        <Prop icon={GroupOutlined} label={`參與人員`} wide>
          <Stack direction="row" flexWrap="wrap" alignItems="center" gap={0.75} sx={{ minHeight: 32, pl: 0.5, py: 0.25 }}>
            {attendees.map((a) => {
              const u = userOf(a.userId);
              const isHost = !meeting.hostName && a.userId === meeting.hostId;
              const editor = a.permission === 'editor';
              return (
                <Chip key={a.userId} size="small" variant="outlined" avatar={<UserAvatar user={u} size={20} sx={{ ml: '3px !important', mr: '-2px !important' }} />}
                  onDelete={!ro && !isHost ? () => remove(a.userId) : undefined}
                  label={
                    <Stack direction="row" alignItems="center" gap={0.75}>
                      {u?.name}
                      <Tooltip title={ro ? (editor ? '可編輯' : '僅檢視') : `${editor ? '可編輯' : '僅檢視'}・點擊切換`}>
                        <Box component="button" type="button" disabled={ro} onClick={() => togglePerm(a.userId)} aria-label={`${u?.name} 權限`}
                          sx={{ border: 0, p: 0, py: { xs: 1, sm: 0 }, px: { xs: 0.5, sm: 0 }, my: { xs: -1, sm: 0 }, bgcolor: 'transparent', font: 'inherit', fontSize: 11.5, cursor: ro ? 'default' : 'pointer',
                            color: editor ? 'primary.main' : 'text.disabled' }}>
                          {editor ? '編輯' : '檢視'}
                        </Box>
                      </Tooltip>
                    </Stack>
                  }
                  sx={{ height: { xs: 36, sm: 28 }, borderRadius: 18, bgcolor: '#fff', borderColor: 'divider', '& .MuiChip-deleteIcon': { fontSize: { xs: 20, sm: 16 } } }} />
              );
            })}
            {guests.map((g) => (
              <Chip key={`g-${g}`} size="small" variant="outlined" avatar={<UserAvatar user={guestUser(g)} size={20} sx={{ ml: '3px !important', mr: '-2px !important' }} />}
                onDelete={!ro ? () => removeGuest(g) : undefined}
                label={
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    {g}
                    <Tooltip title="沒有系統帳號，僅記錄名字"><Box component="span" sx={{ fontSize: 11.5, color: 'text.disabled' }}>外部</Box></Tooltip>
                  </Stack>
                }
                sx={{ height: { xs: 36, sm: 28 }, borderRadius: 18, bgcolor: '#fff', borderColor: 'divider', '& .MuiChip-deleteIcon': { fontSize: { xs: 20, sm: 16 } } }} />
            ))}
            {!ro && (
              <>
                <Button size="small" startIcon={<Add sx={{ fontSize: '16px !important' }} />} onClick={(e) => setAddEl(e.currentTarget)}
                  sx={{ height: 28, borderRadius: 4, px: 1.25, color: 'text.secondary', fontWeight: 500 }}>新增</Button>
                <PersonPicker anchorEl={addEl} onClose={() => setAddEl(null)}
                  members={notIn} externals={externals} existing={guests}
                  onPickUser={(u) => onAttendees([...attendees, { userId: u.id, permission: 'editor' }])}
                  onPickName={(n) => { onAddExternal?.(n); onChange({ guests: [...guests, n] }); }} />
              </>
            )}
          </Stack>
        </Prop>
      </Box>
    </Box>
  );
}
