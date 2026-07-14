// FANCLUV — 관리자 회원 삭제 권한 정책 (순수 로직).
//
// 프론트에서 삭제 버튼 노출/비활성 판단(UX)에 사용하고, 동일 규칙을 서버 Edge Function
// (admin-delete-user)이 권위 있게 재검증한다. 클라이언트 값은 신뢰하지 않는다(서버가 DB 재조회).
//
// 역할: user(팬) / staff / admin / superadmin / club / club_admin

// 행위자 역할 → 삭제 가능한 대상 역할 목록.
//  - superadmin: superadmin 을 제외한 모든 역할 삭제 가능.
//  - admin: 일반 팬(user)만 삭제 가능.
//  - 그 외(staff/club/club_admin/user): 삭제 권한 없음.
export const DELETABLE_BY = {
  superadmin: ['user', 'staff', 'admin', 'club', 'club_admin'],
  admin: ['user'],
}

// superadmin 은 이 흐름으로 절대 삭제하지 않는다(최후의 1인 보호 포함).
export function isProtectedTargetRole(role) {
  return role === 'superadmin'
}

// 행위자 역할이 삭제 권한 자체를 갖는지(=관리자 콘솔에서 삭제 UI 노출 대상).
export function canActorDelete(actorRole) {
  return Array.isArray(DELETABLE_BY[actorRole]) && DELETABLE_BY[actorRole].length > 0
}

// 행위자 역할이 특정 대상 역할을 삭제할 수 있는지.
export function canDeleteRole(actorRole, targetRole) {
  if (isProtectedTargetRole(targetRole)) return false
  return (DELETABLE_BY[actorRole] || []).includes(targetRole)
}

// 삭제 사유 검증. 3~500자(trim 기준).
export function validateReason(reason) {
  const r = String(reason ?? '').trim()
  if (r.length < 3) return { ok: false, code: 'reason_too_short' }
  if (r.length > 500) return { ok: false, code: 'reason_too_long' }
  return { ok: true, value: r }
}

// 삭제 방식 검증.
export const DELETE_MODES = ['hard_delete', 'anonymize']
export function normalizeMode(mode) {
  return DELETE_MODES.includes(mode) ? mode : 'hard_delete'
}

// UUID v4 형식 검증(대상 user_id).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v)
}

// 서버 error code → i18n 키(관리자 UI 메시지 매핑). 원시 오류 노출 방지.
export const DELETE_ERROR_KEY = {
  unauthorized: 'admin.del.errUnauthorized',
  forbidden: 'admin.del.errForbidden',
  self_delete_forbidden: 'admin.del.errSelf',
  last_superadmin_forbidden: 'admin.del.errLastSuper',
  invalid_target_role: 'admin.del.errInvalidTarget',
  target_not_found: 'admin.del.errNotFound',
  already_deleted: 'admin.del.errAlready',
  already_in_progress: 'admin.del.errInProgress',
  previous_attempt_failed: 'admin.del.errPrevFailed',
  invalid_uuid: 'admin.del.errInvalid',
  reason_too_short: 'admin.del.errReasonShort',
  reason_too_long: 'admin.del.errReasonLong',
  deletion_failed: 'admin.del.errFailed',
}
export function deleteErrorKey(code) {
  return DELETE_ERROR_KEY[code] || 'admin.del.errFailed'
}
