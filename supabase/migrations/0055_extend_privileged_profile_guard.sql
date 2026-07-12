-- ============================================================================
-- FANCLUV — 0055_extend_privileged_profile_guard.sql
--   (P0 DI 무결성 보호 확장 + 정상 서버 RPC 회귀 수정)
--
-- 배경(실측):
--   1) 0054 가드는 identity_di_hash / identity_provider / identity_verified_at /
--      linked_providers / provider / provider_user_id / email 을 보호하지 않아,
--      일반 팬이 REST PATCH 로 DI 무결성/계정연결/신원 서버 컬럼을 위조할 수 있었다.
--      (프로덕션 RC 검증에서 identity_di_hash 변경이 HTTP 204 로 실제 반영됨을 확인.)
--   2) 0054 가드는 SECURITY DEFINER + `auth.uid()` 판정이라, 정상 SECURITY DEFINER RPC
--      (claim_profile_email 등)가 유저 컨텍스트에서 실행될 때 auth.uid() 가 그 유저라
--      가드가 발동해 **정상 이메일 인증 흐름까지 차단**되었다(실측 42501).
--
-- 수정:
--   - 가드를 SECURITY INVOKER 로 바꿔 `current_user`(실제 실행 롤)로 신뢰 컨텍스트를 판정한다.
--       · current_user = 'authenticated'  → 브라우저 등 end-user 의 직접 REST UPDATE (검사 대상)
--       · 그 외(정의자 RPC = 함수 소유자 롤, service_role, 백엔드) → 신뢰 → 통과
--       · is_admin() → 관리자 정당 행위 → 통과
--     이렇게 하면 claim_profile_email/admin RPC/service_role 은 정상 통과하고,
--     일반 팬의 직접 PATCH 만 차단된다.
--   - 보호 컬럼을 서버 신뢰 컬럼 전체로 확장(아래).
--   - 정상 사용자 편집 컬럼(nickname, nickname_updated_at, gender, age_group, avatar_url,
--     selected_team, notification_prefs, updated_at 등)은 그대로 허용.
--
-- 참고: 기존 0054 파일은 수정하지 않는다(히스토리 보존). 본 0055 가 함수를 CREATE OR REPLACE.
-- ============================================================================
create or replace function public.guard_profile_privileged_cols()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  -- 신뢰 컨텍스트: end-user 직접 REST(authenticated) 가 아니거나 관리자면 통과.
  --   · 정의자 RPC(claim_profile_email 등)는 함수 소유자 롤로 실행 → current_user <> 'authenticated'
  --   · service_role/백엔드도 current_user <> 'authenticated'
  if current_user <> 'authenticated' or public.is_admin() then
    return NEW;
  end if;

  -- 일반 인증 사용자의 직접 PATCH: 서버 신뢰 컬럼 변경 시 거부(부분 변경 없이 전체 rollback).
  if NEW.role                is distinct from OLD.role
  or NEW.deactivated_at      is distinct from OLD.deactivated_at
  or NEW.verification_status is distinct from OLD.verification_status
  or NEW.is_email_verified   is distinct from OLD.is_email_verified
  or NEW.identity_verified   is distinct from OLD.identity_verified
  or NEW.identity_verified_at is distinct from OLD.identity_verified_at
  or NEW.identity_provider   is distinct from OLD.identity_provider
  or NEW.identity_ci         is distinct from OLD.identity_ci
  or NEW.identity_di         is distinct from OLD.identity_di
  or NEW.identity_di_hash    is distinct from OLD.identity_di_hash
  or NEW.linked_providers    is distinct from OLD.linked_providers
  or NEW.provider            is distinct from OLD.provider
  or NEW.provider_user_id    is distinct from OLD.provider_user_id
  or NEW.email               is distinct from OLD.email then
    raise exception 'forbidden: cannot modify privileged profile columns' using errcode = '42501';
  end if;
  return NEW;
end $$;

-- 트리거는 함수명을 참조하므로 함수 교체만으로 새 로직이 적용된다. 명시적으로 재보장.
drop trigger if exists guard_profiles_privileged on public.profiles;
create trigger guard_profiles_privileged
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_cols();
