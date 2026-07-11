// FANCLUV — 전역 Toast 시스템 (성공/실패/경고/정보 통일).
//
// 화면 어디서나 useToast() 로 알림을 띄운다:
//   const toast = useToast()
//   toast.success('저장되었습니다')
//   toast.error('일시적인 문제가 발생했습니다')   // 실패는 조금 더 오래 노출
//   toast.warn('...'), toast.info('...')
//   toast.show(msg, { type: 'info', duration: 2500 })
//
// 페이지마다 제각각이던 인라인 토스트(od-toast/st-toast 등)를 이 한 곳으로 통일한다.
import { createContext, useContext, useState, useCallback, useRef } from 'react'
import Toast from '../components/Toast.jsx'

const ToastContext = createContext(null)

const DEFAULT_MS = { success: 2200, info: 2200, warning: 3200, error: 3600 }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts(list => list.filter(t => t.id !== id))
  }, [])

  const show = useCallback((message, opts = {}) => {
    const message_ = String(message ?? '').trim()
    if (!message_) return
    const type = opts.type || 'info'
    const duration = opts.duration ?? DEFAULT_MS[type] ?? 2400
    const id = ++idRef.current
    setToasts(list => [...list.slice(-3), { id, message: message_, type }]) // 최대 4개 스택
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  // 편의 메서드 — 참조 안정성 위해 ref 로 고정된 show 사용.
  const api = useRef({
    show,
    success: (m, o) => show(m, { ...o, type: 'success' }),
    error: (m, o) => show(m, { ...o, type: 'error' }),
    warn: (m, o) => show(m, { ...o, type: 'warning' }),
    info: (m, o) => show(m, { ...o, type: 'info' }),
    dismiss,
  })
  // show/dismiss 는 useCallback 으로 안정적이므로 최초 1회 세팅으로 충분.

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <Toast toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

// Provider 밖에서 호출돼도 앱이 죽지 않도록 no-op 폴백을 준다.
const NOOP = { show: () => {}, success: () => {}, error: () => {}, warn: () => {}, info: () => {}, dismiss: () => {} }

export function useToast() {
  return useContext(ToastContext) || NOOP
}
