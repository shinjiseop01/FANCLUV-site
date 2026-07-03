// FANCLUV — 아주 단순한 in-memory TTL 캐시.
//
// 실시간 데이터(순위/일정/홈 인기 콘텐츠/관리자 KPI)의 불필요한 반복 호출을 줄인다.
// 같은 key 로 TTL(기본 30초) 안에 다시 요청하면 진행 중이거나 완료된 Promise 를
// 그대로 재사용한다. fetcher 가 실패하면 캐시에서 제거해 다음 호출 때 재시도한다.

const DEFAULT_TTL = 30_000 // 30초
const store = new Map() // key -> { at, promise }

// key 로 캐시된 결과를 반환하거나, 없으면 fetcher() 를 실행해 캐시 후 반환한다.
export function withCache(key, fetcher, ttlMs = DEFAULT_TTL) {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise

  const promise = Promise.resolve().then(fetcher)
  store.set(key, { at: Date.now(), promise })
  // 실패한 응답은 캐시하지 않는다(다음 호출에서 재시도 가능).
  promise.catch(() => {
    if (store.get(key)?.promise === promise) store.delete(key)
  })
  return promise
}

// 특정 key(또는 접두사) 캐시를 무효화한다. 새로고침 버튼 등에서 사용.
export function invalidate(prefix) {
  if (!prefix) { store.clear(); return }
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(prefix)) store.delete(key)
  }
}

export function clearCache() { store.clear() }
