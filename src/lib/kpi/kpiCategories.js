// FANCLUV — KPI 카테고리 분류(12종) + 키워드 매핑.
//
// 팬 의견의 category 필드는 자유롭게 입력되므로, 여기서 정의한 12개 표준 KPI 카테고리로
// 정규화한다. 우선순위: (1) 표준 카테고리명과 정확히/부분 일치 (2) 키워드가 제목·본문·
// 카테고리에 등장 (3) 그 외는 'etc'.
//
// 각 카테고리: key(영문 식별자) · label(표시명) · aliases(정규화용 별칭) · keywords(본문 매칭)
export const KPI_CATEGORIES = [
  { key: 'performance', label: '경기력', aliases: ['경기력'], keywords: ['경기력', '전술', '플레이', '경기 내용', '경기내용', '수비', '공격', '점유율'] },
  { key: 'manager',     label: '감독',   aliases: ['감독'],   keywords: ['감독', '코치', '벤치', '용병술', '교체'] },
  { key: 'player',      label: '선수',   aliases: ['선수'],   keywords: ['선수', '주장', '영입', '이적', '부상', '유소년', '스타'] },
  { key: 'referee',     label: '심판',   aliases: ['심판'],   keywords: ['심판', '판정', 'var', 'VAR', '오심', '레드카드', '페널티'] },
  { key: 'ticket',      label: '티켓',   aliases: ['티켓'],   keywords: ['티켓', '예매', '입장권', '시즌권', '가격'] },
  { key: 'md',          label: 'MD',     aliases: ['md', 'MD'], keywords: ['md', 'MD', '굿즈', '유니폼', '스토어', '기념품'] },
  { key: 'stadium',     label: '경기장', aliases: ['경기장', '구장'], keywords: ['경기장', '구장', '시야', '좌석', '잔디', '전광판', '스탠드'] },
  { key: 'facility',    label: '편의시설', aliases: ['편의시설', '편의'], keywords: ['편의', '화장실', '주차', '셔틀', '접근성', '엘리베이터', '수유실'] },
  { key: 'food',        label: '음식',   aliases: ['음식', '먹거리'], keywords: ['음식', '먹거리', '매점', '푸드', '식음료', '메뉴', '맥주'] },
  { key: 'event',       label: '이벤트', aliases: ['이벤트'], keywords: ['이벤트', '행사', '팬사인', '경품', '추첨', '팬미팅', '부스'] },
  { key: 'marketing',   label: '마케팅', aliases: ['마케팅'], keywords: ['마케팅', '홍보', 'sns', 'SNS', '멤버십', '프로모션', '광고', '캠페인'] },
  { key: 'etc',         label: '기타',   aliases: ['기타', '구단 운영', '구단운영', '응원문화'], keywords: [] },
]

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '')

// 의견 하나를 12개 KPI 카테고리 key 로 분류.
export function categorizeOpinion(op) {
  const cat = norm(op.category)
  // 1) 표준 카테고리 별칭 일치
  for (const c of KPI_CATEGORIES) {
    if (c.key === 'etc') continue
    if (c.aliases.some(a => cat === norm(a) || cat.includes(norm(a)))) return c.key
  }
  // 2) 키워드가 카테고리+제목+본문에 등장
  const hay = norm(`${op.category || ''} ${op.title || ''} ${Array.isArray(op.body) ? op.body.join(' ') : op.body || ''}`)
  for (const c of KPI_CATEGORIES) {
    if (c.key === 'etc') continue
    if (c.keywords.some(k => hay.includes(norm(k)))) return c.key
  }
  // 3) 기타
  return 'etc'
}

export const CATEGORY_LABEL = Object.fromEntries(KPI_CATEGORIES.map(c => [c.key, c.label]))
