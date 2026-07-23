// FANCLUV — 비밀번호 정책(최소 길이) 공용 모듈.
//
// 최소 길이 리터럴이 화면·검증마다 흩어져 서로 어긋나는 것을 막기 위해 한 곳에서
// 관리한다. 회원가입/비밀번호 변경/비밀번호 재설정/서버 검증 모두 이 값을 재사용한다.
// (복잡도 강제는 이 단계에서 추가하지 않는다 — 최소 길이만.)
export const MIN_PASSWORD_LENGTH = 8

// 길이 충족 여부. 비밀번호는 앞뒤 공백도 유효 문자이므로 trim 하지 않는다(원문 길이 기준).
export function isPasswordLongEnough(pw) {
  return typeof pw === 'string' && pw.length >= MIN_PASSWORD_LENGTH
}

// 새 비밀번호 폼 검증(순수 함수 — 테스트 가능). 우선순위를 명확히 고정한다:
//   1) 새 비밀번호 미입력 → resetPw.errNew
//   2) 새 비밀번호 8자 미만 → resetPw.errLen
//   3) 비밀번호 확인 미입력 → resetPw.errConfirm
//   4) 새 비밀번호와 확인 불일치 → resetPw.errMatch
//   5) 통과 → { ok: true }
// 반환: { ok, errorKey? } — errorKey 는 i18n 키.
export function validateNewPassword(next, confirm) {
  if (!next) return { ok: false, errorKey: 'resetPw.errNew' }
  if (next.length < MIN_PASSWORD_LENGTH) return { ok: false, errorKey: 'resetPw.errLen' }
  if (!confirm) return { ok: false, errorKey: 'resetPw.errConfirm' }
  if (next !== confirm) return { ok: false, errorKey: 'resetPw.errMatch' }
  return { ok: true }
}
