-- FANCLUV — K리그 데이터 캐시 (league-fetcher Edge Function 전용).
--
-- league-fetcher Edge Function 이 외부 리그 API 에서 가져온 순위/경기 데이터를 캐시한다.
--   cache_key: 'standings' | 'fixtures:<teamId>' | 'fixtures:all'
--   TTL 은 함수에서 관리(순위 5분 / 경기 5분). 실패 시 stale 데이터로 폴백.
-- 쓰기/읽기는 Edge Function(service_role)만 한다 → RLS 활성 + 공개 정책 없음.

create table if not exists public.league_cache (
  cache_key  text primary key,          -- 'standings' | 'fixtures:<teamId>'
  data       jsonb not null default '{}'::jsonb,   -- { standings?: [...] } | { fixtures?: [...] }
  fetched_at timestamptz not null default now()
);

alter table public.league_cache enable row level security;
-- 공개 정책 없음 → anon/authenticated 접근 불가. Edge Function(service_role)만 사용.

comment on table public.league_cache is 'league-fetcher Edge Function 의 리그 데이터 캐시(순위 5분/경기 5분 TTL). service_role 전용.';
