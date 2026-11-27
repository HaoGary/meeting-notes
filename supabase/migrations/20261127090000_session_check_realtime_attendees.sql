-- 登入 session 被撤銷（強制登出、登出全裝置）時，該 session 的 token 立即失去資料存取權，不必等 token 過期
create or replace function public.session_alive()
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when (select auth.jwt() ->> 'session_id') is null then true
    else exists (
      select 1 from auth.sessions s
       where s.id = ((select auth.jwt() ->> 'session_id'))::uuid
         and (s.not_after is null or s.not_after > now()))
  end;
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and not p.must_change_password
  ) and public.session_alive();
$$;

-- 前端定期檢查：帳號仍啟用且這個 session 仍有效
create or replace function public.session_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
     and public.session_alive();
$$;

revoke execute on function public.session_alive() from public, anon;
revoke execute on function public.session_ok() from public, anon;
grant execute on function public.session_alive(), public.session_ok() to authenticated;

-- 參與人員變動也即時推送（會議編輯頁同步）
alter publication supabase_realtime add table public.meeting_attendees;
