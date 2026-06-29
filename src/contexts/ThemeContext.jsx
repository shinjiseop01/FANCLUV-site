import { createContext, useContext, useEffect, useState, useCallback } from 'react'

// FANCLUV theme management.
//   theme    — user preference: 'light' | 'dark' | 'system'  (persisted)
//   resolved — the effective theme actually applied: 'light' | 'dark'
//
// The resolved theme is written to <html data-theme="…">. CSS only ever
// sees 'light' or 'dark'; the 'system' preference is resolved here against
// the OS setting and kept in sync via matchMedia.

const STORAGE_KEY = 'fancluv_theme'

const ThemeContext = createContext({
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
})

function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function readInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch { /* ignore */ }
  return 'system'
}

function applyTheme(resolved) {
  document.documentElement.setAttribute('data-theme', resolved)
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitial)
  const [resolved, setResolved] = useState(() =>
    theme === 'system' ? getSystemTheme() : theme,
  )

  // Apply + persist whenever the preference changes.
  useEffect(() => {
    const eff = theme === 'system' ? getSystemTheme() : theme
    setResolved(eff)
    applyTheme(eff)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  // While in 'system' mode, follow live OS dark/light changes.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const eff = getSystemTheme()
      setResolved(eff)
      applyTheme(eff)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback(next => setThemeState(next), [])

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
