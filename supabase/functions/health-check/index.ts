// FANCLUV — 통합 상태 점검 (Supabase Edge Function, Deno).
//
// 서버에서만 확인 가능한 외부 서비스(Supabase DB/Auth, OpenAI, Email, Edge)의 상태를
// 점검해 관리자 시스템 상태 대시보드(AdminSystemStatus)에 돌려준다. 관리자만 호출 가능.
// 비밀 키 자체는 절대 반환하지 않고, "설정 여부/응답 여부/응답시간"만 반환한다.
//
// 배포(관리자만 — 내부에서 role 재확인, verify_jwt 기본 유지):
//   supabase functions deploy health-check
//   (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 자동 주입)
// 응답: { ok, services: { db, auth, openai, email, edge } } — 각 { ok, ms, status, error }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SLOW_MS = 1500

function svc(ok: boolean, ms: number, error: string | null = null, disabled = false) {
  const status = disabled ? 'disabled' : !ok ? 'error' : ms > SLOW_MS ? 'slow' : 'ok'
  return { ok, ms, status, error }
}
async function timed<T>(fn: () => Promise<T>): Promise<[T | null, number, string | null]> {
  const t0 = Date.now()
  try { const r = await fn(); return [r, Date.now() - t0, null] }
  catch (e) { return [null, Date.now() - t0, String((e as Error)?.message || e)] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

  // 관리자 인증
  const authHeader = req.headers.get('Authorization') || ''
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ ok: false, code: 'unauthorized' })
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin', 'staff'].includes(prof?.role)) return json({ ok: false, code: 'forbidden' })

  // 어떤 서비스를 점검할지(단일 테스트면 only=key). 없으면 전부.
  const { only } = await req.json().catch(() => ({ only: null }))
  const want = (k: string) => !only || only === k

  const services: Record<string, unknown> = {}

  // ── Supabase Database ──
  if (want('db')) {
    const [, ms, err] = await timed(async () => {
      const { error } = await admin.from('profiles').select('id', { count: 'exact', head: true }).limit(1)
      if (error) throw error
    })
    services.db = svc(!err, ms, err)
  }

  // ── Supabase Auth ──
  if (want('auth')) {
    const [, ms, err] = await timed(async () => {
      const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
      if (error) throw error
    })
    services.auth = svc(!err, ms, err)
  }

  // ── Edge Functions (이 함수가 응답 = alive) ──
  if (want('edge')) services.edge = svc(true, 0, null)

  // ── Supabase Storage (버킷 목록 조회로 alive 확인) ──
  if (want('storage')) {
    const [buckets, ms, err] = await timed(async () => {
      const { data, error } = await admin.storage.listBuckets()
      if (error) throw error
      return data
    })
    // 버킷이 하나도 없어도 서비스 자체는 alive(설정 문제와 구분).
    services.storage = err ? svc(false, ms, err) : svc(true, ms, null)
  }

  // ── Supabase Realtime (서버측 alive 확인: REST 헬스 엔드포인트) ──
  // 실제 WS 구독은 클라이언트에서 점검(브라우저 실경로). 여기서는 서비스 응답 여부만 본다.
  if (want('realtime')) {
    const [status, ms] = await timed(async () => {
      const r = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      })
      // 인증된 요청에 서비스가 응답(2xx/4xx)하면 alive. 5xx/네트워크 오류만 down.
      return r.status
    })
    const code = typeof status === 'number' ? status : 0
    const alive = code > 0 && code < 500
    services.realtime = alive ? svc(true, ms, null) : svc(false, ms, code ? `http_${code}` : 'network_error')
  }

  // ── OpenAI API (키 있으면 models 엔드포인트 경량 확인 — 무료 GET, 카테고리화) ──
  // "Secret 존재"와 "실제 키 유효"를 구분한다. 키 값은 로그/응답에 절대 노출하지 않는다.
  if (want('openai')) {
    if (!OPENAI_API_KEY) services.openai = svc(false, 0, 'unconfigured', true)
    else {
      const [cat, ms] = await timed(async () => {
        const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } })
        if (r.ok) return 'valid'
        if (r.status === 401) return 'invalid_key'
        if (r.status === 403) return 'billing_required'
        if (r.status === 429) {
          const b = await r.json().catch(() => ({}))
          return (b?.error?.type === 'insufficient_quota') ? 'quota_exceeded' : 'rate_limited'
        }
        return `http_${r.status}`
      })
      const status = cat || 'network_error'
      // valid 만 ok. 그 외(invalid_key/quota/billing/rate/network)는 error 로 표기 + 실제 코드 노출.
      services.openai = { ok: status === 'valid', ms, status: status === 'valid' ? (ms > SLOW_MS ? 'slow' : 'ok') : 'error', error: status === 'valid' ? null : status }
    }
  }

  // ── Email Service (Resend 키 존재 여부 — 실제 발송은 안 함) ──
  if (want('email')) {
    services.email = RESEND_API_KEY ? svc(true, 0, null) : svc(false, 0, 'not_configured', true)
  }

  return json({ ok: true, services })
})
