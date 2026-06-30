// Relative time formatting for mock data.
// Mock posts/comments carry an "hours ago" number; this turns it into a
// localized label: 방금 전 / 5분 전 / 1시간 전 / 어제 / 3일 전.

export function relativeTime(hours, lang = 'ko') {
  const h = Math.max(0, Number(hours) || 0)
  const mins = Math.round(h * 60)
  const days = Math.floor(h / 24)

  if (lang === 'en') {
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (h < 24) return `${Math.floor(h)}h ago`
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    return `${Math.floor(days / 7)}w ago`
  }

  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  if (h < 24) return `${Math.floor(h)}시간 전`
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  return `${Math.floor(days / 7)}주 전`
}
