-- ════════════════════════════════════════════════════════════════════════
-- FANCLUV — 0067_email_codes_drop_plaintext_notnull.sql
-- ════════════════════════════════════════════════════════════════════════
-- 목적: 평문 OTP 저장 완전 제거의 마무리.
--
-- 0010 에서 email_codes.code 는 `text not null` 로 정의됐다. 0066 에서 OTP 를
-- code_hash(HMAC)로만 저장하도록 바꿨으나, code 컬럼의 NOT NULL 제약이 남아
-- send-email-code Edge 가 code=NULL 로 upsert 할 때 23502(not-null violation)로
-- 실패한다 → 인증번호가 저장되지 않아 검증이 not_found 로 실패.
--
-- 이 마이그레이션은 code 의 NOT NULL 을 제거해 code 를 항상 NULL 로 둘 수 있게 한다.
-- (평문 OTP 는 앞으로도 절대 저장하지 않는다. code_hash 만 사용.)

alter table public.email_codes alter column code drop not null;
