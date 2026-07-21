// FANCLUV — Mock AI 작성 지원 Provider(순수·결정론적, 네트워크 없음).
//
// 외부 유료 API 를 연결하지 않고 전체 흐름을 검증하기 위한 Provider.
// 동일 입력 → 동일 출력(테스트 안정성). 입력에 따라 결정론적으로 변형하며,
// 사용자가 입력하지 않은 "구체적 사실"은 추가하지 않는다(정책 §1-8).
//
// 공통 출력 계약(§4):
//   { success, outputText, titleSuggestions, warnings, provider, model, requestId, usage, safetyResult, code? }
import { analyzeSafety, maskPii } from './aiWritingSafety.js'
import { AI_DEFAULTS, validateInputLength, normalizeLocale } from './aiWritingConfig.js'

const PROVIDER = 'mock'
const MODEL = 'mock-deterministic-v1'

// ── 텍스트 유틸(결정론적) ────────────────────────────────────────────
function collapseWs(s) {
  return String(s || '')
    .replace(/[ \t ]+/g, ' ')      // 중복 공백 정리
    .replace(/ *\n */g, '\n')            // 줄바꿈 주변 공백 제거
    .replace(/\n{3,}/g, '\n\n')          // 과도한 빈 줄 축소
    .replace(/\s+([,.!?…])/g, '$1')      // 문장부호 앞 공백 제거
    .trim()
}
function dedupeAdjacentWords(s) {
  return s.replace(/\b(\S+)(\s+\1\b)+/g, '$1') // 연속 중복 단어 1개로
}
function splitSentences(s) {
  return String(s || '')
    .split(/(?<=[.!?。])\s+|(?<=다[.!?])\s*|\n+/)
    .map(x => x.trim())
    .filter(Boolean)
}
function ensureEndPunct(s, locale) {
  const t = s.trim()
  if (!t) return t
  if (/[.!?…。]$/.test(t)) return t
  return t + (locale === 'en' ? '.' : '.')
}
function capitalizeEn(s) {
  return s.replace(/^([a-z])/, (m) => m.toUpperCase())
}
function clip(s, n) { return s.length > n ? s.slice(0, n - 1).trim() + '…' : s }

// 감정적/공격적 어휘 → 중립·건설적 표현(결정론적 치환, 의미 유지·사실 추가 없음).
// 후행 어미(이었어요/입니다/이야 등)를 함께 삼키도록 [가-힣]* 로 인플렉션을 흡수한다.
const SOFTEN_KO = [
  [/진짜\s*최악[가-힣]*/g, '많이 아쉬웠습니다'],
  [/최악[가-힣]*/g, '아쉬웠습니다'],
  [/짜증[가-힣]*/g, '불편했습니다'],
  [/개판[가-힣]*/g, '정리가 필요해 보였습니다'],
  [/엉망[가-힣]*/g, '개선이 필요해 보였습니다'],
  [/화가\s*난다|빡친다[가-힣]*/g, '아쉬웠습니다'],
]
const SOFTEN_EN = [
  [/\b(the\s+)?worst\b/gi, 'quite disappointing'],
  [/\bterrible\b/gi, 'disappointing'],
  [/\bawful\b/gi, 'frustrating'],
  [/\bhate\b/gi, 'am unhappy with'],
]
// 욕설 제거(치환은 하지 않고 삭제 후 공백 정리 — 의미는 소프튼 문장이 담당).
const PROFANITY_STRIP = /시발|씨발|개새끼|병신|좆|엿먹|\bfuck\w*\b|\bshit\b|\basshole\b|\bbastard\b/gi

function soften(text, locale) {
  let s = text
  const table = locale === 'en' ? SOFTEN_EN : SOFTEN_KO
  for (const [re, rep] of table) s = s.replace(re, rep)
  s = s.replace(PROFANITY_STRIP, ' ')
  return collapseWs(s)
}

// 개선 요청 신호어
const IMPROVE_HINT = /(개선|바랍|바라|요청|했으면|하면\s*좋|필요|부탁|improve|please|should|need|request)/i
const IMPACT_HINT = /(느꼈|불편|힘들|아쉽|아쉬웠|영향|때문에|difficult|uncomfortable|frustrat|impact|because)/i
const BENEFIT_HINT = /(기대|효과|도움|좋아질|나아질|benefit|expect|help|better)/i

// ── 공통 출력 빌더 ───────────────────────────────────────────────────
function ok(outputText, { titleSuggestions = [], warnings = [], safetyResult = null, sourceLen = 0, requestId = null } = {}) {
  const cfg = AI_DEFAULTS
  const out = String(outputText || '').slice(0, cfg.maxOutputChars)
  return {
    success: true,
    outputText: out,
    titleSuggestions: titleSuggestions.slice(0, 3),
    warnings,
    provider: PROVIDER,
    model: MODEL,
    requestId,
    usage: { estimatedInputUnits: sourceLen, estimatedOutputUnits: out.length },
    safetyResult,
  }
}
function fail(code, { warnings = [], safetyResult = null, requestId = null } = {}) {
  return {
    success: false, code, outputText: '', titleSuggestions: [], warnings,
    provider: PROVIDER, model: MODEL, requestId,
    usage: { estimatedInputUnits: 0, estimatedOutputUnits: 0 }, safetyResult,
  }
}

// ── operation 구현 ───────────────────────────────────────────────────
function opImprove(text, locale) {
  let s = dedupeAdjacentWords(collapseWs(text))
  s = splitSentences(s).map(x => {
    let t = ensureEndPunct(x, locale)
    if (locale === 'en') t = capitalizeEn(t)
    return t
  }).join(' ')
  return s || collapseWs(text)
}

function opConstructive(text, locale) {
  const softened = soften(collapseWs(text), locale)
  const body = splitSentences(softened).map(x => ensureEndPunct(x, locale)).join(' ')
  const closing = locale === 'en'
    ? 'I would appreciate it if this could be reviewed and improved.'
    : '해당 부분을 검토하고 개선해 주시면 감사하겠습니다.'
  // 사용자가 이미 개선 요청을 적었으면 마무리 문장을 중복 추가하지 않는다.
  if (IMPROVE_HINT.test(text)) return body
  return `${body} ${closing}`.trim()
}

function opSummarize(text, locale) {
  const sentences = splitSentences(collapseWs(text))
  if (!sentences.length) return collapseWs(text)
  // 핵심 = 개선요청 문장 우선, 없으면 첫 문장. 최대 2문장.
  const primary = sentences.find(s => IMPROVE_HINT.test(s)) || sentences[0]
  const picks = [sentences[0]]
  if (primary !== sentences[0]) picks.push(primary)
  const joined = picks.map(s => ensureEndPunct(s, locale)).join(' ')
  return clip(joined, 140)
}

function opTitles(text, locale) {
  const sentences = splitSentences(collapseWs(soften(text, locale)))
  const first = sentences[0] || collapseWs(text)
  const words = first.split(/\s+/).filter(Boolean)
  const head = clip(words.slice(0, 8).join(' '), 30)
  if (locale === 'en') {
    return [clip(first, 40), `Feedback on ${head}`, `Request: ${head}`].filter(Boolean).slice(0, 3)
  }
  return [clip(first, 30), `${head} 관련 의견`, `${head} 개선 요청`].filter(Boolean).slice(0, 3)
}

function opStructure(text, locale) {
  const sentences = splitSentences(collapseWs(text))
  const L = locale === 'en'
    ? { exp: 'Experience / Issue', impact: 'Impact felt', req: 'Improvement request', benefit: 'Expected effect', todo: '(please add if applicable)' }
    : { exp: '경험 또는 문제', impact: '팬이 느낀 영향', req: '개선 요청', benefit: '기대 효과', todo: '(해당 시 직접 작성해 주세요)' }
  const buckets = { exp: [], impact: [], req: [], benefit: [] }
  for (const s of sentences) {
    if (IMPROVE_HINT.test(s)) buckets.req.push(s)
    else if (BENEFIT_HINT.test(s)) buckets.benefit.push(s)
    else if (IMPACT_HINT.test(s)) buckets.impact.push(s)
    else buckets.exp.push(s)
  }
  // 입력에 없는 내용을 채우지 않는다 — 비어 있으면 placeholder 안내만.
  const line = (label, arr) => `• ${label}: ${arr.length ? arr.map(x => ensureEndPunct(x, locale)).join(' ') : L.todo}`
  return [line(L.exp, buckets.exp), line(L.impact, buckets.impact), line(L.req, buckets.req), line(L.benefit, buckets.benefit)].join('\n')
}

// ── Provider 진입점 ──────────────────────────────────────────────────
// input: { operation, sourceText, locale, teamId?, context?, requestId? }
export function runMockOperation(input = {}) {
  const operation = input.operation
  const locale = normalizeLocale(input.locale)
  const requestId = input.requestId || null
  const raw = String(input.sourceText ?? '')

  // 길이 검증(빈 입력·너무 짧음·너무 김 거부)
  const len = validateInputLength(raw, AI_DEFAULTS)
  if (!len.ok) return fail(len.code, { requestId })

  // 안전성 검사 — PII 마스킹된 텍스트를 처리 입력으로 사용(비식별).
  const safety = analyzeSafety(raw)
  if (!safety.ok) return fail('safety_blocked', { warnings: safety.warnings, safetyResult: safety, requestId })
  const source = maskPii(raw)
  const sourceLen = raw.length

  let outputText = ''
  let titleSuggestions = []
  switch (operation) {
    case 'improve': outputText = opImprove(source, locale); break
    case 'constructive': outputText = opConstructive(source, locale); break
    case 'summarize': outputText = opSummarize(source, locale); break
    case 'titles': titleSuggestions = opTitles(source, locale); outputText = titleSuggestions.join('\n'); break
    case 'structure': outputText = opStructure(source, locale); break
    default: return fail('unsupported_operation', { requestId })
  }
  return ok(outputText, { titleSuggestions, warnings: safety.warnings, safetyResult: safety, sourceLen, requestId })
}

export function mockHealthCheck() {
  return { ok: true, provider: PROVIDER, model: MODEL, latencyMs: 0 }
}

// Provider 어댑터 형태로 노출(§4 인터페이스).
export const MockAiWritingProvider = {
  id: PROVIDER,
  model: MODEL,
  improveText: (i) => runMockOperation({ ...i, operation: 'improve' }),
  makeConstructive: (i) => runMockOperation({ ...i, operation: 'constructive' }),
  summarizeText: (i) => runMockOperation({ ...i, operation: 'summarize' }),
  suggestTitles: (i) => runMockOperation({ ...i, operation: 'titles' }),
  structureOpinion: (i) => runMockOperation({ ...i, operation: 'structure' }),
  run: runMockOperation,
  healthCheck: mockHealthCheck,
}
