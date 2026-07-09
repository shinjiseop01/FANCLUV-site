import { useEffect, useRef, useState } from 'react'

// 숫자가 바뀌면 이전 값에서 새 값으로 부드럽게 카운트(easeOutCubic)하며 위로 살짝
// 올라오는 느낌을 준다. 공감/댓글/통계 수 등 실시간 반영 지점에 사용.
export default function AnimatedNumber({ value, duration = 550, format }) {
  const numeric = Number(value) || 0
  const [display, setDisplay] = useState(numeric)
  const [bump, setBump] = useState(0) // 값 변경 때마다 슬라이드 애니메이션 재생 트리거
  const fromRef = useRef(numeric)
  const rafRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const to = numeric
    if (from === to) { setDisplay(to); return }
    setBump(b => b + 1)
    const start = performance.now()
    const tick = now => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [numeric, duration])

  const text = format ? format(display) : display.toLocaleString()
  return <span key={bump} className="animated-number">{text}</span>
}
