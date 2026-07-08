// FANCLUV — Mock 본인인증 Provider (개발/데모 전용).
//
// 실제 PASS/NICE/KCB 인증창 없이 즉시 성공 처리한다. CI/DI 는 seed(사용자 이메일/ID)
// 로부터 결정적으로 생성 → 같은 사용자는 항상 같은 CI(재인증 멱등), 다른 사용자는 다른 CI.
// → 중복가입 방지 로직을 Mock 에서도 검증할 수 있다.
//
// ⚠️ 운영에서는 절대 사용하지 않는다(VITE_IDENTITY_PROVIDER=pass|nice|kcb).

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

export const mockIdentityProvider = {
  agency: 'mock',
  label: 'Mock',

  // verify(ctx) → 표준 결과 { ok, agency, ci, di }.
  //   ctx.seed = 결정적 CI/DI 생성용(현재 사용자 이메일 또는 id).
  async verify(ctx = {}) {
    // 실제 인증창 왕복을 흉내 내는 짧은 지연.
    await new Promise(r => setTimeout(r, 600))
    const seed = String(ctx.seed || 'fancluv-demo')
    return {
      ok: true,
      agency: 'mock',
      ci: `MOCKCI-${hash(seed + '|ci')}${hash(seed + '|ci2')}`,
      di: `MOCKDI-${hash(seed + '|di')}`,
    }
  },
}
