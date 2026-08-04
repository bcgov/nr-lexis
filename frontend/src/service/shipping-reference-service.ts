import apiService from '@/service/api-service'

export type ShippingReferenceOption = {
  code: string
  name: string
}

export type ShippingReferenceOptions = {
  countries: ShippingReferenceOption[]
  transportTypes: ShippingReferenceOption[]
  ports: ShippingReferenceOption[]
}

const normalizeOptions = (
  value: unknown,
  expectedCodeLength: number,
): ShippingReferenceOption[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Shipping reference options are unavailable.')
  }

  const seenCodes = new Set<string>()
  return value.map((item) => {
    const option = item as Partial<ShippingReferenceOption> | null
    const code = typeof option?.code === 'string' ? option.code.trim().toUpperCase() : ''
    const name = typeof option?.name === 'string' ? option.name.trim() : ''
    if (code.length !== expectedCodeLength || !name || seenCodes.has(code)) {
      throw new Error('Shipping reference options are invalid.')
    }
    seenCodes.add(code)
    return { code, name }
  })
}

// INTENTIONAL_LEGACY_DIVERGENCE(COMPLETE_SHIPPING_COUNTRY_OPTIONS):
// Preserve the complete authoritative country list so valid persisted codes never render blank.
export const fetchShippingReferenceOptions = async (): Promise<ShippingReferenceOptions> => {
  const payload = await apiService.getCachedData<ShippingReferenceOptions>(
    '/lexis/shipping-reference-options',
    undefined,
    { ttlMs: 300_000 },
  )
  return {
    countries: normalizeOptions(payload?.countries, 2),
    transportTypes: normalizeOptions(payload?.transportTypes, 1),
    ports: normalizeOptions(payload?.ports, 2),
  }
}

export const formatShippingReferenceOption = (option: ShippingReferenceOption): string =>
  `${option.name} (${option.code})`

export const shippingReferenceLabel = (
  options: ShippingReferenceOption[] | undefined,
  code: string | null | undefined,
): string => {
  const normalizedCode = code?.trim().toUpperCase() ?? ''
  if (!normalizedCode) {
    return ''
  }
  const option = options?.find((candidate) => candidate.code === normalizedCode)
  return option ? formatShippingReferenceOption(option) : normalizedCode
}
