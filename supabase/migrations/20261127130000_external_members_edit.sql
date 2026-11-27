-- 外部成員：改名（同步更新所有會議中的名字）與刪除（會議中已記錄的名字保留）
create or replace function public.rename_external_member(p_id uuid, p_name text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_old text; v_new text := btrim(coalesce(p_name, ''));
begin
  if not public.is_active_user() then perform public.api_error(401, '請先登入', 'UNAUTHORIZED'); end if;
  if char_length(v_new) not between 1 and 40 then perform public.api_error(422, '名字需為 1–40 個字', 'VALIDATION'); end if;
  select name into v_old from public.external_members where id = p_id for update;
  if not found then perform public.api_error(404, '找不到此外部成員', 'NOT_FOUND'); end if;
  if exists (select 1 from public.external_members where id <> p_id and lower(btrim(name)) = lower(v_new)) then
    perform public.api_error(409, '已有相同名字的外部成員', 'DUPLICATE');
  end if;
  update public.external_members set name = v_new where id = p_id;
  if v_old is distinct from v_new then
    update public.meetings m set guests = array(
        select x from unnest(array_replace(m.guests, v_old, v_new)) with ordinality t(x, i) group by x order by min(i))
      where v_old = any(m.guests);
    update public.meetings set host_name = v_new where host_name = v_old;
  end if;
  return jsonb_build_object('id', p_id, 'name', v_new, 'old', v_old);
end $function$;

create or replace function public.delete_external_member(p_id uuid)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
begin
  if not public.is_active_user() then perform public.api_error(401, '請先登入', 'UNAUTHORIZED'); end if;
  delete from public.external_members where id = p_id;
  if not found then perform public.api_error(404, '找不到此外部成員', 'NOT_FOUND'); end if;
  return jsonb_build_object('ok', true);
end $function$;

revoke execute on function public.rename_external_member(uuid, text) from public, anon;
revoke execute on function public.delete_external_member(uuid) from public, anon;
grant execute on function public.rename_external_member(uuid, text) to authenticated;
grant execute on function public.delete_external_member(uuid) to authenticated;
