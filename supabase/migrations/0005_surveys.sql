-- ============================================================================
-- FANCLUV — 0005_surveys.sql  (설문 / 설문 응답 이관)
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- (0002_data_tables.sql 의 설문 초안을 대체·정리한 최종 스키마입니다.)
-- ============================================================================

-- ── 관리자 판정 헬퍼 (RLS 재귀 방지용 SECURITY DEFINER) ──
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ── 설문 ──
create table if not exists public.surveys (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  team_id     text,                                -- 대상 구단 id (null = 전체 구단)
  status      text not null default 'open',        -- 'open' | 'closed'
  start_date  date,
  end_date    date,
  questions   jsonb not null default '[]'::jsonb,   -- 질문 데이터
  created_by  uuid references auth.users (id) on delete set null,  -- 생성자
  created_at  timestamptz not null default now()
);
create index if not exists surveys_team_idx on public.surveys (team_id, created_at desc);
alter table public.surveys enable row level security;

-- 조회: 로그인 사용자 전체 / 생성·수정·삭제: 관리자만
drop policy if exists "surveys readable by authenticated" on public.surveys;
create policy "surveys readable by authenticated"
  on public.surveys for select using (auth.role() = 'authenticated');
drop policy if exists "admins insert surveys" on public.surveys;
create policy "admins insert surveys"
  on public.surveys for insert with check (public.is_admin());
drop policy if exists "admins update surveys" on public.surveys;
create policy "admins update surveys"
  on public.surveys for update using (public.is_admin());
drop policy if exists "admins delete surveys" on public.surveys;
create policy "admins delete surveys"
  on public.surveys for delete using (public.is_admin());

-- ── 설문 응답 ── 한 사용자당 한 설문에 1회만 (unique).
create table if not exists public.survey_responses (
  id            uuid primary key default gen_random_uuid(),
  survey_id     uuid not null references public.surveys (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  team_id       text,                              -- 응답자 응원팀
  answers       jsonb not null default '{}'::jsonb, -- 응답 내용
  created_at    timestamptz not null default now(),  -- 제출일
  unique (survey_id, user_id)
);
create index if not exists survey_responses_survey_idx on public.survey_responses (survey_id);
alter table public.survey_responses enable row level security;

-- 본인 응답만 조회/작성 (관리자는 전체 조회 가능 — 집계용). 응답은 수정 불가.
drop policy if exists "read own or admin responses" on public.survey_responses;
create policy "read own or admin responses"
  on public.survey_responses for select
  using (auth.uid() = user_id or public.is_admin());
drop policy if exists "insert own response" on public.survey_responses;
create policy "insert own response"
  on public.survey_responses for insert
  with check (auth.uid() = user_id);

-- ── 집계 뷰 ── 응답 수 + 현재 사용자 참여 여부를 한 번에.
create or replace view public.surveys_view
with (security_invoker = true) as
select
  s.*,
  (select count(*) from public.survey_responses r where r.survey_id = s.id) as response_count,
  exists (
    select 1 from public.survey_responses r
     where r.survey_id = s.id and r.user_id = auth.uid()
  ) as has_responded
from public.surveys s;
