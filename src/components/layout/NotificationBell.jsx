// 右上角通知：未讀數、通知清單、全部標為已讀；新通知即時推送（Supabase Realtime），並每分鐘補抓一次
import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Box, Button, CircularProgress, Divider, IconButton, List, ListItemButton, Popover, Stack, Tooltip, Typography,
} from '@mui/material';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import GroupAddOutlined from '@mui/icons-material/GroupAddOutlined';
import PersonRemoveOutlined from '@mui/icons-material/PersonRemoveOutlined';
import ManageAccountsOutlined from '@mui/icons-material/ManageAccountsOutlined';
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import LockResetOutlined from '@mui/icons-material/LockResetOutlined';
import { fmtRel } from '../common/ui';

const TYPE_ICON = {
  meeting_added: [GroupAddOutlined, '#4f46e5'],
  meeting_removed: [PersonRemoveOutlined, '#6b7280'],
  meeting_permission: [ManageAccountsOutlined, '#0891b2'],
  meeting_updated: [EventRepeatOutlined, '#d97706'],
  meeting_status: [ArchiveOutlined, '#059669'],
  meeting_deleted: [DeleteOutline, '#dc2626'],
  role_changed: [ShieldOutlined, '#7c3aed'],
  password_reset: [LockResetOutlined, '#dc2626'],
};

export default function NotificationBell({ api, onOpenMeeting }) {
  const [anchor, setAnchor] = useState(null);
  const [list, setList] = useState(null);
  const unread = (list || []).filter((n) => !n.read).length;

  const load = useCallback(() => api.notifications.list().then(setList).catch(() => {}), [api]);
  useEffect(() => {
    load();
    const unsubscribe = api.notifications.subscribe(load);
    const timer = setInterval(load, 60e3);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [api, load]);

  const open = (n) => {
    setAnchor(null);
    if (!n.read) {
      setList((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      api.notifications.markRead(n.id).catch(() => {});
    }
    if (n.meetingId) onOpenMeeting(n.meetingId);
  };
  const readAll = async () => {
    setList((l) => l.map((x) => ({ ...x, read: true })));
    try { await api.notifications.markAllRead(); } catch { load(); }
  };

  return (
    <>
      <Tooltip title="通知">
        <IconButton onClick={(e) => { setAnchor(e.currentTarget); load(); }} aria-label={unread ? `通知（${unread} 則未讀）` : '通知'}>
          <Badge badgeContent={unread} color="error" max={99}><NotificationsNoneOutlined /></Badge>
        </IconButton>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: 'calc(100vw - 24px)', mt: 1, borderRadius: 3 } } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.25 }}>
          <Typography fontWeight={650}>通知{unread > 0 && <Typography component="span" color="text.secondary" fontSize={13}>・{unread} 則未讀</Typography>}</Typography>
          <Button size="small" disabled={!unread} onClick={readAll}>全部標為已讀</Button>
        </Stack>
        <Divider />
        {!list ? (
          <Stack alignItems="center" py={5}><CircularProgress size={22} /></Stack>
        ) : !list.length ? (
          <Stack alignItems="center" gap={1} py={5} color="text.disabled">
            <NotificationsNoneOutlined sx={{ fontSize: 32 }} />
            <Typography fontSize={13.5}>目前沒有通知</Typography>
          </Stack>
        ) : (
          <List disablePadding sx={{ maxHeight: 440, overflow: 'auto' }}>
            {list.map((n) => {
              const [Icon, color] = TYPE_ICON[n.type] || [NotificationsNoneOutlined, '#6b7280'];
              return (
                <ListItemButton key={n.id} onClick={() => open(n)} alignItems="flex-start"
                  sx={{ gap: 1.5, py: 1.25, px: 2, bgcolor: n.read ? 'transparent' : 'rgba(79,70,229,.05)', borderBottom: 1, borderColor: 'divider' }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', bgcolor: `${color}14`, color }}>
                    <Icon sx={{ fontSize: 18 }} />
                  </Box>
                  <Box flex={1} minWidth={0}>
                    <Typography fontSize={13.5} fontWeight={n.read ? 400 : 600} lineHeight={1.45}>{n.title}</Typography>
                    {n.body && <Typography fontSize={12.5} color="text.secondary" mt={0.25}>{n.body}</Typography>}
                    <Typography fontSize={12} color="text.disabled" mt={0.5}>{fmtRel(n.at)}</Typography>
                  </Box>
                  {!n.read && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flex: 'none', mt: 0.75 }} />}
                </ListItemButton>
              );
            })}
          </List>
        )}
        <Typography fontSize={11.5} color="text.disabled" textAlign="center" py={1}>通知保留 30 天</Typography>
      </Popover>
    </>
  );
}
