// FANCLUV — 스테이징 안전 가드 (모든 seed/concurrency/load 스크립트가 import).
//
// 프로덕션에 테스트 데이터/부하가 들어가는 사고를 원천 차단한다.
// 아래 조건 중 하나라도 걸리면 즉시 종료(exit 1):
//   1) STAGING_URL 이 프로덕션 URL 과 같음
//   2) project ref 가 프로덕션 ref 와 같음
//   3) STAGING_CONFIRM 값이 없음(명시적 확인)
//   4) TEST_DATA_PREFIX 가 'TEST_' 가 아님
//   5) (seed 등 쓰기 작업) SERVICE_ROLE 이 env 에 없음
//   6) 실행 대상 환경이 불명확(STAGING_URL 미지정)
//
// 실행 전 환경 요약을 출력한다(Secret 값은 절대 출력하지 않음).

export const PROD_REF = 'cuuzbddxnzhhlrqmmebz'
export const PROD_HOST = `${PROD_REF}.supabase.co`

export function refFromUrl(url) {
  const m = String(url || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)
  return m ? m[1] : ''
}

// 순수 판정(단위 테스트 대상). env: { STAGING_URL, TEST_DATA_PREFIX, STAGING_CONFIRM, SERVICE_ROLE }
export function evaluateGuard(env = {}, opts = {}) {
  const URL = env.STAGING_URL || ''
  const ref = refFromUrl(URL)
  if (!URL) return { ok: false, reason: 'STAGING_URL 미지정' }
  if (URL.includes(PROD_REF) || ref === PROD_REF || URL.includes(PROD_HOST)) return { ok: false, reason: '프로덕션 URL/ref' }
  if (!ref) return { ok: false, reason: 'Supabase URL 형식 아님' }
  if (env.STAGING_CONFIRM !== 'yes') return { ok: false, reason: 'STAGING_CONFIRM=yes 필요' }
  if ((env.TEST_DATA_PREFIX || '') !== 'TEST_') return { ok: false, reason: 'TEST_DATA_PREFIX=TEST_ 필요' }
  if (opts.requireServiceRole && !env.SERVICE_ROLE) return { ok: false, reason: 'SERVICE_ROLE 필요' }
  return { ok: true, ref, prefix: env.TEST_DATA_PREFIX, serviceRole: env.SERVICE_ROLE || '' }
}

// opts: { requireServiceRole?: boolean, sizeLabel?: string, expectedRows?: number, cleanupCmd?: string }
export function guardStaging(opts = {}) {
  const r = evaluateGuard(process.env, opts)
  if (!r.ok) { console.error(`⛔ 가드 차단: ${r.reason}`); process.exit(1) }
  const { ref, prefix, serviceRole } = r
  const URL = process.env.STAGING_URL

  // 환경 요약(Secret 미출력)
  console.log('──────────────────────────────')
  console.log('Environment  : staging')
  console.log('Project ref  :', ref)
  console.log('Supabase host:', `${ref}.supabase.co`)
  console.log('Test prefix  :', prefix)
  if (opts.sizeLabel) console.log('Test data    :', opts.sizeLabel)
  if (opts.expectedRows != null) console.log('예상 행 수   :', opts.expectedRows)
  if (opts.cleanupCmd) console.log('정리 명령    :', opts.cleanupCmd)
  console.log('──────────────────────────────')

  return { URL, ref, prefix, serviceRole }
}
