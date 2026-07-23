// FANCLUV — 자동 수집 오케스트레이터 순수 로직(테스트 대상).
//
// Edge Function news-scheduler(Deno)가 동일 알고리즘을 사용한다. 소스별 수집 결과
// 배열을 run 요약(성공/부분/실패 + 집계)으로 환원한다. 한 소스 실패는 다른 소스에
// 영향을 주지 않는다(격리) — status 만 'partial'.

// results: [{ source, ok, written, ... }]
export function summarizeRun(results) {
  const list = Array.isArray(results) ? results : []
  const ok = list.filter((r) => r && r.ok)
  const failed = list.filter((r) => r && !r.ok)
  const status = list.length === 0 ? 'failed'
    : failed.length === 0 ? 'success'
      : ok.length === 0 ? 'failed' : 'partial'
  return {
    status,
    successful_sources: ok.length,
    failed_sources: failed.length,
    articles_written: list.reduce((s, r) => s + ((r && r.written) || 0), 0),
  }
}
