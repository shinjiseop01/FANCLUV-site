// FANCLUV — Club Action Tracker 분석 엔진.
//
// FANCLUV 핵심 루프의 마지막 단계: 구단 Action 의 조치 전(before)·후(after) KPI 를 비교해
// "실제 효과가 있었는지"를 데이터로 검증한다.
//   팬 의견 → AI 분석 → 구단 Action(before KPI 스냅샷) → KPI 변화(after) → AI 효과 분석
//
// 각 Action 에 대해: 전후 KPI 변화량, AI 효과 분석(규칙 기반 서술), 영향 카테고리,
// 효과 평가 등급, Club Intelligence Score(종합 점수), 관련 데이터 연결(인사이트/리포트/
// 주차/의견/설문/KPI 히스토리)을 계산한다. Supabase/Mock 공통(clubActionsRepo 경유).
import { adminListActions, listActionsForClub } from './clubActionsRepo.js'
import { getKpis } from '../kpi/kpiEngine.js'
import { getKpiHistory } from '../kpi/kpiHistoryRepo.js'
import { listOpinions } from '../opinionsRepo.js'
import { countSurveyResponses } from '../surveysRepo.js'

// 기간 옵션(요구사항 8): 1주/2주/1개월/3개월. 값 = 일수.
export const TRACKER_PERIODS = [
  { key: '1w', days: 7, labelKey: 'admin.tracker.p1w' },
  { key: '2w', days: 14, labelKey: 'admin.tracker.p2w' },
  { key: '1m', days: 30, labelKey: 'admin.tracker.p1m' },
  { key: '3m', days: 90, labelKey: 'admin.tracker.p3m' },
]
// 효과 평가 등급(요구사항 9)
export const RATINGS = ['excellent', 'effective', 'no_change', 'monitor']

const CAT_KO = { match: '경기 운영', ticket: '티켓', md: 'MD', store: '매점', stadium: '경기장', event: '이벤트', marketing: '마케팅', fanservice: '팬서비스', squad: '선수단', etc: '기타' }
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)))

// 비교 대상 KPI 지표(방향: complaintIndex 는 낮을수록 좋음 → improve = -delta)
const METRICS = [
  { key: 'satisfaction', invert: false },
  { key: 'complaintIndex', invert: true },
  { key: 'engagement', invert: false },
  { key: 'nps', invert: false },
  { key: 'participationRate', invert: false },
  { key: 'recommendation', invert: false },
]

function computeDeltas(before, after) {
  const d = {}
  for (const m of METRICS) d[m.key] = (after?.[m.key] ?? 0) - (before?.[m.key] ?? 0)
  return d
}

// AI 효과 분석(규칙 기반 서술 — 요구사항 5). 가장 큰 변화 위주로 1~3문장 생성.
function buildAiEffect(action, deltas) {
  const cat = CAT_KO[action.category] || '해당'
  const sd = deltas.satisfaction, cd = deltas.complaintIndex, ed = deltas.engagement
  const lines = []
  if (Math.abs(sd) >= 2) lines.push(`${cat} 조치 이후 팬 만족도가 ${sd > 0 ? '+' : ''}${sd}점 ${sd > 0 ? '상승' : '하락'}했습니다.`)
  if (cd <= -2) lines.push(`${cat} 관련 불만 지수가 ${Math.abs(cd)}점 감소했습니다.`)
  else if (cd >= 2) lines.push(`불만 지수가 ${cd}점 증가해 추가 점검이 필요합니다.`)
  if (ed >= 2) lines.push(`팬 참여도가 ${ed}점 상승했습니다.`)
  if (!lines.length) lines.push('조치 전후 KPI 변화가 크지 않아 추가 모니터링이 필요합니다.')
  return lines
}

// 영향 카테고리(요구사항 6): before/after 카테고리 스냅샷의 점수 변화 상위.
function impactedCategories(before, after) {
  const b = {}, a = {}
  for (const c of (before?.categories || [])) b[c.key] = c
  for (const c of (after?.categories || [])) a[c.key] = c
  const keys = new Set([...Object.keys(b), ...Object.keys(a)])
  const rows = []
  for (const k of keys) {
    const bs = b[k]?.score, as = a[k]?.score
    if (bs == null && as == null) continue
    const name = a[k]?.name || b[k]?.name || k
    const scoreDelta = (as ?? bs ?? 0) - (bs ?? as ?? 0)
    const negDelta = (a[k]?.negative ?? 0) - (b[k]?.negative ?? 0)
    rows.push({ key: k, name, scoreDelta, negativeDelta: negDelta, count: (a[k]?.count ?? b[k]?.count ?? 0) })
  }
  return rows.sort((x, y) => Math.abs(y.scoreDelta) - Math.abs(x.scoreDelta)).slice(0, 5)
}

// Club Intelligence Score(요구사항 11): 만족도·불만감소·참여증가·참여율·추천/AI반영 종합.
function intelligenceScore(action, before, after, deltas) {
  if (!before || !after) return null
  const sd = deltas.satisfaction, cd = deltas.complaintIndex, ed = deltas.engagement, rd = deltas.recommendation
  let score = 50
  score += sd * 1.5              // Fan Satisfaction 변화
  score += (-cd) * 1.0           // Complaint 감소
  score += ed * 1.0              // Engagement 증가
  score += rd * 0.5              // Recommendation 변화
  score += (after.participationRate - 50) * 0.2  // 참여율 수준
  if (action.aiInsightId) score += 5             // AI 인사이트 기반 조치(추천 반영) 가점
  return clamp(score)
}

// 효과 평가 등급(요구사항 9)
function effectivenessRating(deltas, score) {
  if (score == null) return 'monitor'
  const sd = deltas.satisfaction, cd = deltas.complaintIndex
  if (score >= 78 && sd >= 5) return 'excellent'
  if (score >= 60 && (sd > 0 || cd < 0)) return 'effective'
  if (Math.abs(sd) <= 3 && Math.abs(cd) <= 3) return 'no_change'
  return 'monitor'
}

// 구단별 관련 데이터 카운트 캐시(의견/설문/KPI 히스토리).
async function clubContext(clubId, cache) {
  if (cache.has(clubId)) return cache.get(clubId)
  const [current, opinions, surveyCount, history] = await Promise.all([
    getKpis(clubId).catch(() => null),
    listOpinions(clubId === 'all' ? 'seoul' : clubId).catch(() => []),
    countSurveyResponses(clubId).catch(() => 0),
    getKpiHistory(clubId, 12).catch(() => []),
  ])
  const ctx = { current, opinionsCount: opinions.length, surveyCount, historyCount: history.length }
  cache.set(clubId, ctx)
  return ctx
}

function withinPeriod(actions, periodDays) {
  if (!periodDays) return actions
  const cutoff = Date.now() - periodDays * 86400000
  return actions.filter(a => {
    const d = a.actionDate ? new Date(a.actionDate).getTime() : new Date(a.createdAt).getTime()
    return !isNaN(d) && d >= cutoff
  })
}

// 액션 배열 → 효과 계산 결과 배열(공통 로직).
async function computeEffects(list) {
  const cache = new Map()
  const results = []
  for (const a of list) {
    const ctx = await clubContext(a.clubId, cache)
    const before = a.beforeKpi
    // after 는 명시 기록(afterKpi) 우선, 없으면 현재 KPI 로 비교.
    const after = a.afterKpi || ctx.current
    const usingCurrent = !a.afterKpi
    const deltas = computeDeltas(before, after)
    const score = intelligenceScore(a, before, after, deltas)
    results.push({
      action: a,
      before, after, usingCurrent,
      deltas,
      aiEffect: buildAiEffect(a, deltas),
      impacted: impactedCategories(before, after),
      intelligenceScore: score,
      rating: effectivenessRating(deltas, score),
      related: {
        aiInsight: !!a.aiInsightId,
        week: a.week || null,
        report: a.reportId || null,
        kpiHistory: ctx.historyCount,
        opinions: ctx.opinionsCount,
        surveys: ctx.surveyCount,
      },
    })
  }
  return results
}

// ── Action 효과 목록(관리자 — 타임라인 순) ──
// filters: { clubId, category, periodDays } — periodDays 로 최근 기간만.
export async function getActionEffects(filters = {}) {
  const { periodDays, ...rest } = filters
  const actions = await adminListActions(rest)
  return computeEffects(withinPeriod(actions, periodDays))
}

// ── 구단(고객) 전용: 자기 구단 액션 효과만 ──
export async function getClubActionEffects(clubId, { periodDays } = {}) {
  const actions = await listActionsForClub(clubId)
  return computeEffects(withinPeriod(actions, periodDays))
}

// 대시보드용 최근 효과 요약(상위 N개).
export async function getRecentActionEffects(limit = 3) {
  const all = await getActionEffects({})
  return all.slice(0, limit)
}
