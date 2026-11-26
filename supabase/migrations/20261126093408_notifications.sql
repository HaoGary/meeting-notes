-- 系統內通知：只能讀、標為已讀自己的通知；新增只由觸發器與函式寫入
-- 註：notify_meeting_update 的陣列寫法於 20261126093615 修正；參與人通知與 30 天清除見 20261126093700
create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  type       text not null check (type in (
               'meeting_added', 'meeting_removed', 'meeting_permission',
               'meeting_updated', 'meeting_status', 'meeting_deleted',
               'role_changed', 'password_reset')),
  meeting_id uuid references public.meetings(id) on delete set null,
  title      text not null,
  body       text not null default '',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_actor_idx on public.notifications (actor_id);
create index notifications_meeting_idx on public.notifications (meeting_id);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "只能讀自己的通知" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and created_at > now() - interval '30 days');
create policy "只能標記自己的通知為已讀" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.notify(
  p_user uuid, p_type text, p_meeting uuid, p_title text, p_body text default ''
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  if not exists (select 1 from public.profiles where id = p_user and active) then return; end if;
  insert into public.notifications (user_id, actor_id, type, meeting_id, title, body)
  values (p_user, auth.uid(), p_type, p_meeting, p_title, coalesce(p_body, ''));
end $$;

create or replace function public.meeting_recipients(p_meeting uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select host_id from public.meetings where id = p_meeting
  union
  select user_id from public.meeting_attendees where meeting_id = p_meeting;
$$;

create or replace function public.actor_name()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select name from public.profiles where id = auth.uid()), '系統');
$$;

create or replace function public.notify_meeting_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_actor text := public.actor_name(); v_parts text[] := '{}'; v_label text;
begin
  if auth.uid() is null then return new; end if;
  if new.meeting_date is distinct from old.meeting_date or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time then v_parts := v_parts || '時間'; end if;
  if new.location is distinct from old.location or new.online_url is distinct from old.online_url then
    v_parts := v_parts || '地點'; end if;
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
create trigger meetings_notify_update after update on public.meetings
  for each row execute function public.notify_meeting_update();

create or replace function public.notify_meeting_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_actor text := public.actor_name();
begin
  if auth.uid() is null then return old; end if;
  for v_uid in select public.meeting_recipients(old.id) loop
    perform public.notify(v_uid, 'meeting_deleted', null, format('會議「%s」已被刪除', old.title), format('由 %s 刪除', v_actor));
  end loop;
  return old;
end $$;
create trigger meetings_notify_deleted before delete on public.meetings
  for each row execute function public.notify_meeting_deleted();

create or replace function public.notify_role_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.role_id is distinct from old.role_id then
    perform public.notify(new.id, 'role_changed', null,
      format('你的角色已變更為「%s」', (select name from public.roles where id = new.role_id)),
      format('由 %s 變更，可使用的功能可能有所不同', public.actor_name()));
  end if;
  return new;
end $$;
create trigger profiles_notify_role after update of role_id on public.profiles
  for each row execute function public.notify_role_changed();

create or replace function public.mark_all_notifications_read()
returns int language sql security definer set search_path = '' as $$
  with u as (
    update public.notifications set read_at = now()
     where user_id = (select auth.uid()) and read_at is null returning 1
  ) select count(*)::int from u;
$$;

revoke execute on function public.notify(uuid, text, uuid, text, text), public.meeting_recipients(uuid), public.actor_name(),
  public.notify_meeting_update(), public.notify_meeting_deleted(), public.notify_role_changed()
  from public, anon, authenticated;
revoke execute on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

alter publication supabase_realtime add table public.notifications;
