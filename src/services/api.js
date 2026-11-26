// 依後端模式選擇 API 實作；兩者提供相同的方法與回傳格式
import { IS_SUPABASE } from './config';
import { createApi as createMockApi } from './mockServer';
import { createApi as createSupabaseApi } from './supabaseApi';

export const createApi = IS_SUPABASE ? createSupabaseApi : createMockApi;
// 預覽控制台用的模擬工具（只在 mock 模式使用）
export { devLogin, devUsers, resetDb, simulateOtherUserEdit } from './mockServer';
