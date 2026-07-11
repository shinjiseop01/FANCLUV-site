-- ============================================================================
-- FANCLUV — 0042_news_ai_summary.sql
-- 뉴스 카드 "AI 뉴스 요약" 결과 캐시. 같은 뉴스는 OpenAI 를 재호출하지 않고 즉시 표시.
--   cache_key = 프론트가 계산한 안정 키(team_id + sourceUrl/title 해시).
--   요약은 Edge Function summarize-news(service_role) 만 기록한다.
-- ============================================================================

create table if not exists public.news_ai_summary (
  cache_key   text primary key,
  team_id     text,
  title       text,
  one_liner   text,                                  -- 한 줄 요약
  bullets     jsonb   not null default '[]'::jsonb,  -- 핵심 내용 3~5개
  fan_point   text,                                  -- 팬이 알아야 할 포인트
  model       text,                                  -- 'gpt-4o-mini' | 'extractive'
  helpful     int not null default 0,
  unhelpful   int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.news_ai_summary enable row level security;

-- 조회: 로그인 사용자 누구나(캐시 공유). 쓰기: service_role(Edge Function)만.
drop policy if exists "read news summary" on public.news_ai_summary;
create policy "read news summary" on public.news_ai_summary
  for select using (auth.role() = 'authenticated');

grant select on public.news_ai_summary to anon, authenticated;
grant all on public.news_ai_summary to service_role;

-- 피드백(도움됨/개선필요) 카운터 증가 — 로그인 사용자가 호출.
create or replace function public.news_summary_feedback(p_cache_key text, p_helpful boolean)
returns void
language sql security definer set search_path = public
as $$
  update public.news_ai_summary
     set helpful   = helpful   + (case when p_helpful then 1 else 0 end),
         unhelpful = unhelpful + (case when p_helpful then 0 else 1 end),
         updated_at = now()
   where cache_key = p_cache_key;
$$;
revoke all on function public.news_summary_feedback(text, boolean) from public, anon;
grant execute on function public.news_summary_feedback(text, boolean) to authenticated;
