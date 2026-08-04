import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchShippingReferenceOptions,
  shippingReferenceLabel,
} from '@/service/shipping-reference-service'

const { getCachedDataMock } = vi.hoisted(() => ({
  getCachedDataMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedData: getCachedDataMock,
  },
}))

describe('shipping-reference-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and normalizes all required option groups from one endpoint', async () => {
    getCachedDataMock.mockResolvedValue({
      countries: [{ code: ' us ', name: ' United States ' }],
      transportTypes: [{ code: 's', name: 'Ship' }],
      ports: [{ code: 'va', name: 'Vancouver' }],
    })

    await expect(fetchShippingReferenceOptions()).resolves.toEqual({
      countries: [{ code: 'US', name: 'United States' }],
      transportTypes: [{ code: 'S', name: 'Ship' }],
      ports: [{ code: 'VA', name: 'Vancouver' }],
    })
    expect(getCachedDataMock).toHaveBeenCalledWith('/lexis/shipping-reference-options', undefined, {
      ttlMs: 300_000,
    })
  })

  it.each([
    {
      countries: [],
      transportTypes: [{ code: 'S', name: 'Ship' }],
      ports: [{ code: 'VA', name: 'Vancouver' }],
    },
    {
      countries: [{ code: 'USA', name: 'United States' }],
      transportTypes: [{ code: 'S', name: 'Ship' }],
      ports: [{ code: 'VA', name: 'Vancouver' }],
    },
    {
      countries: [{ code: 'US', name: 'United States' }],
      transportTypes: [{ code: 'S', name: '' }],
      ports: [{ code: 'VA', name: 'Vancouver' }],
    },
  ])('fails closed for malformed mutation options', async (payload) => {
    getCachedDataMock.mockResolvedValue(payload)

    await expect(fetchShippingReferenceOptions()).rejects.toThrow('Shipping reference options')
  })

  it('renders descriptions with codes and falls back to the code only for read mode', () => {
    expect(shippingReferenceLabel([{ code: 'US', name: 'United States' }], 'us')).toBe(
      'United States (US)',
    )
    expect(shippingReferenceLabel([{ code: 'AD', name: 'Andorra' }], 'AD')).toBe('Andorra (AD)')
    expect(shippingReferenceLabel([], 'ZZ')).toBe('ZZ')
  })
})
