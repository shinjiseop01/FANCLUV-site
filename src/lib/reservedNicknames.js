// FANCLUV — 예약어(사용 금지) 닉네임 목록.
//
// 일반 사용자가 운영/공식 계정으로 오해할 수 있는 닉네임을 막는다.
// 목록은 여기서만 추가/수정하면 되며, 비교는 대소문자·공백을 무시한 정규화 후 exact match.

// 운영/시스템 예약어
export const RESERVED_SYSTEM = [
  '관리자', 'admin', 'administrator', '운영자', 'official',
  'fancluv', 'support', 'customer service', '고객센터',
  'gm', 'master', 'system', 'moderator', '운영팀', '팬클럽', '공식',
]

// 구단 공식 계정으로 오해할 수 있는 이름 (한/영)
export const RESERVED_CLUBS = [
  'fc서울', 'fc seoul', '울산hd', 'ulsan hd', '전북현대', 'jeonbuk hyundai',
  '포항스틸러스', 'pohang steelers', '대전하나시티즌', 'daejeon hana citizen',
  '광주fc', 'gwangju fc', '강원fc', 'gangwon fc', '김천상무', 'gimcheon sangmu',
  '제주sk', 'jeju sk', 'fc안양', 'fc anyang', '인천유나이티드', 'incheon united',
  '부천fc', 'bucheon fc',
]

// 비교용 정규화: 소문자 + 모든 공백 제거.
export function normalizeNickname(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, '')
}

const RESERVED_SET = new Set([...RESERVED_SYSTEM, ...RESERVED_CLUBS].map(normalizeNickname))

// 예약어면 true. (정규화 후 완전 일치)
export function isReservedNickname(name) {
  return RESERVED_SET.has(normalizeNickname(name))
}
