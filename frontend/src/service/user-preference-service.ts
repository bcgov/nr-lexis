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

export const updateUserPreferences = async (
  defaultRegion: DefaultRegion | null,
): Promise<UserPreferences> => {
  const response = await apiService
    .getAxiosInstance()
    .put<unknown>('/lexis/session/preferences', { defaultRegion })
  return parsePreferences(response.data)
}
