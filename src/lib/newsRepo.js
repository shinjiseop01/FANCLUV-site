// FANCLUV — Team news repository (Production CMS).
//
// TeamNewsPage(팬) + AdminNews(관리자)의 단일 데이터 소스.
// Supabase 설정 시 team_news 테이블 + 0060 RPC, 아니면 Mock. 모든 함수 async.
import { teamOrFilter } from './safety.js'
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser } from './auth.js'
import { MOCK_NEWS } from '../admin/adminData.js'
import { normalizeTags, sortSpec, normalizeFilters } from './news/newsStatus.js'

function splitParas(text) {
  const parts = String(text || '').split(/\n{2,}|\n/).map(s => s.trim()).filter(Boolean)
  return parts.length ? parts : [String(text || '')]
}
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
// PostgREST or()/ilike 특수문자 방어(콤마·괄호·와일드카드 제거).
function sanitizeQuery(q) {
  return String(q || '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 100)
}

let mockAdminNews = MOCK_NEWS.map(n => ({ status: 'published', pinned: false, tags: [], view_count: 0, ...n }))

// ── Supabase row → 화면 형태 ──
function mapNews(row) {
  // 수집 뉴스(origin='collected')는 원문 게시일(published_at)·출처(source_*)를 함께 노출.
  const publishedAt = row.published_at || row.created_at
  return {
    id: row.id,
    category: row.category || '구단 공지',
    date: fmtDate(publishedAt),
    publishedAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishAt: row.publish_at,
    status: row.status,
    pinned: !!row.pinned,
    tags: Array.isArray(row.tags) ? row.tags : [],
    views: row.view_count || 0,
    opinions: 0, survey: 0,
    important: !!row.is_important,
    title: row.title,
    summary: row.excerpt || splitParas(row.content)[0] || '',
    body: splitParas(row.content),
    content: row.content,
    team: row.team_id,
    clubId: row.team_id,
    image: row.image_url || '',
    imageUrl: row.image_url || '',
    authorId: row.author_id,
    // 수집 메타(0076)
    origin: row.origin || 'admin',
    source: row.source_name || 'FANCLUV',
    sourceUrl: row.source_url || null,
    isOfficial: (row.origin || 'admin') === 'collected',
  }
}

// ════════════════════════════════════════════════════════════════════════
//  팬 API — published 뉴스만(예약 자동발행 반영 + 고정 우선).
// ════════════════════════════════════════════════════════════════════════
export async function listNews(teamId) {
  if (isSupabaseConfigured) {
    // cron 없이: 조회 시 예약분 자동 승격(권한/실패해도 조회는 계속).
    // ⚠️ PostgrestBuilder 는 .catch 미구현(thenable만) → try/catch 로 감싼다.
    try { await supabase.rpc('news_autopublish') } catch { /* noop */ }
    const { data, error } = await supabase
      .from('team_news').select('*')
      .eq('status', 'published')
      .or(teamOrFilter(teamId))
      .order('pinned', { ascending: false })
      .order('pinned_at', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false }) // 원문 게시일 우선
      .order('created_at', { ascending: false })
      .limit(100)                                                     // 전체 SELECT 금지(수집 누적 대비)
    if (error) return []
    return (data || []).map(mapNews)
  }
  return mockAdminNews
    .filter(n => n.status === 'published' && (!n.team || n.team === teamId))
    .map(n => ({ id: n.id, clubId: n.team || null, title: n.title, summary: splitParas(n.content)[0] || '',
      body: splitParas(n.content), category: n.category || '구단 공지', imageUrl: n.image || '',
      publishedAt: n.date, source: 'FANCLUV', isOfficial: false, sourceUrl: null,
      important: !!n.isImportant, pinned: !!n.pinned, tags: n.tags || [], views: n.view_count || 0, opinions: 0, survey: 0 }))
}

// 팬 상세 조회 시 조회수 +1 (published 만). PostgREST 빌더는 .catch 미구현 → try/catch.
export async function incrementNewsView(id) {
  if (isSupabaseConfigured) { try { await supabase.rpc('news_increment_view', { p_id: id }) } catch { /* noop */ } }
}

// ════════════════════════════════════════════════════════════════════════
//  관리자 API — 검색/필터/정렬/페이지네이션
// ════════════════════════════════════════════════════════════════════════
export async function adminListNews({ filters = {}, sort = 'newest', page = 1, pageSize = 20 } = {}) {
  const f = normalizeFilters(filters)
  if (isSupabaseConfigured) {
    try { await supabase.rpc('news_autopublish') } catch { /* noop */ }
    let query = supabase.from('team_news').select('*', { count: 'exact' })
    if (f.status) query = query.eq('status', f.status)
    if (f.team) query = query.eq('team_id', f.team)
    if (f.author) query = query.eq('author_id', f.author)
    if (f.pinned) query = query.eq('pinned', true)
    if (f.tag) query = query.contains('tags', [f.tag])
    if (f.from) query = query.gte('created_at', f.from)
    if (f.to) query = query.lte('created_at', f.to)
    if (f.q) { const q = sanitizeQuery(f.q); if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`) }
    const spec = sortSpec(sort)
    query = query.order('pinned', { ascending: false }).order(spec.column, { ascending: spec.ascending, nullsFirst: false })
    const fromRow = (Math.max(1, page) - 1) * pageSize
    query = query.range(fromRow, fromRow + pageSize - 1)
    const { data, error, count } = await query
    if (error) return { items: [], total: 0 }
    return { items: (data || []).map(mapNews), total: count || 0 }
  }
  // Mock: 메모리 필터/정렬/페이지
  let items = mockAdminNews.slice()
  if (f.status) items = items.filter(n => n.status === f.status)
  if (f.team) items = items.filter(n => n.team === f.team)
  if (f.pinned) items = items.filter(n => n.pinned)
  if (f.tag) items = items.filter(n => (n.tags || []).some(t => t.toLowerCase() === f.tag.toLowerCase()))
  if (f.q) { const q = f.q.toLowerCase(); items = items.filter(n => (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q)) }
  items.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
  const total = items.length
  const start = (Math.max(1, page) - 1) * pageSize
  return { items: items.slice(start, start + pageSize).map(n => ({ ...n, tags: n.tags || [] })), total }
}

export async function adminGetNews(id) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('team_news').select('*').eq('id', id).single()
    if (error) return null
    return mapNews(data)
  }
  const n = mockAdminNews.find(x => x.id === id)
  return n ? { ...n, tags: n.tags || [], body: splitParas(n.content) } : null
}

// 생성(기본 draft). status/publishAt/tags/pinned/image 지원.
export async function createNews({ title, content, team, image = '', category = '구단 공지', isImportant = false, tags = [], status = 'draft', publishAt = null }) {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    const { data, error } = await supabase.from('team_news').insert({
      title, content, team_id: team || null, image_url: image || null, category,
      is_important: isImportant, author_id: me?.id || null, updated_by: me?.id || null,
      status, publish_at: publishAt, tags: normalizeTags(tags),
    }).select('*').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, news: mapNews(data) }
  }
  const news = { id: 'n' + Date.now(), title, content, team, image, category, isImportant,
    tags: normalizeTags(tags), status, pinned: false, view_count: 0, date: new Date().toISOString().slice(0, 10) }
  mockAdminNews = [news, ...mockAdminNews]
  return { ok: true, news }
}

// 수정(내용/태그/이미지/팀/분류/중요). 상태·고정은 전용 RPC 사용.
export async function updateNews(id, { title, content, team, image, category, isImportant, tags }) {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    const patch = { updated_by: me?.id || null }
    if (title !== undefined) patch.title = title
    if (content !== undefined) patch.content = content
    if (team !== undefined) patch.team_id = team || null
    if (image !== undefined) patch.image_url = image || null
    if (category !== undefined) patch.category = category
    if (isImportant !== undefined) patch.is_important = isImportant
    if (tags !== undefined) patch.tags = normalizeTags(tags)
    const { data, error } = await supabase.from('team_news').update(patch).eq('id', id).select('*').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, news: mapNews(data) }
  }
  mockAdminNews = mockAdminNews.map(n => (n.id === id ? { ...n, title, content, team, image, category, isImportant, tags: normalizeTags(tags ?? n.tags) } : n))
  return { ok: true, news: mockAdminNews.find(n => n.id === id) }
}

// 자동저장: id 있으면 update, 없으면 draft 생성 → 항상 id 반환.
export async function autosaveDraft(draft) {
  if (draft.id) { const r = await updateNews(draft.id, draft); return r.ok ? { ok: true, id: draft.id } : r }
  const r = await createNews({ ...draft, status: 'draft' })
  return r.ok ? { ok: true, id: r.news.id, created: true } : r
}

export async function deleteNews(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('team_news').delete().eq('id', id)
    return { ok: !error }
  }
  mockAdminNews = mockAdminNews.filter(n => n.id !== id)
  return { ok: true }
}

// 상태 전이(compare-and-set, 서버 검증). to: draft|scheduled|published|archived
export async function transitionNewsStatus(id, to, publishAt = null) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('news_transition_status', { p_id: id, p_to: to, p_publish_at: publishAt })
    if (error) return { ok: false, code: 'rpc_error' }
    return data || { ok: false, code: 'no_data' }
  }
  mockAdminNews = mockAdminNews.map(n => (n.id === id ? { ...n, status: to, publish_at: publishAt } : n))
  return { ok: true, code: to }
}

export async function setNewsPinned(id, pinned) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('news_set_pinned', { p_id: id, p_pinned: pinned })
    if (error) return { ok: false, code: 'rpc_error' }
    return data || { ok: false, code: 'no_data' }
  }
  const pinnedCount = mockAdminNews.filter(n => n.pinned).length
  if (pinned && pinnedCount >= 3) return { ok: false, code: 'pin_limit' }
  mockAdminNews = mockAdminNews.map(n => (n.id === id ? { ...n, pinned } : n))
  return { ok: true, code: pinned ? 'pinned' : 'unpinned' }
}

export async function newsDashboardCounts() {
  if (isSupabaseConfigured) {
    const { data } = await supabase.rpc('news_dashboard_counts')
    return data && data.ok !== false ? data : null
  }
  const c = (s) => mockAdminNews.filter(n => n.status === s).length
  return { draft: c('draft'), published: c('published'), scheduled: c('scheduled'), archived: c('archived'),
    pinned: mockAdminNews.filter(n => n.pinned).length, today: 0, this_week: 0, ai_pending: 0 }
}
