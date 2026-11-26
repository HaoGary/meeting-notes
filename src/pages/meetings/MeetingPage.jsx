import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Alert, AvatarGroup, Breadcrumbs, Link, Badge, Box, Button, CircularProgress, Divider, Drawer, IconButton, InputBase, ListItemIcon, Menu, MenuItem,
  Stack, Tab, Tabs, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import NavigateNext from '@mui/icons-material/NavigateNext';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import MoreHoriz from '@mui/icons-material/MoreHoriz';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import LockOutlined from '@mui/icons-material/LockOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutline';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import ShareDialog from '../../components/meetings/ShareDialog';
import RichEditor from '../../features/editor/RichEditor';
import { useAutosave, combineStatus } from '../../hooks/useAutosave';
import { MEETING_STATUS } from '../../services/seed';
import MeetingMeta from '../../components/meetings/MeetingMeta';
import HistoryPanel from '../../components/meetings/HistoryPanel';
import { AppDialog, SaveStatus, StatusChip, UserAvatar, fmtDate, fmtRel, useToast } from '../../components/common/ui';

const mergePatch = (a, b) => ({ ...a, ...b });
const PANEL_W = 340;

const MeetingPage = forwardRef(function MeetingPage({ api, meetingId, users, currentUser, onBack, onMeetingChanged, onDeleted, onOpenShare }, ref) {
  const toast = useToast();
  const wide = useMediaQuery((t) => t.breakpoints.up('lg'));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [panel, setPanel] = useState(null); // 'history' | null
  // 會議資料收合狀態：記住使用者偏好（僅存於本機）
  const [metaCollapsed, setMetaCollapsed] = useState(() => { try { return localStorage.getItem('mn-meta-collapsed') === '1'; } catch { return false; } });
  const toggleMeta = () => setMetaCollapsed((c) => { try { localStorage.setItem('mn-meta-collapsed', c ? '0' : '1'); } catch {} return !c; });
  const [menuEl, setMenuEl] = useState(null);
  const [statusEl, setStatusEl] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const versionRef = useRef(0);

  // ── 載入 ──
  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    api.getMeeting(meetingId)
      .then((d) => { if (!alive) return; versionRef.current = d.content.version; setData(d); })
      .catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [api, meetingId]);

  // ── 自動儲存：內容 & 基本資料分開 ──
  const content = useAutosave(async (doc) => {
    const r = await api.saveContent(meetingId, doc, versionRef.current);
    versionRef.current = r.version;
    setData((d) => d && { ...d, content: { ...d.content, version: r.version, doc } });
  }, { delay: 1500 });

  const meta = useAutosave(async (patch) => {
    const m = await api.updateMeeting(meetingId, patch);
    onMeetingChanged(m);
  }, { delay: 1000, merge: mergePatch });

  const status = combineStatus(content, meta);
  const retryAll = () => { content.retry(); meta.retry(); };

  useImperativeHandle(ref, () => ({
    isDirty: () => content.isDirty() || meta.isDirty(),
    flush: async () => (await Promise.all([content.flush(), meta.flush()])).every(Boolean),
  }), [content, meta]);

  // 關閉分頁 / 重新整理前提醒
  useEffect(() => {
    const h = (e) => { if (content.isDirty() || meta.isDirty()) { content.flush(); meta.flush(); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [content, meta]);

  const onUploadImage = useCallback((file) => api.uploadImage(meetingId, file), [api, meetingId]);

  const backBtn = <Tooltip title="返回列表"><IconButton onClick={onBack} aria-label="返回會議列表" edge="start" sx={{ alignSelf: 'center' }}><ArrowBack /></IconButton></Tooltip>;

  if (error) {
    return (
      <Stack flex={1} alignItems="center" justifyContent="center" gap={1.25} p={3} textAlign="center">
        {error.status === 403 ? <LockOutlined sx={{ fontSize: 36, color: 'text.disabled' }} /> : <ErrorOutline sx={{ fontSize: 36, color: 'error.main' }} />}
        <Typography variant="h6">{error.status === 403 ? '沒有存取權限' : '無法載入會議'}</Typography>
        <Typography color="text.secondary">{error.message}</Typography>
        <Button variant="outlined" startIcon={<ArrowBack />} onClick={onBack} sx={{ mt: 1 }}>返回會議列表</Button>
      </Stack>
    );
  }
  if (!data) return <Stack flex={1} alignItems="center" justifyContent="center" gap={1.5}><CircularProgress size={28} /><Typography color="text.secondary">載入會議中…</Typography></Stack>;

  const { meeting, attendees, permission, canArchive, canDelete, canShare } = data;
  const archived = meeting.status === 'archived';
  const canEdit = permission === 'editor' && !archived;
  const canStatus = permission === 'editor';
  const host = users.find((u) => u.id === meeting.hostId);

  const patchMeeting = (patch, now = false) => {
    setData((d) => ({ ...d, meeting: { ...d.meeting, ...patch } }));
    meta.schedule(patch);
    if (now) meta.flush().then((ok) => ok && patch.status && toast(`已變更為「${MEETING_STATUS[patch.status]}」`));
  };
  const onMetaChange = (patch) => patchMeeting(patch, 'status' in patch);

  const setAttendees = async (list) => {
    const prev = data.attendees;
    setData((d) => ({ ...d, attendees: list }));
    try { await api.setAttendees(meetingId, list); }
    catch (e) { setData((d) => ({ ...d, attendees: prev })); toast(e.message, 'error'); }
  };

  const doDelete = async () => {
    try { content.discard(); meta.discard(); await api.deleteMeeting(meetingId); toast('已刪除會議'); onDeleted(meetingId); }
    catch (e) { toast(e.message, 'error'); }
    setConfirmDel(false);
  };

  // ── 衝突處理 ──
  const conflict = content.status === 'conflict' ? content.error?.data : null;
  const loadServer = () => {
    content.discard();
    versionRef.current = conflict.version;
    setData((d) => ({ ...d, content: conflict }));
    setEditorKey((k) => k + 1);
    toast('已載入最新版本');
  };
  const keepMine = () => { versionRef.current = conflict.version; content.retry(); };
  const conflictUser = conflict && users.find((u) => u.id === conflict.updatedBy);
  const togglePanel = (p) => setPanel((cur) => (cur === p ? null : p));
  const menuAction = (fn) => () => { setMenuEl(null); fn(); };

  const panelContent = panel && (
    <Box sx={{ width: { xs: '100vw', sm: PANEL_W }, height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
      <Stack direction="row" alignItems="center" sx={{ borderBottom: 1, borderColor: 'divider', pl: 2, pr: 0.5, minHeight: 48 }}>
        <Typography fontWeight={600} fontSize={14} flex={1}>修改紀錄</Typography>
        <IconButton size="small" onClick={() => setPanel(null)} aria-label="關閉面板"><CloseIcon fontSize="small" /></IconButton>
      </Stack>
      <HistoryPanel api={api} meetingId={meetingId} users={users} refreshKey={status.savedAt} />
    </Box>
  );

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* ── 上方：名稱、日期、狀態、操作 ── */}
      <Stack component="header" direction="row" alignItems="center" gap={1}
        sx={{ px: { xs: 1, md: 2 }, py: 1, minHeight: 60, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        {backBtn}
        {/* 標題寬度隨文字自動伸縮（CSS grid 疊層技巧） */}
        <Box data-value={meeting.title || '未命名會議'}
          sx={{ display: 'inline-grid', minWidth: 0, maxWidth: 'min(620px, 100%)', flex: '0 1 auto',
            '&::after, & .MuiInputBase-root': { gridArea: '1 / 1', fontSize: 18, fontWeight: 650, px: 0.75 },
            '&::after': { content: 'attr(data-value) "  "', visibility: 'hidden', whiteSpace: 'pre', overflow: 'hidden', height: 0, fontFamily: 'inherit' } }}>
          <InputBase value={meeting.title} disabled={!canEdit} placeholder="未命名會議" inputProps={{ 'aria-label': '會議名稱', size: 1 }}
            onChange={(e) => patchMeeting({ title: e.target.value })}
            sx={{ minWidth: 0, borderRadius: 1.5,
              '&:hover:not(.Mui-disabled), &.Mui-focused': { bgcolor: 'background.default' },
              '&.Mui-disabled': { color: 'text.primary' }, '& input.Mui-disabled': { WebkitTextFillColor: 'currentColor' },
              '& input': { textOverflow: 'ellipsis', p: '4px 0', width: '100%' } }} />
        </Box>
        <Tooltip title={canStatus ? '變更狀態' : ''}>
          <Box component="button" type="button" disabled={!canStatus} onClick={(e) => setStatusEl(e.currentTarget)} aria-label="會議狀態"
            sx={{ border: 0, p: 0, bgcolor: 'transparent', cursor: canStatus ? 'pointer' : 'default', display: 'flex', flex: 'none' }}>
            <StatusChip status={meeting.status} />
          </Box>
        </Tooltip>
        <Menu anchorEl={statusEl} open={!!statusEl} onClose={() => setStatusEl(null)}>
          {Object.entries(MEETING_STATUS).map(([k, v]) => (
            <MenuItem key={k} selected={meeting.status === k} disabled={(k === 'archived' || archived) && k !== meeting.status && !canArchive}
              onClick={() => { setStatusEl(null); if (k !== meeting.status) onMetaChange({ status: k }); }}>
              <StatusChip status={k} /><Typography sx={{ ml: 1, fontSize: 13, color: 'text.secondary' }}>{v === '已封存' ? '唯讀' : v === '草稿' ? '編輯中' : '會議已結束'}</Typography>
            </MenuItem>
          ))}
        </Menu>

        <Box flex={1} />

        <Tooltip title={`最後更新：${fmtRel(meeting.updatedAt)}`}>
          <Box sx={{ display: 'flex' }}><SaveStatus {...status} onRetry={retryAll} /></Box>
        </Tooltip>
        {canShare && (
          <Button variant="outlined" size="small" startIcon={<ShareOutlined sx={{ fontSize: '17px !important' }} />} onClick={() => setShareOpen(true)}
            sx={{ height: 34, mx: 0.5, display: { xs: 'none', sm: 'inline-flex' } }}>分享</Button>
        )}
        <Tooltip title="修改紀錄">
          <IconButton color={panel ? 'primary' : 'default'} onClick={() => setPanel((p) => (p ? null : 'history'))} aria-label="修改紀錄">
            <HistoryOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="更多"><IconButton onClick={(e) => setMenuEl(e.currentTarget)} aria-label="更多"><MoreHoriz fontSize="small" /></IconButton></Tooltip>
        <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          {canShare && <MenuItem onClick={menuAction(() => setShareOpen(true))} sx={{ display: { sm: 'none' } }}><ListItemIcon><ShareOutlined fontSize="small" /></ListItemIcon>分享</MenuItem>}
          <MenuItem disabled={!canEdit} onClick={menuAction(() => { content.flush(); meta.flush(); toast('已立即儲存'); })}><ListItemIcon><SaveOutlined fontSize="small" /></ListItemIcon>立即儲存</MenuItem>
          {canDelete && <Divider />}
          {canDelete && (
            <MenuItem onClick={menuAction(() => setConfirmDel(true))} sx={{ color: 'error.main' }}>
              <ListItemIcon><DeleteOutline fontSize="small" color="error" /></ListItemIcon>刪除會議
            </MenuItem>
          )}
        </Menu>
      </Stack>

      {permission !== 'editor' && <Alert severity="info" icon={<LockOutlined fontSize="small" />} sx={{ borderRadius: 0, py: 0 }}>您對此會議僅有檢視權限，內容由後端鎖定為唯讀。</Alert>}
      {archived && permission === 'editor' && (
        <Alert severity="warning" icon={<ArchiveOutlined fontSize="small" />} sx={{ borderRadius: 0, py: 0 }}
          action={canArchive && <Button color="inherit" size="small" onClick={() => onMetaChange({ status: 'done' })}>取消封存</Button>}>
          此會議已封存，內容為唯讀。
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box component="main" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <MeetingMeta meeting={meeting} attendees={attendees} users={users} editable={canEdit}
            onChange={onMetaChange} onAttendees={setAttendees} collapsed={metaCollapsed} onToggle={toggleMeta} />
          <RichEditor key={`${meetingId}-${editorKey}`} initialContent={data.content.doc} editable={canEdit}
            onChange={(doc) => content.schedule(doc)} onSave={() => content.flush()}
            onUploadImage={onUploadImage} onError={(m) => toast(m, 'error')} placeholder="在此輸入會議內容…" speechToText tidy aiPolish onNotify={toast} />
        </Box>

        {wide
          ? panel && <Box sx={{ borderLeft: 1, borderColor: 'divider', display: 'flex' }}>{panelContent}</Box>
          : <Drawer anchor="right" open={!!panel} onClose={() => setPanel(null)}>{panelContent}</Drawer>}
      </Box>

      <AppDialog open={!!conflict} title="內容衝突" maxWidth="sm"
        actions={<>
          <Button color="inherit" onClick={loadServer}>載入最新版本</Button>
          <Button variant="contained" onClick={keepMine}>以我的版本覆蓋</Button>
        </>}>
        <Typography mb={1.5}><b>{conflictUser?.name || '其他使用者'}</b> 在 {conflict && fmtRel(conflict.updatedAt)} 更新了這份會議紀錄（版本 {conflict?.version}），與您正在編輯的版本不同。</Typography>
        <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75 } }}>
          <li><b>載入最新版本</b>：放棄您尚未儲存的修改，改看對方的內容。</li>
          <li><b>以我的版本覆蓋</b>：保留您的內容並覆蓋對方的修改（對方的版本仍保留在修改紀錄中）。</li>
        </Box>
      </AppDialog>

      {canShare && (
        <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} api={api} meetingId={meetingId} title={meeting.title}
          onPreview={async (token) => { setShareOpen(false); await Promise.all([content.flush(), meta.flush()]); onOpenShare(token); }} />
      )}

      <AppDialog open={confirmDel} title="刪除會議紀錄" onClose={() => setConfirmDel(false)}
        actions={<>
          <Button color="inherit" onClick={() => setConfirmDel(false)}>取消</Button>
          <Button variant="contained" color="error" onClick={doDelete}>確認刪除</Button>
        </>}>
        <Typography mb={1}>確定要刪除「{meeting.title}」嗎？會議內容與修改紀錄將一併刪除，此操作無法復原。</Typography>
        <Typography fontSize={13} color="text.disabled">若只是不想再看到，建議改用「封存」。</Typography>
      </AppDialog>
    </Box>
  );
});

export default MeetingPage;
