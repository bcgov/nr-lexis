import type { IdTextOption } from '@/pages/shared/search-query-utils'

const REGION_GROUPS: readonly (readonly string[])[] = [
  ['1909', '1910'],
  ['1905', '1906', '1908'],
  ['1903', '1904', '1907'],
]

export type BlanketOicRegionContext = {
  defaultRegionNumber: string
  options: IdTextOption[]
  errorMessage: string
}

const normalizeRegionNumber = (value: string): string => value.trim()

const unavailableRegionContext = (errorMessage: string): BlanketOicRegionContext => ({
  defaultRegionNumber: '',
  options: [],
  errorMessage,
})

export const resolveBlanketOicRegionContext = (
  regionOptions: IdTextOption[],
  defaultRegionNumbers: string[],
): BlanketOicRegionContext => {
  const defaultRegionNumber = defaultRegionNumbers
    .map(normalizeRegionNumber)
    .find((regionNumber) => REGION_GROUPS.some((group) => group.includes(regionNumber)))

  if (!defaultRegionNumber) {
    return unavailableRegionContext('No recognized region is available for this exemption.')
  }

  const regionGroup = REGION_GROUPS.find((group) => group.includes(defaultRegionNumber))
  if (!regionGroup) {
    return unavailableRegionContext('No recognized region is available for this exemption.')
  }

  const options = regionOptions
    .map((option) => ({ ...option, id: normalizeRegionNumber(option.id) }))
    .filter((option) => regionGroup.includes(option.id))

  if (!options.some((option) => option.id === defaultRegionNumber)) {
    return unavailableRegionContext(
      "The exemption's region is unavailable. Reload before creating a permit.",
    )
  }

  return {
    defaultRegionNumber,
    options,
    errorMessage: '',
  }
}
