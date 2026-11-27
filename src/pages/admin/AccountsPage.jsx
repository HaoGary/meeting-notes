// 帳號管理（需 system.accounts）：新增／編輯帳號、重設密碼、解除鎖定、強制登出、啟用停用
import { features } from '../../services/config';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControlLabel, IconButton, InputAdornment, ListItemIcon, Menu, MenuItem, Paper, Radio, RadioGroup,
  Select, Skeleton, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Search from '@mui/icons-material/Search';
import MoreVert from '@mui/icons-material/MoreVert';
import EditOutlined from '@mui/icons-material/EditOutlined';
import LockResetOutlined from '@mui/icons-material/LockResetOutlined';
import LockOpenOutlined from '@mui/icons-material/LockOpenOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import ForwardToInboxOutlined from '@mui/icons-material/ForwardToInboxOutlined';
import ContentCopy from '@mui/icons-material/ContentCopy';
import PageHeader from '../../components/common/PageHeader';
import TablePager, { usePaged } from '../../components/common/TablePager';
import { AppDialog, UserAvatar, fmtRel, useToast } from '../../components/common/ui';
import { useForm } from '../../hooks/useForm';
import { adminUserSchema } from '../../utils/validators';
import FilterBar from '../../components/common/FilterBar';
import { useDevice } from '../../hooks/useDevice';

const STATUS = [['', '所有狀態'], ['active', '啟用中'], ['locked', '已鎖定'], ['pending', '待設定密碼／未驗證'], ['disabled', '已停用']]
  .filter(([k]) => k !== 'locked' || features.loginLock); // Supabase 版不做登入鎖定

function FormField({ label, id, ...props }) {
  return (
    <Box>
      <Typography component="label" htmlFor={id} fontSize={13} fontWeight={600} sx={{ display: 'block', mb: 1 }}>{label}</Typography>
      <TextField fullWidth {...props} slotProps={{ ...props.slotProps, htmlInput: { ...props.slotProps?.htmlInput, id }, formHelperText: { sx: { mx: 0, mt: 0.75 } } }} />
    </Box>
  );
}

// 新增／編輯帳號
function AccountDialog({ open, onClose, api, roles, canSetRole, editing, onSaved }) {
  const toast = useToast();
  const init = editing ? { name: editing.name, email: editing.email, username: editing.username, roleId: editing.roleId, method: 'invite' }
    : { name: '', email: '', username: '', roleId: 'member', method: 'invite' };
  const form = useForm(init, adminUserSchema);
  const submit = form.handleSubmit(async (v) => {
    try {
      if (editing) { await api.admin.updateAccount(editing.id, v); toast('已更新帳號資料'); onSaved(); }
      else {
        const r = await api.admin.createAccount(v);
        toast(`已建立帳號「${v.name}」${v.method === 'invite' ? '，邀請信已寄出' : ''}`);
        onSaved(r.tempPassword ? { user: r.user, tempPassword: r.tempPassword } : null);
      }
    } catch (e) { if (e.data?.fields) Object.entries(e.data.fields).forEach(([k, m]) => form.setFieldError(k, m)); else toast(e.message, 'error'); }
  });
  return (
    <AppDialog open={open} onClose={onClose} title={editing ? '編輯帳號' : '新增帳號'} maxWidth="sm"
      actions={<>
        <Button color="inherit" onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={submit} disabled={form.submitting}
          startIcon={form.submitting && <CircularProgress size={16} sx={{ color: 'inherit' }} />}>{editing ? '儲存' : '建立帳號'}</Button>
      </>}>
      <Stack component="form" noValidate onSubmit={submit} gap={2.5} sx={{ pt: 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
          <FormField id="acct-name" label="姓名" placeholder="例：王小明" autoFocus {...form.field('name')} />
          <FormField id="acct-username" label="帳號" placeholder="英文字母開頭，4–20 字元" {...form.field('username')} />
        </Box>
        <FormField id="acct-email" label="Email" placeholder="name@company.com" type="email" {...form.field('email')} />
        {!editing && (
          <>
            <Box>
              <Typography fontSize={13} fontWeight={600} mb={1}>角色</Typography>
              <TextField select fullWidth value={form.values.roleId} onChange={(e) => form.setValue('roleId', e.target.value)} slotProps={{ htmlInput: { 'aria-label': '角色' } }}>
                {roles.filter((r) => canSetRole || r.id !== 'admin').map((r) => (
                  <MenuItem key={r.id} value={r.id}><Box><Typography fontSize={14}>{r.name}</Typography><Typography fontSize={12} color="text.disabled">{r.desc}</Typography></Box></MenuItem>
                ))}
              </TextField>
            </Box>
            <Box>
              <Typography fontSize={13} fontWeight={600} mb={0.5}>設定密碼方式</Typography>
              <RadioGroup value={form.values.method} onChange={(e) => form.setValue('method', e.target.value)}>
                <FormControlLabel value="invite" control={<Radio size="small" />} label={<Box><Typography fontSize={14}>寄送邀請信（建議）</Typography><Typography fontSize={12} color="text.disabled">使用者透過信中連結自行設定密碼，72 小時內有效</Typography></Box>} sx={{ mb: 0.75 }} />
                <FormControlLabel value="temp" control={<Radio size="small" />} label={<Box><Typography fontSize={14}>產生臨時密碼</Typography><Typography fontSize={12} color="text.disabled">由您轉告使用者，首次登入時須變更密碼</Typography></Box>} />
              </RadioGroup>
            </Box>
          </>
        )}
        {editing && <Alert severity="info" sx={{ py: 0 }}>角色請於列表中調整；密碼請使用「重設密碼」。</Alert>}
      </Stack>
    </AppDialog>
  );
}

// 臨時密碼只顯示一次
function TempPasswordDialog({ data, onClose }) {
  const toast = useToast();
  if (!data) return null;
  const copy = async () => { try { await navigator.clipboard.writeText(data.tempPassword); toast('已複製臨時密碼'); } catch { toast('請手動選取並複製', 'info'); } };
  return (
    <AppDialog open title="臨時密碼" onClose={onClose} actions={<Button variant="contained" onClick={onClose}>我已記下</Button>}>
      <Typography mb={2}>請將以下臨時密碼轉告「{data.user.name}」（帳號：{data.user.username}）。對方登入後須立即設定新密碼。</Typography>
      <TextField fullWidth value={data.tempPassword} onFocus={(e) => e.target.select()}
        slotProps={{ input: { readOnly: true, sx: { fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 18, letterSpacing: '.08em' },
          endAdornment: <InputAdornment position="end"><Button size="small" startIcon={<ContentCopy sx={{ fontSize: '15px !important' }} />} onClick={copy}>複製</Button></InputAdornment> } }} />
      <Alert severity="warning" sx={{ mt: 2, py: 0 }}>此密碼只會顯示這一次，關閉後無法再查看。請勿透過公開管道傳送。</Alert>
    </AppDialog>
  );
}

export default function AccountsPage({ api, currentUser, canSetRole }) {
  const { isMobile } = useDevice();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [status, setStatus] = useState('');
  const [menu, setMenu] = useState(null); // { el, u }
  const [dialog, setDialog] = useState(null); // { type, u }
  const [resetMethod, setResetMethod] = useState('email');
  const [temp, setTemp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);

  const load = () => Promise.all([api.admin.listAccounts(), canSetRole ? api.admin.listRoles() : Promise.resolve(null)])
    .then(([u, r]) => { setUsers(u); setRoles(r || [...new Map(u.map((x) => [x.roleId, { id: x.roleId, name: x.roleName }])).values()]); })
    .catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const stateOf = (u) => (!u.active ? 'disabled' : u.locked ? 'locked' : (u.pendingInvite || !u.emailVerified) ? 'pending' : 'active');
  const list = useMemo(() => (users || []).filter((u) => {
    const kw = q.trim().toLowerCase();
    return (!roleFilter || u.roleId === roleFilter) && (!status || stateOf(u) === status)
      && (!kw || u.name.toLowerCase().includes(kw) || u.username.toLowerCase().includes(kw) || u.email.includes(kw));
  }), [users, q, roleFilter, status]);

  const { pageRows, page: curPage } = usePaged(list, page, size);
  useEffect(() => { setPage(0); }, [q, roleFilter, status]);

  const run = async (fn, msg) => {
    setBusy(true);
    try { const r = await fn(); if (msg) toast(msg); await load(); return r; }
    catch (e) { toast(e.message, 'error'); return null; }
    finally { setBusy(false); }
  };
  const close = () => setDialog(null);
  const act = (type, u) => { setMenu(null); setResetMethod('email'); setDialog({ type, u }); };

  const changeRole = (u, roleId) => run(() => api.admin.updateUser(u.id, { roleId }), `已將「${u.name}」設為「${roles.find((r) => r.id === roleId)?.name}」`);
  const toggleActive = (u) => (u.active ? act('disable', u) : run(() => api.admin.updateUser(u.id, { active: true }), `已啟用「${u.name}」`));

  // ── 各欄位內容（桌面表格與手機卡片共用）──
  const userCell = (u) => (
    <Stack direction="row" alignItems="center" gap={1.25}>
      <UserAvatar user={u} size={34} />
      <Box minWidth={0}>
        <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
          <Typography fontWeight={600} fontSize={14}>{u.name}</Typography>
          <Typography fontSize={12.5} color="text.disabled">@{u.username}</Typography>
          {u.id === currentUser.id && <Chip size="small" label="你" sx={{ height: 18, fontSize: 11 }} />}
        </Stack>
        <Typography fontSize={12.5} color="text.secondary" noWrap>{u.email}</Typography>
      </Box>
    </Stack>
  );
  const roleCell = (u) => {
    const self = u.id === currentUser.id;
    const role = roles.find((r) => r.id === u.roleId);
    return canSetRole ? (
      <Tooltip title={self ? '無法變更自己的角色' : ''}>
        <span>
          <Select fullWidth size="small" value={u.roleId} disabled={self || busy} onChange={(e) => changeRole(u, e.target.value)} inputProps={{ 'aria-label': `${u.name} 的角色` }}
            renderValue={() => <Stack direction="row" alignItems="center" gap={1}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: role?.color || 'grey.400' }} />{role?.name}</Stack>}>
            {roles.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
          </Select>
        </span>
      </Tooltip>
    ) : <Typography fontSize={14}>{u.roleName}</Typography>;
  };
  const statusCell = (u) => (
    <Stack direction="row" gap={0.75} flexWrap="wrap">
      {u.locked && <Chip size="small" color="error" variant="outlined" label="已鎖定" sx={{ height: 22 }} />}
      {u.pendingInvite && <Chip size="small" color="warning" variant="outlined" label="待設定密碼" sx={{ height: 22 }} />}
      {!u.pendingInvite && !u.emailVerified && <Chip size="small" color="warning" variant="outlined" label="Email 未驗證" sx={{ height: 22 }} />}
      {u.mustChangePassword && <Chip size="small" variant="outlined" label="待變更臨時密碼" sx={{ height: 22 }} />}
      {u.sessionCount > 0 && <Chip size="small" label={`${u.sessionCount} 台裝置登入中`} sx={{ height: 22, bgcolor: '#ecfdf5', color: 'success.dark' }} />}
      {!u.locked && !u.pendingInvite && u.emailVerified && !u.mustChangePassword && !u.sessionCount && <Typography fontSize={13} color="text.disabled">—</Typography>}
    </Stack>
  );
  const activeCell = (u) => {
    const self = u.id === currentUser.id;
    return (
      <Tooltip title={self ? '無法停用自己的帳號' : ''}>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Switch size={isMobile ? 'medium' : 'small'} checked={u.active} disabled={self || busy} onChange={() => toggleActive(u)} slotProps={{ input: { 'aria-label': `${u.name} 帳號狀態` } }} />
          <Typography fontSize={12.5} color={u.active ? 'success.main' : 'text.disabled'}>{u.active ? '啟用' : '停用'}</Typography>
        </Stack>
      </Tooltip>
    );
  };
  const menuBtn = (u) => <IconButton size="small" aria-label={`${u.name} 更多操作`} onClick={(e) => setMenu({ el: e.currentTarget, u })}><MoreVert fontSize="small" /></IconButton>;

  return (
    <Box sx={{ flex: 1, overflow: 'auto' }}>
      <PageHeader crumbs={[{ label: '系統設定' }, { label: '帳號管理' }]} title="帳號管理" subtitle="管理使用者帳號、密碼與登入狀態。所有操作都會記錄在權限管理的異動紀錄中。" />
      <Box sx={{ px: { xs: 1.5, sm: 2, md: 3 }, pb: 12 }}>
        <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
          <FilterBar activeCount={(roleFilter ? 1 : 0) + (status ? 1 : 0)}
            search={<TextField fullWidth placeholder="搜尋姓名、帳號或 Email" value={q} onChange={(e) => setQ(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />}
            filters={[
              <TextField key="role" select fullWidth value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
                slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': '角色篩選' } }}>
                <MenuItem value="">所有角色</MenuItem>
                {roles.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
              </TextField>,
              <TextField key="status" select fullWidth value={status} onChange={(e) => setStatus(e.target.value)}
                slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': '狀態篩選' } }}>
                {STATUS.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
              </TextField>,
            ]}
            action={<Button variant="contained" startIcon={<Add />} onClick={() => act('create')} sx={{ height: 40 }}>新增帳號</Button>} />

          {isMobile ? (
            /* 手機版：每個帳號一張卡片，欄位與桌面表格相同 */
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider' }}>
              {!users && [0, 1, 2].map((i) => <Box component="li" key={i} sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Skeleton width="60%" /><Skeleton width="80%" /><Skeleton width="50%" /></Box>)}
              {pageRows.map((u) => (
                <Box component="li" key={u.id} sx={{ px: 2, py: 1.75, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                  <Stack direction="row" alignItems="flex-start" gap={1}>
                    <Box sx={{ flex: 1, minWidth: 0, opacity: u.active ? 1 : 0.55 }}>{userCell(u)}</Box>
                    <Box sx={{ flex: 'none', mr: -1, mt: -0.5 }}>{menuBtn(u)}</Box>
                  </Stack>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '72px 1fr', alignItems: 'center', columnGap: 1.5, rowGap: 1.25, mt: 1.5, fontSize: 13 }}>
                    <Typography fontSize={12.5} color="text.disabled">角色</Typography><Box sx={{ minWidth: 0 }}>{roleCell(u)}</Box>
                    <Typography fontSize={12.5} color="text.disabled">登入狀態</Typography><Box>{statusCell(u)}</Box>
                    <Typography fontSize={12.5} color="text.disabled">最後登入</Typography><Typography fontSize={13.5} color="text.secondary">{u.lastLoginAt ? fmtRel(u.lastLoginAt) : '尚未登入'}</Typography>
                    <Typography fontSize={12.5} color="text.disabled">帳號</Typography><Box>{activeCell(u)}</Box>
                  </Box>
                </Box>
              ))}
              {users && !list.length && <Box component="li" sx={{ py: 6, textAlign: 'center', color: 'text.disabled' }}>沒有符合條件的帳號</Box>}
            </Box>
          ) : (
          <TableContainer>
            <Table sx={{ minWidth: 820, '& th': { bgcolor: '#f9fafb', color: 'text.secondary', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>使用者</TableCell>
                  <TableCell sx={{ width: 190 }}>角色</TableCell>
                  <TableCell>登入狀態</TableCell>
                  <TableCell>最後登入</TableCell>
                  <TableCell sx={{ width: 104 }}>帳號</TableCell>
                  <TableCell sx={{ width: 52 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {!users && [0, 1, 2].map((i) => <TableRow key={i}>{[0, 1, 2, 3, 4, 5].map((j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>)}
                {pageRows.map((u) => (
                  <TableRow key={u.id} hover sx={{ '& td': { opacity: u.active ? 1 : 0.55 }, '& td:last-child': { opacity: 1 }, '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell>{userCell(u)}</TableCell>
                    <TableCell>{roleCell(u)}</TableCell>
                    <TableCell>{statusCell(u)}</TableCell>
                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontSize: 13.5 }}>{u.lastLoginAt ? fmtRel(u.lastLoginAt) : '尚未登入'}</TableCell>
                    <TableCell>{activeCell(u)}</TableCell>
                    <TableCell align="right">{menuBtn(u)}</TableCell>
                  </TableRow>
                ))}
                {users && !list.length && <TableRow><TableCell colSpan={6} sx={{ py: 6, textAlign: 'center', color: 'text.disabled' }}>沒有符合條件的帳號</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          )}
          {users && <TablePager count={list.length} page={curPage} size={size} onPage={setPage} onSize={setSize} />}
        </Paper>
      </Box>

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {menu && [
          <MenuItem key="edit" onClick={() => act('edit', menu.u)}><ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>編輯資料</MenuItem>,
          menu.u.id !== currentUser.id && <MenuItem key="reset" onClick={() => act('reset', menu.u)}><ListItemIcon><LockResetOutlined fontSize="small" /></ListItemIcon>重設密碼</MenuItem>,
          menu.u.locked && <MenuItem key="unlock" onClick={() => { const u = menu.u; setMenu(null); run(() => api.admin.unlockAccount(u.id), `已解除「${u.name}」的鎖定`); }}><ListItemIcon><LockOpenOutlined fontSize="small" /></ListItemIcon>解除鎖定</MenuItem>,
          (menu.u.pendingInvite || !menu.u.emailVerified) && <MenuItem key="invite" onClick={() => { const u = menu.u; setMenu(null); run(() => api.admin.resendInvite(u.id), u.pendingInvite ? '已重新寄送邀請信' : '已重新寄送驗證信'); }}><ListItemIcon><ForwardToInboxOutlined fontSize="small" /></ListItemIcon>{menu.u.pendingInvite ? '重新寄送邀請信' : '重新寄送驗證信'}</MenuItem>,
          menu.u.id !== currentUser.id && <MenuItem key="logout" disabled={!menu.u.sessionCount} onClick={() => act('logout', menu.u)}><ListItemIcon><LogoutOutlined fontSize="small" /></ListItemIcon>強制登出所有裝置</MenuItem>,
        ].filter(Boolean)}
      </Menu>

      {(dialog?.type === 'create' || dialog?.type === 'edit') && (
        <AccountDialog open onClose={close} api={api} roles={roles} canSetRole={canSetRole} editing={dialog.type === 'edit' ? dialog.u : null}
          onSaved={(t) => { close(); load(); if (t) setTemp(t); }} />
      )}

      <AppDialog open={dialog?.type === 'reset'} title={`重設「${dialog?.u?.name}」的密碼`} onClose={close}
        actions={<><Button color="inherit" onClick={close}>取消</Button>
          <Button variant="contained" disabled={busy} onClick={async () => {
            const u = dialog.u; const r = await run(() => api.admin.resetAccountPassword(u.id, resetMethod), resetMethod === 'email' ? `已寄送重設密碼信給 ${u.email}` : null);
            close(); if (r?.tempPassword) setTemp({ user: u, tempPassword: r.tempPassword });
          }}>{resetMethod === 'email' ? '寄送重設信' : '產生臨時密碼'}</Button></>}>
        <RadioGroup value={resetMethod} onChange={(e) => setResetMethod(e.target.value)}>
          <FormControlLabel value="email" control={<Radio size="small" />} sx={{ mb: 1 }}
            label={<Box><Typography fontSize={14} color="text.primary">寄送重設密碼信（建議）</Typography><Typography fontSize={12.5} color="text.disabled">使用者自行設定新密碼，目前密碼在完成前仍可使用</Typography></Box>} />
          <FormControlLabel value="temp" control={<Radio size="small" />}
            label={<Box><Typography fontSize={14} color="text.primary">產生臨時密碼</Typography><Typography fontSize={12.5} color="text.disabled">立即失效舊密碼並登出所有裝置，首次登入須變更密碼</Typography></Box>} />
        </RadioGroup>
      </AppDialog>

      <AppDialog open={dialog?.type === 'logout'} title="強制登出所有裝置" onClose={close}
        actions={<><Button color="inherit" onClick={close}>取消</Button><Button variant="contained" color="error" onClick={async () => { const u = dialog.u; close(); await run(() => api.admin.revokeAccountSessions(u.id), `已登出「${u.name}」的所有裝置`); }}>強制登出</Button></>}>
        <Typography>「{dialog?.u?.name}」目前有 {dialog?.u?.sessionCount} 台裝置登入中，將全部立即登出。若懷疑帳號遭盜用，建議同時重設密碼。</Typography>
      </AppDialog>

      <AppDialog open={dialog?.type === 'disable'} title="停用帳號" onClose={close}
        actions={<><Button color="inherit" onClick={close}>取消</Button><Button variant="contained" color="error" onClick={async () => { const u = dialog.u; close(); await run(() => api.admin.updateUser(u.id, { active: false }), `已停用「${u.name}」`); }}>停用</Button></>}>
        <Typography>停用後「{dialog?.u?.name}」將無法登入，所有裝置會立即登出。會議紀錄與資料會保留，之後可隨時重新啟用。</Typography>
      </AppDialog>

      <TempPasswordDialog data={temp} onClose={() => setTemp(null)} />
    </Box>
  );
}

