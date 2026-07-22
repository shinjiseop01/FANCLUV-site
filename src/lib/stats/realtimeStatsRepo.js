// FANCLUV — 실시간 통계 리포지토리(dual-mode: Supabase RPC / 결정론적 Mock).
//
// 정책: 원본 전체 scan 없이 사전집계 RPC(0069)만 호출. 통계 종류별 캐시 TTL 분리(§13).
// 개인 민감 상태는 공용 캐시에 저장하지 않는다(집계는 비식별 공개값). Mock 은 결정론적
// 샘플(새로고침해도 큰 변화 없음, §25). Production 에서 Mock 통계는 노출하지 않는다
// (isSupabaseConfigured=true 이면 실제 RPC).
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { withCache, invalidate, getCacheStats } from '../cache.js'
import { statsCacheKey, teamCachePrefix } from './statsMetrics.js'
import { logger } from '../logger.js'

// 통계 종류별 TTL(ms).
export const STATS_TTL = { summary: 30_000, timeseries: 60_000, activity: 20_000, admin: 30_000, settings: 60_000 }

// ── 결정론적 Mock(개발 모드) ─────────────────────────────────────────
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) } return Math.abs(h) }
function mockTeamStats(teamId) {
  const s = hash(teamId || 'demo')
  const op = 40 + (s % 60), li = 120 + (s % 200), co = 20 + (s % 80)
  return {
    ok: true, team_id: teamId, opinions_total: op, likes_total: li, comments_total: co,
    survey_responses_total: 10 + (s % 30), quick_poll_votes_total: 25 + (s % 40),
    average_rating: Math.round((30 + (s % 20)) / 10 * 100) / 100, rating_count: op,
    active_users_24h: 15 + (s % 40), opinions_today: s % 8, likes_today: s % 20, comments_today: s % 6,
    sentiment: { positive: 45 + (s % 20), neutral: 30, negative: 10 + (s % 10), total: 90, period: 'week' },
    updated_at: new Date().toISOString(), has_data: true, _mock: true,
  }
}
function mockTimeseries(metric, bucket) {
  const base = hash(metric + bucket)
  const now = Date.now(), stepMs = bucket === 'hour' ? 3600e3 : 86400e3
  const points = Array.from({ length: bucket === 'hour' ? 24 : 14 }, (_, i) => ({
    t: new Date(now - (13 - i) * stepMs).toISOString(), v: (base + i * 7) % 40,
  }))
  return { ok: true, metric, bucket, points, _mock: true }
}
function mockActivity() {
  return { ok: true, items: Array.from({ length: 6 }, (_, i) => ({
    type: ['opinion', 'like', 'comment', 'quick_poll_vote'][i % 4], entity_type: 'opinion',
    title: `샘플 활동 ${i + 1}`, created_at: new Date(Date.now() - i * 3600e3).toISOString(),
  })), _mock: true }
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) { logger.warn(`stats rpc ${name} 실패`, { error }); return { ok: false, code: 'error' } }
  return data
}

// ── 팬 공개 통계(summary) ────────────────────────────────────────────
export function getTeamStats(teamId, { role = 'fan', force = false } = {}) {
  const key = statsCacheKey({ scope: 'summary', teamId, role })
  if (force) invalidate(key)
  return withCache(key, () => isSupabaseConfigured
    ? rpc('get_team_realtime_stats', { p_team_id: teamId })
    : Promise.resolve(mockTeamStats(teamId)), STATS_TTL.summary)
}

// 구단/관리자 확장(부정 비중 등).
export function getClubTeamStats(teamId, { force = false } = {}) {
  const key = statsCacheKey({ scope: 'club', teamId, role: 'club' })
  if (force) invalidate(key)
  return withCache(key, () => isSupabaseConfigured
    ? rpc('get_club_team_stats', { p_team_id: teamId })
    : Promise.resolve({ ...mockTeamStats(teamId), negative_ratio: 0.12, scope: 'club' }), STATS_TTL.summary)
}

export function getTimeseries(teamId, metric, bucket = 'day', { from = null, to = null, limit = 100 } = {}) {
  const key = statsCacheKey({ scope: 'ts', teamId, metric, bucket, period: `${from || ''}~${to || ''}` })
  return withCache(key, () => isSupabaseConfigured
    ? rpc('get_team_stats_timeseries', { p_team_id: teamId, p_metric: metric, p_bucket: bucket, p_from: from, p_to: to, p_limit: limit })
    : Promise.resolve(mockTimeseries(metric, bucket)), STATS_TTL.timeseries)
}

export function getActivityFeed(teamId, { limit = 20, before = null } = {}) {
  const key = statsCacheKey({ scope: 'feed', teamId, period: before || 'head' })
  return withCache(key, () => isSupabaseConfigured
    ? rpc('get_team_activity_feed', { p_team_id: teamId, p_limit: limit, p_before: before })
    : Promise.resolve(mockActivity()), STATS_TTL.activity)
}

export function getAdminDashboard(days = 7, { force = false } = {}) {
  const key = statsCacheKey({ scope: 'admin', teamId: '_all', role: 'admin', period: `${days}d` })
  if (force) invalidate(key)
  return withCache(key, () => isSupabaseConfigured
    ? rpc('get_admin_realtime_dashboard', { p_days: days })
    : Promise.resolve({ ok: true, _mock: true, summary: {
        new_opinions_today: 12, new_members_today: 5, likes_today: 88, comments_today: 21,
        survey_responses_today: 9, quick_poll_votes_today: 27, active_users_24h: 140 },
      teams: ['seoul', 'ulsan', 'jeonbuk'].map(t => ({ team_id: t, ...mockTeamStats(t), opinions: mockTeamStats(t).opinions_total })),
      recent_activity: mockActivity().items }), STATS_TTL.admin)
}

// 사용자 행동 후 필요한 팀 범위만 무효화(§13 — 전체 무효화 남발 금지).
export function invalidateTeamStats(teamId) { invalidate(teamCachePrefix(teamId)) }
export { getCacheStats }

// ── 관리자 운영(rebuild/refresh/verify/settings) ─────────────────────
export async function rebuildTeam(teamId) { return isSupabaseConfigured ? rpc('rebuild_team_realtime_stats', { p_team_id: teamId }) : { ok: true, _mock: true } }
export async function refreshTeam(teamId) { return isSupabaseConfigured ? rpc('refresh_team_realtime_stats', { p_team_id: teamId }) : { ok: true, _mock: true } }
export async function verifyConsistency(teamId) { return isSupabaseConfigured ? rpc('verify_team_stats_consistency', { p_team_id: teamId }) : { ok: true, consistent: true, drift: [], _mock: true } }
export async function getStatsSettings() { return isSupabaseConfigured ? rpc('get_realtime_stats_settings', {}) : { ok: true, enabled: true, refresh_interval_secs: 30, polling_interval_secs: 30, cache_ttl_secs: 30, min_aggregation: 5, _mock: true } }
export async function setStatsSettings(p) {
  if (!isSupabaseConfigured) return { ok: true, ...p, _mock: true }
  return rpc('set_realtime_stats_settings', { p_enabled: p.enabled ?? null, p_refresh: p.refresh ?? null, p_polling: p.polling ?? null, p_cache_ttl: p.cacheTtl ?? null, p_min_agg: p.minAgg ?? null })
}
export async function statsEnabled() {
  if (!isSupabaseConfigured) return true
  const { data, error } = await supabase.rpc('realtime_stats_enabled')
  if (error) return true
  return data !== false
}
