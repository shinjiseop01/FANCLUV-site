// FANCLUV — K리그 공식 경기 상세 수집기 (Supabase Edge Function, Deno).
//
// 소스(공식, 확인됨): www.kleague.com/api/ddf/match  (form-urlencoded POST)
//   · matchInfo.do   {year,leagueId,gameId,meetSeq} → 득점(homeScorer/awayScorer) + 이벤트(firstHalf/secondHalf…)
//   · matchRecord.do {year,leagueId,gameId,meetSeq} → 팀 경기기록(home/away 10필드)
// 수집→정규화→league_matches.detail_* 갱신. 브라우저는 이 함수를 호출하지 않는다(스케줄러/관리자만).
// 사용자는 DB(read RPC league_match_detail)만 읽는다 → 외부 호출은 사용자 수와 무관(§32/§33).
//
// 인증: x-league-secret == LEAGUE_SYNC_SECRET. 그 외 401. SSRF: 공식 호스트 고정, 사용자 URL 없음.
// 대상: finished + detail 미수집(immutable — 종료 경기 상세는 1회 수집 후 재호출 안 함). match 모드는 강제 재수집.
// 부분 실패: matchInfo/matchRecord 중 하나만 성공해도 그 부분 저장(status='partial'). 둘 다 빈값이면
//   기존 상세 보존(덮어쓰지 않음), detail_error 기록. 외부 부하 최소화 위해 순차 + delay + 배치 상한.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HOST = 'https://www.kleague.com'
const API = `${HOST}/api/ddf/match`
const UA = 'Mozilla/5.0 (compatible; FANCLUV/1.0; +https://fancluv.com)'
const TIMEOUT_MS = 8000
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-league-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const numOrNull = (v: unknown) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const sideOf = (v: unknown) => { const s = String(v || '').toUpperCase(); return s === 'HOME' ? 'home' : s === 'AWAY' ? 'away' : null }
const clean = (v: unknown) => String(v ?? '').trim()
const absMinute = (halfType: unknown, timeMin: unknown) => {
  const h = Number(halfType) || 1; const m = Number(timeMin) || 0
  return (h === 2 ? 45 : h === 3 ? 90 : h === 4 ? 105 : 0) + m
}
const allEvents = (info: any) => [
  ...(Array.isArray(info?.firstHalf) ? info.firstHalf : []),
  ...(Array.isArray(info?.secondHalf) ? info.secondHalf : []),
  ...(Array.isArray(info?.EfirstHalf) ? info.EfirstHalf : []),
  ...(Array.isArray(info?.EsecondHalf) ? info.EsecondHalf : []),
]

// 순수 모듈(src/lib/league/kleagueMatchDetail.js)과 동일 규칙(테스트가 규격을 고정).
function normalizeDetailEvents(info: any) {
  if (!info) return null
  const assistByKey: Record<string, string> = {}
  for (const e of allEvents(info)) if (clean(e.eventName) === '도움') {
    const side = sideOf(e.homeOrAway); const min = absMinute(e.halfType, e.timeMin)
    if (side) assistByKey[`${side}:${min}`] = clean(e.playerName) || ''
  }
  const buildGoals = (list: any, side: string) => (Array.isArray(list) ? list : []).map((g: any) => {
    const minute = numOrNull(g.time)
    return { side, player: clean(g.name), minute, ownGoal: g.isOwnGoal === true, assist: (minute != null && assistByKey[`${side}:${minute}`]) || null }
  }).filter((g: any) => g.player)
  const goals = [...buildGoals(info.homeScorer, 'home'), ...buildGoals(info.awayScorer, 'away')]

  const cards: any[] = []; const subs: any[] = []
  for (const e of allEvents(info)) {
    const name = clean(e.eventName); const side = sideOf(e.homeOrAway)
    if (name === '경고' || name === '퇴장' || name === '경고누적' || name.includes('퇴장')) {
      const type = name === '경고' ? 'yellow' : 'red'; const player = clean(e.playerName)
      if (side && player) cards.push({ side, player, minute: absMinute(e.halfType, e.timeMin), type })
    } else if (name === '교체') {
      const playerOut = clean(e.playerName); const playerIn = clean(e.playerName2)
      if (side && (playerOut || playerIn)) subs.push({ side, playerOut: playerOut || null, playerIn: playerIn || null, minute: absMinute(e.halfType, e.timeMin) })
    }
  }
  const order: Record<string, number> = { goal: 0, card: 1, sub: 2 }
  const timeline = [
    ...goals.map((g: any) => ({ kind: 'goal', minute: g.minute ?? 0, side: g.side, player: g.player, ownGoal: g.ownGoal, assist: g.assist })),
    ...cards.map((c: any) => ({ kind: 'card', minute: c.minute ?? 0, side: c.side, player: c.player, cardType: c.type })),
    ...subs.map((s: any) => ({ kind: 'sub', minute: s.minute ?? 0, side: s.side, playerIn: s.playerIn, playerOut: s.playerOut })),
  ].sort((a: any, b: any) => (a.minute - b.minute) || (order[a.kind] - order[b.kind]))
  if (goals.length === 0 && cards.length === 0 && subs.length === 0) return null
  return { goals, cards, subs, timeline }
}
const STAT_FIELDS = ['possession', 'attempts', 'onTarget', 'corners', 'fouls', 'offsides', 'freeKicks', 'yellowCards', 'redCards']
function normalizeTeamStats(record: any) {
  const one = (raw: any) => {
    if (!raw || typeof raw !== 'object') return null
    const o: Record<string, number | null> = {}; let any = false
    for (const k of STAT_FIELDS) { const v = numOrNull(raw[k]); o[k] = v; if (v != null) any = true }
    return any ? o : null
  }
  const home = one(record?.home); const away = one(record?.away)
  return (home || away) ? { home, away } : null
}

async function postForm(path: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params).toString()
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(`${API}${path}`, {
        method: 'POST', signal: ctrl.signal,
        // Accept-Language: ko → 공식 응답의 선수명을 한국어로(서버 리전 IP 무관, 공식 사이트와 동일). lang 파라미터는 무시됨.
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'ko-KR,ko;q=0.9', 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      if (!res.ok) throw new Error(`http ${res.status}`)
      const j = await res.json()
      if (String(j?.resultCode) !== '200') throw new Error(`result ${j?.resultCode}`)
      return j?.data ?? null
    } catch (e) { lastErr = e } finally { clearTimeout(timer) }
  }
  throw lastErr
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const SECRET = Deno.env.get('LEAGUE_SYNC_SECRET') || ''
  if (!SECRET || req.headers.get('x-league-secret') !== SECRET) return json({ ok: false, code: 'unauthorized' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))
  const mode = ['recent', 'backfill', 'match'].includes(String(body.mode)) ? String(body.mode) : 'recent'
  const LIMITS: Record<string, number> = { recent: 15, backfill: 40, match: 1 }

  // 대상 선정: finished + 상세 미수집(immutable). match 모드는 특정 gameId 강제 재수집.
  let targets: any[] = []
  if (mode === 'match') {
    const gid = String(body.gameId || body.externalId || '')
    if (!gid) return json({ ok: false, code: 'missing_gameId' })
    const { data } = await admin.from('league_matches').select('external_id, season_year, league_id').eq('external_id', gid).limit(1)
    targets = data || []
  } else {
    const { data } = await admin.from('league_matches')
      .select('external_id, season_year, league_id')
      .eq('status', 'finished').is('detail_synced_at', null)
      .order('kickoff_at', { ascending: false, nullsFirst: false })
      .limit(LIMITS[mode])
    targets = data || []
  }

  let ok = 0, partial = 0, failed = 0
  for (const m of targets) {
    const params = { year: String(m.season_year), leagueId: String(m.league_id || 1), gameId: String(m.external_id), meetSeq: '1' }
    let info: any = null, record: any = null, infoErr = '', recErr = ''
    try { info = await postForm('/matchInfo.do', params) } catch (e) { infoErr = String(e).slice(0, 80) }
    try { record = await postForm('/matchRecord.do', params) } catch (e) { recErr = String(e).slice(0, 80) }

    const events = normalizeDetailEvents(info)
    const stats = normalizeTeamStats(record)

    if (!events && !stats) {
      // 둘 다 빈값/실패 → 기존 상세 보존(덮어쓰지 않음). 미수집 상태 유지, 오류만 기록.
      failed++
      await admin.from('league_matches').update({ detail_error: (infoErr || recErr || 'empty').slice(0, 200) }).eq('external_id', m.external_id)
    } else {
      const status = (events && stats) ? 'ok' : 'partial'
      if (status === 'partial') partial++; else ok++
      const patch: Record<string, unknown> = { detail_synced_at: new Date().toISOString(), detail_status: status, detail_error: (infoErr || recErr || null) }
      if (events) patch.detail_events = events   // 성공한 부분만 갱신(빈값이면 기존 유지)
      if (stats) patch.detail_stats = stats
      await admin.from('league_matches').update(patch).eq('external_id', m.external_id)
    }
    await sleep(250)  // 외부 부하 완화
  }

  await admin.from('league_sync_state').upsert({
    resource: 'match_detail', last_success_at: new Date().toISOString(),
    last_rows: ok + partial, updated_at: new Date().toISOString(),
  }, { onConflict: 'resource' })

  return json({ ok: true, mode, targets: targets.length, collected: ok, partial, failed })
})
