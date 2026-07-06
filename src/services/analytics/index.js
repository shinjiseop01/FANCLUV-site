// FANCLUV — 성능/사용성 측정(Analytics) 서비스.
//
// 화면 코드는 analytics.pageView() / analytics.track() 만 호출한다.
// 실제 수집기(Google Analytics 4 · Microsoft Clarity 등)는 Provider 로 교체한다.
//   - 현재: mockAnalyticsProvider (개발 콘솔 로그만, 실제 전송 없음)
//   - 향후: gaProvider / clarityProvider 를 만들어 initAnalytics() 에서 선택
//
// Provider 인터페이스:
//   { name, init(), pageView(path, meta), track(event, props), identify(id, traits) }
import { logger } from '../../lib/logger.js'
import { mockAnalyticsProvider } from './mockAnalyticsProvider.js'

let provider = mockAnalyticsProvider
let started = false

// 환경변수로 Provider 를 선택할 준비(현재는 mock 고정).
//   - VITE_ANALYTICS=ga       → Google Analytics (gaProvider, 추후)
//   - VITE_ANALYTICS=clarity  → Microsoft Clarity (clarityProvider, 추후)
//   - 미지정/mock             → mockAnalyticsProvider
function pickProvider() {
  const mode = String(import.meta.env?.VITE_ANALYTICS || '').toLowerCase()
  switch (mode) {
    // case 'ga':      return gaProvider
    // case 'clarity': return clarityProvider
    default:
      return mockAnalyticsProvider
  }
}

// 앱 시작 시 1회 호출(main.jsx). 중복 호출은 무시.
export function initAnalytics() {
  if (started) return
  started = true
  provider = pickProvider()
  try {
    provider.init?.()
  } catch (e) {
    logger.warn('analytics init 실패', { error: e })
  }
}

function safe(fn) {
  try { fn() } catch (e) { logger.debug('analytics 호출 실패', { error: e }) }
}

export const analytics = {
  pageView: (path, meta) => safe(() => provider.pageView?.(path, meta)),
  track: (event, props) => safe(() => provider.track?.(event, props)),
  identify: (id, traits) => safe(() => provider.identify?.(id, traits)),
  get providerName() { return provider?.name || 'none' },
}

export default analytics
