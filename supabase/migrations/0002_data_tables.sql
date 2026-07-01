-- ============================================================================
-- FANCLUV — 0002_data_tables.sql  (다음 단계 준비: Surveys)
--
-- ⚠️ 팬 의견/댓글/공감은 0004_opinions_comments_likes.sql 에서 최종 정의합니다.
--    이 파일에는 "설문(Surveys)" 만 남아 있으며, 다음 단계(설문 이관)용 준비입니다.
--    앱은 아직 설문을 Mock 으로 동작합니다. 지금 실행해도 무방합니다.
-- ============================================================================

-- ── 설문 (Surveys) ──
create table if not exists public.surveys (
  id          uuid primary key default gen_random_uuid(),
  team_id     text not null,
  title       text not null,
  description text,
  status      text not null default 'open',  -- 'open' | 'closed'
  closed_at   timestamptz,                    -- 종료일 (종료 후 7일 자동 숨김 로직과 연동 예정)
  created_at  timestamptz not null default now()
);
alter table public.surveys enable row level security;

drop policy if exists "surveys are readable by authenticated" on public.surveys;
create policy "surveys are readable by authenticated"
  on public.surveys for select using (auth.role() = 'authenticated');

-- 설문 응답 (다음 단계에서 확장)
create table if not exists public.survey_responses (
  id           uuid primary key default gen_random_uuid(),
  survey_id    uuid not null references public.surveys (id) on delete cascade,
  respondent_id uuid not null references auth.users (id) on delete cascade,
  answers      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (survey_id, respondent_id)           -- 1인 1응답
);
alter table public.survey_responses enable row level security;

drop policy if exists "users insert own responses" on public.survey_responses;
create policy "users insert own responses"
  on public.survey_responses for insert with check (auth.uid() = respondent_id);

drop policy if exists "users read own responses" on public.survey_responses;
create policy "users read own responses"
  on public.survey_responses for select using (auth.uid() = respondent_id);
