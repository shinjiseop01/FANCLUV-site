// FANCLUV — 아이디(계정) 찾기 메일 발송 Edge Function (Deno). enumeration-safe.
//
// ┌─ 보안 계약 ────────────────────────────────────────────────────────────────┐
// │ • 입력: { nickname } 만 받는다(존재 신호가 될 email_hashed 등은 받지 않음). │
// │ • 존재 판정/이메일 조회는 service_role 전용 RPC(find_account_email_internal)│
// │   내부에서만 수행 → 클라이언트는 존재 여부를 알 수 없다.                    │
// │ • 계정 유무·발송 여부와 무관하게 항상 { ok: true } 만 반환.                 │
// │ • 서버/네트워크 장애 등 "처리 자체 실패"만 5xx 로 구분(존재 정보 아님).     │
// │ • rate limit: IP 기준 1분 윈도(공유 DB 로그 기반). 초과해도 { ok:true }.    │
// └────────────────────────────────────────────────────────────────────────────┘
//
// 배포: supabase functions deploy send-find-account-mail --no-verify-jwt
// ⚠️ service_role / RESEND_API_KEY 는 이 함수 환경에서만. 토큰/이메일/닉네임 원문 미로그.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// rate limit: 동일 IP 가 최근 RATE_WINDOW_SEC 내 RATE_MAX 회 초과 시 발송 스킵(응답은 동일).
const RATE_WINDOW_SEC = 60
const RATE_MAX = 5

// 클라이언트 IP 추출(프록시 헤더). 실패 시 null(=rate limit 미적용, 응답 동일).
function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for') || ''
  const first = xff.split(',')[0].trim()
  return first || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'FANCLUV <onboarding@resend.dev>'
  const SITE_URL = Deno.env.get('SITE_URL') || 'https://fancluv.com'

  // 인프라 미설정은 "처리 자체 실패"(존재 정보 아님) → 5xx.
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, error: 'server_misconfigured' }, 500)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const body = await req.json().catch(() => ({}))
  const nickname = (body?.nickname || '').trim()
  const ip = clientIp(req)

  // 입력이 비어도 존재 정보를 흘리지 않도록 항상 동일 성공 응답.
  if (!nickname) return json({ ok: true })

  try {
    // ── rate limit: 최근 윈도 내 동일 IP 요청 수 확인(초과 시 발송만 스킵) ──
    let rateLimited = false
    if (ip) {
      const since = new Date(Date.now() - RATE_WINDOW_SEC * 1000).toISOString()
      const { count } = await admin
        .from('account_recovery_logs')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .gte('created_at', since)
      if (typeof count === 'number' && count >= RATE_MAX) rateLimited = true
    }

    // ── service_role 전용 내부 조회(존재 시 email, 없으면 null) + 시도 로깅 ──
    // rate limit 초과 시에도 RPC를 호출하지 않고(추가 부하/발송 차단) 동일 응답.
    if (!rateLimited) {
      const { data: email, error } = await admin.rpc('find_account_email_internal', {
        p_nickname: nickname,
        p_ip: ip,
      })
      if (error) {
        // 내부 오류는 처리 실패로 간주(존재 정보 아님) → 5xx. 상세는 서버 로그만.
        console.error('[send-find-account-mail] rpc error:', error.message)
        return json({ ok: false, error: 'lookup_failed' }, 500)
      }

      // 계정이 존재할 때만 안내 메일 발송. RESEND 미설정이면 개발 폴백(발송 없음).
      if (email && RESEND_API_KEY) {
        const html = `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h1 style="color:#2563EB">FANCLUV 계정 안내</h1>
            <p>회원님의 닉네임과 일치하는 계정이 확인되었습니다.</p>
            <p>아래 버튼으로 로그인하거나, 비밀번호가 기억나지 않으면 비밀번호 재설정을 진행해 주세요.</p>
            <p style="margin:24px 0">
              <a href="${SITE_URL}" style="background:#2563EB;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">FANCLUV 로그인</a>
              &nbsp;
              <a href="${SITE_URL}/find-password" style="color:#2563EB;text-decoration:underline">비밀번호 재설정</a>
            </p>
            <p style="color:#6b7280;font-size:13px">본 메일은 발신 전용입니다. 본인이 요청하지 않았다면 무시하셔도 됩니다.</p>
          </div>`
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: EMAIL_FROM, to: email, subject: 'FANCLUV 계정 안내', html }),
          })
          // 발송 실패해도 존재 정보를 노출하지 않기 위해 동일 성공 응답으로 마감.
        } catch {
          console.error('[send-find-account-mail] resend send error')
        }
      }
    }

    // 계정 유무·발송 여부·rate limit 여부와 무관하게 항상 동일 응답.
    return json({ ok: true })
  } catch {
    // 예기치 못한 처리 실패만 5xx(존재 정보 아님).
    console.error('[send-find-account-mail] internal error')
    return json({ ok: false, error: 'internal_error' }, 500)
  }
})
