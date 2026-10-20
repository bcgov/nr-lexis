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
  const exemptionRegionNumbers = defaultRegionNumbers.map(normalizeRegionNumber)
  const defaultRegionNumber = exemptionRegionNumbers.find((regionNumber) =>
    REGION_GROUPS.some((group) => group.includes(regionNumber)),
  )

  if (!defaultRegionNumber) {
    return unavailableRegionContext('No recognized region is available for this exemption.')
  }

  // Every area group that holds one of the exemption's regions is open to the permit.
  const allowedRegionNumbers = REGION_GROUPS.filter((group) =>
    exemptionRegionNumbers.some((regionNumber) => group.includes(regionNumber)),
  ).flat()

  const options = regionOptions
    .map((option) => ({ ...option, id: normalizeRegionNumber(option.id) }))
    .filter((option) => allowedRegionNumbers.includes(option.id))

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
