// FANCLUV — 본인인증 중앙 서비스(IdentityService).
//
// Adapter(업체/Mock) + 서버 RPC(0057)를 오케스트레이션한다.
//   - 세션 시작/완료 상태 전이(start/complete/fail)
//   - DI 기반 1인1계정 연결(complete_identity_verification RPC 내부에서 수행)
//   - 검증(서명/state/nonce/timestamp)은 Adapter+identitySecurity
//
// 보안 경계:
//   - Mock: di_hash 를 클라이언트에서 계산(dev 전용).
//   - 실 업체(PASS/NICE/KCB): DI 원문은 클라이언트에 오지 않으며, di_hash 계산·저장은
//     identity-verify Edge Function(service_role)에서 수행한다(serverBacked).
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { getIdentityAdapter } from './identityAdapter.js'
import { generateNonce } from './identitySecurity.js'
import { logger } from '../logger.js'

export class IdentityService {
  constructor(adapterId = 'mock') {
    this.adapter = getIdentityAdapter(adapterId)
  }

  // 세션 시작: 서버에 pending 세션(nonce) 생성 + Adapter 시작(authUrl/state).
  async start({ ttlSeconds = 300 } = {}) {
    if (!isSupabaseConfigured) return { ok: false, code: 'not_configured' }
    const started = await this.adapter.startVerification({ ttlSeconds })
    if (!started.ok) return started
    const nonce = started.nonce || generateNonce()
    const { data, error } = await supabase.rpc('start_identity_verification', {
      p_provider: this.adapter.agency, p_nonce: nonce, p_ttl_seconds: ttlSeconds,
    })
    if (error) return { ok: false, code: 'session_error' }
    const row = Array.isArray(data) ? data[0] : data
    return { ok: true, session: row?.session_id, nonce, state: started.state, authUrl: started.authUrl, expiresAt: row?.expires_at }
  }

  // 완료: Adapter 로 콜백 검증→정규화(di_hash) → 서버 RPC 로 DI 연결/상태 전이.
  //   결과 code: verified(신규) | linked(기존 계정에 연결) | duplicate | expired | invalid
  async complete({ session, nonce, payload, expectedState, providerUserId }) {
    if (!isSupabaseConfigured) return { ok: false, code: 'not_configured' }
    const norm = await this.adapter.completeVerification({ payload, expectedState, providerUserId })
    if (!norm.ok) {
      await this.fail(session, norm.code)
      return { ok: false, code: norm.code }
    }
    const { data, error } = await supabase.rpc('complete_identity_verification', {
      p_session: session, p_nonce: nonce, p_di_hash: norm.di_hash, p_ci_present: norm.ci_present,
      p_provider: norm.provider, p_provider_user_id: norm.provider_user_id,
    })
    if (error) { logger.warn('본인인증 완료 실패', { error }); return { ok: false, code: 'complete_error' } }
    return data || { ok: false, code: 'complete_error' }
  }

  // 실패 처리(사유 코드만 저장, 누적 시 blocked).
  async fail(session, reason) {
    if (!isSupabaseConfigured || !session) return
    await supabase.rpc('fail_identity_verification', { p_session: session, p_reason: String(reason || 'unknown').slice(0, 100) }).catch(() => {})
  }

  // 내 인증 세션 상태(원문 컬럼 없음).
  async myStatus(limit = 10) {
    if (!isSupabaseConfigured) return []
    const { data } = await supabase.from('identity_verifications')
      .select('provider,status,verified_at,created_at,failure_reason')
      .order('created_at', { ascending: false }).limit(limit)
    return data || []
  }

  // provider 연결: DI 연결은 complete 내부에서 수행되지만, 별도 연결 API 필요 시 여기서 확장.
  // (실 병합 merge_accounts 는 auth.users 삭제를 수반 → 관리자 서버(admin-delete-user 등) 경로 필요.)
  async linkProvider() { return { ok: false, code: 'handled_in_complete' } }
  async mergeAccount() { return { ok: false, code: 'requires_admin_server', note: 'auth.users 병합/삭제는 관리자 서버 경로에서 처리' } }
  async validateIdentity(payload, expectedState) { return this.adapter.verifyCallback(payload, { expectedState }) }

  // 화면용 전체 인증 흐름. Mock 은 로컬 서명 콜백으로 전 과정 시뮬(0057 RPC 로 저장/연결),
  // 실 업체(pass/nice/kcb)는 계약 전이라 provider_unconfigured(계약 후 Edge 팝업 흐름 연결).
  async verifyInteractive({ seed, providerUserId } = {}) {
    if (this.adapter.agency === 'mock') {
      return runMockVerification({ personSeed: seed, providerUserId })
    }
    return { ok: false, code: 'provider_unconfigured' }
  }

  // 최신 세션 상태(원문 없음). 프로필 verified 와 함께 화면 상태 계산에 사용.
  async currentStatus() {
    const rows = await this.myStatus(1)
    return rows[0]?.status || null
  }
}

// mock 전체 흐름 헬퍼(테스트/데모): Mock 서버 콜백 발급 → 검증 → 서버 RPC 연결.
export async function runMockVerification({ personSeed, providerUserId, tamper = false, expired = false } = {}) {
  const { mockVerificationServer } = await import('./identityAdapter.js')
  const svc = new IdentityService('mock')
  const started = await svc.start({ ttlSeconds: expired ? 1 : 300 })
  if (!started.ok) return started
  const payload = await mockVerificationServer.issueCallback({ personSeed, provider: 'mock', state: started.state, tamper, expired })
  return svc.complete({ session: started.session, nonce: started.nonce, payload, expectedState: started.state, providerUserId })
}
