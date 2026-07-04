// FANCLUV — 닉네임 실시간 검사 훅.
//
// 입력값을 실시간으로 (1) 형식 검증 → (2) 중복 검사(디바운스) 순서로 확인한다.
// 반환: { state, code }
//   state: 'empty' | 'invalid' | 'checking' | 'taken' | 'available'
//   code : state==='invalid' 일 때 nickname.err.<code>
// state==='available' 일 때만 저장 가능하다.
import { useState, useEffect } from 'react'
import { validateNicknameFormat } from './nicknameValidation.js'
import { isNicknameTaken } from './auth.js'

export function useNicknameCheck(nickname, { exceptId = null, exceptEmail = null } = {}) {
  const [status, setStatus] = useState({ state: 'empty', code: null })

  useEffect(() => {
    const s = String(nickname ?? '')
    if (!s) { setStatus({ state: 'empty', code: null }); return }

    const fmt = validateNicknameFormat(s)
    if (!fmt.ok) { setStatus({ state: 'invalid', code: fmt.code }); return }

    let active = true
    setStatus({ state: 'checking', code: null })
    const timer = setTimeout(async () => {
      const taken = await isNicknameTaken(s.trim(), { exceptId, exceptEmail })
      if (!active) return
      setStatus(taken ? { state: 'taken', code: null } : { state: 'available', code: null })
    }, 350)

    return () => { active = false; clearTimeout(timer) }
  }, [nickname, exceptId, exceptEmail])

  return status
}
