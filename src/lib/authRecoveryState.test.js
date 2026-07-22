// authRecoveryState 단위 테스트 (순수 로직).
// jsdom 없이 window/sessionStorage/location을 최소 stub으로 대체해 검증한다.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// 각 테스트가 깨끗한 모듈 상태에서 시작하도록, window stub을 세팅한 뒤
// 동적 import 로 모듈을 새로 평가한다(모듈 로드 시 캡처 로직이 실행되므로).
function setupWindow({ pathname = '/', hash = '' } = {}) {
  const store = new Map()
  globalThis.window = {
    location: { pathname, hash },
    sessionStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
  }
  return store
}

async function freshImport() {
  // 쿼리스트링으로 모듈 캐시를 우회해 재평가(캡처 로직 재실행)
  return import(`./authRecoveryState.js?t=${Math.random()}`)
}

test('recovery hash가 있으면 intent를 캡처한다 (/reset-password)', async () => {
  setupWindow({ pathname: '/reset-password', hash: '#access_token=x&type=recovery&expires_in=3600' })
  const mod = await freshImport()
  assert.equal(mod.hasRecoveryIntent(), true)
})

test('recovery hash가 "/"로 떨어져도(Site URL fallback) intent를 캡처한다', async () => {
  setupWindow({ pathname: '/', hash: '#access_token=x&type=recovery' })
  const mod = await freshImport()
  assert.equal(mod.hasRecoveryIntent(), true)
})

test('type=recovery가 없으면 intent가 없다', async () => {
  setupWindow({ pathname: '/reset-password', hash: '' })
  const mod = await freshImport()
  assert.equal(mod.hasRecoveryIntent(), false)
})

test('일반 로그인 hash(type=recovery 아님)는 intent로 잡지 않는다', async () => {
  setupWindow({ pathname: '/', hash: '#access_token=x&type=signup' })
  const mod = await freshImport()
  assert.equal(mod.hasRecoveryIntent(), false)
})

test('markRecoverySignal 후 hasRecoveryIntent=true, clear 후 false', async () => {
  setupWindow({ pathname: '/', hash: '' })
  const mod = await freshImport()
  assert.equal(mod.hasRecoveryIntent(), false)
  mod.markRecoverySignal()
  assert.equal(mod.hasRecoveryIntent(), true)
  mod.clearRecoveryIntent()
  assert.equal(mod.hasRecoveryIntent(), false)
})

test('토큰 원문을 sessionStorage에 저장하지 않는다 (boolean "1"만)', async () => {
  const store = setupWindow({ pathname: '/reset-password', hash: '#access_token=SECRET_TOKEN&type=recovery' })
  await freshImport()
  const values = [...store.values()].join('|')
  assert.equal(values.includes('SECRET_TOKEN'), false)
  assert.equal(store.get('fancluv:password-recovery-intent'), '1')
})
