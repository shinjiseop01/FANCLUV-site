// FANCLUV — 아이디(계정) 찾기 조회 로직 (재사용/확장 가능).
//
// ┌─ 확장 설계 ────────────────────────────────────────────────────────────────┐
// │ 현재: 닉네임(nickname) 입력 → 가입 이메일로 계정 안내 발송(enumeration-safe).│
// │ 추후: PASS/NICE/KCB 본인인증 도입 시 method='phone' 을 추가만 하면 된다.    │
// │       (FindIdForm/화면은 method 만 바꿔 재사용, 백엔드는 여기서만 확장)      │
// └────────────────────────────────────────────────────────────────────────────┘
import { findAccountByNickname } from './auth.js'
import { validateNicknameFormat } from './nicknameValidation.js'

// 아이디 찾기 입력 방식. 추후 PHONE 추가 예정.
export const LOOKUP_METHOD = {
  NICKNAME: 'nickname',
  // PHONE: 'phone', // TODO: PASS/NICE/KCB 본인인증 연동 시 활성화
}

// 방식별 UI 메타(라벨/플레이스홀더/자동완성/입력타입 키). 컴포넌트가 그대로 사용.
export const LOOKUP_META = {
  [LOOKUP_METHOD.NICKNAME]: {
    labelKey: 'signup.nickname',
    placeholderKey: 'findId.nicknamePh',
    autoComplete: 'username',
    inputMode: 'text',
    type: 'text',
  },
  // [LOOKUP_METHOD.PHONE]: {
  //   labelKey: 'findId.phoneLabel', placeholderKey: 'findId.phonePh',
  //   autoComplete: 'tel', inputMode: 'numeric', type: 'tel',
  // },
}

// 입력 형식 검증. 방식별로 분기. 반환: { ok: boolean, errorKey?: string }
export function validateLookupInput(method, value) {
  const v = (value || '').trim()
  if (!v) return { ok: false, errorKey: 'findId.errRequired' }
  if (method === LOOKUP_METHOD.NICKNAME) {
    if (!validateNicknameFormat(v)) return { ok: false, errorKey: 'signup.errNicknameFormat' }
    return { ok: true }
  }
  // TODO(phone): 전화번호 형식/본인인증 토큰 검증
  return { ok: true }
}

// 계정 조회 + 안내 메일 발송. enumeration-safe: 존재 여부와 무관하게 { ok:true }.
// "요청 처리 자체 실패"(네트워크/서버)만 { ok:false, error } 로 구분한다.
// 방식별 백엔드로 위임 → 추후 phone 도입 시 이 분기만 확장.
export async function lookupAccount(method, value) {
  const v = (value || '').trim()
  if (method === LOOKUP_METHOD.NICKNAME) return findAccountByNickname(v)
  // TODO(phone): return findAccountByPhone(verifiedToken)
  return { ok: false, error: 'unsupported_method' }
}
