# Supabase 中文信件範本（貼上用）

位置：Supabase → Authentication → **Emails**（或 Email Templates），每個範本把 **Subject** 與 **Body**（Source / HTML）整段換掉後按 **Save**。

| 範本 | 用途 | Subject（主旨） |
|---|---|---|
| Invite user | 邀請信 | `【會議紀錄系統】您已受邀，請設定密碼` |
| Reset Password | 重設密碼信 | `【會議紀錄系統】重設您的密碼` |
| Change Email Address | Email 變更確認信 | `【會議紀錄系統】確認變更 Email` |
| Confirm signup | 註冊驗證信（目前不開放註冊，可選） | `【會議紀錄系統】驗證您的 Email` |

## Invite user（邀請信）

**Subject：** `【會議紀錄系統】您已受邀，請設定密碼`

**Body：**

```html
<div style="font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f2937;line-height:1.7">
  <h2 style="margin:0 0 16px;font-size:20px;color:#111827">您已受邀使用會議紀錄系統</h2>
  <p style="margin:0 0 12px">您好，</p><p style="margin:0">系統管理員已為您（{{ .Email }}）建立會議紀錄系統帳號。請點選下方按鈕設定密碼，完成後即可登入使用。</p>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">設定密碼</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#6b7280">如果按鈕無法點選，請複製下方網址貼到瀏覽器開啟：</p>
  <p style="margin:0 0 24px;font-size:12px;color:#6b7280;word-break:break-all">{{ .ConfirmationURL }}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="margin:0;font-size:12px;color:#9ca3af">此連結有使用期限且只能使用一次。若連結已失效，請聯絡系統管理員重新寄送邀請。若您不認識此系統，請忽略這封信。</p>
</div>
```

## Reset Password（重設密碼信）

**Subject：** `【會議紀錄系統】重設您的密碼`

**Body：**

```html
<div style="font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f2937;line-height:1.7">
  <h2 style="margin:0 0 16px;font-size:20px;color:#111827">重設您的密碼</h2>
  <p style="margin:0 0 12px">您好，</p><p style="margin:0">我們收到 {{ .Email }} 的重設密碼申請。請點選下方按鈕設定新密碼。</p>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">重設密碼</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#6b7280">如果按鈕無法點選，請複製下方網址貼到瀏覽器開啟：</p>
  <p style="margin:0 0 24px;font-size:12px;color:#6b7280;word-break:break-all">{{ .ConfirmationURL }}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="margin:0;font-size:12px;color:#9ca3af">此連結有使用期限且只能使用一次。若您沒有提出申請，請忽略這封信，您的密碼不會被變更；若持續收到此信，請聯絡系統管理員。</p>
</div>
```

## Change Email Address（Email 變更確認信）

**Subject：** `【會議紀錄系統】確認變更 Email`

**Body：**

```html
<div style="font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f2937;line-height:1.7">
  <h2 style="margin:0 0 16px;font-size:20px;color:#111827">確認變更 Email</h2>
  <p style="margin:0 0 12px">您好，</p><p style="margin:0">您的會議紀錄系統帳號 Email 即將由 {{ .Email }} 變更為 {{ .NewEmail }}。請點選下方按鈕確認。</p>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">確認變更</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#6b7280">如果按鈕無法點選，請複製下方網址貼到瀏覽器開啟：</p>
  <p style="margin:0 0 24px;font-size:12px;color:#6b7280;word-break:break-all">{{ .ConfirmationURL }}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="margin:0;font-size:12px;color:#9ca3af">若這不是您本人或系統管理員的操作，請勿點選連結，並立即聯絡系統管理員。</p>
</div>
```

## Confirm signup（註冊驗證信（目前不開放註冊，可選））

**Subject：** `【會議紀錄系統】驗證您的 Email`

**Body：**

```html
<div style="font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f2937;line-height:1.7">
  <h2 style="margin:0 0 16px;font-size:20px;color:#111827">驗證您的 Email</h2>
  <p style="margin:0 0 12px">您好，</p><p style="margin:0">感謝您註冊會議紀錄系統。請點選下方按鈕驗證您的 Email（{{ .Email }}），或在驗證頁輸入驗證碼：</p><p style="margin:16px 0 0;font-size:24px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">驗證 Email</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#6b7280">如果按鈕無法點選，請複製下方網址貼到瀏覽器開啟：</p>
  <p style="margin:0 0 24px;font-size:12px;color:#6b7280;word-break:break-all">{{ .ConfirmationURL }}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="margin:0;font-size:12px;color:#9ca3af">此連結與驗證碼有使用期限。若您沒有註冊，請忽略這封信。</p>
</div>
```
