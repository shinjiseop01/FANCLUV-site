// FANCLUV — 본인인증 Provider Adapter 인터페이스 + Mock Adapter + Mock 서버.
//
// PASS/NICE/KCB 는 인증창/규격만 다르고 흐름은 동일 → 공통 인터페이스로 추상화한다.
// 실 업체 Adapter 는 서버(identity-verify Edge Function, 업체 비밀키)를 경유하고,
// Mock Adapter 는 계약 없이 로컬에서 전체 흐름(서명/콜백/DI/CI)을 시뮬레이션한다.
//
// ── 공통 인터페이스(IdentityAdapter) ──
//   startVerification(ctx)      → { ok, session, authUrl?, nonce, state, expiresAt }
//   completeVerification(ctx)   → { ok, code, di_hash, ci_present, provider, provider_user_id }
//   verifyCallback(payload)     → { ok, code }         (origin/state/timestamp/signature 검증)
//   normalizeIdentity(raw)      → { di, ci_present }    (업체 응답 → 표준형, 원문 최소화)
//   verifySignature(payload)    → boolean               (콜백 위·변조 검증)
import { generateNonce, hashDi, validateCallback, signPayload, verifySignature } from './identitySecurity.js'

// 개발/테스트 전용 Mock 서명 시크릿(운영 아님). 실 업체는 서버 시크릿을 Edge 에서만 사용.
const MOCK_SECRET = 'fancluv-mock-identity-secret'
const MOCK_ORIGIN = 'https://mock-identity.local'

function seedHash(str) {
  let h = 0
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

// ── Mock 인증 서버 ──
// 실제 PASS/NICE/KCB 서버 대신, 사람(personSeed)마다 결정적 DI/CI 를 발급하고 HMAC 서명한
// 콜백 payload 를 만든다. 같은 사람 = 같은 DI(중복/연결 검증 가능), 다른 사람 = 다른 DI.
export const mockVerificationServer = {
  // 인증창에서 사용자가 본인인증을 마쳤다고 가정하고, 서명된 콜백 payload 발급.
  async issueCallback({ personSeed, provider = 'mock', state, tamper = false, expired = false }) {
    const di = `MOCKDI-${seedHash(personSeed + '|di')}`
    const ci = `MOCKCI-${seedHash(personSeed + '|ci')}${seedHash(personSeed + '|ci2')}`
    const payload = {
      provider,
      di,                         // 원문 DI (서버측만; 앱은 hash 로만 저장)
      ci_present: !!ci,
      state,
      origin: MOCK_ORIGIN,
      timestamp: expired ? Date.now() - 10 * 60 * 1000 : Date.now(),
    }
    payload.signature = await signPayload(payload, MOCK_SECRET)
    if (tamper) payload.di = di + '-TAMPERED' // 서명 후 변조 → 서명 검증 실패해야
    return payload
  },
}

// ── Mock Adapter (계약 없이 전체 흐름) ──
export class MockIdentityAdapter {
  constructor() { this.agency = 'mock'; this.label = 'Mock' }

  async startVerification({ ttlSeconds = 300 } = {}) {
    const nonce = generateNonce()
    const state = generateNonce()
    return { ok: true, provider: 'mock', nonce, state, session: nonce, authUrl: `${MOCK_ORIGIN}/authorize?state=${state}`, expiresAt: Date.now() + ttlSeconds * 1000 }
  }

  // 콜백 payload(위·변조/만료/origin/state 포함)를 서버 기준으로 검증.
  async verifyCallback(payload, { expectedState } = {}) {
    return validateCallback({ payload, expectedState, allowedOrigin: MOCK_ORIGIN, secret: MOCK_SECRET })
  }

  async verifySignature(payload) {
    return verifySignature(payload, MOCK_SECRET)
  }

  // 업체 응답 → 표준형: DI 는 hash 로만, CI 는 존재여부만(원문 미보관).
  async normalizeIdentity(raw) {
    if (!raw?.di) return { ok: false, code: 'invalid' }
    return { ok: true, di_hash: await hashDi(raw.di), ci_present: !!raw.ci_present, provider: raw.provider || 'mock' }
  }

  // 콜백 검증 → 정규화 → 표준 완료 데이터 반환(원문 미포함).
  async completeVerification({ payload, expectedState, providerUserId }) {
    const chk = await this.verifyCallback(payload, { expectedState })
    if (!chk.ok) return { ok: false, code: chk.code }
    const norm = await this.normalizeIdentity(payload)
    if (!norm.ok) return { ok: false, code: norm.code }
    return { ok: true, code: 'ok', di_hash: norm.di_hash, ci_present: norm.ci_present, provider: norm.provider, provider_user_id: providerUserId || null }
  }
}

// ── 실 업체 Adapter (서버 경유 스텁) ──
// 실제 CI/DI 발급·서명 검증은 identity-verify Edge Function(업체 비밀키)에서 수행한다.
// 클라이언트 Adapter 는 세션 시작/콜백 토큰 전달만 담당하고 원문을 받지 않는다.
// (실 vendor API 연동은 계약 후 Edge Function 의 callVendor* 에 구현 — 본 클래스는 계약 표시.)
class AgencyAdapter {
  constructor(agency, label) { this.agency = agency; this.label = label; this.serverBacked = true }
  async startVerification() { return { ok: false, code: 'provider_unconfigured', serverBacked: true } }
  async completeVerification() { return { ok: false, code: 'provider_unconfigured', serverBacked: true } }
  async verifyCallback() { return { ok: false, code: 'server_only' } } // 서버(Edge)에서 검증
  async verifySignature() { return false }                             // 서버(Edge)에서 검증
  async normalizeIdentity() { return { ok: false, code: 'server_only' } }
}
export class PassAdapter extends AgencyAdapter { constructor() { super('pass', 'PASS') } }
export class NiceAdapter extends AgencyAdapter { constructor() { super('nice', 'NICE') } }
export class KcbAdapter extends AgencyAdapter { constructor() { super('kcb', 'KCB') } }

export const IDENTITY_ADAPTERS = {
  mock: new MockIdentityAdapter(),
  pass: new PassAdapter(),
  nice: new NiceAdapter(),
  kcb: new KcbAdapter(),
}
export function getIdentityAdapter(id) {
  return IDENTITY_ADAPTERS[String(id || '').toLowerCase()] || IDENTITY_ADAPTERS.mock
}
