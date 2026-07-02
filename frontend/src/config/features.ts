import { env } from '@/env'

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on'])

export const PROD_RTM_ONLY_ROUTE = '/admin/rtm/emslogamv'

const PROD_RTM_ONLY_ALLOWED_PATHS = new Set([
  '/',
  '/dashboard',
  PROD_RTM_ONLY_ROUTE,
  '/unauthorized',
  '*',
])

export const isEnabledConfig = (value: string | undefined): boolean => {
  return TRUE_VALUES.has((value ?? '').trim().toLowerCase())
}

export const isProdRtmOnlyMode = (): boolean => {
  return isEnabledConfig(env.VITE_LEXIS_PROD_RTM_ONLY)
}

export const isProdRtmOnlyPathAllowed = (path: string): boolean => {
  if (!isProdRtmOnlyMode()) {
    return true
  }

  return PROD_RTM_ONLY_ALLOWED_PATHS.has(path)
}
