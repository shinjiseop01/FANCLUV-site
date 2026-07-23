// FANCLUV — 12개 구단 공식 뉴스 자동 수집 오케스트레이터 (Vercel Cron, 20분).
//
// 왜 Vercel Cron 오케스트레이터인가:
//   · 11개 구단은 Supabase Edge news-fetcher, FC안양은 이 프로젝트의 Node collector 로
//     수집 경로가 나뉜다(안양은 서버 RSA-only TLS 때문). 두 런타임을 한 곳에서 조율하려면
//     Node 오케스트레이터가 자연스럽다.
//   · Vercel Cron 은 시크릿(env)·인증(CRON_SECRET)·재시도·실행 로그를 플랫폼이 제공하고,
//     Supabase 확장(pg_cron/pg_net)·Vault·SQL 내 평문 시크릿이 필요없다.
//   · 20분 cadence(*/20)는 Team(Pro) 플랜에서 지원.
//
// 흐름: Vercel Cron → (인증) → 중복실행 락(news_collection_runs, partial UNIQUE) →
//   11개 구단 news-fetcher(제한 동시성 3) + 안양 collectAnyang(in-process, 실패격리) →
//   run 로그 확정(성공/부분/실패) → 소스 헬스는 각 collector 가 갱신.
//
// 보안: Authorization: Bearer <CRON_SECRET>(Vercel Cron 자동 주입). 시크릿 하드코딩/로그 금지.
//   news-fetcher 호출은 service_role bearer(서버 env). 수집 URL 은 각 collector 내부 고정(SSRF).
import { makeDb, collectAnyang } from '../collect-anyang-news.js'

// Supabase Edge news-fetcher 로 수집하는 11개 구단(안양 제외).
export const EDGE_CLUBS = [
  'jeonbuk', 'gimcheon', 'gwangju', 'seoul', 'ulsan',
  'pohang', 'daejeon', 'gangwon', 'jeju', 'incheon', 'bucheon',
]
const CONCURRENCY = 3            // 공식 서버 순간부하 방지(무제한 Promise.all 금지)
const CLUB_TIMEOUT_MS = 30000    // 구단당 news-fetcher 호출 타임아웃
const STALE_LOCK_MIN = 15        // 이보다 오래된 running 은 죽은 락 → timeout 처리

// 제한 동시성 실행 풀.
export async function runPool(items, limit, worker) {
  const results = new Array(items.length)
  let idx = 0
  async function next() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next))
  return results
}

// 한 구단을 Supabase news-fetcher(collect)로 수집. 타임아웃 + 1회 재시도.
async function collectEdgeClub(club, supabaseUrl, serviceKey) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/news-fetcher`
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
  try { return await once() }
  catch {
    await new Promise((r) => setTimeout(r, 1500))
    try { return await once() }
    catch (e2) { return { source: club, ok: false, fetched: 0, written: 0, ms: Date.now() - started, error: String(e2?.message || e2).slice(0, 120) } }
  }
}

// 순수 집계(테스트 대상): 소스별 결과 → run 요약.
export function summarize(results) {
  const ok = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  const status = failed.length === 0 ? 'success' : (ok.length === 0 ? 'failed' : 'partial')
  return {
    status,
    successful_sources: ok.length,
    failed_sources: failed.length,
    articles_written: results.reduce((s, r) => s + (r.written || 0), 0),
  }
}

export default async function handler(req, res) {
  // Vercel Cron 은 GET 으로 트리거한다. 수동 트리거도 허용(같은 시크릿).
  const cronSecret = process.env.CRON_SECRET
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!cronSecret || bearer !== cronSecret) return res.status(401).json({ ok: false, error: 'unauthorized' })

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  const db = makeDb(supabaseUrl, serviceKey)
  const trigger = req.headers['x-vercel-cron'] ? 'cron' : 'manual'

  // 1) 중복 실행 락: 죽은 running 정리 후 새 running INSERT(23505 → 이미 실행중이라 skip).
  const staleBefore = new Date(Date.now() - STALE_LOCK_MIN * 60000).toISOString()
  try { await db.patch('news_collection_runs', `status=eq.running&started_at=lt.${staleBefore}`, { status: 'timeout', finished_at: new Date().toISOString() }) } catch { /* noop */ }
  let runId = null
  try {
    const ins = await db.insertReturning('news_collection_runs', { status: 'running', trigger })
    if (ins.conflict) return res.status(200).json({ ok: true, skipped: 'locked', message: 'another run in progress' })
    runId = ins.row.id
  } catch (e) {
    return res.status(200).json({ ok: false, error: `lock_${String(e?.message || e).slice(0, 100)}` })
  }

  const startedAt = Date.now()
  try {
    // 2) 11개 구단(제한 동시성) + 안양(in-process) 병렬 격리.
    const [edgeResults, anyangResult] = await Promise.all([
      runPool(EDGE_CLUBS, CONCURRENCY, (club) => collectEdgeClub(club, supabaseUrl, serviceKey)),
      (async () => {
        const started = Date.now()
        try { const r = await collectAnyang(db); return { source: 'anyang', ok: true, fetched: r.collected, written: r.written, ms: Date.now() - started, error: null } }
        catch (e) { return { source: 'anyang', ok: false, fetched: 0, written: 0, ms: Date.now() - started, error: String(e?.message || e).slice(0, 120) } }
      })(),
    ])
    const results = [...edgeResults, anyangResult]
    const sum = summarize(results)

    // 3) run 로그 확정.
    await db.patch('news_collection_runs', `id=eq.${runId}`, {
      finished_at: new Date().toISOString(), status: sum.status,
      successful_sources: sum.successful_sources, failed_sources: sum.failed_sources,
      articles_written: sum.articles_written, duration_ms: Date.now() - startedAt, detail: results,
    })
    return res.status(200).json({ ok: true, runId, ...sum, detail: results })
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 200)
    try { await db.patch('news_collection_runs', `id=eq.${runId}`, { finished_at: new Date().toISOString(), status: 'failed', duration_ms: Date.now() - startedAt, detail: [{ error: msg }] }) } catch { /* noop */ }
    return res.status(200).json({ ok: false, runId, error: msg })
  }
}
