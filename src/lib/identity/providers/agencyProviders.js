// FANCLUV — 실 본인인증 업체 Provider (PASS / NICE / KCB).
//
// 세 업체는 인증창(팝업/리다이렉트)만 다를 뿐 흐름이 동일하므로 하나의 베이스로
// 구현하고 agency 값만 다르게 둔다(교체 = REGISTRY 에 클래스 추가).
//
// ── 보안 핵심 ──
//   CI/DI 발급은 반드시 서버(Edge Function `identity-verify`, 업체 비밀키 보관)에서
//   처리한다. 클라이언트는 CI/DI 원문을 절대 받지 않는다 → Edge Function 이
//   profiles 에 저장하고, 여기서는 { ok, serverWritten:true } 만 돌려받는다.
//
// 흐름:
//   1) identity-verify(action:'start')  → 업체 인증창 URL(authUrl) 수신
//   2) 팝업으로 authUrl open → 사용자가 휴대폰 본인인증 진행
//   3) 콜백이 postMessage 로 token 전달 → identity-verify(action:'complete', token)
//      → 서버가 업체 API 로 CI/DI 조회·중복확인·profiles 저장 → { ok }
import { invokeFunction } from '../../edgeFunctions.js'
import { logger } from '../../logger.js'

const POPUP_TIMEOUT_MS = 5 * 60 * 1000 // 5분

// 업체 인증창 팝업을 열고, 콜백에서 오는 postMessage(token)를 기다린다.
function openAuthPopup(authUrl) {
  return new Promise(resolve => {
    const popup = window.open(authUrl, 'fancluv_identity', 'width=460,height=640')
    if (!popup) { resolve(null); return } // 팝업 차단
    let done = false
    const finish = (token) => {
      if (done) return
      done = true
      window.removeEventListener('message', onMessage)
      clearInterval(closedTimer)
      clearTimeout(timeout)
      try { popup.close() } catch { /* noop */ }
      resolve(token)
    }
    const onMessage = (e) => {
      // 콜백 페이지(우리 오리진)에서만 수신.
      if (e.origin !== window.location.origin) return
      const d = e.data
      if (d && d.type === 'fancluv:identity' && d.token) finish(d.token)
      else if (d && d.type === 'fancluv:identity' && d.cancelled) finish(null)
    }
    window.addEventListener('message', onMessage)
    // 사용자가 창을 그냥 닫은 경우 취소 처리.
    const closedTimer = setInterval(() => { if (popup.closed) finish(null) }, 700)
    const timeout = setTimeout(() => finish(null), POPUP_TIMEOUT_MS)
  })
}

class AgencyIdentityProvider {
  constructor(agency, label) {
    this.agency = agency // 'pass' | 'nice' | 'kcb'
    this.label = label
  }

  async verify() {
    try {
      // 1) 인증 세션 시작 → 업체 인증창 URL
      const { data: start, error: e1 } = await invokeFunction('identity-verify', {
        body: { action: 'start', agency: this.agency },
      })
      if (e1 || !start?.ok || !start?.authUrl) {
        return { ok: false, code: 'provider_unconfigured',
          error: `${this.label} 본인인증 설정이 필요합니다. 관리자에게 문의해 주세요.` }
      }
      // 2) 팝업 인증창
      const token = await openAuthPopup(start.authUrl)
      if (!token) return { ok: false, code: 'cancelled', error: '본인인증이 취소되었습니다.' }
      // 3) 콜백 토큰 검증 → 서버가 CI/DI 저장
      const { data: done, error: e2 } = await invokeFunction('identity-verify', {
        body: { action: 'complete', agency: this.agency, token, session: start.session || null },
      })
      if (e2 || !done?.ok) {
        const code = done?.code || 'failed'
        return { ok: false, code,
          error: code === 'duplicate'
            ? '이미 다른 계정에서 본인인증된 정보입니다.'
            : '본인인증에 실패했습니다. 다시 시도해 주세요.' }
      }
      // 서버가 이미 profiles 에 CI/DI 저장 → 클라이언트는 원문을 받지 않는다.
      return { ok: true, agency: this.agency, serverWritten: true }
    } catch (error) {
      logger.warn('본인인증 처리 실패', { error, context: this.agency })
      return { ok: false, code: 'error', error: '본인인증 처리 중 오류가 발생했습니다.' }
    }
  }
}

export class PassProvider extends AgencyIdentityProvider {
  constructor() { super('pass', 'PASS') }
}
export class NiceProvider extends AgencyIdentityProvider {
  constructor() { super('nice', 'NICE') }
}
export class KcbProvider extends AgencyIdentityProvider {
  constructor() { super('kcb', 'KCB') }
}
