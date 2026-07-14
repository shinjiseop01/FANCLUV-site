// FANCLUV — 본인인증 오류코드 → 사람이 이해할 수 있는 i18n 키 매핑.
// 내부 오류/원문은 노출하지 않고, 안내 문구 키만 반환한다.

const ERROR_KEY = {
  // 보안 검증 실패(콜백/서명/state/origin/nonce/replay)
  bad_origin: 'identity.err.origin',
  bad_state: 'identity.err.state',
  bad_signature: 'identity.err.signature',
  invalid_nonce: 'identity.err.nonce',
  replay: 'identity.err.replay',
  // 세션/흐름
  expired: 'identity.err.expired',
  invalid: 'identity.err.invalid',
  duplicate: 'identity.err.duplicate',
  cancelled: 'identity.err.cancelled',
  blocked: 'identity.err.blocked',
  // 설정/서버
  provider_unconfigured: 'identity.err.unconfigured',
  not_configured: 'identity.err.unconfigured',
  server_only: 'identity.err.unconfigured',
  session_error: 'identity.err.generic',
  complete_error: 'identity.err.generic',
  save_failed: 'identity.err.generic',
  unauthorized: 'identity.err.unauthorized',
}

export function identityErrorKey(code) {
  return ERROR_KEY[code] || 'identity.err.generic'
}

// 취소는 오류로 강조하지 않는다(사용자 자발적).
export function isSoftError(code) {
  return code === 'cancelled'
}
