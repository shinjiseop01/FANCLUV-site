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

// Mock(localStorage 데모) 모드 판정 = Supabase 미설정. auth.js 의 데모 계정 시드 등
// "운영에서 노출되면 안 되는" 로직은 이 값 + import.meta.env.DEV 로 이중 게이트한다.
export const isMockMode = !isSupabaseConfigured

// 운영(프로덕션) 빌드인데 Supabase 가 설정되지 않았으면 → 배포 설정 오류.
// Mock 데모 데이터/계정으로 서비스가 뜨는 것을 막기 위해 크게 경고한다.
// (앱을 강제 종료하진 않는다 — 의도된 데모 배포까지 깨뜨리지 않기 위해.)
if (import.meta.env.PROD && !isSupabaseConfigured) {
  console.error(
    '[FANCLUV] 운영 빌드에서 Supabase 환경변수가 설정되지 않았습니다. ' +
      'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 설정하세요. ' +
      '설정 전까지는 실데이터 없이 동작하며 데모 계정은 생성되지 않습니다.',
  )
}

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
