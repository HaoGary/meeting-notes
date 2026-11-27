-- 外部參與人員：沒有系統帳號的成員，只記錄名字（不具任何存取權限）
alter table public.meetings add column if not exists guests text[] not null default '{}';
alter table public.meetings drop constraint if exists meetings_guests_check;
create or replace function public.valid_guest_names(p text[]) returns boolean
  language sql immutable set search_path = '' as $$
  select cardinality(p) <= 50
     and not exists (select 1 from unnest(p) g where g is null or char_length(btrim(g)) = 0 or char_length(g) > 40) $$;
alter table public.meetings add constraint meetings_guests_check check (public.valid_guest_names(guests));
grant select (guests), update (guests) on public.meetings to authenticated;

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
    'host', (select jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color) from public.profiles p where p.id = v_m.host_id),
    'attendees', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color) order by a.added_at), '[]'::jsonb)
                  from public.meeting_attendees a join public.profiles p on p.id = a.user_id where a.meeting_id = v_m.id),
    'guests', to_jsonb(v_m.guests),
    'doc', v_c.doc, 'updated_at', v_c.updated_at, 'scope', v_s.scope, 'expires_at', v_s.expires_at
  );
end $function$;
