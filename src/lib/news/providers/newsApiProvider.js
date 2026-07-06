// FANCLUV — 뉴스 API Provider (구조).
//
// 외부 뉴스 API(예: NewsAPI, 네이버 뉴스 검색 등)로 구단 관련 기사를 조회하는 자리.
// API 키는 서버(Edge Function)에서만 사용해야 하며, 클라이언트에 노출하지 않는다.
// 키/엔드포인트가 설정되지 않았으면 항상 [] (→ Mock fallback).
const NEWS_API_ENABLED = Boolean(import.meta.env.VITE_NEWS_API_ENABLED)

export async function fetchApiNews(_source, _clubId) {
  if (!NEWS_API_ENABLED) return []
  // TODO: Edge Function(fetch-club-news) 호출 → 표준 뉴스 배열 반환.
  //   const { data } = await supabase.functions.invoke('fetch-club-news', { body: { clubId, query: source.clubName } })
  //   return (data?.items || []).map(item => toStandard(item, clubId, source))
  return []
}

export const newsApiProvider = { key: 'newsapi', fetch: fetchApiNews }
