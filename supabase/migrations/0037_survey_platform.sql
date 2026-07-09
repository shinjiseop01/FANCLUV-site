-- ============================================================================
-- FANCLUV — 0037_survey_platform.sql
-- 설문 시스템 전면 재설계 (Google Forms / Microsoft Forms 수준)
--
-- 설계 원칙
--   · Question / Option / Response 를 명확히 분리한 확장형 스키마.
--   · surveys(설문 봉투) → survey_questions(질문, 정규화) → survey_answers(응답 값, 정규화)
--   · 선택지(Option)는 질문 행의 options jsonb 로 원자적으로 보관(질문 유형과 강결합).
--   · 동일한 Question 모델을 향후 Quick Poll / AI 설문 생성이 그대로 재사용한다.
--   · 상태(Draft → Published → Closed)와 응답 존재 시 질문 비활성화(active=false)를 지원.
--   · 중복 테이블을 만들지 않고 기존 surveys / survey_responses 를 확장·재사용한다.
-- ============================================================================

-- ── 1) surveys 확장 ─────────────────────────────────────────────────────────
-- 상태 체계: 'open' → 'published' 로 이관하고 draft/published/closed 로 표준화.
alter table public.surveys add column if not exists is_public   boolean     not null default true;
alter table public.surveys add column if not exists updated_at   timestamptz not null default now();
alter table public.surveys add column if not exists published_at timestamptz;
alter table public.surveys add column if not exists closed_at    timestamptz;

update public.surveys set status = 'published' where status = 'open';
update public.surveys set status = 'closed'    where status not in ('draft', 'published', 'closed');

alter table public.surveys drop constraint if exists surveys_status_chk;
alter table public.surveys
  add constraint surveys_status_chk check (status in ('draft', 'published', 'closed'));

-- ── 2) survey_questions (질문, 정규화) ──────────────────────────────────────
-- type: single | multi | dropdown | rating | nps | yesno | short | long
--   · options : 선택지 배열 [{ id, label }]  (single/multi/dropdown 에서 사용)
--   · config  : 유형별 설정 { max, ... }      (rating.max 등, 유형 추가에 대비한 자유 슬롯)
--   · active  : Published 이후 응답이 생긴 질문은 삭제 대신 false 로 비활성화
create table if not exists public.survey_questions (
  id          uuid primary key default gen_random_uuid(),
  survey_id   uuid not null references public.surveys (id) on delete cascade,
  position    int  not null default 0,
  type        text not null default 'single',
  title       text not null default '',
  help_text   text not null default '',
  required    boolean not null default false,
  allow_other boolean not null default false,
  options     jsonb   not null default '[]'::jsonb,
  config      jsonb   not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists survey_questions_survey_idx
  on public.survey_questions (survey_id, position);
alter table public.survey_questions enable row level security;

-- 조회: 게시된 설문의 질문은 누구나(로그인) / 관리자는 전체(draft 포함). 작성·수정·삭제: 관리자.
drop policy if exists "read questions of visible surveys" on public.survey_questions;
create policy "read questions of visible surveys"
  on public.survey_questions for select
  using (
    public.is_admin()
    or exists (select 1 from public.surveys s
                where s.id = survey_id and s.status = 'published')
  );
drop policy if exists "admins write questions" on public.survey_questions;
create policy "admins write questions"
  on public.survey_questions for all
  using (public.is_admin()) with check (public.is_admin());

-- ── 3) survey_answers (응답 값, 정규화) ─────────────────────────────────────
-- 한 응답(survey_responses) × 한 질문(survey_questions) 당 하나의 값.
--   value(jsonb): 문자열 | 숫자 | 문자열 배열(다중선택) | { other } 등 유형별 자유 형태.
create table if not exists public.survey_answers (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.survey_responses (id) on delete cascade,
  question_id uuid not null references public.survey_questions (id) on delete cascade,
  value       jsonb not null default 'null'::jsonb,
  created_at  timestamptz not null default now(),
  unique (response_id, question_id)
);
create index if not exists survey_answers_response_idx on public.survey_answers (response_id);
create index if not exists survey_answers_question_idx on public.survey_answers (question_id);
alter table public.survey_answers enable row level security;

-- 조회: 본인 응답 또는 관리자(집계용). 작성: 본인 응답에 대해서만.
drop policy if exists "read own or admin answers" on public.survey_answers;
create policy "read own or admin answers"
  on public.survey_answers for select
  using (
    public.is_admin()
    or exists (select 1 from public.survey_responses r
                where r.id = response_id and r.user_id = auth.uid())
  );
drop policy if exists "insert own answers" on public.survey_answers;
create policy "insert own answers"
  on public.survey_answers for insert
  with check (
    exists (select 1 from public.survey_responses r
             where r.id = response_id and r.user_id = auth.uid())
  );

-- ── 4) surveys_view 재작성 ──────────────────────────────────────────────────
-- 질문 수 + 응답 수 + 현재 사용자 참여 여부를 한 번에.
drop view if exists public.surveys_view;
create view public.surveys_view
with (security_invoker = true) as
select
  s.*,
  (select count(*) from public.survey_questions q where q.survey_id = s.id and q.active) as question_count,
  (select count(*) from public.survey_responses r where r.survey_id = s.id)              as response_count,
  exists (
    select 1 from public.survey_responses r
     where r.survey_id = s.id and r.user_id = auth.uid()
  ) as has_responded
from public.surveys s;

-- ── 5) 권한(GRANT) ─────────────────────────────────────────────────────────
-- (프로젝트 관행: RLS 와 별개로 스키마 GRANT 가 빠지면 42501 이 발생한다.)
grant usage on schema public to anon, authenticated;
grant select on public.surveys, public.surveys_view, public.survey_questions to anon, authenticated;
grant select, insert, update, delete on public.surveys, public.survey_questions to authenticated;
grant select, insert on public.survey_responses, public.survey_answers to authenticated;
grant all on public.surveys, public.survey_questions, public.survey_answers,
             public.survey_responses to service_role;

-- ── 6) 기존 설문 자동 마이그레이션 ─────────────────────────────────────────
-- 질문 행이 아직 없는 기존 설문은 legacy questions jsonb([{q}]) 를 단답형 질문으로 변환.
-- (질문 정보가 없으면 제목을 질문으로 사용) — 기존 서비스가 깨지지 않도록 보존.
insert into public.survey_questions (survey_id, position, type, title, required)
select s.id, 0, 'short',
       coalesce(nullif(s.questions->0->>'q', ''), s.title, '의견을 남겨 주세요'), false
from public.surveys s
where not exists (select 1 from public.survey_questions q where q.survey_id = s.id);
