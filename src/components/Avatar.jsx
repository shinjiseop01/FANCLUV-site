import LazyImage from './LazyImage.jsx'

// Default fan avatar. Shows the user's photo when `src` is provided
// (lazy-loaded, falls back to the initial on load failure), otherwise a
// team-tinted initial. The wrapper class drives sizing/colour via tokens.

export default function Avatar({ name = '', src, size = 40, className = '' }) {
  const initial = (name.trim()[0] || '?').toUpperCase()
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }
  const initialNode = <span className="fc-avatar-initial">{initial}</span>
  return (
    <span className={`fc-avatar ${className}`} style={style} aria-hidden="true">
      {src
        ? <LazyImage src={src} alt="" className="fc-avatar-img" placeholder={initialNode} />
        : initialNode}
    </span>
  )
}
