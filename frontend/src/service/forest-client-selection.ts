export const FOREST_CLIENT_SELECTION_HEADER = 'X-Lexis-Forest-Client-Number'

const ACTIVE_FOREST_CLIENT_KEY = 'lexis.session.activeForestClientNumber'

const normalizeForestClientNumber = (value: string | null | undefined): string | null => {
  const normalized = value?.trim() ?? ''
  return /^\d+$/.test(normalized) ? normalized : null
}

export const getActiveForestClientNumber = (): string | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return normalizeForestClientNumber(window.sessionStorage.getItem(ACTIVE_FOREST_CLIENT_KEY))
  } catch {
    return null
  }
}

export const setActiveForestClientNumber = (forestClientNumber: string): void => {
  const normalized = normalizeForestClientNumber(forestClientNumber)
  if (!normalized || typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(ACTIVE_FOREST_CLIENT_KEY, normalized)
  } catch {
    // The selection request will fail closed if browser storage is unavailable.
  }
}

export const clearActiveForestClientNumber = (): void => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.removeItem(ACTIVE_FOREST_CLIENT_KEY)
  } catch {
    // Session storage is optional; the server still validates every request.
  }
}
