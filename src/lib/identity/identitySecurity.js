// FANCLUV — 본인인증 보안 유틸 (replay/nonce/timestamp/signature/state/origin).
//
// 콜백/응답 위·변조와 재전송(replay)을 막기 위한 순수 함수. 브라우저·Node(webcrypto)
// 양쪽에서 동작한다. ⚠️ 원문(주민번호/CI/DI/토큰/시크릿)은 절대 다루거나 반환하지 않는다.
// DI 는 원문 대신 sha256 해시로만 비교/저장한다.

const subtle = globalThis.crypto?.subtle
const enc = new TextEncoder()

// 1회용 nonce(추측 불가). replay 방지 세션 식별.
export function generateNonce() {
  const a = new Uint8Array(16)
  globalThis.crypto.getRandomValues(a)
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('')
}

// timestamp 유효 창(기본 ±5분). 오래된/미래 timestamp 거부 → replay 완화.
export function isTimestampFresh(ts, windowMs = 5 * 60 * 1000, now = Date.now()) {
  const t = typeof ts === 'number' ? ts : Date.parse(ts)
  if (!Number.isFinite(t)) return false
  return Math.abs(now - t) <= windowMs
}

// DI 원문 → sha256 hex (동일인 식별용, 원문 미저장).
export async function hashDi(di) {
  const buf = await subtle.digest('SHA-256', enc.encode(String(di)))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// HMAC-SHA256 서명(콜백 payload 무결성). secret 은 서버 전용.
async function hmac(secret, msg) {
  const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await subtle.sign('HMAC', key, enc.encode(msg))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// 콜백 payload 를 정규화(키 정렬)해 서명 대상 문자열 생성 → 필드 순서 무관.
export function canonicalize(payload) {
  const keys = Object.keys(payload || {}).filter(k => k !== 'signature').sort()
  return keys.map(k => `${k}=${payload[k]}`).join('&')
}

export async function signPayload(payload, secret) {
  return hmac(secret, canonicalize(payload))
}

// 서명 검증(상수시간 비교). tamper(변조) 시 false.
export async function verifySignature(payload, secret) {
  const provided = String(payload?.signature || '')
  const expected = await hmac(secret, canonicalize(payload))
  if (provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

// state(CSRF) 검증 — 시작 시 발급한 값과 콜백 값 일치.
export function validateState(received, expected) {
  return typeof received === 'string' && received.length >= 8 && received === expected
}

// origin allowlist 검증 — 콜백 메시지 출처 확인.
export function validateOrigin(origin, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed]
  return list.filter(Boolean).includes(origin)
}

// 콜백 종합 검증: origin + state + timestamp + signature 모두 통과해야 유효.
export async function validateCallback({ payload, expectedState, allowedOrigin, secret, now }) {
  if (!validateOrigin(payload?.origin, allowedOrigin)) return { ok: false, code: 'bad_origin' }
  if (!validateState(payload?.state, expectedState)) return { ok: false, code: 'bad_state' }
  if (!isTimestampFresh(payload?.timestamp, 5 * 60 * 1000, now)) return { ok: false, code: 'expired' }
  if (!(await verifySignature(payload, secret))) return { ok: false, code: 'bad_signature' }
  return { ok: true }
}
