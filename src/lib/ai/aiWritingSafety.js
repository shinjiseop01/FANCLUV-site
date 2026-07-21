// FANCLUV — AI 의견 작성 지원: 안전성 검사(순수 함수, 단위 테스트 대상).
//
// Provider 호출 전후에 최소 안전성 검사를 적용한다. 목적은 "팬의 비판을 막는 것"이
// 아니라, (1) 개인정보 노출 방지, (2) 위협/혐오는 표현 개선을 유도, (3) 프롬프트 인젝션을
// 일반 데이터로 취급하도록 표시하는 것이다.
//
// 반환 severity 규칙:
//   block : 게시/AI 처리 전에 반드시 해결(주민번호·계좌번호·명시적 폭력 위협)
//   warn  : 허용하되 개선/제거를 안내(이메일·전화·주소·혐오·욕설)
//   info  : 중립화하여 데이터로 취급(프롬프트 인젝션·스팸/반복)
//   none  : 문제 없음
//
// 언어 중립(정규식) + ko/en 키워드 최소 목록. 결정론적 — 동일 입력 동일 결과.

const SEVERITY_RANK = { none: 0, info: 1, warn: 2, block: 3 }
function maxSeverity(a, b) { return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b }

// ── 패턴 ─────────────────────────────────────────────────────────────
const RE = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // 주민등록번호: 6자리-[1-4]+6자리
  rrn: /\b\d{6}\s?[-]\s?[1-4]\d{6}\b/g,
  // 계좌번호: 숫자 3그룹(하이픈) 또는 11자리 이상 연속 숫자
  account: /\b\d{2,6}-\d{2,6}-\d{2,7}\b|\b\d{11,16}\b/g,
  // 전화번호(한국): 010-1234-5678 / +82 10 / 02-123-4567 등 — 구분자 있는 9자리 이상
  phone: /(?:\+?82[-\s]?)?0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}\b/g,
  // URL(스팸 판단용)
  url: /https?:\/\/[^\s]+/gi,
}

// 주소 힌트: (시|도|구|군|읍|면) ... (로|길) + 숫자, 또는 동/호 번지
const RE_ADDRESS = /(?:[가-힣]{1,10}(?:시|도)\s?)?[가-힣]{1,10}(?:구|군)\s?[가-힣]{0,10}(?:로|길)\s?\d+|\d+\s?(?:번지|동\s?\d+\s?호)/g

// 위협/폭력 선동(명시적) — block 후보
const THREAT_WORDS = ['죽여', '죽이', '죽여버', '때려죽', '없애버', '패버', '칼로', '총으로', '불질러', '테러',
  'kill you', 'i will kill', 'murder you', 'beat you', 'shoot you', 'bomb', 'burn down']
// 혐오 표현(범주 기반, 예시 최소) — warn
const HATE_WORDS = ['혐오', '역겨운 종족', 'subhuman', 'go back to your country']
// 욕설/공격 표현(예시 최소) — warn (삭제 아님, 개선 제안)
const PROFANITY_WORDS = ['시발', '씨발', '개새끼', '병신', '좆', '엿먹', 'fuck', 'shit', 'asshole', 'bastard']
// 프롬프트 인젝션 — info(중립화)
const INJECTION_PATTERNS = [
  /이전\s*(지시|명령|지침)[\s\S]{0,6}무시/i,
  /시스템\s*(프롬프트|메시지)[\s\S]{0,6}(보여|출력|공개|알려)/i,
  /관리자\s*권한[\s\S]{0,6}(실행|접근)/i,
  /(다른|타)\s*사용자[\s\S]{0,10}(데이터|정보)[\s\S]{0,6}(보여|출력)/i,
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts)/i,
  /reveal\s+(your\s+)?(system\s+)?(prompt|instructions)/i,
  /(act|behave)\s+as\s+(an?\s+)?(admin|developer|dan|system)/i,
  /developer\s+mode/i,
  /^\s*(system|assistant|developer)\s*:/im, // 역할 마커 라인
]

function countMatches(text, re) {
  const m = String(text).match(re)
  return m ? m.length : 0
}
function hasAny(textLower, words) {
  return words.some(w => textLower.includes(w.toLowerCase()))
}

// ── 개인정보 감지 ────────────────────────────────────────────────────
export function detectPii(text) {
  const s = String(text || '')
  const found = []
  const hasRrn = countMatches(s, RE.rrn) > 0
  const hasPhone = countMatches(s, RE.phone) > 0
  if (hasRrn) found.push({ code: 'pii_rrn', severity: 'block' })
  // 계좌 판정은 주민번호·전화번호를 먼저 제거한 뒤 수행(패턴 충돌 방지 — 전화번호가
  // 3그룹 숫자로 계좌처럼 보이는 오탐을 막는다).
  const sNoPhoneRrn = s.replace(RE.rrn, ' ').replace(RE.phone, ' ')
  if (countMatches(sNoPhoneRrn, RE.account)) found.push({ code: 'pii_account', severity: 'block' })
  if (countMatches(s, RE.email)) found.push({ code: 'pii_email', severity: 'warn' })
  if (hasPhone) found.push({ code: 'pii_phone', severity: 'warn' })
  if (countMatches(s, RE_ADDRESS)) found.push({ code: 'pii_address', severity: 'warn' })
  return found
}

// 개인정보 마스킹 — Provider 입력에서 원시 PII 를 제거한다(비식별화).
// 순서 주의: 주민번호 → 전화 → 계좌 → 이메일 → 주소(전화가 계좌로 오탐되지 않게 먼저 제거).
export function maskPii(text) {
  return String(text || '')
    .replace(RE.rrn, '[주민번호]')
    .replace(RE.phone, '[연락처]')
    .replace(RE.account, '[계좌]')
    .replace(RE.email, '[이메일]')
    .replace(RE_ADDRESS, '[주소]')
}

// ── 위협/혐오/욕설 ───────────────────────────────────────────────────
export function detectAbuse(text) {
  const lower = String(text || '').toLowerCase()
  const found = []
  if (hasAny(lower, THREAT_WORDS)) found.push({ code: 'threat', severity: 'block' })
  if (hasAny(lower, HATE_WORDS)) found.push({ code: 'hate', severity: 'warn' })
  if (hasAny(lower, PROFANITY_WORDS)) found.push({ code: 'profanity', severity: 'warn' })
  return found
}

// ── 스팸/반복 ────────────────────────────────────────────────────────
export function detectSpam(text) {
  const s = String(text || '')
  const found = []
  // 동일 문자 10회 이상 연속
  if (/(.)\1{9,}/.test(s)) found.push({ code: 'repetition', severity: 'info' })
  // URL 3개 이상
  if (countMatches(s, RE.url) >= 3) found.push({ code: 'spam', severity: 'info' })
  return found
}

// ── 프롬프트 인젝션 ──────────────────────────────────────────────────
export function detectInjection(text) {
  const s = String(text || '')
  return INJECTION_PATTERNS.some(re => re.test(s)) ? [{ code: 'prompt_injection', severity: 'info' }] : []
}

// ── 종합 분석 ────────────────────────────────────────────────────────
// 반환: { ok, severity, categories, warnings, redactedText, hasInjection }
//   ok      : block 심각도가 없으면 true (게시/AI 처리 진행 가능)
//   severity: 최고 심각도
//   warnings: 사용자에게 안내할 코드 목록(중복 제거)
//   redactedText: PII 마스킹된 텍스트(Provider 입력용)
export function analyzeSafety(text) {
  const cats = [
    ...detectPii(text),
    ...detectAbuse(text),
    ...detectSpam(text),
    ...detectInjection(text),
  ]
  let severity = 'none'
  for (const c of cats) severity = maxSeverity(severity, c.severity)
  const warnings = [...new Set(cats.map(c => c.code))]
  return {
    ok: severity !== 'block',
    severity,
    categories: cats,
    warnings,
    redactedText: maskPii(text),
    hasInjection: cats.some(c => c.code === 'prompt_injection'),
  }
}
