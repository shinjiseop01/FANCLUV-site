// FANCLUV — OpenAI 키 유효성 점검 (서버 전용, 최소 비용).
//
// "Secret 존재"와 "실제 키 유효"를 구분한다. 키 값은 절대 반환/로그하지 않는다.
// 최소 호출: GET /v1/models(무료, 키·모델 접근 확인) → 필요 시 max_tokens:1 완성(1토큰)
// 으로 실제 생성/quota 확인. 결과를 카테고리로만 반환한다.
//
// status: valid | invalid_key | quota_exceeded | billing_required |
//         model_unavailable | rate_limited | network_error | unconfigured
//
// 배포: supabase functions deploy openai-check --no-verify-jwt
//   (민감정보 없음 — 카테고리만 반환. 관리자 System Status/health-check 가 참조.)
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const OPENAI = 'https://api.openai.com/v1'

async function categorize(key: string, model: string) {
  // 1) 키·모델 접근 확인 (무료 GET).
  let r: Response
  try {
    r = await fetch(`${OPENAI}/models`, { headers: { Authorization: `Bearer ${key}` } })
  } catch {
    return { status: 'network_error', httpStatus: 0 }
  }
  if (r.status === 401) return { status: 'invalid_key', httpStatus: 401 }
  if (r.status === 403) return { status: 'billing_required', httpStatus: 403 }
  if (r.status === 429) {
    const body = await r.json().catch(() => ({}))
    const t = body?.error?.type || body?.error?.code || ''
    return { status: t === 'insufficient_quota' ? 'quota_exceeded' : 'rate_limited', httpStatus: 429 }
  }
  if (!r.ok) return { status: 'openai_error', httpStatus: r.status }

  const list = await r.json().catch(() => ({}))
  const ids = new Set((list?.data || []).map((m: any) => m.id))
  const modelOk = ids.has(model)

  // 2) 실제 생성 1토큰 확인(quota/billing 은 완성 호출에서 드러난다).
  let gen: Response
  try {
    gen = await fetch(`${OPENAI}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, temperature: 0 }),
    })
  } catch {
    return { status: 'network_error', httpStatus: 0, modelOk }
  }
  if (gen.ok) return { status: 'valid', httpStatus: 200, modelOk }
  if (gen.status === 401) return { status: 'invalid_key', httpStatus: 401, modelOk }
  if (gen.status === 404) return { status: 'model_unavailable', httpStatus: 404, modelOk }
  if (gen.status === 429) {
    const body = await gen.json().catch(() => ({}))
    const t = body?.error?.type || body?.error?.code || ''
    return { status: t === 'insufficient_quota' ? 'quota_exceeded' : 'rate_limited', httpStatus: 429, modelOk }
  }
  if (gen.status === 402 || gen.status === 403) return { status: 'billing_required', httpStatus: gen.status, modelOk }
  return { status: 'openai_error', httpStatus: gen.status, modelOk }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const KEY = Deno.env.get('OPENAI_API_KEY')
  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'
  const configured = !!KEY
  if (!KEY) return json({ ok: true, configured: false, status: 'unconfigured', model })

  const t0 = Date.now()
  const res = await categorize(KEY, model)
  return json({ ok: true, configured, model, responseMs: Date.now() - t0, checkedAt: new Date().toISOString(), ...res })
})
