import { createContext } from 'react'

export type UiTheme = 'white' | 'g100'

type ThemeContextValue = {
  theme: UiTheme
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
