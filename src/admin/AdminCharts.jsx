// FANCLUV Admin — lightweight inline-SVG charts (no chart library).
// Token-driven so they read well in both light and dark. All charts take
// plain data arrays, so swapping mock → Supabase only changes the data source.

// ── Line chart (일별 추이) ──
export function LineChart({ data, color = 'var(--team-deep)', height = 150 }) {
  const W = 320, H = height, padX = 10, padTop = 14, padBottom = 24
  const plotW = W - padX * 2
  const plotH = H - padTop - padBottom
  const max = Math.max(...data.map(d => d.value)) * 1.15 || 1
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0
  const px = i => padX + stepX * i
  const py = v => padTop + plotH - (v / max) * plotH

  const pts = data.map((d, i) => `${px(i)},${py(d.value)}`).join(' ')
  const area = `M${px(0)},${padTop + plotH} L${pts.replace(/ /g, ' L')} L${px(data.length - 1)},${padTop + plotH} Z`

  return (
    <svg className="adm-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img">
      {/* grid */}
      {[0.25, 0.5, 0.75, 1].map(g => (
        <line key={g} x1={padX} x2={W - padX} y1={padTop + plotH * g} y2={padTop + plotH * g}
          stroke="var(--border-soft)" strokeWidth="1" />
      ))}
      <path d={area} fill={color} fillOpacity="0.12" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={px(i)} cy={py(d.value)} r="3.4" fill="var(--canvas)" stroke={color} strokeWidth="2" />
      ))}
      {data.map((d, i) => (
        <text key={i} x={px(i)} y={H - 7} textAnchor="middle" className="adm-chart-axis">{d.label}</text>
      ))}
    </svg>
  )
}

// ── Bar chart (일별 개수) ──
export function BarChart({ data, color = 'var(--team)', height = 150 }) {
  const W = 320, H = height, padX = 10, padTop = 14, padBottom = 24
  const plotW = W - padX * 2
  const plotH = H - padTop - padBottom
  const max = Math.max(...data.map(d => d.value)) * 1.1 || 1
  const slot = plotW / data.length
  const barW = Math.min(26, slot * 0.55)

  return (
    <svg className="adm-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img">
      {[0.5, 1].map(g => (
        <line key={g} x1={padX} x2={W - padX} y1={padTop + plotH * g} y2={padTop + plotH * g}
          stroke="var(--border-soft)" strokeWidth="1" />
      ))}
      {data.map((d, i) => {
        const h = (d.value / max) * plotH
        const x = padX + slot * i + (slot - barW) / 2
        const y = padTop + plotH - h
        return <rect key={i} x={x} y={y} width={barW} height={h} rx="4" fill={color} fillOpacity="0.9" />
      })}
      {data.map((d, i) => (
        <text key={i} x={padX + slot * i + slot / 2} y={H - 7} textAnchor="middle" className="adm-chart-axis">{d.label}</text>
      ))}
    </svg>
  )
}

// ── Donut chart (구단별 비율) — donut + legend ──
export function DonutChart({ data }) {
  const size = 150, thickness = 24
  const r = (size - thickness) / 2
  const cx = size / 2, cy = size / 2
  const C = 2 * Math.PI * r
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  let offset = 0

  return (
    <div className="adm-donut-wrap">
      <svg className="adm-donut-svg" viewBox={`0 0 ${size} ${size}`} role="img">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-soft)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const len = (d.value / total) * C
          const seg = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} />
          )
          offset += len
          return seg
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="adm-donut-total">{total.toLocaleString()}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="adm-donut-cap">건</text>
      </svg>
      <ul className="adm-donut-legend">
        {data.map((d, i) => (
          <li key={i}>
            <span className="adm-legend-dot" style={{ background: d.color }} />
            <span className="adm-legend-label">{d.label}</span>
            <span className="adm-legend-val">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Stacked bar (감정 분석 분포) — 가로 누적 막대 + 범례 ──
export function StackedBar({ data, labelFor }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  return (
    <div className="adm-stack">
      <div className="adm-stack-bar" role="img">
        {data.map((d, i) => (
          <span key={i} className="adm-stack-seg" style={{ width: `${(d.value / total) * 100}%`, background: d.color }} />
        ))}
      </div>
      <ul className="adm-stack-legend">
        {data.map((d, i) => (
          <li key={i}>
            <span className="adm-legend-dot" style={{ background: d.color }} />
            <span className="adm-legend-label">{labelFor ? labelFor(d.key) : d.key}</span>
            <span className="adm-legend-val">{d.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
