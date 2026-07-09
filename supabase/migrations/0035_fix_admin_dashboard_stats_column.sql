-- ============================================================================
-- FANCLUV — 0035_fix_admin_dashboard_stats_column.sql
-- admin_dashboard_stats 컬럼명 버그 수정(관리자 대시보드 실데이터 폴백 원인).
--
-- 증상: 라이브 관리자 대시보드가 Mock 데이터로 폴백(실데이터 미표시).
-- 원인: RPC 가 최근활동 opinion 항목에서 존재하지 않는 컬럼 o.content 를 참조 →
--   "column o.content does not exist" (42703) 로 RPC 전체 실패 → 클라이언트가
--   Mock 으로 폴백. opinions 테이블의 본문 컬럼은 content 가 아니라 body 이다.
-- 조치: recent_union 의 opinion 항목을 left(o.body,40) 로 수정해 함수를 재정의.
--   (나머지 로직/시그니처/권한은 0013 과 동일)
-- ============================================================================

create or replace function public.admin_dashboard_stats(days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result        jsonb;
  since         timestamptz := now() - make_interval(days => greatest(days, 1));
  today         date        := current_date;
  week_start    date        := date_trunc('week', now())::date;
  chart_from    date        := current_date - 6;
  active_members integer     := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;

  begin
    select count(*) into active_members
      from auth.users
     where last_sign_in_at >= since;
  exception when others then
    active_members := 0;
  end;

  with
  kpi as (
    select jsonb_build_object(
      'totalMembers',       (select count(*) from public.profiles),
      'activeMembers',      active_members,
      'totalOpinions',      (select count(*) from public.opinions),
      'totalComments',      (select count(*) from public.comments),
      'totalSurveys',       (select count(*) from public.surveys),
      'totalResponses',     (select count(*) from public.survey_responses),
      'totalReports',       (select count(*) from public.reports),
      'aiRuns',             (select count(*) from public.ai_insights),
      'signupsToday',       (select count(*) from public.profiles where created_at >= today),
      'newMembersThisWeek', (select count(*) from public.profiles where created_at >= week_start)
    ) v
  ),
  team_members as (
    select coalesce(jsonb_object_agg(selected_team, c), '{}'::jsonb) v
    from (select selected_team, count(*) c from public.profiles
          where selected_team is not null group by selected_team) t
  ),
  team_opinions as (
    select coalesce(jsonb_object_agg(team_id, c), '{}'::jsonb) v
    from (select team_id, count(*) c from public.opinions group by team_id) t
  ),
  team_comments as (
    select coalesce(jsonb_object_agg(team_id, c), '{}'::jsonb) v
    from (select o.team_id, count(*) c
          from public.comments cm join public.opinions o on o.id = cm.opinion_id
          group by o.team_id) t
  ),
  team_responses as (
    select coalesce(jsonb_object_agg(team_id, c), '{}'::jsonb) v
    from (select team_id, count(*) c from public.survey_responses
          where team_id is not null group by team_id) t
  ),
  team_ai as (
    select coalesce(jsonb_object_agg(club_id, c), '{}'::jsonb) v
    from (select club_id, count(*) c from public.ai_insights group by club_id) t
  ),
  recent_union as (
    (select jsonb_build_object('type','signup','title',p.nickname,'team',p.selected_team,'actor',null,'at',p.created_at) r, p.created_at r_at
       from public.profiles p order by p.created_at desc limit 8)
    union all
    (select jsonb_build_object('type','opinion','title',left(o.body,40),'team',o.team_id,'actor',pr.nickname,'at',o.created_at), o.created_at
       from public.opinions o left join public.profiles pr on pr.id = o.author_id order by o.created_at desc limit 8)
    union all
    (select jsonb_build_object('type','comment','title',left(c.content,40),'team',null,'actor',pr.nickname,'at',c.created_at), c.created_at
       from public.comments c left join public.profiles pr on pr.id = c.author_id order by c.created_at desc limit 8)
    union all
    (select jsonb_build_object('type','survey','title',s.title,'team',s.team_id,'actor',null,'at',s.created_at), s.created_at
       from public.surveys s order by s.created_at desc limit 8)
    union all
    (select jsonb_build_object('type','response','title',s.title,'team',rp.team_id,'actor',pr.nickname,'at',rp.created_at), rp.created_at
       from public.survey_responses rp
       left join public.surveys s on s.id = rp.survey_id
       left join public.profiles pr on pr.id = rp.user_id
       order by rp.created_at desc limit 8)
    union all
    (select jsonb_build_object('type','report','title',left(coalesce(rep.target_excerpt, rep.reason),40),'team',null,'actor',rep.reason,'at',rep.created_at), rep.created_at
       from public.reports rep order by rep.created_at desc limit 8)
    union all
    (select jsonb_build_object('type','ai','title',ai.club_id,'team',(case when ai.club_id = 'all' then null else ai.club_id end),'actor',null,'at',ai.created_at), ai.created_at
       from public.ai_insights ai order by ai.created_at desc limit 8)
  ),
  recent as (
    select coalesce(jsonb_agg(r order by r_at desc), '[]'::jsonb) v
    from (select r, r_at from recent_union order by r_at desc limit 12) z
  ),
  days_series as (
    select generate_series(chart_from, today, interval '1 day')::date d
  ),
  chart_signups as (
    select coalesce(jsonb_agg(jsonb_build_object('label', to_char(ds.d,'MM/DD'), 'value', coalesce(x.c,0)) order by ds.d), '[]'::jsonb) v
    from days_series ds
    left join (select created_at::date d, count(*) c from public.profiles where created_at >= chart_from group by 1) x on x.d = ds.d
  ),
  chart_opinions as (
    select coalesce(jsonb_agg(jsonb_build_object('label', to_char(ds.d,'MM/DD'), 'value', coalesce(x.c,0)) order by ds.d), '[]'::jsonb) v
    from days_series ds
    left join (select created_at::date d, count(*) c from public.opinions where created_at >= chart_from group by 1) x on x.d = ds.d
  ),
  chart_responses as (
    select coalesce(jsonb_agg(jsonb_build_object('label', to_char(ds.d,'MM/DD'), 'value', coalesce(x.c,0)) order by ds.d), '[]'::jsonb) v
    from days_series ds
    left join (select created_at::date d, count(*) c from public.survey_responses where created_at >= chart_from group by 1) x on x.d = ds.d
  ),
  chart_reports as (
    select coalesce(jsonb_agg(jsonb_build_object('label', to_char(ds.d,'MM/DD'), 'value', coalesce(x.c,0)) order by ds.d), '[]'::jsonb) v
    from days_series ds
    left join (select created_at::date d, count(*) c from public.reports where created_at >= chart_from group by 1) x on x.d = ds.d
  ),
  chart_ai as (
    select coalesce(jsonb_agg(jsonb_build_object('label', to_char(ds.d,'MM/DD'), 'value', coalesce(x.c,0)) order by ds.d), '[]'::jsonb) v
    from days_series ds
    left join (select created_at::date d, count(*) c from public.ai_insights where created_at >= chart_from group by 1) x on x.d = ds.d
  )
  select jsonb_build_object(
    'kpi', (select v from kpi),
    'teamMaps', jsonb_build_object(
      'members',   (select v from team_members),
      'opinions',  (select v from team_opinions),
      'comments',  (select v from team_comments),
      'responses', (select v from team_responses),
      'aiRuns',    (select v from team_ai)
    ),
    'recent', (select v from recent),
    'charts', jsonb_build_object(
      'signups',   (select v from chart_signups),
      'opinions',  (select v from chart_opinions),
      'responses', (select v from chart_responses),
      'reports',   (select v from chart_reports),
      'aiRuns',    (select v from chart_ai)
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_dashboard_stats(integer) from public;
grant execute on function public.admin_dashboard_stats(integer) to authenticated;
