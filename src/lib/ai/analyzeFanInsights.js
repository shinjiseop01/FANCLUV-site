// FANCLUV — AI 팬 인사이트 (클라이언트 인터페이스).
//
// ⚠️ OpenAI 호출/키는 절대 여기(클라이언트)에서 하지 않는다.
//    실제 분석은 Supabase Edge Function `analyze-insights` 가 수행하고(OpenAI 키는 서버 전용),
//    이 파일은 그 함수를 호출하거나(runAnalysis), 저장된 결과를 읽어온다(getLatestInsight).
//    Supabase 미설정(Mock) 시엔 로컬 간이 분석으로 폴백해 앱이 그대로 동작한다.
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { listOpinions } from '../opinionsRepo.js'

export const MIN_OPINIONS = 30

// ── Mock 저장소 (localStorage) ──
const KEY = 'fancluv_ai_insights'
function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}
function saveMock(clubId, insight) {
  const all = readAll()
  all[clubId || 'all'] = insight
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* ignore */ }
}
function readMock(clubId) {
  const all = readAll()
  return all[clubId || 'all'] || all.all || null
}

// ── Mock 로컬 간이 분석 (Supabase 미설정 시) ──
// 별점/카테고리/공감 수로 감정·키워드·추천을 계산한다(OpenAI 없이 데모).
function buildLocalInsight(clubId, ops) {
  const n = ops.length || 1
  const pos = ops.filter(o => (o.rating || 0) >= 4).length
  const neu = ops.filter(o => (o.rating || 0) === 3).length
  const neg = ops.filter(o => (o.rating || 0) > 0 && (o.rating || 0) <= 2).length
  const rated = pos + neu + neg || 1
  const pct = v => Math.round((v / rated) * 100)
  let sp = pct(pos), sn = pct(neu), sg = pct(neg)
  sn += 100 - (sp + sn + sg) // 반올림 보정

  // 카테고리 집계
  const byCat = {}
  for (const o of ops) {
    const c = o.category || '기타'
    byCat[c] = byCat[c] || { count: 0, sum: 0 }
    byCat[c].count++; byCat[c].sum += o.rating || 0
  }
  const cats = Object.entries(byCat).sort((a, b) => b[1].count - a[1].count)
  const keywords = cats.slice(0, 8).map(([c, v], i) => ({ tag: `#${c}`, weight: i < 2 ? 3 : i < 5 ? 2 : 1, _n: v.count }))
  const categorySat = cats.slice(0, 5).map(([c, v]) => ({ name: c, score: Math.max(1, Math.round(v.sum / v.count)) }))
  const topOpinions = [...ops].sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 5)
    .map(o => ({ title: o.title, count: o.likes || 0 }))
  // 만족도 낮은 카테고리 → 우선 개선
  const worst = cats.map(([c, v]) => ({ c, avg: v.sum / v.count })).sort((a, b) => a.avg - b.avg).slice(0, 4)
  const recommendations = worst.map((w, i) => ({ rank: i + 1, title: `${w.c} 개선`, desc: `${w.c} 관련 의견의 평균 만족도가 낮습니다. 우선 검토를 권장합니다.` }))
  const satisfaction = Math.round(ops.reduce((s, o) => s + (o.rating || 0), 0) / n * 20)
  const trend = [satisfaction - 6, satisfaction - 4, satisfaction - 2, satisfaction].map((v, i) => ({ label: `W${i + 1}`, value: Math.max(0, v) }))

  return {
    club_id: clubId || 'all',
    period: new Date().toISOString().slice(0, 10),
    summary: `총 ${n}건의 팬 의견을 분석했습니다. 가장 많이 언급된 주제는 ${cats.slice(0, 2).map(([c]) => c).join(', ')} 이며, 만족도가 낮은 항목을 우선 개선 대상으로 제안합니다.`,
    sentiment_positive: sp, sentiment_neutral: sn, sentiment_negative: sg,
    keywords, recommendations,
    details: {
      categorySat, topOpinions, satisfaction, trend,
      categoryIssues: worst.map(w => ({ category: w.c, issue: `${w.c} 만족도 개선 필요` })),
      staffMemo: `팬들은 ${cats.slice(0, 2).map(([c]) => c).join('·')} 에 대한 관심이 높습니다. 해당 영역의 개선을 우선 검토해 주세요.`,
      opinionsCount: n, surveysCount: 0,
    },
    created_at: new Date().toISOString(),
  }
}

// ── 분석 실행 (관리자) ──
export async function runAnalysis(clubId = 'all') {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.functions.invoke('analyze-insights', { body: { clubId } })
    // 처리된 실패는 함수가 200 + { ok:false, code } 로 반환 → data 로 전달됨.
    // error 는 네트워크/함수 미배포 등 예외 상황.
    if (error) return { ok: false, code: 'network' }
    return data || { ok: false, code: 'failed' } // { ok, insight } | { ok:false, code, count, min }
  }
  // Mock: 로컬 간이 분석 후 저장
  const ops = await listOpinions(clubId === 'all' ? 'seoul' : clubId)
  const insight = buildLocalInsight(clubId, ops)
  saveMock(clubId, insight)
  return { ok: true, insight }
}

// ── 최신 분석 결과 조회 ──
export async function getLatestInsight(clubId = 'all') {
  if (isSupabaseConfigured) {
    const { data } = await supabase
      .from('ai_insights').select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    return data || null
  }
  return readMock(clubId)
}

// ── 분석 대상 의견 수 (Empty State 판단용) ──
export async function countOpinions(clubId) {
  if (isSupabaseConfigured) {
    let q = supabase.from('opinions').select('id', { count: 'exact', head: true }).eq('status', 'visible')
    if (clubId && clubId !== 'all') q = q.eq('team_id', clubId)
    const { count } = await q
    return count || 0
  }
  const ops = await listOpinions(clubId)
  return ops.length
}
