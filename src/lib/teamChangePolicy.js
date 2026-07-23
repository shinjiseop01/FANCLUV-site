// FANCLUV — 응원팀 변경 정책 순수 헬퍼(테스트 대상).
// 서버 RPC 에러코드 → i18n 키 매핑, 변경 불가 사유 → 안내 키.

// fan_change_team / admin_change_team 코드 → i18n 키.
export function teamChangeErrorKey(code) {
  switch (code) {
    case 'TEAM_CHANGE_WINDOW_CLOSED': return 'team.err.windowClosed'
    case 'TEAM_CHANGE_ALREADY_USED': return 'team.err.alreadyUsed'
    case 'SAME_TEAM': return 'team.err.sameTeam'
    case 'INVALID_TEAM': return 'team.err.invalidTeam'
    case 'NO_TEAM': return 'team.err.noTeam'
    case 'NOT_ALLOWED': return 'team.err.notAllowed'
    case 'USER_NOT_FOUND': return 'team.err.userNotFound'
    case 'OK': return 'team.changed'
    default: return 'team.err.generic'
  }
}

// team_change_status → 설정 화면 상태 요약.
//   returns { canChange, reasonKey } — 변경 불가 시 사유 안내 키.
export function teamChangeUiState(status) {
  if (!status || status.ok === false) return { canChange: false, reasonKey: 'team.reason.unknown' }
  if (status.can_change) return { canChange: true, reasonKey: null }
  if (status.role && status.role !== 'user') return { canChange: false, reasonKey: 'team.reason.notFan' }
  if (!status.current_team) return { canChange: false, reasonKey: 'team.reason.noTeam' }
  if (status.window_open && status.already_used) return { canChange: false, reasonKey: 'team.reason.alreadyUsed' }
  if (!status.window_open) return { canChange: false, reasonKey: 'team.reason.windowClosed' }
  return { canChange: false, reasonKey: 'team.reason.unknown' }
}

// 다음 변경 가능 기간 안내: 확정된 next window 있으면 날짜, 없으면 null(→ '추후 안내').
export function nextWindowText(status, fmtDate) {
  if (status?.next_start && status?.next_end) {
    return `${fmtDate(status.next_start)} ~ ${fmtDate(status.next_end)}`
  }
  return null
}
