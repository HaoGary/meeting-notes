-- 帳號、角色相關 RPC
-- 註：save_role_permissions、delete_role 含 delete 語句，另見 20261126041300_functions_with_delete.sql

create or replace function public.my_profile()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user', to_jsonb(p) || jsonb_build_object('email', u.email, 'email_confirmed_at', u.email_confirmed_at,
                                             'last_sign_in_at', u.last_sign_in_at),
    'permissions', coalesce((select jsonb_agg(rp.permission_key order by rp.permission_key)
                             from public.role_permissions rp where rp.role_id = p.role_id
                             and p.active and not p.must_change_password), '[]'::jsonb)
  )
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = (select auth.uid());
$$;

create or replace function public.complete_password_change()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = (select auth.uid());
$$;

create or replace function public.create_role(p_name text, p_description text default '', p_copy_from text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_r public.roles;
  v_colors text[] := array['#7c3aed','#0d9488','#e11d48','#2563eb','#ca8a04','#0891b2'];
begin
  if not public.has_perm('system.permissions') then
    perform public.api_error(403, '沒有「權限管理」權限', 'FORBIDDEN');
  end if;
  if coalesce(btrim(p_name), '') = '' then perform public.api_error(422, '請輸入角色名稱', 'VALIDATION'); end if;
  if exists (select 1 from public.roles where name = btrim(p_name)) then
    perform public.api_error(409, '角色名稱已存在', 'DUPLICATE');
  end if;
  insert into public.roles (id, name, description, color)
  values ('role_' || substr(md5(gen_random_uuid()::text), 1, 8), btrim(p_name), coalesce(p_description, ''),
          v_colors[1 + (floor(random() * array_length(v_colors, 1)))::int])
  returning * into v_r;
  if p_copy_from is not null then
    insert into public.role_permissions (role_id, permission_key)
    select v_r.id, permission_key from public.role_permissions where role_id = p_copy_from;
  end if;
  insert into public.audit_logs (actor_id, action) values (v_uid, format('新增角色「%s」', v_r.name));
  return to_jsonb(v_r);
end $$;

create or replace function public.set_user_role(p_user uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_t public.profiles; v_role_name text;
begin
  if not public.has_perm('system.permissions') then
    perform public.api_error(403, '沒有「權限管理」權限', 'FORBIDDEN');
  end if;
  if p_user = v_uid then perform public.api_error(403, '無法變更自己的角色，以免失去管理權限', 'SELF'); end if;
  select * into v_t from public.profiles where id = p_user for update;
  if not found then perform public.api_error(404, '找不到使用者', 'NOT_FOUND'); end if;
  select name into v_role_name from public.roles where id = p_role;
  if v_role_name is null then perform public.api_error(422, '角色不存在', 'VALIDATION'); end if;
  if v_t.role_id = 'admin' and p_role <> 'admin' and v_t.active and not exists (
    select 1 from public.profiles where role_id = 'admin' and active and id <> p_user
  ) then
    perform public.api_error(409, '至少需保留一位啟用中的系統管理員', 'LAST_ADMIN');
  end if;
  if v_t.role_id = p_role then return to_jsonb(v_t) - 'email'; end if;
  update public.profiles set role_id = p_role where id = p_user returning * into v_t;
  insert into public.audit_logs (actor_id, action) values (v_uid, format('將「%s」的角色設為「%s」', v_t.name, v_role_name));
  return to_jsonb(v_t) - 'email';
end $$;

create or replace function public.set_user_active(p_user uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_t public.profiles;
begin
  if not public.has_perm('system.accounts') then
    perform public.api_error(403, '沒有「帳號管理」權限', 'FORBIDDEN');
  end if;
  if p_user = v_uid then perform public.api_error(403, '無法停用自己的帳號', 'SELF'); end if;
  select * into v_t from public.profiles where id = p_user for update;
  if not found then perform public.api_error(404, '找不到使用者', 'NOT_FOUND'); end if;
  if not p_active and v_t.role_id = 'admin' and v_t.active and not exists (
    select 1 from public.profiles where role_id = 'admin' and active and id <> p_user
  ) then
    perform public.api_error(409, '至少需保留一位啟用中的系統管理員', 'LAST_ADMIN');
  end if;
  if v_t.active = p_active then return to_jsonb(v_t) - 'email'; end if;
  update public.profiles set active = p_active where id = p_user returning * into v_t;
  insert into public.audit_logs (actor_id, action)
  values (v_uid, format('%s帳號「%s」', case when p_active then '啟用' else '停用' end, v_t.name));
  return to_jsonb(v_t) - 'email';
end $$;

create or replace function public.list_accounts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('system.accounts') then
    perform public.api_error(403, '沒有「帳號管理」權限', 'FORBIDDEN');
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'email_confirmed_at', u.email_confirmed_at,
      'last_sign_in_at', u.last_sign_in_at,
      'invited_at', u.invited_at,
      'pending_invite', u.invited_at is not null and u.last_sign_in_at is null
    ) order by p.created_at), '[]'::jsonb)
    from public.profiles p join auth.users u on u.id = p.id
  );
end $$;

-- 函式執行權限：預設全部收回，只開放前端需要的
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

grant execute on function
  public.is_active_user(), public.has_perm(text), public.meeting_access(uuid), public.can_delete_meeting(uuid),
  public.get_meeting_access(uuid), public.list_meetings(),
  public.create_meeting(text, date, time, time, text, jsonb),
  public.save_meeting_content(uuid, jsonb, int), public.set_meeting_status(uuid, text),
  public.update_share(uuid, jsonb), public.reset_share_token(uuid),
  public.my_profile(), public.complete_password_change(),
  public.create_role(text, text, text), public.set_user_role(uuid, text), public.set_user_active(uuid, boolean),
  public.list_accounts()
to authenticated;
grant execute on function public.get_shared_meeting(text) to anon, authenticated;
