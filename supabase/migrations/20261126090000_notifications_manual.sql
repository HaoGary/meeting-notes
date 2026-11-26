-- ============================================================
-- 通知功能：需手動執行的部分
-- 專案：meeting-notes（lvfpljcpyajhkdpzxcde）
-- 執行方式：Supabase 後台 → 確認左上角是 meeting-notes → SQL Editor → 貼上全部 → Run
--
-- 內含 delete 語句（只在函式被呼叫、排程執行時才刪除），所以由你手動執行。
-- 執行本檔本身不會刪除任何資料。
-- ============================================================

-- 1. 設定參與人：改為只比對差異（保留原本參與人的加入時間），並通知被加入／移出／變更權限的人
create or replace function public.set_meeting_attendees(p_meeting uuid, p_attendees jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_result jsonb; v_title text; v_actor text; r record;
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

  select title into v_title from public.meetings where id = p_meeting;
  v_actor := public.actor_name();

  -- 先算出差異並通知
  for r in
    with new_list as (
      select distinct on (x.user_id) x.user_id, coalesce(x.permission, 'viewer') as permission
      from jsonb_to_recordset(p_attendees) as x(user_id uuid, permission text)
    ), old_list as (
      select user_id, permission from public.meeting_attendees where meeting_id = p_meeting
    )
    select coalesce(n.user_id, o.user_id) as user_id, o.permission as old_perm, n.permission as new_perm
    from new_list n full join old_list o on o.user_id = n.user_id
    where o.permission is distinct from n.permission
  loop
    if r.old_perm is null then
      perform public.notify(r.user_id, 'meeting_added', p_meeting, format('你已被加入會議「%s」', v_title),
        format('%s 將你加入，權限：%s', v_actor, case r.new_perm when 'editor' then '可編輯' else '僅檢視' end));
    elsif r.new_perm is null then
      perform public.notify(r.user_id, 'meeting_removed', null, format('你已被移出會議「%s」', v_title),
        format('由 %s 移出', v_actor));
    else
      perform public.notify(r.user_id, 'meeting_permission', p_meeting,
        format('你在「%s」的權限已變更為%s', v_title, case r.new_perm when 'editor' then '可編輯' else '僅檢視' end),
        format('由 %s 變更', v_actor));
    end if;
  end loop;

  -- 套用差異：移除不在名單內的人，新增或更新其餘的人
  delete from public.meeting_attendees a
   where a.meeting_id = p_meeting
     and a.user_id not in (select x.user_id from jsonb_to_recordset(p_attendees) as x(user_id uuid, permission text));
  insert into public.meeting_attendees (meeting_id, user_id, permission)
  select distinct on (x.user_id) p_meeting, x.user_id, coalesce(x.permission, 'viewer')
  from jsonb_to_recordset(p_attendees) as x(user_id uuid, permission text)
  on conflict (meeting_id, user_id) do update set permission = excluded.permission
   where public.meeting_attendees.permission is distinct from excluded.permission;

  update public.meetings set updated_at = now() where id = p_meeting;
  insert into public.meeting_history (meeting_id, user_id, action) values (p_meeting, v_uid, '更新參與人員');
  select coalesce(jsonb_agg(to_jsonb(a) order by a.added_at), '[]'::jsonb) into v_result
    from public.meeting_attendees a where a.meeting_id = p_meeting;
  return v_result;
end $$;

-- 2. 每天台灣時間 03:15 清除超過 30 天的通知
create extension if not exists pg_cron;
select cron.schedule(
  'cleanup-old-notifications',
  '15 19 * * *',
  $$delete from public.notifications where created_at < now() - interval '30 days'$$
);
