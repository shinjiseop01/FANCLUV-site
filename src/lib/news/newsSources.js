// FANCLUV — 구단별 뉴스 소스 설정 (K리그1 12개 구단).
//
// 각 구단의 뉴스 소스를 한곳에서 관리한다:
//   - officialWebsite : 공식 홈페이지 (clubLinks.js 재사용, 검증된 실제 URL)
//   - newsUrl         : 공식 뉴스/보도자료 페이지 (news-fetcher 가 스크래핑, 미확인 시 홈으로 폴백)
//   - rssUrl          : 공개 RSS 피드 (있는 구단만. 없으면 null → 공식 홈페이지 또는 Mock 폴백)
//   - instagram/youtube : 참고용 SNS 채널
//
// 실제 뉴스 흐름:
//   VITE_NEWS_PROVIDER=edge → edgeNewsProvider 가 news-fetcher(Edge Function)를 호출,
//   RSS(rssUrl) → 공식 홈페이지(newsUrl) 순으로 서버에서 수집·정규화·10분 캐시.
//   실패/미설정 시 관리자 저장 뉴스(team_news) + Mock 데모 뉴스로 폴백.
//
// ▶ 운영 반영: 각 구단의 실제 RSS/뉴스 페이지 경로가 확인되면 SOURCE_OVERRIDES 만 채우면 된다.
//   K리그 구단 대부분 공개 RSS 가 없어 rssUrl 은 기본 null(공식 홈페이지 스크래핑/ Mock 폴백).
import { TEAMS } from '../../teams.jsx'
import { getClubLinks } from '../../clubLinks.js'

// 구단별 실제 뉴스 소스 override. newsUrl 은 공식 홈페이지의 뉴스/공지 섹션(best-effort),
// rssUrl 은 확인된 공개 RSS 만(없으면 생략 → null). 운영 시 실제 경로로 갱신한다.
const SOURCE_OVERRIDES = {
  seoul:    { newsUrl: 'https://www.fcseoul.com/news/notice' },
  ulsan:    { newsUrl: 'https://www.uhdfc.com/main.php' },
  jeonbuk:  { newsUrl: 'https://hyundai-motorsfc.com/news' },
  pohang:   { newsUrl: 'https://www.steelers.co.kr/news' },
  daejeon:  { newsUrl: 'https://www.dhcfc.kr/news' },
  gwangju:  { newsUrl: 'https://www.gwangjufc.com/news' },
  gangwon:  { newsUrl: 'https://gangwon-fc.com/news' },
  gimcheon: { newsUrl: 'https://www.gimcheonfc.com/news' },
  jeju:     { newsUrl: 'https://www.jejuskfc.com/news' },
  anyang:   { newsUrl: 'https://www.fc-anyang.com/news' },
  incheon:  { newsUrl: 'https://www.incheonutd.com/news' },
  bucheon:  { newsUrl: 'https://bfc1995.com/news' },
  // 공개 RSS 가 확인된 구단은 rssUrl 을 추가하면 자동으로 RSS 우선 사용됨.
  //   예) seoul: { newsUrl: '...', rssUrl: 'https://.../rss.xml' }
}

// clubId -> { clubId, clubName, officialWebsite, newsUrl, rssUrl, instagramUrl, youtubeUrl }
export const NEWS_SOURCES = Object.fromEntries(TEAMS.map(t => {
  const l = getClubLinks(t.id)
  const o = SOURCE_OVERRIDES[t.id] || {}
  return [t.id, {
    clubId: t.id,
    clubName: t.name,
    officialWebsite: l.home,
    newsUrl: o.newsUrl || l.home,   // 공식 뉴스 페이지(별도 경로 확인 시 override, 없으면 홈)
    rssUrl: o.rssUrl || null,       // 공개 RSS 있는 구단만, 없으면 null
    instagramUrl: l.instagram,
    youtubeUrl: l.youtube,
  }]
}))

export function getNewsSource(clubId) {
  return NEWS_SOURCES[clubId] || null
}
