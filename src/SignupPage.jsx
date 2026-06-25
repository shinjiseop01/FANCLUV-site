import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './SignupPage.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignupPage() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!nickname.trim()) { setError('닉네임을 입력해주세요.'); return }
    if (!email.trim()) { setError('이메일을 입력해주세요.'); return }
    if (!EMAIL_RE.test(email)) { setError('올바른 이메일 형식을 입력해주세요.'); return }
    if (!password) { setError('비밀번호를 입력해주세요.'); return }
    if (password.length < 4) { setError('비밀번호는 4자 이상이어야 합니다.'); return }
    if (password !== passwordConfirm) { setError('비밀번호가 일치하지 않습니다.'); return }

    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      navigate('/team-select')
    }, 800)
  }

  return (
    <div className="signup-root">
      <div className="signup-card">

        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <h1 className="signup-title">회원가입</h1>
          <p className="signup-subtitle">응원하는 구단과 함께 팬의 목소리를 남겨보세요.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="su-field">
            <label className="su-label">닉네임</label>
            <input
              type="text"
              className="su-input"
              placeholder="사용할 닉네임을 입력해주세요"
              value={nickname}
              onChange={e => { setNickname(e.target.value); setError('') }}
              autoComplete="nickname"
            />
          </div>

          <div className="su-field">
            <label className="su-label">이메일</label>
            <input
              type="email"
              className="su-input"
              placeholder="이메일을 입력해주세요"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              autoComplete="email"
            />
          </div>

          <div className="su-field">
            <label className="su-label">비밀번호</label>
            <input
              type="password"
              className="su-input"
              placeholder="비밀번호를 입력해주세요"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              autoComplete="new-password"
            />
          </div>

          <div className="su-field">
            <label className="su-label">비밀번호 확인</label>
            <input
              type="password"
              className="su-input"
              placeholder="비밀번호를 다시 입력해주세요"
              value={passwordConfirm}
              onChange={e => { setPasswordConfirm(e.target.value); setError('') }}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="su-error" role="alert">⚠ {error}</div>
          )}

          <button type="submit" className="su-btn" disabled={loading}>
            {loading ? (
              <span className="su-btn-loading"><span className="su-spinner" />가입 중...</span>
            ) : (
              <>
                <span>회원가입하고 시작하기</span>
                <svg className="su-btn-arrow" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </form>

        <p className="signup-login-row">
          이미 계정이 있으신가요? <Link to="/" className="signup-login-link">로그인</Link>
        </p>
      </div>

      <Link to="/" className="signup-home-link">← 홈으로 돌아가기</Link>
    </div>
  )
}
