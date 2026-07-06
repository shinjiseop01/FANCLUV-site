// FANCLUV — 구단별 뉴스 소스 설정.
//
// 12개 구단의 공식 뉴스 소스(공식 홈페이지 / 뉴스 URL / RSS / Instagram / YouTube)를
// 한곳에서 관리한다. 실제 공식/SNS URL 은 clubLinks.js 를 재사용하고, 공개 RSS 가 없는
// 구단은 rssUrl = null 로 둔다. 향후 실제 RSS/뉴스 API 가 생기면 여기만 채우면 된다.
import { TEAMS } from '../../teams.jsx'
import { getClubLinks } from '../../clubLinks.js'

// 구단별 RSS/뉴스 API 가 확인되면 여기에 override 를 넣는다(현재는 모두 미확인 → null).
//   예) seoul: { rssUrl: 'https://.../rss', newsUrl: 'https://www.fcseoul.com/news' }
const SOURCE_OVERRIDES = {
  // seoul: { newsUrl: 'https://www.fcseoul.com/news', rssUrl: null },
}

// clubId -> { clubId, clubName, officialWebsite, newsUrl, rssUrl, instagramUrl, youtubeUrl }
export const NEWS_SOURCES = Object.fromEntries(TEAMS.map(t => {
  const l = getClubLinks(t.id)
  const o = SOURCE_OVERRIDES[t.id] || {}
  return [t.id, {
    clubId: t.id,
    clubName: t.name,
    officialWebsite: l.home,
    newsUrl: o.newsUrl || l.home,   // 공식 뉴스 페이지(별도 경로 확인 시 override)
    rssUrl: o.rssUrl || null,       // 공개 RSS 없음 → null
    instagramUrl: l.instagram,
    youtubeUrl: l.youtube,
  }]
}))

export function getNewsSource(clubId) {
  return NEWS_SOURCES[clubId] || null
}
