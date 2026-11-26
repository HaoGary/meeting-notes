// 權限管理頁：角色權限 / 使用者 / 異動紀錄
import { useEffect, useState } from 'react';
import { Box, List, ListItem, ListItemAvatar, ListItemText, Paper, Skeleton, Tab, Tabs } from '@mui/material';
import PageHeader from '../../components/common/PageHeader';
import RolesTab from './RolesTab';
import { UserAvatar, fmtRel, useToast } from '../../components/common/ui';

function AuditTab({ api }) {
  const toast = useToast();
  const [logs, setLogs] = useState(null);
  const [users, setUsers] = useState([]);
  useEffect(() => {
    Promise.all([api.admin.listAuditLogs(), api.admin.listUsers()])
      .then(([l, u]) => { setLogs(l); setUsers(u); }).catch((e) => { setLogs([]); toast(e.message, 'error'); });
  }, [api, toast]);
  if (!logs) return <Box p={3}>{[0, 1, 2].map((i) => <Skeleton key={i} height={48} />)}</Box>;
  return (
    <List disablePadding>
      {logs.map((l) => {
        const u = users.find((x) => x.id === l.userId);
        return (
          <ListItem key={l.id} divider sx={{ px: 2.5 }}>
            <ListItemAvatar sx={{ minWidth: 44 }}><UserAvatar user={u} size={28} /></ListItemAvatar>
            <ListItemText primary={<><b>{u?.name}</b> {l.action}</>} secondary={fmtRel(l.at)}
              slotProps={{ primary: { fontSize: 14, color: 'text.secondary' }, secondary: { fontSize: 12 } }} />
          </ListItem>
        );
      })}
    </List>
  );
}

export default function PermissionsPage({ api, currentUser, onChanged }) {
  const [tab, setTab] = useState('roles');
  return (
    <Box sx={{ flex: 1, overflow: 'auto' }}>
      <PageHeader crumbs={[{ label: '系統設定' }, { label: '權限管理' }]} title="權限管理"
        subtitle="設定各角色可使用的功能。使用者的角色請於「帳號管理」指派。所有權限皆由後端驗證。" />
      <Box sx={{ px: { xs: 2, md: 3 }, pb: 14 }}>
        <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 1.5, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 48, px: 1.5, minWidth: 0 } }}>
            <Tab value="roles" label="角色權限" />
            <Tab value="audit" label="異動紀錄" />
          </Tabs>
          {tab === 'roles' && <RolesTab api={api} onChanged={onChanged} />}
          {tab === 'audit' && <AuditTab api={api} />}
        </Paper>
      </Box>
    </Box>
  );
}
