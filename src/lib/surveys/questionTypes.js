// FANCLUV — 설문 질문 유형 레지스트리 (단일 소스 오브 트루스).
//
// 관리자 빌더 · 팬 참여 화면 · 결과 집계 · (향후) Quick Poll / AI 설문 생성이
// 모두 이 파일의 정의를 재사용한다. 새 질문 유형을 추가하려면 QUESTION_TYPES 에
// 항목을 넣고 아래 헬퍼(emptyAnswer / isAnswered / aggregate)의 분기만 확장하면 된다.
//
// 값(answer value) 형태
//   single / dropdown / yesno : string   (option.id 또는 yesno 는 'yes'|'no')
//   multi                     : string[] (option.id 배열)
//   rating / nps              : number
//   short / long              : string
//   "기타(allow_other)" 선택 시 : 선택 값 대신 사용자가 입력한 자유 텍스트가 저장된다.

export const OTHER_VALUE = '__other__' // 팬 화면 내부 sentinel(제출 시 실제 텍스트로 치환)

// 유형 정의 — icon 은 components/Icon.jsx 의 이름.
export const QUESTION_TYPES = [
  { type: 'single',   labelKey: 'sv.type.single',   descKey: 'sv.type.singleD',   icon: 'radio',    hasOptions: true },
  { type: 'multi',    labelKey: 'sv.type.multi',    descKey: 'sv.type.multiD',    icon: 'check',    hasOptions: true },
  { type: 'dropdown', labelKey: 'sv.type.dropdown', descKey: 'sv.type.dropdownD', icon: 'chevron',  hasOptions: true },
  { type: 'rating',   labelKey: 'sv.type.rating',   descKey: 'sv.type.ratingD',   icon: 'star',     hasOptions: false },
  { type: 'nps',      labelKey: 'sv.type.nps',      descKey: 'sv.type.npsD',      icon: 'gauge',    hasOptions: false },
  { type: 'yesno',    labelKey: 'sv.type.yesno',    descKey: 'sv.type.yesnoD',    icon: 'toggle',   hasOptions: false },
  { type: 'short',    labelKey: 'sv.type.short',    descKey: 'sv.type.shortD',    icon: 'textLine', hasOptions: false },
  { type: 'long',     labelKey: 'sv.type.long',     descKey: 'sv.type.longD',     icon: 'textBlock',hasOptions: false },
]

const TYPE_MAP = Object.fromEntries(QUESTION_TYPES.map(t => [t.type, t]))

export function getType(type) { return TYPE_MAP[type] || TYPE_MAP.single }
export function typeHasOptions(type) { return !!getType(type).hasOptions }

// 안정적인 로컬 id (localStorage / 낙관적 UI 용). DB 는 자체 uuid 를 발급한다.
export function uid() {
  try { return crypto.randomUUID() } catch { return 'q_' + Math.random().toString(36).slice(2, 11) }
}

export function newOption(label = '') { return { id: uid(), label } }

export function newQuestion(type = 'single') {
  const q = {
    id: uid(), type, title: '', help_text: '',
    required: false, allow_other: false, options: [], config: {}, active: true,
  }
  if (typeHasOptions(type)) q.options = [newOption(), newOption()]
  if (type === 'rating') q.config = { max: 5 }
  return q
}

// 유형 변경 시 옵션/설정을 알맞게 보정(옵션 없는 유형으로 바꾸면 옵션 제거 등).
export function coerceQuestionType(q, nextType) {
  const next = { ...q, type: nextType }
  if (typeHasOptions(nextType)) {
    if (!next.options || next.options.length === 0) next.options = [newOption(), newOption()]
  } else {
    next.options = []
    next.allow_other = false
  }
  if (nextType === 'rating' && !next.config?.max) next.config = { ...next.config, max: 5 }
  return next
}

// 빈 응답 초기값(팬 폼 상태).
export function emptyAnswer(type) {
  if (type === 'multi') return []
  if (type === 'rating' || type === 'nps') return null
  return ''
}

// 필수 응답 충족 여부.
export function isAnswered(q, v) {
  if (v === null || v === undefined) return false
  if (q.type === 'multi') return Array.isArray(v) && v.length > 0
  if (q.type === 'rating') return Number(v) >= 1
  if (q.type === 'nps') return Number.isFinite(Number(v))
  return String(v).trim() !== ''
}

// 옵션 id → 라벨 (없으면 "기타" 자유입력으로 간주해 값을 그대로 표시).
export function optionLabel(q, value, otherLabel = '기타') {
  const opt = (q.options || []).find(o => o.id === value)
  if (opt) return opt.label || otherLabel
  if (q.type === 'yesno') return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : String(value)
  return String(value) // 기타 자유입력 텍스트
}

// 결과 집계 — 질문 유형별로 화면에 필요한 요약을 계산한다.
//   values: 이 질문에 대한 모든 응답 값 배열(무응답 제외 전 · null 포함 가능)
export function aggregate(q, rawValues) {
  const values = rawValues.filter(v => isAnswered(q, v))
  const total = values.length

  if (q.type === 'rating') {
    const nums = values.map(Number).filter(Number.isFinite)
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
    const max = q.config?.max || 5
    const dist = Array.from({ length: max }, (_, i) => ({
      label: String(i + 1), count: nums.filter(n => n === i + 1).length,
    }))
    return { kind: 'rating', total, avg, max, dist }
  }

  if (q.type === 'nps') {
    const nums = values.map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 10)
    const promoters = nums.filter(n => n >= 9).length
    const passives = nums.filter(n => n >= 7 && n <= 8).length
    const detractors = nums.filter(n => n <= 6).length
    const score = nums.length ? Math.round(((promoters - detractors) / nums.length) * 100) : 0
    const dist = Array.from({ length: 11 }, (_, i) => ({
      label: String(i), count: nums.filter(n => n === i).length,
    }))
    return { kind: 'nps', total, score, promoters, passives, detractors, dist }
  }

  if (q.type === 'short' || q.type === 'long') {
    return { kind: 'text', total, responses: values.map(String) }
  }

  // single / dropdown / yesno / multi → 선택지 집계
  const counts = new Map()
  const bump = (key) => counts.set(key, (counts.get(key) || 0) + 1)
  let answerCount = 0
  for (const v of values) {
    if (Array.isArray(v)) { v.forEach(bump); answerCount += 1 }
    else { bump(v); answerCount += 1 }
  }
  let buckets
  if (q.type === 'yesno') {
    buckets = ['yes', 'no'].map(k => ({ label: k === 'yes' ? 'Yes' : 'No', value: k, count: counts.get(k) || 0 }))
  } else {
    // 정의된 옵션 순서대로 + 그 외(기타 자유입력) 값
    const defined = (q.options || []).map(o => ({ label: o.label || '(빈 선택지)', value: o.id, count: counts.get(o.id) || 0 }))
    const definedIds = new Set((q.options || []).map(o => o.id))
    const extras = [...counts.keys()].filter(k => !definedIds.has(k))
      .map(k => ({ label: String(k), value: k, count: counts.get(k), other: true }))
    buckets = [...defined, ...extras]
  }
  return { kind: 'choice', total: answerCount, respondents: total, buckets }
}
