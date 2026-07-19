// FANCLUV — 공용 Alert(상태 안내) 컴포넌트.
//
// 성공/정보/주의/오류 등 모든 인라인 안내를 하나의 레이아웃으로 통일한다.
// Icon 은 항상 display:block svg 라, 비-flex 컨테이너에서는 아이콘이 윗줄로 떨어진다.
// → Alert 는 항상 flex-row + align-items:center 로 아이콘과 문구를 같은 행에 배치한다.
//   (아이콘 shrink 금지, 텍스트는 자연 줄바꿈. 320/375/768/desktop 동일.)
import Icon from './Icon.jsx'
import './Alert.css'

const KIND_ICON = {
  success: 'successCircle',
  info: 'info',
  warning: 'warningTriangle',
  error: 'warningTriangle',
  loading: 'loading',
}

export default function Alert({ kind = 'info', icon, boxed = false, children, action = null, className = '', role, ...rest }) {
  const iconName = icon || KIND_ICON[kind] || 'info'
  const assertive = kind === 'error' || kind === 'warning'
  // 문구에 개행(\n)이 있으면 의도된 줄 단위로 분리 렌더(임의 위치 개행 방지).
  const content = typeof children === 'string' && children.includes('\n')
    ? children.split('\n').map((ln, i) => <span key={i} className="fc-alert__line">{ln}</span>)
    : children
  return (
    <div
      className={`fc-alert fc-alert--${kind}${boxed ? ' fc-alert--boxed' : ''}${className ? ' ' + className : ''}`}
      role={role || (assertive ? 'alert' : 'status')}
      aria-live={assertive ? 'assertive' : 'polite'}
      {...rest}
    >
      <Icon name={iconName} size={14} className={`fc-alert__icon${kind === 'loading' ? ' fc-alert__spin' : ''}`} aria-hidden="true" />
      <span className="fc-alert__text">{content}</span>
      {/* 부가 액션(예: "이메일 변경") — 텍스트와 분리된 flex sibling(gap 으로 간격 확보). */}
      {action && <span className="fc-alert__action">{action}</span>}
    </div>
  )
}
