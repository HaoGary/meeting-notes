// 後台版型：上方 AppBar + 左側導覽選單（只負責切換頁面）。
// 正式整合時，這層會由既有專案的 Layout 取代，會議功能只註冊選單項目與路由。
import { useEffect, useState } from 'react';
import {
  AppBar, Avatar, Badge, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader,
  Menu, MenuItem, Stack, Toolbar, Tooltip, Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpen from '@mui/icons-material/MenuOpen';
import CloseIcon from '@mui/icons-material/Close';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import ManageAccountsOutlined from '@mui/icons-material/ManageAccountsOutlined';
import PeopleAltOutlined from '@mui/icons-material/PeopleAltOutlined';
import PolylineOutlined from '@mui/icons-material/PolylineOutlined';
import { useDevice } from '../../hooks/useDevice';

export const APPBAR_H = 56;
const FULL_W = 232;
const MINI_W = 68;

// 選單設定：新增頁面只需在此加一筆；perm 為需要的權限（後端仍會再驗證）
export const NAV = [
  { section: '會議管理', items: [
    { key: 'meetings', label: '會議紀錄', icon: EventNoteOutlined, match: ['meetings', 'meeting'] },
  ] },
  { section: '文件工具', items: [
    { key: 'vectorize', label: '圖片向量化', icon: PolylineOutlined },
  ] },
  { section: '系統設定', items: [
    { key: 'accounts', label: '帳號管理', icon: PeopleAltOutlined, perm: 'system.accounts' },
    { key: 'permissions', label: '權限管理', icon: ShieldOutlined, perm: 'system.permissions' },
  ] },
];

export default function AppShell({ page, onNavigate, badges = {}, user, permissions = [], onLogout, notifications, children }) {
  // 桌面（≥1200）：完整側邊選單，可手動收合
  // 平板（768–1199）：預設收合成圖示列，可展開
  // 手機（≤767）：漢堡選單＋抽屜式選單
  const { isMobile, isDesktop } = useDevice();
  const desktop = !isMobile; // 是否使用常駐側邊欄
  const [mini, setMini] = useState(!isDesktop);
  useEffect(() => { setMini(!isDesktop); }, [isDesktop]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userEl, setUserEl] = useState(null);
  const collapsed = desktop && mini;
  const width = collapsed ? MINI_W : FULL_W;

  const go = (key) => { onNavigate(key); setMobileOpen(false); };

  const nav = (
    <Box component="nav" aria-label="主選單" sx={{ width: desktop ? width : FULL_W, transition: 'width .2s', overflowX: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!desktop && (
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ height: APPBAR_H, pl: 2.5, pr: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Typography fontWeight={600} fontSize={15}>選單</Typography>
          <Box flex={1} />
          <IconButton onClick={() => setMobileOpen(false)} aria-label="關閉選單"><CloseIcon /></IconButton>
        </Stack>
      )}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5 }}>
        {NAV.map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || permissions.includes(it.perm)) })).filter((g) => g.items.length).map((g) => (
          <List key={g.section} dense
            subheader={!collapsed && <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px', fontSize: 12, fontWeight: 600, color: 'text.disabled', px: 2.5 }}>{g.section}</ListSubheader>}
            sx={{ px: 1.25 }}>
            {g.items.map((it) => {
              const active = (it.match || [it.key]).includes(page);
              const Icon = it.icon;
              const badge = it.badgeKey ? badges[it.badgeKey] : 0;
              return (
                <Tooltip key={it.key} title={collapsed ? it.label : ''} placement="right">
                  <ListItemButton selected={active} onClick={() => go(it.key)}
                    sx={{ mb: collapsed ? 0.75 : 0.25, py: 1, px: collapsed ? 0 : 1.5, minHeight: { xs: 48, sm: 40 }, justifyContent: collapsed ? 'center' : 'flex-start',
                      '&.Mui-selected': { bgcolor: 'primary.light', color: 'primary.dark', '& .MuiListItemIcon-root': { color: 'primary.main' } },
                      '&.Mui-selected:hover': { bgcolor: 'primary.light' } }}>
                    <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36 }}>
                      <Badge badgeContent={collapsed ? badge : 0} color="primary"><Icon fontSize="small" /></Badge>
                    </ListItemIcon>
                    {!collapsed && <ListItemText primary={it.label} slotProps={{ primary: { fontSize: 14, fontWeight: active ? 600 : 500 } }} />}
                    {!collapsed && badge > 0 && <Badge badgeContent={badge} color="primary" sx={{ mr: 1 }} />}
                  </ListItemButton>
                </Tooltip>
              );
            })}
          </List>
        ))}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      <AppBar position="fixed" color="inherit" elevation={0}
        sx={{ zIndex: (t) => t.zIndex.drawer + 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ minHeight: `${APPBAR_H}px !important`, px: { xs: 1.5, md: 2 }, gap: 1 }}>
          <Tooltip title={desktop ? (mini ? '展開選單' : '收合選單') : '開啟選單'}>
            <IconButton onClick={() => (desktop ? setMini((x) => !x) : setMobileOpen(true))} aria-label={desktop ? (mini ? '展開選單' : '收合選單') : '開啟選單'}
              aria-expanded={desktop ? !mini : mobileOpen}>
              {desktop && !mini ? <MenuOpen /> : <MenuIcon />}
            </IconButton>
          </Tooltip>
          <Box flex={1} />
          {notifications}
          <Divider orientation="vertical" flexItem sx={{ my: 1.5, mx: 0.5 }} />
          <Stack direction="row" alignItems="center" gap={1} onClick={(e) => setUserEl(e.currentTarget)}
            sx={{ cursor: 'pointer', borderRadius: 2, pl: 0.5, pr: 1, py: 0.5, '&:hover': { bgcolor: 'action.hover' } }}>
            <Avatar sx={{ width: 30, height: 30, fontSize: 13, bgcolor: user.color }}>{user.name.replace(/[A-Za-z]+ /, '').slice(0, 1)}</Avatar>
            <Box sx={{ display: { xs: 'none', sm: 'block' }, lineHeight: 1.2 }}>
              <Typography fontSize={13.5} fontWeight={600}>{user.name}</Typography>
              <Typography fontSize={11.5} color="text.disabled">{user.roleName}</Typography>
            </Box>
            <KeyboardArrowDown fontSize="small" sx={{ color: 'text.disabled', display: { xs: 'none', sm: 'block' } }} />
          </Stack>
          <Menu anchorEl={userEl} open={!!userEl} onClose={() => setUserEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
            <Box sx={{ px: 2, py: 1.25, minWidth: 220 }}>
              <Typography fontWeight={600} fontSize={14}>{user.name}</Typography>
              <Typography fontSize={12.5} color="text.secondary">{user.email}</Typography>
              <Stack direction="row" alignItems="center" gap={0.5} mt={0.75}><AdminPanelSettingsOutlined sx={{ fontSize: 15, color: 'text.disabled' }} /><Typography fontSize={12} color="text.disabled">{user.roleName}</Typography></Stack>
            </Box>
            <Divider />
            <MenuItem onClick={() => { setUserEl(null); onNavigate('account'); }} sx={{ fontSize: 14, py: 1.1 }}><ManageAccountsOutlined fontSize="small" sx={{ mr: 1.25, color: 'text.secondary' }} />帳號設定</MenuItem>
            <MenuItem onClick={() => { setUserEl(null); onLogout?.(); }} sx={{ fontSize: 14, py: 1.1 }}><LogoutOutlined fontSize="small" sx={{ mr: 1.25, color: 'text.secondary' }} />登出</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {desktop ? (
        <Drawer variant="permanent"
          sx={{ width, flexShrink: 0, transition: 'width .2s', '& .MuiDrawer-paper': { width, transition: 'width .2s', top: APPBAR_H, height: `calc(100% - ${APPBAR_H}px)`, borderColor: 'divider', bgcolor: '#fbfbfc' } }}>
          {nav}
        </Drawer>
      ) : (
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ zIndex: (t) => t.zIndex.drawer + 2 }}
          slotProps={{ paper: { sx: { width: FULL_W, maxWidth: '85vw' } } }}>{nav}</Drawer>
      )}

      <Box component="main" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', pt: `${APPBAR_H}px`, height: '100vh' }}>
        {children}
      </Box>
    </Box>
  );
}
