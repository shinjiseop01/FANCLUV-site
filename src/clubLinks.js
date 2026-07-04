// FANCLUV — K리그1(2026) 12개 구단 공식 채널 링크.
//
// 표시 채널은 4개: 공식 홈페이지 / 티켓 예매 / Instagram / YouTube.
// 모든 링크는 새 창(target=_blank)으로 연다. ⚠️ X(Twitter)는 포함하지 않는다.
// 특정 채널이 없으면 getClubLinks()가 공식 홈페이지로 fallback 처리한다.

// key = teams.jsx 의 team id
const CLUB_LINKS = {
  seoul: {
    home: 'https://www.fcseoul.com',
    ticket: 'https://www.fcseoul.com/tickets/reserveSingleTicket',
    instagram: 'https://www.instagram.com/fcseoul/',
    youtube: 'https://www.youtube.com/@FCSEOUL',
  },
  ulsan: {
    home: 'https://www.uhdfc.com/main.php',
    ticket: 'https://www.uhdfc.com/apply/ticket.php',
    instagram: 'https://www.instagram.com/uhdfc_1983/',
    youtube: 'https://www.youtube.com/@ULSANHDFC',
  },
  jeonbuk: {
    home: 'https://hyundai-motorsfc.com',
    ticket: 'https://hyundai-motorsfc.com/ticket',
    instagram: 'https://www.instagram.com/jeonbuk1994/',
    youtube: 'https://www.youtube.com/@Jeonbuk1994',
  },
  pohang: {
    home: 'https://www.steelers.co.kr',
    ticket: 'https://www.steelers.co.kr/match/ticket',
    instagram: 'https://www.instagram.com/fc.pohangsteelers/',
    youtube: 'https://www.youtube.com/@fc.pohangsteelers',
  },
  daejeon: {
    home: 'https://www.dhcfc.kr',
    ticket: 'https://www.dhcfc.kr/ti/ti.php',
    instagram: 'https://www.instagram.com/daejeon_hana/',
    youtube: 'https://www.youtube.com/@daejeonhanacitizen',
  },
  gwangju: {
    home: 'https://www.gwangjufc.com',
    ticket: 'https://www.gwangjufc.com/ticket/membership_card.php',
    instagram: 'https://www.instagram.com/gwangju_fc/',
    youtube: 'https://www.youtube.com/@Gwangju_FC',
  },
  gangwon: {
    home: 'https://gangwon-fc.com',
    ticket: 'https://gangwon-fc.com/match/stadium_gangneung',
    instagram: 'https://www.instagram.com/gangwon_fc/',
    youtube: 'https://www.youtube.com/@gangwonfc2008',
  },
  gimcheon: {
    home: 'https://www.gimcheonfc.com',
    ticket: 'https://www.gimcheonfc.com/ti/ti_p.php',
    instagram: 'https://www.instagram.com/gimcheonfc/',
    youtube: 'https://www.youtube.com/@gimcheonfc',
  },
  jeju: {
    home: 'https://www.jejuskfc.com',
    ticket: 'https://www.jejuskfc.com/reservation/ticketInfo',
    instagram: 'https://www.instagram.com/jejuskfc_official/',
    youtube: 'https://www.youtube.com/@제주SK_FC',
  },
  anyang: {
    home: 'https://www.fc-anyang.com',
    ticket: 'https://www.fc-anyang.com/ticket/ticket.asp',
    instagram: 'https://www.instagram.com/fc_anyang/',
    youtube: 'https://www.youtube.com/@fc_anyang',
  },
  incheon: {
    home: 'https://www.incheonutd.com/main/index.php',
    ticket: 'https://www.incheonutd.com/ticket/ticket_intro.php',
    instagram: 'https://www.instagram.com/incheonutd/',
    youtube: 'https://www.youtube.com/@incheonutdfc',
  },
  bucheon: {
    home: 'https://bfc1995.com',
    ticket: 'https://bfc1995.com/ticket/reservations',
    instagram: 'https://www.instagram.com/bucheonfc1995/',
    youtube: 'https://www.youtube.com/channel/UCR2h5a66sN72NQoIBYFZ5OA',
  },
}

// 표시할 채널 순서 + SVG 아이콘 이름(Icon.jsx) + locale 라벨 키. (X/Twitter 제외)
export const CLUB_LINK_CHANNELS = [
  { key: 'home', icon: 'globe', labelKey: 'news.linkHome' },
  { key: 'ticket', icon: 'ticket', labelKey: 'news.linkTicket' },
  { key: 'instagram', icon: 'instagram', labelKey: 'news.linkInstagram' },
  { key: 'youtube', icon: 'youtube', labelKey: 'news.linkYoutube' },
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
