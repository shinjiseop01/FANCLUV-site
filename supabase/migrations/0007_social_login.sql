-- ============================================================================
-- FANCLUV — 0007_social_login.sql  (소셜 로그인 프로필 매핑)
--   (1) profiles.provider_user_id 컬럼 추가
--   (2) 신규 가입 트리거를 OAuth 메타데이터까지 매핑하도록 갱신
-- Supabase 대시보드 → SQL Editor 에서 실행하세요. (0001 이후 언제든)
-- ============================================================================

-- (1) 소셜 provider 의 사용자 고유 ID
alter table public.profiles
  add column if not exists provider_user_id text;

-- (2) auth.users 생성 시 프로필 자동 생성 — 이메일 가입 + 소셜(OAuth) 모두 매핑.
-- 이메일 가입: signUp options.data 로 nickname/gender/age_group/provider 전달.
-- 소셜 로그인: Supabase 가 raw_user_meta_data(name/nickname/avatar_url/picture/
--   provider_id/sub/id) 와 raw_app_meta_data(provider) 를 채운다.
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
    new.email,
    coalesce(
      nullif(meta ->> 'nickname', ''),
      nullif(meta ->> 'name', ''),
      nullif(meta ->> 'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture'),   -- 프로필 이미지
    prov,                                                   -- provider
    coalesce(meta ->> 'provider_id', meta ->> 'sub', meta ->> 'id'),  -- provider_user_id
    meta ->> 'gender',
    meta ->> 'age_group',
    new.email_confirmed_at is not null,
    case when new.email_confirmed_at is not null
         then 'email_verified'::verification_status
         else 'unverified'::verification_status end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================================
-- 같은 이메일의 이메일-가입 계정이 이미 있는 경우(중복):
--   Supabase 대시보드 → Authentication → Providers 에서
--   "Allow linking accounts with the same email" 활성화 시 자동 연결.
--   (MVP 기본값에서는 별도 identity 로 처리되며, 앱은 Supabase 오류 메시지를 표시)
-- ============================================================================
