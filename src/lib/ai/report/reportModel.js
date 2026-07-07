// FANCLUV — AI 리포트 데이터 모델.
//
// 저장된 AI 인사이트(analyzeFanInsights)와 관리자 집계(adminStats)를 모아
// PDF 생성기(generatePdf)가 그대로 그릴 수 있는 정규화된 리포트 모델을 만든다.
//
// 향후 확장(요구사항 13): periodType 으로 월간/분기/연간 리포트를 구분한다.
// 지금은 최신 인사이트 스냅샷을 기준으로 기간 라벨/파일명만 달라지지만,
// 기간별 데이터 소스가 생기면 buildReportModel 내부만 교체하면 된다.
import { getLatestInsight } from '../analyzeFanInsights.js'
import { getAdminDashboard } from '../../admin/adminStats.js'
import { computeAndRecordKpis } from '../../kpi/kpiHistoryRepo.js'
import { getTeam } from '../../../teams.jsx'

export const FANCLUV_PRIMARY = '#863BFF'

// 지원하는 리포트 기간 유형 (확장 지점)
export const REPORT_PERIODS = [
  { key: 'current', labelKey: 'aiReport.periodCurrent' },
  { key: 'monthly', labelKey: 'aiReport.periodMonthly' },
  { key: 'quarterly', labelKey: 'aiReport.periodQuarterly' },
  { key: 'yearly', labelKey: 'aiReport.periodYearly' },
]

function pad(n) { return String(n).padStart(2, '0') }
function fmtDate(d) {
  const x = d instanceof Date ? d : new Date(d)
  if (isNaN(x)) return String(d || '')
  return `${x.getFullYear()}.${pad(x.getMonth() + 1)}.${pad(x.getDate())}`
}

// 파일명 토큰: 월간=YYYY-MM, 분기=YYYY-Qn, 연간=YYYY (요구사항 12/13)
function fileToken(periodType, d) {
  const y = d.getFullYear()
  const q = Math.floor(d.getMonth() / 3) + 1
  if (periodType === 'yearly') return `${y}`
  if (periodType === 'quarterly') return `${y}-Q${q}`
  return `${y}-${pad(d.getMonth() + 1)}` // current, monthly
}

// 분석 기간 라벨 (표지에 표시)
function periodLabel(periodType, d) {
  const y = d.getFullYear()
  const q = Math.floor(d.getMonth() / 3) + 1
  if (periodType === 'yearly') return `${y}년`
  if (periodType === 'quarterly') return `${y}년 ${q}분기`
  if (periodType === 'monthly') return `${y}년 ${pad(d.getMonth() + 1)}월`
  return `~ ${fmtDate(d)}`
}

// 파일명용 팀 코드: 영문명에서 공백 제거 후 대문자 (FC Seoul → FCSEOUL)
function teamCode(team) {
  if (!team) return 'FANCLUV'
  return (team.nameEn || team.id).replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

// 저장된 리포트 문서(clubReportsRepo) → PDF 모델.
// 문서 content 에는 집계/요약 필드만 있으므로(개인정보 없음) 그대로 사용한다.
export function buildModelFromReportDoc(doc) {
  const team = getTeam(doc.teamId)
  const c = doc.content || {}
  const generatedAt = new Date()
  return {
    ok: true,
    isAll: !team,
    team: team
      ? { name: team.name, nameEn: team.nameEn, short: team.short, color: team.color, colorDeep: team.colorDeep }
      : { name: 'FANCLUV', nameEn: 'FANCLUV', short: '전체', color: FANCLUV_PRIMARY, colorDeep: FANCLUV_PRIMARY },
    generatedAt,
    generatedAtLabel: fmtDate(generatedAt),
    periodType: doc.periodType,
    periodLabel: doc.periodLabel || periodLabel(doc.periodType, generatedAt),
    fileName: `${teamCode(team)}_AI_Report_${fileToken(doc.periodType || 'monthly', generatedAt)}.pdf`,
    summary: c.summary || '',
    finalSummary: c.finalSummary || '',
    operatorComment: c.operatorComment || '',
    deliveryMemo: doc.deliveryMemo || c.deliveryMemo || '',
    sentiment: {
      positive: c.sentiment?.positive || 0,
      neutral: c.sentiment?.neutral || 0,
      negative: c.sentiment?.negative || 0,
    },
    keywords: (c.keywords || []).map((k, i) => ({ rank: i + 1, tag: k.tag, count: k.count || 0 })),
    categories: c.categories || [],
    satisfaction: Math.round(c.satisfaction || 0),
    kpiMetrics: c.kpiMetrics || null,
    suggestions: (c.suggestions || []).map((s, i) => ({ rank: s.rank || i + 1, title: s.title, desc: s.desc || '' })),
    kpi: c.kpi || { opinions: 0, comments: 0, members: 0, responses: 0, aiRunDate: '' },
  }
}

export async function buildReportModel({ clubId = 'all', periodType = 'monthly' } = {}) {
  const insight = await getLatestInsight(clubId)
  if (!insight) return { ok: false, code: 'no_insight' }

  const dash = await getAdminDashboard().catch(() => null)
  // 실제 KPI 엔진 결과(팬 의견/설문 기반) — 리포트에 실 KPI 표시 + 주차 히스토리 저장.
  const fanKpi = await computeAndRecordKpis(clubId).catch(() => null)
  const team = clubId && clubId !== 'all' ? getTeam(clubId) : null
  const d = insight.details || {}

  // KPI: 구단 선택 시 구단별 집계, 전체는 총계.
  let opinions = 0, comments = 0, members = 0, responses = 0
  if (team && dash) {
    const tb = (dash.teams || []).find(x => x.id === clubId) || {}
    opinions = tb.opinions ?? (d.opinionsCount || 0)
    comments = tb.comments ?? 0
    members = tb.members ?? 0
    responses = tb.responses ?? (d.surveysCount || 0)
  } else if (dash) {
    const k = dash.kpi || {}
    opinions = k.totalOpinions || 0
    comments = k.totalComments || 0
    members = k.totalMembers || 0
    responses = k.totalResponses || 0
  } else {
    opinions = d.opinionsCount || 0
    responses = d.surveysCount || 0
  }

  // TOP 10 키워드 (빈도 포함)
  const keywords = (insight.keywords || []).slice(0, 10).map((k, i) => ({
    rank: i + 1,
    tag: String(k.tag || k).replace(/^#/, ''),
    count: k._n ?? k.count ?? (k.weight ? k.weight * 10 : 0),
  }))

  // 주요 카테고리: KPI 엔진의 실제 카테고리 점수 우선(언급 많은 순), 없으면 AI 인사이트.
  const kpiCats = (fanKpi?.categories || []).filter(c => c.count > 0).sort((a, b) => b.count - a.count).slice(0, 6)
  const categories = kpiCats.length
    ? kpiCats.map(c => ({ name: c.name, note: `${c.score}/100 · ${c.count}건`, score: c.score, count: c.count }))
    : (d.categoryIssues && d.categoryIssues.length)
      ? d.categoryIssues.map(c => ({ name: c.category, note: c.issue || '' }))
      : (d.categorySat || []).map(c => ({ name: c.name, note: `평균 만족도 ${c.score}/5` }))

  // AI 개선 제안
  const suggestions = (insight.recommendations || []).map((r, i) => ({
    rank: r.rank || i + 1,
    title: r.title || String(r),
    desc: r.desc || '',
  }))

  const generatedAt = new Date()
  const analysisDate = insight.created_at ? new Date(insight.created_at) : generatedAt

  return {
    ok: true,
    isAll: !team,
    team: team
      ? { name: team.name, nameEn: team.nameEn, short: team.short, color: team.color, colorDeep: team.colorDeep }
      : { name: 'FANCLUV', nameEn: 'FANCLUV', short: '전체', color: FANCLUV_PRIMARY, colorDeep: FANCLUV_PRIMARY },
    generatedAt,
    generatedAtLabel: fmtDate(generatedAt),
    periodType,
    periodLabel: periodLabel(periodType, analysisDate),
    fileName: `${teamCode(team)}_AI_Report_${fileToken(periodType, analysisDate)}.pdf`,
    summary: insight.summary || '',
    // 감정/만족도는 KPI 엔진(실데이터) 우선, 표본 없으면 AI 인사이트로 폴백.
    sentiment: (fanKpi && fanKpi.sampleSize.rated > 0)
      ? { ...fanKpi.sentiment }
      : {
        positive: insight.sentiment_positive || 0,
        neutral: insight.sentiment_neutral || 0,
        negative: insight.sentiment_negative || 0,
      },
    keywords,
    categories,
    satisfaction: (fanKpi && fanKpi.sampleSize.rated > 0) ? fanKpi.satisfaction : Math.round(d.satisfaction ?? 0),
    // Fan Insight KPI Engine 핵심 지표(요구사항 1) + 지난주 대비 변화량.
    kpiMetrics: fanKpi ? {
      satisfaction: fanKpi.satisfaction,
      nps: fanKpi.nps,
      complaintIndex: fanKpi.complaintIndex,
      engagement: fanKpi.engagement,
      participationRate: fanKpi.participationRate,
      recommendation: fanKpi.recommendation,
      change: fanKpi.change || {},
      week: fanKpi.week,
    } : null,
    suggestions,
    kpi: {
      opinions, comments, members, responses,
      aiRunDate: fmtDate(analysisDate),
    },
  }
}
