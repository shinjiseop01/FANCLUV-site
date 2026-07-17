-- ════════════════════════════════════════════════════════════════════════
-- FANCLUV — 0065_email_code_verified_confirm.sql
-- ════════════════════════════════════════════════════════════════════════
-- 목적: 회원가입 이메일 인증 UX 안정화(중복 확인 제거).
--
-- 문제: staging 은 Supabase Auth 의 "Confirm email"(mailer_autoconfirm=false)이
--   켜져 있어, 앱의 커스텀 인증번호(send-email-code)로 이미 이메일을 인증했는데도
--   supabase.auth.signUp 이 세션을 발급하지 않아 프론트가 "메일을 확인하세요"를
--   다시 표시한다(이중 인증). → 사용자는 코드 인증을 했는데 다시 메일 링크를 눌러야 함.
--
-- 해결: 커스텀 인증번호를 "이메일 소유 증명"으로 삼아, 코드 검증 성공 사실을
--   email_codes.verified_at 에 남긴다. 회원가입(signUp) 직후 send-email-code
--   'confirm' 액션이 이 표식(최근 검증됨)을 확인하고 service_role 로 해당 auth
--   사용자의 이메일을 서버측 확정(email_confirm)한다. → signUp 재확인 메일 불필요.
--
-- 보안: mailer_autoconfirm 을 전역으로 켜지 않는다(직접 signUp API 우회로 임의
--   이메일 자동확정되는 구멍 방지). confirm 은 반드시 "최근 코드 검증됨(verified_at)"
--   레코드가 있는 이메일에 대해서만, 그 이메일을 소유한 userId 에 한해 동작한다.
--
-- ⚠️ email_codes 는 RLS 만 켜져 있고 정책이 없어 anon/authenticated 직접 접근이
--    차단된다(0010). 오직 Edge Function 의 service_role 만 접근한다. 컬럼 추가로
--    이 격리는 변하지 않는다.

alter table public.email_codes
  add column if not exists verified_at timestamptz;

comment on column public.email_codes.verified_at is
  '커스텀 인증번호 검증에 성공한 시각. send-email-code confirm 액션이 이 값(최근)을 '
  '확인해 회원가입 직후 auth 사용자 이메일을 서버측 확정한다. NULL = 미검증.';
