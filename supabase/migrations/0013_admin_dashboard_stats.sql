-- 0013_admin_dashboard_stats.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 관리자 대시보드 실시간 집계 RPC.
--
-- KPI · 구단별 통계 · 최근 활동 · 차트(일별 추이) 를 한 번의 호출로 jsonb 로 반환한다.
-- 클라이언트(src/lib/admin/adminStats.js)는 이 RPC 하나만 호출하면 되고, 집계 로직은
-- 전부 DB 쪽에 모여 있어 데이터가 늘어나도 유지보수가 쉽다.
--
-- 접근 권한: SECURITY DEFINER + public.is_admin() 가드.
--   → 관리자가 아닌 사용자가 직접 rpc 를 호출해도 예외(forbidden)로 차단된다.
--   → grant 는 authenticated 에만(anon 제외).
-- ─────────────────────────────────────────────────────────────────────────

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
  week_start    date        := date_trunc('week', now())::date;   -- 이번 주 시작(월요일)
  chart_from    date        := current_date - 6;                  -- 최근 7일 차트 시작일
  active_members integer     := 0;
begin
  -- 권한 검사: 관리자만 실행 가능 (기존 Admin 권한 구조 재사용)
  if not public.is_admin() then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;

  -- 활성 회원(최근 :days 일 로그인). auth.users 접근이 막혀 있으면 0 으로 폴백.
  begin
    select count(*) into active_members
      from auth.users
     where last_sign_in_at >= since;
  exception when others then
    active_members := 0;
  end;

  with
  -- ── 1) KPI ──
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

  -- ── 2) 구단별 통계 (team_id -> count 맵. 클라이언트가 TEAMS 순서로 매핑) ──
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
    -- comments 에는 team_id 가 없어 opinions 로 조인해서 구단을 얻는다.
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

  -- ── 3) 최근 활동 (여러 테이블 통합 → 시간순 desc, 상위 12) ──
  recent_union as (
    select jsonb_build_object('type','signup','title',p.nickname,'team',p.selected_team,'actor',null,'at',p.created_at) r, p.created_at r_at
      from public.profiles p order by p.created_at desc limit 8
    union all
    select jsonb_build_object('type','opinion','title',left(o.content,40),'team',o.team_id,'actor',pr.nickname,'at',o.created_at), o.created_at
      from public.opinions o left join public.profiles pr on pr.id = o.author_id order by o.created_at desc limit 8
    union all
    select jsonb_build_object('type','comment','title',left(c.content,40),'team',null,'actor',pr.nickname,'at',c.created_at), c.created_at
      from public.comments c left join public.profiles pr on pr.id = c.author_id order by c.created_at desc limit 8
    union all
    select jsonb_build_object('type','survey','title',s.title,'team',s.team_id,'actor',null,'at',s.created_at), s.created_at
      from public.surveys s order by s.created_at desc limit 8
    union all
    select jsonb_build_object('type','response','title',s.title,'team',rp.team_id,'actor',pr.nickname,'at',rp.created_at), rp.created_at
      from public.survey_responses rp
      left join public.surveys s on s.id = rp.survey_id
      left join public.profiles pr on pr.id = rp.user_id
      order by rp.created_at desc limit 8
    union all
    select jsonb_build_object('type','report','title',left(coalesce(rep.target_excerpt, rep.reason),40),'team',null,'actor',rep.reason,'at',rep.created_at), rep.created_at
      from public.reports rep order by rep.created_at desc limit 8
    union all
    select jsonb_build_object('type','ai','title',ai.club_id,'team',(case when ai.club_id = 'all' then null else ai.club_id end),'actor',null,'at',ai.created_at), ai.created_at
      from public.ai_insights ai order by ai.created_at desc limit 8
  ),
  recent as (
    select coalesce(jsonb_agg(r order by r_at desc), '[]'::jsonb) v
    from (select r, r_at from recent_union order by r_at desc limit 12) z
  ),

  -- ── 4) 차트 (최근 7일 일별 추이) ──
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

-- 인증된 사용자에게만 실행 권한 부여(내부에서 is_admin() 재검사). anon 제외.
revoke all on function public.admin_dashboard_stats(integer) from public;
grant execute on function public.admin_dashboard_stats(integer) to authenticated;
