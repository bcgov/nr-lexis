import { useMemo } from 'react'
import { allowedRegions, filterRegionOptions } from '@/context/auth/region-utils'
import { useAuth } from '@/context/auth/useAuth'

/**
 * Region options limited to the regions the user holds for any of the actions. Province-wide
 * users get the same array back, so effects keyed on it do not re-run.
 */
export const useAllowedRegionOptions = <T extends object>(
  options: T[],
  actions: string | readonly string[],
  codeKey: keyof T,
): T[] => {
  const { capabilities } = useAuth()
  const actionKey = typeof actions === 'string' ? actions : actions.join('|')
  return useMemo(
    () =>
      filterRegionOptions(options, allowedRegions(capabilities, actionKey.split('|')), (option) => {
        const code = option[codeKey]
        return typeof code === 'string' || typeof code === 'number' ? code : null
      }),
    [options, capabilities, actionKey, codeKey],
  )
}
