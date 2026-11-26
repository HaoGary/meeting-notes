-- ============================================================
-- 會議紀錄系統：需手動執行的 3 個函式
-- 專案：meeting-notes（lvfpljcpyajhkdpzxcde）
-- 執行方式：Supabase 後台 → SQL Editor → 貼上全部 → Run
--
-- 這 3 個函式內含 delete 語句（只在被呼叫時刪除「該場會議的舊參與人」
-- 或「被取消勾選的角色權限」），所以 MCP 會要求確認，改由你手動執行。
-- 執行本檔本身不會刪除任何資料。
-- ============================================================

-- 1. 整批設定參與人：p_attendees = [{"user_id": "...", "permission": "editor|viewer"}]
create or replace function public.set_meeting_attendees(p_meeting uuid, p_attendees jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  perform public.require_meeting_editable(p_meeting);
  if jsonb_typeof(p_attendees) <> 'array' then
    perform public.api_error(422, '參與人格式不正確', 'VALIDATION');
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_attendees) as x(user_id uuid, permission text)
    left join public.profiles p on p.id = x.user_id
    where p.id is null or not p.active or coalesce(x.permission, 'viewer') not in ('editor', 'viewer')
  ) then
    perform public.api_error(422, '參與人包含不存在或已停用的帳號', 'VALIDATION');
  end if;
  delete from public.meeting_attendees where meeting_id = p_meeting;
  insert into public.meeting_attendees (meeting_id, user_id, permission)
  select distinct on (x.user_id) p_meeting, x.user_id, coalesce(x.permission, 'viewer')
  from jsonb_to_recordset(p_attendees) as x(user_id uuid, permission text);
  update public.meetings set updated_at = now() where id = p_meeting;
  insert into public.meeting_history (meeting_id, user_id, action) values (p_meeting, v_uid, '更新參與人員');
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_result
    from public.meeting_attendees a where a.meeting_id = p_meeting;
  return v_result;
end $$;

-- 2. 儲存角色權限：p_changes = {"<role_id>": ["meeting.create", ...], ...}
create or replace function public.save_role_permissions(p_changes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_role_id text; v_keys text[]; v_role public.roles;
  v_added text; v_removed text; v_parts text[];
begin
  if not public.has_perm('system.permissions') then
    perform public.api_error(403, '沒有「權限管理」權限', 'FORBIDDEN');
  end if;
  for v_role_id in select jsonb_object_keys(p_changes) loop
    select * into v_role from public.roles where id = v_role_id;
    if not found then perform public.api_error(404, '角色不存在', 'NOT_FOUND'); end if;
    if v_role.locked then perform public.api_error(403, format('「%s」為系統角色，無法修改', v_role.name), 'LOCKED'); end if;
    select coalesce(array_agg(k), '{}') into v_keys
      from jsonb_array_elements_text(p_changes->v_role_id) k where k in (select key from public.permissions);

    select string_agg('「' || p.label || '」', '、') into v_added from public.permissions p
     where p.key = any(v_keys)
       and not exists (select 1 from public.role_permissions rp where rp.role_id = v_role_id and rp.permission_key = p.key);
    select string_agg('「' || p.label || '」', '、') into v_removed from public.permissions p
     join public.role_permissions rp on rp.permission_key = p.key and rp.role_id = v_role_id
     where not (p.key = any(v_keys));

    delete from public.role_permissions where role_id = v_role_id and not (permission_key = any(v_keys));
    insert into public.role_permissions (role_id, permission_key)
    select v_role_id, k from unnest(v_keys) k on conflict do nothing;

    v_parts := array_remove(array[
      case when v_added is not null then '新增' || v_added end,
      case when v_removed is not null then '移除' || v_removed end], null);
    if array_length(v_parts, 1) > 0 then
      insert into public.audit_logs (actor_id, action)
      values (v_uid, format('更新「%s」權限：%s', v_role.name, array_to_string(v_parts, '；')));
    end if;
  end loop;
end $$;

-- 3. 刪除角色：系統角色不可刪、仍有使用者時不可刪
create or replace function public.delete_role(p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_role public.roles; v_count int;
begin
  if not public.has_perm('system.permissions') then
    perform public.api_error(403, '沒有「權限管理」權限', 'FORBIDDEN');
  end if;
  select * into v_role from public.roles where id = p_role;
  if not found then perform public.api_error(404, '角色不存在', 'NOT_FOUND'); end if;
  if v_role.locked or p_role = 'viewer' then  -- viewer 是新帳號的預設角色，不可刪
    perform public.api_error(403, '系統角色無法刪除', 'LOCKED');
  end if;
  select count(*) into v_count from public.profiles where role_id = p_role;
  if v_count > 0 then
    perform public.api_error(409, format('仍有 %s 位使用者屬於此角色，請先變更他們的角色', v_count), 'IN_USE');
  end if;
  delete from public.roles where id = p_role;
  insert into public.audit_logs (actor_id, action) values (v_uid, format('刪除角色「%s」', v_role.name));
end $$;

-- 執行權限：只開放給登入者（函式內部會再檢查權限）
revoke execute on function public.set_meeting_attendees(uuid, jsonb) from public, anon;
revoke execute on function public.save_role_permissions(jsonb) from public, anon;
revoke execute on function public.delete_role(text) from public, anon;
grant execute on function public.set_meeting_attendees(uuid, jsonb) to authenticated;
grant execute on function public.save_role_permissions(jsonb) to authenticated;
grant execute on function public.delete_role(text) to authenticated;
