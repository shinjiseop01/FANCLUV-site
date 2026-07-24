-- FANCLUV — 0087: Admin Dashboard 운영 Analytics 에서 테스트 계정 제외(is_test_account = SoT).
--
-- 목적: admin_dashboard_stats 의 "사용자 행동/서비스 이용 지표"에서 profiles.is_test_account=true 계정과
--   그 계정이 만든 데이터(의견/댓글/설문응답/신고/가입설문)를 제외한다. B2B Club KPI(_club_kpi_raw 등)와
--   동일한 판정 원칙(is_test_account) 으로 통일. Raw 데이터는 삭제하지 않는다(집계 시 제외만).
-- 원칙(변경 금지 반영):
--   · 테스트 판정 SoT = profiles.is_test_account. 이메일/닉네임/UUID/role 로 판정하지 않음.
--   · 시스템/운영 지표(ai_insights=AI 시스템 산출)는 필터하지 않음(의미 유지).
--   · NOT EXISTS 사용 → FK NULL/orphan(삭제된 사용자) 데이터는 보존(INNER JOIN 으로 정상 데이터 유실 방지, §6).
--     즉 "테스트 계정으로 확실히 귀속되는" 행만 제외. partial index profiles_is_test_idx 활용.
--   · KPI 계산 의미/권한(is_admin gate)/SECURITY DEFINER/search_path 불변. UI·다른 RPC·RLS 무변경. additive.
begin;

create or replace function public.admin_dashboard_stats(days integer DEFAULT 30)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
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

  -- 활성 회원: 최근 로그인 auth.users 중 테스트 계정 제외.
  begin
    select count(*) into active_members
      from auth.users u
     where u.last_sign_in_at >= since
       and not exists (select 1 from public.profiles p where p.id = u.id and p.is_test_account);
  exception when others then
    active_members := 0;
  end;

  with
  kpi as (
    select jsonb_build_object(
      'totalMembers',       (select count(*) from public.profiles where is_test_account is not true),
      'activeMembers',      active_members,
      'totalOpinions',      (select count(*) from public.opinions o where not exists (select 1 from public.profiles p where p.id = o.author_id and p.is_test_account)),
      'totalComments',      (select count(*) from public.comments c where not exists (select 1 from public.profiles p where p.id = c.author_id and p.is_test_account)),
      'totalSurveys',       (select count(*) from public.surveys s where not exists (select 1 from public.profiles p where p.id = s.created_by and p.is_test_account)),
      'totalResponses',     (select count(*) from public.survey_responses r where not exists (select 1 from public.profiles p where p.id = r.user_id and p.is_test_account)),
      'totalReports',       (select count(*) from public.reports rep where not exists (select 1 from public.profiles p where p.id = rep.reporter_id and p.is_test_account)),
      'aiRuns',             (select count(*) from public.ai_insights),
      'signupsToday',       (select count(*) from public.profiles where created_at >= today and is_test_account is not true),
      'newMembersThisWeek', (select count(*) from public.profiles where created_at >= week_start and is_test_account is not true)
    ) v
  ),
  team_members as (
    select coalesce(jsonb_object_agg(selected_team, c), '{}'::jsonb) v
    from (select selected_team, count(*) c from public.profiles
          where selected_team is not null and is_test_account is not true group by selected_team) t
  ),
  team_opinions as (
    select coalesce(jsonb_object_agg(team_id, c), '{}'::jsonb) v
    from (select team_id, count(*) c from public.opinions o
          where not exists (select 1 from public.profiles p where p.id = o.author_id and p.is_test_account)
          group by team_id) t
  ),
  team_comments as (
    select coalesce(jsonb_object_agg(team_id, c), '{}'::jsonb) v
    from (select o.team_id, count(*) c
          from public.comments cm join public.opinions o on o.id = cm.opinion_id
          where not exists (select 1 from public.profiles p where p.id = cm.author_id and p.is_test_account)
          group by o.team_id) t
  ),
  team_responses as (
    select coalesce(jsonb_object_agg(team_id, c), '{}'::jsonb) v
    from (select team_id, count(*) c from public.survey_responses r
          where team_id is not null
            and not exists (select 1 from public.profiles p where p.id = r.user_id and p.is_test_account)
          group by team_id) t
  ),
  team_ai as (
    select coalesce(jsonb_object_agg(club_id, c), '{}'::jsonb) v
    from (select club_id, count(*) c from public.ai_insights group by club_id) t
  ),
  recent_union as (
    (select jsonb_build_object('type','signup','title',p.nickname,'team',p.selected_team,'actor',null,'at',p.created_at) r, p.created_at r_at
       from public.profiles p where p.is_test_account is not true order by p.created_at desc limit 8)
    union all
    (select jsonb_build_object('type','opinion','title',left(o.body,40),'team',o.team_id,'actor',pr.nickname,'at',o.created_at), o.created_at
       from public.opinions o left join public.profiles pr on pr.id = o.author_id
       where not exists (select 1 from public.profiles p where p.id = o.author_id and p.is_test_account)
       order by o.created_at desc limit 8)
    union all
    (select jsonb_build_object('type','comment','title',left(c.content,40),'team',null,'actor',pr.nickname,'at',c.created_at), c.created_at
       from public.comments c left join public.profiles pr on pr.id = c.author_id
       where not exists (select 1 from public.profiles p where p.id = c.author_id and p.is_test_account)
       order by c.created_at desc limit 8)
    union all
    (select jsonb_build_object('type','survey','title',s.title,'team',s.team_id,'actor',null,'at',s.created_at), s.created_at
       from public.surveys s
       where not exists (select 1 from public.profiles p where p.id = s.created_by and p.is_test_account)
       order by s.created_at desc limit 8)
    union all
    (select jsonb_build_object('type','response','title',s.title,'team',rp.team_id,'actor',pr.nickname,'at',rp.created_at), rp.created_at
       from public.survey_responses rp
       left join public.surveys s on s.id = rp.survey_id
       left join public.profiles pr on pr.id = rp.user_id
       where not exists (select 1 from public.profiles p where p.id = rp.user_id and p.is_test_account)
       order by rp.created_at desc limit 8)
    union all
    (select jsonb_build_object('type','report','title',left(coalesce(rep.target_excerpt, rep.reason),40),'team',null,'actor',rep.reason,'at',rep.created_at), rep.created_at
       from public.reports rep
       where not exists (select 1 from public.profiles p where p.id = rep.reporter_id and p.is_test_account)
       order by rep.created_at desc limit 8)
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
    left join (select created_at::date d, count(*) c from public.profiles where created_at >= chart_from and is_test_account is not true group by 1) x on x.d = ds.d
  ),
  chart_opinions as (
    select coalesce(jsonb_agg(jsonb_build_object('label', to_char(ds.d,'MM/DD'), 'value', coalesce(x.c,0)) order by ds.d), '[]'::jsonb) v
    from days_series ds
    left join (select o.created_at::date d, count(*) c from public.opinions o
               where o.created_at >= chart_from
                 and not exists (select 1 from public.profiles p where p.id = o.author_id and p.is_test_account)
               group by 1) x on x.d = ds.d
  ),
  chart_responses as (
    select coalesce(jsonb_agg(jsonb_build_object('label', to_char(ds.d,'MM/DD'), 'value', coalesce(x.c,0)) order by ds.d), '[]'::jsonb) v
    from days_series ds
    left join (select r.created_at::date d, count(*) c from public.survey_responses r
               where r.created_at >= chart_from
                 and not exists (select 1 from public.profiles p where p.id = r.user_id and p.is_test_account)
               group by 1) x on x.d = ds.d
  ),
  chart_reports as (
    select coalesce(jsonb_agg(jsonb_build_object('label', to_char(ds.d,'MM/DD'), 'value', coalesce(x.c,0)) order by ds.d), '[]'::jsonb) v
    from days_series ds
    left join (select rep.created_at::date d, count(*) c from public.reports rep
               where rep.created_at >= chart_from
                 and not exists (select 1 from public.profiles p where p.id = rep.reporter_id and p.is_test_account)
               group by 1) x on x.d = ds.d
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
$function$;

commit;
