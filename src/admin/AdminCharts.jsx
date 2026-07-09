// FANCLUV Admin — lightweight inline-SVG charts (no chart library).
// Token-driven so they read well in both light and dark. All charts take
// plain data arrays, so swapping mock → Supabase only changes the data source.
// 각 요소에 데이터 라벨 + hover 툴팁(<title>) + 축 값을 제공해 관리자가 정확한
// 수치를 바로 확인할 수 있게 한다.
import { useLang } from '../contexts/LanguageContext.jsx'

const fmt = n => Number(n || 0).toLocaleString()

// ── Line chart (일별 추이) ──
export function LineChart({ data, color = 'var(--team-deep)', height = 150 }) {
  const W = 320, H = height, padX = 34, padTop = 18, padBottom = 24
  const plotW = W - padX - 10
  const plotH = H - padTop - padBottom
  const max = Math.max(...data.map(d => d.value)) * 1.15 || 1
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0
  const px = i => padX + stepX * i
  const py = v => padTop + plotH - (v / max) * plotH

  const pts = data.map((d, i) => `${px(i)},${py(d.value)}`).join(' ')
  const area = `M${px(0)},${padTop + plotH} L${pts.replace(/ /g, ' L')} L${px(data.length - 1)},${padTop + plotH} Z`

  return (
    <svg className="adm-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img">
      {/* grid + y축 값 */}
      {[0, 0.25, 0.5, 0.75, 1].map(g => (
        <g key={g}>
          <line x1={padX} x2={W - 10} y1={padTop + plotH * g} y2={padTop + plotH * g}
            stroke="var(--border-soft)" strokeWidth="1" />
          <text x={padX - 6} y={padTop + plotH * g + 3} textAnchor="end" className="adm-chart-axis">
            {fmt(Math.round(max * (1 - g)))}
          </text>
        </g>
      ))}
      <path d={area} fill={color} fillOpacity="0.12" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={i} className="adm-point">
          <circle cx={px(i)} cy={py(d.value)} r="3.6" fill="var(--canvas)" stroke={color} strokeWidth="2" />
          <text x={px(i)} y={py(d.value) - 8} textAnchor="middle" className="adm-chart-value">{fmt(d.value)}</text>
          {/* hover 시 정확한 수치 */}
          <circle cx={px(i)} cy={py(d.value)} r="11" fill="transparent">
            <title>{d.label}: {fmt(d.value)}</title>
          </circle>
        </g>
      ))}
      {data.map((d, i) => (
        <text key={i} x={px(i)} y={H - 7} textAnchor="middle" className="adm-chart-axis">{d.label}</text>
      ))}
    </svg>
  )
}

// ── Bar chart (일별 개수) ──
export function BarChart({ data, color = 'var(--team)', height = 150 }) {
  const W = 320, H = height, padX = 34, padTop = 18, padBottom = 24
  const plotW = W - padX - 10
  const plotH = H - padTop - padBottom
  const max = Math.max(...data.map(d => d.value)) * 1.15 || 1
  const slot = plotW / data.length
  const barW = Math.min(26, slot * 0.55)

  return (
    <svg className="adm-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img">
      {[0, 0.5, 1].map(g => (
        <g key={g}>
          <line x1={padX} x2={W - 10} y1={padTop + plotH * g} y2={padTop + plotH * g}
            stroke="var(--border-soft)" strokeWidth="1" />
          <text x={padX - 6} y={padTop + plotH * g + 3} textAnchor="end" className="adm-chart-axis">
            {fmt(Math.round(max * (1 - g)))}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const h = (d.value / max) * plotH
        const cx = padX + slot * i + slot / 2
        const x = cx - barW / 2
        const y = padTop + plotH - h
        return (
          <g key={i} className="adm-bar">
            <rect x={x} y={y} width={barW} height={h} rx="4" fill={color} fillOpacity="0.9">
              <title>{d.label}: {fmt(d.value)}</title>
            </rect>
            <text x={cx} y={y - 6} textAnchor="middle" className="adm-chart-value">{fmt(d.value)}</text>
          </g>
        )
      })}
      {data.map((d, i) => (
        <text key={i} x={padX + slot * i + slot / 2} y={H - 7} textAnchor="middle" className="adm-chart-axis">{d.label}</text>
      ))}
    </svg>
  )
}

// ── Donut chart (구단별 비율) — donut + legend ──
export function DonutChart({ data }) {
  const { t } = useLang()
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
            <circle key={i} className="adm-donut-seg" cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}>
              <title>{d.label}: {fmt(d.value)} ({Math.round((d.value / total) * 100)}%)</title>
            </circle>
          )
          offset += len
          return seg
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="adm-donut-total">{total.toLocaleString()}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="adm-donut-cap">{t('admin.unit.count')}</text>
      </svg>
      <ul className="adm-donut-legend">
        {data.map((d, i) => (
          <li key={i}>
            <span className="adm-legend-dot" style={{ background: d.color }} />
            <span className="adm-legend-label">{d.label}</span>
            <span className="adm-legend-val">{fmt(d.value)} · {Math.round((d.value / total) * 100)}%</span>
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
          <span key={i} className="adm-stack-seg" style={{ width: `${(d.value / total) * 100}%`, background: d.color }}
            title={`${labelFor ? labelFor(d.key) : d.key}: ${d.value}%`} />
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
