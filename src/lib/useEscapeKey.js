// FANCLUV — ESC 키로 오버레이/모달 닫기 (접근성).
// 모달이 열려 있을 때만(active) 리스너를 등록하고, ESC 를 누르면 onEscape 를 호출한다.
import { useEffect } from 'react'

export function useEscapeKey(onEscape, active = true) {
  useEffect(() => {
    if (!active) return
    const handler = e => { if (e.key === 'Escape') onEscape() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEscape, active])
}

export default useEscapeKey
