// FANCLUV — Quick Poll 순수 로직(상태/옵션/결과공개/voter/컨텍스트). 서버(0064)와 규칙 동일.

export const QP_STATES = ['draft', 'active', 'closed', 'archived']
export const QP_CONTEXT_TYPES = ['home', 'news', 'match', 'opinion', 'standalone']
export const QP_RESULT_VIS = ['always', 'after_vote', 'after_close']

// 상태 전이 — quick_poll_set_status RPC 와 1:1.
export const QP_TRANSITIONS = {
  draft: ['active', 'archived'],
  active: ['closed', 'archived'],
  closed: ['active', 'archived'],
  archived: ['draft'],
}
export const QP_STATUS_META = {
  draft: { tone: 'muted', labelKey: 'qp.st.draft' },
  active: { tone: 'ok', labelKey: 'qp.st.active' },
  closed: { tone: 'muted', labelKey: 'qp.st.closed' },
  archived: { tone: 'warn', labelKey: 'qp.st.archived' },
}

export function canTransition(from, to) { return (QP_TRANSITIONS[from] || []).includes(to) }
export function transitionAction(to) {
  return to === 'active' ? 'quick_poll.activate' : to === 'closed' ? 'quick_poll.close'
    : to === 'archived' ? 'quick_poll.archive' : to === 'draft' ? 'quick_poll.restore' : null
}

// 선택지 2~4, {id,label} 비어있지 않음, id 중복 금지, 순서 유지.
export function validateOptions(options) {
  if (!Array.isArray(options)) return { ok: false, code: 'invalid_options' }
  if (options.length < 2 || options.length > 4) return { ok: false, code: 'invalid_options' }
  const ids = new Set()
  for (const o of options) {
    const id = String(o?.id ?? '').trim(); const label = String(o?.label ?? '').trim()
    if (!id || !label) return { ok: false, code: 'empty_option' }
    if (ids.has(id)) return { ok: false, code: 'dup_option' }
    ids.add(id)
  }
  return { ok: true }
}
export function optionsFromLabels(labels) {
  const out = []; let i = 0
  for (const raw of labels || []) {
    const label = String(raw ?? '').trim(); if (!label) continue
    out.push({ id: String.fromCharCode(97 + i), label }); i++
  }
  return out
}

// context_type 별 context_id 필요 여부(클라 선검증; 서버가 최종).
export function contextNeedsId(contextType) { return contextType === 'news' || contextType === 'opinion' }
export function validateContext(contextType, contextId) {
  if (!QP_CONTEXT_TYPES.includes(contextType)) return { ok: false, code: 'invalid_context_type' }
  if (contextType === 'match') return { ok: false, code: 'match_unavailable' } // provider 미연동
  if (contextNeedsId(contextType) && !contextId) return { ok: false, code: 'invalid_context' }
  return { ok: true }
}

// voter 모드(순수, UI 힌트용): DI 있으면 di, 없으면 user. 서버가 voter_key 를 최종 생성.
export function voterMode(profile) { return profile?.identityDiHash || profile?.identity_di_hash ? 'di' : 'user' }

// 결과 공개 여부(서버 show_results 와 동일 규칙).
export function shouldShowResults({ resultVisibility, allowResultBeforeVote, hasVoted, status, isAdmin }) {
  if (isAdmin || allowResultBeforeVote) return true
  if (resultVisibility === 'always') return true
  if (resultVisibility === 'after_vote') return !!hasVoted
  if (resultVisibility === 'after_close') return status === 'closed' || status === 'archived'
  return false
}

export function computeRatios(byOption, total) {
  const t = total || (byOption || []).reduce((a, o) => a + (o.votes || 0), 0)
  return (byOption || []).map(o => ({ ...o, ratio: t > 0 ? Math.round((o.votes || 0) * 1000 / t) / 10 : 0 }))
}

// 남은 시간 라벨(순수). now 주입 가능(테스트).
export function remainingLabel(endsAt, t, now = Date.now()) {
  if (!endsAt) return null
  const ms = new Date(endsAt).getTime() - now
  if (ms <= 0) return t('qp.ended')
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24)
  if (d > 0) return t('qp.dleft', { n: d })
  if (h > 0) return t('qp.hleft', { n: h })
  return t('qp.mleft', { n: Math.max(1, Math.floor(ms / 60000)) })
}

// 서버 vote 응답코드 → i18n 키(내부오류 미노출).
export function voteErrorKey(code) {
  const m = {
    already_voted: 'qp.err.already_voted', not_active: 'qp.err.not_active', expired: 'qp.err.expired',
    unauthorized: 'qp.err.login', invalid_option: 'qp.err.invalid_option', not_found: 'qp.err.not_found',
  }
  return m[code] || 'qp.err.generic'
}
