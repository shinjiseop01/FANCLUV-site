// FANCLUV — Fan Pulse 상태/옵션/집계 순수 로직(프론트·테스트 공유). 서버(0062)와 규칙 동일.

export const PULSE_STATES = ['active', 'closed', 'archived']

// 상태 전이 — pulse_set_status RPC 와 1:1.
//   active↔closed(close/reopen), {active,closed}→archived. archived 는 종단(삭제만).
export const PULSE_TRANSITIONS = {
  active: ['closed', 'archived'],
  closed: ['active', 'archived'],
  archived: [],
}

export const PULSE_STATUS_META = {
  active: { tone: 'ok', labelKey: 'pulse.st.active' },
  closed: { tone: 'muted', labelKey: 'pulse.st.closed' },
  archived: { tone: 'warn', labelKey: 'pulse.st.archived' },
}

export function canTransition(from, to) {
  return (PULSE_TRANSITIONS[from] || []).includes(to)
}

export function transitionAction(to) {
  return to === 'closed' ? 'pulse.close' : to === 'active' ? 'pulse.reopen' : to === 'archived' ? 'pulse.archive' : null
}

// 선택지 검증: 배열, 2~6개, 각 {id,label} 비어있지 않음, id 중복 없음.
export function validateOptions(options) {
  if (!Array.isArray(options)) return { ok: false, code: 'invalid_options' }
  if (options.length < 2 || options.length > 6) return { ok: false, code: 'invalid_options' }
  const ids = new Set()
  for (const o of options) {
    const id = String(o?.id ?? '').trim()
    const label = String(o?.label ?? '').trim()
    if (!id || !label) return { ok: false, code: 'empty_option' }
    if (ids.has(id)) return { ok: false, code: 'dup_option' }
    ids.add(id)
  }
  return { ok: true }
}

// 라벨 목록 → [{id,label}] (id 는 a,b,c… 자동 부여). 빈 라벨 제거.
export function optionsFromLabels(labels) {
  const out = []
  let i = 0
  for (const raw of labels || []) {
    const label = String(raw ?? '').trim()
    if (!label) continue
    out.push({ id: String.fromCharCode(97 + i), label })
    i++
  }
  return out
}

// 집계 비율 계산(클라이언트 표시용, 서버 pulse_stats 와 동일 규칙).
export function computeRatios(byOption, total) {
  const t = total || (byOption || []).reduce((a, o) => a + (o.votes || 0), 0)
  return (byOption || []).map(o => ({
    ...o,
    ratio: t > 0 ? Math.round((o.votes || 0) * 1000 / t) / 10 : 0,
  }))
}
