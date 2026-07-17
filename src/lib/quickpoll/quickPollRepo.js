// FANCLUV — Quick Poll repository. Supabase(0064 RPC/RLS) 또는 Mock.
//
// 팬: getForContext(임베드) / vote / getResults
// 관리자: adminList / create / setStatus / delete / dashboard / closeExpired
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { withCache } from '../cache.js'
import { validateOptions, validateContext } from './quickPollStatus.js'
import { logger } from '../logger.js'

async function rpc(fn, args) {
  if (!isSupabaseConfigured) return { ok: false, code: 'not_configured' }
  const { data, error } = await supabase.rpc(fn, args)
  if (error) { logger.warn('quick_poll rpc 실패', { fn, error }); return { ok: false, code: 'rpc_error' } }
  return data || { ok: false, code: 'no_data' }
}

// ── Mock 저장소 ──
let mockPolls = []
let mockVotes = [] // {poll_id, voter_key, option_id}

// ── 팬 API ──
// 콘텐츠 임베드 조회(캐시 60초, 중복 요청 방지). 없으면 { poll: null }.
export async function getForContext(contextType, contextId = null, teamId = null) {
  const key = `qp:${contextType}:${contextId || ''}:${teamId || ''}`
  return withCache(key, async () => {
    if (isSupabaseConfigured) {
      const r = await rpc('quick_poll_list_for_context', { p_context_type: contextType, p_context_id: contextId, p_team: teamId })
      return r?.ok ? (r.poll || null) : null
    }
    const p = mockPolls.find(x => x.status === 'active' && x.context_type === contextType &&
      (contextType === 'home' ? (x.team_id === teamId || !x.team_id) : x.context_id === contextId))
    return p ? { id: p.id, question: p.question, options: p.options, status: p.status, team_id: p.team_id, ends_at: p.ends_at, context_type: p.context_type } : null
  }, 60 * 1000)
}

export async function vote(pollId, optionId) {
  if (isSupabaseConfigured) return rpc('quick_poll_vote', { p_poll: pollId, p_option: optionId })
  const key = 'user:mock'
  if (mockVotes.some(v => v.poll_id === pollId && v.voter_key === key)) return { ok: false, code: 'already_voted' }
  mockVotes.push({ poll_id: pollId, voter_key: key, option_id: optionId })
  return { ok: true, code: 'voted' }
}

export async function getResults(pollId) {
  if (isSupabaseConfigured) return rpc('quick_poll_get_results', { p_poll: pollId })
  const p = mockPolls.find(x => x.id === pollId); if (!p) return { ok: false, code: 'not_found' }
  const votes = mockVotes.filter(v => v.poll_id === pollId); const total = votes.length
  const mine = votes.find(v => v.voter_key === 'user:mock')
  return { ok: true, poll_id: pollId, status: p.status, has_voted: !!mine, my_option: mine?.option_id || null, show_results: !!mine,
    total: mine ? total : null, by_option: mine ? p.options.map(o => { const c = votes.filter(v => v.option_id === o.id).length; return { id: o.id, label: o.label, votes: c, ratio: total ? Math.round(c * 1000 / total) / 10 : 0 } }) : null }
}

// ── 관리자 API ──
export async function create({ question, options, contextType, contextId = null, team = null, endsAt = null, visibility = 'public', allowResultBeforeVote = false, resultVisibility = 'after_vote' }) {
  const vo = validateOptions(options); if (!vo.ok) return { ok: false, code: vo.code }
  const vc = validateContext(contextType, contextId); if (!vc.ok) return { ok: false, code: vc.code }
  if (isSupabaseConfigured) {
    return rpc('quick_poll_create', { p_question: question, p_options: options, p_context_type: contextType, p_context_id: contextId,
      p_team: team, p_ends_at: endsAt, p_visibility: visibility, p_allow_result_before_vote: allowResultBeforeVote, p_result_visibility: resultVisibility })
  }
  const id = 'qp' + Date.now()
  mockPolls = [{ id, question, options, context_type: contextType, context_id: contextId, team_id: team, status: 'active', visibility, ends_at: endsAt, created_at: new Date().toISOString() }, ...mockPolls]
  return { ok: true, code: 'created', poll_id: id }
}

export async function adminList({ status = null, context = null, team = null, q = null, page = 1, pageSize = 20 } = {}) {
  if (isSupabaseConfigured) {
    const r = await rpc('quick_poll_admin_list', { p_status: status, p_context: context, p_team: team, p_q: q, p_limit: pageSize, p_offset: (Math.max(1, page) - 1) * pageSize })
    return r?.ok ? { items: r.items || [], total: r.total || 0 } : { items: [], total: 0 }
  }
  let items = mockPolls.slice()
  if (status) items = items.filter(p => p.status === status)
  if (context) items = items.filter(p => p.context_type === context)
  if (q) items = items.filter(p => (p.question || '').toLowerCase().includes(q.toLowerCase()))
  const start = (Math.max(1, page) - 1) * pageSize
  return { items: items.slice(start, start + pageSize), total: items.length }
}

export async function setStatus(pollId, to) {
  if (isSupabaseConfigured) return rpc('quick_poll_set_status', { p_poll: pollId, p_to: to })
  mockPolls = mockPolls.map(p => (p.id === pollId ? { ...p, status: to } : p)); return { ok: true, code: to }
}
export async function remove(pollId) {
  if (isSupabaseConfigured) return rpc('quick_poll_delete', { p_poll: pollId })
  mockPolls = mockPolls.filter(p => p.id !== pollId); mockVotes = mockVotes.filter(v => v.poll_id !== pollId); return { ok: true, code: 'deleted' }
}
export async function dashboard() {
  if (isSupabaseConfigured) { const d = await rpc('quick_poll_dashboard', { p_limit: 5 }); return d && d.ok !== false ? d : null }
  const c = (s) => mockPolls.filter(p => p.status === s).length
  return { ok: true, active: c('active'), closed: c('closed'), archived: c('archived'), total_votes: mockVotes.length,
    today_votes: mockVotes.length, participants: new Set(mockVotes.map(v => v.voter_key)).size, by_context: {}, ending_soon: [], top: [], recent: [] }
}
export async function closeExpired() {
  if (isSupabaseConfigured) return rpc('quick_poll_close_expired', {})
  return 0
}

// 관리자 context 대상 선택용: news(published) / opinion(visible) 목록. match 는 provider 미연동.
export async function listContextTargets(type) {
  if (!isSupabaseConfigured || (type !== 'news' && type !== 'opinion')) return []
  if (type === 'news') {
    const { data } = await supabase.from('team_news').select('id,title').eq('status', 'published').order('created_at', { ascending: false }).limit(50)
    return (data || []).map(n => ({ id: n.id, label: n.title }))
  }
  const { data } = await supabase.from('opinions').select('id,title').eq('status', 'published').order('created_at', { ascending: false }).limit(50)
  return (data || []).map(o => ({ id: o.id, label: o.title || o.id.slice(0, 8) }))
}
