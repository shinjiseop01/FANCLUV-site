// FANCLUV — 본인인증(휴대폰 CI/DI) Provider 아키텍처 (facade).
//
// PASS / NICE / KCB 어느 업체를 쓰더라도 화면·인증 로직을 바꾸지 않고 교체할 수 있도록
// Provider 로 추상화한다. 화면(VerifyIdentityPage)은 아래 getIdentityProvider().verify()
// 하나만 호출한다.
//
//        identityProvider.js  (이 파일 — 선택 + facade)
//              │
//        ┌─────┼─────┬───────┐
//       mock  PASS  NICE   KCB
//
// ── Provider 선택 ──
//   VITE_IDENTITY_PROVIDER = pass | nice | kcb | mock   (미설정/미지원 → mock)
//   • 개발/데모(Mock): 실제 인증창 없이 즉시 성공(mockIdentityProvider).
//   • 운영: pass/nice/kcb → Edge Function `identity-verify`(업체 비밀키 서버 보관)로 처리.
//
// ── Provider 교체 방법 ──
//   1) providers/agencyProviders.js 에 업체 클래스가 이미 있으면 .env 의
//      VITE_IDENTITY_PROVIDER 값만 바꾸면 된다(pass ↔ nice ↔ kcb).
//   2) 새 업체 추가 시 AgencyIdentityProvider 를 상속한 클래스 정의 후 아래 REGISTRY 에 등록.
//   3) 서버측은 identity-verify Edge Function 의 업체 분기(callAgency*)만 맞추면 된다.
//
// verify() 표준 결과:
//   { ok, agency, ci, di }              (mock — 클라이언트가 claim_identity 로 저장)
//   { ok, agency, serverWritten:true }  (실 Provider — Edge Function 이 이미 저장)
//   { ok:false, code, error }           (실패/취소)
import { mockIdentityProvider } from './providers/mockIdentityProvider.js'
import { PassProvider, NiceProvider, KcbProvider } from './providers/agencyProviders.js'

const REGISTRY = {
  mock: mockIdentityProvider,
  pass: new PassProvider(),
  nice: new NiceProvider(),
  kcb: new KcbProvider(),
}

// 업체 표시명(설정/안내 문구용).
export const IDENTITY_AGENCY_LABELS = { mock: 'Mock', pass: 'PASS', nice: 'NICE', kcb: 'KCB' }

// 현재 선택된 Provider id ('mock' | 'pass' | 'nice' | 'kcb').
export function identityProviderId() {
  const v = (import.meta.env.VITE_IDENTITY_PROVIDER || '').toLowerCase().trim()
  return REGISTRY[v] ? v : 'mock'
}

export function getIdentityProvider() {
  return REGISTRY[identityProviderId()]
}

// 현재 Mock 본인인증 모드 여부(화면 안내 문구 분기용).
export function isIdentityMock() {
  return identityProviderId() === 'mock'
}
