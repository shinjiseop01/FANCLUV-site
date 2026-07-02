import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { isSupabaseConfigured } from './lib/supabase.js'
import { getLatestInsight } from './lib/ai/analyzeFanInsights.js'
import { getTeam, TeamEmblem, menuPath } from './teams.jsx'
import EmptyState from './components/EmptyState.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import './ClubHomePage.css'
import './AIInsightsPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

// ── Mock data ──
const SUMMARY = { opinions: 1284, surveys: 842, progress: 100 }
const SENTIMENT = [
  { key: 'pos', emoji: '😊', label: '긍정', value: 58, color: '#0E9F6E' },
  { key: 'neu', emoji: '😐', label: '중립', value: 27, color: '#9AA0AA' },
  { key: 'neg', emoji: '😡', label: '부정', value: 15, color: '#E05252' },
]
const KEYWORDS = [
  { tag: '#MD', weight: 3 }, { tag: '#유니폼', weight: 3 }, { tag: '#티켓', weight: 2 },
  { tag: '#응원문화', weight: 2 }, { tag: '#감독', weight: 1 }, { tag: '#선수', weight: 2 },
  { tag: '#경기장', weight: 3 }, { tag: '#주차', weight: 1 },
]
const AI_SUMMARY =
  '이번 주에는 MD 상품 다양성과 경기장 음식에 대한 개선 의견이 가장 많이 접수되었습니다. 특히 원정 유니폼 재고 부족과 경기장 편의시설 개선 요청이 반복적으로 나타났습니다.'
const RECOMMENDATIONS = [
  { rank: 1, title: 'MD 상품 다양성 확대', desc: '시즌 한정 굿즈와 사이즈 옵션 확대 요구가 다수 접수되었습니다.' },
  { rank: 2, title: '경기장 음식 품질 개선', desc: '매점 메뉴 다양화와 대기 시간 단축에 대한 의견이 많습니다.' },
  { rank: 3, title: '티켓 할인 이벤트 확대', desc: '가족 단위·청소년 대상 할인 확대를 바라는 목소리가 있습니다.' },
  { rank: 4, title: '응원 문화 프로그램 운영', desc: '원정 응원 지원과 신규 응원가 도입 제안이 이어지고 있습니다.' },
]
const CATEGORY_SAT = [
  { name: '경기장', score: 4 }, { name: '티켓', score: 3 }, { name: 'MD', score: 2 },
  { name: '응원문화', score: 5 }, { name: '이벤트', score: 4 },
]
const TREND = [
  { label: 'Week 1', value: 78 }, { label: 'Week 2', value: 80 },
  { label: 'Week 3', value: 82 }, { label: 'Week 4', value: 84 },
]
const TOP_OPINIONS = [
  { title: 'MD 상품 확대', count: 312 }, { title: '원정 유니폼 재입고', count: 268 },
  { title: '경기장 음식 개선', count: 224 }, { title: '티켓 할인', count: 187 },
  { title: '응원가 추가', count: 156 },
]
const STAFF_MEMO =
  '팬들은 경기 결과보다 경기장 경험과 MD 상품에 대한 개선을 가장 많이 요구하고 있습니다. 우선적으로 MD 상품 다양성과 경기장 편의시설 개선을 검토하는 것을 추천합니다.'

// Mock 모드(또는 아직 분석 전) 기본 뷰 — 기존 화면과 동일하게 표시.
const DEFAULT_MOCK_VIEW = {
  summary: SUMMARY, sentiment: SENTIMENT, keywords: KEYWORDS, aiSummary: AI_SUMMARY,
  recommendations: RECOMMENDATIONS, categorySat: CATEGORY_SAT, trend: TREND,
  topOpinions: TOP_OPINIONS, staffMemo: STAFF_MEMO,
}

// 저장된 인사이트(ai_insights row / 로컬 mock) → 화면 뷰로 매핑.
function insightToView(ins) {
  const d = ins.details || {}
  const kw = (ins.keywords || []).map((k, i) => {
    if (typeof k === 'string') return { tag: k.startsWith('#') ? k : `#${k}`, weight: i < 2 ? 3 : i < 5 ? 2 : 1 }
    return { tag: (k.tag || '').startsWith('#') ? k.tag : `#${k.tag || ''}`, weight: k.weight || 2 }
  })
  const trend = (d.trend && d.trend.length >= 2) ? d.trend : [{ label: 'W1', value: ins.sentiment_positive || 0 }, { label: 'W2', value: ins.sentiment_positive || 0 }]
  return {
    summary: { opinions: d.opinionsCount || 0, surveys: d.surveysCount || 0, progress: 100 },
    sentiment: [
      { key: 'pos', emoji: '😊', label: '긍정', value: ins.sentiment_positive || 0, color: '#0E9F6E' },
      { key: 'neu', emoji: '😐', label: '중립', value: ins.sentiment_neutral || 0, color: '#9AA0AA' },
      { key: 'neg', emoji: '😡', label: '부정', value: ins.sentiment_negative || 0, color: '#E05252' },
    ],
    keywords: kw.length ? kw : KEYWORDS,
    aiSummary: ins.summary || AI_SUMMARY,
    recommendations: (ins.recommendations || []).map((r, i) => ({ rank: r.rank || i + 1, title: r.title || String(r), desc: r.desc || '' })),
    categorySat: d.categorySat && d.categorySat.length ? d.categorySat : CATEGORY_SAT,
    trend,
    topOpinions: d.topOpinions && d.topOpinions.length ? d.topOpinions : TOP_OPINIONS,
    staffMemo: d.staffMemo || ins.summary || STAFF_MEMO,
  }
}

export default function AIInsightsPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { t } = useLang()
  const [view, setView] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'empty'

  // 최신 AI 인사이트 로드. Supabase 모드는 실제 결과, 없으면 Empty State.
  // Mock 모드는 저장된 로컬 분석 or 기본 뷰(기존 화면)로 표시.
  useEffect(() => {
    if (!team) return
    let active = true
    setStatus('loading')
    getLatestInsight(team.id).then(ins => {
      if (!active) return
      if (ins) { setView(insightToView(ins)); setStatus('ready') }
      else if (!isSupabaseConfigured) { setView(DEFAULT_MOCK_VIEW); setStatus('ready') }
      else { setStatus('empty') }
    })
    return () => { active = false }
  }, [teamId, team])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }

  return (
    <div className="ch-root" style={themeStyle}>

      {/* ── Header (shared style) ── */}
      <header className="ch-header">
        <div className="ch-topbar">
          <div className="ch-logo" role="button" tabIndex={0} onClick={() => navigate(`/club/${teamId}`)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/club/${teamId}`) } }}>FANCLUV</div>
          <div className="ch-club">
            <TeamEmblem color={team.color} size={30} className="ch-club-emblem" />
            <span className="ch-club-name">{team.name}</span>
          </div>
          <div className="ch-actions">
            <span className="ch-user">{NICKNAME}{t('common.honorific')}</span>
            <NotificationBell />
            <button className="ch-icon-btn" title={t('common.settings')} aria-label={t('common.settings')} onClick={() => navigate(`/club/${team.id}/settings`)}>
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.4"/></svg>
            </button>
            <button className="ch-logout" onClick={() => { logout(); navigate('/') }}>{t('common.logout')}</button>
          </div>
        </div>
        <nav className="ch-nav" aria-label="메인 메뉴">
          {MENU.map(item => {
            const active = item === 'AI 인사이트'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
            )
          })}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="ai-main">
        {status === 'loading' ? (
          <SkeletonList count={3} lines={4} />
        ) : status === 'empty' || !view ? (
          <EmptyState icon="🤖" title={t('empty.insightsTitle')} message={t('empty.insightsMsg')} />
        ) : (
        <>
        <section className="ai-pagehead">
          <div className="ai-badge"><span className="ai-spark" aria-hidden="true">✦</span> AI 분석</div>
          <h1>{t('ai.title')}</h1>
          <p>{t('ai.subtitle')}</p>
        </section>

        <div className="ai-grid">
          {/* Left 70% */}
          <div className="ai-col-main">

            {/* Summary */}
            <section className="ai-summary">
              <span className="ai-summary-label">{t('ai.summaryLabel')}</span>
              <div className="ai-summary-stats">
                <div className="ai-sum">
                  <span className="ai-sum-value">{view.summary.opinions.toLocaleString()}<em>건</em></span>
                  <span className="ai-sum-label">총 분석 의견</span>
                </div>
                <div className="ai-sum">
                  <span className="ai-sum-value">{view.summary.surveys.toLocaleString()}<em>명</em></span>
                  <span className="ai-sum-label">설문 참여</span>
                </div>
                <div className="ai-sum">
                  <span className="ai-sum-value">{view.summary.progress}<em>%</em></span>
                  <span className="ai-sum-label">분석 완료</span>
                </div>
              </div>
            </section>

            {/* Sentiment */}
            <section className="ai-panel">
              <h2 className="ai-panel-title">{t('ai.sentiment')}</h2>
              <div className="ai-sentiment">
                <DonutChart data={view.sentiment} />
                <ul className="ai-sent-legend">
                  {view.sentiment.map(s => (
                    <li key={s.key}>
                      <span className="ai-sent-emoji" aria-hidden="true">{s.emoji}</span>
                      <span className="ai-sent-name">{s.label}</span>
                      <span className="ai-sent-bar"><span style={{ width: `${s.value}%`, background: s.color }} /></span>
                      <span className="ai-sent-pct" style={{ color: s.color }}>{s.value}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Keywords */}
            <section className="ai-panel">
              <h2 className="ai-panel-title">{t('ai.keywords')}</h2>
              <div className="ai-keywords">
                {view.keywords.map(k => (
                  <span key={k.tag} className={`ai-kw w${k.weight}`}>{k.tag}</span>
                ))}
              </div>
            </section>

            {/* AI summary */}
            <section className="ai-panel ai-aisummary">
              <h2 className="ai-panel-title"><span className="ai-spark" aria-hidden="true">✦</span> AI 요약</h2>
              <p className="ai-aisummary-text">{view.aiSummary}</p>
            </section>

            {/* Recommendations */}
            <section className="ai-panel">
              <h2 className="ai-panel-title">{t('ai.recommend')}</h2>
              <div className="ai-recs">
                {view.recommendations.map(r => (
                  <div key={r.rank} className="ai-rec">
                    <span className="ai-rec-rank">{r.rank}</span>
                    <div className="ai-rec-body">
                      <p className="ai-rec-title">{r.title}</p>
                      <p className="ai-rec-desc">{r.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right 30% */}
          <aside className="ai-col-side">

            {/* Satisfaction trend */}
            <section className="ai-panel">
              <h2 className="ai-panel-title">만족도 변화 <span className="ai-trend-up">▲ +6</span></h2>
              <LineChart data={view.trend} color={team.colorDeep} />
            </section>

            {/* Category satisfaction */}
            <section className="ai-panel">
              <h2 className="ai-panel-title">{t('ai.catSat')}</h2>
              <ul className="ai-catsat">
                {view.categorySat.map(c => (
                  <li key={c.name}>
                    <span className="ai-catsat-name">{c.name}</span>
                    <span className="ai-stars" aria-label={`${c.score}점`}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <svg key={n} viewBox="0 0 20 20" className={n <= c.score ? 'on' : ''} aria-hidden="true">
                          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15l-5.2 2.6 1-5.8L1.5 7.7l5.9-.9z" />
                        </svg>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Top opinions */}
            <section className="ai-panel">
              <h2 className="ai-panel-title">{t('ai.top5')}</h2>
              <ul className="ai-top">
                {view.topOpinions.map((o, i) => (
                  <li key={o.title}>
                    <span className="ai-top-rank">{i + 1}</span>
                    <span className="ai-top-title">{o.title}</span>
                    <span className="ai-top-count">{o.count}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Staff memo */}
            <section className="ai-panel ai-memo">
              <h2 className="ai-panel-title">{t('ai.memo')}</h2>
              <p className="ai-memo-text">{view.staffMemo}</p>
            </section>
          </aside>
        </div>
        </>
        )}
      </main>
    </div>
  )
}

/* ── Donut (sentiment) ── */
function DonutChart({ data }) {
  const r = 52, c = 2 * Math.PI * r
  let offset = 0
  return (
    <svg className="ai-donut" viewBox="0 0 140 140" role="img" aria-label="감정 분석 비율">
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border-soft)" strokeWidth="18" />
      {data.map(s => {
        const len = (s.value / 100) * c
        const seg = (
          <circle key={s.key} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="18"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
            transform="rotate(-90 70 70)" strokeLinecap="butt" />
        )
        offset += len
        return seg
      })}
      <text x="70" y="64" textAnchor="middle" className="ai-donut-num">{data[0].value}%</text>
      <text x="70" y="82" textAnchor="middle" className="ai-donut-label">긍정</text>
    </svg>
  )
}

/* ── Line (trend) ── */
function LineChart({ data, color }) {
  const W = 280, H = 130, pad = 24
  const min = Math.min(...data.map(d => d.value)) - 4
  const max = Math.max(...data.map(d => d.value)) + 4
  const x = i => pad + (i * (W - pad * 2)) / (data.length - 1)
  const y = v => H - pad - ((v - min) / (max - min)) * (H - pad * 2)
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  const area = `M${x(0)},${H - pad} L${pts.split(' ').join(' L')} L${x(data.length - 1)},${H - pad} Z`
  return (
    <svg className="ai-line" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="최근 4주 만족도 변화">
      <path d={area} fill={color} opacity="0.08" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={d.label}>
          <circle cx={x(i)} cy={y(d.value)} r="4" fill="#fff" stroke={color} strokeWidth="2.5" />
          <text x={x(i)} y={y(d.value) - 11} textAnchor="middle" className="ai-line-val">{d.value}</text>
          <text x={x(i)} y={H - 6} textAnchor="middle" className="ai-line-label">{d.label}</text>
        </g>
      ))}
    </svg>
  )
}
