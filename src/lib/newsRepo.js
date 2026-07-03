// FANCLUV — Team news repository.
//
// TeamNewsPage(팬) + AdminNews(관리자)의 단일 데이터 소스.
// Supabase 설정 시 team_news 테이블, 아니면 Mock. 모든 함수 async.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser } from './auth.js'
import { MOCK_NEWS } from '../admin/adminData.js'
import { pushMockNotification } from './notificationsRepo.js'

function splitParas(text) {
  const parts = String(text || '').split(/\n{2,}|\n/).map(s => s.trim()).filter(Boolean)
  return parts.length ? parts : [String(text || '')]
}
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// ── 팬 화면용 Mock 뉴스 (구단 무관, 기존 TeamNewsPage 데이터) ──
const MOCK_FAN_NEWS = [
  { id: 1, category: '구단 공지', date: '2026.07.01', views: 12840, opinions: 124, survey: 538, important: true,
    title: '구단, 2026 시즌 하반기 멤버십 혜택 개편 발표',
    summary: '하반기부터 멤버십 등급별 혜택이 확대됩니다. 홈경기 우선 예매와 굿즈 할인 폭이 커집니다.',
    body: ['구단이 2026 시즌 하반기를 맞아 팬 멤버십 혜택을 대폭 개편한다고 발표했습니다. 이번 개편의 핵심은 홈경기 우선 예매 권한 확대와 공식 굿즈 할인율 상향입니다.',
      '특히 시즌권 회원에게는 원정 경기 단체 이동 우선 신청권이 새롭게 부여됩니다. 구단은 "팬들의 의견을 적극 반영한 결과"라고 밝혔습니다.',
      '여러분은 이번 혜택 개편을 어떻게 생각하시나요? 의견을 남기고 설문에 참여해 주세요.'] },
  { id: 2, category: '경기', date: '2026.06.29', views: 9320, opinions: 88, survey: 401, important: false,
    title: '주말 홈경기, 후반 추가시간 결승골로 짜릿한 승리',
    summary: '치열했던 라이벌전에서 후반 추가시간 결승골이 터지며 값진 3점을 챙겼습니다.',
    body: ['주말 홈경기에서 후반 추가시간에 터진 극적인 결승골로 소중한 승점 3점을 획득했습니다. 경기장을 가득 메운 홈 팬들의 응원이 큰 힘이 됐습니다.',
      '감독은 경기 후 인터뷰에서 "끝까지 포기하지 않은 선수들이 자랑스럽다"고 전했습니다.'] },
  { id: 3, category: '선수', date: '2026.06.27', views: 7610, opinions: 65, survey: 287, important: false,
    title: '주장, 리그 통산 100호 골 달성… 구단 레전드 반열에',
    summary: '주장이 리그 통산 100호 골을 기록하며 구단 역사에 새로운 이정표를 세웠습니다.',
    body: ['팀의 주장이 리그 통산 100호 골이라는 대기록을 달성했습니다. 데뷔 이후 한 팀에서만 쌓아 올린 의미 있는 기록입니다.',
      '팬들은 SNS를 통해 축하 메시지를 쏟아내고 있습니다.'] },
  { id: 4, category: '인터뷰', date: '2026.06.24', views: 5480, opinions: 52, survey: 198, important: false,
    title: '[인터뷰] 신임 감독 "팬과 함께 만드는 축구가 목표"',
    summary: '신임 감독이 취임 후 첫 공식 인터뷰에서 팬 소통과 공격적인 축구 철학을 강조했습니다.',
    body: ['신임 감독이 취임 후 첫 인터뷰를 가졌습니다. 그는 "팬과 함께 만들어가는 축구"를 핵심 가치로 내세웠습니다.',
      '또한 유소년 선수 육성과 공격적인 경기 운영에 대한 구상도 함께 밝혔습니다.'] },
  { id: 5, category: '이적', date: '2026.06.21', views: 14200, opinions: 211, survey: 642, important: true,
    title: '여름 이적시장, 측면 공격수 영입 임박 보도',
    summary: '여름 이적시장을 맞아 측면 공격 보강을 위한 영입 협상이 막바지에 이르렀다는 보도가 나왔습니다.',
    body: ['여름 이적시장에서 측면 공격수 영입이 임박했다는 보도가 이어지고 있습니다. 구단은 공식 입장을 아직 내놓지 않았습니다.',
      '팬들 사이에서는 기대와 우려가 교차하고 있습니다. 여러분의 생각은 어떠신가요?'] },
  { id: 6, category: '이벤트', date: '2026.06.18', views: 4310, opinions: 39, survey: 156, important: false,
    title: '홈경기 가족의 날, 다양한 팬 참여 부스 운영',
    summary: '다가오는 홈경기를 가족의 날로 운영합니다. 포토존, 키즈존, 굿즈 체험 부스가 마련됩니다.',
    body: ['다가오는 홈경기를 "가족의 날"로 운영합니다. 경기 시작 2시간 전부터 다양한 팬 참여 부스가 열립니다.',
      '포토존, 키즈존, 굿즈 체험 부스 등이 마련되어 온 가족이 즐길 수 있습니다.'] },
  { id: 7, category: '구단 공지', date: '2026.06.15', views: 3980, opinions: 28, survey: 132, important: false,
    title: '공식 온라인 스토어 리뉴얼 오픈 안내',
    summary: '공식 온라인 스토어가 새 단장을 마치고 오픈했습니다. 신규 시즌 한정 굿즈도 함께 공개됩니다.',
    body: ['공식 온라인 스토어가 리뉴얼 오픈했습니다. 상품 검색과 결제 과정이 한층 편리해졌습니다.',
      '오픈 기념 시즌 한정 굿즈도 함께 공개되었습니다.'] },
]

// 관리자 Mock 뉴스는 세션 동안만 유지 (adminData 시드에서 시작)
let mockAdminNews = MOCK_NEWS.map(n => ({ ...n }))

// ── Supabase row → 화면 형태 ──
function mapNews(row) {
  return {
    id: row.id,
    category: row.category || '구단 공지',
    date: fmtDate(row.created_at),
    createdAt: row.created_at,
    views: 0, opinions: 0, survey: 0,   // 참여 지표는 뉴스 스키마 밖 (0 기본)
    important: !!row.is_important,
    title: row.title,
    summary: splitParas(row.content)[0] || '',
    body: splitParas(row.content),
    team: row.team_id,
    image: row.image_url || '',
  }
}

// ════════════════════════════════════════════════════════════════════════
//  팬 API
// ════════════════════════════════════════════════════════════════════════
export async function listNews(teamId) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('team_news').select('*')
      .eq('status', 'published')
      .or(`team_id.eq.${teamId},team_id.is.null`)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapNews)
  }
  return MOCK_FAN_NEWS.map(n => ({ ...n }))
}

// ════════════════════════════════════════════════════════════════════════
//  관리자 API
// ════════════════════════════════════════════════════════════════════════
export async function adminListNews() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('team_news').select('*').order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(r => ({
      id: r.id, title: r.title, content: r.content, team: r.team_id,
      image: r.image_url || '', date: fmtDate(r.created_at),
      category: r.category, isImportant: !!r.is_important,
    }))
  }
  return mockAdminNews.map(n => ({ ...n }))
}

export async function createNews({ title, content, team, image = '', category = '구단 공지', isImportant = false }) {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    const { data, error } = await supabase.from('team_news').insert({
      title, content, team_id: team || null, image_url: image || null,
      category, is_important: isImportant, author_id: me?.id || null, status: 'published',
    }).select('*').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, news: { id: data.id, title: data.title, content: data.content, team: data.team_id, image: data.image_url || '', date: fmtDate(data.created_at) } }
  }
  const today = new Date().toISOString().slice(0, 10)
  const news = { id: 'n' + Date.now(), title, content, team, image, date: today }
  mockAdminNews = [news, ...mockAdminNews]
  pushMockNotification({ type: 'news', title: '새 팀 뉴스', body: title, url: team ? `/club/${team}/news/${news.id}` : null })
  return { ok: true, news }
}

export async function updateNews(id, { title, content, team, image = '' }) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('team_news').update({
      title, content, team_id: team || null, image_url: image || null,
    }).eq('id', id).select('*').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, news: { id: data.id, title: data.title, content: data.content, team: data.team_id, image: data.image_url || '', date: fmtDate(data.created_at) } }
  }
  mockAdminNews = mockAdminNews.map(n => (n.id === id ? { ...n, title, content, team, image } : n))
  return { ok: true, news: mockAdminNews.find(n => n.id === id) }
}

export async function deleteNews(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('team_news').delete().eq('id', id)
    return { ok: !error }
  }
  mockAdminNews = mockAdminNews.filter(n => n.id !== id)
  return { ok: true }
}
