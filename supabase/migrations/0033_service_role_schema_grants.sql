-- ============================================================================
-- FANCLUV — 0033_service_role_schema_grants.sql
-- service_role 에 public 스키마 전체 접근 권한 부여 (Edge Function 백엔드 접근 보장).
--
-- 배경: 이 프로젝트에서 마이그레이션으로 생성된 테이블들이 service_role 에 테이블
--   GRANT 를 부여받지 못한 상태였다(예: email_codes/profiles 접근이
--   "permission denied for table ... (42501)" 로 거부). service_role 은 RLS 를
--   우회하지만, 그 이전 단계인 테이블 GRANT 가 없으면 접근 자체가 거부된다.
--   → send-email-code(email_codes), 그리고 service_role 을 쓰는 다른 Edge Function
--   (delete-account/analyze-insights/health-check 등)이 모두 실패할 수 있다.
--
-- 조치: service_role(서버 전용, 클라이언트 미노출)에 public 스키마의 모든 테이블/
--   시퀀스/함수 권한을 부여하고, 이후 생성물에도 자동 적용되도록 default privileges
--   를 설정한다. anon/authenticated 권한과 RLS 정책은 변경하지 않는다.
-- ============================================================================

grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines  in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines  to service_role;
