-- ============================================================================
-- FANCLUV — 0051_optimize_fan_score_base.sql  (P1 성능 수정)
--
-- 문제: fan_ranking() → fan_score_base() 가 `where coalesce(p.role,'user') = 'user'`
--   를 사용했다. profiles.role 은 NOT NULL(default 'user') 이므로 COALESCE 는
--   의미상 no-op 이지만, 함수 표현식이 플래너의 행수 추정을 무력화시켜
--   profiles 를 rows=1 로 오추정 → Nested Loop 를 선택하게 만들었다.
--   그 결과 내부 집계 서브쿼리(특히 survey_responses)가 profiles 행마다
--   반복 실행(loops=208)되어 buffer hit 1.56M, Execution ~2100ms 로 폭증했다.
--   (Staging seed: 1k users / 1k opinions / 20k likes / 10k responses 실측)
--
-- 수정: role 이 NOT NULL 이므로 COALESCE 제거 → `where p.role = 'user'`.
--   플래너가 정확히 추정(rows≈209) → Merge/Hash Join(집계 1회) 로 전환.
--   재측정: Execution ~34ms (약 60배 개선). 결과 집합은 동일(role NOT NULL 보장).
-- ============================================================================
create or replace function public.fan_score_base(p_team_id text)
returns table(user_id uuid, nickname text, avatar_url text, selected_team text,
  opinion_count bigint, comment_count bigint, survey_count bigint, received_like_count bigint,
  score bigint, activity_count bigint, last_activity_at timestamp with time zone)
language sql stable security definer set search_path to 'public' as $function$
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
    and (p_team_id is null or p.selected_team = p_team_id);
$function$;
