import { useEffect, useState } from 'react';
import { Box, List, ListItem, ListItemAvatar, ListItemText, Typography } from '@mui/material';
import { UserAvatar, fmtRel } from '../common/ui';

export default function HistoryPanel({ api, meetingId, users, refreshKey }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    api.listHistory(meetingId).then((x) => alive && setItems(x)).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [api, meetingId, refreshKey]);

  return (
    <Box sx={{ flex: 1, overflow: 'auto', px: 1.75, py: 1 }}>
      {!items && <Typography color="text.disabled" textAlign="center" py={3} fontSize={13}>載入中…</Typography>}
      {items && !items.length && <Typography color="text.disabled" textAlign="center" py={3} fontSize={13}>尚無紀錄</Typography>}
      <List dense disablePadding>
        {items?.map((h) => {
          const u = users.find((x) => x.id === h.userId);
          return (
            <ListItem key={h.id} disableGutters divider alignItems="flex-start">
              <ListItemAvatar sx={{ minWidth: 34, mt: 0.5 }}><UserAvatar user={u} size={24} /></ListItemAvatar>
              <ListItemText primary={<><b>{u?.name}</b> {h.action}</>} secondary={fmtRel(h.at)}
                slotProps={{ primary: { fontSize: 13, color: 'text.secondary' }, secondary: { fontSize: 12 } }} />
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
