// 依後端模式選擇 API 實作；兩者提供相同的方法與回傳格式。
// '@backend' 在建置時由 vite.config.js 依環境變數指向 backend.supabase.js 或 backend.mock.js，
// 只會打包實際使用的那一個（正式版不含模擬後端、示範資料與預覽控制台）。
export * from '@backend';
