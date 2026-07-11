// FANCLUV — NotificationService (알림 단일 진입점).
//
// 알림 "생성"은 서비스에서 직접 insert 하지 않는다:
//   • 팬 이벤트(댓글/공감/설문/뉴스) → DB 트리거(0006/0045, SECURITY DEFINER)가 생성.
//     트리거는 수신자의 profiles.notification_prefs 를 존중한다(OFF → 미생성).
//   • 운영(관리자) 알림 → notify_admins RPC(SECURITY DEFINER) 로만 생성(notifyAdmins).
// 클라이언트는 조회 / 읽음 / 삭제 / 구독 / (관리자)notifyAdmins 만 사용한다.
//
// 화면(NotificationBell, NotificationCenterPage)은 이 서비스만 import 하면 된다.
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  deleteNotification,
  deleteAll,
  subscribeNotifications,
  notifyAdmins,
} from './notificationsRepo.js'
import { getPrefs, setPref, loadServerPrefs } from './notifyPrefs.js'

export const NotificationService = {
  // 조회
  list: listNotifications,          // ({ limit, type, unreadOnly })
  unreadCount,
  // 상태 변경
  markRead,
  markAllRead,
  remove: deleteNotification,
  removeAll: deleteAll,
  // 실시간
  subscribe: subscribeNotifications, // (onChange) => unsubscribe
  // 운영 알림(관리자 전용, RPC 경유 — 직접 insert 금지)
  notifyAdmins,
  // 설정(수신 종류) — 서버(profiles.notification_prefs)와 동기화
  getPrefs,
  setPref,
  loadServerPrefs,
}

export default NotificationService
