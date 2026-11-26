-- 權限與角色預設資料
insert into public.permissions (key, "group", label, description, sort) values
  ('meeting.view_all',   '會議', '檢視所有會議',   '未被邀請的會議也能檢視', 10),
  ('meeting.create',     '會議', '建立會議',       '新增會議紀錄', 20),
  ('meeting.edit_all',   '會議', '編輯所有會議',   '不需是主持人或參與者也能編輯', 30),
  ('meeting.archive',    '會議', '封存會議',       '封存或取消封存可編輯的會議', 40),
  ('meeting.share',      '會議', '分享會議',       '為可編輯的會議建立唯讀分享連結', 50),
  ('meeting.delete_own', '會議', '刪除自己的會議', '自己建立或主持的會議', 60),
  ('meeting.delete_all', '會議', '刪除所有會議',   '包含他人建立的會議', 70),
  ('system.accounts',    '系統', '帳號管理',       '新增、編輯、停用帳號，重設他人密碼', 80),
  ('system.permissions', '系統', '權限管理',       '設定角色權限與指派使用者角色', 90);

insert into public.roles (id, name, description, color, locked, sort) values
  ('admin',   '系統管理員', '擁有所有權限，無法修改',     '#4f46e5', true, 10),
  ('manager', '會議管理者', '可檢視與管理所有會議',       '#0891b2', false, 20),
  ('member',  '一般成員',   '可建立會議，編輯受邀的會議', '#059669', false, 30),
  ('viewer',  '唯讀成員',   '只能檢視受邀的會議',         '#6b7280', false, 40);

insert into public.role_permissions (role_id, permission_key)
select 'admin', key from public.permissions
union all
select 'manager', unnest(array['meeting.view_all','meeting.create','meeting.edit_all','meeting.archive',
                               'meeting.share','meeting.delete_own','meeting.delete_all'])
union all
select 'member', unnest(array['meeting.create','meeting.archive','meeting.share','meeting.delete_own']);

-- 會議圖片：公開 bucket（網址含隨機檔名），路徑 {meeting_id}/{uuid}.{ext}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meeting-images', 'meeting-images', true, 5242880,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

create or replace function public.storage_meeting_id(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-fA-F-]{36}$'
              then ((storage.foldername(p_name))[1])::uuid end;
$$;
revoke execute on function public.storage_meeting_id(text) from public, anon;
grant execute on function public.storage_meeting_id(text) to authenticated;

create policy "會議編輯者可上傳圖片" on storage.objects for insert to authenticated
  with check (bucket_id = 'meeting-images'
              and public.meeting_access(public.storage_meeting_id(name)) = 'editor');
create policy "會議編輯者可刪除圖片" on storage.objects for delete to authenticated
  using (bucket_id = 'meeting-images'
         and public.meeting_access(public.storage_meeting_id(name)) = 'editor');

-- Realtime：會議與內容變更即時通知（仍受 RLS 限制）
alter publication supabase_realtime add table public.meetings, public.meeting_contents;
