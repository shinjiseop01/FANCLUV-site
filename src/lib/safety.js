// FANCLUV — 입력/리다이렉트 안전 유틸(순수 함수, 단위 테스트 대상).
//
// 외부 의존성이 없어 테스트에서 그대로 import 할 수 있다.

// PostgREST or-filter/경로에 쓰이는 club id 정규화 — 소문자/숫자/하이픈만 허용.
//   `.or(\`team_id.eq.${id}\`)` 인젝션(쉼표/괄호로 필터 추가) 방어.
export function safeClubId(id) {
  return String(id || '').replace(/[^a-z0-9-]/gi, '')
}

// team_id or-filter 문자열을 안전하게 생성. id 없으면 null 만 조회.
export function teamOrFilter(id) {
  const s = safeClubId(id)
  return s ? `team_id.eq.${s},team_id.is.null` : 'team_id.is.null'
}

// 앱 내부 리다이렉트 경로 안전성 — 오픈 리다이렉트/스킴 인젝션 방어.
//   허용: '/' 로 시작하는 내부 경로(단, '//' protocol-relative 는 거부).
//   거부: 절대 URL(http:, javascript:, data:), '//evil.com', 빈 값.
export function isSafePath(path) {
  const p = String(path || '')
  if (!p.startsWith('/')) return false
  if (p.startsWith('//')) return false
  if (/^\/[\\]/.test(p)) return false // '/\evil'
  return true
}

// 안전하지 않으면 fallback 경로로 대체.
export function safeRedirectPath(path, fallback = '/') {
  return isSafePath(path) ? path : fallback
}
