import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, CircularProgress, Stack, Typography } from '@mui/material';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { createApi, devLogin, devUsers, resetDb, simulateOtherUserEdit } from './services/api';
import { features } from './services/config';
import { MEETING_STATUS } from './services/seed';
import { clearToken, getToken, setToken } from './services/session';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import VerifyEmailPage, { ConfirmLinkPage } from './pages/auth/VerifyEmailPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import ForceChangePasswordPage from './pages/auth/ForceChangePasswordPage';
import AccountSettingsPage from './pages/account/AccountSettingsPage';
import AccountsPage from './pages/admin/AccountsPage';
import { deviceLabel } from './utils/device';
import AppShell from './components/layout/AppShell';
import MeetingListPage from './pages/meetings/MeetingListPage';
import MeetingPage from './pages/meetings/MeetingPage';
import PermissionsPage from './pages/admin/PermissionsPage';
import SharePage from './pages/meetings/SharePage';
import NewMeetingDialog from './components/meetings/NewMeetingDialog';
import DemoPanel from './dev/DemoPanel';
import { AppDialog, useToast } from './components/common/ui';
import { AUTH_PAGES, HOME, PENDING_EMAIL, PUBLIC_PAGES, parseHash, toHash } from './router/hashRoutes';

export default function App() {
  const toast = useToast();
  const [token, setTokenState] = useState(getToken);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const unauthorizedRef = useRef(() => {});
  const signedOutRef = useRef(() => {});
  const api = useMemo(() => createApi(() => tokenRef.current, {
    onUnauthorized: (e) => unauthorizedRef.current(e),
    onSignedOut: () => signedOutRef.current(),
  }), []);

  const [me, setMe] = useState(null); // { user, permissions }
  const [users, setUsers] = useState([]);
  const [route, setRoute] = useState(parseHash);
  const routeRef = useRef(route);
  routeRef.current = route;
  const [pending, setPending] = useState(null); // 登入後要回到的頁面
  const [notice, setNotice] = useState(null);   // 登入頁提示（逾時、停用…）
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [returnTo, setReturnTo] = useState(null);
  const pageRef = useRef(null);
  const can = (p) => !!me?.permissions?.includes(p);
  const isPublic = PUBLIC_PAGES.includes(route.page);

  // ── Session ──
  const endSession = useCallback((nextNotice, keepRoute, prefill) => {
    clearToken(); tokenRef.current = null; setTokenState(null); setMe(null); setUsers([]); setMeetings([]);
    pageRef.current = null;
    setNotice(nextNotice || null);
    const r = routeRef.current;
    if (PUBLIC_PAGES.includes(r.page)) return;
    if (keepRoute) setPending(r);
    setRoute({ page: 'login', prefill });
  }, []);
  signedOutRef.current = () => { if (tokenRef.current) endSession(null, false); };
  unauthorizedRef.current = (e) => {
    if (!tokenRef.current) return;
    endSession({ severity: 'warning', msg: e.code === 'ACCOUNT_DISABLED' ? e.message : '登入已逾時或已在其他地方登出，請重新登入' }, true, me?.user?.username);
  };

  const loadMe = useCallback(async () => {
    try {
      const m = await api.me();
      if (m.user.mustChangePassword) { setMe(m); return false; } // 先完成變更密碼
      const u = await api.listUsers();
      setMe(m); setUsers(u);
      return true;
    } catch { return false; }
  }, [api]);
  const loadList = useCallback(async () => {
    setLoading(true);
    try { setMeetings(await api.listMeetings()); } catch (e) { if (e.status !== 401) toast(e.message, 'error'); }
    setLoading(false);
  }, [api, toast]);

  useEffect(() => {
    if (!token) { setMe(null); return; }
    setMe(null);
    loadMe().then((ok) => ok && loadList());
  }, [token, reloadKey]); // eslint-disable-line

  // 未登入卻進入需登入的頁面 → 導向登入並記住原頁；已登入卻在登入/註冊頁 → 回首頁
  useEffect(() => {
    if (!token && !isPublic) { setPending(route); setRoute({ page: 'login' }); }
    else if (token && me && ['login', 'register', 'forgot-password'].includes(route.page)) setRoute(HOME);
  }, [token, me, route, isPublic]);

  const onLoggedIn = (tk, remember, name) => {
    setToken(tk, remember); tokenRef.current = tk; setTokenState(tk);
    setNotice(null);
    toast(`登入成功，歡迎回來 ${name}`);
    const next = pending && !AUTH_PAGES.includes(pending.page) ? pending : HOME;
    setPending(null); setRoute(next);
  };
  const logout = () => guard(async () => {
    try { await api.auth.logout(tokenRef.current); } catch {}
    endSession(null, false);
    setPending(null);
    toast('已登出');
  });

  // ── 網址同步 ──
  useEffect(() => { const h = toHash(route); if (location.hash.slice(1) !== h) location.hash = h; }, [route]);
  useEffect(() => {
    const onHash = () => {
      const next = parseHash();
      if (toHash(next) === toHash(route)) return;
      guard(() => setRoute(next), () => { location.hash = toHash(route); });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  // 離開編輯頁前先儲存；失敗時詢問
  const guard = async (action, onCancel) => {
    if (route.page === 'meeting' && pageRef.current?.isDirty()) {
      const ok = await pageRef.current.flush();
      if (!ok) { setLeaveTarget({ action, onCancel }); return; }
    }
    action();
  };
  const go = (r) => {
    if (r.page === 'verify-email' && r.email) { try { sessionStorage.setItem(PENDING_EMAIL, r.email); } catch {} }
    if (r.page !== 'login') setNotice(null);
    setRoute(r);
  };
  const navigate = (r) => guard(() => { setRoute(r); if (r.page === 'meetings') loadList(); });
  const openMeeting = (id) => navigate({ page: 'meeting', id });
  const openShare = (tk) => { setReturnTo(route); setRoute({ page: 'share', token: tk }); };

  const create = async (f) => {
    try {
      const m = await api.createMeeting(f);
      setNewOpen(false); toast('已建立會議');
      navigate({ page: 'meeting', id: m.id });
      return true;
    } catch (e) { toast(e.message, 'error'); return false; }
  };
  const setStatus = async (id, status) => {
    try { await api.updateMeeting(id, { status }); toast(`已變更為「${MEETING_STATUS[status]}」`); loadList(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (id) => {
    try { await api.deleteMeeting(id); toast('已刪除會議'); loadList(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const onMeetingChanged = useCallback((m) => setMeetings((list) => list.map((x) => (x.id === m.id ? { ...x, ...m } : x))), []);

  const demo = features.demoPanel && (
    <DemoPanel users={devUsers()} currentUserId={me?.user?.id || 'guest'} meetingOpen={route.page === 'meeting'}
      onUser={(id) => guard(async () => {
        if (id === 'guest') { if (tokenRef.current) { await api.auth.logout(tokenRef.current); endSession(null, false); } toast('已登出（訪客）'); return; }
        const u = devUsers().find((x) => x.id === id);
        if (!u.active) { toast(`「${u.name}」已停用，請改用登入頁體驗停用提示`, 'error'); return; }
        const s = await devLogin(id, deviceLabel());
        setToken(s.token, false); tokenRef.current = s.token; setTokenState(s.token);
        if (route.page === 'meeting' || AUTH_PAGES.includes(route.page)) setRoute(HOME);
        toast(`已登入為 ${u.name}`);
      })}
      onOpenLink={(hash) => { location.hash = hash; }}
      onSimulateEdit={() => { if (simulateOtherUserEdit(route.id)) toast('林怡君已更新內容。請在編輯器輸入文字，自動儲存時會偵測到衝突', 'info'); }}
      onReset={() => { resetDb(); endSession(null, false); setReloadKey((k) => k + 1); toast('已重置示範資料，請重新登入'); }} />
  );

  // ── 公開頁 ──
  const authProps = { api, go };
  let publicView = null;
  if (route.page === 'login') publicView = <LoginPage key={route.prefill || 'login'} {...authProps} onLoggedIn={onLoggedIn} notice={notice} prefill={route.prefill} />;
  if (route.page === 'register') publicView = <RegisterPage {...authProps} />;
  if (route.page === 'verify-email') publicView = <VerifyEmailPage key={route.email} {...authProps} email={route.email} resend={route.resend} />;
  if (route.page === 'confirm') publicView = <ConfirmLinkPage key={route.token} {...authProps} token={route.token} />;
  if (route.page === 'forgot-password') publicView = <ForgotPasswordPage {...authProps} />;
  if (route.page === 'reset') publicView = <ResetPasswordPage key={route.token} {...authProps} token={route.token} />;
  if (route.page === 'share') {
    publicView = (
      <SharePage key={`${route.token}-${token}-${reloadKey}`} api={api} token={route.token}
        onLogin={() => { setPending(route); go({ page: 'login' }); }}
        onBackToApp={me?.user ? () => { const r = returnTo || HOME; setReturnTo(null); setRoute(r); if (r.page === 'meetings') loadList(); } : null} />
    );
  }
  if (publicView && !(token && me && ['login', 'register', 'forgot-password'].includes(route.page))) return <>{publicView}{demo}</>;

  // ── 需登入 ──
  if (!token || !me) return <Stack height="100vh" alignItems="center" justifyContent="center"><CircularProgress size={28} />{demo}</Stack>;
  const currentUser = me.user;
  // 使用臨時密碼登入：必須先設定新密碼（後端也會拒絕其他 API）
  if (currentUser.mustChangePassword) {
    return <><ForceChangePasswordPage api={api} user={currentUser} onLogout={logout}
      onDone={() => { loadMe().then(() => loadList()); setRoute(pending && !AUTH_PAGES.includes(pending.page) ? pending : routeRef.current); }} />{demo}</>;
  }
  const noAccess = (perm) => (
    <Stack flex={1} alignItems="center" justifyContent="center" gap={1.25} p={3} textAlign="center">
      <LockOutlined sx={{ fontSize: 36, color: 'text.disabled' }} />
      <Typography variant="h6">沒有存取權限</Typography>
      <Typography color="text.secondary">需要「{perm}」權限才能進入此頁面，請聯絡系統管理員。</Typography>
      <Button variant="outlined" onClick={() => navigate(HOME)} sx={{ mt: 1 }}>回到會議紀錄</Button>
    </Stack>
  );

  return (
    <AppShell page={route.page} onNavigate={(key) => navigate({ page: key })} user={currentUser} permissions={me.permissions} onLogout={logout}>
      {route.page === 'meetings' && (
        <MeetingListPage api={api} onOpenShare={openShare} meetings={meetings} loading={loading} users={users} canCreate={can('meeting.create')}
          onOpen={openMeeting} onNew={() => setNewOpen(true)} onSetStatus={setStatus} onDelete={remove} />
      )}
      {route.page === 'meeting' && (
        <MeetingPage key={`${currentUser.id}-${route.id}-${reloadKey}`} ref={pageRef} api={api} meetingId={route.id} users={users}
          currentUser={currentUser} onBack={() => navigate(HOME)} onMeetingChanged={onMeetingChanged} onOpenShare={openShare}
          onDeleted={() => { pageRef.current = null; setRoute(HOME); loadList(); }} />
      )}
      {route.page === 'permissions' && (can('system.permissions')
        ? <PermissionsPage key={currentUser.id + reloadKey} api={api} currentUser={currentUser} onChanged={() => { loadMe(); }} />
        : noAccess('權限管理'))}
      {route.page === 'accounts' && (can('system.accounts')
        ? <AccountsPage key={currentUser.id + reloadKey} api={api} currentUser={currentUser} canSetRole={can('system.permissions')} />
        : noAccess('帳號管理'))}
      {route.page === 'account' && <AccountSettingsPage key={currentUser.id} api={api} user={currentUser} onUpdated={() => { loadMe(); }} />}

      <NewMeetingDialog open={newOpen} onClose={() => setNewOpen(false)} onCreate={create} />

      <AppDialog open={!!leaveTarget} title="尚有未儲存的變更" onClose={() => { leaveTarget?.onCancel?.(); setLeaveTarget(null); }}
        actions={<>
          <Button color="inherit" onClick={() => { leaveTarget.onCancel?.(); setLeaveTarget(null); }}>留在此頁</Button>
          <Button color="error" onClick={() => { const a = leaveTarget.action; setLeaveTarget(null); a(); }}>捨棄並離開</Button>
          <Button variant="contained" onClick={async () => { const ok = await pageRef.current?.flush(); if (ok) { const a = leaveTarget.action; setLeaveTarget(null); a(); } else toast('仍無法儲存，請檢查網路', 'error'); }}>重新儲存</Button>
        </>}>
        <Typography>最近的修改尚未成功儲存到伺服器。離開將會遺失這些內容。</Typography>
      </AppDialog>

      {demo}
    </AppShell>
  );
}
