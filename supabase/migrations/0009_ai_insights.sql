-- ============================================================================
-- FANCLUV — 0009_ai_insights.sql  (AI 팬 인사이트 분석 결과 저장)
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================================

create table if not exists public.ai_insights (
  id                  uuid primary key default gen_random_uuid(),
  club_id             text not null default 'all',   -- 구단 id 또는 'all'(전체)
  period              text,                           -- 분석 주기 (예: 2026-W27)
  summary             text,                           -- 팬 만족도 요약 + 핵심 이슈
  sentiment_positive  integer not null default 0,     -- 긍정 %
  sentiment_neutral   integer not null default 0,     -- 중립 %
  sentiment_negative  integer not null default 0,     -- 부정 %
  keywords            jsonb not null default '[]'::jsonb,  -- [{tag, weight}]
  recommendations     jsonb not null default '[]'::jsonb,  -- [{rank, title, desc}]
  details             jsonb not null default '{}'::jsonb,  -- categorySat/topOpinions/categoryIssues/staffMemo/trend/counts
  created_at          timestamptz not null default now()
);
create index if not exists ai_insights_club_created_idx on public.ai_insights (club_id, created_at desc);

alter table public.ai_insights enable row level security;

-- 조회: 로그인 사용자 전체(팬 AI 인사이트 화면에서 표시).
-- 생성: Edge Function(analyze-insights)이 service_role 로 수행하므로 별도 insert 정책 불필요
--        (service_role 은 RLS 우회). 클라이언트 직접 쓰기는 허용하지 않는다.
drop policy if exists "ai_insights readable by authenticated" on public.ai_insights;
create policy "ai_insights readable by authenticated"
  on public.ai_insights for select using (auth.role() = 'authenticated');
