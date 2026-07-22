import { createContext, useContext, useState, useCallback } from 'react'
import ko from '../locales/ko.js'
import en from '../locales/en.js'

const DICTS = { ko, en }
const STORAGE_KEY = 'fancluv_lang'

// Korean nav label → translation key (MENU arrays stay Korean as canonical keys
// used by routing/active checks; only the displayed label is translated).
export const NAV_KEYS = {
  '홈': 'nav.home',
  '설문': 'nav.surveys',
  '팬 의견': 'nav.opinions',
  '팀 뉴스': 'nav.news',
  '경기센터': 'nav.matches',
  'AI 인사이트': 'nav.insights',
  '팬 랭킹': 'nav.ranking',
  '내 활동': 'nav.activity',
}

// 초기 언어 결정 우선순위:
// 1. 사용자가 저장한 언어 설정
// 2. 로그인 사용자 프로필 언어 (localStorage에 저장된 프로필 정보가 있으면)
// 3. navigator.languages 또는 navigator.language
// 4. 브라우저 언어가 ko로 시작하면 한국어
// 5. 그 외에는 영어
// 6. 감지 실패 시 한국어
function detectBrowserLang() {
  try {
    // navigator.languages 먼저 확인 (배열, 가장 선호도 높은 것이 첫번째)
    const langs = navigator.languages || []
    for (const lang of langs) {
      if (lang.startsWith('ko')) return 'ko'
    }
    // navigator.language 확인 (단일 값)
    const browserLang = navigator.language || ''
    if (browserLang.startsWith('ko')) return 'ko'
    // 그 외 모든 언어는 영어 (일단 한국어 + 영어만 지원)
    return 'en'
  } catch {
    return 'ko' // 감지 실패 시 한국어
  }
}

function readInitialLang() {
  try {
    // 1. localStorage에 저장된 언어 설정 확인
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'ko' || saved === 'en') return saved
  } catch { /* ignore */ }

  // 2. 저장된 설정이 없으면 브라우저 언어 감지
  return detectBrowserLang()
}

const LanguageContext = createContext({ lang: 'ko', setLang: () => {}, t: k => k })

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readInitialLang)

  const setLang = useCallback(next => {
    setLangState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }, [])

  // t(key, vars?) — looks up in current dict, supports {token} interpolation,
  // falls back to Korean then to the raw key.
  const t = useCallback((key, vars) => {
    let str = DICTS[lang]?.[key]
    if (str == null) str = DICTS.ko[key]
    if (str == null) return key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll(`{${k}}`, v)
      }
    }
    return str
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  return useContext(LanguageContext)
}
