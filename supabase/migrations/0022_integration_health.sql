-- FANCLUV — 통합(외부 서비스) 상태 + 시스템 로그.
--
-- 관리자 시스템 상태 대시보드(AdminSystemStatus)가 서비스별 최근 상태/응답시간과
-- 최근 오류 로그를 저장·조회한다. 관리자만 접근.

-- 서비스별 최신 상태 스냅샷
create table if not exists public.integration_health (
  service              text primary key,   -- 'db' | 'auth' | 'edge' | 'teamNews' | 'league' | 'openai' | 'email' | 'push'
  status               text not null default 'unknown',  -- ok | slow | error | disabled
  last_success_at      timestamptz,
  last_failure_at      timestamptz,
  response_ms          integer,
  consecutive_failures integer not null default 0,
  alerted_at           timestamptz,
  updated_at           timestamptz not null default now()
);

-- 시스템 오류 로그(최근 100개 조회)
create table if not exists public.integration_logs (
  id         bigint generated always as identity primary key,
  service    text not null,
  status     text not null,       -- error | slow | ok
  message    text,
  response_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists integration_logs_created_idx on public.integration_logs (created_at desc);

alter table public.integration_health enable row level security;
alter table public.integration_logs enable row level security;

drop policy if exists "integration_health admin" on public.integration_health;
create policy "integration_health admin" on public.integration_health
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "integration_logs admin" on public.integration_logs;
create policy "integration_logs admin" on public.integration_logs
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.integration_health is '외부 서비스별 최신 상태(관리자 시스템 상태 대시보드). 관리자 전용.';
comment on table public.integration_logs is '시스템 오류 로그(최근 100개). 관리자 전용.';
