-- FANCLUV — 이메일 사용가능 확인 RPC(익명 호출, 프로필 미노출) — 0074
--
-- 문제(P0-3): 회원가입 이메일 중복 사전검사가 profiles 를 직접 SELECT 하는데 profiles RLS
-- (own row only)라 anon 이 타인 이메일을 못 봐 항상 "사용 가능"으로 오판 → 이미 가입된 이메일
-- (이메일/구글 OAuth 포함)에도 OTP 발송·가입이 진행됨. (OAuth 사용자도 handle_new_user 트리거로
-- profiles 행이 생성되므로 email_normalized 로 탐지 가능.)
--
-- 해결: SECURITY DEFINER 로 email_normalized(0072 정규화) 존재 여부만 boolean 반환.
-- 스키마 변경 없음. anon/authenticated grant.
begin;

create or replace function public.email_available(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles
     where email_normalized = public.normalize_identity_text(p_email)
       and email_normalized is not null
  )
$$;

comment on function public.email_available(text) is
  '이메일 사용가능 여부(정규화 기준). true=사용가능(미가입). 프로필 미노출. 익명 호출 허용.';

revoke all on function public.email_available(text) from public;
grant execute on function public.email_available(text) to anon, authenticated, service_role;

commit;
