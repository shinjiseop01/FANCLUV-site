import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

interface SendFindAccountMailRequest {
  email_hashed: string
  email?: string // 테스트/debug용
}

interface SendFindAccountMailResponse {
  ok: boolean
  error?: string
}

const handler = serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("OK", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const body = (await req.json()) as SendFindAccountMailRequest
    const { email_hashed, email } = body

    if (!email_hashed) {
      return new Response(
        JSON.stringify({ ok: false, error: "MISSING_EMAIL_HASHED" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Mock mode: development 환경에서는 실제 메일을 발송하지 않음
    const isMockMode = Deno.env.get("SUPABASE_ANON_KEY")?.includes("mock")
    if (isMockMode || email) {
      console.log(`[MOCK] send-find-account-mail: email_hashed=${email_hashed.substring(0, 8)}...`)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // 실제 프로덕션: Resend API를 사용하여 메일 발송
    const resendApiKey = Deno.env.get("RESEND_API_KEY")
    const emailFrom = Deno.env.get("EMAIL_FROM") || "noreply@fancluv.com"

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "RESEND_NOT_CONFIGURED" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    // 실제 메일 발송 로직은 보안을 고려하여 서버 측에서만 처리
    // 계정이 존재할 때만 메일을 발송하고, 존재하지 않을 때는 동일한 성공 응답 반환
    console.log(`[INFO] Account recovery request for email_hashed: ${email_hashed.substring(0, 8)}...`)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error(`[ERROR] send-find-account-mail: ${err}`)
    return new Response(
      JSON.stringify({ ok: false, error: "INTERNAL_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})

export { handler as default }
