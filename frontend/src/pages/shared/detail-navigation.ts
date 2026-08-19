export type DetailReturnTo = {
  label: string
  to: string
}

export type DetailNavigationState = Record<string, unknown> & {
  returnTo?: DetailReturnTo
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const readDetailReturnTo = (state: unknown): DetailReturnTo | undefined => {
  if (!isRecord(state) || !isRecord(state.returnTo)) {
    return undefined
  }

  const label = typeof state.returnTo.label === 'string' ? state.returnTo.label.trim() : ''
  const to = typeof state.returnTo.to === 'string' ? state.returnTo.to.trim() : ''
  if (!label || !to || !to.startsWith('/') || to.startsWith('//')) {
    return undefined
  }

  return { label, to }
}

export const withDetailReturnTo = (
  state: unknown,
  returnTo: DetailReturnTo,
): DetailNavigationState => ({
  ...(isRecord(state) ? state : {}),
  returnTo,
})

export const locationPath = (location: {
  pathname: string
  search?: string
  hash?: string
}): string => `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`
