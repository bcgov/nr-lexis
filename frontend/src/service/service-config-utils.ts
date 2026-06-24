export const getConfiguredString = (configured: unknown, fallback: string): string => {
  if (typeof configured !== 'string') {
    return fallback
  }

  const trimmed = configured.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

export const getConfiguredBasePath = (configured: unknown, fallback: string): string => {
  const path = getConfiguredString(configured, fallback)
  return path.endsWith('/') ? path.slice(0, -1) : path
}

export const isEnabledConfig = (configured: unknown, fallback = true): boolean => {
  const normalized = (configured ?? String(fallback)).toString().trim().toLowerCase()
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no'
}
