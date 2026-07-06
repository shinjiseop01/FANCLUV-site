// FANCLUV — 회원가입 환영 이메일 발송.
//
// 실제 발송은 Supabase Edge Function `send-welcome-email`(Resend)이 담당한다.
// - Supabase 설정 + 함수 배포 시: 함수 호출 → Resend 로 발송(RESEND_API_KEY 미설정이면 함수가 dev fallback).
// - Supabase 미설정(Mock 모드): 실제 발송 없이 콘솔 로그만 남기고 성공 처리(앱 흐름 유지).
// 발송 실패가 회원가입 자체를 막지 않도록 항상 안전하게 처리한다.
import { supabase, isSupabaseConfigured } from './supabase.js'

export async function sendWelcomeEmail(email, nickname) {
  if (!email) return { ok: false, skipped: true }
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.functions.invoke('send-welcome-email', {
        body: { email, nickname: nickname || '' },
      })
      if (error) return { ok: false, error: error.message }
      return { ok: !!data?.ok, ...data }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }
  // Mock fallback — 실제 발송 없음. (개발 환경에서만 로그 — 운영 콘솔 노이즈 방지)
  if (import.meta.env.DEV) console.info(`[welcome-email:mock] to=${email} nickname=${nickname || ''}`)
  return { ok: true, mock: true }
}
