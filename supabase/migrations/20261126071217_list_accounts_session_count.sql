-- 帳號管理列表加上「登入中裝置數」（強制登出按鈕使用）
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
      'pending_invite', u.invited_at is not null and u.last_sign_in_at is null,
      'session_count', (select count(*) from auth.sessions s
                         where s.user_id = p.id and (s.not_after is null or s.not_after > now()))
    ) order by p.created_at), '[]'::jsonb)
    from public.profiles p join auth.users u on u.id = p.id
  );
end $$;
