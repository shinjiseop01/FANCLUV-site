-- ============================================================================
-- FANCLUV — 0002_data_tables.sql  (다음 단계 준비: Opinions / Surveys)
--
-- ⚠️ 이번(1차) 이관에서는 앱이 아직 이 테이블을 사용하지 않습니다.
--    팬 의견/설문 화면은 계속 Mock/localStorage 로 동작합니다.
--    스키마를 미리 만들어 두어 다음 단계(데이터 완전 이관)에서 바로 연결할 수 있게 합니다.
--    지금 실행해도 무방하고, 다음 단계에 실행해도 됩니다.
-- ============================================================================

-- ── 팬 의견 (Opinions) ──
create table if not exists public.opinions (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users (id) on delete cascade,
  team_id     text not null,                 -- 구단 id
  category    text,                          -- 경기운영 / 팬서비스 / 시설 ...
  content     text not null,
  likes       integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.opinions enable row level security;

drop policy if exists "opinions are readable by authenticated" on public.opinions;
create policy "opinions are readable by authenticated"
  on public.opinions for select using (auth.role() = 'authenticated');

drop policy if exists "users insert own opinions" on public.opinions;
create policy "users insert own opinions"
  on public.opinions for insert with check (auth.uid() = author_id);

drop policy if exists "users modify own opinions" on public.opinions;
create policy "users modify own opinions"
  on public.opinions for update using (auth.uid() = author_id);

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
