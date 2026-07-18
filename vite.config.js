import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// 배포 검증용 빌드 식별자(커밋 SHA). Vercel 은 VERCEL_GIT_COMMIT_SHA 를 주입하고,
// 로컬/기타 빌드는 git 에서 읽는다. 스테일 배포(구버전 번들) 진단에 사용한다.
function buildSha() {
  const v = process.env.VERCEL_GIT_COMMIT_SHA
  if (v) return v.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 클라이언트에 노출할 환경변수 접두사. 기본 VITE_ 외에 LEAGUE_(LEAGUE_PROVIDER) 허용.
  envPrefix: ['VITE_', 'LEAGUE_'],
  // 번들에 커밋 SHA 를 상수로 주입(비민감). main.jsx 가 콘솔에 1회 기록.
  define: { __BUILD_SHA__: JSON.stringify(buildSha()) },
})
