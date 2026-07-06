// FANCLUV — 공식 홈페이지 뉴스 Provider (구조).
//
// 구단 공식 홈페이지 뉴스 목록을 크롤링/스크래핑해 표준 뉴스로 변환하는 자리.
// 브라우저에서 직접 크롤링은 CORS/차단 이슈가 있어, 실제 구현은 서버/Edge Function 이 담당하고
// 이 Provider 는 그 결과를 받아오는 형태가 된다. 현재는 항상 [] (→ Mock fallback).
export async function fetchOfficialNews(source, _clubId) {
  if (!source?.newsUrl) return []
  // TODO: Edge Function(scrape-club-news) 호출 → 표준 뉴스 배열 반환.
  //   const { data } = await supabase.functions.invoke('scrape-club-news', { body: { clubId, url: source.newsUrl } })
  //   return (data?.items || []).map(item => toStandard(item, clubId, source))
  return []
}

export const officialWebsiteProvider = { key: 'official', fetch: fetchOfficialNews }
