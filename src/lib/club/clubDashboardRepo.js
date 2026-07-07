// FANCLUV — Club Executive Dashboard 데이터 레이어 (B2B 구단 고객).
//
// ⚠️ 핵심 원칙(보안): 구단(고객)에게는 **운영자가 검토한 AI 분석 결과 + 집계 KPI + 전달된
//    리포트**만 제공한다. 닉네임·댓글 원문·이메일·회원정보·설문 원본·신고 내용 등
//    **원본 팬 데이터는 절대 노출하지 않는다.** 모든 조회는 자기 구단(clubId)으로 한정한다.
//
// 흐름: 팬 의견 → AI 분석 → (운영자 검토) → 이 레이어(집계/요약) → 구단 Dashboard
import { TEAMS } from '../../teams.jsx'
import { getKpis } from '../kpi/kpiEngine.js'
import { getKpisWithChange, getKpiHistory } from '../kpi/kpiHistoryRepo.js'
import { getLatestInsight } from '../ai/analyzeFanInsights.js'
import { getClubActionEffects } from '../admin/actionTracker.js'
import { listDeliveredReports } from '../admin/clubReportsRepo.js'
import { isAdmin, isClub, getClubId } from '../auth.js'

// 접근 제어: 관리자(모든 구단 확인 가능) 또는 자기 구단 계정만.
function canAccess(clubId) {
  return isAdmin() || (isClub() && getClubId() === clubId)
}

// AI 인사이트 → 구단 노출용으로 **정제**. 원본 의견 제목/작성자 등은 제거하고
// 검토된 요약·감정·키워드(태그)·추천·카테고리 이슈만 남긴다.
function sanitizeInsight(insight) {
  if (!insight) return null
  const d = insight.details || {}
  return {
    summary: insight.summary || '',
    sentiment: {
      positive: insight.sentiment_positive || 0,
      neutral: insight.sentiment_neutral || 0,
      negative: insight.sentiment_negative || 0,
    },
    keywords: (insight.keywords || []).slice(0, 8).map(k => String(k.tag || k).replace(/^#/, '')),
    recommendations: (insight.recommendations || []).slice(0, 4).map((r, i) => ({ rank: r.rank || i + 1, title: r.title || String(r), desc: r.desc || '' })),
    categoryIssues: (d.categoryIssues || []).map(c => ({ category: c.category, issue: c.issue || '' })),
    staffMemo: d.staffMemo || '',
    createdAt: insight.created_at || insight.period || null,
  }
}

// Executive Brief(요구사항 2) — AI 자동 생성 형태의 3문장 브리프.
function buildExecutiveBrief(kpi, effects, teamName) {
  const lines = []
  const sd = kpi?.change?.satisfaction
  if (sd != null && sd !== 0) {
    lines.push(`이번 주 ${teamName} 팬 만족도는 지난주 대비 ${Math.abs(sd)}점 ${sd > 0 ? '상승' : '하락'}했습니다.`)
  } else {
    lines.push(`이번 주 ${teamName} 팬 만족도는 ${kpi?.satisfaction ?? '-'}점으로 큰 변화가 없습니다.`)
  }
  // 효과적인 최근 조치 → 주요 원인
  const good = (effects || []).filter(e => e.rating === 'excellent' || e.rating === 'effective').slice(0, 2)
  if (good.length) lines.push(`주요 원인은 ${good.map(e => e.action.title).join(', ')}(으)로 분석됩니다.`)
  // 개선 우선 항목 = 점수 가장 낮은 카테고리
  const cats = (kpi?.categories || []).filter(c => c.score != null)
  if (cats.length) {
    const worst = cats.slice().sort((a, b) => a.score - b.score)[0]
    lines.push(`현재 가장 우선적으로 개선이 필요한 항목은 ${worst.name}입니다.`)
  }
  return lines
}

// ── Club Executive Dashboard 종합 데이터 ──
export async function getClubDashboard(clubId) {
  if (!clubId || !canAccess(clubId)) return { ok: false, code: 'forbidden' }
  const team = TEAMS.find(t => t.id === clubId)
  const teamName = team?.name || clubId
  const [kpi, insightRaw, effects] = await Promise.all([
    getKpisWithChange(clubId).catch(() => null),
    getLatestInsight(clubId).catch(() => null),
    getClubActionEffects(clubId, { periodDays: 90 }).catch(() => []),
  ])
  return {
    ok: true,
    clubId, teamName, team,
    kpi,
    insight: sanitizeInsight(insightRaw),
    brief: buildExecutiveBrief(kpi, effects, teamName),
    effects: effects.slice(0, 4),
  }
}

// ── KPI Trend(요구사항 6): 기간별 KPI 변화 (week/month/3m/season) ──
export async function getKpiTrend(clubId, period = '3m') {
  if (!clubId || !canAccess(clubId)) return []
  const limitMap = { week: 1, month: 5, '3m': 13, season: 40 }
  const history = await getKpiHistory(clubId, limitMap[period] || 13)
  const rows = history.slice().reverse().map(h => ({
    week: h.week, satisfaction: h.satisfaction, nps: h.nps,
    complaintIndex: h.complaintIndex, engagement: h.engagement, participationRate: h.participationRate,
  }))
  // 히스토리가 비면 현재 KPI 1점이라도 반환(빈 화면 방지).
  if (rows.length === 0) {
    const cur = await getKpis(clubId).catch(() => null)
    if (cur) rows.push({ week: cur.week, satisfaction: cur.satisfaction, nps: cur.nps, complaintIndex: cur.complaintIndex, engagement: cur.engagement, participationRate: cur.participationRate })
  }
  return rows
}

// ── Report Center(요구사항 8): 전달된 리포트만 ──
export async function getClubReports(clubId) {
  if (!clubId || !canAccess(clubId)) return []
  return listDeliveredReports(clubId)
}

// ── Benchmark(요구사항 9): 우리 구단 vs 리그 평균 (다른 구단 상세 비공개) ──
export async function getBenchmark(clubId) {
  if (!clubId || !canAccess(clubId)) return null
  // 리그 평균 = 전 구단 KPI 평균(집계 수치만). 개별 구단 KPI 는 노출하지 않는다.
  const all = await Promise.all(TEAMS.map(async t => ({ id: t.id, kpi: await getKpis(t.id).catch(() => null) })))
  const valid = all.filter(x => x.kpi).map(x => x.kpi)
  const own = all.find(x => x.id === clubId)?.kpi || await getKpis(clubId).catch(() => null)
  const avg = key => valid.length ? Math.round(valid.reduce((s, k) => s + (k[key] || 0), 0) / valid.length) : 0
  const metrics = [
    { key: 'satisfaction', invert: false },
    { key: 'nps', invert: false },
    { key: 'complaintIndex', invert: true },
    { key: 'engagement', invert: false },
    { key: 'participationRate', invert: false },
  ].map(m => {
    const league = avg(m.key)
    const ours = own?.[m.key] ?? 0
    return { key: m.key, own: ours, league, delta: ours - league, invert: m.invert }
  })
  return { metrics }
}
