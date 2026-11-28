-- 資料庫效能優化：會議列表整批計算權限；RLS 函式每次查詢只算一次
-- 不改任何欄位、資料關聯或權限規則，只改計算方式（詳見 docs/performance-2026-11.md）

-- 1. 會議列表：權限改為整批計算（原本每一筆會議各呼叫 5 個權限函式）
--    已在正式資料庫以 2,000 / 600 筆測試資料（交易內，結束後還原）比對：
--    系統管理員、會議管理者、一般成員、唯讀成員四種角色的結果逐筆完全相同；2,000 筆時 6,075 ms → 194 ms
--    唯一差異：日期與開始時間都相同的會議，多以 id 排序，讓順序固定（原本順序不固定）
create or replace function public.list_meetings() returns jsonb
  language sql stable security definer set search_path = '' as $$
  with me as (
    select (select auth.uid()) as uid, public.is_active_user() as active,
           public.has_perm('meeting.edit_all') as edit_all, public.has_perm('meeting.view_all') as view_all,
           public.has_perm('meeting.archive') as p_archive, public.has_perm('meeting.share') as p_share,
           public.has_perm('meeting.delete_all') as del_all, public.has_perm('meeting.delete_own') as del_own
  ), cnt as (
    select meeting_id, count(*) as c from public.meeting_attendees group by meeting_id
  )
  select coalesce(jsonb_agg(to_jsonb(x.m) || jsonb_build_object(
      'permission', x.acc,
      'can_archive', x.acc = 'editor' and me.p_archive,
      'can_share', x.acc = 'editor' and me.p_share,
      'can_delete', me.del_all or (((x.m).host_id = me.uid or (x.m).created_by = me.uid) and me.del_own),
      'attendee_count', coalesce(cnt.c, 0)
    ) order by (x.m).meeting_date desc, (x.m).start_time desc, (x.m).id), '[]'::jsonb)
  from me
  cross join lateral (
    select m, case
      when m.host_id = me.uid or m.created_by = me.uid or me.edit_all then 'editor'
      when a.permission is not null then a.permission
      when me.view_all then 'viewer'
    end as acc
    from public.meetings m
    left join public.meeting_attendees a on a.meeting_id = m.id and a.user_id = me.uid
    where me.active
  ) x
  left join cnt on cnt.meeting_id = (x.m).id
  where x.acc is not null;
$$;

-- 2. RLS：函式以 (select …) 包住，每次查詢只算一次（原本每一列都重算，含登入工作階段檢查）
alter policy "可讀本人或啟用中使用者可讀全部" on public.profiles
  using ((id = (select auth.uid())) or (select public.is_active_user()));
alter policy "本人可改自己的姓名" on public.profiles
  using ((id = (select auth.uid())) and (select public.is_active_user()));
alter policy "權限管理者可讀異動紀錄" on public.audit_logs
  using ((select public.has_perm('system.permissions')));
