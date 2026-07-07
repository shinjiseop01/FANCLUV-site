-- FANCLUV — 구단별 뉴스 소스 관리 + 수집 상태.
--
-- 관리자가 코드 수정 없이 각 구단의 공식 홈페이지/뉴스 URL(복수)/RSS/사용여부를 관리하고,
-- news-fetcher Edge Function 이 수집 성공/실패를 기록한다(자동 실패 감지 → 관리자 알림).
--
-- 읽기: 로그인 사용자(팬 뉴스 화면이 유효 소스/사용여부를 참조).
-- 쓰기: 관리자(is_admin). 상태 기록(수집 성공/실패)은 Edge Function(service_role)이 수행.

create table if not exists public.news_sources (
  club_id           text primary key,
  official_website  text,
  sources           jsonb not null default '[]'::jsonb,  -- [{ label, url }] 복수 뉴스 URL
  rss_url           text,
  enabled           boolean not null default true,
  -- 수집 상태
  last_success_at   timestamptz,
  last_failure_at   timestamptz,
  failure_count     integer not null default 0,
  -- 연결 테스트 결과
  last_test_at      timestamptz,
  last_test_ok      boolean,
  last_test_count   integer,
  last_error        text,
  alerted_at        timestamptz,     -- 실패 임계 알림 발송 시각(중복 알림 방지)
  updated_at        timestamptz not null default now()
);

alter table public.news_sources enable row level security;

drop policy if exists "news_sources readable by authenticated" on public.news_sources;
create policy "news_sources readable by authenticated"
  on public.news_sources for select using (auth.role() = 'authenticated');

drop policy if exists "news_sources admin write" on public.news_sources;
create policy "news_sources admin write"
  on public.news_sources for all using (public.is_admin()) with check (public.is_admin());

comment on table public.news_sources is '구단별 뉴스 소스 설정 + 수집 상태. 읽기=로그인, 쓰기=관리자, 상태기록=service_role(Edge).';
