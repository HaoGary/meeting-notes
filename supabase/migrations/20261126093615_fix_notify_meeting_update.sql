-- 修正：text[] 與字串串接要用 array_append，否則會被當成陣列字面值解析
create or replace function public.notify_meeting_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_actor text := public.actor_name(); v_parts text[] := '{}'; v_label text;
begin
  if auth.uid() is null then return new; end if;
  if new.meeting_date is distinct from old.meeting_date or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time then v_parts := array_append(v_parts, '時間'); end if;
  if new.location is distinct from old.location or new.online_url is distinct from old.online_url then
    v_parts := array_append(v_parts, '地點'); end if;
  if array_length(v_parts, 1) > 0 then
    for v_uid in select public.meeting_recipients(new.id) loop
      perform public.notify(v_uid, 'meeting_updated', new.id,
        format('「%s」的%s已變更', new.title, array_to_string(v_parts, '與')),
        format('%s 更新為 %s %s–%s%s', v_actor, to_char(new.meeting_date, 'MM/DD'),
               to_char(new.start_time, 'HH24:MI'), to_char(new.end_time, 'HH24:MI'),
               case when new.location <> '' then '・' || new.location else '' end));
    end loop;
  end if;
  if new.status is distinct from old.status then
    v_label := case
      when new.status = 'archived' then '已封存'
      when old.status = 'archived' then '已取消封存'
      when new.status = 'done' then '已標記為完成'
      else '已改回草稿' end;
    for v_uid in select public.meeting_recipients(new.id) loop
      perform public.notify(v_uid, 'meeting_status', new.id, format('「%s」%s', new.title, v_label), format('由 %s 變更', v_actor));
    end loop;
  end if;
  return new;
end $$;
revoke execute on function public.notify_meeting_update() from public, anon, authenticated;
