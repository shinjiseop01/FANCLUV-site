import { useLang } from '../contexts/LanguageContext.jsx'

// 닉네임 입력창 아래 상태/안내 문구.
// - empty     : 안내 문구(⚠ …)만 표시(예시 없음)
// - invalid   : 형식 오류 메시지(빨강)
// - checking  : 확인 중(중립)
// - taken     : 이미 사용 중(빨강)
// - available : 사용 가능(초록)
export default function NicknameStatus({ status }) {
  const { t } = useLang()
  const { state, code } = status || {}

  let text = t('nickname.hint')
  let tone = 'hint'
  if (state === 'invalid') { text = t(`nickname.err.${code}`); tone = 'err' }
  else if (state === 'checking') { text = t('nickname.checking'); tone = 'hint' }
  else if (state === 'taken') { text = t('nickname.taken'); tone = 'err' }
  else if (state === 'available') { text = t('nickname.available'); tone = 'ok' }

  return <p className={`nick-status ${tone}`} role="status" aria-live="polite">{text}</p>
}
