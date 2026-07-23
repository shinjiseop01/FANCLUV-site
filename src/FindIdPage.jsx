// FANCLUV — 아이디 찾기 (별도 페이지). FindPasswordPage 와 동일한 카드 레이아웃.
// 입력/조회 로직은 재사용 컴포넌트(FindIdForm) + accountLookup 으로 분리되어 있어,
// 추후 전화번호(PASS/NICE/KCB) 기반으로 method 만 교체하면 된다.
import { Link } from 'react-router-dom'
import { useLang } from './contexts/LanguageContext.jsx'
import FindIdForm from './components/FindIdForm.jsx'
import './SignupPage.css'
import './RecoveryPages.css'

export default function FindIdPage() {
  const { t } = useLang()

  return (
    <div className="signup-root">
      <div className="signup-card">

        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <h1 className="signup-title">{t('findId.title')}</h1>
          <p className="signup-subtitle">{t('findId.subtitle')}</p>
        </div>

        <FindIdForm />

        <div className="rec-links">
          <Link to="/" className="signup-login-link">{t('find.backToLogin')}</Link>
          <span className="rec-sep">·</span>
          <Link to="/find-password" className="signup-login-link">{t('login.findPw')}</Link>
          <span className="rec-sep">·</span>
          <Link to="/signup" className="signup-login-link">{t('login.signup')}</Link>
        </div>
      </div>

      <Link to="/" className="signup-home-link">{t('common.backToHome')}</Link>
    </div>
  )
}
