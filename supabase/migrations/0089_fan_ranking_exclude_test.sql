-- 0089_fan_ranking_exclude_test.sql
-- 팬 랭킹(fan_score_base)에서 테스트 계정(is_test_account) 제외.
-- 근거: is_test_account = single source of truth. Admin Dashboard / Club KPI / Home Stats /
--       League Benchmark 는 이미 테스트 계정을 제외하지만 fan_score_base(→ fan_ranking,
--       fan_rank_for_user)만 예외였다. 활동 점수가 있는 테스트 계정이 팬 랭킹에 노출되는 것을 방지.
-- Additive: 기존 함수 본문을 그대로 유지하고 WHERE 절에 테스트 계정 제외 조건만 추가(CREATE OR REPLACE).
-- Raw 데이터는 보존하며 집계(랭킹)에서만 제외한다.

create or replace function public.fan_score_base(p_team_id text)
returns table(user_id uuid, nickname text, avatar_url text, selected_team text,
  opinion_count bigint, comment_count bigint, survey_count bigint, received_like_count bigint,
  score bigint, activity_count bigint, last_activity_at timestamp with time zone)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    p.id, p.nickname, p.avatar_url, p.selected_team,
    coalesce(o.cnt, 0), coalesce(c.cnt, 0), coalesce(s.cnt, 0), coalesce(rl.cnt, 0),
    (coalesce(o.cnt,0)*10 + coalesce(c.cnt,0)*3 + coalesce(s.cnt,0)*5 + coalesce(rl.cnt,0)*1),
    (coalesce(o.cnt,0) + coalesce(c.cnt,0) + coalesce(s.cnt,0)),
    nullif(greatest(coalesce(o.last,'epoch'::timestamptz), coalesce(c.last,'epoch'::timestamptz),
                    coalesce(s.last,'epoch'::timestamptz), coalesce(rl.last,'epoch'::timestamptz)), 'epoch'::timestamptz)
  from public.profiles p
  left join (
    select author_id, count(*) cnt, max(created_at) last
      from public.opinions where status = 'visible' group by author_id
  ) o on o.author_id = p.id
  left join (
    select cm.author_id, count(*) cnt, max(cm.created_at) last
      from public.comments cm join public.opinions op on op.id = cm.opinion_id
     where cm.status = 'visible' and op.status = 'visible' group by cm.author_id
  ) c on c.author_id = p.id
  left join (
    select user_id, count(distinct survey_id) cnt, max(created_at) last
      from public.survey_responses group by user_id
  ) s on s.user_id = p.id
  left join (
    select op.author_id, count(*) cnt, max(l.created_at) last
      from public.likes l join public.opinions op on op.id = l.opinion_id
     where op.status = 'visible' and l.user_id <> op.author_id group by op.author_id
  ) rl on rl.author_id = p.id
  where p.role = 'user'
    and not coalesce(p.is_test_account, false)   -- 0089: 테스트 계정 제외(Analytics 정합성)
    and (p_team_id is null or p.selected_team = p_team_id);
$function$;
