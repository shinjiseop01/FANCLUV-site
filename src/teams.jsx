// Shared K League 1 (2026) club data + soccer-ball emblem.
// `color` is the brand point colour; `colorDeep` is a readable-on-white variant
// used for text / primary actions (matters for light colours like yellow).

export const TEAMS = [
  { id: 'seoul',    name: 'FC 서울',          short: '서울', color: '#C8102E', colorDeep: '#C8102E' },
  { id: 'ulsan',    name: '울산 HD FC',       short: '울산', color: '#1A50A0', colorDeep: '#1A50A0' },
  { id: 'jeonbuk',  name: '전북 현대 모터스',  short: '전북', color: '#1F683E', colorDeep: '#1F683E' },
  { id: 'pohang',   name: '포항 스틸러스',     short: '포항', color: '#C8102E', colorDeep: '#9E1418' },
  { id: 'daejeon',  name: '대전하나시티즌',    short: '대전', color: '#5E2B97', colorDeep: '#5E2B97' },
  { id: 'gwangju',  name: '광주 FC',          short: '광주', color: '#F4C20D', colorDeep: '#9A7A00' },
  { id: 'gangwon',  name: '강원 FC',          short: '강원', color: '#F47920', colorDeep: '#C85A12' },
  { id: 'gimcheon', name: '김천상무 FC',       short: '김천', color: '#E03131', colorDeep: '#C42121' },
  { id: 'jeju',     name: '제주 SK FC',       short: '제주', color: '#E8590C', colorDeep: '#C2480A' },
  { id: 'anyang',   name: 'FC 안양',          short: '안양', color: '#4B2E83', colorDeep: '#4B2E83' },
  { id: 'incheon',  name: '인천 유나이티드 FC', short: '인천', color: '#0B79C4', colorDeep: '#0A66A6' },
  { id: 'bucheon',  name: '부천 FC 1995',     short: '부천', color: '#D6242B', colorDeep: '#B41C22' },
]

// Main menu items + their routes, shared by every page's top nav so that
// every menu entry navigates consistently from any page.
export const MENU_ITEMS = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

export function menuPath(item, teamId) {
  switch (item) {
    case '홈': return `/club/${teamId}`
    case '설문': return `/club/${teamId}/survey`
    case '팬 의견': return `/club/${teamId}/opinions`
    case '팀 뉴스': return `/club/${teamId}/news`
    case '경기센터': return `/club/${teamId}/matches`
    case 'AI 인사이트': return `/club/${teamId}/insights`
    case '팬 랭킹': return `/club/${teamId}/ranking`
    case '내 활동': return `/club/${teamId}/activity`
    default: return `/club/${teamId}`
  }
}

export function getTeam(id) {
  return TEAMS.find(t => t.id === id) || null
}

// ── Soccer-ball emblem geometry ──
const CX = 40, CY = 40, R = 37
const RAD = d => (d * Math.PI) / 180
const px = (r, a) => CX + r * Math.cos(RAD(a))
const py = (r, a) => CY + r * Math.sin(RAD(a))

function pentagon(cx, cy, r, rotDeg) {
  return Array.from({ length: 5 }, (_, i) => {
    const a = RAD(rotDeg - 90 + i * 72)
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

const VERTEX_ANGLES = [-90, -18, 54, 126, 198]
const EDGE_ANGLES = [-54, 18, 90, 162, 234]

export function TeamEmblem({ color, size = 62, className = 'team-emblem' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 80 80" aria-hidden="true">
      <defs>
        <clipPath id="ball-clip"><circle cx={CX} cy={CY} r={R} /></clipPath>
      </defs>
      <circle cx={CX} cy={CY} r={R} fill="#FFFFFF" stroke={color} strokeWidth="2.5" />
      <g clipPath="url(#ball-clip)" fill={color}>
        <path
          d={`M${px(R, 0)},${py(R, 0)} A${R},${R} 0 1 1 ${px(R, 180)},${py(R, 180)} A${R},${R} 0 1 1 ${px(R, 0)},${py(R, 0)} Z M${px(28, 0)},${py(28, 0)} A28,28 0 1 0 ${px(28, 180)},${py(28, 180)} A28,28 0 1 0 ${px(28, 0)},${py(28, 0)} Z`}
          fillRule="evenodd" />
        {EDGE_ANGLES.map(a => (
          <polygon key={`p${a}`} points={pentagon(px(33, a), py(33, a), 9, a + 90)} />
        ))}
        {VERTEX_ANGLES.map(a => (
          <line key={`s${a}`}
            x1={px(11, a)} y1={py(11, a)}
            x2={px(28, a)} y2={py(28, a)}
            stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        ))}
        <polygon points={pentagon(CX, CY, 11, 0)} />
      </g>
    </svg>
  )
}
