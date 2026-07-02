import apiService from '@/service/api-service'
import { isRecord, mapRecordArray, stringField } from '@/utils/record'

export type SearchOption = {
  value: string
  label: string
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

const fetchOptions = async (path: string): Promise<Record<string, unknown> | null> => {
  try {
    const data = await apiService.getCachedData<unknown>(path, undefined, {
      cacheKey: `search-options:${path}`,
      ttlMs: 5 * 60_000,
    })
    if (!isRecord(data)) {
      return null
    }

    return data
  } catch (error) {
    console.warn(`Unable to load search options from ${path}.`, error)
    return null
  }
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
  const data = await fetchOptions('/lexis/applications/search/options')
  if (!data) {
    return {
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [],
      productTypes: [],
      growthTypes: [],
      regions: [],
      currentSchedules: [],
    }
  }

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
  const data = await fetchOptions('/lexis/exemptions/search/options')
  if (!data) {
    return {
      exemptionTypes: [],
      exemptionStatuses: [],
      regions: [],
    }
  }

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
  const data = await fetchOptions('/lexis/permits/search/options')
  if (!data) {
    return {
      permitStatuses: [],
      regions: [],
    }
  }

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
  const data = await fetchOptions('/lexis/reports/options')
  if (!data) {
    return {
      currentSchedules: [],
      defaultRegion: '',
      regions: [],
      reportJurisdictions: [],
      biweeklyJurisdictions: [],
      teacJurisdictions: [],
      exemptionTypes: [],
      tenureExemptionTypes: [],
      exemptionReasons: [],
      exemptionStatuses: [],
      growthTypes: [],
      permitStatuses: [],
      destinationCountries: [],
      allDestinationCountries: [],
      portsOfExport: [],
    }
  }

  const regions = parseRegionOptions(data.regions)
  const defaultRegion = stringField(data, 'defaultRegion')

  return {
    currentSchedules: parseOptions(data.currentSchedules, true),
    defaultRegion: regions.some((region) => region.value === defaultRegion) ? defaultRegion : '',
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
  const data = await fetchOptions('/lexis/purchase-offers/search/options')
  if (!data) {
    return {
      regions: [],
    }
  }

  return {
    regions: parseRegionOptions(data.regions),
  }
}

export const fetchFederalApplicationOptions = async (): Promise<{
  applicationStatuses: SearchOption[]
}> => {
  const data = await fetchOptions('/lexis/federal/applications/search/options')
  if (!data) {
    return {
      applicationStatuses: [],
    }
  }

  return {
    applicationStatuses: parseApplicationStatusOptions(data.applicationStatuses),
  }
}

export const fetchApplicationReviewOptions = async (): Promise<{
  productTypes: SearchOption[]
  regions: SearchOption[]
  reviewStatuses: SearchOption[]
}> => {
  const data = await fetchOptions('/lexis/application-reviews/search/options')
  if (!data) {
    return {
      productTypes: [],
      regions: [],
      reviewStatuses: [],
    }
  }

  return {
    productTypes: parseOptions(data.productTypes),
    regions: parseRegionOptions(data.regions),
    reviewStatuses: parseApplicationStatusOptions(data.reviewStatuses),
  }
}
