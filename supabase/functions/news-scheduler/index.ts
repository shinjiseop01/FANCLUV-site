// FANCLUV — 12개 구단 공식 뉴스 자동 수집 오케스트레이터 (Supabase Edge, Deno).
//
// 트리거: pg_cron(*/20) → pg_net.http_post → 이 함수. (Vercel Hobby 플랜은 20분 cron 불가라
//   Supabase 네이티브 스케줄러 사용.) verify_jwt=false 로 배포하고 자체 시크릿으로 인증한다.
//
// 흐름: (SCHEDULER_SECRET 인증) → 중복실행 락(news_collection_runs partial UNIQUE) →
//   11개 구단 news-fetcher(제한 동시성 3) + FC안양 Vercel Node collector(HTTP) 실패 격리 →
//   run 로그 확정. dedup 은 기존 UNIQUE(team_id, source_article_id) 유지. AI 는 기존 lazy.
//
// 시크릿(Supabase Function Secrets, 서버 전용):
//   SCHEDULER_SECRET       : 이 함수 트리거 인증(Vault 에서 pg_cron 이 주입)
//   NEWS_COLLECTOR_SECRET  : FC안양 Vercel endpoint 호출용(코드/로그 비노출)
//   ANYANG_COLLECT_URL     : (선택) 기본 https://fancluv.com/api/collect-anyang-news
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY : 플랫폼 자동 주입
//
// 배포: supabase functions deploy news-scheduler --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const EDGE_CLUBS = ['jeonbuk', 'gimcheon', 'gwangju', 'seoul', 'ulsan', 'pohang', 'daejeon', 'gangwon', 'jeju', 'incheon', 'bucheon']
const CONCURRENCY = 3
const CLUB_TIMEOUT_MS = 30000
const ANYANG_TIMEOUT_MS = 30000
const STALE_LOCK_MIN = 15

type SrcResult = { source: string; ok: boolean; fetched: number; written: number; ms: number; error: string | null }

// 소스별 결과 → run 요약(schedulerLogic.summarizeRun 과 동일 계약).
function summarizeRun(results: SrcResult[]) {
  const ok = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  const status = results.length === 0 ? 'failed' : failed.length === 0 ? 'success' : ok.length === 0 ? 'failed' : 'partial'
  return { status, successful_sources: ok.length, failed_sources: failed.length, articles_written: results.reduce((s, r) => s + (r.written || 0), 0) }
}

// 제한 동시성 실행 풀(무제한 Promise.all 금지 — 공식 서버 순간부하 방지).
async function runPool<T, R>(items: T[], limit: number, worker: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let idx = 0
  const next = async () => { while (idx < items.length) { const i = idx++; out[i] = await worker(items[i]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next))
  return out
}

// 한 구단을 news-fetcher(collect)로 수집. 타임아웃 + 1회 재시도. 항상 결과 객체 반환(격리).
async function collectEdgeClub(club: string, baseUrl: string, serviceKey: string): Promise<SrcResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/functions/v1/news-fetcher`
  const started = Date.now()
  const once = async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), CLUB_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'collect', clubs: [club] }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.ok) throw new Error(body?.error || `http_${res.status}`)
      const r = (body.results && body.results[0]) || {}
      if (r.ok === false) throw new Error(r.error || 'collect_failed')
      return { source: club, ok: true, fetched: r.collected ?? 0, written: r.written ?? 0, ms: Date.now() - started, error: null }
    } finally { clearTimeout(timer) }
  }
  try { return await once() } catch {
    await new Promise((r) => setTimeout(r, 1500))
    try { return await once() } catch (e2) { return { source: club, ok: false, fetched: 0, written: 0, ms: Date.now() - started, error: String((e2 as Error)?.message || e2).slice(0, 120) } }
  }
}

// FC안양: Vercel Node collector 호출(RSA-only TLS 때문에 Node 런타임). 시크릿 인증.
async function collectAnyang(anyangUrl: string, secret: string): Promise<SrcResult> {
  const started = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ANYANG_TIMEOUT_MS)
  try {
    const res = await fetch(anyangUrl, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: '{}',
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `http_${res.status}`)
    return { source: 'anyang', ok: true, fetched: body.collected ?? 0, written: body.written ?? 0, ms: Date.now() - started, error: null }
  } catch (e) {
    return { source: 'anyang', ok: false, fetched: 0, written: 0, ms: Date.now() - started, error: String((e as Error)?.message || e).slice(0, 120) }
  } finally { clearTimeout(timer) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SCHEDULER_SECRET = Deno.env.get('SCHEDULER_SECRET') || ''
  const ANYANG_SECRET = Deno.env.get('NEWS_COLLECTOR_SECRET') || ''
  const ANYANG_URL = Deno.env.get('ANYANG_COLLECT_URL') || 'https://fancluv.com/api/collect-anyang-news'

  // 인증: 전용 SCHEDULER_SECRET 또는 service_role bearer.
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  let authorized = !!SCHEDULER_SECRET && bearer === SCHEDULER_SECRET
  if (!authorized && bearer === SERVICE) authorized = true
  if (!authorized) return json({ ok: false, error: 'unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } })
  const trigger = req.headers.get('x-scheduler-trigger') === 'manual' ? 'manual' : 'cron'

  // 1) 중복 실행 락: 죽은 running 정리 → running INSERT(23505 → 이미 실행중이라 skip).
  const staleBefore = new Date(Date.now() - STALE_LOCK_MIN * 60000).toISOString()
  await admin.from('news_collection_runs').update({ status: 'timeout', finished_at: new Date().toISOString() }).eq('status', 'running').lt('started_at', staleBefore)
  const { data: run, error: lockErr } = await admin.from('news_collection_runs').insert({ status: 'running', trigger }).select('id').single()
  if (lockErr) {
    if ((lockErr as { code?: string }).code === '23505') return json({ ok: true, skipped: 'locked' })
    return json({ ok: false, error: `lock_${lockErr.message}` }, 200)
  }
  const runId = run.id
  const started = Date.now()

  try {
    // 2) 11개 구단(제한 동시성) + 안양(HTTP) 병렬 격리.
    const [edge, anyang] = await Promise.all([
      runPool(EDGE_CLUBS, CONCURRENCY, (c) => collectEdgeClub(c, SUPABASE_URL, SERVICE)),
      collectAnyang(ANYANG_URL, ANYANG_SECRET),
    ])
    const results = [...edge, anyang]
    const sum = summarizeRun(results)

    // 3) run 로그 확정.
    await admin.from('news_collection_runs').update({
      finished_at: new Date().toISOString(), status: sum.status,
      successful_sources: sum.successful_sources, failed_sources: sum.failed_sources,
      articles_written: sum.articles_written, duration_ms: Date.now() - started, detail: results,
    }).eq('id', runId)
    return json({ ok: true, runId, ...sum, detail: results })
  } catch (e) {
    const msg = String((e as Error)?.message || e).slice(0, 200)
    await admin.from('news_collection_runs').update({ finished_at: new Date().toISOString(), status: 'failed', duration_ms: Date.now() - started, detail: [{ error: msg }] }).eq('id', runId)
    return json({ ok: false, runId, error: msg }, 200)
  }
})
