// FANCLUV — 프로필 이미지 저장소 추상화.
//
// Supabase Storage(`avatars` 버킷)가 연결돼 있으면 업로드 후 public URL 을,
// 아니면 dataURL(localStorage/Mock)을 반환한다. 형식/용량 검증도 여기서 담당.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser } from './auth.js'

export const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
export const ACCEPTED_EXT = 'jpg, jpeg, png, webp'
export const MAX_SIZE = 5 * 1024 * 1024 // 5MB

// 업로드 파일 검증 → { ok, code } (code: 'no_file' | 'type' | 'size')
export function validateImageFile(file) {
  if (!file) return { ok: false, code: 'no_file' }
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, code: 'type' }
  if (file.size > MAX_SIZE) return { ok: false, code: 'size' }
  return { ok: true }
}

function blobToDataUrl(blob) {
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.readAsDataURL(blob)
  })
}

// 크롭된 blob 저장 → { ok, url, error }
// Supabase: Storage `avatars/{userId}/avatar.png` 업로드 후 public URL(캐시버스터 포함).
// Mock: blob 을 dataURL 로 변환해 반환(프로필에 그대로 저장).
export async function saveAvatar(blob) {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (!me) return { ok: false, error: '로그인이 필요합니다.' }
    const path = `${me.id}/avatar.png`
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/png', cacheControl: '3600' })
    if (error) return { ok: false, error: error.message }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return { ok: true, url: `${data.publicUrl}?t=${Date.now()}` }
  }
  // Mock
  const url = await blobToDataUrl(blob)
  return { ok: true, url }
}

// 저장된 아바타 제거(기본 프로필로). Supabase 는 Storage 파일 삭제도 시도.
export async function clearAvatar() {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (me) await supabase.storage.from('avatars').remove([`${me.id}/avatar.png`]).catch(() => {})
  }
  return { ok: true }
}
