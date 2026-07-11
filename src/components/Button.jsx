// FANCLUV — 공용 Button 컴포넌트 (디자인 시스템).
//
// variant: primary | secondary | danger | success | outline | ghost
// size:    sm | md | lg | icon
// 상태:    disabled, loading(중복클릭 차단 + aria-busy), fullWidth, active
// 아이콘:  leftIcon / rightIcon (Icon 이름 문자열), size="icon" 은 아이콘 전용
//
//   <Button variant="primary">저장</Button>
//   <Button variant="danger" loading={deleting} leftIcon="trash">삭제</Button>
//   <Button variant="ghost" size="icon" aria-label="닫기"><Icon name="close" /></Button>
//
// 접근성/안전:
//  - type 기본 'button' → 폼 안에서 의도치 않은 submit 방지(제출용은 type="submit").
//  - loading/disabled 시 클릭 차단 + aria-disabled + (loading) aria-busy.
//  - focus-visible 아웃라인 유지(Button.css), 최소 터치 영역 확보.
import Icon from './Icon.jsx'
import './Button.css'

export default function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  disabled = false,
  fullWidth = false,
  active = false,
  leftIcon,
  rightIcon,
  className = '',
  onClick,
  children,
  ...rest
}) {
  const isDisabled = disabled || loading

  const cls = [
    'fc-btn',
    `fc-btn-${variant}`,
    `fc-btn-${size}`,
    fullWidth ? 'fc-btn-full' : '',
    active ? 'is-active' : '',
    loading ? 'is-loading' : '',
    className,
  ].filter(Boolean).join(' ')

  function handleClick(e) {
    // loading/disabled 중 중복 클릭 차단.
    if (isDisabled) { e.preventDefault(); return }
    onClick?.(e)
  }

  const iconSize = size === 'sm' ? 15 : size === 'lg' ? 19 : 17

  return (
    <button
      type={type}
      className={cls}
      onClick={handleClick}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Icon name="loading" size={iconSize} className="fc-btn-spin" />}
      {!loading && leftIcon && <Icon name={leftIcon} size={iconSize} className="fc-btn-ico" />}
      {children != null && <span className="fc-btn-label">{children}</span>}
      {!loading && rightIcon && <Icon name={rightIcon} size={iconSize} className="fc-btn-ico" />}
    </button>
  )
}
