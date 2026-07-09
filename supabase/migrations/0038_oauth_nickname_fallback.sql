-- ============================================================================
-- FANCLUV — 0038_oauth_nickname_fallback.sql
-- 소셜 로그인(특히 이메일 미제공 Kakao) 계정도 프로필이 안전하게 생성되도록,
-- handle_new_user() 트리거의 nickname 계산에 "절대 NULL 이 되지 않는" 최종
-- fallback 을 추가한다. (profiles.nickname 은 NOT NULL 이므로 NULL 이면 가입 실패)
--
-- 배경: 비즈 앱 전환 전 Kakao 는 account_email 을 요청하지 않아 email 이 NULL 이고,
--       닉네임 동의만 있을 수 있다. email 이 NULL 이면 split_part(email,'@',1) 도 NULL 이라
--       기존 coalesce 체인이 전부 비면 nickname 이 NULL → INSERT 실패했다.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  app_meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  prov     text  := coalesce(app_meta ->> 'provider', meta ->> 'provider', 'email');
begin
  insert into public.profiles (
    id, email, nickname, avatar_url, provider, provider_user_id,
    gender, age_group, is_email_verified, verification_status
  ) values (
    new.id,
    new.email,                                              -- NULL 허용(이메일 미제공 소셜)
    coalesce(
      nullif(meta ->> 'nickname', ''),
      nullif(meta ->> 'name', ''),
      nullif(meta ->> 'full_name', ''),
      nullif(meta ->> 'preferred_username', ''),
      nullif(meta ->> 'user_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      -- 위가 모두 비면 provider 별 기본 닉네임(절대 NULL 아님)
      case prov
        when 'kakao'  then '카카오사용자'
        when 'naver'  then '네이버사용자'
        when 'google' then '구글사용자'
        else 'FANCLUV 사용자'
      end
    ),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture'),    -- 프로필 이미지(선택)
    prov,
    coalesce(meta ->> 'provider_id', meta ->> 'sub', meta ->> 'id'),
    meta ->> 'gender',
    meta ->> 'age_group',
    new.email_confirmed_at is not null,
    case when new.email_confirmed_at is not null
         then 'email_verified'::verification_status
         else 'unverified'::verification_status end
  )
  on conflict (id) do nothing;   -- id(auth.users.id) 기준 중복 프로필 생성 방지
  return new;
end;
$$;
