// FANCLUV Admin Console — mock data + config.
// All data here is Mock (no Supabase). Management pages seed their local
// state from these and mutate it in-session. Swapping to a real backend later
// means replacing these getters with API calls; the page code stays the same.

import { ROLES } from '../lib/auth.js'

// Left navigation. `roles` lets future Super Admin / staff / club-admin builds
// filter items per role from a single source of truth.
export const ADMIN_MENU = [
  { key: 'dashboard', path: '/admin',          labelKey: 'admin.menu.dashboard', roles: null },
  { key: 'members',   path: '/admin/members',  labelKey: 'admin.menu.members',   roles: null },
  { key: 'opinions',  path: '/admin/opinions', labelKey: 'admin.menu.opinions',  roles: null },
  { key: 'surveys',   path: '/admin/surveys',  labelKey: 'admin.menu.surveys',   roles: null },
  { key: 'news',      path: '/admin/news',     labelKey: 'admin.menu.news',      roles: null },
  { key: 'reports',   path: '/admin/reports',  labelKey: 'admin.menu.reports',   roles: null },
  { key: 'settings',  path: '/admin/settings', labelKey: 'admin.menu.settings',  roles: null },
]

export function visibleMenu(role) {
  return ADMIN_MENU.filter(m => !m.roles || m.roles.includes(role))
}

// ── Members ──
export const MOCK_MEMBERS = [
  { id: 'm1', nickname: '민준',       email: 'fan@fancluv.kr',      joinedAt: '2025-03-14', team: 'seoul',    status: 'active', role: ROLES.FAN },
  { id: 'm2', nickname: '블루윙',     email: 'bluewing@example.com', joinedAt: '2026-06-30', team: 'ulsan',    status: 'active', role: ROLES.FAN },
  { id: 'm3', nickname: '직관러',     email: 'gozip@example.com',    joinedAt: '2026-06-30', team: 'jeonbuk',  status: 'active', role: ROLES.FAN },
  { id: 'm4', nickname: '시즌권홀더', email: 'season@example.com',   joinedAt: '2026-06-12', team: 'pohang',   status: 'active', role: ROLES.FAN },
  { id: 'm5', nickname: '굿즈수집가', email: 'goods@example.com',    joinedAt: '2026-05-28', team: 'daejeon',  status: 'inactive', role: ROLES.FAN },
  { id: 'm6', nickname: '응원단장',   email: 'leader@example.com',   joinedAt: '2026-05-19', team: 'gwangju',  status: 'active', role: ROLES.FAN },
  { id: 'm7', nickname: '풋볼러버',   email: 'footlover@example.com', joinedAt: '2026-04-30', team: 'gangwon',  status: 'active', role: ROLES.FAN },
  { id: 'm8', nickname: '평일직관',   email: 'weekday@example.com',  joinedAt: '2026-04-11', team: 'jeju',     status: 'active', role: ROLES.FAN },
  { id: 'm9', nickname: '레전드7',    email: 'legend7@example.com',  joinedAt: '2026-03-22', team: 'incheon',  status: 'active', role: ROLES.FAN },
]

// ── Fan opinions ──
export const MOCK_OPINIONS = [
  { id: 'o1', author: '블루윙',   team: 'seoul',   date: '2026-06-30', content: '홈 경기장 좌석 시야 개선이 필요합니다.', likes: 328, comments: 24, status: 'visible' },
  { id: 'o2', author: '직관러',   team: 'jeonbuk', date: '2026-06-30', content: '원정 응원 분위기가 정말 최고였습니다.', likes: 160, comments: 24, status: 'visible' },
  { id: 'o3', author: '시즌권홀더', team: 'pohang', date: '2026-06-29', content: '티켓 예매 페이지 안정성 개선 요청', likes: 96, comments: 12, status: 'visible' },
  { id: 'o4', author: '굿즈수집가', team: 'daejeon', date: '2026-06-28', content: '신규 유니폼 디자인 만족도가 높아요.', likes: 134, comments: 9, status: 'hidden' },
  { id: 'o5', author: '응원단장', team: 'gwangju', date: '2026-06-27', content: '유소년 출신 선수 출전 기회 확대 희망', likes: 88, comments: 17, status: 'visible' },
  { id: 'o6', author: '평일직관', team: 'jeju',    date: '2026-06-26', content: '경기장 먹거리 줄이 너무 깁니다.', likes: 73, comments: 8, status: 'visible' },
]

// ── Comments (게시글별 댓글) — opinionId 로 연결 ──
export const MOCK_COMMENTS = [
  { id: 'c1', opinionId: 'o1', author: '풋볼맘',    date: '2026-06-30', content: '정말 공감합니다. 저도 같은 구역에서 불편했어요.', status: 'visible' },
  { id: 'c2', opinionId: 'o1', author: '직관7년차', date: '2026-06-30', content: '예매 단계에서 시야 정보를 표시해주면 좋겠네요.', status: 'visible' },
  { id: 'c3', opinionId: 'o1', author: '광고주',    date: '2026-06-29', content: '※ 불법 베팅 사이트 홍보 댓글', status: 'hidden' },
  { id: 'c4', opinionId: 'o2', author: '서포터K',  date: '2026-06-30', content: '원정 응원 정말 멋졌습니다. 다음에도 함께해요!', status: 'visible' },
  { id: 'c5', opinionId: 'o2', author: '레전드7',  date: '2026-06-29', content: '선수들에게 큰 힘이 됐을 거예요.', status: 'visible' },
  { id: 'c6', opinionId: 'o3', author: '시즌권홀더', date: '2026-06-29', content: '대기열 시스템 꼭 도입됐으면 합니다.', status: 'visible' },
  { id: 'c7', opinionId: 'o5', author: '풋볼러버', date: '2026-06-27', content: '유소년 육성은 장기적으로 꼭 필요합니다.', status: 'visible' },
]

export function getCommentsFor(opinionId) {
  return MOCK_COMMENTS.filter(c => c.opinionId === opinionId)
}

// ── Surveys ──
export const MOCK_SURVEYS = [
  { id: 's1', title: '2026 시즌 홈 경기장 시설 만족도 조사', desc: '홈경기 관람 환경 전반에 대한 의견을 수집합니다.', question: '홈 경기장 시설에 얼마나 만족하시나요?', endDate: '2026-07-15', status: 'open', responses: 1284 },
  { id: 's2', title: '응원 문화 조사', desc: '응원가/응원 방식에 대한 의견을 모읍니다.', question: '현재 응원 문화에 만족하시나요?', endDate: '2026-07-22', status: 'open', responses: 873 },
  { id: 's3', title: 'MD 상품 만족도 조사', desc: '굿즈 품질/가격에 대한 평가를 받습니다.', question: 'MD 상품 품질에 만족하시나요?', endDate: '2026-06-20', status: 'closed', responses: 642 },
]

// ── Team news ──
export const MOCK_NEWS = [
  { id: 'n1', title: '구단, 2026 시즌 하반기 멤버십 혜택 개편 발표', team: 'seoul',   image: 'https://picsum.photos/seed/news1/200/120', content: '하반기부터 멤버십 등급별 혜택이 확대됩니다.', date: '2026-07-01' },
  { id: 'n2', title: '주말 홈경기, 후반 추가시간 결승골로 짜릿한 승리', team: 'jeonbuk', image: 'https://picsum.photos/seed/news2/200/120', content: '치열했던 라이벌전에서 값진 3점을 챙겼습니다.', date: '2026-06-29' },
  { id: 'n3', title: '여름 이적시장, 측면 공격수 영입 임박 보도', team: 'ulsan',   image: 'https://picsum.photos/seed/news3/200/120', content: '영입 협상이 막바지에 이르렀다는 보도가 나왔습니다.', date: '2026-06-21' },
]

// ── Reports (신고) ──
export const MOCK_REPORTS = [
  { id: 'r1', targetType: 'opinion', target: '경기 후 상대팀 비방성 댓글', reporter: '익명', reason: '욕설/비방', date: '2026-06-30', status: 'pending' },
  { id: 'r2', targetType: 'comment', target: '도배성 광고 댓글이 반복 게시됩니다.', reporter: '직관러', reason: '스팸/광고', date: '2026-06-29', status: 'pending' },
  { id: 'r3', targetType: 'opinion', target: '근거 없는 허위 이적설 유포', reporter: '시즌권홀더', reason: '허위사실', date: '2026-06-28', status: 'resolved' },
  { id: 'r4', targetType: 'comment', target: '특정 선수 인신공격성 발언', reporter: '익명', reason: '욕설/비방', date: '2026-06-27', status: 'pending' },
]

// ── Dashboard stats (Mock, derived) ──
const TODAY = '2026-06-30'
export function getDashboardStats() {
  return {
    members: 12840,
    opinions: 2560,
    activeSurveys: MOCK_SURVEYS.filter(s => s.status === 'open').length,
    opinionsToday: MOCK_OPINIONS.filter(o => o.date === TODAY).length + 18,
    newMembersToday: MOCK_MEMBERS.filter(m => m.joinedAt === TODAY).length + 5,
    pendingReports: MOCK_REPORTS.filter(r => r.status === 'pending').length,
  }
}
