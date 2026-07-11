// FANCLUV — 클라이언트 페이지네이션 훅 (공통 Pagination 컴포넌트와 함께 사용).
//
// 이미 로드된 목록을 페이지당 perPage 개로 잘라준다. 필터/정렬이 바뀌면 deps 로
// 1페이지로 초기화한다. (DB LIMIT/OFFSET 전환 시에는 이 훅 대신 서버 쿼리를 사용)
import { useState, useEffect, useMemo } from 'react'

export function usePagination(items, perPage = 20, deps = []) {
  const [page, setPage] = useState(1)
  // 필터/검색/정렬(deps) 변경 시 1페이지로.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1) }, deps)

  const list = items || []
  const total = Math.max(1, Math.ceil(list.length / perPage))
  const cur = Math.min(page, total)
  const paged = useMemo(() => list.slice((cur - 1) * perPage, cur * perPage), [list, cur, perPage])
  return { page: cur, total, setPage, paged }
}
