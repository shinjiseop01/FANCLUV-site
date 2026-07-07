// FANCLUV — 뉴스 소스 관리 repository (Supabase-우선 + Mock 폴백).
//
// 관리자(AdminNewsSources)가 구단별 뉴스 소스(공식홈/뉴스 URL 복수/RSS/사용여부)를
// 코드 수정 없이 관리하고, 수집 성공/실패 상태를 확인한다.
//   - Supabase 설정 시: news_sources 테이블(0021). 상태 기록은 Edge Function(service_role)이 수행.
//   - 미설정(Mock): localStorage. 연결 테스트/실패 감지도 로컬에서 시뮬레이션.
//
// 유효 소스 = DB 오버라이드 위에 코드 기본값(newsSources.js) 을 병합한 것.
// 팬 뉴스 화면(teamNewsProvider)은 getEffectiveSource 로 사용여부·URL 을 참조한다.
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { retrySupabase } from '../retry.js'
import { logger } from '../logger.js'
import { isAdmin } from '../auth.js'
import { pushMockNotification } from '../notificationsRepo.js'
import { invokeFunction } from '../edgeFunctions.js'
import { NEWS_SOURCES, getNewsSource, getDefaultSources } from './newsSources.js'
import { fetchMockNews } from './providers/mockNewsProvider.js'

export const FAILURE_THRESHOLD = 3      // 연결 실패 N회 이상이면 관리자 알림
const KEY = 'fancluv_news_sources'      // Mock 저장 키

function readMock() { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
function writeMock(map) { try { localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* ignore */ } }

// 코드 기본값 + 오버라이드(row) 병합 → 유효 소스 config.
function merge(base, row) {
  if (!row) return { ...base, failureCount: 0, lastSuccessAt: null, lastFailureAt: null }
  const sources = Array.isArray(row.sources) && row.sources.length ? row.sources : base.sources
  return {
    ...base,
    officialWebsite: row.officialWebsite ?? row.official_website ?? base.officialWebsite,
    sources,
    newsUrl: sources[0]?.url || base.newsUrl,
    rssUrl: (row.rssUrl ?? row.rss_url) ?? base.rssUrl,
    enabled: (row.enabled ?? base.enabled) !== false,
    lastSuccessAt: row.lastSuccessAt ?? row.last_success_at ?? null,
    lastFailureAt: row.lastFailureAt ?? row.last_failure_at ?? null,
    failureCount: row.failureCount ?? row.failure_count ?? 0,
    lastTestAt: row.lastTestAt ?? row.last_test_at ?? null,
    lastTestOk: row.lastTestOk ?? row.last_test_ok ?? null,
    lastTestCount: row.lastTestCount ?? row.last_test_count ?? null,
    lastError: row.lastError ?? row.last_error ?? null,
    alertedAt: row.alertedAt ?? row.alerted_at ?? null,
  }
}

function rowFromSupabase(r) {
  return {
    clubId: r.club_id, officialWebsite: r.official_website, sources: r.sources || [],
    rssUrl: r.rss_url, enabled: r.enabled,
    lastSuccessAt: r.last_success_at, lastFailureAt: r.last_failure_at, failureCount: r.failure_count,
    lastTestAt: r.last_test_at, lastTestOk: r.last_test_ok, lastTestCount: r.last_test_count,
    lastError: r.last_error, alertedAt: r.alerted_at,
  }
}

// ── 유효 소스(팬 화면/Provider 용) — DB 오버라이드 + 코드 기본값 병합 ──
export async function getEffectiveSource(clubId) {
  const base = getNewsSource(clubId)
  if (!base) return null
  try {
    if (isSupabaseConfigured) {
      const { data } = await retrySupabase(() => supabase.from('news_sources').select('*').eq('club_id', clubId).maybeSingle())
      return merge(base, data ? rowFromSupabase(data) : null)
    }
    return merge(base, readMock()[clubId] || null)
  } catch (e) {
    logger.warn('뉴스 소스 조회 실패 → 기본값 사용', { error: e, context: { clubId } })
    return merge(base, null)
  }
}

// ── 관리자: 전체 소스 목록(12구단, 병합된 유효값 + 상태) ──
export async function adminListSources() {
  if (!isAdmin()) return []
  const bases = getDefaultSources()
  let overrides = {}
  if (isSupabaseConfigured) {
    const { data } = await supabase.from('news_sources').select('*')
    for (const r of data || []) overrides[r.club_id] = rowFromSupabase(r)
  } else {
    overrides = readMock()
  }
  return bases.map(b => merge(b, overrides[b.clubId] || null))
}

// ── 관리자: 소스 수정(공식홈/뉴스 URL/RSS/사용여부) ──
export async function updateSource(clubId, patch) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const base = getNewsSource(clubId)
  if (!base) return { ok: false, error: 'no_club' }
  const sources = Array.isArray(patch.sources)
    ? patch.sources.map(s => ({ label: (s.label || '').trim() || '뉴스', url: (s.url || '').trim() })).filter(s => s.url)
    : base.sources
  const next = {
    officialWebsite: (patch.officialWebsite ?? base.officialWebsite) || '',
    rssUrl: (patch.rssUrl ?? base.rssUrl) || null,
    enabled: patch.enabled !== undefined ? !!patch.enabled : (base.enabled !== false),
    sources: sources.length ? sources : base.sources,
  }
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('news_sources').upsert({
      club_id: clubId, official_website: next.officialWebsite, sources: next.sources,
      rss_url: next.rssUrl, enabled: next.enabled, updated_at: new Date().toISOString(),
    }).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, source: merge(base, rowFromSupabase(data)) }
  }
  const map = readMock()
  map[clubId] = { ...(map[clubId] || {}), clubId, ...next }
  writeMock(map)
  return { ok: true, source: merge(base, map[clubId]) }
}

// ── 관리자: 사용 여부 토글 ──
export async function setEnabled(clubId, enabled) {
  return updateSource(clubId, { enabled })
}

// ── 상태 기록(수집 성공/실패). Mock 은 로컬, Supabase 는 Edge(service_role)가 주로 기록. ──
async function recordResult(clubId, ok, { count = 0, error = null, isTest = false } = {}) {
  const base = getNewsSource(clubId)
  const now = new Date().toISOString()
  if (isSupabaseConfigured) {
    // Supabase 모드: 관리자 테스트 결과만 클라이언트가 기록(일반 수집 상태는 Edge 가 기록).
    if (!isTest || !isAdmin()) return
    const { data: cur } = await supabase.from('news_sources').select('failure_count,alerted_at').eq('club_id', clubId).maybeSingle()
    const failureCount = ok ? 0 : (cur?.failure_count || 0) + 1
    const patch = {
      club_id: clubId, last_test_at: now, last_test_ok: ok, last_test_count: count, last_error: error, updated_at: now,
    }
    if (ok) { patch.last_success_at = now; patch.failure_count = 0; patch.alerted_at = null }
    else { patch.last_failure_at = now; patch.failure_count = failureCount }
    await supabase.from('news_sources').upsert(patch)
    if (!ok && failureCount >= FAILURE_THRESHOLD && !cur?.alerted_at) {
      await createFailureAlert(clubId, failureCount)
      await supabase.from('news_sources').update({ alerted_at: now }).eq('club_id', clubId)
    }
    return
  }
  // Mock 모드
  const map = readMock()
  const prev = map[clubId] || {}
  const failureCount = ok ? 0 : (prev.failureCount || 0) + 1
  map[clubId] = {
    ...prev, clubId,
    lastTestAt: isTest ? now : prev.lastTestAt, lastTestOk: isTest ? ok : prev.lastTestOk,
    lastTestCount: isTest ? count : prev.lastTestCount, lastError: ok ? null : error,
    lastSuccessAt: ok ? now : prev.lastSuccessAt, lastFailureAt: ok ? prev.lastFailureAt : now,
    failureCount, alertedAt: ok ? null : prev.alertedAt,
  }
  if (!ok && failureCount >= FAILURE_THRESHOLD && !prev.alertedAt) {
    createFailureAlert(clubId, failureCount)
    map[clubId].alertedAt = now
  }
  writeMock(map)
}

// 실패 임계 도달 시 관리자 알림 생성.
async function createFailureAlert(clubId, count) {
  const name = getNewsSource(clubId)?.clubName || clubId
  const title = '뉴스 연결 실패'
  const body = `${name} 뉴스 연결 실패 ${count}회`
  if (isSupabaseConfigured) {
    // 관리자 사용자에게 알림 insert (best-effort).
    try {
      const { data: admins } = await supabase.from('profiles').select('id').in('role', ['admin', 'superadmin', 'staff'])
      const rows = (admins || []).map(a => ({ user_id: a.id, type: 'notice', title, body, is_read: false }))
      if (rows.length) await supabase.from('notifications').insert(rows)
    } catch (e) { logger.warn('뉴스 실패 알림 생성 실패', { error: e }) }
  } else {
    pushMockNotification({ type: 'notice', title, body, isImportant: true })
  }
  logger.warn(body)
}

// ── 관리자: 뉴스 연결 테스트 ──
// Supabase: news-fetcher(force) 로 실제 수집 시도 → 개수/실패사유. Mock: 설정 기반 시뮬레이션.
export async function testSource(clubId) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const src = await getEffectiveSource(clubId)
  const at = new Date().toISOString()
  if (!src) return { ok: false, error: 'no_club', at }
  if (src.enabled === false) {
    await recordResult(clubId, false, { error: 'disabled', isTest: true })
    return { ok: false, count: 0, error: 'disabled', at }
  }

  if (isSupabaseConfigured) {
    const { data, error } = await invokeFunction('news-fetcher', {
      body: {
        clubId: src.clubId, clubName: src.clubName, rssUrl: src.rssUrl,
        newsUrl: src.newsUrl, newsUrls: src.sources.map(s => s.url),
        officialWebsite: src.officialWebsite, force: true,
      },
    })
    const items = Array.isArray(data?.items) ? data.items : []
    const ok = !error && data?.ok !== false && items.length > 0
    const reason = error ? (error.message || 'network') : (data?.code || (items.length ? null : 'empty'))
    await recordResult(clubId, ok, { count: items.length, error: ok ? null : reason, isTest: true })
    return { ok, count: items.length, error: ok ? null : reason, at }
  }

  // Mock: 실제 외부 호출 불가 → 설정 기반 시뮬레이션(데모 뉴스 개수로 성공 표시).
  const hasSource = !!(src.rssUrl || (src.sources && src.sources.length))
  if (!hasSource) {
    await recordResult(clubId, false, { error: 'no_source', isTest: true })
    return { ok: false, count: 0, error: 'no_source', at }
  }
  const demo = await fetchMockNews(clubId)
  await recordResult(clubId, true, { count: demo.length, isTest: true })
  return { ok: true, count: demo.length, error: null, at, mock: true }
}

// 팬 뉴스 흐름(teamNewsProvider)에서 수집 결과를 반영(Mock 모드 자동 실패 감지용).
export async function reportFetchOutcome(clubId, ok, count = 0) {
  if (isSupabaseConfigured) return  // Supabase 는 Edge 가 기록
  try { await recordResult(clubId, ok, { count }) } catch { /* 무시 */ }
}

// 상태 코드 판정(화면 배지용): disabled | failed | ok | no_rss
export function statusOf(src) {
  if (!src) return 'failed'
  if (src.enabled === false) return 'disabled'
  if ((src.failureCount || 0) >= FAILURE_THRESHOLD) return 'failed'
  if (src.lastTestOk === false) return 'failed'
  // 성공 이력(수집 또는 테스트)이 있으면 정상.
  if (src.lastTestOk === true || src.lastSuccessAt) return 'ok'
  // 아직 수집/테스트 전 — RSS 없는 구단은 'RSS 없음'(공식 홈 스크래핑/ Mock 대상)으로 안내.
  if (!src.rssUrl) return 'no_rss'
  return 'ok'
}
