-- ============================================================================
-- FANCLUV — 0008_profiles_email_index.sql
--   소셜 로그인 콜백(naver-callback Edge Function)이 profiles.email 로 기존
--   사용자를 조회할 때 전체 스캔 대신 인덱스를 사용하도록 email 인덱스를 추가.
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================================

-- Supabase 는 이메일을 소문자로 저장하므로 email 컬럼 B-tree 인덱스로 충분하다.
-- (Edge Function 은 .eq('email', <lowercased>) 로 조회)
create index if not exists profiles_email_idx on public.profiles (email);
