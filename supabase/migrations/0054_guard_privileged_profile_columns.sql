-- ============================================================================
-- FANCLUV — 0054_guard_privileged_profile_columns.sql  (P0 권한 상승 취약점 수정)
--
-- 문제(실측): profiles 의 self-update RLS 정책이 컬럼을 구분하지 않아, 일반 사용자가
--   REST 로 자기 `role` 을 'admin' 으로 변경(PATCH)하면 그대로 반영되었다(권한 상승).
--   role 뿐 아니라 deactivated_at / verification_status / identity_* 등 권한/신원 컬럼도
--   자기 수정으로 위조 가능했다.
--
-- 수정: BEFORE UPDATE 가드 트리거로 "인증 사용자(비관리자)"가 권한 컬럼을 바꾸면 거부한다.
--   - auth.uid() is null (service_role/백엔드) → 허용(신뢰 컨텍스트).
--   - is_admin() → 허용(관리자 정당 행위, admin RPC 포함).
--   - 그 외(일반 인증 사용자) → 권한 컬럼 변경 시 42501.
-- ============================================================================
create or replace function public.guard_profile_privileged_cols()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- service_role/백엔드(uid 없음) 또는 관리자는 통과.
  if auth.uid() is null or public.is_admin() then
    return NEW;
  end if;
  -- 일반 인증 사용자가 권한/신원 컬럼을 바꾸려 하면 거부(값 되돌리지 않고 명시적 실패).
  if NEW.role              is distinct from OLD.role
  or NEW.deactivated_at    is distinct from OLD.deactivated_at
  or NEW.verification_status is distinct from OLD.verification_status
  or NEW.identity_verified is distinct from OLD.identity_verified
  or NEW.identity_ci       is distinct from OLD.identity_ci
  or NEW.identity_di       is distinct from OLD.identity_di
  or NEW.is_email_verified is distinct from OLD.is_email_verified then
    raise exception 'forbidden: cannot modify privileged profile columns' using errcode = '42501';
  end if;
  return NEW;
end $$;

drop trigger if exists guard_profiles_privileged on public.profiles;
create trigger guard_profiles_privileged
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_cols();
