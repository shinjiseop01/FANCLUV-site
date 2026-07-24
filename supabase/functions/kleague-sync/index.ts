// FANCLUV — K리그 공식 데이터 수집기 (Supabase Edge Function, Deno).
//
// 소스(공식, 확인됨): www.kleague.com
//   · 순위:      POST /record/teamRank.do?leagueId=1&year=YYYY&stadium=all&recordType=rank → data.teamRank[]
//   · 일정/결과: POST /getScheduleList.do  {leagueId,year,month}                            → data.scheduleList[]
// 수집→정규화→league_standings/league_matches/league_seasons upsert. 브라우저는 이 함수를 호출하지 않는다
// (스케줄러/관리자만). 사용자는 DB(read RPC)만 읽는다.
//
// 인증: x-league-secret == LEAGUE_SYNC_SECRET (스케줄러 pg_net / 관리자 RPC 경유). 그 외 401.
// SSRF: 공식 호스트(HOST) 고정. 사용자 입력 URL 없음.
// 배포: supabase functions deploy kleague-sync
// 시크릿: supabase secrets set LEAGUE_SYNC_SECRET=<random>  (SUPABASE_URL/SERVICE_ROLE_KEY 자동)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HOST = 'https://www.kleague.com'
const UA = 'Mozilla/5.0 (compatible; FANCLUV/1.0; +https://fancluv.com)'
const TIMEOUT_MS = 8000
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-league-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const CODE_TO_CLUB: Record<string, string> = {
  K01: 'ulsan', K03: 'pohang', K04: 'jeju', K05: 'jeonbuk', K09: 'seoul', K10: 'daejeon',
  K18: 'incheon', K21: 'gangwon', K22: 'gwangju', K26: 'bucheon', K27: 'anyang', K35: 'gimcheon',
}
const NAME_TO_CLUB: Record<string, string> = {
  '울산': 'ulsan', '포항': 'pohang', '제주': 'jeju', '전북': 'jeonbuk', '서울': 'seoul', '대전': 'daejeon',
  '인천': 'incheon', '강원': 'gangwon', '광주': 'gwangju', '부천': 'bucheon', '안양': 'anyang', '김천': 'gimcheon',
}
const toClub = (code: string, name: string): string | null =>
  CODE_TO_CLUB[String(code || '').toUpperCase().trim()] || NAME_TO_CLUB[String(name || '').trim()] || null
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const numOrNull = (v: unknown) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
function statusOf(gameStatus: string, endYn: string): string {
  const s = String(gameStatus || '').toUpperCase().trim()
  if (s === 'FE' || String(endYn || '').toUpperCase() === 'Y') return 'finished'
  if (s === 'PP' || s === 'PE') return 'postponed'
  if (s === 'CE' || s === 'CC') return 'cancelled'
  return 'scheduled'
}
function kickoffUtc(gameDate: string, gameTime: string): string | null {
  const d = String(gameDate || '').replace(/\./g, '-').replace(/-+$/, '')
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(d)) return null
  const t = /^\d{1,2}:\d{2}$/.test(String(gameTime || '').trim()) ? gameTime.trim() : '00:00'
  const [y, mo, da] = d.split('-').map(Number); const [hh, mm] = t.split(':').map(Number)
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`
  const dt = new Date(iso); return isNaN(dt.getTime()) ? null : dt.toISOString()
}

async function postJson(path: string, body?: unknown, query = ''): Promise<any> {
  const url = `${HOST}${path}${query}`
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'User-Agent': UA, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) throw new Error(`http ${res.status}`)
      const j = await res.json()
      if (String(j?.resultCode) !== '200') throw new Error(`result ${j?.resultCode}`)
      return j
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
  const leagueId = 1
  // 시즌: 지정값 우선, 없으면 KST 현재 연도(하드코딩 금지). year validation.
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const year = num(body.year) || kstNow.getUTCFullYear()
  if (year < 2000 || year > 2100) return json({ ok: false, code: 'bad_year' })
  const kstMonth = kstNow.getUTCMonth() + 1
  // mode: 'backfill'(시즌 전체 월 1~12) | 'incremental'(기본, 현재월±window). is_current 는 현재연도만.
  const mode = String(body.mode || 'incremental') === 'backfill' ? 'backfill' : 'incremental'
  const isCurrentYear = year === kstNow.getUTCFullYear()

  // season upsert + is_current 설정
  const { data: seasonRow, error: seErr } = await admin.from('league_seasons')
    .upsert({ league_id: leagueId, season_year: year, is_current: isCurrentYear, updated_at: new Date().toISOString() }, { onConflict: 'league_id,season_year' })
    .select('id').single()
  if (seErr || !seasonRow) return json({ ok: false, code: 'season_upsert_failed', message: String(seErr?.message || '').slice(0, 160) })
  if (isCurrentYear) await admin.from('league_seasons').update({ is_current: false }).eq('league_id', leagueId).neq('season_year', year)
  const seasonId = seasonRow.id

  const result: Record<string, unknown> = { ok: true, league: leagueId, season: year, mode }

  // ── 1) 순위 ── (실패/빈값이면 기존 유지, 에러만 기록)
  try {
    const raw = await postJson('/record/teamRank.do', undefined, `?leagueId=${leagueId}&year=${year}&stadium=all&recordType=rank`)
    const list = Array.isArray(raw?.data?.teamRank) ? raw.data.teamRank : []
    if (list.length > 0) {
      const rows = list.map((r: any) => ({
        season_id: seasonId, club_id: toClub(r.teamId, r.teamName), team_code: String(r.teamId || '').toUpperCase(),
        team_name: r.teamName || '', rank: num(r.rank), played: num(r.gameCount), wins: num(r.winCnt),
        draws: num(r.tieCnt), losses: num(r.lossCnt), goals_for: num(r.gainGoal), goals_against: num(r.lossGoal),
        goal_difference: num(r.gapCnt), points: num(r.gainPoint),
        form: ['game01', 'game02', 'game03', 'game04', 'game05'].map(k => ({ '승': 'W', '무': 'D', '패': 'L' } as any)[String(r[k] || '').trim()]).filter(Boolean),
        updated_at: new Date().toISOString(),
      }))
      const { error } = await admin.from('league_standings').upsert(rows, { onConflict: 'season_id,team_code' })
      if (error) throw new Error(error.message)
      await admin.from('league_sync_state').upsert({ resource: 'standings', last_success_at: new Date().toISOString(), last_rows: rows.length, updated_at: new Date().toISOString() }, { onConflict: 'resource' })
      result.standings = rows.length
    } else { throw new Error('empty_standings') }
  } catch (e) {
    await admin.from('league_sync_state').upsert({ resource: 'standings', last_error_at: new Date().toISOString(), last_error: String(e).slice(0, 200), updated_at: new Date().toISOString() }, { onConflict: 'resource' })
    result.standingsError = String(e).slice(0, 120)
  }

  // ── 2) 일정/결과 ── 현재월 기준 창(전1~후2월) 수집. 부분 실패 격리.
  try {
    // backfill: 시즌 전체(월 1~12). incremental: 현재월-1~+2(최근 결과 + 예정 일정 변경).
    //   외부 서버 부하 최소화 위해 월 순회는 순차(concurrency 1) + 각 요청 timeout/retry.
    const months: number[] = []
    if (mode === 'backfill') { for (let m = 1; m <= 12; m++) months.push(m) }
    else { for (let m = kstMonth - 1; m <= kstMonth + 2; m++) if (m >= 1 && m <= 12) months.push(m) }
    let all: any[] = []
    let monthErrors = 0
    for (const m of months) {
      try {
        const raw = await postJson('/getScheduleList.do', { leagueId: String(leagueId), year: String(year), month: String(m).padStart(2, '0') })
        const list = Array.isArray(raw?.data?.scheduleList) ? raw.data.scheduleList : []
        all = all.concat(list)
      } catch { monthErrors++ }
    }
    // 최소 한 달이라도 성공 + 데이터 있어야 upsert(전부 실패면 기존 유지).
    if (all.length > 0 && monthErrors < months.length) {
      const rows = all
        .filter((r: any) => r.gameId !== undefined && r.gameId !== null && String(r.gameId) !== '')
        .map((r: any) => {
          const status = statusOf(r.gameStatus, r.endYn); const fin = status === 'finished'
          return {
            external_id: String(r.gameId), league_id: leagueId, season_year: year, round: numOrNull(r.roundId),
            kickoff_at: kickoffUtc(r.gameDate, r.gameTime), game_date: String(r.gameDate || ''), game_time: String(r.gameTime || ''),
            home_club_id: toClub(r.homeTeam, r.homeTeamName), away_club_id: toClub(r.awayTeam, r.awayTeamName),
            home_code: String(r.homeTeam || '').toUpperCase(), away_code: String(r.awayTeam || '').toUpperCase(),
            home_team_name: r.homeTeamName || '', away_team_name: r.awayTeamName || '',
            home_score: fin ? numOrNull(r.homeGoal) : null, away_score: fin ? numOrNull(r.awayGoal) : null,
            status, stadium: r.fieldName || r.fieldNameFull || '', updated_at: new Date().toISOString(),
          }
        })
      // external_id 중복(같은 배열 내) 제거 — 마지막 값 우선
      const dedup = Object.values(Object.fromEntries(rows.map((r: any) => [r.external_id, r])))
      const { error } = await admin.from('league_matches').upsert(dedup, { onConflict: 'external_id' })
      if (error) throw new Error(error.message)
      await admin.from('league_sync_state').upsert({ resource: 'matches', last_success_at: new Date().toISOString(), last_rows: dedup.length, updated_at: new Date().toISOString() }, { onConflict: 'resource' })
      result.matches = dedup.length
    } else { throw new Error('empty_matches') }
  } catch (e) {
    await admin.from('league_sync_state').upsert({ resource: 'matches', last_error_at: new Date().toISOString(), last_error: String(e).slice(0, 200), updated_at: new Date().toISOString() }, { onConflict: 'resource' })
    result.matchesError = String(e).slice(0, 120)
  }

  return json(result)
})
