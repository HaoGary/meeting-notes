-- 外部主持人：主持人沒有系統帳號時只記錄名字。
-- host_id 仍保留（決定存取權限，不變動）；host_name 有值時畫面以外部主持人顯示。
alter table public.meetings add column if not exists host_name text;
alter table public.meetings drop constraint if exists meetings_host_name_check;
alter table public.meetings add constraint meetings_host_name_check
  check (host_name is null or (char_length(btrim(host_name)) between 1 and 40));
grant select (host_name), update (host_name) on public.meetings to authenticated;

-- 修改紀錄也涵蓋外部主持人與外部參與人員
create or replace function public.log_meeting_update() returns trigger
  language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is not null and (
    new.title, new.meeting_date, new.start_time, new.end_time, new.location, new.online_url, new.host_id, new.type, new.host_name, new.guests
  ) is distinct from (
    old.title, old.meeting_date, old.start_time, old.end_time, old.location, old.online_url, old.host_id, old.type, old.host_name, old.guests
  ) then
    insert into public.meeting_history (meeting_id, user_id, action) values (new.id, auth.uid(), '修改會議資料');
  end if;
  return new;
end $function$;

create or replace function public.get_shared_meeting(p_token text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_s public.meeting_shares; v_m public.meetings; v_c public.meeting_contents;
begin
  select * into v_s from public.meeting_shares where token = p_token;
  if not found or not v_s.enabled then
    perform public.api_error(404, '此分享連結不存在或已關閉', 'SHARE_NOT_FOUND');
  end if;
  if v_s.expires_at is not null and v_s.expires_at < now() then
    perform public.api_error(410, '此分享連結已過期', 'SHARE_EXPIRED');
  end if;
  if v_s.scope = 'org' and not public.is_active_user() then
    perform public.api_error(401, '此會議僅限公司成員檢視，請先登入', 'LOGIN_REQUIRED');
  end if;
  update public.meeting_shares set view_count = view_count + 1 where meeting_id = v_s.meeting_id;
  select * into v_m from public.meetings where id = v_s.meeting_id;
  select * into v_c from public.meeting_contents where meeting_id = v_s.meeting_id;
  return jsonb_build_object(
    'meeting', jsonb_build_object('title', v_m.title, 'meeting_date', v_m.meeting_date, 'start_time', v_m.start_time,
      'end_time', v_m.end_time, 'location', v_m.location, 'online_url', v_m.online_url, 'type', v_m.type, 'status', v_m.status),
    'host', case when v_m.host_name is not null then jsonb_build_object('id', null, 'name', v_m.host_name, 'external', true)
             else (select jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color) from public.profiles p where p.id = v_m.host_id) end,
    'attendees', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color) order by a.added_at), '[]'::jsonb)
                  from public.meeting_attendees a join public.profiles p on p.id = a.user_id where a.meeting_id = v_m.id),
    'guests', to_jsonb(v_m.guests),
    'doc', v_c.doc, 'updated_at', v_c.updated_at, 'scope', v_s.scope, 'expires_at', v_s.expires_at
  );
end $function$;
