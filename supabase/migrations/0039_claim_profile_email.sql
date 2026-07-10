-- ============================================================================
-- FANCLUV — 0039_claim_profile_email.sql
-- 이메일 미제공 소셜 계정(비즈 앱 전 Kakao 등)이 나중에 이메일을 등록할 때,
-- 중복 확인 + 본인 profiles.email 갱신을 원자적으로 처리하는 RPC.
--
-- 프론트에서는 이메일 소유 검증(인증번호)을 마친 뒤 이 함수를 호출한다.
-- RLS 상 다른 사용자의 profiles 를 읽지 못하므로, 중복 확인은 이 SECURITY DEFINER
-- 함수 안에서 수행한다(다른 사용자 데이터 노출 없이 boolean 결과만 반환).
-- ============================================================================

-- 부분 유니크 인덱스: 서로 다른 계정이 같은 이메일을 갖지 못하게 DB 레벨에서 보장.
-- (email 이 NULL 인 소셜 계정은 제약 대상이 아님 → 다수 NULL 허용)
create unique index if not exists profiles_email_unique
  on public.profiles (lower(email)) where email is not null;

create or replace function public.claim_profile_email(p_email text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_taken boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  -- 다른 계정이 이미 사용 중인 이메일인지(대소문자 무시).
  select exists (
    select 1 from public.profiles
     where lower(email) = v_email and id <> v_uid
  ) into v_taken;
  if v_taken then
    return jsonb_build_object('ok', false, 'code', 'duplicate');
  end if;

  -- 본인 프로필에 이메일 등록 + 인증 상태 반영(코드 검증을 프론트에서 마친 상태).
  update public.profiles
     set email = v_email,
         is_email_verified = true,
         verification_status = case
           when verification_status = 'unverified' then 'email_verified'::verification_status
           else verification_status end,
         updated_at = now()
   where id = v_uid;

  return jsonb_build_object('ok', true, 'email', v_email);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate');
end;
$$;

revoke all on function public.claim_profile_email(text) from public, anon;
grant execute on function public.claim_profile_email(text) to authenticated;
