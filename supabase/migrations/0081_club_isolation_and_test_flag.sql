-- FANCLUV — 0081: Club 서버측 테넌트 격리 + 테스트 계정 분석 제외.
--
-- 목적(직전 P1 2건 제거):
--   1) 테스트 계정이 B2B 분석/KPI 를 오염 → profiles.is_test_account 로 식별 + 중앙 집계에서 제외.
--   2) Club Account 의 타 구단 데이터 차단을 UI/route 가 아닌 DB(RLS)+RPC 에서 강제.
--
-- 발견된 취약점(수정 대상):
--   · ai_insights / club_kpi_history SELECT = auth.role()='authenticated' → 모든 구단 교차 열람(P0).
--   · opinions SELECT = true → 모든 구단 원본 의견 교차 열람.
--   · club_home_stats(p_team_id) SECURITY DEFINER 에 테넌트 검사 없음 → 임의 team_id 로 타 구단 집계.
--   · Executive 벤치마크가 클라이언트에서 전 구단 KPI 를 읽어 계산(교차 열람 유발).
--
-- 원칙: additive/idempotent. 기존 원본 데이터 삭제 없음(QA 재현 가능). Admin 은 전 구단 유지.
begin;

-- ══════════════════════════════════════════════════════════════════════════
-- 1) 테스트 계정 식별 필드 (metadata 전용 — 권한/RBAC 에는 절대 사용하지 않는다)
-- ══════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists is_test_account boolean not null default false;

-- 표준 QA 계정(@fancluv.com 15개) + 명시적 legacy 테스트 계정만 지정.
-- (도메인만으로 무차별 지정하지 않는다. 실제 QA 목적 계정만.)
update public.profiles set is_test_account = true
where email in (
  'fan-test@fancluv.com','admin@fancluv.com','superadmin@fancluv.com',
  'seoul-club@fancluv.com','ulsan-club@fancluv.com','jeonbuk-club@fancluv.com',
  'pohang-club@fancluv.com','daejeon-club@fancluv.com','gwangju-club@fancluv.com',
  'gangwon-club@fancluv.com','gimcheon-club@fancluv.com','jeju-club@fancluv.com',
  'anyang-club@fancluv.com','incheon-club@fancluv.com','bucheon-club@fancluv.com',
  -- legacy QA(용도 확인된 테스트 계정만)
  'fan-test@example.com','admin-test@example.com','superadmin-test@example.com',
  'club-test@example.com','test_p20news_jb@example.com','test_tc_target@example.com'
);

-- 분석 조인 성능(테스트 제외 필터)용 부분 인덱스.
create index if not exists profiles_is_test_idx on public.profiles (is_test_account) where is_test_account;

-- ══════════════════════════════════════════════════════════════════════════
-- 2) 테넌트 판정 헬퍼 — 호출자의 배정 구단(source of truth = profiles.selected_team)
--    이메일 문자열 파싱 금지. auth.uid()→profiles 로만 결정.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.current_user_team()
returns text language sql stable security definer set search_path=public as $$
  select selected_team from public.profiles where id = auth.uid()
$$;
grant execute on function public.current_user_team() to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 3) RLS 테넌트 격리 — 민감 B2B 테이블 SELECT 를 '자기 구단 OR 관리자' 로 제한
--    (Admin=is_admin() 전체 / Fan·Club=current_user_team() 자기 구단만)
-- ══════════════════════════════════════════════════════════════════════════
-- ai_insights (club_id): 교차 열람 차단. Fan 은 자기 팀 인사이트만(URL 조작 방어 포함).
drop policy if exists "ai_insights readable by authenticated" on public.ai_insights;
drop policy if exists "ai_insights tenant read" on public.ai_insights;
create policy "ai_insights tenant read" on public.ai_insights
  for select using (public.is_admin() or club_id = public.current_user_team());

-- club_kpi_history (club_id)
drop policy if exists "club_kpi_history read" on public.club_kpi_history;
drop policy if exists "club_kpi_history tenant read" on public.club_kpi_history;
create policy "club_kpi_history tenant read" on public.club_kpi_history
  for select using (public.is_admin() or club_id = public.current_user_team());

-- opinions (team_id): 원본 팬 의견 교차 열람 차단. Fan/Club 은 자기 팀만.
--   (기존 fan 커뮤니티 동작 유지: 팬은 항상 자기 팀 페이지에서만 조회.)
drop policy if exists "opinions readable by authenticated" on public.opinions;
drop policy if exists "opinions tenant read" on public.opinions;
create policy "opinions tenant read" on public.opinions
  for select to authenticated using (public.is_admin() or team_id = public.current_user_team());

-- club_reports (team_id): Club 은 자기 구단 리포트만 직접 조회 가능(admin ALL 유지).
drop policy if exists "club_reports tenant read" on public.club_reports;
create policy "club_reports tenant read" on public.club_reports
  for select using (public.is_admin() or team_id = public.current_user_team());

-- report_deliveries (team_id): 자기 구단 전달 리포트만.
drop policy if exists "report_deliveries tenant read" on public.report_deliveries;
create policy "report_deliveries tenant read" on public.report_deliveries
  for select using (public.is_admin() or team_id = public.current_user_team());

-- ══════════════════════════════════════════════════════════════════════════
-- 4) club_home_stats 하드닝 — 비관리자는 p_team_id 무시하고 자기 구단 강제 + 테스트 제외
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.club_home_stats(p_team_id text)
returns jsonb language sql stable security definer set search_path=public as $$
  with t as (
    -- 클라이언트가 보낸 team_id 는 관리자만 신뢰. 그 외에는 서버가 배정 구단으로 강제.
    select case when public.is_admin() then p_team_id else public.current_user_team() end as team
  )
  select jsonb_build_object(
    'fans', (
      select count(*) from public.profiles p, t
       where p.selected_team = t.team and coalesce(p.role,'user')='user' and not p.is_test_account
    ),
    'opinions', (
      select count(*) from public.opinions o
        join public.profiles pa on pa.id = o.author_id, t
       where o.team_id = t.team and o.status='visible' and not pa.is_test_account
    ),
    'comments', (
      select count(*) from public.comments c
        join public.opinions o on o.id = c.opinion_id
        join public.profiles pa on pa.id = c.author_id, t
       where o.team_id = t.team and o.status='visible' and c.status='visible' and not pa.is_test_account
    ),
    'likes', (
      select count(*) from public.likes l
        join public.opinions o on o.id = l.opinion_id
        join public.profiles pu on pu.id = l.user_id, t
       where o.team_id = t.team and o.status='visible' and not pu.is_test_account
    ),
    'satisfaction', (
      select coalesce(round(avg(o.rating)*20)::int, 0) from public.opinions o
        join public.profiles pa on pa.id = o.author_id, t
       where o.team_id = t.team and o.status='visible' and o.rating is not null and not pa.is_test_account
    )
  );
$$;
grant execute on function public.club_home_stats(text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 5) 서버측 B2B KPI 집계 (테스트 제외) — computeKpis 를 SQL 로 이관.
--    _club_kpi_raw: 인증검사 없는 내부 계산기(SECURITY DEFINER, RLS 우회).
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public._club_kpi_raw(p_team text)
returns table(
  satisfaction int, nps int, complaint_index int, engagement int, participation int,
  s_pos int, s_neu int, s_neg int, n_opinions int, n_rated int
) language sql stable security definer set search_path=public as $$
  with op as (  -- 자기 팀 · 노출 · 비테스트 의견
    select o.* from public.opinions o
      join public.profiles pa on pa.id = o.author_id
     where o.team_id = p_team and o.status='visible' and not pa.is_test_account
  ),
  rated as (select rating from op where rating is not null),
  agg as (
    select
      count(*)::int as n_op,
      (select count(*) from rated)::int as n_rated,
      coalesce(round(avg(r.rating)*20)::int,0) as sat,
      -- 감정 분포(별점 기반)
      (select count(*) from rated where rating>=4)::int as pos,
      (select count(*) from rated where rating=3)::int  as neu,
      (select count(*) from rated where rating<=2)::int  as neg,
      (select count(*) from rated where rating>=5)::int as prom,
      (select count(*) from rated where rating<=3)::int as det,
      -- 불만 키워드 밀도
      (select count(*) from op where lower(coalesce(title,'')||' '||coalesce(body,''))
         ~ '불편|불만|최악|실망|문제|개선|느리|비싸|별로|엉망|화나|짜증|항의')::int as complaint_hits,
      -- 상호작용(공감 + 댓글×2) — 비테스트 사용자만
      (select count(*) from public.likes l join public.opinions o2 on o2.id=l.opinion_id
         join public.profiles pu on pu.id=l.user_id
        where o2.team_id=p_team and o2.status='visible' and not pu.is_test_account)::int as likes_n,
      (select count(*) from public.comments c join public.opinions o3 on o3.id=c.opinion_id
         join public.profiles pc on pc.id=c.author_id
        where o3.team_id=p_team and o3.status='visible' and c.status='visible' and not pc.is_test_account)::int as comments_n,
      -- 참여율: (비테스트 설문응답) / (참여 팬 + 응답)
      (select count(*) from public.survey_responses sr join public.profiles ps on ps.id=sr.user_id
        where sr.team_id=p_team and not ps.is_test_account)::int as resp_n,
      (select count(distinct author_id) from op)::int as engaged_fans
    from rated r
  )
  select
    a.sat,
    case when a.n_rated>0 then round( (a.prom::numeric*100/a.n_rated) - (a.det::numeric*100/a.n_rated) )::int else 0 end,
    case when a.n_rated>0 then
      least(100, greatest(0, round(
        (a.neg::numeric*100/a.n_rated)*0.65 +
        (case when a.n_op>0 then a.complaint_hits::numeric*100/a.n_op else 0 end)*0.35 )::int))
      else 0 end,
    case when a.n_op>0 then least(100, greatest(0, round((a.likes_n + a.comments_n*2)::numeric / a.n_op)::int)) else 0 end,
    least(100, greatest(0, round( a.resp_n::numeric*100 / greatest(1, a.engaged_fans + a.resp_n) )::int)),
    case when a.n_rated>0 then round(a.pos::numeric*100/a.n_rated)::int else 0 end,
    case when a.n_rated>0 then round(a.neu::numeric*100/a.n_rated)::int else 0 end,
    case when a.n_rated>0 then round(a.neg::numeric*100/a.n_rated)::int else 0 end,
    a.n_op, a.n_rated
  from agg a;
$$;

-- club_kpi(p_team): 인증 게이트(Admin 전체 / Club·Fan 자기 팀) + jsonb 반환.
create or replace function public.club_kpi(p_team text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare k record;
begin
  if not (public.is_admin() or public.current_user_team() = p_team) then
    return jsonb_build_object('ok', false, 'code','NOT_ALLOWED');
  end if;
  select * into k from public._club_kpi_raw(p_team);
  return jsonb_build_object(
    'ok', true, 'clubId', p_team,
    'satisfaction', k.satisfaction, 'nps', k.nps, 'complaintIndex', k.complaint_index,
    'engagement', k.engagement, 'participationRate', k.participation,
    'sentiment', jsonb_build_object('positive', k.s_pos, 'neutral', k.s_neu, 'negative', k.s_neg),
    'sampleSize', jsonb_build_object('opinions', k.n_opinions, 'rated', k.n_rated),
    'change', '{}'::jsonb, 'categories', '[]'::jsonb
  );
end $$;
grant execute on function public.club_kpi(text) to authenticated;

-- club_league_benchmark(p_team): 자기 팀 vs 리그 평균(집계만 — 개별 타 구단 수치 미노출).
create or replace function public.club_league_benchmark(p_team text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare own record; lg record;
begin
  if not (public.is_admin() or public.current_user_team() = p_team) then
    return jsonb_build_object('ok', false, 'code','NOT_ALLOWED');
  end if;
  select * into own from public._club_kpi_raw(p_team);
  -- 리그 평균 = 데이터가 있는 각 구단 KPI 의 평균(구단별 값은 반환하지 않음).
  select
    round(avg(satisfaction))::int satisfaction, round(avg(nps))::int nps,
    round(avg(complaint_index))::int complaint_index, round(avg(engagement))::int engagement,
    round(avg(participation))::int participation
  into lg
  from (
    select (r).* from (
      select public._club_kpi_raw(t.team) r
      from (select distinct selected_team team from public.profiles
             where selected_team is not null and role in ('club','club_admin')) t
    ) x
  ) y
  where (y).n_opinions > 0;
  return jsonb_build_object('ok', true, 'metrics', jsonb_build_array(
    jsonb_build_object('key','satisfaction','own',own.satisfaction,'league',coalesce(lg.satisfaction,0),'delta',own.satisfaction-coalesce(lg.satisfaction,0),'invert',false),
    jsonb_build_object('key','nps','own',own.nps,'league',coalesce(lg.nps,0),'delta',own.nps-coalesce(lg.nps,0),'invert',false),
    jsonb_build_object('key','complaintIndex','own',own.complaint_index,'league',coalesce(lg.complaint_index,0),'delta',own.complaint_index-coalesce(lg.complaint_index,0),'invert',true),
    jsonb_build_object('key','engagement','own',own.engagement,'league',coalesce(lg.engagement,0),'delta',own.engagement-coalesce(lg.engagement,0),'invert',false),
    jsonb_build_object('key','participationRate','own',own.participation,'league',coalesce(lg.participation,0),'delta',own.participation-coalesce(lg.participation,0),'invert',false)
  ));
end $$;
grant execute on function public.club_league_benchmark(text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 6) Admin 회원 목록에 is_test_account 노출(운영자만 — 배지/필터용). 권한 판정과 무관.
-- ══════════════════════════════════════════════════════════════════════════
drop function if exists public.admin_list_members();
create function public.admin_list_members()
returns table(id uuid, nickname text, email text, joined_at timestamptz, team text, status text,
  role text, verification_status text, identity_verified boolean, provider text, gender text,
  age_group text, last_active_at timestamptz, is_test_account boolean)
language sql stable security definer set search_path=public as $$
  select p.id, p.nickname, p.email, p.created_at, p.selected_team,
    case when p.deactivated_at is not null then 'inactive' else 'active' end,
    p.role::text, p.verification_status::text, coalesce(p.identity_verified,false),
    p.provider, p.gender, p.age_group, p.updated_at, coalesce(p.is_test_account,false)
  from public.profiles p
  where public.is_admin()
  order by p.created_at desc
  limit 1000
$$;
grant execute on function public.admin_list_members() to authenticated;

commit;
