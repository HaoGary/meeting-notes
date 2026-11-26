// 預覽用假資料。正式環境由後端資料庫提供。
// ── 權限定義（後端以此 key 驗證） ─────────────────────────
export const PERMISSIONS = [
  { key: 'meeting.view_all', group: '會議', label: '檢視所有會議', desc: '未被邀請的會議也能檢視' },
  { key: 'meeting.create', group: '會議', label: '建立會議', desc: '新增會議紀錄' },
  { key: 'meeting.edit_all', group: '會議', label: '編輯所有會議', desc: '不需是主持人或參與者也能編輯' },
  { key: 'meeting.archive', group: '會議', label: '封存會議', desc: '封存或取消封存可編輯的會議' },
  { key: 'meeting.share', group: '會議', label: '分享會議', desc: '為可編輯的會議建立唯讀分享連結' },
  { key: 'meeting.delete_own', group: '會議', label: '刪除自己的會議', desc: '自己建立或主持的會議' },
  { key: 'meeting.delete_all', group: '會議', label: '刪除所有會議', desc: '包含他人建立的會議' },
  { key: 'system.accounts', group: '系統', label: '帳號管理', desc: '新增、編輯、停用帳號，重設他人密碼' },
  { key: 'system.permissions', group: '系統', label: '權限管理', desc: '設定角色權限與指派使用者角色' },
];
const ALL = PERMISSIONS.map((p) => p.key);

export const SEED_ROLES = [
  { id: 'admin', name: '系統管理員', desc: '擁有所有權限，無法修改', locked: true, color: '#4f46e5', permissions: ALL },
  { id: 'manager', name: '會議管理者', desc: '可檢視與管理所有會議', color: '#0891b2',
    permissions: ['meeting.view_all', 'meeting.create', 'meeting.edit_all', 'meeting.archive', 'meeting.share', 'meeting.delete_own', 'meeting.delete_all'] },
  { id: 'member', name: '一般成員', desc: '可建立會議，編輯受邀的會議', color: '#059669',
    permissions: ['meeting.create', 'meeting.archive', 'meeting.share', 'meeting.delete_own'] },
  { id: 'viewer', name: '唯讀成員', desc: '只能檢視受邀的會議', color: '#6b7280', permissions: [] },
];

// 示範帳號密碼皆為 DEMO_PASSWORD；初始化時以 PBKDF2 雜湊後儲存，不保存明文
export const DEMO_PASSWORD = 'Demo1234';
export const SEED_USERS = [
  { id: 'u1', username: 'gary', name: 'Gary Chen', email: 'gary.chen@example.com', roleId: 'admin', active: true, emailVerified: true, color: '#4f46e5' },
  { id: 'u2', username: 'yijun', name: '林怡君', email: 'yijun.lin@example.com', roleId: 'manager', active: true, emailVerified: true, color: '#0891b2' },
  { id: 'u3', username: 'daming', name: '王大明', email: 'daming.wang@example.com', roleId: 'member', active: true, emailVerified: true, color: '#d97706' },
  { id: 'u4', username: 'xiaohua', name: '陳小華', email: 'xiaohua.chen@example.com', roleId: 'viewer', active: true, emailVerified: true, color: '#db2777' },
  { id: 'u5', username: 'zhiming', name: '張志明', email: 'zhiming.chang@example.com', roleId: 'member', active: true, emailVerified: true, color: '#7c3aed' },
  { id: 'u6', username: 'peishan', name: '李佩珊', email: 'peishan.lee@example.com', roleId: 'member', active: false, emailVerified: true, color: '#65a30d' },
];

export const MEETING_TYPES = ['例行會議', '專案會議', '業務會議', '客戶會議', '內部檢討'];
export const MEETING_STATUS = { draft: '草稿', done: '已完成', archived: '已封存' };

export const defaultTemplate = () => ({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '會議目的' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '討論事項' }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '決議事項' }] },
    { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '待辦事項' }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] },
  ],
});

const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...c) => ({ type: 'paragraph', content: c });
const li = (text) => ({ type: 'listItem', content: [p(t(text))] });
const h2 = (text) => ({ type: 'heading', attrs: { level: 2 }, content: [t(text)] });

export function buildSeed() {
  const now = Date.now();
  const day = 86400000;
  const iso = (d) => new Date(d).toISOString().slice(0, 10);
  const meetings = [
    { id: 'm1', title: '2027 Q1 日本線產品規劃會議', date: iso(now), start: '10:00', end: '11:30', location: '台北總部 8F 大會議室', onlineUrl: 'https://meet.google.com/abc-defg-hij', hostId: 'u1', type: '專案會議', status: 'draft', createdBy: 'u1', createdAt: now - 3 * 3600e3, updatedAt: now - 600e3 },
    { id: 'm2', title: '每週業務例會', date: iso(now - 2 * day), start: '09:30', end: '10:30', location: '線上', onlineUrl: 'https://teams.microsoft.com/l/meetup', hostId: 'u2', type: '例行會議', status: 'done', createdBy: 'u2', createdAt: now - 2 * day, updatedAt: now - 2 * day + 4000e3 },
    { id: 'm3', title: '北海道包團客戶需求訪談', date: iso(now - 6 * day), start: '14:00', end: '15:00', location: '客戶辦公室', onlineUrl: '', hostId: 'u3', type: '客戶會議', status: 'done', createdBy: 'u3', createdAt: now - 6 * day, updatedAt: now - 5 * day },
    { id: 'm4', title: '10 月營運檢討', date: iso(now - 35 * day), start: '15:00', end: '17:00', location: '台北總部 6F', onlineUrl: '', hostId: 'u1', type: '內部檢討', status: 'archived', createdBy: 'u1', createdAt: now - 35 * day, updatedAt: now - 30 * day },
  ];
  const attendees = [
    ['m1', 'u1', 'editor'], ['m1', 'u2', 'editor'], ['m1', 'u3', 'editor'], ['m1', 'u4', 'viewer'],
    ['m2', 'u2', 'editor'], ['m2', 'u1', 'editor'], ['m2', 'u4', 'viewer'],
    ['m3', 'u3', 'editor'], ['m3', 'u2', 'editor'],
    ['m4', 'u1', 'editor'], ['m4', 'u2', 'viewer'], ['m4', 'u3', 'viewer'],
  ].map(([meetingId, userId, permission]) => ({ meetingId, userId, permission }));

  const content = {
    m1: {
      version: 3,
      doc: {
        type: 'doc',
        content: [
          h2('會議目的'),
          p(t('確認 2027 年第一季日本線的'), t('主打產品', [{ type: 'bold' }]), t('、定價策略與上架時程。')),
          h2('討論事項'),
          { type: 'bulletList', content: [li('東京自由行：機加酒組合需新增晚鳥航班選項'), li('北海道冬季團：雪祭檔期房源已確認 80%'), li('九州溫泉線：考慮與在地業者合作推出包車行程')] },
          h2('決議事項'),
          { type: 'orderedList', content: [li('北海道雪祭團 12/10 前完成上架'), li('東京自由行定價維持 2026 年水準，加價購另計')] },
          {
            type: 'table',
            content: [
              { type: 'tableRow', content: ['產品線', '預計上架', '負責人'].map((x) => ({ type: 'tableHeader', content: [p(t(x))] })) },
              { type: 'tableRow', content: ['北海道雪祭團', '12/10', '林怡君'].map((x) => ({ type: 'tableCell', content: [p(t(x))] })) },
              { type: 'tableRow', content: ['東京自由行', '12/20', '王大明'].map((x) => ({ type: 'tableCell', content: [p(t(x))] })) },
            ],
          },
          h2('待辦事項'),
          { type: 'taskList', content: [
            { type: 'taskItem', attrs: { checked: true }, content: [p(t('彙整雪祭檔期房源表'))] },
            { type: 'taskItem', attrs: { checked: false }, content: [p(t('與九州包車業者約訪'))] },
          ] },
        ],
      },
      updatedAt: now - 600e3,
      updatedBy: 'u1',
    },
  };
  ['m2', 'm3', 'm4'].forEach((id) => {
    content[id] = { version: 1, doc: defaultTemplate(), updatedAt: now - day, updatedBy: 'u2' };
  });

  const history = [
    { id: 'h1', meetingId: 'm1', userId: 'u1', action: '建立會議', at: now - 3 * 3600e3 },
    { id: 'h2', meetingId: 'm1', userId: 'u2', action: '編輯內容（版本 2）', at: now - 2 * 3600e3 },
    { id: 'h3', meetingId: 'm1', userId: 'u1', action: '編輯內容（版本 3）', at: now - 600e3 },
  ];

  const users = SEED_USERS.map((u, i) => ({ ...u, lastLoginAt: u.active ? now - (i * 5 + 1) * 3600e3 : now - 40 * day }));
  const auditLogs = [
    { id: 'a1', userId: 'u1', action: '將「王大明」的角色設為「一般成員」', at: now - 3 * day },
    { id: 'a2', userId: 'u1', action: '停用帳號「李佩珊」', at: now - 2 * day },
    { id: 'a3', userId: 'u1', action: '更新「會議管理者」權限：新增「刪除所有會議」', at: now - day },
  ];
  // 分享連結（meeting_shares）：m2 預設已開啟公司內分享
  const shares = [
    { meetingId: 'm2', token: 'demo-weekly-7Kq2Xp', enabled: true, scope: 'org', expiresAt: now + 30 * day, createdBy: 'u2', createdAt: now - 2 * day, viewCount: 5 },
  ];
  return { meetings, attendees, content, history, users, roles: JSON.parse(JSON.stringify(SEED_ROLES)), auditLogs, shares, sessions: [], authTokens: [], outbox: [] };
}
