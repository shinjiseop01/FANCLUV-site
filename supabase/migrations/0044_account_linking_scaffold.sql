-- ============================================================================
-- FANCLUV — 0044_account_linking_scaffold.sql
--
-- 목적(베타): 향후 "본인인증(PASS/NICE/KCB) → DI → 1인 1계정 → 여러 소셜/이메일
--   provider 를 하나의 FANCLUV 계정으로 연결" 로 확장할 수 있도록 **구조만** 준비한다.
--   이번 마이그레이션은 실제 병합/연결 로직을 구현하지 않는다(컬럼·인덱스·트리거 초기화만).
--
-- 배경(현행 구조):
--   • 0026: profiles.identity_ci / identity_di (평문), identity_ci UNIQUE(1 CI=1 계정),
--           claim_identity() RPC — CI 기준 중복확인.
--   • 0007/0038: profiles.provider(단일) / provider_user_id — 계정당 provider "1개"만 기록.
--
-- 이번에 추가하는 확장 포인트:
--   (1) profiles.identity_di_hash  — DI 를 평문이 아닌 해시(sha256 hex)로 보관하기 위한
--       컬럼. 실제 저장은 identity-verify Edge Function(service_role)에서 수행할 예정.
--       DI 는 "동일인 판별 + 계정 병합"의 기준값이므로, 평문 DI(identity_di)는 점진적으로
--       사용을 줄이고 di_hash 로 이전한다(주민등록번호 등 원문은 애초에 저장하지 않음).
--   (2) profiles.identity_di_hash 부분 UNIQUE — "1 DI = 1 FANCLUV 계정" 을 DB 차원에서
--       강제(1인 1계정). 현재 모든 값이 NULL 이라 안전(부분 인덱스).
--   (3) profiles.linked_providers(jsonb) — 이 계정에 연결된 인증수단 목록.
--       [{ "provider": "google|kakao|naver|email", "provider_user_id": "...",
--          "linked_at": "<iso8601>" }, ...]
--       향후 "구글로도 로그인, 카카오로도 로그인 → 같은 계정" 을 표현하는 캐시/뷰.
--
-- 실제 계정 연결/병합(향후 구현 예정, 이번엔 만들지 않음):
--   • link_provider_to_di(di_hash, provider, provider_user_id): 인증 성공 후 동일 DI 를 가진
--     기존 프로필이 있으면 그 계정에 provider 를 append(연결), 없으면 신규.
--   • merge_accounts(loser_id, winner_id): 중복 계정을 winner 로 병합(활동/포인트 이관).
--   설계 상세는 docs/AUTH_ACCOUNT_LINKING.md 참고.
-- ============================================================================

-- (1) DI 해시 컬럼 — 평문 DI 대신 sha256(hex). NULL 허용(본인인증 도입 전).
alter table public.profiles
  add column if not exists identity_di_hash text;

comment on column public.profiles.identity_di_hash is
  'DI(중복가입확인정보) 의 sha256 해시. 동일인 식별/계정병합의 기준값. 1 DI = 1 계정. 원문 DI/주민번호는 저장하지 않는다.';

-- (2) 1 DI = 1 계정 — 부분 UNIQUE(현재 전부 NULL 이라 안전). 향후 본인인증 시 중복가입 차단.
create unique index if not exists profiles_identity_di_hash_unique
  on public.profiles (identity_di_hash) where identity_di_hash is not null;

-- (3) 연결된 인증수단 목록(캐시). 기본 빈 배열.
alter table public.profiles
  add column if not exists linked_providers jsonb not null default '[]'::jsonb;

comment on column public.profiles.linked_providers is
  '이 계정에 연결된 인증수단 배열: [{provider, provider_user_id, linked_at}]. 향후 다중 provider 연결(1계정 N provider)의 근거.';

-- ── 기존 계정 백필 ── 현재 provider(단일)를 linked_providers 배열의 첫 항목으로 이관.
update public.profiles
set linked_providers = jsonb_build_array(
      jsonb_build_object(
        'provider',         coalesce(provider, 'email'),
        'provider_user_id', provider_user_id,
        'linked_at',        coalesce(created_at, now())
      ))
where linked_providers = '[]'::jsonb;

-- ── 신규 가입 트리거 확장 ── 프로필 생성 시 linked_providers 를 가입 provider 로 초기화.
--   (0038 의 로직을 보존하고 linked_providers 초기화만 추가 — 병합 로직은 없음.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  app_meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  prov     text  := coalesce(app_meta ->> 'provider', meta ->> 'provider', 'email');
  puid     text  := coalesce(meta ->> 'provider_id', meta ->> 'sub', meta ->> 'id');
begin
  insert into public.profiles (
    id, email, nickname, avatar_url, provider, provider_user_id,
    gender, age_group, is_email_verified, verification_status, linked_providers
  ) values (
    new.id,
    new.email,
    coalesce(
      nullif(meta ->> 'nickname', ''),
      nullif(meta ->> 'name', ''),
      nullif(meta ->> 'full_name', ''),
      nullif(meta ->> 'preferred_username', ''),
      nullif(meta ->> 'user_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      case prov
        when 'kakao'  then '카카오사용자'
        when 'naver'  then '네이버사용자'
        when 'google' then '구글사용자'
        else 'FANCLUV 사용자'
      end
    ),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture'),
    prov,
    puid,
    meta ->> 'gender',
    meta ->> 'age_group',
    new.email_confirmed_at is not null,
    case when new.email_confirmed_at is not null
         then 'email_verified'::verification_status
         else 'unverified'::verification_status end,
    jsonb_build_array(jsonb_build_object(
      'provider', prov, 'provider_user_id', puid, 'linked_at', now()))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================================
-- 다음 단계(이번 마이그레이션 범위 아님):
--   • identity-verify Edge Function 이 업체(PASS/NICE/KCB) 응답의 DI 를 받아
--     identity_di_hash = encode(digest(di,'sha256'),'hex') 로 저장.
--   • 동일 di_hash 존재 시: 기존 계정에 현재 provider 를 linked_providers 로 append 하고,
--     신규 auth.users 는 병합 대상으로 표시(merge_accounts).
--   • claim_identity() 를 di_hash 기준으로 확장하거나 서버 함수로 대체.
-- ============================================================================
