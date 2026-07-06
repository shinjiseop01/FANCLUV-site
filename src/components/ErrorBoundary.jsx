import { Component } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { logger } from '../lib/logger.js'

// 전역 Error Boundary.
//
// 예상치 못한 React 렌더 오류가 발생해도 앱 전체가 흰 화면으로 죽지 않도록,
// 오류를 잡아 안내 화면(서버 오류/500 스타일: 안내 + 새로고침 + 홈)으로 대체한다.
// 오류는 logger.error 로 남겨 운영자가 확인할 수 있게 한다.
//
// LanguageProvider 아래에 두므로 fallback 에서 useLang() 사용 가능.
// 이동/새로고침은 라우터가 깨졌을 수 있어 window.location 으로 처리한다.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    logger.error('처리되지 않은 렌더 오류(ErrorBoundary)', {
      error,
      context: { componentStack: info?.componentStack },
    })
  }

  handleReset = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onReset={this.handleReset} />
    }
    return this.props.children
  }
}

// 500 스타일 안내 화면. i18n(err.*) + 홈/새로고침. window.location 사용(라우터 비의존).
function ErrorFallback({ onReset }) {
  const { t } = useLang()

  function reload() {
    window.location.reload()
  }
  function goHome() {
    // 전체 리로드로 깨진 상태를 초기화하며 홈(로그인/구단 홈은 앱이 다시 판단)으로 이동.
    window.location.assign('/')
  }

  return (
    <div className="fc-errpage" role="alert">
      <div className="fc-errpage-inner">
        <div className="fc-errpage-brand">FANCLUV</div>
        <div className="fc-errpage-code">500</div>
        <h1 className="fc-errpage-title">{t('err.heading')}</h1>
        <p className="fc-errpage-msg">{t('err.msg')}</p>
        <div className="fc-errpage-actions">
          <button className="fc-errpage-btn primary" onClick={reload}>{t('err.refresh')}</button>
          <button className="fc-errpage-btn" onClick={goHome}>{t('err.home')}</button>
        </div>
      </div>
    </div>
  )
}
