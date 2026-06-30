import { createContext, useContext, useCallback, useState, useRef } from 'react'

// Lightweight toast notifications. useToast() returns a `toast(message)`
// function; messages auto-dismiss. The container is rendered once here.

const ToastContext = createContext({ toast: () => {} })

let nextId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const remove = useCallback(id => {
    setToasts(list => list.filter(t => t.id !== id))
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
  }, [])

  const toast = useCallback((message, { icon = '✓', duration = 2400 } = {}) => {
    if (!message) return
    const id = ++nextId
    setToasts(list => [...list, { id, message, icon }])
    timers.current[id] = setTimeout(() => remove(id), duration)
  }, [remove])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fc-toast-wrap" role="region" aria-live="polite" aria-label="알림">
        {toasts.map(t => (
          <div key={t.id} className="fc-toast" onClick={() => remove(t.id)}>
            <span className="fc-toast-icon" aria-hidden="true">{t.icon}</span>
            <span className="fc-toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
