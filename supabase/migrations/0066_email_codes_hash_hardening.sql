-- ════════════════════════════════════════════════════════════════════════
-- FANCLUV — 0066_email_codes_hash_hardening.sql
-- ════════════════════════════════════════════════════════════════════════
-- 목적: 이메일 인증번호(OTP) 보안 강화 — 평문 OTP 저장 제거.
--
-- 변경 전(0010/0065): email_codes.code 에 6자리 OTP 를 **평문**으로 저장했다.
-- 변경 후: OTP 는 서버(send-email-code Edge)에서 HMAC-SHA256 으로 해시해
--   code_hash 에만 저장한다. 검증은 입력값을 동일 HMAC 으로 해시해 비교한다.
--   → DB 유출 시에도 OTP 원문 복원 불가. 평문 OTP 는 어디에도 남기지 않는다.
--
-- 추가 컬럼(요청 스펙):
--   code_hash     : OTP 의 HMAC-SHA256 hex (평문 code 대체)
--   attempt_count : 검증 실패 시도 횟수(무차별 대입 방지 — 초과 시 잠금)
--   resend_count  : 재전송 횟수(발송 남용 관측)
--   consumed_at   : 검증 완료(1회용 소진) 시각
--   request_id    : 발송 요청 추적 id(로그 상관관계 — Secret/PII 아님)
--
-- ⚠️ email_codes 는 RLS 만 켜져 있고 정책이 없어 anon/authenticated 직접 접근이
--    차단된다(0010). 오직 Edge Function 의 service_role 만 접근한다.

alter table public.email_codes
  add column if not exists code_hash     text,
  add column if not exists attempt_count integer     not null default 0,
  add column if not exists resend_count  integer     not null default 0,
  add column if not exists consumed_at   timestamptz,
  add column if not exists request_id    text;

-- 기존 평문 code 컬럼은 더 이상 사용하지 않는다(신규 발송은 code_hash 만 기록).
-- 남아있을 수 있는 평문 잔재를 즉시 제거하고, 컬럼은 하위호환을 위해 nullable 유지.
update public.email_codes set code = null where code is not null;

comment on column public.email_codes.code is
  '[DEPRECATED] 과거 평문 OTP 컬럼 — 더 이상 기록하지 않음(항상 NULL). code_hash 사용.';
comment on column public.email_codes.code_hash is
  'OTP 의 HMAC-SHA256 hex. send-email-code Edge 만 기록/검증. 평문 OTP 는 저장하지 않음.';
comment on column public.email_codes.attempt_count is 'OTP 검증 실패 누적 횟수(초과 시 잠금).';
comment on column public.email_codes.consumed_at is 'OTP 1회용 소진(검증 완료) 시각 — 재사용 차단.';
