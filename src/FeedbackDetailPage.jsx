import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang } from './contexts/LanguageContext.jsx'
import { getTeam, teamName, TeamEmblem } from './teams.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import Icon from './components/Icon.jsx'
import { getFanFeedbackDetail } from './lib/feedback/clubFeedbackRepo.js'
import './ClubHomePage.css'

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function FeedbackDetailPage() {
  const { teamId, feedbackId } = useParams()
  const navigate = useNavigate()
  const { lang, t } = useLang()
  const team = getTeam(teamId)
  const [state, setState] = useState({ loading: true, data: null })

  useEffect(() => {
    if (!team) return
    let active = true
    setState({ loading: true, data: null })
    getFanFeedbackDetail(feedbackId, team.id).then(res => {
      if (active) setState({ loading: false, data: res })
    })
    return () => { active = false }
  }, [team, feedbackId])

  if (!team) return null
  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep || team.color }
  const back = () => navigate(`/club/${team.id}`)

  const d = state.data
  const ok = d?.ok
  const prov = d?.provenance
  const hasProvenance = prov && prov.level >= 1 && (prov.opinion_count > 0 || prov.survey_response_count > 0 || (prov.keywords || []).length > 0)

  return (
    <div className="ch-root fbd-root" style={themeStyle}>
      <main className="ch-main fbd-main">
        <button className="fbd-back" onClick={back}>← {t('feedback.backList')}</button>

        {state.loading ? (
          <SkeletonList count={1} lines={4} />
        ) : !ok ? (
          <div className="fbd-notfound" role="status">
            <p>{t('feedback.detailNotFound')}</p>
            <button className="ch-btn-primary" onClick={back}>{t('feedback.backHome')}</button>
          </div>
        ) : (
          <article className="fbd-article">
            <div className="fbd-head">
              <span className="ch-feedback-badge"><Icon name="check" size={13} className="fc-inline-ico" /> {t('feedback.reflected')}</span>
              <div className="fbd-team">
                <TeamEmblem color={team.color} size={22} />
                <span>{teamName(team, lang)}</span>
              </div>
            </div>
            <h1 className="fbd-title">{d.public_title}</h1>
            <div className="fbd-meta">
              {d.category && <span className="fbd-cat">{d.category}</span>}
              <span className="fbd-date">{t('feedback.completed')} · {fmtDate(d.completed_at)}</span>
              {d.published_at && <span className="fbd-date fbd-pub">{t('feedback.publishedOn')} {fmtDate(d.published_at)}</span>}
            </div>
            <p className="fbd-summary">{d.public_summary}</p>

            {/* Provenance — 실제 source 연결이 증명될 때만 표시(§8). */}
            {hasProvenance ? (
              <section className="fbd-prov" aria-labelledby="fbd-prov-title">
                <h2 id="fbd-prov-title" className="fbd-prov-title"><Icon name="message" size={15} className="fc-inline-ico" /> {t('feedback.voiceTitle')}</h2>
                <p className="fbd-prov-lead">{t('feedback.voiceLead')}</p>
                <div className="fbd-prov-stats">
                  {prov.opinion_count > 0 && (
                    <div className="fbd-stat"><b>{prov.opinion_count.toLocaleString()}</b><span>{t('feedback.relatedOpinions')}</span></div>
                  )}
                  {prov.survey_response_count > 0 && (
                    <div className="fbd-stat"><b>{prov.survey_response_count.toLocaleString()}</b><span>{t('feedback.relatedResponses')}</span></div>
                  )}
                </div>
                {(prov.keywords || []).length > 0 && (
                  <div className="fbd-keywords">
                    <span className="fbd-kw-label">{t('feedback.keywords')}</span>
                    <div className="fbd-kw-list">
                      {prov.keywords.map((k, i) => <span key={i} className="fbd-kw">{k}</span>)}
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <p className="fbd-noprov">{t('feedback.noProvenance')}</p>
            )}
          </article>
        )}
      </main>
    </div>
  )
}
