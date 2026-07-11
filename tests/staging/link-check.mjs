// FANCLUV — 현재 링크된 Supabase 프로젝트 확인 (db push 사고 방지, §3).
//
// 사용: node tests/staging/link-check.mjs            → 링크된 ref 출력
//       node tests/staging/link-check.mjs --expect-staging → 프로덕션이면 exit 1
//
// supabase CLI 는 supabase/.temp/project-ref 에 현재 링크 ref 를 둔다.
import { readFileSync } from 'node:fs'
import { PROD_REF } from './guard.mjs'

let ref = ''
try { ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim() } catch { /* not linked */ }

const isProd = ref === PROD_REF
console.log('현재 링크 project ref:', ref || '(링크 없음)')
console.log('프로덕션 여부       :', isProd ? '⚠️ 예(프로덕션)' : '아니오')

if (process.argv.includes('--expect-staging') && isProd) {
  console.error('⛔ 스테이징 작업인데 프로덕션에 링크됨. 먼저 스테이징으로 link 하세요:')
  console.error('   npx supabase link --project-ref <STAGING_REF>')
  process.exit(1)
}
