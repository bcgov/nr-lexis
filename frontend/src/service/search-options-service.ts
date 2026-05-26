import apiService from '@/service/api-service'

export type SearchOption = {
  value: string
  label: string
}

const parseOptions = (input: unknown): SearchOption[] => {
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
      if (!code || !name) {
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
    const response = await apiService.getAxiosInstance().get(path)
    if (!response.data || typeof response.data !== 'object') {
      return null
    }

    return response.data
  } catch (error) {
    console.warn(`Unable to load search options from ${path}.`, error)
    return null
  }
}

export const fetchProvincialApplicationOptions = async (): Promise<{
  exemptionTypes: SearchOption[]
  applicationStatuses: SearchOption[]
  productTypes: SearchOption[]
  regions: SearchOption[]
}> => {
  const data = await fetchOptions('/lexis/applications/search/options')
  if (!data) {
    return {
      exemptionTypes: [],
      applicationStatuses: [],
      productTypes: [],
      regions: [],
    }
  }

  return {
    exemptionTypes: parseOptions(data.exemptionTypes),
    applicationStatuses: parseOptions(data.applicationStatuses),
    productTypes: parseOptions(data.productTypes),
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
