// FANCLUV — Service Worker (PWA).
//
// - 정적 리소스(앱 셸) 캐싱
// - 네트워크 실패 시 캐시/오프라인 fallback
// - 앱 업데이트 대응: 버전 캐시명 + skipWaiting/clients.claim
//   (새 SW 배포 시 CACHE 버전만 올리면 이전 캐시 정리)
const CACHE = 'fancluv-cache-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.svg']

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).catch(() => {}),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// 업데이트 즉시 적용 요청 처리(registerSW 에서 postMessage)
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // 동일 출처만 처리(Supabase/외부 API 등은 그대로 네트워크로).
  if (url.origin !== self.location.origin) return

  // 페이지 이동(navigate): 네트워크 우선, 실패 시 캐시된 앱 셸로 오프라인 대응.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res })
        .catch(() => caches.match(req).then(r => r || caches.match('/index.html'))),
    )
    return
  }

  // 정적 리소스: 캐시 우선, 없으면 네트워크(성공 시 캐시에 저장).
  event.respondWith(
    caches.match(req).then(cached =>
      cached ||
      fetch(req)
        .then(res => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then(c => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached),
    ),
  )
})

// (향후) Push 서버 연결 시 여기에 push/notificationclick 핸들러를 추가한다.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) { client.focus(); if (url && 'navigate' in client) client.navigate(url); return }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url || '/')
    }),
  )
})
