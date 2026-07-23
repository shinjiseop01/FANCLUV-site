// FANCLUV — 아이디 찾기 폼 (재사용 가능). FindPasswordPage 와 동일한 카드 레이아웃 클래스 사용.
//
// method 로 입력 방식을 전환한다(현재 nickname, 추후 phone). 검증·조회는 accountLookup 에
// 위임하므로, 전화번호 기반으로 바꿀 때 이 컴포넌트는 method 만 바꾸면 된다.
// enumeration-safe: 조회 성공 시 계정 존재 여부와 무관하게 동일한 안내 문구를 노출.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LOOKUP_METHOD, LOOKUP_META, validateLookupInput, lookupAccount } from '../lib/accountLookup.js'
import { useLang } from '../contexts/LanguageContext.jsx'
import Icon from './Icon.jsx'

export default function FindIdForm({ method = LOOKUP_METHOD.NICKNAME }) {
  const { t } = useLang()
  const meta = LOOKUP_META[method] || LOOKUP_META[LOOKUP_METHOD.NICKNAME]
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const check = validateLookupInput(method, value)
    if (!check.ok) { setError(t(check.errorKey)); return }
    setLoading(true)
    const res = await lookupAccount(method, value)
    setLoading(false)
    if (res.ok) {
      setDone(true) // 존재 여부 무관 동일 안내(enumeration-safe)
    } else {
      setError(res.error && !res.error.includes('_') ? res.error : t('findId.errRequest'))
    }
  }

  // 조회 완료 → 안내 결과(FindPasswordPage 의 발송 완료와 동일한 rec-result 패턴)
  if (done) {
    return (
      <div className="rec-result" role="status">
        <span className="rec-result-icon" aria-hidden="true"><Icon name="mail" size={26} /></span>
        <p className="rec-result-note">{t('findId.sentMessage')}</p>
        <div className="rec-result-actions">
          <Link to="/" className="su-btn rec-btn-link">{t('findId.goLogin')}</Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="su-field">
        <label className="su-label">{t(meta.labelKey)}</label>
        <input
          type={meta.type}
          inputMode={meta.inputMode}
          className="su-input"
          placeholder={t(meta.placeholderKey)}
          value={value}
          onChange={e => { setValue(e.target.value); setError('') }}
          autoComplete={meta.autoComplete}
          aria-invalid={!!error}
        />
      </div>

      {error && <div className="su-error" role="alert"><Icon name="warningTriangle" size={14} className="fc-inline-ico" />{error}</div>}

      <button type="submit" className="su-btn" disabled={loading}>
        {loading ? (
          <span className="su-btn-loading"><span className="su-spinner" />{t('findId.loading')}</span>
        ) : (
          <span>{t('findId.submitCta')}</span>
        )}
      </button>
    </form>
  )
}
