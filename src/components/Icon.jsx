// FANCLUV — 공용 라인 SVG 아이콘 세트 (기본 이모지 대체용).
// currentColor 를 상속하므로 라이트/다크 모두 자연스럽게 대응한다.
// 사용: <Icon name="globe" size={18} />

const PATHS = {
  // 공식 홈페이지
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z" />
    </>
  ),
  // 티켓 예매
  ticket: (
    <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2v0a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4 2 2 0 0 1 0-4zM14 6v12" />
  ),
  // 인스타그램
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17" cy="7" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  // 유튜브
  youtube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
      <path d="M10.5 9.2l4.5 2.8-4.5 2.8z" fill="currentColor" stroke="none" />
    </>
  ),
  // 알림 벨
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  // 외부 링크 화살표
  external: (
    <path d="M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
  ),
  // 공감/좋아요 — x=12 축 완전 대칭 하트 (outline·fill 공용)
  heart: (
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  ),
  // 댓글/의견
  comment: (
    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
  ),
  // 공유
  share: (
    <>
      <circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" />
      <path d="M8.3 10.8l7.4-4.3M8.3 13.2l7.4 4.3" />
    </>
  ),
  // 신고 깃발
  flag: (
    <path d="M5 21V4M5 4h11l-1.8 3.5L16 11H5" />
  ),
  // 달력
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  // 시계
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  // 위치 핀
  pin: (
    <>
      <path d="M20 10.5c0 5.2-8 11-8 11s-8-5.8-8-11a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10.5" r="2.8" />
    </>
  ),
  // 조회수(눈)
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // 통계/차트(설문)
  chart: (
    <path d="M4 20V10M10 20V4M16 20v-7M4 20h16" />
  ),
  // 설문(체크리스트)
  survey: (
    <>
      <path d="M9 11l2 2 4-4" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    </>
  ),
  // 작성/펜
  edit: (
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  ),
  // 회원(사람들)
  users: (
    <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M16 4.1a3.5 3.5 0 0 1 0 6.8" />
  ),
  // 활성 회원(체크된 사람)
  userCheck: (
    <path d="M14 19v-1.5A3.5 3.5 0 0 0 10.5 14h-4A3.5 3.5 0 0 0 3 17.5V19M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM16 12l2 2 4-4" />
  ),
  // 공지(확성기)
  megaphone: (
    <path d="M3 11v2a1 1 0 0 0 1 1h2l4 3.5V6.5L6 10H4a1 1 0 0 0-1 1zM15 8a4 4 0 0 1 0 8M18.5 5.5a7 7 0 0 1 0 13" />
  ),
  // AI 반짝임
  sparkle: (
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
  ),
  // AI 로봇
  robot: (
    <>
      <rect x="4.5" y="8" width="15" height="11" rx="3" />
      <path d="M12 4.5V8M9.5 13h.01M14.5 13h.01M9 19v2M15 19v2" />
    </>
  ),
  // 검색
  search: (
    <>
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
    </>
  ),
  // 목록/클립보드
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2.5" />
      <path d="M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5v1a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5zM8.5 11h7M8.5 15h5" />
    </>
  ),
  // 뉴스/신문
  news: (
    <>
      <path d="M4 5.5h11a1.5 1.5 0 0 1 1.5 1.5v11.5a1.5 1.5 0 0 0 1.5 1.5H6a2 2 0 0 1-2-2z" />
      <path d="M16.5 9H19a1.5 1.5 0 0 1 1.5 1.5V18a2 2 0 0 1-2 2M7 9h6M7 12.5h6M7 16h3" />
    </>
  ),
  // 트로피
  trophy: (
    <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5.5A1.5 1.5 0 0 0 4 7.5 3.5 3.5 0 0 0 7.5 11M16 6h2.5A1.5 1.5 0 0 1 20 7.5 3.5 3.5 0 0 1 16.5 11M10 15h4M9 20h6M12 15v3" />
  ),
  // 이미지 placeholder
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" /><path d="M20 15l-5-5-9 9" />
    </>
  ),
  // 투표함
  vote: (
    <path d="M9 12l2 2 4-4M5 21h14a2 2 0 0 0 2-2v-1l-2.5-5H5.5L3 18v1a2 2 0 0 0 2 2z" />
  ),
  // 감정: 긍정/중립/부정
  smile: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14.5a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  meh: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 15h7M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  frown: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 15.5a4 4 0 0 1 7 0M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  // 확인/체크
  check: (
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  ),
  // 새로고침
  refresh: (
    <path d="M20 11a8 8 0 0 0-14-4.5L4 8m0-4v4h4M4 13a8 8 0 0 0 14 4.5L20 16m0 4v-4h-4" />
  ),
  // 축구공
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8l3.2 2.3-1.2 3.7h-4l-1.2-3.7zM12 3.5v4.5M4.5 9.5l4-1M19.5 9.5l-4-1M7 19l1.8-3.5M17 19l-1.8-3.5" />
    </>
  ),
  // 경고(연결 실패 등)
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  // RSS 피드
  rss: (
    <>
      <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1.4" />
    </>
  ),
  // 전원(사용/비활성)
  power: (
    <>
      <path d="M12 3v9" />
      <path d="M6.6 6.6a8 8 0 1 0 10.8 0" />
    </>
  ),
  // 연결/링크(테스트)
  link: (
    <>
      <path d="M9 15l6-6" />
      <path d="M10.5 6.5 12 5a4 4 0 0 1 5.7 5.7l-1.5 1.5M13.5 17.5 12 19a4 4 0 0 1-5.7-5.7l1.5-1.5" />
    </>
  ),
}

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.7, style }) {
  const path = PATHS[name]
  if (!path) return null
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {path}
    </svg>
  )
}
