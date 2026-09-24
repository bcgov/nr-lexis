import { describe, expect, it } from 'vitest'
import {
  allowedRegions,
  filterRegionOptions,
  normalizeActionRegions,
  withinRegions,
} from '@/context/auth/region-utils'

const regional = {
  grantedActions: ['/applicationSearch', 'createApplication', 'savePermit'],
  actionRegions: normalizeActionRegions({
    createApplication: [1903],
    savePermit: [1903, 1904],
  }),
}

describe('region utils', () => {
  it('keys regions like granted actions and keeps codes as strings', () => {
    expect(normalizeActionRegions({ '/permitsReview.do': [1908, '1903', null], bad: 'x' })).toEqual(
      {
        permitsreview: ['1908', '1903'],
      },
    )
    expect(normalizeActionRegions(null)).toEqual({})
  })

  it('treats users without regional grants and province-wide actions as unrestricted', () => {
    expect(
      allowedRegions({ grantedActions: ['createApplication'] }, 'createApplication'),
    ).toBeNull()
    expect(allowedRegions(undefined, 'createApplication')).toBeNull()
    expect(allowedRegions(regional, '/applicationSearch')).toBeNull()
    expect(allowedRegions(regional, ['createApplication', '/applicationSearch'])).toBeNull()
  })

  it('unions the regions of held actions and ignores actions the user lacks', () => {
    expect(allowedRegions(regional, 'createApplication')).toEqual(new Set(['1903']))
    expect(allowedRegions(regional, ['createApplication', 'savePermit'])).toEqual(
      new Set(['1903', '1904']),
    )
    expect(allowedRegions(regional, 'approveExemption')).toEqual(new Set())
  })

  it('requires every record region and rejects records without one', () => {
    const cariboo = new Set(['1903'])
    expect(withinRegions(null, null)).toBe(true)
    expect(withinRegions(cariboo, 1903)).toBe(true)
    expect(withinRegions(cariboo, '1908')).toBe(false)
    expect(withinRegions(cariboo, ['1903', '1908'])).toBe(false)
    expect(withinRegions(cariboo, null)).toBe(false)
    expect(withinRegions(cariboo, [])).toBe(false)
  })

  it('filters region options only for regional users', () => {
    const options = [
      { value: '1903', label: 'Cariboo' },
      { value: '1908', label: 'Skeena' },
    ]
    expect(filterRegionOptions(options, null, (option) => option.value)).toBe(options)
    expect(filterRegionOptions(options, new Set(['1908']), (option) => option.value)).toEqual([
      { value: '1908', label: 'Skeena' },
    ])
  })
})
