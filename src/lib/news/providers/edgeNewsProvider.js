// FANCLUV — Edge 뉴스 Provider (실제 뉴스 연동, 운영 기본).
//
// 브라우저에서 직접 RSS/공식 홈페이지를 부르면 CORS 로 막히므로, Supabase Edge Function
// `news-fetcher`(서버)가 대신 수집·정규화·캐시(10분)한 결과를 받아온다.
//   요청: { clubId, clubName, rssUrl, newsUrl, officialWebsite }
//   응답: { ok, items: 표준뉴스[], source }
//
// 활성 조건: Supabase 설정됨 + VITE_NEWS_PROVIDER=edge (newsSources/teamNewsProvider 에서 판단).
// 실패/빈 결과면 [] 를 반환해 상위 오케스트레이터가 관리자 뉴스/ Mock 으로 폴백한다.
import { isSupabaseConfigured } from '../../supabase.js'
import { invokeFunction } from '../../edgeFunctions.js'
import { logger } from '../../logger.js'

export const isEdgeNewsEnabled =
  isSupabaseConfigured &&
  String(import.meta.env?.VITE_NEWS_PROVIDER || '').toLowerCase() === 'edge'

export async function fetchEdgeNews(source, clubId) {
  if (!isEdgeNewsEnabled || !source) return []
  // invokeFunction = 일시적 오류 시 최대 3회 재시도 + { data, error } 반환.
  const { data, error } = await invokeFunction('news-fetcher', {
    body: {
      clubId: source.clubId || clubId,
      clubName: source.clubName || '',
      rssUrl: source.rssUrl || null,
      newsUrl: source.newsUrl || null,
      newsUrls: Array.isArray(source.sources) ? source.sources.map(s => s.url).filter(Boolean) : undefined,
      officialWebsite: source.officialWebsite || null,
    },
  })
  if (error) {
    logger.warn('news-fetcher 호출 실패 → 폴백', { error, context: { clubId } })
    return []
  }
  return Array.isArray(data?.items) ? data.items : []
}

export const edgeNewsProvider = { key: 'edge', fetch: fetchEdgeNews }
