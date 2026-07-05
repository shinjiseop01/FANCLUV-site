// FANCLUV — Service Worker 등록.
//
// 개발(dev) 중에는 Vite HMR 과의 충돌을 피하려고 등록하지 않고, 프로덕션 빌드에서만
// 등록한다. 새 SW 가 감지되면(waiting) 즉시 적용하도록 SKIP_WAITING 을 보낸다.
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return // dev 에서는 미등록 (HMR 보호)

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // 업데이트 감지 → 새 워커 설치 완료 시 즉시 활성화
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            nw.postMessage('SKIP_WAITING')
          }
        })
      })
    }).catch(() => { /* 등록 실패는 무시(앱은 정상 동작) */ })

    // 컨트롤러 변경(새 SW 활성) 시 한 번만 새로고침해 최신 앱 셸 반영
    let refreshed = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return
      refreshed = true
      window.location.reload()
    })
  })
}
