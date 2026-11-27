-- 外部成員名單：統一管理沒有系統帳號的人，新增主持人或參與人員時可以直接選
create table if not exists public.external_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists external_members_name_key on public.external_members (lower(btrim(name)));
alter table public.external_members enable row level security;
revoke all on public.external_members from anon, authenticated;
grant select, insert on public.external_members to authenticated;
drop policy if exists external_members_select on public.external_members;
create policy external_members_select on public.external_members for select to authenticated using ((select public.is_active_user()));
drop policy if exists external_members_insert on public.external_members;
create policy external_members_insert on public.external_members for insert to authenticated
  with check ((select public.is_active_user()) and created_by = (select auth.uid()));

-- 既有會議中用過的外部人員名字匯入名單
insert into public.external_members (name, created_by)
select distinct on (lower(btrim(n))) btrim(n), null from (
  select unnest(guests) n from public.meetings union all select host_name from public.meetings where host_name is not null
) x where btrim(n) <> ''
on conflict do nothing;
