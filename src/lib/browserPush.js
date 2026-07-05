// FANCLUV — 브라우저 알림(Web Notifications) 헬퍼.
//
// 권한 조회/요청, 테스트 알림, 그리고 "향후 이벤트 연결 지점"(pushEventNotification)을 제공.
// 실제 Push 서버(웹푸시)는 이번 범위 밖 — 지금은 로컬 Notification 으로 표시하되,
// 내부 Notification Center(알림 벨)와 동일한 이벤트 유형을 그대로 받도록 설계했다.
import { getPrefs } from './notifyPrefs.js'

// 'granted' | 'denied' | 'default' | 'unsupported'
export function getPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export function isSupported() {
  return typeof Notification !== 'undefined'
}

export async function requestPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    const res = await Notification.requestPermission()
    return res
  } catch {
    return Notification.permission
  }
}

// 브라우저 알림 표시. Service Worker 등록이 있으면 SW 경유(설치형에서 안정적), 아니면 Notification.
export async function showBrowserNotification({ title, body, url = '/', tag }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return { ok: false, reason: 'no_permission' }
  const options = { body, icon: '/icon.svg', badge: '/icon.svg', tag, data: { url }, lang: 'ko' }
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration())
    if (reg && reg.showNotification) { await reg.showNotification(title, options); return { ok: true } }
  } catch { /* fall through */ }
  try { new Notification(title, options); return { ok: true } } catch { return { ok: false } }
}

// 이벤트 유형 → 설정(prefs) 키 매핑 (내부 알림 시스템과 동일한 이벤트)
const TYPE_PREF = { comment: 'comment', like: 'empathy', survey: 'survey', news: 'news', notice: 'notice' }
const TYPE_TITLE = { comment: '새 댓글', like: '새 공감', survey: '새 설문', news: '새 팀 뉴스', notice: '관리자 공지' }

// 특정 유형이 브라우저 알림으로 표시 가능한지 (브라우저 알림 ON + 해당 유형 ON + 권한 granted)
export function isEventEnabled(type) {
  const prefs = getPrefs()
  const key = TYPE_PREF[type]
  return prefs.browser && (key ? prefs[key] : true) && getPermission() === 'granted'
}

// ▶ 향후 이벤트 연결 지점.
//   새 댓글/공감/설문/뉴스/관리자 공지 발생 시 이 함수를 호출하면
//   사용자 설정과 권한을 확인해 브라우저 알림을 띄운다.
//   (지금은 어디서도 자동 호출하지 않으며, 설정/구조만 준비된 상태)
export async function pushEventNotification(type, { body = '', url = '/' } = {}) {
  if (!isEventEnabled(type)) return { ok: false, reason: 'disabled' }
  return showBrowserNotification({ title: TYPE_TITLE[type] || 'FANCLUV', body, url, tag: type })
}

// 설정 화면 "테스트 알림 보내기"
export async function sendTestNotification(body) {
  return showBrowserNotification({
    title: 'FANCLUV',
    body: body || 'FANCLUV 알림이 정상적으로 설정되었습니다.',
    url: '/',
    tag: 'fancluv-test',
  })
}
