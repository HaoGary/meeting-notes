// 角色權限：角色 × 權限矩陣。變更先暫存，確認後一次送出（權限屬敏感操作）。
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Checkbox, Chip, IconButton, MenuItem, Paper, Skeleton, Slide, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import LockOutlined from '@mui/icons-material/LockOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { PERMISSIONS } from '../../services/seed';
import { AppDialog, useToast } from '../../components/common/ui';

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];
const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export default function RolesTab({ api, onChanged }) {
  const toast = useToast();
  const [roles, setRoles] = useState(null);
  const [draft, setDraft] = useState({}); // roleId -> perms[]
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ name: '', desc: '', copyFrom: 'member' });
  const [delRole, setDelRole] = useState(null);

  const load = () => api.admin.listRoles().then((r) => { setRoles(r); setDraft({}); }).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const permsOf = (r) => draft[r.id] ?? r.permissions;
  const changes = useMemo(() => roles ? Object.entries(draft).filter(([id, p]) => !same(p, roles.find((r) => r.id === id).permissions)) : [], [draft, roles]);
  const changeCount = changes.reduce((n, [id, p]) => {
    const orig = roles.find((r) => r.id === id).permissions;
    return n + p.filter((x) => !orig.includes(x)).length + orig.filter((x) => !p.includes(x)).length;
  }, 0);

  const toggle = (r, key) => {
    const cur = permsOf(r);
    setDraft((d) => ({ ...d, [r.id]: cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key] }));
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.admin.saveRolePermissions(Object.fromEntries(changes));
      toast('已更新角色權限');
      await load(); onChanged?.();
    } catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };
  const create = async () => {
    try {
      await api.admin.createRole(form);
      toast(`已新增角色「${form.name}」`);
      setNewOpen(false); setForm({ name: '', desc: '', copyFrom: 'member' }); load();
    } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async () => {
    try { await api.admin.deleteRole(delRole.id); toast('已刪除角色'); load(); } catch (e) { toast(e.message, 'error'); }
    setDelRole(null);
  };

  if (!roles) return <Box p={3}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={44} />)}</Box>;

  return (
    <Box>
      {/* 工具列：與帳號管理、會議紀錄一致，主要按鈕固定在右側 */}
      <Stack direction="row" flexWrap="wrap" gap={1.25} alignItems="center" sx={{ p: 1.5 }}>
        <Button variant="contained" startIcon={<Add />} onClick={() => setNewOpen(true)} sx={{ height: 40, flex: 'none', ml: 'auto' }}>新增角色</Button>
      </Stack>

      <TableContainer sx={{ borderTop: 1, borderColor: 'divider' }}>
        <Table sx={{ minWidth: 720, '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: '#f9fafb', width: 280, fontSize: 12.5, color: 'text.secondary', fontWeight: 600 }}>權限項目</TableCell>
              {roles.map((r) => (
                <TableCell key={r.id} align="center" sx={{ bgcolor: '#f9fafb', minWidth: 120, verticalAlign: 'top', py: 1.25 }}>
                  <Stack alignItems="center" gap={0.25}>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.color }} />
                      <Typography fontWeight={650} fontSize={13.5}>{r.name}</Typography>
                      {r.locked && <Tooltip title="系統角色，權限固定"><LockOutlined sx={{ fontSize: 14, color: 'text.disabled' }} /></Tooltip>}
                      {!r.locked && !['manager', 'member', 'viewer'].includes(r.id) && (
                        <Tooltip title="刪除角色"><IconButton size="small" onClick={() => setDelRole(r)} sx={{ p: 0.25 }}><DeleteOutline sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                      )}
                    </Stack>
                    <Typography fontSize={11.5} color="text.disabled">{r.userCount} 位使用者</Typography>
                  </Stack>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {GROUPS.map((g) => (
              <Fragment key={g}>
                <TableRow>
                  <TableCell colSpan={roles.length + 1} sx={{ py: 0.75, bgcolor: '#fcfcfd', fontSize: 12, fontWeight: 600, color: 'text.disabled', letterSpacing: '.04em' }}>{g}</TableCell>
                </TableRow>
                {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                  <TableRow key={p.key} hover>
                    <TableCell sx={{ py: 1 }}>
                      <Typography fontSize={14} fontWeight={500}>{p.label}</Typography>
                      <Typography fontSize={12} color="text.disabled">{p.desc}</Typography>
                    </TableCell>
                    {roles.map((r) => {
                      const on = permsOf(r).includes(p.key);
                      const changed = draft[r.id] && on !== r.permissions.includes(p.key);
                      return (
                        <TableCell key={r.id} align="center" sx={{ py: 0.5, bgcolor: changed ? '#fffbeb' : undefined }}>
                          <Checkbox checked={on} disabled={r.locked} onChange={() => toggle(r, p.key)}
                            slotProps={{ input: { 'aria-label': `${r.name}：${p.label}` } }} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 未儲存變更列 */}
      <Slide direction="up" in={changeCount > 0} mountOnEnter unmountOnExit>
        <Paper elevation={10} sx={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%) !important', zIndex: 1200,
          px: 2, py: 1.25, borderRadius: 3, display: 'flex', alignItems: 'center', gap: 2, bgcolor: '#111827', color: '#fff' }}>
          <Typography fontSize={14}>有 <b>{changeCount}</b> 項權限變更尚未儲存</Typography>
          <Button size="small" sx={{ color: '#d1d5db' }} onClick={() => setDraft({})} disabled={saving}>捨棄</Button>
          <Button size="small" variant="contained" onClick={save} disabled={saving}>{saving ? '儲存中…' : '儲存變更'}</Button>
        </Paper>
      </Slide>

      <AppDialog open={newOpen} title="新增角色" onClose={() => setNewOpen(false)}
        actions={<><Button color="inherit" onClick={() => setNewOpen(false)}>取消</Button><Button variant="contained" onClick={create} disabled={!form.name.trim()}>建立</Button></>}>
        <Stack gap={2} pt={1}>
          <TextField autoFocus label="角色名稱" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：部門主管" />
          <TextField label="說明（選填）" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
          <TextField select label="複製權限自" value={form.copyFrom} onChange={(e) => setForm({ ...form, copyFrom: e.target.value })}>
            <MenuItem value="">不複製（無任何權限）</MenuItem>
            {roles.filter((r) => !r.locked).map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
          </TextField>
        </Stack>
      </AppDialog>

      <AppDialog open={!!delRole} title="刪除角色" onClose={() => setDelRole(null)}
        actions={<><Button color="inherit" onClick={() => setDelRole(null)}>取消</Button><Button variant="contained" color="error" onClick={remove}>刪除</Button></>}>
        <Typography>確定要刪除角色「{delRole?.name}」嗎？{delRole?.userCount ? <>目前仍有 <b>{delRole.userCount}</b> 位使用者屬於此角色，需先變更他們的角色。</> : ''}</Typography>
      </AppDialog>
    </Box>
  );
}

