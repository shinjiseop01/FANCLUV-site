import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, completeOnboarding } from './lib/auth.js'
import { useLang } from './contexts/LanguageContext.jsx'
import { useNicknameCheck } from './lib/useNicknameCheck.js'
import NicknameStatus from './components/NicknameStatus.jsx'
import Avatar from './components/Avatar.jsx'
import './SignupPage.css'

const GENDERS = [['male', 'signup.genderMale'], ['female', 'signup.genderFemale'], ['na', 'signup.genderNA']]
const AGE_GROUPS = [['10', 'signup.age10'], ['20', 'signup.age20'], ['30', 'signup.age30'], ['40', 'signup.age40'], ['50+', 'signup.age50']]

// 소셜 로그인 신규 사용자를 위한 온보딩 프로필 설정.
// 라우트 가드(RequireOnboarded)가 필요할 때만 여기로 보낸다.
export default function OnboardingPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const me = getCurrentUser()

  // 소셜에서 가져온 임시 닉네임으로 채우지 않고 빈칸으로 시작(사용자가 직접 입력).
  const [nickname, setNickname] = useState('')
  const nickCheck = useNicknameCheck(nickname, { exceptId: me?.id, exceptEmail: me?.email })
  const [gender, setGender] = useState(me?.gender || '')
  const [ageGroup, setAgeGroup] = useState(me?.ageGroup || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!nickname.trim()) { setError(t('onboard.errNickname')); return }
    if (!ageGroup) { setError(t('onboard.errAge')); return }
    setLoading(true)
    const res = await completeOnboarding({ nickname: nickname.trim(), gender: gender || null, ageGroup })
    setLoading(false)
    if (res.ok) navigate('/team-select', { replace: true })
    else setError(res.error)
  }

  return (
    <div className="signup-root">
      <div className="signup-card">
        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <h1 className="signup-title">{t('onboard.title')}</h1>
          <p className="signup-subtitle">{t('onboard.subtitle')}</p>
        </div>

        <div className="ob-avatar-row">
          <Avatar name={nickname || me?.nickname || 'F'} src={me?.avatarUrl} size={76} />
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* 닉네임 (필수, 중복 불가) */}
          <div className="su-field">
            <label className="su-label">{t('signup.nickname')} <span className="su-required">{t('signup.requiredMark')}</span></label>
            <input
              type="text"
              className="su-input"
              placeholder={t('signup.nicknamePh')}
              value={nickname}
              onChange={e => { setNickname(e.target.value); setError('') }}
              autoComplete="nickname"
              maxLength={12}
            />
            <NicknameStatus status={nickCheck} />
          </div>

          {/* 성별 (선택) */}
          <div className="su-field">
            <label className="su-label">{t('signup.gender')} <span className="su-optional">{t('signup.optional')}</span></label>
            <div className="su-chips" role="group" aria-label={t('signup.gender')}>
              {GENDERS.map(([val, key]) => (
                <button type="button" key={val}
                  className={`su-chip${gender === val ? ' on' : ''}`}
                  onClick={() => setGender(g => (g === val ? '' : val))}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {/* 나이대 (필수) */}
          <div className="su-field">
            <label className="su-label">{t('signup.ageGroup')} <span className="su-required">{t('signup.requiredMark')}</span></label>
            <div className="su-chips" role="group" aria-label={t('signup.ageGroup')}>
              {AGE_GROUPS.map(([val, key]) => (
                <button type="button" key={val}
                  className={`su-chip${ageGroup === val ? ' on' : ''}`}
                  onClick={() => { setAgeGroup(val); setError('') }}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="su-error" role="alert">⚠ {error}</div>}

          <button type="submit" className="su-btn" disabled={loading || nickCheck.state !== 'available'}>
            {loading ? (
              <span className="su-btn-loading"><span className="su-spinner" />{t('onboard.saving')}</span>
            ) : (
              <>
                <span>{t('onboard.submit')}</span>
                <svg className="su-btn-arrow" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
