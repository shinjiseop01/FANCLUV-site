// FANCLUV — Team news repository.
import { teamOrFilter } from './safety.js'
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

// 관리자 Mock 뉴스는 세션 동안만 유지 (adminData 시드에서 시작).
// 팬 화면 데모 뉴스는 Team News Provider 의 mockNewsProvider 로 분리되었다.
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
//  팬 API — 저장(관리자 등록/Supabase) 뉴스. Team News Provider 가 외부 뉴스와 병합한다.
//  관리자 등록 뉴스는 sourceUrl 이 없어(내부 상세) 새 탭이 아니라 내부 상세로 열린다.
// ════════════════════════════════════════════════════════════════════════
export async function listNews(teamId) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('team_news').select('*')
      .eq('status', 'published')
      .or(teamOrFilter(teamId)) // PostgREST or-filter 인젝션 방어(safety.js)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapNews)
  }
  // Mock: 관리자 등록 뉴스(구단 대상 또는 전체)를 반환. 데모 팀 뉴스는 Provider 담당.
  return mockAdminNews
    .filter(n => !n.team || n.team === teamId)
    .map(n => ({
      id: n.id,
      clubId: n.team || null,
      title: n.title,
      summary: splitParas(n.content)[0] || '',
      body: splitParas(n.content),
      category: n.category || '구단 공지',
      imageUrl: n.image || '',
      publishedAt: n.date,
      source: 'FANCLUV',
      isOfficial: false,
      sourceUrl: null,
      important: !!n.isImportant,
      views: 0, opinions: 0, survey: 0,
    }))
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
