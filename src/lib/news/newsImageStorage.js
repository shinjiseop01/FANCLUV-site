// FANCLUV — 팀 뉴스 대표 이미지 저장소(news-images 버킷).
//
// 업로드/교체/삭제. 형식(jpg/png/webp)·용량 검증. 교체 시 이전 파일 삭제로 Storage orphan 0.
// Supabase 미설정(Mock)에서는 dataURL 로 대체(로컬 미리보기).
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { logger } from '../logger.js'

export const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
export const ACCEPTED_EXT = 'jpg, jpeg, png, webp'
export const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const BUCKET = 'news-images'

export function validateImageFile(file) {
  if (!file) return { ok: false, code: 'no_file' }
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, code: 'type' }
  if (file.size > MAX_SIZE) return { ok: false, code: 'size' }
  return { ok: true }
}

function extOf(file) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

function blobToDataUrl(blob) {
  return new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob) })
}

// storage public URL → 버킷 내부 경로 복원(교체/삭제 시 이전 파일 정리용).
function pathFromUrl(url) {
  if (!url) return null
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  return url.slice(i + marker.length).split('?')[0]
}

// 대표 이미지 업로드/교체. newsKey(임시 draft id 또는 news id)별 폴더.
//   교체 성공 시 previousUrl(같은 버킷)을 삭제 → orphan 0. 실패 시 신규 파일 rollback.
export async function saveNewsImage(file, newsKey, previousUrl = null) {
  const v = validateImageFile(file)
  if (!v.ok) return v
  if (!isSupabaseConfigured) {
    const url = await blobToDataUrl(file)
    return { ok: true, url }
  }
  const key = String(newsKey || 'tmp')
  const path = `${key}/cover-${Date.now()}.${extOf(file)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
  if (error) { logger.warn('뉴스 이미지 업로드 실패', { error }); return { ok: false, code: 'upload_failed' } }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const url = data.publicUrl
  // 이전 파일 정리(orphan 0). 실패해도 신규 업로드는 유효 → 경고만.
  const prevPath = pathFromUrl(previousUrl)
  if (prevPath && prevPath !== path) {
    const { error: delErr } = await supabase.storage.from(BUCKET).remove([prevPath])
    if (delErr) logger.warn('이전 뉴스 이미지 삭제 실패(orphan 가능)', { delErr })
  }
  return { ok: true, url, path }
}

// 대표 이미지 삭제(뉴스 삭제/이미지 제거 시). 파일 없으면 no-op.
export async function deleteNewsImage(url) {
  if (!isSupabaseConfigured) return { ok: true }
  const path = pathFromUrl(url)
  if (!path) return { ok: true }
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) { logger.warn('뉴스 이미지 삭제 실패', { error }); return { ok: false, code: 'delete_failed' } }
  return { ok: true }
}
