-- ============================================================================
-- FANCLUV — 0032_email_codes_service_role_grant.sql
-- email_codes 저장 권한 보정(회원가입 인증번호 발송 store_failed 수정).
--
-- 증상: send-email-code Edge Function 이 인증코드를 email_codes 에 upsert 할 때
--   "permission denied for table email_codes" (42501) 로 실패 → store_failed.
--
-- 원인: email_codes(0010)는 RLS 만 켜고 어떤 role 에도 GRANT 를 부여하지 않았다.
--   RLS 는 service_role 이 우회하지만, 테이블 레벨 GRANT(INSERT/UPDATE/SELECT/DELETE)
--   가 없으면 그 이전 단계에서 거부된다. Edge Function 은 service_role 로 접근하므로
--   service_role 에게만 권한을 명시적으로 부여한다(anon/authenticated 는 계속 차단 —
--   클라이언트 직접 접근 금지 유지, 오직 함수의 service_role 만 접근).
-- ============================================================================

grant select, insert, update, delete on table public.email_codes to service_role;
