# Supabase 後端

專案：`meeting-notes`（ref `lvfpljcpyajhkdpzxcde`，東京 ap-northeast-1）

## 內容

| 位置 | 說明 |
|---|---|
| `migrations/` | 資料表、RLS、RPC、觸發器、預設資料的 SQL |
| `functions/accounts/` | Edge Function：管理員帳號操作與個人登入裝置（需要 secret key，只在伺服器執行） |

## 同步 migration 到本機

大部分 migration 是直接套用到 Supabase 的，第一次請把完整紀錄抓回本機（之後納入版控）：

```bash
npx supabase login
npx supabase link --project-ref lvfpljcpyajhkdpzxcde
npx supabase migration fetch      # 下載遠端所有 migration 到 supabase/migrations/
npx supabase migration list       # 確認本機與遠端一致
```

`20261126041300_functions_with_delete.sql` 是在 SQL Editor 手動執行的（內含 delete 語句），遠端沒有它的紀錄；內容都是 `create or replace`，重複執行不會有影響。可用下列指令補記錄：

```bash
npx supabase migration repair --status applied 20261126041300
```

## 部署 Edge Function

```bash
npx supabase functions deploy accounts --no-verify-jwt
```

`--no-verify-jwt`：函式內部會自行向 Auth 驗證登入者（新版 API key 不是 JWT，平台的 JWT 檢查不適用）。

## 後台設定（Dashboard）

- Authentication → Sign In / Providers：已關閉「Allow new users to sign up」（只由管理員建立帳號）
- Authentication → URL Configuration：Site URL 與 Redirect URLs 需填入前台網址（例如 GitHub Pages 網址），邀請信與重設密碼信才會導回網站
- Edge Functions → Secrets：可選 `APP_URL`（信件連結導回的網址；未設定時用 Site URL）
