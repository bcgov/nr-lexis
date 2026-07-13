import apiService from '@/service/api-service'
import { isRecord, mapRecordArray, stringField } from '@/utils/record'
import { SEARCH_OPTIONS_UNAVAILABLE_MESSAGE } from '@/constants/search-options'

export { SEARCH_OPTIONS_UNAVAILABLE_MESSAGE } from '@/constants/search-options'

export type SearchOption = {
  value: string
  label: string
}

export class SearchOptionsUnavailableError extends Error {
  constructor() {
    super(SEARCH_OPTIONS_UNAVAILABLE_MESSAGE)
    this.name = 'SearchOptionsUnavailableError'
  }
}

const NATURAL_RESOURCE_REGION_CODES = new Set([
  '1903',
  '1904',
  '1905',
  '1906',
  '1907',
  '1908',
  '1909',
  '1910',
])

const DISALLOWED_APPLICATION_STATUS_CODE = 'DAL'
const DISALLOWED_APPLICATION_STATUS_LABEL = 'disallowed'
type RequiredOptionField = {
  name: string
  allowEmptyCode?: boolean
}

const REPORT_OPTION_ARRAY_FIELDS: readonly RequiredOptionField[] = [
  { name: 'currentSchedules', allowEmptyCode: true },
  { name: 'regions' },
  { name: 'reportJurisdictions', allowEmptyCode: true },
  { name: 'biweeklyJurisdictions', allowEmptyCode: true },
  { name: 'teacJurisdictions' },
  { name: 'exemptionTypes', allowEmptyCode: true },
  { name: 'tenureExemptionTypes', allowEmptyCode: true },
  { name: 'exemptionReasons', allowEmptyCode: true },
  { name: 'exemptionStatuses', allowEmptyCode: true },
  { name: 'growthTypes', allowEmptyCode: true },
  { name: 'permitStatuses', allowEmptyCode: true },
  { name: 'destinationCountries', allowEmptyCode: true },
  { name: 'allDestinationCountries' },
  { name: 'portsOfExport', allowEmptyCode: true },
]

const isValidOptionArray = (input: unknown, allowEmptyCode = false): boolean =>
  Array.isArray(input) &&
  input.every(
    (item) =>
      isRecord(item) &&
      typeof item.code === 'string' &&
      (allowEmptyCode || item.code.trim().length > 0) &&
      typeof item.name === 'string' &&
      item.name.trim().length > 0,
  )

const hasValidOptionFields = (
  data: Record<string, unknown>,
  requiredFields: readonly RequiredOptionField[],
): boolean =>
  requiredFields.every((field) => isValidOptionArray(data[field.name], field.allowEmptyCode))

const parseOptions = (input: unknown, allowEmptyCode = false): SearchOption[] => {
  return mapRecordArray(input, (item) => {
    const code = stringField(item, 'code')
    const name = stringField(item, 'name')
    if ((!code && !allowEmptyCode) || !name) {
      return null
    }

    return {
      value: code,
      label: name,
    }
  })
}

const parseRegionOptions = (input: unknown): SearchOption[] =>
  parseOptions(input).filter((option) => NATURAL_RESOURCE_REGION_CODES.has(option.value))

const parseApplicationStatusOptions = (input: unknown): SearchOption[] =>
  parseOptions(input).filter(
    (option) =>
      option.value !== DISALLOWED_APPLICATION_STATUS_CODE &&
      option.label.trim().toLowerCase() !== DISALLOWED_APPLICATION_STATUS_LABEL,
  )

const fetchOptions = async (
  path: string,
  requiredArrayFields: readonly RequiredOptionField[],
): Promise<Record<string, unknown>> => {
  try {
    const data = await apiService.getCachedData<unknown>(path, undefined, {
      cacheKey: `search-options:${path}`,
      ttlMs: 5 * 60_000,
    })
    if (!isRecord(data) || !hasValidOptionFields(data, requiredArrayFields)) {
      throw new SearchOptionsUnavailableError()
    }

    return data
  } catch (error) {
    if (error instanceof SearchOptionsUnavailableError) {
      throw error
    }
    throw new SearchOptionsUnavailableError()
  }
}

const fetchRequiredOptions = async (path: string): Promise<Record<string, unknown>> => {
  const data = await apiService.getCachedData<unknown>(path, undefined, {
    cacheKey: `search-options:${path}`,
    ttlMs: 5 * 60_000,
  })
  if (!isRecord(data)) {
    throw new Error(`Search options response from ${path} is unavailable.`)
  }

  return data
}

export const fetchProvincialApplicationOptions = async (): Promise<{
  exemptionTypes: SearchOption[]
  exemptionReasons: SearchOption[]
  applicationStatuses: SearchOption[]
  productTypes: SearchOption[]
  growthTypes: SearchOption[]
  regions: SearchOption[]
  currentSchedules: SearchOption[]
}> => {
  const data = await fetchOptions('/lexis/applications/search/options', [
    { name: 'exemptionTypes' },
    { name: 'exemptionReasons' },
    { name: 'applicationStatuses' },
    { name: 'productTypes' },
    { name: 'growthTypes' },
    { name: 'regions' },
    { name: 'currentSchedules', allowEmptyCode: true },
  ])

  return {
    exemptionTypes: parseOptions(data.exemptionTypes),
    exemptionReasons: parseOptions(data.exemptionReasons),
    applicationStatuses: parseApplicationStatusOptions(data.applicationStatuses),
    productTypes: parseOptions(data.productTypes),
    growthTypes: parseOptions(data.growthTypes),
    regions: parseRegionOptions(data.regions),
    currentSchedules: parseOptions(data.currentSchedules, true),
  }
}

export const fetchProvincialExemptionOptions = async (): Promise<{
  exemptionTypes: SearchOption[]
  exemptionStatuses: SearchOption[]
  regions: SearchOption[]
}> => {
  const data = await fetchOptions('/lexis/exemptions/search/options', [
    { name: 'exemptionTypes' },
    { name: 'exemptionStatuses' },
    { name: 'regions' },
  ])

  return {
    exemptionTypes: parseOptions(data.exemptionTypes),
    exemptionStatuses: parseOptions(data.exemptionStatuses),
    regions: parseRegionOptions(data.regions),
  }
}

export const fetchProvincialPermitOptions = async (): Promise<{
  permitStatuses: SearchOption[]
  regions: SearchOption[]
}> => {
  const data = await fetchOptions('/lexis/permits/search/options', [
    { name: 'permitStatuses' },
    { name: 'regions' },
  ])

  return {
    permitStatuses: parseOptions(data.permitStatuses),
    regions: parseRegionOptions(data.regions),
  }
}

export const fetchReportOptions = async (): Promise<{
  currentSchedules: SearchOption[]
  defaultRegion: string
  regions: SearchOption[]
  reportJurisdictions: SearchOption[]
  biweeklyJurisdictions: SearchOption[]
  teacJurisdictions: SearchOption[]
  exemptionTypes: SearchOption[]
  tenureExemptionTypes: SearchOption[]
  exemptionReasons: SearchOption[]
  exemptionStatuses: SearchOption[]
  growthTypes: SearchOption[]
  permitStatuses: SearchOption[]
  destinationCountries: SearchOption[]
  allDestinationCountries: SearchOption[]
  portsOfExport: SearchOption[]
}> => {
  const data = await fetchRequiredOptions('/lexis/reports/options')
  const defaultRegion = data.defaultRegion
  if (
    !hasValidOptionFields(data, REPORT_OPTION_ARRAY_FIELDS) ||
    (defaultRegion !== null && defaultRegion !== undefined && typeof defaultRegion !== 'string')
  ) {
    throw new Error('Search options response from /lexis/reports/options is unavailable.')
  }

  const regions = parseRegionOptions(data.regions)
  const normalizedDefaultRegion = stringField(data, 'defaultRegion')

  return {
    currentSchedules: parseOptions(data.currentSchedules, true),
    defaultRegion: regions.some((region) => region.value === normalizedDefaultRegion)
      ? normalizedDefaultRegion
      : '',
    regions,
    reportJurisdictions: parseOptions(data.reportJurisdictions, true),
    biweeklyJurisdictions: parseOptions(data.biweeklyJurisdictions, true),
    teacJurisdictions: parseOptions(data.teacJurisdictions),
    exemptionTypes: parseOptions(data.exemptionTypes, true),
    tenureExemptionTypes: parseOptions(data.tenureExemptionTypes, true),
    exemptionReasons: parseOptions(data.exemptionReasons, true),
    exemptionStatuses: parseOptions(data.exemptionStatuses, true),
    growthTypes: parseOptions(data.growthTypes, true),
    permitStatuses: parseOptions(data.permitStatuses, true),
    destinationCountries: parseOptions(data.destinationCountries, true),
    allDestinationCountries: parseOptions(data.allDestinationCountries),
    portsOfExport: parseOptions(data.portsOfExport, true),
  }
}

export const fetchProvincialOfferOptions = async (): Promise<{
  regions: SearchOption[]
}> => {
  const data = await fetchOptions('/lexis/purchase-offers/search/options', [{ name: 'regions' }])

  return {
    regions: parseRegionOptions(data.regions),
  }
}

export const fetchFederalApplicationOptions = async (): Promise<{
  applicationStatuses: SearchOption[]
}> => {
  const data = await fetchOptions('/lexis/federal/applications/search/options', [
    { name: 'applicationStatuses' },
  ])

  return {
    applicationStatuses: parseApplicationStatusOptions(data.applicationStatuses),
  }
}

export const fetchApplicationReviewOptions = async (): Promise<{
  productTypes: SearchOption[]
  regions: SearchOption[]
  reviewStatuses: SearchOption[]
}> => {
  const data = await fetchOptions('/lexis/application-reviews/search/options', [
    { name: 'productTypes' },
    { name: 'regions' },
    { name: 'reviewStatuses' },
  ])

  return {
    productTypes: parseOptions(data.productTypes),
    regions: parseRegionOptions(data.regions),
    reviewStatuses: parseApplicationStatusOptions(data.reviewStatuses),
  }
}
