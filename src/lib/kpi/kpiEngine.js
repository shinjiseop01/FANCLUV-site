// FANCLUV — Fan Insight KPI Engine.
//
// 팬 의견(rating/category/likes/comments)과 설문 응답(satisfaction/revisit)을 기반으로
// 구단이 매주 확인하는 핵심 KPI 를 실제 데이터로 계산한다. OpenAI/AI 분석과 독립적인
// 결정적(deterministic) 계산 엔진이다.
//
// 계산 KPI: Fan Satisfaction · Sentiment(pos/neu/neg) · NPS · Complaint Index ·
//           Engagement · Participation Rate · Recommendation · Topic Trend · 12개 카테고리 점수
//
// 데이터 소스는 Supabase-우선 + Mock 폴백(listOpinions/listSurveyResponses)을 그대로 사용한다.
import { listOpinions } from '../opinionsRepo.js'
import { listSurveyResponses, countSurveyResponses } from '../surveysRepo.js'
import { KPI_CATEGORIES, categorizeOpinion, CATEGORY_LABEL } from './kpiCategories.js'

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)))
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0)

// 불만 신호 키워드(Complaint Index 가중).
const COMPLAINT_WORDS = ['불편', '불만', '최악', '실망', '문제', '개선', '느리', '비싸', '별로', '엉망', '화나', '짜증', '항의']

// 현재 ISO 주차 문자열 (YYYY-Www)
export function currentWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// ── 순수 계산: 의견 + 설문응답 → KPI 객체 ──
export function computeKpis(opinions = [], responses = []) {
  const rated = opinions.filter(o => (o.rating || 0) > 0)
  const nRated = rated.length
  const surveySat = responses.map(r => Number(r.satisfaction)).filter(v => v > 0)

  // 감정 분포(별점 기반): 긍정 ≥4, 중립 =3, 부정 ≤2
  const pos = rated.filter(o => o.rating >= 4).length
  const neu = rated.filter(o => o.rating === 3).length
  const neg = rated.filter(o => o.rating <= 2).length
  let sPos = clamp(pct(pos, nRated)), sNeu = clamp(pct(neu, nRated)), sNeg = clamp(pct(neg, nRated))
  const drift = 100 - (sPos + sNeu + sNeg)
  if (nRated) sNeu = clamp(sNeu + drift)   // 반올림 보정

  // Fan Satisfaction (0~100): 의견 별점 평균 + 설문 만족도 블렌드
  const opAvg = nRated ? rated.reduce((s, o) => s + o.rating, 0) / nRated : 0
  const svAvg = surveySat.length ? surveySat.reduce((a, b) => a + b, 0) / surveySat.length : 0
  const blendAvg = (surveySat.length && nRated)
    ? (opAvg * nRated + svAvg * surveySat.length) / (nRated + surveySat.length)
    : (nRated ? opAvg : svAvg)
  const satisfaction = clamp(blendAvg * 20)

  // NPS (-100~100): 5점=추천, 4점=중립, ≤3=비추천. 설문 revisit(재방문의사)도 반영.
  const revisit = responses.map(r => Number(r.revisit)).filter(v => v > 0)
  const promoters = rated.filter(o => o.rating >= 5).length + revisit.filter(v => (v <= 5 ? v >= 5 : v >= 9)).length
  const detractors = rated.filter(o => o.rating <= 3).length + revisit.filter(v => (v <= 5 ? v <= 3 : v <= 6)).length
  const npsBase = nRated + revisit.length
  const nps = npsBase ? Math.round(pct(promoters, npsBase) - pct(detractors, npsBase)) : 0

  // Complaint Index (0~100): 부정 비율 + 불만 키워드 밀도
  const complaintHits = opinions.filter(o => {
    const t = `${o.title || ''} ${Array.isArray(o.body) ? o.body.join(' ') : o.body || ''}`
    return COMPLAINT_WORDS.some(w => t.includes(w))
  }).length
  const complaintIndex = clamp(sNeg * 0.65 + pct(complaintHits, opinions.length || 1) * 0.35)

  // Engagement Score (0~100): 의견당 상호작용(공감+댓글×2) 정규화. 목표 100 상호작용=만점.
  const totalInteraction = opinions.reduce((s, o) => s + (o.likes || 0) + (o.comments || 0) * 2, 0)
  const avgInteraction = opinions.length ? totalInteraction / opinions.length : 0
  const engagement = clamp((avgInteraction / 100) * 100)

  // Participation Rate (%): 설문 응답 대비 의견 참여 규모(프록시). 응답이 활동 팬 대비 얼마나 되는지.
  const engagedFans = new Set(opinions.map(o => o.author || o.id)).size || opinions.length
  const responsesCount = responses.length
  const participationRate = clamp(pct(responsesCount, Math.max(1, engagedFans + responsesCount)))

  // Recommendation Score (0~100): 설문 재방문의사 평균, 없으면 NPS 환산.
  const recFromRevisit = revisit.length ? (revisit.reduce((a, b) => a + b, 0) / revisit.length) * (revisit.some(v => v > 5) ? 10 : 20) : null
  const recommendation = recFromRevisit != null ? clamp(recFromRevisit) : clamp((nps + 100) / 2)

  // 카테고리별 점수(12종): 매칭 의견 별점 평균×20
  const catAgg = {}
  for (const c of KPI_CATEGORIES) catAgg[c.key] = { sum: 0, count: 0, pos: 0, neg: 0 }
  for (const o of rated) {
    const key = categorizeOpinion(o)
    const a = catAgg[key]
    a.sum += o.rating; a.count++
    if (o.rating >= 4) a.pos++; else if (o.rating <= 2) a.neg++
  }
  const categories = KPI_CATEGORIES.map(c => {
    const a = catAgg[c.key]
    return {
      key: c.key, name: c.label,
      score: a.count ? clamp((a.sum / a.count) * 20) : null,
      count: a.count,
      positive: a.count ? clamp(pct(a.pos, a.count)) : 0,
      negative: a.count ? clamp(pct(a.neg, a.count)) : 0,
    }
  })

  // Topic Trend: 언급 많은 카테고리 상위(방향은 History 병합 시 계산)
  const topicTrend = categories
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map(c => ({ topic: c.name, key: c.key, mentions: c.count, score: c.score, direction: 'flat' }))

  return {
    satisfaction,
    sentiment: { positive: sPos, neutral: sNeu, negative: sNeg },
    nps,
    complaintIndex,
    engagement,
    participationRate,
    recommendation,
    topicTrend,
    categories,
    sampleSize: { opinions: opinions.length, rated: nRated, responses: responsesCount },
  }
}

// ── 로드 + 계산 (clubId) ──
export async function getKpis(clubId = 'all') {
  const teamId = clubId === 'all' ? null : clubId
  const [opinions, responses, responsesTotal] = await Promise.all([
    listOpinions(teamId || 'seoul').catch(() => []),
    listSurveyResponses(clubId).catch(() => []),
    countSurveyResponses(clubId).catch(() => 0),
  ])
  const kpis = computeKpis(opinions, responses)
  // Mock 등 응답 상세가 없을 때 참여율은 관리자 설문 응답 총계로 보정.
  if (responses.length === 0 && responsesTotal > 0) {
    const engagedFans = new Set(opinions.map(o => o.author || o.id)).size || opinions.length
    kpis.participationRate = clamp(pct(responsesTotal, Math.max(1, engagedFans + responsesTotal)))
    kpis.sampleSize.responses = responsesTotal
  }
  return { clubId, week: currentWeek(), generatedAt: new Date().toISOString(), ...kpis }
}

export { CATEGORY_LABEL }
