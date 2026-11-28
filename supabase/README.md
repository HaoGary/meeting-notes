# Supabase 後端

專案：`meeting-notes`（ref `lvfpljcpyajhkdpzxcde`，東京 ap-northeast-1）

## 內容

| 位置 | 說明 |
|---|---|
| `migrations/` | 資料表、RLS、RPC、觸發器、預設資料的 SQL |
| `functions/accounts/` | Edge Function：管理員帳號操作與個人登入裝置（需要 secret key，只在伺服器執行） |
| `templates/` | 中文信件範本（邀請、重設密碼、Email 變更、註冊驗證），貼到 Authentication → Emails |

## Migration

`migrations/` 已與遠端資料庫同步（2026-11-26），依版本號排序即為完整的建置順序：

| 版本 | 內容 | 套用方式 |
|---|---|---|
| 20261126035823_schema | 資料表、索引、RLS 開啟、基本授權 | MCP |
| 20261126035929_access_rls | 權限判斷函式、RLS 政策、觸發器 | MCP |
| 20261126041135_meeting_rpc | 會議相關 RPC | MCP |
| 20261126041207_admin_rpc | 帳號、角色 RPC、函式執行權限 | MCP |
| 20261126041225_seed_storage_realtime | 預設權限與角色、圖片 bucket、Realtime | MCP |
| 20261126041300_functions_with_delete | 設定參與人、儲存角色權限、刪除角色 | SQL Editor 手動 |
| 20261126071217_list_accounts_session_count | 帳號列表加上登入裝置數 | MCP |
| 20261126093408_notifications | 通知表、RLS、通知觸發器 | MCP |
| 20261126093615_fix_notify_meeting_update | 修正時間地點變更通知 | MCP |
| 20261126093700_notifications_manual | 參與人差異通知、每日清除 30 天前通知 | SQL Editor 手動 |
| 20261127090000_session_check_realtime_attendees | 停用/強制登出立即失效（檢查 auth.sessions）、參與人表加入 Realtime | MCP |
| 20261127100000_meeting_guests | 會議新增外部參與人員欄位 guests（只記錄名字）、分享頁顯示 | MCP |
| 20261127110000_meeting_host_name | 外部主持人欄位 host_name；修改紀錄涵蓋外部人員；分享頁顯示 | MCP |
| 20261127120000_external_members | 外部成員統一名單（external_members），匯入既有會議用過的名字 | SQL Editor 手動 |
| 20261127130000_external_members_edit | 外部成員改名（同步更新所有會議）、從名單移除 | SQL Editor 手動 |
| 20261128090000_ai_vectorize | AI 圖片向量化：權限 tools.vectorize_ai、每日上限 app_settings、使用紀錄 ai_vectorize_usage | SQL Editor 手動 |
| 20261128120000_perf_list_meetings_rls | 效能：list_meetings 整批計算權限；profiles、audit_logs 的 RLS 函式每次查詢只算一次 | SQL Editor 手動 |

標示「SQL Editor 手動」的兩筆含 delete 語句，是在後台手動執行的，遠端沒有它們的版本紀錄。第一次用 CLI 連結專案時，請先補記錄，避免 `db push` 重複套用：

```bash
npx supabase login
npx supabase link --project-ref lvfpljcpyajhkdpzxcde
npx supabase migration repair --status applied 20261126041300 20261126093700
npx supabase migration list      # 本機與遠端應完全一致
```

之後新的資料庫變更請新增 migration 檔，再用 `npx supabase db push` 套用。

## 部署 Edge Function

```bash
npx supabase functions deploy accounts --no-verify-jwt
```

`--no-verify-jwt`：函式內部會自行向 Auth 驗證登入者（新版 API key 不是 JWT，平台的 JWT 檢查不適用）。

## 後台設定（Dashboard）

- Authentication → Sign In / Providers：已關閉「Allow new users to sign up」（只由管理員建立帳號）
- Authentication → SMTP：使用 Gmail（smtp.gmail.com:465，應用程式密碼）
- Authentication → Emails：套用 `templates/` 的中文範本
- Authentication → URL Configuration：Site URL 與 Redirect URLs 需填入前台網址（例如 GitHub Pages 網址），邀請信與重設密碼信才會導回網站
- Edge Functions → Secrets：可選 `APP_URL`（信件連結導回的網址；未設定時用 Site URL）

## Edge Function：vectorize-ai（AI 圖片向量化）

- 代為呼叫 Recraft Vectorize API（標準版，US$0.01／次），開啟零資料保留，結果以 b64_json 直接回傳。
- 需要在 **Project Settings → Edge Functions → Secrets** 新增 `RECRAFT_API_TOKEN`（Recraft 的 API 金鑰）。沒有設定時會回覆「AI 向量化尚未設定」，不會扣次數。
- 部署時 `verify_jwt = false`（函式內自行以 `auth.getUser` 驗證登入）。
- 權限：`tools.vectorize_ai`（預設只有系統管理員，其他角色到「權限管理」勾選）。
- 每日上限：`app_settings.ai_vectorize_daily_limit`（預設 20），有「權限管理」權限者可在工具頁調整，也可用 SQL：
  `select public.set_ai_vectorize_limit(30);`（需以管理員登入）或直接 `update public.app_settings set value = '30' where key = 'ai_vectorize_daily_limit';`
- 使用紀錄：`select * from public.ai_vectorize_usage order by created_at desc;`（失敗的紀錄不計入額度）
