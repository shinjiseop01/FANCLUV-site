import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 클라이언트에 노출할 환경변수 접두사. 기본 VITE_ 외에 LEAGUE_(LEAGUE_PROVIDER) 허용.
  envPrefix: ['VITE_', 'LEAGUE_'],
})
