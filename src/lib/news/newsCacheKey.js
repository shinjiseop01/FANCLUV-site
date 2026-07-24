// FANCLUV — 뉴스 AI 요약 캐시 키(순수 함수). 클라이언트(newsSummaryRepo)와 백그라운드 Worker 가
// 동일 키를 생성해야 캐시(news_ai_summary)를 공유한다 → 이 모듈을 단일 출처로 사용.
//   key = `${teamId}:${djb2(sourceUrl || title || id)}`  (Worker(Deno) 는 이 djb2 를 바이트 단위로 미러링)

export function djb2(str) {
  let h = 5381
  const s = String(str || '')
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// item: { id, title, sourceUrl }. 우선순위: sourceUrl → title → id.
export function newsCacheKey(teamId, item) {
  return `${teamId}:${djb2(item.sourceUrl || item.title || String(item.id))}`
}
