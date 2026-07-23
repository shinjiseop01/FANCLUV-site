// FANCLUV — Team News Provider (서비스 오케스트레이터).
//
// 팀 뉴스 페이지는 Supabase/Mock 을 직접 부르지 않고 이 서비스만 호출한다(getTeamNews).
// 여기서 여러 뉴스 소스를 우선순위로 조합하고, 표준 형태로 정규화하며, 캐시/에러/폴백을 처리한다.
//
// 우선순위 (요구사항 3)
//   1. 실제 뉴스 Provider (RSS → News API → 공식 홈페이지)  — 현재는 미설정 → []
//   2. Supabase 저장 뉴스 / 관리자 등록 뉴스 (항상 병합 — 요구사항 6)
//   3. Mock fallback (실제 Provider 없거나 전부 비었을 때)
//
// 캐시 (요구사항 7): 구단별 5분. 실패 시 마지막 성공 데이터 → 그마저 없으면 Mock.
// 에러 (요구사항 8): 각 소스 실패를 개별 catch → 페이지는 절대 깨지지 않는다.
import { withCache } from '../cache.js'
import { isSupabaseConfigured } from '../supabase.js'
import { listNews } from '../newsRepo.js'
import { fetchMockNews } from './providers/mockNewsProvider.js'

const TTL = 10 * 60 * 1000           // 10분 캐시
const lastGood = new Map()           // clubId -> 마지막 성공 표준 뉴스 배열

function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d)) return String(v)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
const ts = v => { const d = new Date(v); return isNaN(d) ? 0 : d.getTime() }

// 어떤 소스에서 왔든 FANCLUV 내부 표준 형태로 통일 (요구사항 4).
function standardize(n, clubId) {
  const publishedAt = n.publishedAt || n.createdAt || n.date || ''
  const body = Array.isArray(n.body) ? n.body : (n.body ? [n.body] : (n.summary ? [n.summary] : []))
  return {
    id: n.id,
    clubId: n.clubId || n.team || clubId,
    title: n.title || '',
    summary: n.summary || body[0] || '',
    source: n.source || 'FANCLUV',
    sourceUrl: n.sourceUrl || null,
    imageUrl: n.imageUrl || n.image || '',
    publishedAt,
    category: n.category || '구단 공지',
    isOfficial: n.isOfficial ?? false,
    // ── 기존 팀 뉴스 UI 호환 필드 ──
    date: fmtDate(publishedAt),
    body,
    views: n.views || 0,
    opinions: n.opinions || 0,
    survey: n.survey || 0,
    important: n.important ?? n.isImportant ?? false,
  }
}

// ── 0076 이후 데이터 경로 ─────────────────────────────────────────────────
// 사용자 요청은 항상 Browser → Supabase(team_news)만 탄다. 공식 구단 사이트 수집은
// 서버(news-fetcher collect, 스케줄)가 team_news 에 미리 적재하므로, 페이지를 열 때
// 외부 구단 사이트로 요청이 전파되지 않는다(1,000 동시접속 안전).
// Production(Supabase 설정됨)에서는 Mock 을 절대 섞지 않는다 — 수집/관리자 실데이터만.
// Mock 은 Supabase 미설정(로컬 데모)에서만 사용.
async function loadTeamNews(clubId) {
  try {
    const stored = await listNews(clubId)              // team_news: 수집(origin=collected)+관리자
    if (isSupabaseConfigured) {
      const items = stored.map(n => standardize(n, clubId))
      items.sort((a, b) => ts(b.publishedAt) - ts(a.publishedAt))
      lastGood.set(clubId, items)
      return items                                     // 비어 있어도 Mock 미혼합(빈 상태 UI)
    }
    // Mock 모드(개발): 저장 뉴스 + 데모 뉴스
    const mock = await fetchMockNews(clubId)
    const items = [...stored, ...mock].map(n => standardize(n, clubId))
    items.sort((a, b) => ts(b.publishedAt) - ts(a.publishedAt))
    return items
  } catch {
    // 완전 실패: 마지막 성공 데이터 → 없으면 빈 배열(Production)/Mock(개발)
    if (lastGood.has(clubId)) return lastGood.get(clubId)
    if (isSupabaseConfigured) return []
    return (await fetchMockNews(clubId)).map(n => standardize(n, clubId))
  }
}

// 팀 뉴스 페이지 진입점. 5분 캐시(withCache)로 외부 호출을 줄인다.
export function getTeamNews(clubId) {
  return withCache(`teamnews:${clubId}`, () => loadTeamNews(clubId), TTL)
}

// 새로고침 등에서 강제 재조회가 필요할 때 사용 (캐시 무시).
export function reloadTeamNews(clubId) {
  return loadTeamNews(clubId)
}
