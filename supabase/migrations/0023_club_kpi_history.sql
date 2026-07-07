-- FANCLUV — 구단 KPI 주차별 히스토리 (Fan Insight KPI Engine).
--
-- 매주 계산된 핵심 KPI 를 저장해 (1) 지난주 대비 변화량 계산 (2) 향후 Club Action Tracker
-- 의 "조치 전 → 조치 후" 비교에 사용한다. (club_id, week) 단위로 upsert.
create table if not exists public.club_kpi_history (
  id                 bigint generated always as identity primary key,
  club_id            text not null,
  week               text not null,          -- ISO 주차 'YYYY-Www'
  satisfaction       integer,
  positive           integer,
  neutral            integer,
  negative           integer,
  nps                integer,
  complaint_index    integer,
  engagement         integer,
  participation_rate integer,
  recommendation     integer,
  categories         jsonb not null default '[]'::jsonb,  -- 12개 카테고리 점수 스냅샷
  sample_size        jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  unique (club_id, week)
);
create index if not exists club_kpi_history_club_idx on public.club_kpi_history (club_id, week desc);

alter table public.club_kpi_history enable row level security;

-- 읽기: 로그인 사용자(대시보드/리포트). 쓰기: 관리자(is_admin).
drop policy if exists "club_kpi_history read" on public.club_kpi_history;
create policy "club_kpi_history read" on public.club_kpi_history
  for select using (auth.role() = 'authenticated');
drop policy if exists "club_kpi_history admin write" on public.club_kpi_history;
create policy "club_kpi_history admin write" on public.club_kpi_history
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.club_kpi_history is 'KPI Engine 의 주차별 KPI 스냅샷(변화량/Club Action 전후 비교).';
