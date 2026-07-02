-- ============================================================================
-- FANCLUV — 0010_account_hardening.sql
--   (1) 회원탈퇴(비활성화) 컬럼
--   (2) 이메일 인증번호 저장 테이블 (send-email-code Edge Function 전용)
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================================

-- (1) 탈퇴 시각 — 값이 있으면 로그인 차단(auth.loadCurrentSupabaseUser 에서 확인)
alter table public.profiles
  add column if not exists deactivated_at timestamptz;

-- (2) 이메일 인증번호 (회원가입 전 이메일 확인). Edge Function(service_role)만 접근.
create table if not exists public.email_codes (
  email      text primary key,
  code       text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.email_codes enable row level security;
-- 정책을 만들지 않음 → 클라이언트(anon/authenticated) 직접 접근 차단.
--   Edge Function 의 service_role 키만 RLS 를 우회해 읽고 쓴다.
