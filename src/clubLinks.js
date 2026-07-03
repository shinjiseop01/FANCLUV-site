// FANCLUV — K리그1(2026) 12개 구단 공식 채널 링크.
//
// 각 구단의 공식 홈페이지(home)는 반드시 채우고, 티켓/인스타/유튜브는 알려진
// 공식 채널이 있으면 채운다. 특정 채널이 없으면 getClubLinks()가 공식 홈페이지로
// fallback 처리한다. 모든 링크는 새 창(target=_blank)으로 연다.
// ⚠️ X(Twitter)는 정책상 포함하지 않는다.

// key = teams.jsx 의 team id
const CLUB_LINKS = {
  seoul: {
    home: 'https://www.fcseoul.com',
    ticket: 'https://www.fcseoul.com/reservation/ticketList.do',
    instagram: 'https://www.instagram.com/fcseoul',
    youtube: 'https://www.youtube.com/@FCSEOUL',
  },
  ulsan: {
    home: 'https://www.ulsanhd.com',
    ticket: 'https://www.ulsanhd.com/ticket',
    instagram: 'https://www.instagram.com/ulsanhd_official',
    youtube: 'https://www.youtube.com/@ulsanhd',
  },
  jeonbuk: {
    home: 'https://www.hyundai-motorsfc.com',
    instagram: 'https://www.instagram.com/jeonbukhyundai_official',
    youtube: 'https://www.youtube.com/@jeonbukhyundaifc',
  },
  pohang: {
    home: 'https://www.steelers.co.kr',
    instagram: 'https://www.instagram.com/pohang_steelers',
    youtube: 'https://www.youtube.com/@pohangsteelers',
  },
  daejeon: {
    home: 'https://www.dcfc.co.kr',
    instagram: 'https://www.instagram.com/daejeonhanacitizen',
    youtube: 'https://www.youtube.com/@daejeonhanacitizen',
  },
  gwangju: {
    home: 'https://www.gwangjufc.com',
    instagram: 'https://www.instagram.com/gwangju_fc',
    youtube: 'https://www.youtube.com/@gwangjufc',
  },
  gangwon: {
    home: 'https://gangwon-fc.com',
    instagram: 'https://www.instagram.com/gangwonfc_official',
    youtube: 'https://www.youtube.com/@gangwonfc',
  },
  gimcheon: {
    home: 'https://www.gimcheonfc.com',
    instagram: 'https://www.instagram.com/gimcheon_sangmu_fc',
    youtube: 'https://www.youtube.com/@gimcheonsangmufc',
  },
  jeju: {
    home: 'https://www.jeju-utd.com',
    instagram: 'https://www.instagram.com/jejuskfc',
    youtube: 'https://www.youtube.com/@jejuskfc',
  },
  anyang: {
    home: 'https://www.fc-anyang.com',
    instagram: 'https://www.instagram.com/fc_anyang',
    youtube: 'https://www.youtube.com/@fcanyang',
  },
  incheon: {
    home: 'https://www.incheonutd.com',
    instagram: 'https://www.instagram.com/incheon_utd',
    youtube: 'https://www.youtube.com/@incheonutd',
  },
  bucheon: {
    home: 'https://www.bfc1995.com',
    instagram: 'https://www.instagram.com/bucheonfc1995',
    youtube: 'https://www.youtube.com/@bucheonfc1995',
  },
}

// 표시할 채널 순서 + 아이콘 + locale 라벨 키.
export const CLUB_LINK_CHANNELS = [
  { key: 'home', icon: '🌐', labelKey: 'news.linkHome' },
  { key: 'ticket', icon: '🎫', labelKey: 'news.linkTicket' },
  { key: 'instagram', icon: '📸', labelKey: 'news.linkInstagram' },
  { key: 'youtube', icon: '▶', labelKey: 'news.linkYoutube' },
]

// 구단의 채널별 URL을 반환한다. 특정 채널이 없으면 공식 홈페이지로 fallback.
// 홈페이지 정보 자체가 없으면 K리그 공식 사이트로 최종 fallback.
export function getClubLinks(teamId) {
  const c = CLUB_LINKS[teamId] || {}
  const home = c.home || 'https://www.kleague.com'
  return {
    home,
    ticket: c.ticket || home,
    instagram: c.instagram || home,
    youtube: c.youtube || home,
  }
}
