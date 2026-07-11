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

// 캐시 TTL(분): 순위 30 / 일정 15 / 경기중 1 / 종료 6시간. (요구사항 4)
const TTL_STANDINGS = 30
const TTL_FIXTURES = 15
const TTL_LIVE = 1
const TTL_FINISHED = 360
const TTL_CONFIG = 12 * 60   // league_id/season/팀맵 해석 결과 캐시(12시간)
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
// API-FOOTBALL v3: response[0].league.standings = [[ row, ... ]] (그룹 배열). 이를 펼친다.
function unwrapStandings(raw: any): any[] {
  const afGroups = raw?.response?.[0]?.league?.standings
  if (Array.isArray(afGroups)) return afGroups.flat()
  return raw?.standings || raw?.response || raw?.data || raw?.table || (Array.isArray(raw) ? raw : [])
}
function normalizeStandings(raw: any) {
  const rows = unwrapStandings(raw)
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

// ── K리그1 league_id·season·팀맵 자동 해석(하드코딩 금지, 12h 캐시) ──
//   API-FOOTBALL: /leagues?country=South Korea → "K League 1" 선택 → 현재 시즌 →
//   /teams?league&season 로 팀명→clubId 매핑. 결과를 league_cache('league:config')에 저장.
function pickKLeague(list: any[]): any | null {
  const leagues = (list || []).map((e: any) => ({
    id: e?.league?.id, name: String(e?.league?.name || ''), type: e?.league?.type,
    seasons: e?.seasons || [],
  }))
  // 정확히 "K League 1" 우선, 없으면 이름에 'league 1' 포함(2부 K League 2 제외).
  return leagues.find(l => /k\s*league\s*1/i.test(l.name))
    || leagues.find(l => /league\s*1/i.test(l.name) && !/league\s*2/i.test(l.name))
    || null
}
async function resolveConfig(admin: any, base: string, headers: Record<string, string>) {
  const { data: cached } = await admin.from('league_cache').select('*').eq('cache_key', 'league:config').maybeSingle()
  if (cached?.data?.leagueId && Date.now() - new Date(cached.fetched_at).getTime() < TTL_CONFIG * 60000) {
    return cached.data
  }
  const raw = await fetchJson(`${base}/leagues?country=South%20Korea`, headers)
  const league = pickKLeague(Array.isArray(raw?.response) ? raw.response : [])
  if (!league?.id) throw new Error('kleague1_not_found')
  const seasons = league.seasons || []
  const cur = seasons.find((s: any) => s.current) || seasons[seasons.length - 1] || {}
  const season = cur.year
  const coverage = cur.coverage || {}
  // 팀맵: /teams?league&season → 팀명 → clubId
  const teamMap: Record<string, number> = {}
  try {
    const tRaw = await fetchJson(`${base}/teams?league=${league.id}&season=${season}`, headers)
    for (const e of (Array.isArray(tRaw?.response) ? tRaw.response : [])) {
      const id = e?.team?.id; const name = e?.team?.name
      if (id && name) { const club = toClubId(name, String(id)); teamMap[club] = id }
    }
  } catch { /* 팀맵 없으면 팀별 조회는 스킵 */ }
  const config = { leagueId: league.id, leagueName: league.name, season, coverage, teamMap, resolvedAt: new Date().toISOString() }
  await admin.from('league_cache').upsert({ cache_key: 'league:config', data: config, fetched_at: new Date().toISOString() })
  return config
}

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
      // 자동 선택: K리그1 league_id + 현재 시즌 + coverage (하드코딩 아님).
      const picked = pickKLeague(list)
      let resolved = null
      if (picked?.id) {
        const cur = (picked.seasons || []).find((s: any) => s.current) || (picked.seasons || []).slice(-1)[0] || {}
        resolved = { leagueId: picked.id, leagueName: picked.name, season: cur.year, current: !!cur.current, coverage: cur.coverage || {} }
      }
      // 계정 quota 도 함께.
      let quota = null
      try { const st = await fetchJson(`${AF_BASE}/status`, afHeaders); quota = st?.response ?? null } catch { /* noop */ }
      return json({ ok: true, provider: 'api-football', country: 'South Korea', leagues, resolved, quota, fetchedAt: new Date().toISOString() })
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

  const resource = String(body.resource || 'standings')       // standings | fixtures | results | match
  const teamId = body.teamId ? String(body.teamId) : ''       // FANCLUV clubId
  const matchId = body.matchId ? String(body.matchId) : ''
  const force = !!body.force                                   // 강제 동기화(캐시 무시)
  if (!['standings', 'fixtures', 'results', 'match'].includes(resource)) return json({ ok: false, error: 'bad_resource' })

  const cacheKey =
    resource === 'match' ? `match:${matchId}`
    : resource === 'results' ? `results:${teamId || 'all'}`
    : resource === 'fixtures' ? `fixtures:${teamId || 'all'}`
    : 'standings'

  // 1) 캐시 확인(강제 동기화면 스킵). TTL 은 resource/내용(경기중)에 따라 아래에서 판정.
  const { data: cached } = await admin.from('league_cache').select('*').eq('cache_key', cacheKey).maybeSingle()
  const cacheAgeMs = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity
  const cachedTtlMin = cached?.data?._ttlMin || (resource === 'standings' ? TTL_STANDINGS : TTL_FIXTURES)
  if (!force && cached && cacheAgeMs < cachedTtlMin * 60000) {
    return json({ ok: true, resource, source: 'cache', cachedAt: cached.fetched_at, ...(cached.data || {}) })
  }

  // API 미설정 → Mock 금지: 마지막 캐시(stale) 또는 not_configured(클라이언트가 EmptyState).
  if (!API_BASE || !API_KEY) {
    if (cached?.data) return json({ ok: true, resource, source: 'stale', cachedAt: cached.fetched_at, ...cached.data })
    return json({ ok: false, code: 'not_configured', resource })
  }

  const headers = IS_AF ? afHeaders : (() => {
    const h: Record<string, string> = { Accept: 'application/json' }
    if (API_KEY) { h.Authorization = `Bearer ${API_KEY}`; h['X-API-Key'] = API_KEY; h['x-apisports-key'] = API_KEY }
    return h
  })()

  // 2) 실제 API 호출 + 정규화
  try {
    let payload: Record<string, unknown> = {}
    let ttlMin = resource === 'standings' ? TTL_STANDINGS : TTL_FIXTURES

    if (IS_AF) {
      // ── API-FOOTBALL 경로: league_id/season/팀맵 자동 해석 후 파라미터로 조회 ──
      const cfg = await resolveConfig(admin, AF_BASE, afHeaders)
      const L = `league=${cfg.leagueId}&season=${cfg.season}`
      if (resource === 'match') {
        if (!matchId) return json({ ok: false, code: 'no_match_id' })
        const raw = await fetchJson(`${AF_BASE}/fixtures?id=${encodeURIComponent(matchId)}`, afHeaders)
        const m = normalizeFixtures(raw)[0] || null
        payload = { match: m }
        ttlMin = m?.status === 'finished' ? TTL_FINISHED : (m?.status === 'live' ? TTL_LIVE : TTL_FIXTURES)
      } else if (resource === 'standings') {
        const raw = await fetchJson(`${AF_BASE}/standings?${L}`, afHeaders)
        payload = { standings: normalizeStandings(raw) }
        ttlMin = TTL_STANDINGS
      } else {
        // fixtures(전체 일정) / results(종료 경기). 특정 팀이면 팀맵으로 team= 추가.
        const apiTeam = teamId ? cfg.teamMap?.[teamId] : null
        const teamQ = apiTeam ? `&team=${apiTeam}` : ''
        const statusQ = resource === 'results' ? '&status=FT-AET-PEN' : ''
        const raw = await fetchJson(`${AF_BASE}/fixtures?${L}${teamQ}${statusQ}`, afHeaders)
        const list = normalizeFixtures(raw)
        payload = { fixtures: list }
        const hasLive = list.some((m: any) => m.status === 'live')
        ttlMin = resource === 'results' ? TTL_FINISHED : (hasLive ? TTL_LIVE : TTL_FIXTURES)
      }
    } else {
      // ── 제네릭 벤더(LEAGUE_API_BASE) 경로 — 기존 호환 ──
      if (resource === 'standings') {
        payload = { standings: normalizeStandings(await fetchJson(`${API_BASE}/standings`, headers)) }
      } else {
        const path = teamId ? `${API_BASE}/fixtures?team=${encodeURIComponent(teamId)}` : `${API_BASE}/fixtures`
        payload = { fixtures: normalizeFixtures(await fetchJson(path, headers)) }
      }
    }

    const arr = (payload.standings || payload.fixtures) as unknown[] | undefined
    const hasData = resource === 'match' ? !!payload.match : Array.isArray(arr) && arr.length > 0

    if (hasData) {
      const now = new Date().toISOString()
      await admin.from('league_cache').upsert({ cache_key: cacheKey, data: { ...payload, _ttlMin: ttlMin }, fetched_at: now })
      return json({ ok: true, resource, source: 'api', cachedAt: now, ...payload })
    }
    // 빈 응답 → 마지막 캐시(stale) → 없으면 empty. (Mock 금지)
    if (cached?.data) return json({ ok: true, resource, source: 'stale', cachedAt: cached.fetched_at, ...cached.data })
    return json({ ok: false, code: 'empty', resource })
  } catch (e) {
    if (cached?.data) return json({ ok: true, resource, source: 'stale', cachedAt: cached.fetched_at, ...cached.data })
    return json({ ok: false, code: 'error', resource, message: String(e).slice(0, 160) })
  }
})
