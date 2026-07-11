// FANCLUV — 홈 화면 인기 콘텐츠(인기 의견 / 인기 카테고리 / 트렌딩 키워드).
//
// Supabase 설정 시 실제 의견 데이터로 계산하고, 아니면 Mock 으로 fallback 한다.
// 한 번의 조회로 세 가지를 모두 계산해 cache.js 로 30초 캐시한다.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { retrySupabase } from './retry.js'
import { withCache, invalidate } from './cache.js'

function hoursSince(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000))
}

// 트렌딩 키워드 후보 사전 — 의견 제목/본문에서 등장 횟수를 센다.
const KEYWORD_DICT = ['유니폼', '티켓', '응원', '유소년', '좌석', '굿즈', '경기장', '주차', '예매', '매점', '셔틀', '시야', '먹거리', '감독', '선수']

// ── Mock fallback (Supabase 미설정 시 기존 홈 화면과 동일) ──
const MOCK_POPULAR_OPINIONS = [
  { id: '1', author: '블루윙', hours: 2, category: '경기장', likes: 142, comments: 28,
    text: '홈 경기장 좌석 시야 개선이 필요합니다. 광고판에 가려 골대가 잘 보이지 않아요.' },
  { id: '5', author: '응원단장', hours: 5, category: '선수', likes: 119, comments: 17,
    text: '유소년 출신 선수들에게 출전 기회가 더 많아졌으면 합니다. 미래를 위한 투자가 필요해요.' },
  { id: '8', author: '평일직관', hours: 24, category: '경기장', likes: 96, comments: 11,
    text: '경기장 먹거리 줄이 너무 깁니다. 키오스크나 모바일 주문을 도입하면 좋겠어요.' },
  { id: '3', author: '시즌권홀더', hours: 48, category: '티켓', likes: 73, comments: 9,
    text: '티켓 예매 페이지가 경기 직전에 가끔 느려집니다. 서버 안정성 개선 부탁드려요.' },
]
const MOCK_CATEGORIES = [
  { name: '경기장', count: 320 }, { name: '응원문화', count: 254 }, { name: '티켓', count: 188 },
  { name: 'MD', count: 142 }, { name: '선수', count: 121 }, { name: '이벤트', count: 87 },
]
const MOCK_TOPICS = [
  { tag: '유니폼', mentions: 412 }, { tag: '티켓', mentions: 287 }, { tag: '응원', mentions: 231 },
  { tag: '유소년', mentions: 176 }, { tag: '좌석', mentions: 134 },
]

const MOCK_CONTENT = {
  source: 'mock',
  popularOpinions: MOCK_POPULAR_OPINIONS,
  popularCategories: MOCK_CATEGORIES,
  trendingKeywords: MOCK_TOPICS,
}

// Supabase 의견 목록 → 인기 의견/카테고리/키워드 계산.
function computeFromOpinions(rows) {
  // 인기 의견 (공감 많은 순 4개)
  const byLikes = [...rows].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0))
  const popularOpinions = byLikes.slice(0, 4).map(r => ({
    id: r.id,
    author: r.author_nickname || '팬',
    hours: hoursSince(r.created_at),
    category: r.category || '기타',
    likes: Number(r.likes_count) || 0,
    comments: Number(r.comments_count) || 0,
    text: r.body || r.title || '',
  }))

  // 인기 카테고리 (의견 수 많은 순 6개)
  const catMap = new Map()
  rows.forEach(r => { const c = r.category || '기타'; catMap.set(c, (catMap.get(c) || 0) + 1) })
  const popularCategories = [...catMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count).slice(0, 6)

  // 트렌딩 키워드 (사전 단어가 제목+본문에 등장한 의견 수)
  const trendingKeywords = KEYWORD_DICT
    .map(tag => ({
      tag,
      mentions: rows.filter(r => `${r.title || ''} ${r.body || ''}`.includes(tag)).length,
    }))
    .filter(k => k.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions).slice(0, 5)

  // ⚠️ 실데이터만 반환한다. 특정 항목이 비어도 Mock 으로 채우지 않는다(빈 배열 → Empty State).
  return { source: 'live', popularOpinions, popularCategories, trendingKeywords }
}

// 홈 인기 콘텐츠 (async, 캐시 30초).
//   · Supabase(프로덕션): 실데이터만 사용. 데이터가 없으면 빈 배열(source:'live'),
//     조회 실패면 source:'error' — 절대 Mock 으로 대체하지 않는다.
//   · Supabase 미설정(DEV): 기존 Mock 콘텐츠로 화면 미리보기.
export function getHomeContent(teamId) {
  return withCache(`home:${teamId}`, async () => {
    if (isSupabaseConfigured) {
      const { data, error } = await retrySupabase(() => supabase
        .from('opinions_view')
        .select('id, title, body, category, likes_count, comments_count, author_nickname, created_at')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(200))
      // 데이터 없음(정상)과 연동 실패를 구분한다.
      if (error) return { source: 'error', popularOpinions: [], popularCategories: [], trendingKeywords: [] }
      return computeFromOpinions(data || [])
    }
    return MOCK_CONTENT
  })
}

export function refreshHome(teamId) {
  invalidate(`home:${teamId}`)
  invalidate(`homestats:${teamId}`)
}

// ── 팀 홈 상단 통계(팬 수/의견/댓글/공감/만족도) ──
// Supabase(프로덕션): RPC club_home_stats 로 실제 집계. 조회 실패 시 0 + error(가짜 값 금지).
// DEV(Mock): 팀별로 안정적인 예시 숫자(화면 미리보기용, 실서비스엔 안 나감).
function mockClubStats(id) {
  const seed = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return { fans: 2800 + (seed % 47) * 137, opinions: 1100 + (seed % 38) * 73, comments: 7400 + (seed % 53) * 191, satisfaction: 72 + (seed % 21), likes: 0, source: 'mock' }
}
export function getClubStats(teamId) {
  return withCache(`homestats:${teamId}`, async () => {
    if (isSupabaseConfigured) {
      const { data, error } = await retrySupabase(() => supabase.rpc('club_home_stats', { p_team_id: teamId }))
      if (error || !data) return { fans: 0, opinions: 0, comments: 0, likes: 0, satisfaction: 0, source: 'error' }
      return { ...data, source: 'live' }
    }
    return mockClubStats(teamId)
  })
}
