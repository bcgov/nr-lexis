import { Theme } from '@carbon/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { syncAppNotificationRegionTheme } from '@/components/AppNotification'
import { ThemeContext, type UiTheme } from './ThemeContext'

const THEME_PREFERENCE_KEY = 'lexis.ui.theme'

const readThemePreference = (): UiTheme => {
  if (typeof window === 'undefined') {
    return 'white'
  }

  try {
    return window.localStorage.getItem(THEME_PREFERENCE_KEY) === 'g100' ? 'g100' : 'white'
  } catch {
    return 'white'
  }
}

const writeThemePreference = (theme: UiTheme): void => {
  try {
    window.localStorage.setItem(THEME_PREFERENCE_KEY, theme)
  } catch {
    // Theme preferences are optional when storage is unavailable.
  }
}

const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<UiTheme>(readThemePreference)
  const previousRootThemeRef = useRef<string | null>(null)
  const hasCapturedRootThemeRef = useRef(false)
  const isDarkTheme = theme === 'g100'

  useEffect(() => {
    const root = document.documentElement
    if (!hasCapturedRootThemeRef.current) {
      previousRootThemeRef.current = root.getAttribute('data-carbon-theme')
      hasCapturedRootThemeRef.current = true
    }

    root.setAttribute('data-carbon-theme', theme)
    writeThemePreference(theme)
    syncAppNotificationRegionTheme(isDarkTheme)
  }, [isDarkTheme, theme])

  useEffect(() => {
    return () => {
      const previousTheme = previousRootThemeRef.current
      const root = document.documentElement
      if (previousTheme === null) {
        root.removeAttribute('data-carbon-theme')
      } else {
        root.setAttribute('data-carbon-theme', previousTheme)
      }
      syncAppNotificationRegionTheme(previousTheme === 'g90' || previousTheme === 'g100')
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === 'g100' ? 'white' : 'g100'))
  }, [])
  const contextValue = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])

  return (
    <ThemeContext value={contextValue}>
      <Theme theme={theme}>{children}</Theme>
    </ThemeContext>
  )
}

export default ThemeProvider
