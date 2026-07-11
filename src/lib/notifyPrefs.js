// FANCLUV — 알림 설정(선호도) 저장소.
//
// 알림 종류(comment/empathy/survey/news/notice)는 **profiles.notification_prefs(jsonb)**
// 에 저장되어 DB 알림 트리거가 존중한다(OFF → 서버가 알림을 아예 생성하지 않음, 0045).
// localStorage 는 즉시 UI 반영을 위한 캐시 + Mock 폴백으로 유지한다.
// browser/email 은 클라이언트 전용(서버 트리거와 무관).
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser } from './auth.js'
import { logger } from './logger.js'

const KEY = 'fancluv_noti_prefs'

// 로컬 pref 키 → DB notification_prefs 키(알림 type). empathy=like.
const TYPE_MAP = { comment: 'comment', empathy: 'like', survey: 'survey', news: 'news', notice: 'notice' }

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
  // 알림 종류 설정은 서버에도 반영(트리거가 존중) — 비차단.
  if (isSupabaseConfigured && TYPE_MAP[key]) syncPrefToServer(key, value)
  return prefs
}

// ── 서버(profiles.notification_prefs) 반영 — 단건 ──
async function syncPrefToServer(localKey, value) {
  const me = getCurrentUser()
  if (!me) return
  const dbKey = TYPE_MAP[localKey]
  try {
    const { data } = await supabase.from('profiles').select('notification_prefs').eq('id', me.id).maybeSingle()
    const next = { ...(data?.notification_prefs || {}), [dbKey]: value }
    await supabase.from('profiles').update({ notification_prefs: next }).eq('id', me.id)
  } catch (e) { logger.warn('알림 설정 서버 반영 실패', { error: e }) }
}

// ── 앱/설정 진입 시 서버 설정을 로컬 캐시에 병합 ──
export async function loadServerPrefs() {
  if (!isSupabaseConfigured) return getPrefs()
  const me = getCurrentUser()
  if (!me) return getPrefs()
  try {
    const { data } = await supabase.from('profiles').select('notification_prefs').eq('id', me.id).maybeSingle()
    const server = data?.notification_prefs || {}
    const local = getPrefs()
    // DB(type 키) → 로컬(local 키) 역매핑.
    for (const [localKey, dbKey] of Object.entries(TYPE_MAP)) {
      if (server[dbKey] !== undefined) local[localKey] = !!server[dbKey]
    }
    savePrefs(local)
    return local
  } catch { return getPrefs() }
}
