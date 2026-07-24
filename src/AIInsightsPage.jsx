import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { isSupabaseConfigured } from './lib/supabase.js'
import { getFanInsight } from './lib/ai/analyzeFanInsights.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import EmptyState from './components/EmptyState.jsx'
import Icon from './components/Icon.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import './ClubHomePage.css'
import './AIInsightsPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

// ── Mock data ──
const SUMMARY = { opinions: 1284, surveys: 842, progress: 100 }
const SENTIMENT = [
  { key: 'pos', icon: 'smile', label: '긍정', value: 58, color: '#0E9F6E' },
  { key: 'neu', icon: 'meh', label: '중립', value: 27, color: '#9AA0AA' },
  { key: 'neg', icon: 'frown', label: '부정', value: 15, color: '#E05252' },
]
const KEYWORDS = [
  { tag: '#MD', weight: 3 }, { tag: '#유니폼', weight: 3 }, { tag: '#티켓', weight: 2 },
  { tag: '#응원문화', weight: 2 }, { tag: '#감독', weight: 1 }, { tag: '#선수', weight: 2 },
  { tag: '#경기장', weight: 3 }, { tag: '#주차', weight: 1 },
]
const CATEGORY_SAT = [
  { name: '경기장', score: 4 }, { name: '티켓', score: 3 }, { name: 'MD', score: 2 },
  { name: '응원문화', score: 5 }, { name: '이벤트', score: 4 },
]
const TREND = [
  { label: 'Week 1', value: 78 }, { label: 'Week 2', value: 80 },
  { label: 'Week 3', value: 82 }, { label: 'Week 4', value: 84 },
]

// Mock 모드(또는 아직 분석 전) 기본 뷰 — Fan 공개 안전 필드만(내부 요약/추천/메모/원문 제외).
const DEFAULT_MOCK_VIEW = {
  summary: SUMMARY, sentiment: SENTIMENT, keywords: KEYWORDS, categorySat: CATEGORY_SAT, trend: TREND,
}

// Fan sanitize 인사이트(fan_team_insight RPC 응답) → 화면 뷰로 매핑.
// 보안: summary/recommendations/staffMemo/topOpinions 등 내부 필드는 애초에 응답에 없으며 매핑도 하지 않는다.
function fanInsightToView(data) {
  const kw = (data.keywords || []).map((tag, i) => ({
    tag: String(tag).startsWith('#') ? String(tag) : `#${tag}`, weight: i < 2 ? 3 : i < 5 ? 2 : 1,
  }))
  const s = data.sentiment || {}
  const sm = data.sample || {}
  const trend = (data.trend && data.trend.length >= 2)
    ? data.trend.map(tp => ({ label: tp.label, value: Number(tp.value) || 0 }))
    : [{ label: 'W1', value: s.positive || 0 }, { label: 'W2', value: s.positive || 0 }]
  return {
    summary: { opinions: sm.opinions || 0, surveys: sm.surveys || 0, progress: 100 },
    sentiment: [
      { key: 'pos', icon: 'smile', label: '긍정', value: s.positive || 0, color: '#0E9F6E' },
      { key: 'neu', icon: 'meh', label: '중립', value: s.neutral || 0, color: '#9AA0AA' },
      { key: 'neg', icon: 'frown', label: '부정', value: s.negative || 0, color: '#E05252' },
    ],
    keywords: kw.length ? kw : KEYWORDS,
    categorySat: (data.category_sat && data.category_sat.length)
      ? data.category_sat.map(c => ({ name: c.name, score: Number(c.score) || 0 })) : CATEGORY_SAT,
    trend,
  }
}

export default function AIInsightsPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()
  const [view, setView] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'empty'
  const [kwChoice, setKwChoice] = useState(null)  // 키워드 클릭 시 이동 대상 선택 모달

  // 최신 AI 인사이트 로드. Supabase 모드는 실제 결과, 없으면 Empty State.
  // Mock 모드는 저장된 로컬 분석 or 기본 뷰(기존 화면)로 표시.
  useEffect(() => {
    if (!team) return
    let active = true
    setStatus('loading')
    getFanInsight(team.id).then(data => {
      if (!active) return
      if (data?.ok) { setView(fanInsightToView(data)); setStatus('ready') }
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
            <span className="ch-club-name">{teamName(team, lang)}</span>
          </div>
          <div className="ch-actions">
            <span className="ch-user">{NICKNAME}{t('common.honorific')}</span>
            <NotificationBell />
            <button className="ch-icon-btn" title={t('common.settings')} aria-label={t('common.settings')} onClick={() => navigate(`/club/${team.id}/settings`)}>
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.4"/></svg>
            </button>
            <button className="ch-logout" onClick={() => { logout(); navigate('/', { replace: true }) }}>{t('common.logout')}</button>
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
          <EmptyState iconName="robot" title={t('empty.insightsTitle')} message={t('empty.insightsMsg')} />
        ) : (
        <>
        <section className="ai-pagehead">
          <div className="ai-badge"><span className="ai-spark" aria-hidden="true"><Icon name="sparkle" size={15} /></span> AI 분석</div>
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
                      <span className="ai-sent-emoji" aria-hidden="true"><Icon name={s.icon} size={18} style={{ color: s.color }} /></span>
                      <span className="ai-sent-name">{s.label}</span>
                      <span className="ai-sent-bar"><span style={{ width: `${s.value}%`, background: s.color }} /></span>
                      <span className="ai-sent-pct" style={{ color: s.color }}>{s.value}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Keywords — 클릭 시 팬 의견/뉴스 중 어디서 볼지 선택 */}
            <section className="ai-panel">
              <h2 className="ai-panel-title">{t('ai.keywords')}</h2>
              <div className="ai-keywords">
                {view.keywords.map(k => {
                  const kw = k.tag.replace(/^#/, '')
                  return (
                    <button key={k.tag} type="button"
                      className={`ai-kw w${k.weight}`}
                      title={t('ai.keywordChoose', { kw })}
                      onClick={() => setKwChoice(kw)}>
                      {k.tag}
                    </button>
                  )
                })}
              </div>
            </section>
            {/* AI 요약/추천/운영 메모는 구단 운영자용 내부 분석이므로 Fan 화면에서 제외한다(Security P1). */}
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
            {/* 상위 의견 원문/운영 메모는 내부 데이터이므로 Fan 화면에서 제외한다(Security P1). */}
          </aside>
        </div>
        </>
        )}
      </main>

      {/* 키워드 이동 대상 선택 모달 (팬 의견 / 뉴스) */}
      {kwChoice && (
        <div
          className="ai-kwmenu-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('ai.keywordChoose', { kw: kwChoice })}
          onMouseDown={e => { if (e.target === e.currentTarget) setKwChoice(null) }}
        >
          <div className="ai-kwmenu">
            <span className="ai-kwmenu-tag">#{kwChoice}</span>
            <p className="ai-kwmenu-title">{t('ai.keywordChooseTitle')}</p>
            <div className="ai-kwmenu-actions">
              <button type="button" className="ai-kwmenu-btn" onClick={() => navigate(`/club/${team.id}/opinions?keyword=${encodeURIComponent(kwChoice)}`)}>
                <Icon name="comment" size={16} /> {t('ai.keywordGoOpinions')}
              </button>
              <button type="button" className="ai-kwmenu-btn" onClick={() => navigate(`/club/${team.id}/news?keyword=${encodeURIComponent(kwChoice)}`)}>
                <Icon name="news" size={16} /> {t('ai.keywordGoNews')}
              </button>
            </div>
            <button type="button" className="ai-kwmenu-cancel" onClick={() => setKwChoice(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
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
