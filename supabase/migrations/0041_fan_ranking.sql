-- ============================================================================
-- FANCLUV — 0041_fan_ranking.sql
-- 팬 랭킹을 실제 활동 데이터로 집계. (기존 FanRankingPage 의 해시/하드코딩 Mock 대체)
--
-- 점수 정책(활동점수와 동일): 의견 +10 · 댓글 +3 · 설문 +5 · 받은 공감 +1
--   · 받은 공감 = 내 의견(visible)에 달린 likes 중 본인 공감 제외(user_id <> author_id)
--   · 삭제/숨김 의견·댓글 제외(status='visible'), 설문은 (survey_id,user_id) 유니크로 1회 집계
--   · 관리자/직원/구단 계정 제외(role='user' 만), 0점(무활동)은 랭킹에서 제외
--   · 동점: 점수 → 유효활동수 → 최근활동 → user_id 순 deterministic
--   개인정보(email/실명/전화/provider id 등)는 반환하지 않는다.
-- ============================================================================

-- 집계 성능 인덱스
create index if not exists opinions_author_idx on public.opinions (author_id);
create index if not exists comments_author_idx on public.comments (author_id);
create index if not exists survey_responses_user_idx on public.survey_responses (user_id);
create index if not exists profiles_selected_team_idx on public.profiles (selected_team);

-- 공통 집계 CTE 를 만드는 헬퍼 뷰(내부용, security_invoker 아님 — 함수에서만 사용).
-- 함수 두 개가 동일 정의를 공유하도록 별도 함수로 분리.
create or replace function public.fan_score_base(p_team_id text)
returns table (
  user_id uuid, nickname text, avatar_url text, selected_team text,
  opinion_count bigint, comment_count bigint, survey_count bigint, received_like_count bigint,
  score bigint, activity_count bigint, last_activity_at timestamptz
)
language sql stable security definer set search_path = public
as $$
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
  where coalesce(p.role, 'user') = 'user'
    and (p_team_id is null or p.selected_team = p_team_id);
$$;

-- ── 랭킹 목록(상위 N, 기본 50, 최대 100) ──
create or replace function public.fan_ranking(p_team_id text default null, p_limit int default 50)
returns table (
  user_id uuid, nickname text, avatar_url text, selected_team text,
  opinion_count bigint, comment_count bigint, survey_count bigint, received_like_count bigint,
  score bigint, rank bigint, last_activity_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with ranked as (
    select b.*,
      row_number() over (
        order by b.score desc, b.activity_count desc, b.last_activity_at desc nulls last, b.user_id
      ) as rnk
    from public.fan_score_base(p_team_id) b
    where b.score > 0
  )
  select user_id, nickname, avatar_url, selected_team,
    opinion_count, comment_count, survey_count, received_like_count,
    score, rnk, last_activity_at
  from ranked
  where rnk <= least(greatest(coalesce(p_limit, 50), 1), 100)
  order by rnk;
$$;

-- ── 내 순위/점수/활동 요약 ──
create or replace function public.fan_rank_for_user(p_user_id uuid, p_team_id text default null)
returns table (
  rank bigint, total bigint, score bigint,
  opinion_count bigint, comment_count bigint, survey_count bigint, received_like_count bigint,
  last_activity_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with ranked as (
    select b.*,
      row_number() over (
        order by b.score desc, b.activity_count desc, b.last_activity_at desc nulls last, b.user_id
      ) as rnk
    from public.fan_score_base(p_team_id) b
    where b.score > 0
  ),
  me as (
    -- 내 원점수(랭킹 진입 여부와 무관하게 항상 계산)
    select * from public.fan_score_base(p_team_id) where user_id = p_user_id
  )
  select
    (select rnk from ranked where user_id = p_user_id),        -- 0점이면 NULL
    (select count(*) from ranked),                              -- 랭킹 대상 총원
    coalesce((select score from me), 0),
    coalesce((select opinion_count from me), 0),
    coalesce((select comment_count from me), 0),
    coalesce((select survey_count from me), 0),
    coalesce((select received_like_count from me), 0),
    (select last_activity_at from me);
$$;

revoke all on function public.fan_score_base(text) from public, anon;
revoke all on function public.fan_ranking(text, int) from public;
revoke all on function public.fan_rank_for_user(uuid, text) from public;
grant execute on function public.fan_ranking(text, int) to authenticated;
grant execute on function public.fan_rank_for_user(uuid, text) to authenticated;
-- fan_score_base 는 내부 헬퍼 → 직접 실행 권한 부여 안 함(정의자 권한으로 상위 함수에서만 호출).
