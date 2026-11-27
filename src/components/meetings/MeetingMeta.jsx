// 會議基本資料：屬性清單式排版（標籤在左、值在右），無外框輸入，降低視覺密度。
import { useState } from 'react';
import { AvatarGroup, Box, Button, Chip, IconButton, InputBase, Menu, MenuItem, Select, Stack, Tooltip, Typography } from '@mui/material';
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
import { UserAvatar, fmtDate } from '../common/ui';
import { DateInput, TimeInput } from '../common/pickers';
import ArrowForward from '@mui/icons-material/ArrowForward';

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

export default function MeetingMeta({ meeting, attendees, users, editable, onChange, onAttendees, collapsed = false, onToggle }) {
  const [addEl, setAddEl] = useState(null);
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
    const host = userOf(meeting.hostId);
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
            </AvatarGroup>
            {attendees.length} 人參與
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
          <Select value={meeting.hostId} disabled={ro} onChange={set('hostId')} input={<InputBase sx={{ ...selectSx, minWidth: 170 }} />} inputProps={{ 'aria-label': '主持人' }}
            renderValue={(id) => { const u = userOf(id); return <><UserAvatar user={u} size={22} />{u?.name}</>; }}>
            {users.map((u) => <MenuItem key={u.id} value={u.id} sx={{ gap: 1 }}><UserAvatar user={u} size={22} />{u.name}</MenuItem>)}
          </Select>
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
              const isHost = a.userId === meeting.hostId;
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
            {!ro && notIn.length > 0 && (
              <>
                <Button size="small" startIcon={<Add sx={{ fontSize: '16px !important' }} />} onClick={(e) => setAddEl(e.currentTarget)}
                  sx={{ height: 28, borderRadius: 4, px: 1.25, color: 'text.secondary', fontWeight: 500 }}>新增</Button>
                <Menu anchorEl={addEl} open={!!addEl} onClose={() => setAddEl(null)}>
                  {notIn.map((u) => (
                    <MenuItem key={u.id} onClick={() => { onAttendees([...attendees, { userId: u.id, permission: 'editor' }]); setAddEl(null); }} sx={{ gap: 1 }}>
                      <UserAvatar user={u} size={22} />{u.name}
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
          </Stack>
        </Prop>
      </Box>
    </Box>
  );
}
