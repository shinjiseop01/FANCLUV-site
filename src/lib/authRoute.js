// FANCLUV — 로그인 성공 후 이동 경로 결정 (단일 소스).
//
// 이메일 로그인 · 소셜 OAuth 콜백(/auth/callback) 이 동일한 규칙으로 이동하도록
// 경로 계산을 한 곳에 모은다.
//   구단(고객) → Executive / 온보딩 필요(소셜 신규) → 온보딩 / 운영자 → 관리자 /
//   본인인증 미완료 팬 → 본인인증 / 팀 선택 완료 → 구단 홈 / 그 외 → 팀 선택.
import { ADMIN_ROLES, CLUB_ROLES, needsOnboarding, requiresIdentityVerification } from './auth.js'

export function postAuthPath(user) {
  if (!user) return '/'
  if (CLUB_ROLES.includes(user.role)) return '/executive'
  if (needsOnboarding(user)) return '/onboarding'
  if (ADMIN_ROLES.includes(user.role)) return '/admin'
  if (requiresIdentityVerification(user)) return '/verify-identity'
  if (user.selectedTeam) return `/club/${user.selectedTeam}`
  return '/team-select'
}
