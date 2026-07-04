import Icon from './Icon.jsx'

// Reusable empty-state panel: icon + title + message + optional CTA.
// Used wherever a list/section can legitimately have no data.
// `iconName` 을 주면 SVG 아이콘(Icon.jsx)을, 아니면 `icon`(노드) 을 렌더한다.
export default function EmptyState({ iconName, icon, title, message, ctaLabel, onCta, compact = false }) {
  return (
    <div className={`fc-empty${compact ? ' compact' : ''}`} role="status">
      <span className="fc-empty-icon" aria-hidden="true">
        {iconName ? <Icon name={iconName} size={34} strokeWidth={1.6} /> : (icon || <Icon name="clipboard" size={34} strokeWidth={1.6} />)}
      </span>
      {title && <h3 className="fc-empty-title">{title}</h3>}
      {message && <p className="fc-empty-msg">{message}</p>}
      {ctaLabel && onCta && (
        <button type="button" className="fc-empty-cta" onClick={onCta}>{ctaLabel}</button>
      )}
    </div>
  )
}
