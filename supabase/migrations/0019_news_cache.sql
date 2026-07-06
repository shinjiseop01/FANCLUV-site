-- FANCLUV — 팀 뉴스 캐시 (news-fetcher Edge Function 전용).
--
-- news-fetcher Edge Function 이 구단별로 수집한 외부 뉴스(RSS/공식 홈페이지)를 10분간
-- 캐시한다. 쓰기/읽기는 Edge Function(service_role)만 한다 → RLS 활성 + 공개 정책 없음
-- (service_role 은 RLS 를 우회하므로 함수에서만 접근 가능, 일반 클라이언트는 접근 불가).

create table if not exists public.news_cache (
  club_id    text primary key,
  items      jsonb not null default '[]'::jsonb,   -- 표준 뉴스 배열
  source     text,                                  -- 'rss' | 'official'
  fetched_at timestamptz not null default now()
);

alter table public.news_cache enable row level security;
-- 공개 정책 없음 → anon/authenticated 는 접근 불가. Edge Function(service_role)만 사용.

comment on table public.news_cache is 'news-fetcher Edge Function 의 구단별 외부 뉴스 캐시(10분 TTL). service_role 전용.';
