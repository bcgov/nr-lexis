const SEARCH_SERVICE_MOCK_FALLBACK_ENV = 'VITE_ENABLE_SEARCH_MOCK_FALLBACK'

export const isMockFallbackEnabled = (): boolean => {
  return import.meta.env[SEARCH_SERVICE_MOCK_FALLBACK_ENV] === 'true'
}

export const isSearchServiceMockFallbackEnabled = isMockFallbackEnabled

export const toSearchServiceError = (message: string, error: unknown): Error => {
  if (error instanceof Error) {
    return error
  }
  return new Error(message)
}
