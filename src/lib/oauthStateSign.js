// FANCLUV — 커스텀 OAuth(Kakao/Naver) state 서명/검증 프리미티브.
//
// 목적: origin allowlist 만으로는 부족한 부분을 보강 — 서버 HMAC 서명으로
//   state 변조/만료/replay 를 방지한다. Web Crypto(HMAC-SHA256)라 Deno(Edge)와
//   Node 20 에서 동일하게 동작한다.
//
//   서명 페이로드: { n(nonce), iat, exp, provider, origin }
//   토큰 형식: base64url(payloadJSON) + '.' + base64url(hmac)
//
// 운영 연결(향후): Edge Function 이 SECRET 으로 signState() 해 authorize 로 리다이렉트,
//   kakao/naver-callback 이 verifyState() 로 서명·만료·provider·origin·nonce(one-time)를
//   검증한다. Secret 은 Edge Function Secret 에만 둔다(프론트 노출 금지).
//
// one-time(replay) 는 nonce 를 서버 저장소(예: notifications 아닌 별도 테이블/KV)에서
// 소비 처리하거나 exp 짧게(예 5분) + used-nonce 캐시로 막는다. 아래는 서명/만료/구조
// 검증까지 제공하고, replay 는 verifyState 결과의 nonce 를 호출측이 소비하도록 반환한다.

const enc = new TextEncoder()

function b64urlFromBytes(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlToString(s) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  return atob(pad + '==='.slice((pad.length + 3) % 4))
}
function b64urlEncodeString(s) {
  return b64urlFromBytes(enc.encode(s))
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return b64urlFromBytes(new Uint8Array(sig))
}

// 상수시간 비교(타이밍 공격 완화).
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// state 서명. ttlSec 기본 300초(5분). nonce 미지정 시 랜덤 생성.
export async function signState({ provider, origin, ttlSec = 300, nonce, secret, now = Date.now() }) {
  if (!secret) throw new Error('secret required')
  const n = nonce || b64urlFromBytes(crypto.getRandomValues(new Uint8Array(16)))
  const iat = Math.floor(now / 1000)
  const payload = { n, iat, exp: iat + ttlSec, provider, origin }
  const p = b64urlEncodeString(JSON.stringify(payload))
  const sig = await hmac(secret, p)
  return `${p}.${sig}`
}

// state 검증. 반환: { ok, code?, payload? }. code: bad_format|bad_sig|expired
export async function verifyState(token, { secret, now = Date.now() }) {
  if (!secret) return { ok: false, code: 'no_secret' }
  const parts = String(token || '').split('.')
  if (parts.length !== 2) return { ok: false, code: 'bad_format' }
  const [p, sig] = parts
  const expect = await hmac(secret, p)
  if (!timingSafeEqual(sig, expect)) return { ok: false, code: 'bad_sig' }
  let payload
  try { payload = JSON.parse(b64urlToString(p)) } catch { return { ok: false, code: 'bad_format' } }
  if (typeof payload?.exp !== 'number' || Math.floor(now / 1000) > payload.exp) return { ok: false, code: 'expired' }
  return { ok: true, payload }
}
