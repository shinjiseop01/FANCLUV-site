// FANCLUV — 공통 페이지네이션 (페이지 번호 방식, "더보기" 대체).
//
// 사용: <Pagination page={page} total={totalPages} onChange={setPage} />
//   · total <= 1 이면 아무것도 렌더하지 않음(규칙 4).
//   · 페이지가 많으면 < 1 2 3 4 5 … 18 > 형태로 앞/뒤 생략(…) 표시.
//   · 현재 페이지 강조. 라이트/다크/모바일 대응(CSS 토큰).
import { useLang } from '../contexts/LanguageContext.jsx'
import './Pagination.css'

// 현재 페이지 주변 window + 처음/끝 + 생략(...) 계산.
function buildRange(page, total, delta = 1) {
  const range = []
  const left = Math.max(2, page - delta)
  const right = Math.min(total - 1, page + delta)
  range.push(1)
  if (left > 2) range.push('…l')
  for (let i = left; i <= right; i++) range.push(i)
  if (right < total - 1) range.push('…r')
  if (total > 1) range.push(total)
  return range
}

export default function Pagination({ page, total, onChange, className = '' }) {
  const { t } = useLang()
  if (!total || total <= 1) return null
  const cur = Math.min(Math.max(1, page), total)
  const items = buildRange(cur, total)

  return (
    <nav className={`pgn ${className}`} role="navigation" aria-label={t('common.pagination')}>
      <button className="pgn-arrow" disabled={cur <= 1} onClick={() => onChange(cur - 1)} aria-label={t('common.prevPage')}>‹</button>
      {items.map((it, i) =>
        typeof it === 'number' ? (
          <button
            key={it}
            className={`pgn-num${it === cur ? ' on' : ''}`}
            aria-current={it === cur ? 'page' : undefined}
            onClick={() => onChange(it)}
          >{it}</button>
        ) : (
          <span key={`e${i}`} className="pgn-ellipsis" aria-hidden="true">…</span>
        ),
      )}
      <button className="pgn-arrow" disabled={cur >= total} onClick={() => onChange(cur + 1)} aria-label={t('common.nextPage')}>›</button>
    </nav>
  )
}
