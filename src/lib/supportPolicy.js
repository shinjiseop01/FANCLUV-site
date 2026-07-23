// FANCLUV — 고객 문의 순수 헬퍼(테스트 대상). 카테고리/상태 매핑 + 검증 + 에러코드.

export const INQUIRY_CATEGORIES = ['account', 'service', 'bug', 'privacy', 'etc']
export const INQUIRY_STATUSES = ['pending', 'in_progress', 'resolved']

export const SUBJECT_MIN = 2, SUBJECT_MAX = 100
export const CONTENT_MIN = 10, CONTENT_MAX = 5000

export function categoryKey(c) {
  return INQUIRY_CATEGORIES.includes(c) ? `support.cat.${c}` : 'support.cat.etc'
}
export function statusKey(s) {
  if (s === 'in_progress') return 'support.status.inProgress'
  if (s === 'resolved') return 'support.status.resolved'
  return 'support.status.pending'
}
export function statusBadgeClass(s) {
  if (s === 'resolved') return 'resolved'
  if (s === 'in_progress') return 'inprogress'
  return 'pending'
}

// 클라이언트 사전 검증(서버가 최종 강제). 반환: null(통과) 또는 에러 i18n 키.
export function validateInquiry({ category, subject, content }) {
  if (!INQUIRY_CATEGORIES.includes(category)) return 'support.err.invalidCategory'
  const s = (subject || '').trim(), c = (content || '').trim()
  if (s.length < SUBJECT_MIN || s.length > SUBJECT_MAX) return 'support.err.invalidSubject'
  if (c.length < CONTENT_MIN || c.length > CONTENT_MAX) return 'support.err.invalidContent'
  return null
}

// 서버 RPC 코드 → i18n 키.
export function inquiryErrorKey(code) {
  switch (code) {
    case 'INVALID_CATEGORY': return 'support.err.invalidCategory'
    case 'INVALID_SUBJECT': return 'support.err.invalidSubject'
    case 'INVALID_CONTENT': return 'support.err.invalidContent'
    case 'RATE_LIMITED': return 'support.err.rateLimited'
    case 'INVALID_REPLY': return 'support.err.invalidReply'
    case 'NEED_REPLY': return 'support.err.needReply'
    case 'NOT_FOUND': return 'support.err.notFound'
    case 'NOT_ALLOWED': return 'support.err.notAllowed'
    case 'OK': return 'support.submitted'
    default: return 'support.err.generic'
  }
}
