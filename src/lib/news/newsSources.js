// FANCLUV — 구단별 뉴스 소스 기본값 (K리그1 12개 구단).
//
// 각 구단의 뉴스 소스를 관리한다:
//   - officialWebsite : 공식 홈페이지 (clubLinks.js 재사용)
//   - sources         : 뉴스/보도자료 페이지 목록 [{ label, url }] — 구단별 복수 가능
//   - newsUrl         : sources[0].url (단일 필드 하위호환)
//   - rssUrl          : 공개 RSS (있는 구단만, 없으면 null)
//   - enabled         : 사용 여부 기본값
//
// ▶ 이 파일은 "코드 기본값"이다. 운영 중에는 관리자가 뉴스 소스 관리 화면
//   (AdminNewsSources → newsSourcesRepo → Supabase news_sources 테이블)에서
//   코드 수정 없이 URL/사용여부를 덮어쓴다. DB 값이 없으면 이 기본값을 사용한다.
import { TEAMS } from '../../teams.jsx'
import { getClubLinks } from '../../clubLinks.js'

// 구단별 실제 뉴스 소스(공식 홈페이지 뉴스/보도자료 페이지). 복수 URL 은 sources 배열.
const SOURCE_OVERRIDES = {
  seoul:    { sources: [{ label: '뉴스', url: 'https://www.fcseoul.com/media/newsList' }] },
  ulsan:    { sources: [
                { label: '구단소식', url: 'https://www.uhdfc.com/board/board.php?buid=news_g' },
                { label: '리뷰/프리뷰', url: 'https://www.uhdfc.com/board/board.php?buid=presskits' },
              ] },
  jeonbuk:  { sources: [{ label: '뉴스', url: 'https://hyundai-motorsfc.com/media/news' }] },
  pohang:   { sources: [
                { label: '공지', url: 'https://www.steelers.co.kr/board/notice?to=notice' },
                { label: '보도자료', url: 'https://www.steelers.co.kr/board/notice?to=press' },
              ] },
  daejeon:  { sources: [{ label: '뉴스', url: 'https://www.dhcfc.kr/bd/bd_l.php?buid=g_news' }] },
  gwangju:  { sources: [{ label: '뉴스', url: 'https://www.gwangjufc.com/gwboard/gwboard_list.php?board_type=31' }] },
  gangwon:  { sources: [{ label: '뉴스', url: 'https://gangwon-fc.com/news' }] },
  gimcheon: { sources: [{ label: '뉴스', url: 'https://www.gimcheonfc.com/bd/bd_l.php?buid=news02' }] },
  jeju:     { sources: [{ label: '뉴스', url: 'https://www.jejuskfc.com/board/news/list' }] },
  anyang:   { sources: [{ label: '뉴스', url: 'https://www.fc-anyang.com/news/news.asp?menu=TNews' }] },
  incheon:  { sources: [{ label: '뉴스', url: 'https://www.incheonutd.com/fanzone/feeds_news.php' }] },
  bucheon:  { sources: [{ label: '뉴스', url: 'https://bfc1995.com/media/clubNews' }] },
  // 공개 RSS 가 확인된 구단은 rssUrl 을 추가하면 RSS 우선 사용됨. 예) seoul: { rssUrl: '...' }
}

// clubId -> 기본 소스 설정
export const NEWS_SOURCES = Object.fromEntries(TEAMS.map(t => {
  const l = getClubLinks(t.id)
  const o = SOURCE_OVERRIDES[t.id] || {}
  const sources = o.sources && o.sources.length ? o.sources : [{ label: '뉴스', url: l.home }]
  return [t.id, {
    clubId: t.id,
    clubName: t.name,
    officialWebsite: l.home,
    sources,
    newsUrl: sources[0].url,        // 하위호환(단일 필드)
    rssUrl: o.rssUrl || null,       // 공개 RSS 있는 구단만
    enabled: o.enabled !== false,   // 기본 사용
    instagramUrl: l.instagram,
    youtubeUrl: l.youtube,
  }]
}))

export function getNewsSource(clubId) {
  return NEWS_SOURCES[clubId] || null
}

// 모든 구단 기본 소스 목록(관리 화면 시드/폴백용).
export function getDefaultSources() {
  return Object.values(NEWS_SOURCES)
}
