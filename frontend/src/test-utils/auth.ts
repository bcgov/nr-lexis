import { vi } from 'vitest'
import type { AuthContextType } from '@/context/auth/types'
import type { LexisSessionCapabilities } from '@/interfaces/LexisSession'

export const createTestCapabilities = (
  overrides: Partial<LexisSessionCapabilities> = {},
): LexisSessionCapabilities => ({
  authenticated: true,
  principal: 'idir\\admin',
  roles: ['ADMIN'],
  welcomeTarget: 'administrator',
  legacyPath: '/provincial/review',
  grantedActions: [],
  forestClientNumber: null,
  availableForestClientNumbers: [],
  forestClientSelectionRequired: false,
  ...overrides,
})

export const createTestAuthContext = (
  overrides: Partial<AuthContextType> = {},
): AuthContextType => ({
  capabilities: createTestCapabilities(),
  isLoading: false,
  isLoggedIn: true,
  hasAnyRole: true,
  usesExternalLogin: true,
  defaultRoute: '/provincial/review',
  refresh: vi.fn().mockResolvedValue(undefined),
  selectForestClient: vi.fn().mockResolvedValue(undefined),
  login: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  canPerform: vi.fn().mockReturnValue(true),
  ...overrides,
})

export const createLoggedOutTestAuthContext = (
  overrides: Partial<AuthContextType> = {},
): AuthContextType =>
  createTestAuthContext({
    capabilities: createTestCapabilities({
      authenticated: false,
      principal: null,
      roles: [],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    }),
    isLoggedIn: false,
    hasAnyRole: false,
    defaultRoute: '/',
    canPerform: vi.fn().mockReturnValue(false),
    ...overrides,
  })
