# 會議紀錄系統（前端預覽版）

以 **React 18 + MUI 6 + Tiptap 2 + Supabase** 製作的會議紀錄系統，包含會議紀錄編輯、分享、帳號與權限管理。

有兩種後端模式，頁面程式完全相同：

| 模式 | 資料存放 | 用途 |
|---|---|---|
| **supabase**（預設） | Supabase PostgreSQL（RLS 權限控管） | 正式使用、GitHub Pages |
| **mock** | 瀏覽器 localStorage 模擬後端 | 離線展示、單檔預覽、E2E 測試 |

後端設定與資料庫說明見 [`supabase/README.md`](supabase/README.md)。

## 功能

- 登入／註冊／信箱驗證／忘記密碼／重設密碼／強制變更密碼
- 會議列表（搜尋、狀態分頁、封存、分頁器）、新增會議
- 會議紀錄編輯器：格式工具列、表格、圖片、待辦清單、自動儲存、版本衝突處理、修改紀錄
- 一鍵整理格式（可復原）、語音輸入（zh-TW）、AI 文案潤飾（僅在 Claude 預覽環境中提供）
- 唯讀分享頁（顯示日期、參與人等資訊）
- 後台：帳號管理、權限（角色）管理、個人帳號設定（變更密碼、登出全裝置）
- 右下角「預覽控制台」：快速切換使用者、模擬信箱、模擬網路異常等

## 示範帳號（僅 mock 模式）

密碼皆為 `Demo1234`。Supabase 模式請使用系統管理員建立的真實帳號（以 Email 登入）

| 帳號 | 名稱 | 角色 |
|---|---|---|
| gary | Gary Chen | 系統管理員 |
| yijun | 林怡君 | 會議管理者 |
| daming | 王大明 | 一般成員 |
| xiaohua | 陳小華 | 唯讀成員 |

## 開發

需要 Node.js 20.19 以上（建議 22）。

```bash
npm install        # 安裝依賴
npm run dev        # 開發模式 http://localhost:5173，連線 Supabase（設定在 .env.development）
npm run dev:mock   # 開發模式，使用瀏覽器內的模擬後端
npm run build      # 正式建置（Supabase），輸出到 dist/
npm run preview    # 在本機預覽正式建置結果 http://localhost:4173
```

### 在電腦上直接雙擊預覽（不需安裝）

開啟 `preview/index.html` 即可（用 Chrome 或 Edge 雙擊）。這是單一檔案版本，所有程式都內嵌在檔案裡，使用模擬後端。

修改程式後重新產生：

```bash
npm run build:local   # 輸出 preview/index.html
```

> `dist/index.html` 是給網站部署用的，直接雙擊會是空白頁（瀏覽器不允許 `file://` 載入外部 JS 模組），請改用 `preview/index.html` 或 `npm run preview`。
> 本機檔案版的資料存在瀏覽器中，與網站版、`npm run dev` 的資料互相獨立。

### E2E 測試

```bash
npm run test:e2e:install   # 第一次使用：下載測試用 Chromium
npm run test:e2e           # 以模擬後端建置並執行冒煙測試（不會動到正式資料）
```

## 專案結構

```
├─ .github/workflows/deploy.yml   GitHub Pages 自動部署
├─ public/                        靜態檔（原樣複製到 dist，如 favicon）
├─ tests/e2e/                     Playwright 冒煙測試
├─ index.html                     Vite 入口
├─ vite.config.js
└─ src/
   ├─ main.jsx                    掛載 React、主題與全域 Provider
   ├─ App.jsx                     登入狀態、頁面切換與資料載入
   ├─ router/                     hash 路由（#meetings、#meeting-<id>…）
   ├─ pages/                      頁面（一個網址對應一個頁面）
   │  ├─ auth/                    登入、註冊、驗證、忘記／重設密碼
   │  ├─ meetings/                會議列表、會議編輯、分享頁
   │  ├─ admin/                   帳號管理、權限管理
   │  └─ account/                 個人帳號設定
   ├─ components/                 跨頁面共用元件
   │  ├─ common/                  對話框、Toast、頭像、分頁器、日期時間選擇器…
   │  ├─ layout/                  後台外框（左側選單、上方列）
   │  ├─ auth/                    登入相關頁面的版面與欄位
   │  └─ meetings/                會議資訊、新增會議、分享設定、修改紀錄
   ├─ features/                   獨立功能模組
   │  ├─ editor/                  Tiptap 編輯器、工具列、唯讀顯示、整理外掛
   │  ├─ speech/                  語音輸入
   │  └─ ai-polish/               AI 文案潤飾
   ├─ services/                   資料層：api.js 依模式選 supabaseApi.js 或 mockServer.js
   ├─ hooks/                      useForm、useAutosave
   ├─ utils/                      表單驗證規則、裝置名稱
   ├─ styles/                     MUI 主題與編輯器內文樣式
   ├─ assets/                     圖片、圖示
   └─ dev/                        預覽控制台（Demo 專用）
```

### 開發慣例

- **新增頁面**：在 `src/pages/` 新增元件 → 在 `src/router/hashRoutes.js` 加入網址 → 在 `App.jsx` 的頁面切換加上該頁。
- **共用元件**：兩個以上頁面會用到的放 `components/`；只有單一頁面使用的，跟頁面放在一起。
- **資料存取**：頁面只透過 `createApi()`（`src/services/api.js`）取得資料；`supabaseApi.js` 與 `mockServer.js` 提供相同的方法與回傳格式。新增功能時兩邊都要實作。
- **樣式**：顏色、字級、圓角統一在 `src/styles/theme.js`，元件內使用 MUI 的 `sx`。

## 部署到 GitHub Pages

1. 在 GitHub 建立 repository，把專案推送到 `main` 分支。
2. 到 repo 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
3. 每次推送到 `main`，`.github/workflows/deploy.yml` 會自動建置並部署；進度可在 **Actions** 分頁查看。
4. 完成後網址為 `https://<帳號>.github.io/<repo 名稱>/`。
5. 到 Supabase → Authentication → URL Configuration，把這個網址填進 **Site URL**，並加入 **Redirect URLs**，邀請信與重設密碼信才會導回網站。

`vite.config.js` 設定 `base: './'`，路由使用 hash（`#meetings`），因此部署在任何子路徑都不需要額外設定，重新整理或直接開啟分享連結也不會出現 404。

## 注意事項

- **金鑰**：`.env.production` 內的 publishable key 本來就會出現在前端，可以放進版控；資料安全由 RLS 與 Edge Function 把關。secret key 只存在 Supabase，絕不可放進專案。
- **帳號**：不開放自行註冊，由系統管理員在「帳號管理」建立（臨時密碼或寄邀請信）。只用 Email 登入。
- **寄信**：目前用 Supabase 內建寄信服務，每小時寄送數量很少，正式上線前請設定 SMTP。
- **AI 潤飾**只在 Claude 預覽環境中出現；一般網站上會自動隱藏。
- **語音輸入**需要 https 與麥克風權限，且瀏覽器需支援 Web Speech API（Chrome、Edge）。
