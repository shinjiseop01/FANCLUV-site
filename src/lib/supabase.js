// FANCLUV — Supabase client.
//
// 환경변수(.env)로 프로젝트를 연결한다. 값이 없으면 `isSupabaseConfigured`가
// false가 되고, 인증 계층(auth.js)은 기존 localStorage Mock으로 자동 폴백한다.
// → 키를 넣기 전에도 앱(Mock 화면)이 그대로 동작하고, 키를 넣는 즉시 실제
//   Supabase Auth로 전환된다.
//
// 필요한 환경변수 (프로젝트 루트 .env):
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...   (anon/public key — 클라이언트 공개용, 노출 안전)
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// URL/키가 모두 있고 placeholder가 아닐 때만 "설정됨"으로 본다.
export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes('your-project') && !anonKey.includes('your-anon'),
)

// 설정되지 않았으면 client는 null (Mock 폴백 사용).
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,      // 세션 유지(새로고침 후에도 로그인 유지)
        autoRefreshToken: true,
        detectSessionInUrl: true,  // OAuth 리다이렉트 콜백 처리(Google 등)
      },
    })
  : null
