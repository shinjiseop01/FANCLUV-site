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

function readInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'ko' || saved === 'en') return saved
  } catch { /* ignore */ }
  return 'ko'
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
