// FANCLUV — 알림 설정(선호도) 저장소.
//
// 현재는 localStorage 에 저장한다. 향후 Supabase profiles 에
// notification_prefs(jsonb) 컬럼을 추가하면 get/set 내부만 교체하면 된다
// (구조는 그대로 재사용).
const KEY = 'fancluv_noti_prefs'

// 기본값: 브라우저 알림은 사용자가 명시적으로 켜야 하므로 off.
export const DEFAULT_PREFS = {
  browser: false, // 브라우저(푸시) 알림
  email: true,    // 이메일 알림
  survey: true,   // 새 설문
  news: true,     // 새 뉴스
  comment: true,  // 댓글
  empathy: false, // 공감
  notice: true,   // 관리자 공지
}

export function getPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {}
    return { ...DEFAULT_PREFS, ...saved }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}

export function setPref(key, value) {
  const prefs = getPrefs()
  prefs[key] = value
  savePrefs(prefs)
  return prefs
}
