import apiService from '@/service/api-service'
import { isRecord } from '@/utils/record'

export const DEFAULT_ZONE_OPTIONS = [
  { value: 'RCO', label: 'Coast (RCO)' },
  { value: 'RNI', label: 'Northern Interior (RNI)' },
  { value: 'RSI', label: 'Southern Interior (RSI)' },
] as const

export type DefaultZone = (typeof DEFAULT_ZONE_OPTIONS)[number]['value']

export type UserPreferences = {
  // The API field keeps its persisted name, but RCO/RNI/RSI are legacy LEXIS zones.
  defaultRegion: DefaultZone | null
}

const DEFAULT_ZONE_REGION_IDS: Record<DefaultZone, readonly string[]> = {
  RCO: ['1909', '1910'],
  RNI: ['1905', '1906', '1908'],
  RSI: ['1903', '1904', '1907'],
}

export const DEFAULT_ZONE_HELPER_TEXT: Record<DefaultZone, string> = {
  RCO: 'Preselects the South Coast and West Coast Natural Resource Regions in search tables.',
  RNI: 'Preselects the Northeast, Omineca, and Skeena Natural Resource Regions in search tables.',
  RSI: 'Preselects the Cariboo, Kootenay-Boundary, and Thompson-Okanagan Natural Resource Regions in search tables.',
}

type UserPreferencesListener = (preferences: UserPreferences) => void

const userPreferencesListeners = new Set<UserPreferencesListener>()

const isDefaultZone = (value: unknown): value is DefaultZone =>
  DEFAULT_ZONE_OPTIONS.some((option) => option.value === value)

const parsePreferences = (input: unknown): UserPreferences => {
  if (!isRecord(input)) {
    throw new Error('User preferences response is unavailable.')
  }

  const { defaultRegion } = input
  if (defaultRegion !== null && !isDefaultZone(defaultRegion)) {
    throw new Error('User preferences response is unavailable.')
  }

  return { defaultRegion }
}

export const fetchUserPreferences = async (): Promise<UserPreferences> => {
  const response = await apiService.getAxiosInstance().get<unknown>('/lexis/session/preferences')
  return parsePreferences(response.data)
}

export const resolveDefaultZoneRegionIds = (
  defaultZone: DefaultZone | null,
  availableRegionIds: readonly string[],
): string[] => {
  if (!defaultZone) {
    return []
  }

  const preferredRegionIds = new Set(DEFAULT_ZONE_REGION_IDS[defaultZone])
  return availableRegionIds.filter((regionId) => preferredRegionIds.has(regionId))
}

export const subscribeToUserPreferences = (listener: UserPreferencesListener): (() => void) => {
  userPreferencesListeners.add(listener)
  return () => userPreferencesListeners.delete(listener)
}

export const updateUserPreferences = async (
  defaultRegion: DefaultZone | null,
): Promise<UserPreferences> => {
  const response = await apiService
    .getAxiosInstance()
    .put<unknown>('/lexis/session/preferences', { defaultRegion })
  const preferences = parsePreferences(response.data)
  userPreferencesListeners.forEach((listener) => listener(preferences))
  return preferences
}
