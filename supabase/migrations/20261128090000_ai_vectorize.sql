-- AI 圖片向量化（Recraft）：權限、每日上限、使用紀錄
-- 流程：Edge Function vectorize-ai 以使用者身分呼叫 ai_vectorize_reserve() 預扣一次額度
--       → 呼叫 Recraft → 以 service role 呼叫 ai_vectorize_finish() 記錄結果（失敗不計入額度）

-- 1. 權限：預設只給系統管理員，其他角色可在「權限管理」勾選
insert into public.permissions (key, "group", label, description, sort)
values ('tools.vectorize_ai', '文件工具', 'AI 圖片向量化', '使用 Recraft AI 轉換圖片（圖片會上傳到 Recraft，按次計費，有每日上限）', 100)
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_key)
values ('admin', 'tools.vectorize_ai')
on conflict do nothing;

-- 2. 系統設定（目前只有每人每日上限）
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
insert into public.app_settings (key, value) values ('ai_vectorize_daily_limit', '20'::jsonb)
on conflict (key) do nothing;

-- 3. 使用紀錄
create table if not exists public.ai_vectorize_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  width int, height int, bytes int,
  credits int,
  error text
);
create index if not exists ai_vectorize_usage_user_day on public.ai_vectorize_usage (user_id, created_at desc);
alter table public.ai_vectorize_usage enable row level security;
revoke all on public.ai_vectorize_usage from anon, authenticated;
grant select on public.ai_vectorize_usage to authenticated;
drop policy if exists ai_vectorize_usage_select on public.ai_vectorize_usage;
create policy ai_vectorize_usage_select on public.ai_vectorize_usage for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_perm('system.permissions')));

-- 今日（台北時間）已使用次數：成功 + 10 分鐘內仍在處理中的（失敗不計）
create or replace function public.ai_vectorize_used_today(p_user uuid) returns int
  language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.ai_vectorize_usage u
  where u.user_id = p_user
    and u.created_at >= (date_trunc('day', now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei')
    and (u.status = 'success' or (u.status = 'pending' and u.created_at > now() - interval '10 minutes'));
$$;

create or replace function public.ai_vectorize_limit() returns int
  language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = 'ai_vectorize_daily_limit'), 20);
$$;

-- 目前使用者的額度
create or replace function public.ai_vectorize_quota() returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare v_limit int := public.ai_vectorize_limit(); v_used int;
begin
  if not public.is_active_user() then perform public.api_error(401, '請先登入', 'NOT_LOGGED_IN'); end if;
  v_used := public.ai_vectorize_used_today((select auth.uid()));
  return jsonb_build_object('allowed', public.has_perm('tools.vectorize_ai'), 'limit', v_limit, 'used', v_used,
    'remaining', greatest(v_limit - v_used, 0), 'canConfigure', public.has_perm('system.permissions'));
end $$;

-- 預扣一次額度（同一人同時送出多張時以 advisory lock 排隊，避免超過上限）
create or replace function public.ai_vectorize_reserve(p_width int, p_height int, p_bytes int) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_limit int := public.ai_vectorize_limit(); v_used int; v_id uuid;
begin
  if not public.is_active_user() then perform public.api_error(401, '請先登入', 'NOT_LOGGED_IN'); end if;
  if not public.has_perm('tools.vectorize_ai') then
    perform public.api_error(403, '你沒有使用 AI 向量化的權限，請聯絡系統管理員', 'FORBIDDEN');
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_vectorize:' || v_uid::text));
  v_used := public.ai_vectorize_used_today(v_uid);
  if v_used >= v_limit then
    perform public.api_error(429, format('今天的 AI 向量化次數已用完（每人每日 %s 次），請明天再試，或改用本機引擎', v_limit), 'QUOTA_EXCEEDED');
  end if;
  insert into public.ai_vectorize_usage (user_id, width, height, bytes) values (v_uid, p_width, p_height, p_bytes)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'limit', v_limit, 'used', v_used + 1, 'remaining', greatest(v_limit - v_used - 1, 0));
end $$;

-- 記錄結果：只有 Edge Function（service role）能呼叫
create or replace function public.ai_vectorize_finish(p_id uuid, p_status text, p_credits int, p_error text) returns void
  language sql security definer set search_path = '' as $$
  update public.ai_vectorize_usage
     set status = case when p_status in ('success', 'failed') then p_status else 'failed' end,
         credits = p_credits, error = left(p_error, 500), finished_at = now()
   where id = p_id and status = 'pending';
$$;

-- 管理員調整每日上限（需「權限管理」）
create or replace function public.set_ai_vectorize_limit(p_limit int) returns jsonb
  language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('system.permissions') then perform public.api_error(403, '沒有調整上限的權限', 'FORBIDDEN'); end if;
  if p_limit is null or p_limit < 0 or p_limit > 1000 then perform public.api_error(422, '每日上限需為 0–1000', 'VALIDATION'); end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('ai_vectorize_daily_limit', to_jsonb(p_limit), now(), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  return public.ai_vectorize_quota();
end $$;

revoke execute on function public.ai_vectorize_used_today(uuid) from public, anon, authenticated;
revoke execute on function public.ai_vectorize_limit() from public, anon;
revoke execute on function public.ai_vectorize_quota() from public, anon;
revoke execute on function public.ai_vectorize_reserve(int, int, int) from public, anon;
revoke execute on function public.ai_vectorize_finish(uuid, text, int, text) from public, anon, authenticated;
revoke execute on function public.set_ai_vectorize_limit(int) from public, anon;
grant execute on function public.ai_vectorize_limit() to authenticated;
grant execute on function public.ai_vectorize_quota() to authenticated;
grant execute on function public.ai_vectorize_reserve(int, int, int) to authenticated;
grant execute on function public.set_ai_vectorize_limit(int) to authenticated;
grant execute on function public.ai_vectorize_finish(uuid, text, int, text) to service_role;
