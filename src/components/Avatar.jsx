// Default fan avatar. Shows the user's photo when `src` is provided
// (future profile-image support), otherwise a team-tinted initial.
// The wrapper class drives sizing/colour via the existing token system.

export default function Avatar({ name = '', src, size = 40, className = '' }) {
  const initial = (name.trim()[0] || '?').toUpperCase()
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }
  return (
    <span className={`fc-avatar ${className}`} style={style} aria-hidden="true">
      {src
        ? <img src={src} alt="" className="fc-avatar-img" />
        : <span className="fc-avatar-initial">{initial}</span>}
    </span>
  )
}
