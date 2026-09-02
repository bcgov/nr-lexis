import { env } from '@/env'
import { hasRole } from '@/context/auth/role-utils'

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on'])

const PROD_RTM_ONLY_LEGACY_REDIRECT_ROUTE = '/admin/rtm/emslogamv'
const PROD_RTM_ONLY_UPLOAD_ROUTE = '/admin/rtm/emslogamv/upload'
export const PROD_RTM_ONLY_ROUTE = PROD_RTM_ONLY_UPLOAD_ROUTE

const PROD_RTM_ONLY_ALLOWED_PATHS = new Set([
  '/',
  '/dashboard',
  PROD_RTM_ONLY_LEGACY_REDIRECT_ROUTE,
  PROD_RTM_ONLY_UPLOAD_ROUTE,
  '/unauthorized',
  '*',
])

const isEnabledConfig = (value: string | undefined): boolean => {
  return TRUE_VALUES.has((value ?? '').trim().toLowerCase())
}

export const isProdRtmOnlyMode = (): boolean => {
  return isEnabledConfig(env.VITE_LEXIS_PROD_RTM_ONLY)
}

export const isProdRtmOnlyPathAllowed = (
  path: string,
  roles: string[] | null | undefined,
): boolean => {
  if (!isProdRtmOnlyMode()) {
    return true
  }

  if (PROD_RTM_ONLY_ALLOWED_PATHS.has(path)) {
    return true
  }

  return hasRole(roles, 'READ_ONLY') && !hasRole(roles, 'ADMIN')
}
