import apiService from '@/service/api-service'
import { isRecord } from '@/utils/record'

export const DEFAULT_REGION_OPTIONS = [
  { value: 'RCO', label: 'Coast (RCO)' },
  { value: 'RNI', label: 'Northern Interior (RNI)' },
  { value: 'RSI', label: 'Southern Interior (RSI)' },
] as const

export type DefaultRegion = (typeof DEFAULT_REGION_OPTIONS)[number]['value']

export type UserPreferences = {
  defaultRegion: DefaultRegion | null
}

const DEFAULT_REGION_AREA_IDS: Record<DefaultRegion, readonly string[]> = {
  RCO: ['1909', '1910'],
  RNI: ['1905', '1906', '1908'],
  RSI: ['1903', '1904', '1907'],
}

type UserPreferencesListener = (preferences: UserPreferences) => void

const userPreferencesListeners = new Set<UserPreferencesListener>()

const isDefaultRegion = (value: unknown): value is DefaultRegion =>
  DEFAULT_REGION_OPTIONS.some((option) => option.value === value)

const parsePreferences = (input: unknown): UserPreferences => {
  if (!isRecord(input)) {
    throw new Error('User preferences response is unavailable.')
  }

  const { defaultRegion } = input
  if (defaultRegion !== null && !isDefaultRegion(defaultRegion)) {
    throw new Error('User preferences response is unavailable.')
  }

  return { defaultRegion }
}

export const fetchUserPreferences = async (): Promise<UserPreferences> => {
  const response = await apiService.getAxiosInstance().get<unknown>('/lexis/session/preferences')
  return parsePreferences(response.data)
}

export const resolveDefaultRegionAreaIds = (
  defaultRegion: DefaultRegion | null,
  availableAreaIds: readonly string[],
): string[] => {
  if (!defaultRegion) {
    return [...availableAreaIds]
  }

  const preferredAreaIds = new Set(DEFAULT_REGION_AREA_IDS[defaultRegion])
  const matchingAreaIds = availableAreaIds.filter((areaId) => preferredAreaIds.has(areaId))
  return matchingAreaIds.length > 0 ? matchingAreaIds : [...availableAreaIds]
}

export const subscribeToUserPreferences = (listener: UserPreferencesListener): (() => void) => {
  userPreferencesListeners.add(listener)
  return () => userPreferencesListeners.delete(listener)
}

export const updateUserPreferences = async (
  defaultRegion: DefaultRegion | null,
): Promise<UserPreferences> => {
  const response = await apiService
    .getAxiosInstance()
    .put<unknown>('/lexis/session/preferences', { defaultRegion })
  const preferences = parsePreferences(response.data)
  userPreferencesListeners.forEach((listener) => listener(preferences))
  return preferences
}
