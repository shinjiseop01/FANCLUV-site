// FANCLUV — Mock 뉴스 Provider (fallback).
//
// 실제 RSS/뉴스 API/공식 사이트 연동이 없는 구단을 위한 기본 뉴스 소스.
// "구단 공식 뉴스" 를 대신하는 데모 데이터로, 표준 형태로 반환한다.
// sourceUrl 은 해당 구단의 공식 뉴스 URL 을 가리켜, 클릭 시 원본을 새 탭으로 열 수 있다.
import { getNewsSource } from '../newsSources.js'

// 구단 무관 데모 기사(카테고리/참여지표 포함). 실제 연동 전까지 fallback 으로 노출.
const DEMO = [
  { key: 'membership', category: '구단 공지', date: '2026.07.01', views: 12840, opinions: 124, survey: 538, important: true,
    title: '구단, 2026 시즌 하반기 멤버십 혜택 개편 발표',
    summary: '하반기부터 멤버십 등급별 혜택이 확대됩니다. 홈경기 우선 예매와 굿즈 할인 폭이 커집니다.' },
  { key: 'match', category: '경기', date: '2026.06.29', views: 9320, opinions: 88, survey: 401, important: false,
    title: '주말 홈경기, 후반 추가시간 결승골로 짜릿한 승리',
    summary: '치열했던 라이벌전에서 후반 추가시간 결승골이 터지며 값진 3점을 챙겼습니다.' },
  { key: 'player', category: '선수', date: '2026.06.27', views: 7610, opinions: 65, survey: 287, important: false,
    title: '주장, 리그 통산 100호 골 달성… 구단 레전드 반열에',
    summary: '주장이 리그 통산 100호 골을 기록하며 구단 역사에 새로운 이정표를 세웠습니다.' },
  { key: 'interview', category: '인터뷰', date: '2026.06.24', views: 5480, opinions: 52, survey: 198, important: false,
    title: '[인터뷰] 신임 감독 "팬과 함께 만드는 축구가 목표"',
    summary: '신임 감독이 취임 후 첫 공식 인터뷰에서 팬 소통과 공격적인 축구 철학을 강조했습니다.' },
  { key: 'transfer', category: '이적', date: '2026.06.21', views: 14200, opinions: 211, survey: 642, important: true,
    title: '여름 이적시장, 측면 공격수 영입 임박 보도',
    summary: '여름 이적시장을 맞아 측면 공격 보강을 위한 영입 협상이 막바지에 이르렀다는 보도가 나왔습니다.' },
  { key: 'event', category: '이벤트', date: '2026.06.18', views: 4310, opinions: 39, survey: 156, important: false,
    title: '홈경기 가족의 날, 다양한 팬 참여 부스 운영',
    summary: '다가오는 홈경기를 가족의 날로 운영합니다. 포토존, 키즈존, 굿즈 체험 부스가 마련됩니다.' },
  { key: 'store', category: '구단 공지', date: '2026.06.15', views: 3980, opinions: 28, survey: 132, important: false,
    title: '공식 온라인 스토어 리뉴얼 오픈 안내',
    summary: '공식 온라인 스토어가 새 단장을 마치고 오픈했습니다. 신규 시즌 한정 굿즈도 함께 공개됩니다.' },
]

// 표준 뉴스 아이템 배열을 반환한다(async 통일). source 는 구단 공식 뉴스로 표기.
export async function fetchMockNews(clubId) {
  const src = getNewsSource(clubId)
  const url = src?.newsUrl || src?.officialWebsite || null
  const clubName = src?.clubName || ''
  return DEMO.map(d => ({
    id: `mock-${clubId}-${d.key}`,
    clubId,
    title: d.title,
    summary: d.summary,
    source: clubName ? `${clubName} 공식` : '구단 공식 뉴스',
    sourceUrl: url,          // 클릭 시 원본(공식 뉴스) 새 탭
    imageUrl: '',
    publishedAt: d.date,
    category: d.category,
    isOfficial: true,
    // 참여 지표(내부 UI 표시용)
    views: d.views, opinions: d.opinions, survey: d.survey, important: d.important,
  }))
}

export const mockNewsProvider = { key: 'mock', fetch: fetchMockNews }
