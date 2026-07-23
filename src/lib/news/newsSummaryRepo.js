// FANCLUV — 뉴스 AI 요약 데이터 레이어.
//
// 뉴스 카드의 "AI 뉴스 요약"용. Supabase(프로덕션)에서는 Edge Function summarize-news 를
// 호출하고(서버가 news_ai_summary 캐시 → OpenAI → 추출 폴백), DEV/오류 시에는 클라이언트
// 추출 요약으로 폴백한다. 세션 내 재요청을 막기 위해 메모리 캐시도 둔다.
import { supabase, isSupabaseConfigured } from '../supabase.js'

const memCache = new Map()

// 뉴스별 안정 캐시 키(같은 뉴스 → 같은 키 → 캐시 재사용).
function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h.toString(36)
}
export function newsCacheKey(teamId, item) {
  return `${teamId}:${djb2(item.sourceUrl || item.title || String(item.id))}`
}

// 클라이언트 추출 요약(폴백) — 문장 단위로 3~4개 뽑는다.
function clientExtractive(item) {
  const text = [item.summary, ...(Array.isArray(item.body) ? item.body : [item.body])].filter(Boolean).join(' ')
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  const sentences = [...new Set(clean.split(/(?<=[.!?。])\s+|(?<=다\.)\s*/).map(s => s.trim()).filter(s => s.length > 8))]
  const bullets = (sentences.length ? sentences : [clean]).slice(0, 4).map(s => (s.length > 120 ? s.slice(0, 117) + '…' : s))
  return {
    oneLiner: (item.title || clean).slice(0, 90),
    bullets: bullets.length ? bullets : [item.title || '요약할 내용이 충분하지 않습니다.'],
    fanPoint: sentences[0] ? sentences[0].slice(0, 90) : '',
    keywords: [],
    model: 'extractive',
    cached: false,
  }
}

// 뉴스 요약 조회. 반환: { oneLiner, bullets[], fanPoint, model, cached, cacheKey }
export async function getNewsSummary(teamId, item) {
  const cacheKey = newsCacheKey(teamId, item)
  if (memCache.has(cacheKey)) return memCache.get(cacheKey)

  let result
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.functions.invoke('summarize-news', {
        body: { cacheKey, teamId, title: item.title || '', text: [item.summary, ...(Array.isArray(item.body) ? item.body : [item.body])].filter(Boolean).join('\n') },
      })
      if (error || !data?.ok) throw new Error(error?.message || data?.code || 'summarize_failed')
      result = { oneLiner: data.oneLiner, bullets: data.bullets || [], fanPoint: data.fanPoint || '', keywords: data.keywords || [], model: data.model, cached: !!data.cached }
      // 다른 요청이 생성 중(generating)일 때의 임시 추출 요약은 메모리 캐시하지 않는다
      // (다음 열람 시 완성된 AI 캐시를 받도록).
      if (data.generating) { result.cacheKey = cacheKey; return result }
    } catch {
      // 함수 오류/미배포 시에도 화면이 비지 않도록 클라이언트 추출 폴백.
      result = clientExtractive(item)
    }
  } else {
    result = clientExtractive(item)
  }
  result.cacheKey = cacheKey
  memCache.set(cacheKey, result)
  return result
}

// 요약 피드백(도움됨/개선필요). 실패해도 조용히 무시(부가 기능).
export async function sendNewsSummaryFeedback(cacheKey, helpful) {
  if (!isSupabaseConfigured || !cacheKey) return
  try { await supabase.rpc('news_summary_feedback', { p_cache_key: cacheKey, p_helpful: !!helpful }) } catch { /* noop */ }
}
