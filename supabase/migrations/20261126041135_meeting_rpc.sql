-- 會議相關 RPC（多步驟操作在同一個交易內完成）
-- 註：set_meeting_attendees 含 delete 語句，另見 20261126041300_functions_with_delete.sql

create or replace function public.require_meeting_editable(p_meeting uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_acc text; v_status text;
begin
  v_acc := public.meeting_access(p_meeting);
  if v_acc is null then perform public.api_error(404, '找不到此會議，或您沒有檢視權限', 'NOT_FOUND'); end if;
  if v_acc <> 'editor' then perform public.api_error(403, '您只有檢視權限，無法修改', 'FORBIDDEN'); end if;
  select status into v_status from public.meetings where id = p_meeting;
  if v_status = 'archived' then perform public.api_error(423, '會議已封存，請先取消封存', 'ARCHIVED'); end if;
end $$;

create or replace function public.get_meeting_access(p_meeting uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'permission', acc,
    'can_archive', coalesce(acc = 'editor' and public.has_perm('meeting.archive'), false),
    'can_share', coalesce(acc = 'editor' and public.has_perm('meeting.share'), false),
    'can_delete', acc is not null and public.can_delete_meeting(p_meeting)
  ) from (select public.meeting_access(p_meeting) as acc) t;
$$;

create or replace function public.list_meetings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    to_jsonb(m) || jsonb_build_object(
      'permission', l.acc,
      'can_archive', l.acc = 'editor' and public.has_perm('meeting.archive'),
      'can_share', l.acc = 'editor' and public.has_perm('meeting.share'),
      'can_delete', public.can_delete_meeting(m.id),
      'attendee_count', (select count(*) from public.meeting_attendees a where a.meeting_id = m.id)
    ) order by m.meeting_date desc, m.start_time desc
  ), '[]'::jsonb)
  from public.meetings m
  cross join lateral (select public.meeting_access(m.id) as acc) l
  where l.acc is not null;
$$;

create or replace function public.create_meeting(
  p_title text, p_date date, p_start time, p_end time, p_type text, p_doc jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_m public.meetings;
begin
  if not public.has_perm('meeting.create') then
    perform public.api_error(403, '沒有「建立會議」權限', 'FORBIDDEN');
  end if;
  insert into public.meetings (title, meeting_date, start_time, end_time, type, host_id, created_by)
  values (coalesce(nullif(btrim(p_title), ''), '未命名會議'), coalesce(p_date, current_date),
          coalesce(p_start, '10:00'), coalesce(p_end, '11:00'), coalesce(p_type, '例行會議'), v_uid, v_uid)
  returning * into v_m;
  insert into public.meeting_attendees (meeting_id, user_id, permission) values (v_m.id, v_uid, 'editor');
  insert into public.meeting_contents (meeting_id, doc, updated_by)
  values (v_m.id, coalesce(p_doc, '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb), v_uid);
  insert into public.meeting_history (meeting_id, user_id, action) values (v_m.id, v_uid, '建立會議');
  return to_jsonb(v_m);
end $$;

create or replace function public.save_meeting_content(p_meeting uuid, p_doc jsonb, p_base_version int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_cur public.meeting_contents; v_last public.meeting_history; v_label text;
begin
  perform public.require_meeting_editable(p_meeting);
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    perform public.api_error(422, '內容格式不正確', 'VALIDATION');
  end if;
  select * into v_cur from public.meeting_contents where meeting_id = p_meeting for update;
  if v_cur.version <> p_base_version then
    return jsonb_build_object('conflict', true, 'version', v_cur.version, 'doc', v_cur.doc,
                              'updated_at', v_cur.updated_at, 'updated_by', v_cur.updated_by);
  end if;
  update public.meeting_contents
     set doc = p_doc, version = version + 1, updated_by = v_uid, updated_at = now()
   where meeting_id = p_meeting returning * into v_cur;
  update public.meetings set updated_at = now() where id = p_meeting;
  v_label := format('編輯內容（版本 %s）', v_cur.version);
  select * into v_last from public.meeting_history
   where meeting_id = p_meeting order by created_at desc, id desc limit 1;
  if v_last.id is not null and v_last.user_id = v_uid and v_last.action like '編輯內容%'
     and v_last.created_at > now() - interval '2 minutes' then
    update public.meeting_history set action = v_label, created_at = now() where id = v_last.id;
  else
    insert into public.meeting_history (meeting_id, user_id, action) values (p_meeting, v_uid, v_label);
  end if;
  return jsonb_build_object('conflict', false, 'version', v_cur.version, 'updated_at', v_cur.updated_at);
end $$;

create or replace function public.set_meeting_status(p_meeting uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_acc text; v_m public.meetings;
begin
  if p_status not in ('draft', 'done', 'archived') then
    perform public.api_error(422, '無效的會議狀態', 'VALIDATION');
  end if;
  v_acc := public.meeting_access(p_meeting);
  if v_acc is null then perform public.api_error(404, '找不到此會議，或您沒有檢視權限', 'NOT_FOUND'); end if;
  if v_acc <> 'editor' then perform public.api_error(403, '您只有檢視權限，無法修改', 'FORBIDDEN'); end if;
  select * into v_m from public.meetings where id = p_meeting for update;
  if (p_status = 'archived' or v_m.status = 'archived') and not public.has_perm('meeting.archive') then
    perform public.api_error(403, '沒有「封存會議」權限', 'FORBIDDEN');
  end if;
  if v_m.status = p_status then return to_jsonb(v_m); end if;
  update public.meetings set status = p_status where id = p_meeting returning * into v_m;
  insert into public.meeting_history (meeting_id, user_id, action)
  values (p_meeting, v_uid, format('變更狀態為「%s」',
    case p_status when 'draft' then '草稿' when 'done' then '已完成' else '已封存' end));
  return to_jsonb(v_m);
end $$;

create or replace function public.update_share(p_meeting uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_s public.meeting_shares; v_days int;
begin
  if coalesce(public.meeting_access(p_meeting), '') <> 'editor' or not public.has_perm('meeting.share') then
    perform public.api_error(403, '沒有「分享會議」權限', 'FORBIDDEN');
  end if;
  select * into v_s from public.meeting_shares where meeting_id = p_meeting for update;
  if not found then
    insert into public.meeting_shares (meeting_id, created_by) values (p_meeting, v_uid) returning * into v_s;
    insert into public.meeting_history (meeting_id, user_id, action) values (p_meeting, v_uid, '建立分享連結');
  end if;
  if p_patch ? 'scope' then
    if p_patch->>'scope' not in ('org', 'public') then
      perform public.api_error(422, '無效的分享範圍', 'VALIDATION');
    end if;
    if p_patch->>'scope' <> v_s.scope then
      insert into public.meeting_history (meeting_id, user_id, action) values (p_meeting, v_uid,
        format('分享範圍改為「%s」', case p_patch->>'scope' when 'public' then '任何知道連結的人' else '僅限公司成員' end));
    end if;
    v_s.scope := p_patch->>'scope';
  end if;
  if p_patch ? 'expires_in_days' then
    v_days := coalesce((p_patch->>'expires_in_days')::int, 0);
    v_s.expires_at := case when v_days > 0 then now() + make_interval(days => v_days) else null end;
  end if;
  if p_patch ? 'enabled' and (p_patch->>'enabled')::boolean <> v_s.enabled then
    v_s.enabled := (p_patch->>'enabled')::boolean;
    insert into public.meeting_history (meeting_id, user_id, action)
    values (p_meeting, v_uid, case when v_s.enabled then '開啟分享連結' else '關閉分享連結' end);
  end if;
  update public.meeting_shares set scope = v_s.scope, expires_at = v_s.expires_at, enabled = v_s.enabled
   where meeting_id = p_meeting returning * into v_s;
  return to_jsonb(v_s);
end $$;

create or replace function public.reset_share_token(p_meeting uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_s public.meeting_shares;
begin
  if coalesce(public.meeting_access(p_meeting), '') <> 'editor' or not public.has_perm('meeting.share') then
    perform public.api_error(403, '沒有「分享會議」權限', 'FORBIDDEN');
  end if;
  update public.meeting_shares
     set token = replace(replace(rtrim(encode(extensions.gen_random_bytes(12), 'base64'), '='), '+', '-'), '/', '_'),
         view_count = 0
   where meeting_id = p_meeting returning * into v_s;
  if not found then perform public.api_error(404, '尚未建立分享連結', 'NOT_FOUND'); end if;
  insert into public.meeting_history (meeting_id, user_id, action) values (p_meeting, v_uid, '重設分享連結（舊連結已失效）');
  return to_jsonb(v_s);
end $$;

create or replace function public.get_shared_meeting(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
    'doc', v_c.doc, 'updated_at', v_c.updated_at, 'scope', v_s.scope, 'expires_at', v_s.expires_at
  );
end $$;
