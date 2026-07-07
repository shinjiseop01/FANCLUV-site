-- FANCLUV — 구단 액션(조치) 관리 (Club Action Management).
--
-- 팬 목소리 → AI 분석 → 구단이 실제 조치(Action)를 취하고, 조치 전후 KPI 변화를 검증하는
-- FANCLUV 핵심 루프의 "조치" 저장소. Action 생성 시점 KPI(before_kpi)를 자동 스냅샷하고,
-- 완료 후 after_kpi 를 기록해 Club Action Tracker 에서 전후 비교한다.
create table if not exists public.club_actions (
  id             bigint generated always as identity primary key,
  club_id        text not null,
  title          text not null,
  description    text,
  category       text not null default 'etc',    -- match/ticket/md/store/stadium/event/marketing/fanservice/squad/etc
  status         text not null default 'planned', -- planned | in_progress | done | closed
  action_date    date,
  before_kpi     jsonb,                           -- 생성 시점 KPI 스냅샷
  after_kpi      jsonb,                           -- 완료 후 KPI 스냅샷(현재는 비워둘 수 있음)
  ai_insight_id  text,                            -- 관련 AI 인사이트
  report_id      text,                            -- 관련 리포트
  week           text,                            -- 관련 Weekly Summary(KPI 주차)
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists club_actions_club_idx on public.club_actions (club_id, action_date desc);
create index if not exists club_actions_status_idx on public.club_actions (status);

alter table public.club_actions enable row level security;

-- 관리자 전용(운영자가 등록/관리).
drop policy if exists "club_actions admin" on public.club_actions;
create policy "club_actions admin" on public.club_actions
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.club_actions is '구단 조치(Action) + 전후 KPI 스냅샷(Club Action Tracker 기반). 관리자 전용.';
