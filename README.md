# 會議紀錄系統

以 **React 18 + MUI 6 + Tiptap 2 + Supabase** 製作的會議紀錄系統，包含會議紀錄編輯、分享、帳號與權限管理。

有兩種後端模式，頁面程式完全相同：

| 模式 | 資料存放 | 用途 |
|---|---|---|
| **supabase**（預設） | Supabase PostgreSQL（RLS 權限控管） | 正式使用、GitHub Pages |
| **mock** | 瀏覽器 localStorage 模擬後端 | 離線展示、單檔預覽、E2E 測試 |

後端設定與資料庫說明見 [`supabase/README.md`](supabase/README.md)。

## 功能

- 登入／忘記密碼／重設密碼／受邀設定密碼／強制變更密碼（註冊與信箱驗證僅 mock 模式）
- 會議列表（搜尋、狀態分頁、封存、分頁器）、新增會議
- 會議紀錄編輯器：格式工具列、表格、圖片、待辦清單、自動儲存、版本衝突處理、修改紀錄
- 一鍵整理格式（可復原）、語音輸入（zh-TW）、AI 文案潤飾（複製到自己的 AI 再貼回；可依內容分類到各區塊）
- 唯讀分享頁（顯示日期、參與人等資訊）
- 後台：帳號管理、權限（角色）管理、個人帳號設定（變更密碼、登出全裝置）
- 響應式版面（手機、平板、桌機）
- 右下角「預覽控制台」（僅 mock 模式）：快速切換使用者、模擬信箱、模擬網路異常等

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

## AI 文案潤飾

- **一般網站（GitHub Pages）**：手動模式，不需要 API 金鑰、也沒有後端費用。按「AI 潤飾」→ 複製整理指令（已含會議內容）→ 貼到自己的 Claude、ChatGPT、Gemini 等 → 把回覆貼回來 → 預覽前後對照 → 套用（可復原）。系統本身不會把內容傳給任何 AI 服務。
- **依內容分類到各區塊**（預設開啟）：適合語音逐字稿。AI 會把重點移到「討論事項」「決議事項」「待辦事項」等區塊，缺少的標準區塊會新增在最後；表格與圖片留在原位。關閉時維持原本「只在同一區塊內整理」的方式。預覽時若原文的數字在結果中找不到，會提醒確認。
- **在 Claude 中開啟頁面時**：自動模式，直接用使用者自己的 Claude 帳號與額度逐段整理。
- 程式：`src/features/ai-polish/`（`ManualPolishDialog.jsx` 手動模式、`AiPolishDialog.jsx` 自動模式、`polishService.js` 指令與解析、`docBlocks.js` 內容拆解與重組）。

## RWD（響應式版面）

斷點統一定義在 `src/styles/breakpoints.js`，同時套用到 MUI theme，元件內一律用 `sx={{ xs, sm, md, lg }}` 或 `useDevice()`，不另寫數字。

| 裝置 | 寬度 | MUI 斷點 | 版面 |
|---|---|---|---|
| 手機 | ≤ 767px | `xs` | 漢堡選單＋抽屜式選單、列表改卡片、篩選條件可收合、主要按鈕滿版、彈窗貼齊螢幕邊距 |
| 平板 | 768–1199px | `sm`（直向）、`md`（橫向） | 側邊選單預設收合為圖示列、可展開；表格完整欄位，空間不足時左右捲動 |
| 桌面 | ≥ 1200px | `lg`、`xl` | 完整側邊選單（可手動收合）、表格完整顯示、多欄排版 |

- 樣式採 Mobile First：先寫手機版，再用較大的斷點覆寫。
- 列表上方的搜尋／篩選／新增按鈕統一用 `components/common/FilterBar.jsx`。
- 手機版卡片與桌面表格顯示相同欄位，不以隱藏欄位處理窄螢幕。
- 權限矩陣在窄螢幕保留所有角色欄，第一欄固定、其餘左右捲動。
- 手機版按鈕與可點擊元素高度至少 40px，輸入框字級 16px（避免 iOS 自動放大）。
- `tests/e2e/rwd.spec.js` 會在 375×667 與 768×1024 檢查無水平捲動、選單與篩選可操作。

## 即時同步與帳號安全

- **即時同步**：他人儲存內容後，自動載入最新版本；若你有未儲存的修改，改為顯示提示，讓你自行「載入最新版本」。標題列顯示正在檢視的人。參與人或權限變更會立即生效；會議被刪除時會提示。
- **外部人員**：主持人和參與人員的選單可搜尋，也可輸入名字新增沒有系統帳號的人；新增過的人會存進「外部成員」統一名單，之後所有會議都能直接選（樣式與系統成員相同，名字後標示「外部」）。外部人員只記錄名字，沒有任何存取權限；外部主持人不影響原本建立者的權限。
- **會議列表**：新增、修改、刪除會議時自動更新。
- **停用 / 強制登出**：資料庫 RLS 會檢查登入工作階段（auth.sessions），停用或強制登出後立即無法存取資料。前端每 60 秒及切回分頁時也會檢查，並自動登出。
- **變更 Email**：在「帳號設定 → 變更 Email」輸入新 Email 和目前密碼，系統會寄出確認信，點擊信中連結後才會生效。若 Supabase 開啟了 Secure email change，新舊兩個信箱都必須確認。

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
- **AI 潤飾**：一般網站為手動模式（複製指令到自己的 AI、再貼回結果）；在 Claude 中開啟時改為自動模式。
- **語音輸入**需要 https 與麥克風權限，且瀏覽器需支援 Web Speech API（Chrome、Edge）。
