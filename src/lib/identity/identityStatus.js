// FANCLUV — 본인인증 상태 메타(아이콘/색상/설명/다음행동) + 오류코드→메시지 매핑.
// 순수 데이터/함수 — VerifyIdentityPage · SettingsPage · AdminIdentity 에서 공용 사용.

// 사용자 관점 상태.
export const IDENTITY_STATES = ['unverified', 'pending', 'verified', 'failed', 'expired', 'blocked']

// 상태별 표시 메타. tone = 의미색 토큰 클래스(admin.css/theme 의 상태색).
export const IDENTITY_STATUS_META = {
  unverified: { icon: 'userCheck', tone: 'muted', labelKey: 'identity.st.unverified', descKey: 'identity.st.unverifiedDesc', nextKey: 'identity.st.unverifiedNext' },
  pending: { icon: 'clock', tone: 'info', labelKey: 'identity.st.pending', descKey: 'identity.st.pendingDesc', nextKey: 'identity.st.pendingNext' },
  verified: { icon: 'check', tone: 'ok', labelKey: 'identity.st.verified', descKey: 'identity.st.verifiedDesc', nextKey: 'identity.st.verifiedNext' },
  failed: { icon: 'alert', tone: 'bad', labelKey: 'identity.st.failed', descKey: 'identity.st.failedDesc', nextKey: 'identity.st.failedNext' },
  expired: { icon: 'clock', tone: 'warn', labelKey: 'identity.st.expired', descKey: 'identity.st.expiredDesc', nextKey: 'identity.st.expiredNext' },
  blocked: { icon: 'lock', tone: 'bad', labelKey: 'identity.st.blocked', descKey: 'identity.st.blockedDesc', nextKey: 'identity.st.blockedNext' },
}

export function statusMeta(status) {
  return IDENTITY_STATUS_META[status] || IDENTITY_STATUS_META.unverified
}

// 서버/DB 상태 + 프로필 verified 여부 → 사용자 표시 상태.
export function resolveIdentityStatus({ verified, latestSessionStatus } = {}) {
  if (verified) return 'verified'
  if (latestSessionStatus === 'blocked') return 'blocked'
  if (latestSessionStatus === 'pending') return 'pending'
  if (latestSessionStatus === 'failed') return 'failed'
  if (latestSessionStatus === 'expired') return 'expired'
  return 'unverified'
}

// 재시도 가능한 상태(다시 인증 버튼 노출).
export function canRetry(status) {
  return status === 'unverified' || status === 'failed' || status === 'expired'
}
