-- FANCLUV — 0077: 자동 뉴스 수집 Scheduler 운영 로그 + 중복실행 락
--
-- Vercel Cron(20분) → /api/cron/collect-news 오케스트레이터가 실행 단위(run)를 기록한다.
--   · 중복 실행 방지: partial UNIQUE(status='running') → 동시 2개 running INSERT 는 23505 로 탈락.
--   · 운영 지표: 성공/실패 소스 수, 기록 기사 수, 소요시간, 소스별 detail(jsonb).
-- 새 테이블 1개만 추가(기존 team_news/news_sources/news_ai_summary 무변경). 시크릿 미저장.
begin;

create table if not exists public.news_collection_runs (
  id                 uuid primary key default gen_random_uuid(),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  status             text not null default 'running'
                       check (status in ('running','success','partial','failed','timeout')),
  trigger            text not null default 'cron',        -- 'cron' | 'manual'
  successful_sources integer not null default 0,
  failed_sources     integer not null default 0,
  articles_written   integer not null default 0,
  duration_ms        integer,
  detail             jsonb not null default '[]'::jsonb    -- [{source, ok, written, ms, error}]
);

-- 중복 실행 락: 동시에 'running' 은 최대 1개(오케스트레이터가 시작 시 stale 정리 후 INSERT).
create unique index if not exists news_collection_runs_one_running
  on public.news_collection_runs ((true)) where status = 'running';
create index if not exists news_collection_runs_started_idx
  on public.news_collection_runs (started_at desc);

-- RLS: 관리자만 조회(오케스트레이터는 service_role 로 RLS 우회 기록).
alter table public.news_collection_runs enable row level security;
do $$ begin
  create policy news_collection_runs_admin_read on public.news_collection_runs
    for select using (public.is_admin());
exception when duplicate_object then null; end $$;

-- 관리자 대시보드용 상태 요약(최근 run + 소스 헬스). SECURITY DEFINER + is_admin 가드.
create or replace function public.news_collection_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last jsonb;
  v_sources jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select to_jsonb(r) into v_last
  from public.news_collection_runs r
  order by started_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'club_id', club_id,
           'last_success_at', last_success_at,
           'last_failure_at', last_failure_at,
           'consecutive_failures', consecutive_failures,
           'last_collected_count', last_collected_count,
           'last_error', last_error
         ) order by club_id), '[]'::jsonb)
  into v_sources
  from public.news_sources;

  return jsonb_build_object(
    'ok', true,
    'last_run', v_last,
    'sources', v_sources,
    'healthy', (select count(*) from public.news_sources where coalesce(consecutive_failures,0) = 0),
    'total', (select count(*) from public.news_sources)
  );
end $$;
grant execute on function public.news_collection_status() to authenticated;

commit;
