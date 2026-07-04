// FANCLUV — 닉네임 형식 검증 (중복 검사 제외).
//
// validateNicknameFormat(nickname) → { ok, code }
//   code 는 locale 키 nickname.err.<code> 와 매핑된다.
//   ok=true 여야 저장 가능(추가로 중복 검사는 별도: isNicknameTaken).
//
// 정책
//  · 허용 문자: 완성형 한글(가-힣) / 영문(A-Za-z) / 숫자(0-9). 조합 자유(숫자 단독 허용).
//  · 공백·특수문자·문장부호·이모지·한자·기타 외국어·자음/모음 단독 → 불가.
//  · 길이: 2자 이상, 한글 최대 8자, 그 외(영문/숫자/혼합) 총 12자 이하.
//  · 예약어(reservedNicknames), 금칙어(bannedWords) → 불가.
import { isReservedNickname } from './reservedNicknames.js'
import { containsBannedWord } from './bannedWords.js'

const HANGUL_MAX = 8
const TOTAL_MAX = 12  // 영문/숫자/혼합 최대(영문 12자 기준)

export function validateNicknameFormat(nickname) {
  const raw = String(nickname ?? '')
  const s = raw.trim()

  if (!s) return { ok: false, code: 'empty' }
  // 줄바꿈/공백 금지 (원문 기준 — 앞뒤/중간 공백 모두 불가)
  if (/\s/.test(raw)) return { ok: false, code: 'has_space' }

  // 허용 문자만? 아니면 자음/모음(호환 자모 U+3131–U+3163)인지 구분해 메시지 분기
  if (!/^[가-힣A-Za-z0-9]+$/.test(s)) {
    if (/[ㄱ-ㅣ]/.test(s)) return { ok: false, code: 'has_jamo' }
    return { ok: false, code: 'invalid_char' }
  }

  if (s.length < 2) return { ok: false, code: 'too_short' }

  const hangulCount = (s.match(/[가-힣]/g) || []).length
  if (hangulCount > HANGUL_MAX) return { ok: false, code: 'too_long_ko' }
  if (s.length > TOTAL_MAX) return { ok: false, code: 'too_long_en' }

  if (isReservedNickname(s)) return { ok: false, code: 'reserved' }
  if (containsBannedWord(s)) return { ok: false, code: 'banned' }

  return { ok: true, code: 'ok' }
}

// 형식이 유효한지만 boolean 으로 (기존 호출부 호환).
export function isValidNickname(nickname) {
  return validateNicknameFormat(nickname).ok
}
