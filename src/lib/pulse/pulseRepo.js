// FANCLUV — Fan Pulse repository. Supabase(0062 RPC/RLS) 또는 Mock.
//
// 팬: listActivePulses / vote / getStats(공개)
// 관리자: adminListPulses / createPulse / setPulseStatus / deletePulse / pulseDashboard
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { validateOptions } from './pulseStatus.js'
import { logger } from '../logger.js'

async function rpc(fn, args) {
  if (!isSupabaseConfigured) return { ok: false, code: 'not_configured' }
  const { data, error } = await supabase.rpc(fn, args)
  if (error) { logger.warn('pulse rpc 실패', { fn, error }); return { ok: false, code: 'rpc_error' } }
  return data || { ok: false, code: 'no_data' }
}

// ── Mock 저장소(로컬 dev) ──
let mockTopics = []
let mockVotes = []   // {topic_id, di, option_id}

// ── 팬 API ──
// 팬 목록: active + closed(공개)만. status='active'|'closed' 로 좁힐 수 있음.
export async function listPulses({ teamId = null, status = null } = {}) {
  if (isSupabaseConfigured) {
    let q = supabase.from('pulse_topics').select('*').eq('visibility', 'public').order('created_at', { ascending: false })
    if (status === 'active' || status === 'closed') q = q.eq('status', status)
    else q = q.in('status', ['active', 'closed'])
    if (teamId) q = q.or(`team_id.eq.${teamId},team_id.is.null`)
    const { data, error } = await q
    if (error) return []
    return data || []
  }
  return mockTopics.filter(t => t.visibility === 'public'
    && (status ? t.status === status : ['active', 'closed'].includes(t.status))
    && (!teamId || !t.team_id || t.team_id === teamId))
}
export async function listActivePulses(teamId = null) { return listPulses({ teamId, status: 'active' }) }

export async function getPulse(id) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('pulse_topics').select('*').eq('id', id).maybeSingle()
    if (error) return null
    return data
  }
  return mockTopics.find(t => t.id === id) || null
}

// 내 투표 여부(RLS: 본인 것만). 반환 { voted, optionId }
export async function getMyVote(topicId) {
  if (isSupabaseConfigured) {
    const { data } = await supabase.from('pulse_votes').select('option_id').eq('topic_id', topicId).maybeSingle()
    return { voted: !!data, optionId: data?.option_id || null }
  }
  const v = mockVotes.find(x => x.topic_id === topicId && x.di === 'mockdi')
  return { voted: !!v, optionId: v?.option_id || null }
}

export async function vote(topicId, optionId) {
  if (isSupabaseConfigured) return rpc('pulse_vote', { p_topic: topicId, p_option: optionId })
  // Mock: DI 없는 로컬은 not_verified 로 취급(본인인증 필요 반영). 데모는 임의 di 로 1인1표.
  const di = 'mockdi'
  if (mockVotes.some(v => v.topic_id === topicId && v.di === di)) return { ok: false, code: 'already_voted' }
  mockVotes.push({ topic_id: topicId, di, option_id: optionId })
  return { ok: true, code: 'voted' }
}

export async function getStats(topicId) {
  if (isSupabaseConfigured) return rpc('pulse_stats', { p_topic: topicId })
  const t = mockTopics.find(x => x.id === topicId)
  if (!t) return { ok: false, code: 'not_found' }
  const votes = mockVotes.filter(v => v.topic_id === topicId)
  const total = votes.length
  return {
    ok: true, topic_id: topicId, status: t.status, total,
    by_option: t.options.map(o => {
      const c = votes.filter(v => v.option_id === o.id).length
      return { id: o.id, label: o.label, votes: c, ratio: total ? Math.round(c * 1000 / total) / 10 : 0 }
    }),
    by_age: {}, by_gender: {}, hourly: [],
  }
}

// ── 관리자 API ──
export async function createPulse({ question, options, team = null, endsAt = null, visibility = 'public' }) {
  const v = validateOptions(options)
  if (!v.ok) return { ok: false, code: v.code }
  if (isSupabaseConfigured) {
    return rpc('pulse_create', { p_question: question, p_options: options, p_team: team, p_ends_at: endsAt, p_visibility: visibility })
  }
  const id = 'pt' + Date.now()
  mockTopics = [{ id, question, options, team_id: team, status: 'active', visibility, ends_at: endsAt, created_at: new Date().toISOString() }, ...mockTopics]
  return { ok: true, code: 'created', topic_id: id }
}

export async function adminListPulses({ status = null, team = null, page = 1, pageSize = 20 } = {}) {
  if (isSupabaseConfigured) {
    let q = supabase.from('pulse_topics').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    if (status) q = q.eq('status', status)
    if (team) q = q.eq('team_id', team)
    const from = (Math.max(1, page) - 1) * pageSize
    q = q.range(from, from + pageSize - 1)
    const { data, error, count } = await q
    if (error) return { items: [], total: 0 }
    return { items: data || [], total: count || 0 }
  }
  let items = mockTopics.slice()
  if (status) items = items.filter(t => t.status === status)
  if (team) items = items.filter(t => t.team_id === team)
  const start = (Math.max(1, page) - 1) * pageSize
  return { items: items.slice(start, start + pageSize), total: items.length }
}

export async function setPulseStatus(topicId, to) {
  if (isSupabaseConfigured) return rpc('pulse_set_status', { p_topic: topicId, p_to: to })
  mockTopics = mockTopics.map(t => (t.id === topicId ? { ...t, status: to } : t))
  return { ok: true, code: to }
}

export async function deletePulse(topicId) {
  if (isSupabaseConfigured) return rpc('pulse_delete', { p_topic: topicId })
  mockTopics = mockTopics.filter(t => t.id !== topicId)
  mockVotes = mockVotes.filter(v => v.topic_id !== topicId)
  return { ok: true, code: 'deleted' }
}

export async function pulseDashboard() {
  if (isSupabaseConfigured) {
    const data = await rpc('pulse_dashboard', { p_limit: 5 })
    return data && data.ok !== false ? data : null
  }
  const c = (s) => mockTopics.filter(t => t.status === s).length
  return { ok: true, active: c('active'), closed: c('closed'), archived: c('archived'),
    total_votes: mockVotes.length, participants: new Set(mockVotes.map(v => v.di)).size,
    today_votes: mockVotes.length, recent: [], trending: [] }
}

export async function getTrending(limit = 5) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('pulse_trending').select('*').limit(limit)
    if (error) return []
    return data || []
  }
  return []
}
