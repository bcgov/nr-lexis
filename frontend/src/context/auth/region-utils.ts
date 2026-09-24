import type { LexisSessionCapabilities } from '@/interfaces/LexisSession'

/** A record's organization units, as detail pages hold them. */
export type RecordOrgUnits =
  | string
  | number
  | null
  | undefined
  | ReadonlyArray<string | number | null | undefined>

export const normalizeAction = (action: string): string => {
  return action.trim().toLowerCase().replace(/\.do$/i, '').replace(/^\//, '')
}

/** Keys the backend's action-to-organization-unit map the same way as granted actions. */
export const normalizeActionRegions = (value: unknown): Record<string, string[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const regions: Record<string, string[]> = {}
  for (const [action, orgUnits] of Object.entries(value)) {
    if (!Array.isArray(orgUnits)) {
      continue
    }
    regions[normalizeAction(action)] = orgUnits
      .filter((orgUnit) => typeof orgUnit === 'number' || typeof orgUnit === 'string')
      .map((orgUnit) => String(orgUnit).trim())
      .filter((orgUnit) => orgUnit.length > 0)
  }
  return regions
}

/**
 * The regions a user may use for any of these actions, or null when one of them is
 * province-wide. A role with no region is province-wide, so only regional grants restrict.
 */
export const allowedRegions = (
  capabilities:
    | Partial<Pick<LexisSessionCapabilities, 'grantedActions' | 'actionRegions'>>
    | undefined,
  actions: string | readonly string[],
): Set<string> | null => {
  const actionRegions = capabilities?.actionRegions ?? {}
  if (Object.keys(actionRegions).length === 0) {
    return null
  }
  const granted = new Set((capabilities?.grantedActions ?? []).map(normalizeAction))
  const regions = new Set<string>()
  for (const action of typeof actions === 'string' ? [actions] : actions) {
    const key = normalizeAction(action)
    if (!granted.has(key)) {
      continue
    }
    const limited = actionRegions[key]
    if (!limited) {
      return null
    }
    limited.forEach((region) => regions.add(region))
  }
  return regions
}

/** Every organization unit of the record must be allowed; a record without one is outside. */
export const withinRegions = (allowed: Set<string> | null, orgUnits: RecordOrgUnits): boolean => {
  if (!allowed) {
    return true
  }
  const units = (Array.isArray(orgUnits) ? orgUnits : [orgUnits])
    .filter((orgUnit) => orgUnit !== null && orgUnit !== undefined)
    .map((orgUnit) => String(orgUnit).trim())
    .filter((orgUnit) => orgUnit.length > 0)
  return units.length > 0 && units.every((orgUnit) => allowed.has(orgUnit))
}

/** Keeps only the region options the user may use; unchanged for province-wide users. */
export const filterRegionOptions = <T>(
  options: T[],
  allowed: Set<string> | null,
  code: (option: T) => string | number | null | undefined,
): T[] => {
  if (!allowed) {
    return options
  }
  return options.filter((option) => {
    const value = code(option)
    return value !== null && value !== undefined && allowed.has(String(value).trim())
  })
}
