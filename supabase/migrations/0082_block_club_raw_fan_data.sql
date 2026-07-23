-- FANCLUV — 0082: Club(고객) 계정의 원본 팬 데이터 직접 접근 차단.
--
-- 배경: 0081 로 '타 구단' 교차 열람은 완전 차단됐으나, Club 계정이 '자기 구단'의
--   opinions 원본 row 는 PostgREST 로 직접 SELECT 가능한 상태였다. FANCLUV B2B 정책상
--   구단에는 집계 KPI / AI Insight / Trend / Report / Benchmark(sanitize된 분석)만 제공하고
--   개별 팬 원본(의견·댓글·공감)은 Admin 운영 영역에서만 관리한다.
--   · Club Executive Dashboard 는 이미 서버 집계 RPC(club_kpi/club_league_benchmark, 0081)만
--     사용하므로 원본 SELECT 의존성이 없다 → RLS 강화로 회귀 없음.
--   · comments/likes 도 authenticated 전체 열람이라 Club 이 원본 팬 데이터를 읽을 수 있어 함께 차단.
--
-- 권한 결과:
--   Fan(user)                 → 자기 팀 원본(기존 사용자 기능) 유지
--   Admin/Superadmin/Staff    → 운영상 전체 접근 유지(is_admin())
--   Club/Club Admin           → 원본 opinions/comments/likes SELECT 금지
--   Service Role              → 기존 서버 운영 권한 유지(RLS 우회)
-- additive/idempotent. destructive 없음.
begin;

-- 호출자가 구단(고객) 계정인지 — 원본 데이터 차단 판정 전용(권한 상승엔 미사용).
create or replace function public.is_club_account()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles
     where id = auth.uid() and role in ('club','club_admin')
  )
$$;
grant execute on function public.is_club_account() to authenticated;

-- opinions: Admin 전체 / Fan 자기팀 / Club 차단.
drop policy if exists "opinions tenant read" on public.opinions;
create policy "opinions tenant read" on public.opinions
  for select to authenticated
  using (public.is_admin() or (team_id = public.current_user_team() and not public.is_club_account()));

-- comments: 원본 팬 댓글 — Club 차단(Fan/anon/Admin 기존 열람 유지).
drop policy if exists "comments readable by authenticated" on public.comments;
drop policy if exists "comments no club raw" on public.comments;
create policy "comments no club raw" on public.comments
  for select using (public.is_admin() or not public.is_club_account());

-- likes: 팬 공감 원본 — Club 차단.
drop policy if exists "likes readable by authenticated" on public.likes;
drop policy if exists "likes no club raw" on public.likes;
create policy "likes no club raw" on public.likes
  for select using (public.is_admin() or not public.is_club_account());

commit;
