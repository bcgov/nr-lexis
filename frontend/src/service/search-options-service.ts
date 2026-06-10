import apiService from '@/service/api-service'

export type SearchOption = {
  value: string
  label: string
}

const parseOptions = (input: unknown, allowEmptyCode = false): SearchOption[] => {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const code = typeof (item as any).code === 'string' ? (item as any).code.trim() : ''
      const name = typeof (item as any).name === 'string' ? (item as any).name.trim() : ''
      if ((!code && !allowEmptyCode) || !name) {
        return null
      }

      return {
        value: code,
        label: name,
      }
    })
    .filter((item): item is SearchOption => item !== null)
}

const fetchOptions = async (path: string): Promise<Record<string, unknown> | null> => {
  try {
    const data = await apiService.getCachedData<unknown>(path, undefined, {
      cacheKey: `search-options:${path}`,
      ttlMs: 5 * 60_000,
    })
    if (!data || typeof data !== 'object') {
      return null
    }

    return data as Record<string, unknown>
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
    }
  }

  return {
    exemptionTypes: parseOptions(data.exemptionTypes),
    exemptionReasons: parseOptions(data.exemptionReasons),
    applicationStatuses: parseOptions(data.applicationStatuses),
    productTypes: parseOptions(data.productTypes),
    growthTypes: parseOptions(data.growthTypes),
    regions: parseOptions(data.regions),
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
    regions: parseOptions(data.regions),
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
    regions: parseOptions(data.regions),
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

  return {
    currentSchedules: parseOptions(data.currentSchedules),
    defaultRegion: typeof data.defaultRegion === 'string' ? data.defaultRegion.trim() : '',
    regions: parseOptions(data.regions),
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
    regions: parseOptions(data.regions),
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
    applicationStatuses: parseOptions(data.applicationStatuses),
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
    regions: parseOptions(data.regions),
    reviewStatuses: parseOptions(data.reviewStatuses),
  }
}
