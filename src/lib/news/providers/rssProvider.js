// FANCLUV — RSS 뉴스 Provider (구조).
//
// 구단 공식 RSS 피드를 파싱해 표준 뉴스로 변환하는 자리.
// 현재는 공개 RSS 가 확인된 구단이 없어 항상 [] 를 반환한다(→ 서비스가 Mock fallback).
//
// 실제 연동 시 (예):
//   1) source.rssUrl 을 fetch (브라우저 CORS 회피용 프록시/Edge Function 경유 권장)
//   2) XML(item: title/description/link/pubDate/enclosure) 파싱
//   3) 아래 표준 형태로 매핑:
//      { id, clubId, title, summary, source, sourceUrl(link), imageUrl,
//        publishedAt(pubDate), category, isOfficial:true }
export async function fetchRssNews(source, _clubId) {
  if (!source?.rssUrl) return []
  // TODO: 실제 RSS fetch/파싱 (CORS 문제로 서버/Edge Function 프록시 필요).
  //   const xml = await fetch(RSS_PROXY + encodeURIComponent(source.rssUrl)).then(r => r.text())
  //   return parseRss(xml).map(item => toStandard(item, clubId, source))
  return []
}

export const rssProvider = { key: 'rss', fetch: fetchRssNews }
