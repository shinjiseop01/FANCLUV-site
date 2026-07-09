-- ============================================================================
-- FANCLUV — 0034_client_role_schema_grants.sql
-- anon/authenticated 에 public 스키마 테이블 권한 부여(누락 보정).
--
-- 배경: 이 프로젝트는 일부 테이블에 anon/authenticated 테이블 GRANT 가 누락돼,
--   RLS 정책이 통과되는데도 그 이전 단계인 테이블 GRANT 에서 거부됐다.
--   예: 로그인 사용자의 공감(likes) insert 가
--   "permission denied for table likes (42501)" 로 실패(공감이 저장 안 됨).
--   opinions insert 는 되는데 likes insert 는 안 되는 등 grant 가 불균일했다.
--
-- 조치: Supabase 기본값과 동일하게 anon/authenticated 에 public 스키마의 모든
--   테이블/시퀀스 권한을 부여한다. 실제 행 접근은 각 테이블의 RLS 정책이 계속
--   통제하므로(테이블 GRANT 는 RLS 를 우회하지 않는다) 보안 경계는 그대로 유지된다.
--   이후 생성물에도 자동 적용되도록 default privileges 도 설정한다.
-- ============================================================================

grant usage on schema public to anon, authenticated;
grant all privileges on all tables    in schema public to anon, authenticated;
grant all privileges on all sequences in schema public to anon, authenticated;

alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
