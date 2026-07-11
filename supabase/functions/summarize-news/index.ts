// FANCLUV — 뉴스 AI 요약 (Supabase Edge Function, Deno).
//
// 뉴스 카드의 "AI 뉴스 요약" 버튼이 호출한다. 캐시(news_ai_summary)를 먼저 확인하고,
// 없으면 OpenAI 로 3~5개 핵심 bullet + 한 줄 요약 + 팬 포인트를 생성해 캐시에 저장한다.
// OpenAI 키가 없거나 실패하면 텍스트에서 추출한 요약(extractive)으로 자연스럽게 폴백한다.
//
// 배포: supabase functions deploy summarize-news   (verify_jwt=true — 로그인 팬만 호출)
// 시크릿: OPENAI_API_KEY / OPENAI_MODEL(선택) — 미설정 시 extractive 로 동작.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// 텍스트를 문장 단위로 쪼개 상위 N개를 뽑는 추출 요약(폴백).
function extractive(title: string, text: string) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  const sentences = [...new Set(clean.split(/(?<=[.!?。])\s+|(?<=다\.)\s*/).map(s => s.trim()).filter(s => s.length > 8))]
  const bullets = (sentences.length ? sentences : [clean]).slice(0, 4).map(s => s.length > 120 ? s.slice(0, 117) + '…' : s)
  return {
    one_liner: (title || clean).slice(0, 90),
    bullets: bullets.length ? bullets : [title || '요약할 내용이 충분하지 않습니다.'],
    fan_point: sentences[0] ? sentences[0].slice(0, 90) : '',
    model: 'extractive',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
  const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'

  // 로그인 사용자만.
  const auth = req.headers.get('Authorization') || ''
  const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ ok: false, code: 'unauthorized' })

  const { cacheKey, teamId, title, text } = await req.json().catch(() => ({}))
  if (!cacheKey || !title) return json({ ok: false, code: 'bad_request' })

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } })

  // 1) 캐시 조회 — 있으면 즉시 반환(재호출 없음).
  const { data: cached } = await admin.from('news_ai_summary').select('*').eq('cache_key', cacheKey).maybeSingle()
  if (cached) {
    return json({ ok: true, cached: true, oneLiner: cached.one_liner, bullets: cached.bullets, fanPoint: cached.fan_point, model: cached.model })
  }

  // 2) 생성 — OpenAI 우선, 실패/미설정 시 추출 폴백.
  let result = extractive(title, text || '')
  if (OPENAI_API_KEY) {
    try {
      const schema = `반드시 아래 JSON 으로만(한국어) 응답:
{ "one_liner": "한 줄 요약(한 문장)",
  "bullets": ["핵심 내용 3~5개(각 한 문장, 짧게)"],
  "fan_point": "팬이 알아야 할 포인트(한 문장)" }`
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          response_format: { type: 'json_object' },
          temperature: 0.3,
          messages: [
            { role: 'system', content: `너는 K리그 구단 뉴스 요약가다. 너무 긴 문단은 금지. ${schema}` },
            { role: 'user', content: `제목: ${title}\n본문: ${(text || '').slice(0, 6000)}` },
          ],
        }),
      })
      const aiJson = await aiRes.json()
      if (aiRes.ok && aiJson?.choices?.[0]?.message?.content) {
        const p = JSON.parse(aiJson.choices[0].message.content)
        const bullets = Array.isArray(p.bullets) ? p.bullets.filter((x: unknown) => typeof x === 'string' && x).slice(0, 5) : []
        if (bullets.length) {
          result = { one_liner: String(p.one_liner || title).slice(0, 120), bullets, fan_point: String(p.fan_point || ''), model: OPENAI_MODEL }
        }
      } else {
        console.error('summarize-news OpenAI error:', aiRes.status, aiJson?.error?.message)
      }
    } catch (e) {
      console.error('summarize-news exception:', String(e))
    }
  }

  // 3) 캐시 저장(다음부터 재호출 없음).
  await admin.from('news_ai_summary').upsert({
    cache_key: cacheKey, team_id: teamId || null, title,
    one_liner: result.one_liner, bullets: result.bullets, fan_point: result.fan_point,
    model: result.model, updated_at: new Date().toISOString(),
  }, { onConflict: 'cache_key' })

  return json({ ok: true, cached: false, oneLiner: result.one_liner, bullets: result.bullets, fanPoint: result.fan_point, model: result.model })
})
