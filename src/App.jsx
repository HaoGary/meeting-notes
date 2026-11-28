import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, CircularProgress, Stack, Typography } from '@mui/material';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { createApi, devLogin, devUsers, resetDb, simulateOtherUserEdit, DemoPanel } from './services/api';
import { features } from './services/config';
import { MEETING_STATUS } from './services/seed';
import { clearToken, getToken, setToken } from './services/session';
import LoginPage from './pages/auth/LoginPage';
import { deviceLabel } from './utils/device';
import AppShell from './components/layout/AppShell';
import NotificationBell from './components/layout/NotificationBell';
import MeetingListPage from './pages/meetings/MeetingListPage';
import { AppDialog, useToast } from './components/common/ui';
// ── 依頁面分割程式碼：首頁（會議列表）與登入頁直接載入，其他頁面進入時才下載 ──
// 會議編輯頁含 Tiptap 編輯器；圖片向量化含 WebAssembly 引擎；後台、帳號設定、其他登入流程頁面使用頻率較低
const loadMeetingPage = () => import('./pages/meetings/MeetingPage');
const MeetingPage = lazy(loadMeetingPage);
const SharePage = lazy(() => import('./pages/meetings/SharePage'));
const loadNewMeeting = () => import('./components/meetings/NewMeetingDialog');
const loadAccounts = () => import('./pages/admin/AccountsPage');
const loadPermissions = () => import('./pages/admin/PermissionsPage');
const loadAccountSettings = () => import('./pages/account/AccountSettingsPage');
const prefetchPages = [loadNewMeeting, loadAccounts, loadPermissions, loadAccountSettings];
const NewMeetingDialog = lazy(loadNewMeeting);
const AccountsPage = lazy(loadAccounts);
const PermissionsPage = lazy(loadPermissions);
const AccountSettingsPage = lazy(loadAccountSettings);
const VectorizePage = lazy(() => import('./pages/tools/VectorizePage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));
const ConfirmLinkPage = lazy(() => import('./pages/auth/VerifyEmailPage').then((m) => ({ default: m.ConfirmLinkPage })));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const ForceChangePasswordPage = lazy(() => import('./pages/auth/ForceChangePasswordPage'));
// 頁面程式碼下載中：與既有的載入畫面相同（置中轉圈）
const PageLoading = ({ full }) => (
  <Stack flex={1} height={full ? '100vh' : undefined} minHeight={full ? undefined : 240} alignItems="center" justifyContent="center"><CircularProgress size={28} /></Stack>
);
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
  const [newMounted, setNewMounted] = useState(false);
  useEffect(() => { if (newOpen) setNewMounted(true); }, [newOpen]);
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
    endSession({ severity: 'warning', msg: ['ACCOUNT_DISABLED', 'SESSION_REVOKED'].includes(e.code) ? e.message : '登入已逾時或已在其他地方登出，請重新登入' }, true, me?.user?.username);
  };

  const usersAt = useRef(0); // 使用者名單上次更新時間（避免切換頁面時重複抓取）
  const loadMe = useCallback(async ({ withList = false } = {}) => {
    try {
      const m = await api.me();
      if (m.user.mustChangePassword) { setMe(m); return false; } // 先完成變更密碼
      // 使用者名單與會議列表同時抓取（原本依序等待）
      const [u] = await Promise.all([api.listUsers(), withList ? loadListRef.current() : null]);
      usersAt.current = Date.now();
      setMe(m); setUsers(u);
      return true;
    } catch { return false; }
  }, [api]);
  const loadListRef = useRef(null);
  // silent：背景更新（例如收到他人變動通知），不顯示載入中、失敗也不跳提示
  const loadList = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try { setMeetings(await api.listMeetings()); } catch (e) { if (e.status !== 401 && !silent) toast(e.message, 'error'); }
    if (!silent) setLoading(false);
  }, [api, toast]);
  loadListRef.current = loadList;

  // ── 登入狀態守門：帳號被停用、或這台裝置被強制登出時立即登出（每分鐘、切回分頁時檢查） ──
  const signedIn = !!me?.user && !me.user.mustChangePassword;
  useEffect(() => {
    if (!signedIn) return undefined;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      const ok = await api.sessionOk().catch(() => null);
      busy = false;
      if (ok === false) unauthorizedRef.current({ code: 'SESSION_REVOKED', message: '你已被登出：帳號已停用，或已從其他裝置登出。如有疑問請聯絡系統管理員。' });
    };
    const t = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, [signedIn, api]);

  // 登入後預先下載常用頁面的程式碼（與會議列表同時進行），之後切換頁面不必等待下載
  // 會議編輯頁立即開始；其他較小的頁面在瀏覽器閒置時下載。圖片向量化（較大）不預載。
  useEffect(() => {
    if (!signedIn) return undefined;
    loadMeetingPage().catch(() => {});
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => {
      prefetchPages.forEach((load) => load().catch(() => {}));
    });
    return () => cancel(id);
  }, [signedIn]);

  // 不在列表時收到的變動：回到列表（含上一頁、改網址）時背景更新
  const listStale = useRef(false);
  useEffect(() => {
    if (route.page === 'meetings' && listStale.current && signedIn) { listStale.current = false; loadList({ silent: true }); }
  }, [route.page, signedIn, loadList]);

  // ── 會議列表即時更新：他人新增、修改、刪除會議或調整參與人員時自動重新整理 ──
  useEffect(() => {
    if (!signedIn || !api.realtime) return undefined;
    let t = null;
    // 只有正在看會議列表時才立即重抓；在其他頁面時，回到列表會自動更新（避免多人編輯時每台都不斷重抓）
    const off = api.realtime.onMeetingsChange(() => {
      if (routeRef.current.page !== 'meetings') { listStale.current = true; return; }
      clearTimeout(t); t = setTimeout(() => loadList({ silent: true }), 600);
    });
    return () => { clearTimeout(t); off(); };
  }, [signedIn, api, loadList]);

  // ── 從信件連結回來的提示（變更 Email） ──
  useEffect(() => {
    if (!signedIn) return;
    let n = null; try { n = sessionStorage.getItem('mn-auth-notice'); sessionStorage.removeItem('mn-auth-notice'); } catch {}
    if (n === 'email-changed') { toast('Email 已變更，之後請用新的 Email 登入', 'success'); setReloadKey((k) => k + 1); }
    else if (n === 'email-change-half') toast('已確認其中一個信箱。請到另一個信箱點擊確認連結，完成後 Email 才會變更', 'info');
  }, [signedIn]); // eslint-disable-line

  useEffect(() => {
    if (!token) { setMe(null); return; }
    setMe(null);
    loadMe({ withList: true });
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

  // 不開放自行註冊時，註冊頁一律導回登入頁
  useEffect(() => { if (route.page === 'register' && !features.selfSignup) setRoute({ page: 'login' }); }, [route.page]);

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
  // 使用者名單（主持人、參與人員選單用）：進入會議相關頁面時重新抓取，帳號管理新增或停用的人會立即反映
  // 30 秒內已抓過就不重抓；離開帳號管理頁時一律重抓（新增、停用的帳號立即反映）
  const refreshUsers = useCallback((force = false) => {
    if (!force && Date.now() - usersAt.current < 30_000) return Promise.resolve();
    usersAt.current = Date.now();
    return api.listUsers().then(setUsers).catch(() => { usersAt.current = 0; });
  }, [api]);
  const prevPage = useRef(route.page);
  useEffect(() => {
    if (prevPage.current === 'accounts' && route.page !== 'accounts') usersAt.current = 0;
    prevPage.current = route.page;
  }, [route.page]);
  // 回到會議列表：已有資料時先顯示，背景更新（不再整頁顯示載入中）
  const navigate = (r) => guard(() => { setRoute(r); if (r.page === 'meetings') loadList({ silent: meetings.length > 0 }); });
  // 不論是點選單、點通知、改網址或按上一頁，只要進入會議列表或會議頁就更新名單
  const hasMe = !!me;
  useEffect(() => {
    if (hasMe && ['meetings', 'meeting'].includes(route.page)) refreshUsers();
  }, [hasMe, route.page, route.id, refreshUsers]);
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
    try { await api.updateMeeting(id, { status }); toast(`已變更為「${MEETING_STATUS[status]}」`); loadList({ silent: true }); }
    catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (id) => {
    try { await api.deleteMeeting(id); toast('已刪除會議'); loadList({ silent: true }); }
    catch (e) { toast(e.message, 'error'); }
  };
  const onMeetingChanged = useCallback((m) => setMeetings((list) => list.map((x) => (x.id === m.id ? { ...x, ...m } : x))), []);

  const demo = features.demoPanel && DemoPanel && (
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
      onSimulateEdit={() => { if (simulateOtherUserEdit(route.id)) toast('已模擬林怡君更新內容', 'info'); }}
      onReset={() => { resetDb(); endSession(null, false); setReloadKey((k) => k + 1); toast('已重置示範資料，請重新登入'); }} />
  );

  // ── 公開頁 ──
  const authProps = { api, go };
  let publicView = null;
  if (route.page === 'login') publicView = <LoginPage key={route.prefill || 'login'} {...authProps} onLoggedIn={onLoggedIn} notice={notice} prefill={route.prefill} />;
  if (route.page === 'register' && features.selfSignup) publicView = <RegisterPage {...authProps} />;
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
  if (publicView && !(token && me && ['login', 'register', 'forgot-password'].includes(route.page))) return <><Suspense fallback={<PageLoading full />}>{publicView}</Suspense>{demo}</>;

  // ── 需登入 ──
  if (!token || !me) return <Stack height="100vh" alignItems="center" justifyContent="center"><CircularProgress size={28} />{demo}</Stack>;
  const currentUser = me.user;
  // 使用臨時密碼登入：必須先設定新密碼（後端也會拒絕其他 API）
  if (currentUser.mustChangePassword) {
    return <><Suspense fallback={<PageLoading full />}><ForceChangePasswordPage api={api} user={currentUser} onLogout={logout}
      onDone={() => { loadMe({ withList: true }); setRoute(pending && !AUTH_PAGES.includes(pending.page) ? pending : routeRef.current); }} /></Suspense>{demo}</>;
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
    <AppShell page={route.page} onNavigate={(key) => navigate({ page: key })} user={currentUser} permissions={me.permissions} onLogout={logout}
      notifications={<NotificationBell key={currentUser.id} api={api} onOpenMeeting={openMeeting} />}>
      <Suspense fallback={<PageLoading />}>
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
      {route.page === 'vectorize' && <VectorizePage api={api} canUseAi={can('tools.vectorize_ai')} />}
      {route.page === 'account' && <AccountSettingsPage key={currentUser.id} api={api} user={currentUser} onUpdated={() => { loadMe(); }} />}
      </Suspense>

      {/* 新增會議對話框：第一次開啟時才下載，之後保留以維持關閉動畫 */}
      {newMounted && <Suspense fallback={null}><NewMeetingDialog open={newOpen} onClose={() => setNewOpen(false)} onCreate={create} /></Suspense>}

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
