// FANCLUV — K리그 데이터 수집기 (Supabase Edge Function, Deno).
//
// 외부 리그 API(API-Football / Sportmonks / Football-data / K리그 공식 / 자체 수집)를
// 서버에서 호출해 **FANCLUV 표준 형태**로 정규화하고 league_cache 에 캐시한다.
// → API Key 를 프론트에 노출하지 않고(CORS 회피), 특정 벤더 응답이 앱에 퍼지지 않게 한다.
//
// 요청 body:
//   { action:'discover' }                         → 대한민국 리그·시즌·coverage 실조회(리그 ID 확정용)
//   { action:'status' }                           → 계정 플랜/quota(관리자 표시)
//   { resource:'standings' } / { resource:'fixtures', teamId? }  → 캐시 우선 순위/경기
// 응답: { ok, ..., source: 'cache'|'api'|'stale'|'empty' }
//
// ⚠️ 리그/팀 ID 는 하드코딩하지 않는다. 먼저 action:'discover' 로 실제 API 에서 K리그1
//    league_id·season·coverage 를 확인(A/B/C 판정)한 뒤에만 sync/ UI 를 연결한다.
//
// 배포: supabase functions deploy league-fetcher
// 표준 시크릿(서버 전용 — 프론트 노출 금지):
//   supabase secrets set API_FOOTBALL_KEY=<KEY> LEAGUE_PROVIDER=api-football
//   (LEAGUE_API_KEY 는 하위호환 fallback. SUPABASE_URL/SERVICE_ROLE_KEY 는 자동 주입)
// 마이그레이션: supabase/migrations/0020_league_cache.sql (league_cache 테이블)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// 캐시 TTL: 순위 5분 / 경기(일정+결과) 5분 (결과 신선도 우선; 일정 10분 요건 포함).
const TTL_MIN: Record<string, number> = { standings: 5, fixtures: 5 }
const FETCH_TIMEOUT_MS = 8000

// ── FANCLUV clubId ↔ 팀명 매핑 (외부 API 팀명을 내부 clubId 로 변환) ──
const CLUB_ALIASES: Record<string, string[]> = {
  seoul: ['fc서울', '서울', 'seoul'],
  ulsan: ['울산', 'ulsan'],
  jeonbuk: ['전북', 'jeonbuk', 'jeonbuk hyundai'],
  pohang: ['포항', 'pohang'],
  daejeon: ['대전', 'daejeon'],
  gwangju: ['광주', 'gwangju'],
  gangwon: ['강원', 'gangwon'],
  gimcheon: ['김천', 'gimcheon'],
  jeju: ['제주', 'jeju'],
  anyang: ['안양', 'anyang'],
  incheon: ['인천', 'incheon'],
  bucheon: ['부천', 'bucheon'],
}
function toClubId(name: string, rawId?: string): string {
  const n = String(name || '').toLowerCase().replace(/\s+/g, '')
  for (const [id, aliases] of Object.entries(CLUB_ALIASES)) {
    if (aliases.some(a => n.includes(a.replace(/\s+/g, '')))) return id
  }
  return String(rawId || name || '')
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers })
    if (!res.ok) throw new Error(`api ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// ── 표준 순위 행 (요구사항 4) ──
function normalizeStandings(raw: any) {
  const rows = raw?.standings || raw?.response || raw?.data || raw?.table || raw || []
  return (Array.isArray(rows) ? rows : []).map((r: any, i: number) => {
    const teamName = r.teamName || r.team?.name || r.name || r.club?.name || ''
    const gf = num(r.goalsFor ?? r.gf ?? r.scored ?? r.all?.goals?.for)
    const ga = num(r.goalsAgainst ?? r.ga ?? r.conceded ?? r.all?.goals?.against)
    const form = r.form || r.recentForm || null
    return {
      rank: num(r.rank ?? r.position ?? i + 1),
      clubId: toClubId(teamName, r.teamId || r.team_id || r.team?.id),
      teamName,
      played: num(r.played ?? r.games ?? r.matches ?? r.all?.played),
      wins: num(r.wins ?? r.win ?? r.w ?? r.all?.win),
      draws: num(r.draws ?? r.draw ?? r.d ?? r.all?.draw),
      losses: num(r.losses ?? r.loss ?? r.l ?? r.all?.lose),
      goalsFor: gf,
      goalsAgainst: ga,
      goalDifference: num(r.goalDifference ?? r.goalDiff ?? r.gd ?? (gf - ga)),
      points: num(r.points ?? r.pts),
      form: typeof form === 'string' ? form.slice(-5).split('') : (Array.isArray(form) ? form.slice(-5) : []),
    }
  })
}

// ── 표준 경기 (요구사항 4) ──
function normalizeMatch(m: any) {
  const homeName = m.homeTeamName || m.home?.name || m.teams?.home?.name || ''
  const awayName = m.awayTeamName || m.away?.name || m.teams?.away?.name || ''
  const rawStatus = String(m.status || m.fixture?.status?.short || '').toLowerCase()
  const status = mapStatus(rawStatus, m)
  return {
    id: String(m.id || m.fixture?.id || `${homeName}-${awayName}-${m.date || ''}`),
    homeClubId: toClubId(homeName, m.homeTeamId || m.home?.id || m.teams?.home?.id),
    awayClubId: toClubId(awayName, m.awayTeamId || m.away?.id || m.teams?.away?.id),
    homeTeamName: homeName,
    awayTeamName: awayName,
    matchDate: fmtDate(m.matchDate || m.date || m.fixture?.date || ''),
    matchTime: m.matchTime || m.kickoff || m.time || timeOf(m.fixture?.date || m.date),
    stadium: m.stadium || m.venue || m.fixture?.venue?.name || '',
    status,
    homeScore: numOrNull(m.homeScore ?? m.home_score ?? m.goals?.home ?? m.score?.home),
    awayScore: numOrNull(m.awayScore ?? m.away_score ?? m.goals?.away ?? m.score?.away),
    round: String(m.round || m.league?.round || m.matchday || ''),
    competition: String(m.competition || m.league?.name || 'K League 1'),
  }
}
function normalizeFixtures(raw: any) {
  const list = raw?.fixtures || raw?.response || raw?.matches || raw?.data || raw || []
  return (Array.isArray(list) ? list : []).map(normalizeMatch)
}

function mapStatus(s: string, m: any): string {
  if (['ft', 'aet', 'pen', 'finished', 'match_finished'].includes(s) || m.finished) return 'finished'
  if (['1h', '2h', 'ht', 'live', 'in_play'].includes(s)) return 'live'
  return 'scheduled'
}
function num(v: any) { const n = Number(v); return isNaN(n) ? 0 : n }
function numOrNull(v: any) { if (v === null || v === undefined || v === '') return null; const n = Number(v); return isNaN(n) ? null : n }
function fmtDate(v: any) { if (!v) return ''; const d = new Date(v); if (isNaN(d.getTime())) return String(v); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` }
function timeOf(v: any) { if (!v) return ''; const d = new Date(v); if (isNaN(d.getTime())) return ''; return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  // 표준 시크릿: API_FOOTBALL_KEY (LEAGUE_API_KEY 는 하위호환 fallback).
  const API_KEY = Deno.env.get('API_FOOTBALL_KEY') || Deno.env.get('LEAGUE_API_KEY') || ''
  const PROVIDER = String(Deno.env.get('LEAGUE_PROVIDER') || '').toLowerCase()
  const AF_BASE = 'https://v3.football.api-sports.io' // API-FOOTBALL v3
  // API-FOOTBALL 이면 base 자동, 아니면 LEAGUE_API_BASE(제네릭 벤더).
  const IS_AF = PROVIDER === 'api-football' || (!Deno.env.get('LEAGUE_API_BASE') && !!API_KEY)
  const API_BASE = Deno.env.get('LEAGUE_API_BASE') || (IS_AF ? AF_BASE : '')
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const body = await req.json().catch(() => ({}))
  const action = String(body.action || '')

  // API-FOOTBALL 전용 헤더.
  const afHeaders = { 'x-apisports-key': API_KEY, Accept: 'application/json' }

  // ── discover: 실제 API 응답으로 대한민국 리그·시즌·coverage 를 확정한다(하드코딩 금지). ──
  //   먼저 이 action 으로 K리그1 league_id/season/coverage 를 확인한 뒤에만 sync 를 연결한다.
  if (action === 'discover') {
    if (!API_KEY) return json({ ok: false, code: 'unconfigured', message: 'API_FOOTBALL_KEY 미설정' })
    try {
      const raw = await fetchJson(`${AF_BASE}/leagues?country=South%20Korea`, afHeaders)
      const list = Array.isArray(raw?.response) ? raw.response : []
      const leagues = list.map((e: any) => ({
        league_id: e?.league?.id,
        name: e?.league?.name,
        type: e?.league?.type,
        country: e?.country?.name,
        seasons: (e?.seasons || []).map((s: any) => ({
          year: s.year, current: s.current,
          coverage: { standings: s?.coverage?.standings, fixtures: s?.coverage?.fixtures, players: s?.coverage?.players },
        })),
      }))
      // 계정 quota 도 함께.
      let quota = null
      try { const st = await fetchJson(`${AF_BASE}/status`, afHeaders); quota = st?.response ?? null } catch { /* noop */ }
      return json({ ok: true, provider: 'api-football', country: 'South Korea', leagues, quota, fetchedAt: new Date().toISOString() })
    } catch (e) {
      return json({ ok: false, code: 'discover_failed', message: String(e).slice(0, 200) })
    }
  }

  // ── status: 계정 플랜/quota (관리자 표시용). ──
  if (action === 'status' || action === 'health') {
    if (!API_KEY) return json({ ok: false, code: 'unconfigured' })
    try {
      const st = await fetchJson(`${AF_BASE}/status`, afHeaders)
      return json({ ok: true, provider: 'api-football', status: st?.response ?? null, fetchedAt: new Date().toISOString() })
    } catch (e) {
      return json({ ok: false, code: 'error', message: String(e).slice(0, 200) })
    }
  }

  const resource = String(body.resource || 'standings')
  const teamId = body.teamId ? String(body.teamId) : ''
  if (!['standings', 'fixtures'].includes(resource)) return json({ ok: false, error: 'bad_resource' })

  const cacheKey = resource === 'fixtures' ? `fixtures:${teamId || 'all'}` : 'standings'
  const ttlMin = TTL_MIN[resource] || 5

  // 1) 캐시 확인
  const { data: cached } = await admin.from('league_cache').select('*').eq('cache_key', cacheKey).maybeSingle()
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < ttlMin * 60000) {
    return json({ ok: true, resource, source: 'cache', cachedAt: cached.fetched_at, ...(cached.data || {}) })
  }

  // API 미설정 → 클라이언트가 Mock 으로 폴백하도록 알림.
  if (!API_BASE) {
    if (cached?.data) return json({ ok: true, resource, source: 'stale', cachedAt: cached.fetched_at, ...cached.data })
    return json({ ok: false, code: 'not_configured', resource })
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (API_KEY) { headers.Authorization = `Bearer ${API_KEY}`; headers['X-API-Key'] = API_KEY; headers['x-apisports-key'] = API_KEY }

  // 2) 실제 API 호출 + 정규화
  try {
    let payload: Record<string, unknown>
    if (resource === 'standings') {
      const raw = await fetchJson(`${API_BASE}/standings`, headers)
      payload = { standings: normalizeStandings(raw) }
    } else {
      const path = teamId ? `${API_BASE}/fixtures?team=${encodeURIComponent(teamId)}` : `${API_BASE}/fixtures`
      const raw = await fetchJson(path, headers)
      payload = { fixtures: normalizeFixtures(raw) }
    }

    const hasData =
      (resource === 'standings' && Array.isArray(payload.standings) && (payload.standings as unknown[]).length) ||
      (resource === 'fixtures' && Array.isArray(payload.fixtures) && (payload.fixtures as unknown[]).length)

    if (hasData) {
      const now = new Date().toISOString()
      await admin.from('league_cache').upsert({ cache_key: cacheKey, data: payload, fetched_at: now })
      return json({ ok: true, resource, source: 'api', cachedAt: now, ...payload })
    }
    // 빈 응답 → 마지막 캐시(stale) → 없으면 empty(클라이언트 Mock 폴백)
    if (cached?.data) return json({ ok: true, resource, source: 'stale', cachedAt: cached.fetched_at, ...cached.data })
    return json({ ok: false, code: 'empty', resource })
  } catch (_e) {
    if (cached?.data) return json({ ok: true, resource, source: 'stale', cachedAt: cached.fetched_at, ...cached.data })
    return json({ ok: false, code: 'error', resource })
  }
})
