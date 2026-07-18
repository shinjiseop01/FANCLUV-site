import { useLang } from '../contexts/LanguageContext.jsx'
import Alert from './Alert.jsx'

// 닉네임 입력창 아래 상태/안내 문구. 공용 Alert(flex row)로 아이콘·문구 한 행 정렬.
// - empty     : 안내 문구(info)만 표시(예시 없음)
// - invalid   : 형식 오류(error)
// - checking  : 확인 중(info)
// - taken     : 이미 사용 중(error)
// - available : 사용 가능(success)
export default function NicknameStatus({ status }) {
  const { t } = useLang()
  const { state, code } = status || {}

  let text = t('nickname.hint')
  let kind = 'info'
  if (state === 'invalid') { text = t(`nickname.err.${code}`); kind = 'error' }
  else if (state === 'checking') { text = t('nickname.checking'); kind = 'info' }
  else if (state === 'taken') { text = t('nickname.taken'); kind = 'error' }
  else if (state === 'available') { text = t('nickname.available'); kind = 'success' }

  return <Alert kind={kind} className="nick-status">{text}</Alert>
}
