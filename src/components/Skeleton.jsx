// Loading skeleton primitives. `Skeleton` is a single shimmering block;
// `SkeletonCard` and `SkeletonList` compose common shapes used while data loads.

export function Skeleton({ w = '100%', h = 14, r = 6, className = '', style }) {
  return (
    <span
      className={`fc-sk ${className}`}
      style={{ width: w, height: h, borderRadius: r, ...style }}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard({ lines = 2 }) {
  return (
    <div className="fc-sk-card" aria-hidden="true">
      <div className="fc-sk-card-head">
        <Skeleton w={36} h={36} r={999} />
        <div className="fc-sk-card-head-text">
          <Skeleton w="40%" h={12} />
          <Skeleton w="25%" h={10} />
        </div>
      </div>
      <Skeleton w="80%" h={16} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} w={i === lines - 1 ? '60%' : '100%'} h={12} />
      ))}
      <div className="fc-sk-card-foot">
        <Skeleton w={56} h={12} />
        <Skeleton w={56} h={12} />
      </div>
    </div>
  )
}

export function SkeletonList({ count = 4, lines = 2 }) {
  return (
    <div className="fc-sk-list" role="status" aria-label="loading">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  )
}
