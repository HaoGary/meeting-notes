-- 權限判斷函式、RLS 政策、觸發器
create or replace function public.api_error(p_status int, p_message text, p_code text default null)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'PT' || p_status::text, message = p_message, hint = coalesce(p_code, '');
end $$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and not p.must_change_password
  );
$$;

create or replace function public.has_perm(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = (select auth.uid()) and p.active and not p.must_change_password
      and rp.permission_key = p_key
  );
$$;

create or replace function public.meeting_access(p_meeting uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not public.is_active_user() then null
    when m.host_id = (select auth.uid()) or m.created_by = (select auth.uid())
      or public.has_perm('meeting.edit_all') then 'editor'
    when a.permission is not null then a.permission
    when public.has_perm('meeting.view_all') then 'viewer'
    else null
  end
  from public.meetings m
  left join public.meeting_attendees a on a.meeting_id = m.id and a.user_id = (select auth.uid())
  where m.id = p_meeting;
$$;

create or replace function public.can_delete_meeting(p_meeting uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.has_perm('meeting.delete_all')
    or exists (
      select 1 from public.meetings m
      where m.id = p_meeting
        and (m.host_id = (select auth.uid()) or m.created_by = (select auth.uid()))
        and public.has_perm('meeting.delete_own')
    )
  );
$$;

create policy "登入者可讀權限清單" on public.permissions for select to authenticated using (true);
create policy "登入者可讀角色" on public.roles for select to authenticated using (true);
create policy "登入者可讀角色權限" on public.role_permissions for select to authenticated using (true);

create policy "可讀本人或啟用中使用者可讀全部" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_active_user());
create policy "本人可改自己的姓名" on public.profiles for update to authenticated
  using (id = (select auth.uid()) and public.is_active_user())
  with check (id = (select auth.uid()));

create policy "有權限才可讀會議" on public.meetings for select to authenticated
  using (public.meeting_access(id) is not null);
create policy "編輯者可改未封存的會議" on public.meetings for update to authenticated
  using (public.meeting_access(id) = 'editor' and status <> 'archived')
  with check (public.meeting_access(id) = 'editor');
create policy "有刪除權限才可刪會議" on public.meetings for delete to authenticated
  using (public.can_delete_meeting(id));

create policy "可讀會議即可讀參與人" on public.meeting_attendees for select to authenticated
  using (public.meeting_access(meeting_id) is not null);
create policy "可讀會議即可讀內容" on public.meeting_contents for select to authenticated
  using (public.meeting_access(meeting_id) is not null);
create policy "編輯者且有分享權限可讀分享設定" on public.meeting_shares for select to authenticated
  using (public.meeting_access(meeting_id) = 'editor' and public.has_perm('meeting.share'));
create policy "可讀會議即可讀修改紀錄" on public.meeting_history for select to authenticated
  using (public.meeting_access(meeting_id) is not null);
create policy "權限管理者可讀異動紀錄" on public.audit_logs for select to authenticated
  using (public.has_perm('system.permissions'));

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger meetings_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

create or replace function public.log_meeting_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and (
    new.title, new.meeting_date, new.start_time, new.end_time, new.location, new.online_url, new.host_id, new.type
  ) is distinct from (
    old.title, old.meeting_date, old.start_time, old.end_time, old.location, old.online_url, old.host_id, old.type
  ) then
    insert into public.meeting_history (meeting_id, user_id, action) values (new.id, auth.uid(), '修改會議資料');
  end if;
  return new;
end $$;
create trigger meetings_log_update after update on public.meetings
  for each row execute function public.log_meeting_update();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_app  jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_local text := split_part(coalesce(new.email, ''), '@', 1);
  v_username text;
  v_name text;
  v_colors text[] := array['#4f46e5','#0891b2','#059669','#d97706','#db2777','#7c3aed','#0d9488','#e11d48'];
begin
  v_username := lower(regexp_replace(coalesce(nullif(v_meta->>'username', ''), v_local), '[^a-zA-Z0-9_.]', '', 'g'));
  if v_username !~ '^[a-zA-Z]' then v_username := 'u' || v_username; end if;
  v_username := left(v_username, 15);
  if char_length(v_username) < 4 then v_username := rpad(v_username, 4, '0'); end if;
  while exists (select 1 from public.profiles where username = v_username::extensions.citext) loop
    v_username := left(v_username, 15) || (floor(random() * 9000) + 1000)::int::text;
  end loop;
  v_name := left(coalesce(nullif(btrim(v_meta->>'name'), ''), nullif(v_local, ''), '使用者'), 30);

  insert into public.profiles (id, username, name, email, role_id, color, must_change_password, created_by)
  values (
    new.id, v_username, v_name, lower(new.email),
    coalesce(nullif(v_app->>'role_id', ''), 'viewer'),
    v_colors[1 + (floor(random() * array_length(v_colors, 1)))::int],
    coalesce((v_app->>'must_change_password')::boolean, false),
    nullif(v_app->>'created_by', '')::uuid
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();
