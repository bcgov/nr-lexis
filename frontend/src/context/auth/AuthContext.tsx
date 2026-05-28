import { createContext } from 'react'
import type { AuthContextType } from '@/context/auth/types'

export const AuthContext = createContext<AuthContextType | undefined>(undefined)
