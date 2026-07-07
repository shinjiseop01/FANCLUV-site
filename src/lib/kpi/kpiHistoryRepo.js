// FANCLUV — KPI 히스토리 repository (Supabase-우선 + Mock 폴백).
//
// 주차별 KPI 스냅샷을 저장/조회하고, 현재 KPI 에 "지난주 대비 변화량"을 병합한다.
// 향후 Club Action Tracker 의 "조치 전 → 조치 후" 비교에 이 히스토리를 사용한다.
//   - Supabase: club_kpi_history 테이블(0023).
//   - Mock: localStorage(`fancluv_kpi_history`).
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { isAdmin } from '../auth.js'
import { getKpis } from './kpiEngine.js'

const KEY = 'fancluv_kpi_history'
const CHANGE_KEYS = ['satisfaction', 'nps', 'complaintIndex', 'engagement', 'participationRate', 'recommendation']

function readMock() { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
function writeMock(m) { try { localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* ignore */ } }

function toRow(clubId, k) {
  return {
    club_id: clubId, week: k.week,
    satisfaction: k.satisfaction, positive: k.sentiment.positive, neutral: k.sentiment.neutral, negative: k.sentiment.negative,
    nps: k.nps, complaint_index: k.complaintIndex, engagement: k.engagement,
    participation_rate: k.participationRate, recommendation: k.recommendation,
    categories: k.categories, sample_size: k.sampleSize,
  }
}
function fromRow(r) {
  return {
    week: r.week, satisfaction: r.satisfaction,
    sentiment: { positive: r.positive, neutral: r.neutral, negative: r.negative },
    nps: r.nps, complaintIndex: r.complaint_index, engagement: r.engagement,
    participationRate: r.participation_rate, recommendation: r.recommendation,
    categories: r.categories || [], sampleSize: r.sample_size || {}, createdAt: r.created_at,
  }
}

// ── 주차별 히스토리 조회(최신순) ──
export async function getKpiHistory(clubId = 'all', limit = 12) {
  if (isSupabaseConfigured) {
    const { data } = await supabase.from('club_kpi_history').select('*')
      .eq('club_id', clubId).order('week', { ascending: false }).limit(limit)
    return (data || []).map(fromRow)
  }
  const list = (readMock()[clubId] || []).slice().sort((a, b) => String(b.week).localeCompare(String(a.week)))
  return list.slice(0, limit)
}

// ── 주차 KPI 저장(같은 주차면 갱신) ──
export async function saveWeeklyKpi(clubId = 'all', kpis) {
  const k = kpis || await getKpis(clubId)
  if (isSupabaseConfigured) {
    if (!isAdmin()) return { ok: false, error: 'forbidden' }
    const { error } = await supabase.from('club_kpi_history').upsert(toRow(clubId, k), { onConflict: 'club_id,week' })
    return { ok: !error, error: error?.message }
  }
  const all = readMock()
  const list = (all[clubId] || []).filter(w => w.week !== k.week)
  list.unshift(fromRow(toRow(clubId, k)))
  all[clubId] = list.slice(0, 52)
  writeMock(all)
  return { ok: true }
}

// ── 현재 KPI + 지난주 대비 변화량 ──
// 반환: { ...kpis, change: { satisfaction:+6, ... }, previousWeek, topicTrend(방향 포함) }
export async function getKpisWithChange(clubId = 'all') {
  const current = await getKpis(clubId)
  const history = await getKpiHistory(clubId, 4)
  // 현재 주차와 다른 가장 최근 스냅샷 = 지난주 기준.
  const prev = history.find(h => h.week !== current.week) || null

  const change = {}
  for (const key of CHANGE_KEYS) {
    change[key] = prev != null && prev[key] != null ? (current[key] - prev[key]) : null
  }

  // 카테고리/토픽 방향(상승/하강/유지)
  const prevCatMap = {}
  for (const c of (prev?.categories || [])) prevCatMap[c.key] = c.score
  const topicTrend = current.topicTrend.map(t => {
    const before = prevCatMap[t.key]
    const dir = before == null || t.score == null ? 'flat' : t.score > before + 1 ? 'up' : t.score < before - 1 ? 'down' : 'flat'
    return { ...t, direction: dir, delta: before != null && t.score != null ? t.score - before : null }
  })
  const categories = current.categories.map(c => {
    const before = prevCatMap[c.key]
    return { ...c, change: before != null && c.score != null ? c.score - before : null }
  })

  return { ...current, categories, topicTrend, change, previousWeek: prev?.week || null }
}

// KPI 계산 + 저장 + 변화량까지 한 번에(리포트/대시보드 진입점).
export async function computeAndRecordKpis(clubId = 'all', { record = true } = {}) {
  const withChange = await getKpisWithChange(clubId)
  if (record) { try { await saveWeeklyKpi(clubId, withChange) } catch { /* 저장 실패는 무시 */ } }
  return withChange
}
