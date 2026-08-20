/**
 * INTENTIONAL_LEGACY_DIVERGENCE(CONTEXTUAL_RETURN_NAVIGATION):
 * Heartwood records the actual originating list or detail target and preserves its exact URL
 * query. Direct detail visits fall back to a canonical accessible parent or role default.
 */
export type DetailReturnTo = {
  label: string
  to: string
  state?: DetailNavigationState
}

export type DetailNavigationState = Record<string, unknown> & {
  returnTo?: DetailReturnTo
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readDetailReturnTarget = (value: unknown): DetailReturnTo | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const label = typeof value.label === 'string' ? value.label.trim() : ''
  const to = typeof value.to === 'string' ? value.to.trim() : ''
  if (!label || !to || !to.startsWith('/') || to.startsWith('//') || to.includes('\\')) {
    return undefined
  }

  return {
    label,
    to,
    ...(isRecord(value.state) ? { state: value.state as DetailNavigationState } : {}),
  }
}

export const readDetailReturnTo = (state: unknown): DetailReturnTo | undefined =>
  isRecord(state) ? readDetailReturnTarget(state.returnTo) : undefined

export const withDetailReturnTo = (
  state: unknown,
  returnTo: DetailReturnTo,
  fallbackReturnTo?: DetailReturnTo,
): DetailNavigationState => {
  const currentState: DetailNavigationState = isRecord(state) ? { ...state } : {}
  if (!readDetailReturnTo(currentState) && fallbackReturnTo) {
    currentState.returnTo = fallbackReturnTo
  }

  return {
    ...currentState,
    returnTo: {
      label: returnTo.label,
      to: returnTo.to,
      ...(Object.keys(currentState).length > 0 ? { state: currentState } : {}),
    },
  }
}

const MAX_DETAIL_RETURN_DEPTH = 10

export const readDetailReturnTrail = (returnTo: DetailReturnTo): DetailReturnTo[] => {
  const trail: DetailReturnTo[] = []
  const visitedStates = new Set<DetailNavigationState>()
  let current = readDetailReturnTarget(returnTo)

  while (current && trail.length < MAX_DETAIL_RETURN_DEPTH) {
    if (current.state && visitedStates.has(current.state)) {
      break
    }
    if (current.state) {
      visitedStates.add(current.state)
    }

    trail.push(current)
    current = current.state ? readDetailReturnTo(current.state) : undefined
  }

  return trail.reverse()
}

export const locationPath = (location: {
  pathname: string
  search?: string
  hash?: string
}): string => `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`
