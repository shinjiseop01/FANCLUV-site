// FANCLUV — Opinions / Comments / Likes repository.
//
// 화면(OpinionsPage / OpinionDetailPage / CreateOpinionPage)의 단일 데이터 소스.
// Supabase 가 설정돼 있으면 실제 테이블(opinions/comments/likes + opinions_view)을
// 사용하고, 아니면 기존 Mock(seeded 풀 + localStorage)으로 자동 폴백한다.
// 모든 함수는 async 이며, 두 모드에서 동일한 UI 형태의 객체를 반환한다.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { logger } from './logger.js'
import { getCurrentUser, requiresIdentityVerification } from './auth.js'
import { getCreatedOpinions, addOpinion as addCreatedOpinion } from '../opinionStore.js'
import { pushMockNotification } from './notificationsRepo.js'
import { recordActivity } from './activityScore.js'

// ── 공통 헬퍼 ──
function hoursSince(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000))
}

// ── Mock 영속화 (새로고침 후에도 공감/댓글 유지) ──
// Supabase 모드에서는 실제 테이블이 담당하므로 사용하지 않는다.
const LIKES_KEY = 'fancluv_likes'        // 내가 공감한 opinionId 배열
const COMMENTS_KEY = 'fancluv_comments'  // { [opinionId]: [{id,author,hours,text,createdAt}] }
function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ }
}
function getLikedSet() { return new Set(readJSON(LIKES_KEY, [])) }
function isLikedMock(id) { return getLikedSet().has(String(id)) }
function setLikedMock(id, liked) {
  const set = getLikedSet()
  if (liked) set.add(String(id)); else set.delete(String(id))
  writeJSON(LIKES_KEY, [...set])
}
function getStoredComments(id) { return readJSON(COMMENTS_KEY, {})[String(id)] || [] }
function addStoredComment(id, comment) {
  const all = readJSON(COMMENTS_KEY, {})
  all[String(id)] = [...(all[String(id)] || []), comment]
  writeJSON(COMMENTS_KEY, all)
}
function removeStoredComment(opinionId, commentId) {
  const all = readJSON(COMMENTS_KEY, {})
  const arr = all[String(opinionId)] || []
  all[String(opinionId)] = arr.filter(c => String(c.id) !== String(commentId))
  writeJSON(COMMENTS_KEY, all)
}
function splitParas(body) {
  const parts = String(body || '').split(/\n{2,}|\n/).map(s => s.trim()).filter(Boolean)
  return parts.length ? parts : [String(body || '')]
}

// ════════════════════════════════════════════════════════════════════════
//  MOCK (localStorage + seeded 풀) — Supabase 미설정 시. 기존 동작 보존.
// ════════════════════════════════════════════════════════════════════════
const seedOf = id => id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)

const BASE_OPINIONS = [
  { author: '블루윙', category: '경기장', rating: 4, hours: 2, hasPhoto: true,
    title: '홈 경기장 좌석 시야 개선이 필요합니다',
    body: 'N석 일부 구역은 광고판에 가려 골대가 잘 보이지 않습니다. 시야 방해 좌석은 예매 시 미리 안내해주면 좋겠어요.',
    full: ['N석 하단 일부 구역은 경기 중 골대 한쪽이 광고판과 안전 펜스에 가려 잘 보이지 않습니다. 특히 코너킥이나 골 장면에서 시야가 막혀 아쉬운 순간이 많았습니다.',
      '시야 방해가 있는 좌석은 예매 단계에서 미리 표시해 주시면 좋겠습니다. 팬들이 자리를 선택할 때 충분히 알고 결정할 수 있도록요.',
      '장기적으로는 해당 구역의 펜스 높이나 광고판 위치를 조정하는 것도 검토해 주시면 감사하겠습니다.'] },
  { author: '직관러', category: '응원문화', rating: 5, hours: 5,
    title: '원정 응원 분위기가 정말 최고였습니다',
    body: '지난 원정에서 서포터즈 응원이 끝까지 이어져 선수들에게 큰 힘이 됐을 것 같아요. 이런 문화가 계속 이어지길 바랍니다.',
    full: ['지난 원정 경기에서 끝까지 멈추지 않은 응원이 정말 인상적이었습니다. 경기 결과를 떠나 선수들에게 분명 큰 힘이 됐을 거예요.',
      '원정 팬들을 위한 좌석 배치와 안내가 더 체계적으로 운영된다면, 이런 응원 문화가 더욱 단단하게 자리 잡을 수 있을 것 같습니다.'] },
  { author: '시즌권홀더', category: '티켓', rating: 3, hours: 9,
    title: '티켓 예매 페이지 안정성 개선 요청',
    body: '인기 경기 예매 오픈 직후 페이지가 자주 멈춥니다. 대기열 시스템 도입을 진지하게 검토해주셨으면 합니다.',
    full: ['인기 경기 예매가 열리는 순간 접속이 몰리면서 페이지가 자주 멈춥니다. 결제 직전에 오류가 나 처음부터 다시 시도해야 하는 경우도 있었습니다.',
      '대기열(큐) 시스템을 도입하면 접속 폭주 상황에서도 순서대로 안정적으로 예매할 수 있을 것 같습니다. 시즌권 회원 우선 예매 시간도 함께 고려해 주시면 좋겠습니다.'] },
  { author: '굿즈수집가', category: 'MD', rating: 4, hours: 14,
    title: '신규 유니폼 디자인 만족도가 높아요',
    body: '이번 시즌 홈 유니폼 색감과 디테일이 훌륭합니다. 다만 사이즈별 재고가 빨리 소진돼 재입고 주기가 빨라지면 좋겠어요.',
    full: ['이번 시즌 홈 유니폼은 색감과 엠블럼 디테일이 특히 잘 나왔다고 생각합니다. 구단 정체성이 잘 드러나서 만족스럽습니다.',
      '다만 인기 사이즈가 금방 품절되어 구하기 어려웠습니다. 재입고 주기를 조금 더 빠르게 가져가 주시면 더 많은 팬들이 함께할 수 있을 것 같아요.'] },
  { author: '응원단장', category: '선수', rating: 5, hours: 20,
    title: '유소년 출신 선수 출전 기회 확대 희망',
    body: '아카데미에서 성장한 선수들이 1군에서 뛰는 모습을 더 보고 싶습니다. 장기적으로 구단 색깔을 만드는 길이라 생각해요.',
    full: ['우리 아카데미에서 성장한 선수들이 1군 무대에서 뛰는 모습을 더 자주 보고 싶습니다. 팬들에게는 그 자체로 큰 의미가 있습니다.',
      '단기 성적도 중요하지만, 유소년 육성은 장기적으로 구단만의 색깔과 지속 가능성을 만드는 길이라고 생각합니다.'] },
  { author: '풋볼러버', category: '구단 운영', rating: 4, hours: 28,
    title: '팬 소통 간담회를 정례화해 주세요',
    body: '구단의 방향성을 팬들과 직접 공유하는 자리가 분기마다 있으면 신뢰가 더 쌓일 것 같습니다. 온라인 병행도 환영합니다.',
    full: ['구단의 운영 방향과 계획을 팬들과 직접 공유하는 간담회가 분기마다 정기적으로 열리면 좋겠습니다.',
      '현장 참석이 어려운 팬들을 위해 온라인 중계나 사후 요약 공유도 함께 진행된다면 더 많은 팬이 참여할 수 있을 것입니다.'] },
  { author: '홈경기지킴이', category: '이벤트', rating: 4, hours: 33,
    title: '가족 단위 관중을 위한 이벤트가 늘었으면',
    body: '아이와 함께 오는 팬들이 많아졌는데, 경기 전 체험 부스나 포토존이 더 다양해지면 좋겠습니다.',
    full: ['최근 아이와 함께 경기장을 찾는 가족 팬들이 눈에 띄게 늘었습니다. 다음 세대 팬을 만드는 좋은 흐름이라고 생각합니다.',
      '경기 시작 전 체험 부스, 포토존, 키즈존 같은 프로그램이 더 다양해지면 가족 단위 방문이 더욱 즐거운 경험이 될 것 같습니다.'] },
  { author: '평일직관', category: '경기장', rating: 3, hours: 41,
    title: '경기장 먹거리 줄이 너무 깁니다',
    body: '하프타임에 매점 줄이 길어 후반 시작을 놓칠 때가 많아요. 키오스크나 모바일 주문을 도입하면 좋겠습니다.',
    full: ['하프타임에 매점 줄이 너무 길어 음식을 사고 나면 후반전 시작을 놓치는 경우가 많습니다.',
      '키오스크 증설이나 모바일 주문 후 픽업 시스템을 도입하면 대기 시간이 크게 줄어들 것 같습니다. 좌석으로 배달해 주는 서비스도 검토해 볼 만합니다.'] },
  { author: '레전드7', category: '기타', rating: 4, hours: 52,
    title: '대중교통 막차 시간 연계 안내 부탁',
    body: '야간 경기 후 대중교통 이용 정보가 한곳에 정리돼 있으면 편할 것 같아요. 셔틀 운영 확대도 검토 부탁드립니다.',
    full: ['야간 경기가 끝난 뒤 대중교통 막차 시간과 정류장 정보를 한곳에서 확인할 수 있으면 귀가가 훨씬 수월할 것 같습니다.',
      '경기 종료 시간에 맞춘 셔틀버스 운영을 확대해 주시면 원거리에서 오는 팬들에게 큰 도움이 될 것입니다.'] },
]

const INITIAL_COMMENTS = [
  { author: '풋볼맘', hours: 6, text: '정말 공감합니다. 저도 같은 구역에서 비슷한 불편을 느꼈어요. 구단이 꼭 검토해 주면 좋겠네요.' },
  { author: '직관7년차', hours: 3, text: '예매 단계에서 시야 정보를 표시해주는 건 정말 필요한 부분 같습니다. 건설적인 의견 감사합니다.' },
  { author: '서포터K', hours: 1, text: '데이터로 잘 정리돼서 구단에 전달되면 좋겠습니다. 저도 공감 눌렀어요!' },
]

function mockBaseList(teamId) {
  const seed = seedOf(teamId)
  return BASE_OPINIONS.map((o, i) => ({
    ...o,
    id: String(i + 1),
    likes: 40 + ((seed * (i + 3)) % 320),
    comments: 4 + ((seed * (i + 7)) % 46),
  }))
}

// ════════════════════════════════════════════════════════════════════════
//  Supabase 매퍼
// ════════════════════════════════════════════════════════════════════════
// 목록/상세 모두 base 테이블(public.opinions)에서 직접 읽는다.
// opinions_view(security_invoker + profiles 조인)에 의존하지 않는다 —
// 라이브에서 뷰 조회가 행을 반환하지 못하는 문제를 회피하기 위함.
// author_id 는 auth.users 를 참조하므로 PostgREST 로 profiles 를 직접 임베드할 수
// 없다 → 작성자/공감수/댓글수는 base 테이블에서 별도 조회해 조립한다.
const OPINION_COLS = 'id, author_id, team_id, category, rating, title, body, has_photo, created_at'

function mapBaseRow(o, extra) {
  return {
    id: o.id,
    author: extra.nickname || '팬',
    avatarUrl: extra.avatarUrl || null,
    category: o.category || '기타',
    rating: o.rating || 0,
    createdAt: o.created_at,
    hours: hoursSince(o.created_at),
    title: o.title,
    body: o.body,
    likes: extra.likes || 0,
    comments: extra.comments || 0,
    hasPhoto: !!o.has_photo,
  }
}

// base opinions 행 배열에 작성자 닉네임·공감수·댓글수를 붙여 표시 객체로 변환.
async function enrichOpinions(rows) {
  const list = rows || []
  if (list.length === 0) return []
  const ids = list.map(o => o.id)
  const authorIds = [...new Set(list.map(o => o.author_id).filter(Boolean))]
  const [likesRes, commentsRes, profilesRes] = await Promise.all([
    supabase.from('likes').select('opinion_id').in('opinion_id', ids),
    supabase.from('comments').select('opinion_id').eq('status', 'visible').in('opinion_id', ids),
    authorIds.length
      ? supabase.from('public_profiles').select('id, nickname, avatar_url').in('id', authorIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (likesRes.error) logger.error('공감 수 조회 실패(likes)', { error: likesRes.error })
  if (commentsRes.error) logger.error('댓글 수 조회 실패(comments)', { error: commentsRes.error })
  const likeCount = {}
  for (const r of likesRes.data || []) likeCount[r.opinion_id] = (likeCount[r.opinion_id] || 0) + 1
  const commentCount = {}
  for (const r of commentsRes.data || []) commentCount[r.opinion_id] = (commentCount[r.opinion_id] || 0) + 1
  const profById = {}
  for (const p of profilesRes.data || []) profById[p.id] = p
  return list.map(o => mapBaseRow(o, {
    nickname: profById[o.author_id]?.nickname,
    avatarUrl: profById[o.author_id]?.avatar_url,
    likes: likeCount[o.id],
    comments: commentCount[o.id],
  }))
}
// ════════════════════════════════════════════════════════════════════════
//  공개 API
// ════════════════════════════════════════════════════════════════════════

// 구단별 의견 목록 (구단 필터 = team_id)
export async function listOpinions(teamId) {
  if (isSupabaseConfigured) {
    // base 테이블에서 현재 팀(team_id) 의견을 직접 조회 → 항상 실데이터, Mock 미혼용.
    const { data, error } = await supabase
      .from('opinions').select(OPINION_COLS)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
    // 에러를 조용히 삼키면(빈 목록) 라이브에서 원인이 안 보인다 → RLS/권한 문제를
    // 진단할 수 있도록 로깅한다. 화면은 안전하게 빈 목록으로 폴백한다.
    if (error) { logger.error('의견 목록 조회 실패(opinions)', { error, context: { teamId } }); return [] }
    return enrichOpinions(data)
  }
  // Mock: 작성한 의견(로컬)이 먼저, 그다음 seeded 풀
  return [...getCreatedOpinions(teamId), ...mockBaseList(teamId)]
}

// 의견 상세 + 연관 의견
export async function getOpinionDetail(teamId, id) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('opinions').select(OPINION_COLS).eq('id', id).maybeSingle()
    if (error) logger.error('의견 상세 조회 실패(opinions)', { error, context: { id } })
    if (error || !data) return null
    const [mapped] = await enrichOpinions([data])
    const opinion = { ...mapped, full: splitParas(data.body) }
    const { data: rel } = await supabase
      .from('opinions').select(OPINION_COLS)
      .eq('team_id', teamId).neq('id', id)
      .order('created_at', { ascending: false }).limit(4)
    return { opinion, related: await enrichOpinions(rel || []) }
  }
  // Mock
  const created = getCreatedOpinions(teamId).find(o => String(o.id) === String(id))
  const base = mockBaseList(teamId)
  const item = created || base.find(o => o.id === String(id))
  if (!item) return null
  // 영속화된 공감/댓글을 반영 (새로고침 후 유지)
  const likeDelta = isLikedMock(id) ? 1 : 0
  const extraComments = getStoredComments(id).length
  const opinion = {
    ...item, avatarUrl: item.avatarUrl || null, full: item.full || splitParas(item.body),
    likes: item.likes + likeDelta,
    comments: item.comments + extraComments,
  }
  const related = base
    .filter(o => o.category === item.category && o.id !== item.id)
    .concat(base.filter(o => o.category !== item.category && o.id !== item.id))
    .slice(0, 4)
  return { opinion, related }
}

// 의견 작성
export async function createOpinion(teamId, { category, rating, title, body, hasPhoto = false }) {
  const me = getCurrentUser()
  // 본인인증 미완료 계정은 팬 의견을 작성할 수 없다(핵심 기능 보호).
  if (requiresIdentityVerification(me))
    return { ok: false, code: 'identity_required', error: '본인인증 후 이용할 수 있습니다.' }
  if (isSupabaseConfigured) {
    if (!me) return { ok: false, error: '로그인이 필요합니다.' }
    const { data, error } = await supabase
      .from('opinions')
      .insert({ author_id: me.id, team_id: teamId, category, rating, title, body, has_photo: hasPhoto })
      .select('*').single()
    if (error) { logger.error('의견 저장 실패(opinions insert)', { error, context: { teamId } }); return { ok: false, error: error.message } }
    recordActivity('opinion')
    // 방금 저장한 행을 목록 화면이 즉시 prepend 할 수 있도록 표시용 객체로 반환한다
    // (집계 뷰의 like/comment 수는 아직 0, 작성자 정보는 현재 사용자로 구성).
    const opinion = {
      id: data.id, author: me.nickname || '팬', avatarUrl: me.avatarUrl || null,
      category: data.category, rating: data.rating, createdAt: data.created_at,
      hours: 0, title: data.title, body: data.body, likes: 0, comments: 0, hasPhoto: !!data.has_photo,
    }
    return { ok: true, id: data.id, opinion }
  }
  // Mock: localStorage 에 저장 (목록 상단에 노출)
  const id = `u${Date.now()}`
  const opinion = {
    id, author: me?.nickname || '팬', avatarUrl: me?.avatarUrl || null,
    category, rating, hours: 0, title, body, likes: 0, comments: 0, hasPhoto,
  }
  addCreatedOpinion(teamId, opinion)
  recordActivity('opinion')
  return { ok: true, id, opinion }
}

// 댓글 목록
export async function listComments(opinionId) {
  const me = getCurrentUser()
  if (isSupabaseConfigured) {
    // base 테이블만 조회. author_id 는 auth.users 참조라 profiles 임베드가 불가능
    // (PostgREST 관계 없음) → 조회 에러의 원인이었다. 닉네임은 public_profiles 로 별도 조회.
    const { data, error } = await supabase
      .from('comments').select('id, author_id, content, created_at')
      .eq('opinion_id', opinionId).eq('status', 'visible')
      .order('created_at', { ascending: true })
    if (error) { logger.error('댓글 목록 조회 실패(comments)', { error, context: { opinionId } }); return [] }
    const rows = data || []
    if (rows.length === 0) return []
    const authorIds = [...new Set(rows.map(c => c.author_id).filter(Boolean))]
    const { data: profs } = authorIds.length
      ? await supabase.from('public_profiles').select('id, nickname, avatar_url').in('id', authorIds)
      : { data: [] }
    const profById = {}
    for (const p of profs || []) profById[p.id] = p
    return rows.map(c => ({
      id: c.id,
      author: profById[c.author_id]?.nickname || '팬',
      avatarUrl: profById[c.author_id]?.avatar_url || null,
      createdAt: c.created_at,
      hours: hoursSince(c.created_at),
      text: c.content,
      mine: !!me && c.author_id === me.id, // 본인 댓글만 삭제 버튼 노출
    }))
  }
  // Mock: 시드 댓글(내 것 아님) + localStorage 에 저장된 내 댓글(삭제 가능)
  const seeded = INITIAL_COMMENTS.map((c, i) => ({ id: `ic${i}`, author: c.author, avatarUrl: null, hours: c.hours, text: c.text, mine: false }))
  const stored = getStoredComments(opinionId).map(c => ({
    id: c.id, author: c.author, avatarUrl: null,
    hours: hoursSince(c.createdAt), text: c.text, mine: true,
  }))
  return [...seeded, ...stored]
}

// 댓글 삭제. Supabase: RLS 로 본인(auth.uid()=author_id) 또는 관리자(is_admin, 0030)만
// 실제 삭제됨 — 권한 없으면 error/0행. Mock: localStorage 에서 제거.
export async function deleteComment(opinionId, commentId) {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (!me) return { ok: false, error: '로그인이 필요합니다.' }
    const { data, error } = await supabase
      .from('comments').delete().eq('id', commentId).select('id')
    if (error) { logger.error('댓글 삭제 실패(comments)', { error, context: { commentId } }); return { ok: false, error: error.message } }
    // RLS 로 대상이 없거나 권한이 없으면 삭제 0행 → 존재하지 않음/권한 없음 처리.
    if (!data || data.length === 0) return { ok: false, code: 'not_found' }
    return { ok: true }
  }
  removeStoredComment(opinionId, commentId)
  return { ok: true }
}

// 댓글 작성 (teamId 는 Mock 알림 URL 생성용 — 실제 Supabase 는 트리거가 URL 포함)
export async function addComment(opinionId, content, teamId = null) {
  const me = getCurrentUser()
  const text = (content || '').trim()
  if (!text) return { ok: false }
  // 본인인증 미완료 계정은 댓글을 작성할 수 없다(핵심 기능 보호).
  if (requiresIdentityVerification(me))
    return { ok: false, code: 'identity_required', error: '본인인증 후 이용할 수 있습니다.' }
  if (isSupabaseConfigured) {
    if (!me) return { ok: false, error: '로그인이 필요합니다.' }
    const { data, error } = await supabase
      .from('comments').insert({ opinion_id: opinionId, author_id: me.id, content: text })
      .select('*').single()
    if (error) return { ok: false, error: error.message }
    recordActivity('comment')
    return { ok: true, comment: { id: data.id, author: me.nickname, avatarUrl: me.avatarUrl, hours: 0, text } }
  }
  // Mock: localStorage 에 저장(새로고침 후 유지) + 알림 데모
  const comment = { id: `c${Date.now()}`, author: me?.nickname || '팬', hours: 0, text, createdAt: new Date().toISOString() }
  addStoredComment(opinionId, comment)
  recordActivity('comment')
  pushMockNotification({
    type: 'comment', title: '새 댓글', body: '내 의견에 새 댓글이 달렸습니다.',
    url: teamId ? `/club/${teamId}/opinions/${opinionId}` : null,
  })
  return { ok: true, comment: { ...comment, avatarUrl: me?.avatarUrl || null } }
}

// 내가 이 의견에 공감했는지
export async function getLikeState(opinionId) {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (!me) return { likedByMe: false }
    const { data } = await supabase
      .from('likes').select('id')
      .eq('opinion_id', opinionId).eq('user_id', me.id).maybeSingle()
    return { likedByMe: !!data }
  }
  return { likedByMe: isLikedMock(opinionId) }
}

// 공감 토글 (1인 1회, 취소 가능). nextLiked = 토글 후 원하는 상태.
// teamId 는 Mock 알림 URL 생성용.
export async function toggleLike(opinionId, nextLiked, teamId = null) {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (!me) return { ok: false }
    if (nextLiked) {
      const { error } = await supabase.from('likes').insert({ opinion_id: opinionId, user_id: me.id })
      // unique 위반(이미 공감)은 무시
      if (error && !String(error.message).includes('duplicate')) return { ok: false }
      recordActivity('like')
    } else {
      const { error } = await supabase.from('likes').delete().eq('opinion_id', opinionId).eq('user_id', me.id)
      if (error) return { ok: false }
    }
    return { ok: true }
  }
  // Mock: localStorage 에 공감 상태 저장(새로고침 후 유지)
  setLikedMock(opinionId, nextLiked)
  if (nextLiked) recordActivity('like')
  if (nextLiked) pushMockNotification({
    type: 'like', title: '새 공감', body: '내 의견에 공감이 추가되었습니다.',
    url: teamId ? `/club/${teamId}/opinions/${opinionId}` : null,
  })
  return { ok: true }
}
