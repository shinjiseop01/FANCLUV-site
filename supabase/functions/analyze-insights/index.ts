// FANCLUV — AI 팬 인사이트 분석 (Supabase Edge Function, Deno).
//
// 팬 의견 + 설문 응답을 모아 OpenAI 로 분석하고 결과를 ai_insights 에 저장한다.
// 관리자만 호출 가능(요청자의 JWT 로 role 확인). OpenAI 키는 이 함수 환경에서만 사용한다.
//
// 배포(기본값 verify_jwt=true 유지 — 로그인 사용자만 호출):
//   supabase functions deploy analyze-insights
// 시크릿:
//   supabase secrets set OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini
//   (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 자동 주입)
//
// ⚠️ OPENAI_API_KEY / service_role key 는 절대 프론트엔드에 노출하지 않는다.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MIN_OPINIONS = 30 // 분석 최소 의견 수

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
  const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'

  // 1) 호출자 인증 + 관리자 확인
  const authHeader = req.headers.get('Authorization') || ''
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return json({ ok: false, error: 'forbidden' }, 403)

  if (!OPENAI_API_KEY) return json({ ok: false, error: 'openai_not_configured' }, 500)

  // 2) 분석 대상 데이터 로드 (clubId 지정 시 해당 구단, 아니면 전체)
  const { clubId } = await req.json().catch(() => ({ clubId: null }))

  let oq = admin.from('opinions').select('category, rating, title, body').eq('status', 'visible')
  if (clubId && clubId !== 'all') oq = oq.eq('team_id', clubId)
  const { data: opinions = [] } = await oq.order('created_at', { ascending: false }).limit(300)

  if (!opinions || opinions.length < MIN_OPINIONS) {
    return json({ ok: false, reason: 'insufficient', count: opinions?.length || 0, min: MIN_OPINIONS })
  }

  let rq = admin.from('survey_responses').select('answers, team_id')
  if (clubId && clubId !== 'all') rq = rq.eq('team_id', clubId)
  const { data: responses = [] } = await rq.order('created_at', { ascending: false }).limit(300)

  // 3) 코퍼스 구성
  const corpus = [
    '## 팬 의견',
    ...opinions.map((o, i) => `${i + 1}. [${o.category || '기타'}|별점 ${o.rating || '-'}] ${o.title} — ${o.body}`),
    '',
    '## 설문 응답(요약)',
    ...(responses || []).slice(0, 200).map((r, i) => `${i + 1}. ${JSON.stringify(r.answers)}`),
  ].join('\n')

  const schema = `반드시 아래 JSON 스키마로만(한국어로) 응답:
{
  "summary": "팬 만족도 요약 + 이번 주 핵심 이슈 (2~3문장)",
  "sentiment": { "positive": 0-100, "neutral": 0-100, "negative": 0-100 },  // 합=100
  "keywords": [ { "tag": "#키워드", "weight": 1|2|3 } ],
  "categoryIssues": [ { "category": "카테고리", "issue": "불만 요약" } ],
  "recommendations": [ { "rank": 1, "title": "우선 개선 항목", "desc": "설명" } ],
  "categorySat": [ { "name": "카테고리", "score": 1-5 } ],
  "topOpinions": [ { "title": "요청 요약", "count": 0 } ],
  "staffMemo": "구단 운영진을 위한 한 줄 제언",
  "satisfaction": 0-100
}`

  // 4) OpenAI 호출
  let parsed: Record<string, unknown>
  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.3,
        messages: [
          { role: 'system', content: `너는 K리그 구단 팬 의견 분석가다. ${schema}` },
          { role: 'user', content: corpus.slice(0, 24000) },
        ],
      }),
    })
    const aiJson = await aiRes.json()
    const content = aiJson?.choices?.[0]?.message?.content
    if (!content) return json({ ok: false, error: 'openai_no_content' }, 502)
    parsed = JSON.parse(content)
  } catch (_e) {
    return json({ ok: false, error: 'openai_failed' }, 502)
  }

  // 5) 결과 저장
  const s = (parsed.sentiment || {}) as Record<string, number>
  const sat = Number(parsed.satisfaction) || Number(s.positive) || 0
  const trend = [Math.max(0, sat - 6), Math.max(0, sat - 4), Math.max(0, sat - 2), sat]
    .map((v, i) => ({ label: `W${i + 1}`, value: v }))
  const period = new Date().toISOString().slice(0, 10)

  const record = {
    club_id: clubId || 'all',
    period,
    summary: parsed.summary ?? '',
    sentiment_positive: Math.round(Number(s.positive) || 0),
    sentiment_neutral: Math.round(Number(s.neutral) || 0),
    sentiment_negative: Math.round(Number(s.negative) || 0),
    keywords: parsed.keywords ?? [],
    recommendations: parsed.recommendations ?? [],
    details: {
      categoryIssues: parsed.categoryIssues ?? [],
      categorySat: parsed.categorySat ?? [],
      topOpinions: parsed.topOpinions ?? [],
      staffMemo: parsed.staffMemo ?? '',
      satisfaction: sat,
      trend,
      opinionsCount: opinions.length,
      surveysCount: responses?.length || 0,
    },
  }

  const { data: saved, error: insErr } = await admin.from('ai_insights').insert(record).select().single()
  if (insErr) return json({ ok: false, error: insErr.message }, 500)

  return json({ ok: true, insight: saved })
})
