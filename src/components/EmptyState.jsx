// Reusable empty-state panel: icon + title + message + optional CTA.
// Used wherever a list/section can legitimately have no data.

export default function EmptyState({ icon = '📭', title, message, ctaLabel, onCta, compact = false }) {
  return (
    <div className={`fc-empty${compact ? ' compact' : ''}`} role="status">
      <span className="fc-empty-icon" aria-hidden="true">{icon}</span>
      {title && <h3 className="fc-empty-title">{title}</h3>}
      {message && <p className="fc-empty-msg">{message}</p>}
      {ctaLabel && onCta && (
        <button type="button" className="fc-empty-cta" onClick={onCta}>{ctaLabel}</button>
      )}
    </div>
  )
}
