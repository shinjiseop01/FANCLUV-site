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
import { getNewsSource } from './newsSources.js'
import { listNews } from '../newsRepo.js'
import { rssProvider } from './providers/rssProvider.js'
import { newsApiProvider } from './providers/newsApiProvider.js'
import { officialWebsiteProvider } from './providers/officialWebsiteProvider.js'
import { fetchMockNews } from './providers/mockNewsProvider.js'

const TTL = 5 * 60 * 1000            // 5분 캐시
const REAL_PROVIDERS = [rssProvider, newsApiProvider, officialWebsiteProvider]
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

function dedupeById(items) {
  const seen = new Set()
  return items.filter(n => {
    const k = String(n.id)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// 실제 Provider 를 우선순위대로 시도, 처음으로 결과가 있는 것을 사용. 전부 비면 [].
async function fetchReal(source, clubId) {
  for (const p of REAL_PROVIDERS) {
    try {
      const got = await p.fetch(source, clubId)
      if (got && got.length) return got
    } catch { /* 개별 provider 실패는 무시하고 다음 소스로 */ }
  }
  return []
}

async function loadTeamNews(clubId) {
  const source = getNewsSource(clubId)
  try {
    const [real, stored] = await Promise.all([
      fetchReal(source, clubId).catch(() => []),
      listNews(clubId).catch(() => []),        // Supabase team_news / Mock 관리자 뉴스
    ])
    // 실제 Provider 결과가 있으면 우선, 없으면 Mock. 관리자(stored) 뉴스는 항상 병합.
    const external = real.length ? real : await fetchMockNews(clubId)
    let items = dedupeById([...external, ...stored]).map(n => standardize(n, clubId))
    if (items.length === 0) {
      items = (await fetchMockNews(clubId)).map(n => standardize(n, clubId))
    }
    items.sort((a, b) => ts(b.publishedAt) - ts(a.publishedAt))
    lastGood.set(clubId, items)
    return items
  } catch {
    // 완전 실패: 마지막 성공 데이터 → 없으면 Mock
    if (lastGood.has(clubId)) return lastGood.get(clubId)
    const mock = (await fetchMockNews(clubId)).map(n => standardize(n, clubId))
    return mock.sort((a, b) => ts(b.publishedAt) - ts(a.publishedAt))
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
