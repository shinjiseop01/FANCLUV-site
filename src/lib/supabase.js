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
import { logger } from './logger.js'
import { pickStores } from './authForm.js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// URL/키가 모두 있고 placeholder가 아닐 때만 "설정됨"으로 본다.
export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes('your-project') && !anonKey.includes('your-anon'),
)

// Mock(localStorage 데모) 모드 판정 = Supabase 미설정. auth.js 의 데모 계정 시드 등
// "운영에서 노출되면 안 되는" 로직은 이 값 + import.meta.env.DEV 로 이중 게이트한다.
export const isMockMode = !isSupabaseConfigured

// ⚠️ 운영(프로덕션) 빌드인데 Supabase 가 설정되지 않은 상태 = 배포 설정 미완.
//   이 경우 데모 관리자 계정을 시드하지 않고(auth.js DEV 게이트), 로그인도 차단하며
//   로그인 화면에 "서비스 설정 미완료" 안내만 표시한다(LoginPage). → 데모 자격증명이
//   프로덕션에 절대 생성/노출되지 않도록 안전하게 차단한다. Mock 데이터는 개발(DEV)에서만 허용.
export const isProdMisconfigured = Boolean(import.meta.env.PROD && !isSupabaseConfigured)

// 경고는 "환경 설정 미완료"라는 정적 사실이라 앱 수명 중 1회만 남기면 충분하다.
// 코드 스플리팅으로 이 모듈이 여러 청크에서 평가되거나 HMR 로 재평가돼도 중복
// 출력되지 않도록 globalThis 플래그로 정확히 1회만 로깅한다(보안 게이트/차단
// 동작은 isProdMisconfigured 상수로 유지 — 로깅만 멱등 처리).
if (isProdMisconfigured && !globalThis.__fancluvEnvWarned) {
  globalThis.__fancluvEnvWarned = true
  logger.error(
    '운영 빌드에서 Supabase 환경변수가 설정되지 않았습니다. ' +
      'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 설정하세요. ' +
      '설정 전까지는 로그인이 차단되며(데모 계정 미시드) 서비스가 정상 동작하지 않습니다.',
  )
}

// ── 로그인 유지(keep-signed-in) 정책 ───────────────────────────────────────
// "로그인 상태 유지" 체크 여부에 따라 세션 토큰을 어디에 저장할지 결정한다.
//   • keep = true  → localStorage  : 브라우저를 닫아도 세션 유지(영구 세션)
//   • keep = false → sessionStorage : 브라우저(탭) 종료 시 자동 로그아웃(세션 로그인)
// 이메일 로그인 체크박스와 OAuth(Google/Kakao/Naver) 모두 동일 정책을 따른다.
// keep 플래그 자체는 OAuth 리다이렉트(페이지 이동)를 넘어 살아남아야 하므로
// 항상 localStorage 에 둔다.
export const KEEP_KEY = 'fancluv_keep_signed_in'

const hasWindow = typeof window !== 'undefined'
const ls = () => (hasWindow ? window.localStorage : null)
const ss = () => (hasWindow ? window.sessionStorage : null)

export function setKeepSignedIn(keep) {
  const store = ls()
  if (!store) return
  if (keep) store.setItem(KEEP_KEY, '1')
  else store.removeItem(KEEP_KEY)
}

export function getKeepSignedIn() {
  const store = ls()
  return Boolean(store && store.getItem(KEEP_KEY) === '1')
}

// Supabase Auth 에 주입하는 storage 어댑터.
// getItem 은 "현재 활성 저장소"에서만 읽어 세션/영구 의미를 강제하고,
// setItem 은 활성 저장소에 쓰면서 반대편 저장소의 잔재를 제거해 이중 세션을 막는다.
// removeItem(로그아웃) 은 양쪽을 모두 지워 어떤 토큰도 남지 않게 한다.
export const hybridStorage = {
  getItem(key) {
    const { active } = pickStores(getKeepSignedIn(), ls(), ss())
    return (active && active.getItem(key)) ?? null
  },
  setItem(key, value) {
    const { active, other } = pickStores(getKeepSignedIn(), ls(), ss())
    if (other) other.removeItem(key)
    if (active) active.setItem(key, value)
  },
  removeItem(key) {
    ls()?.removeItem(key)
    ss()?.removeItem(key)
  },
}

// 설정되지 않았으면 client는 null (Mock 폴백 사용).
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,      // 세션 유지(새로고침 후에도 로그인 유지)
        autoRefreshToken: true,
        detectSessionInUrl: true,  // OAuth 리다이렉트 콜백 처리(Google 등)
        storage: hybridStorage,    // keep 여부에 따라 local/session 저장소 라우팅
      },
    })
  : null
