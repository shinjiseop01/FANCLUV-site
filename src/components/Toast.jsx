// FANCLUV — Toast 렌더러 (ToastProvider 가 사용).
// 화면 우하단(모바일은 하단 중앙)에 스택으로 쌓이며, 클릭/자동으로 사라진다.
import Icon from './Icon.jsx'
import './Toast.css'

const ICON = { success: 'check', error: 'alert', warning: 'alert', info: 'info' }

export default function Toast({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null
  return (
    <div className="fc-toasts" role="region" aria-label="알림" aria-live="polite">
      {toasts.map(t => (
        <button
          key={t.id}
          type="button"
          className={`fc-toast fc-toast-${t.type}`}
          onClick={() => onDismiss(t.id)}
          role="status"
        >
          <span className="fc-toast-icon" aria-hidden="true"><Icon name={ICON[t.type] || 'info'} size={16} /></span>
          <span className="fc-toast-msg">{t.message}</span>
        </button>
      ))}
    </div>
  )
}
