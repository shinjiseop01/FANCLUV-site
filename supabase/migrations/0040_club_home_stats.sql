-- ============================================================================
-- FANCLUV — 0040_club_home_stats.sql
-- 팬 홈 상단 통계(팀별 팬 수 / 의견 / 댓글 / 공감 / 만족도)를 실제 데이터로 계산.
--   기존 프론트 clubStats(id) 는 팀 id 해시로 만든 "가짜 숫자"였다 → 제거하고 이 RPC 로 대체.
--   집계 숫자만 반환(개인정보 없음). SECURITY DEFINER 로 RLS 우회하되 팀 단위 합계만 노출.
-- ============================================================================

create or replace function public.club_home_stats(p_team_id text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'fans', (
      select count(*) from public.profiles p
       where p.selected_team = p_team_id and coalesce(p.role, 'user') = 'user'
    ),
    'opinions', (
      select count(*) from public.opinions o
       where o.team_id = p_team_id and o.status = 'visible'
    ),
    'comments', (
      select count(*) from public.comments c
        join public.opinions o on o.id = c.opinion_id
       where o.team_id = p_team_id and o.status = 'visible' and c.status = 'visible'
    ),
    'likes', (
      select count(*) from public.likes l
        join public.opinions o on o.id = l.opinion_id
       where o.team_id = p_team_id and o.status = 'visible'
    ),
    -- 만족도(%) = 의견 별점(1~5) 평균 × 20. 별점이 하나도 없으면 0(가짜 값 금지).
    'satisfaction', (
      select coalesce(round(avg(o.rating) * 20)::int, 0) from public.opinions o
       where o.team_id = p_team_id and o.status = 'visible' and o.rating is not null
    )
  );
$$;

revoke all on function public.club_home_stats(text) from public;
grant execute on function public.club_home_stats(text) to anon, authenticated;
