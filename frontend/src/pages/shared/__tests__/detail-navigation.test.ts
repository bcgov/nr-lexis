import { describe, expect, it } from 'vitest'

import {
  locationPath,
  readDetailReturnTo,
  withDetailReturnTo,
} from '@/pages/shared/detail-navigation'

describe('detail navigation state', () => {
  it('reads a valid cross-list return target and preserves its exact query', () => {
    expect(
      readDetailReturnTo({
        returnTo: {
          label: 'Federal application search',
          to: '/federal?applicationStatus=APP&sortField=receivedDate&page=3&pageSize=25',
        },
      }),
    ).toEqual({
      label: 'Federal application search',
      to: '/federal?applicationStatus=APP&sortField=receivedDate&page=3&pageSize=25',
    })
  })

  it('falls back for malformed or external return targets', () => {
    expect(readDetailReturnTo(undefined)).toBeUndefined()
    expect(readDetailReturnTo({ returnTo: { label: '', to: '/federal' } })).toBeUndefined()
    expect(
      readDetailReturnTo({ returnTo: { label: 'Search', to: 'https://example.com' } }),
    ).toBeUndefined()
    expect(
      readDetailReturnTo({ returnTo: { label: 'Search', to: '//example.com' } }),
    ).toBeUndefined()
  })

  it('preserves creation notices while replacing the immediate return target', () => {
    expect(
      withDetailReturnTo(
        { offerCreationNotice: { warnings: ['warning'] } },
        { label: 'Provincial offer detail', to: '/provincial/offers/81001?packageFilter=PKG-1' },
      ),
    ).toEqual({
      offerCreationNotice: { warnings: ['warning'] },
      returnTo: {
        label: 'Provincial offer detail',
        to: '/provincial/offers/81001?packageFilter=PKG-1',
      },
    })
  })

  it('builds an exact current detail URL for nested navigation', () => {
    expect(
      locationPath({
        pathname: '/provincial/application/321',
        search: '?status=APP&page=2',
        hash: '#offers',
      }),
    ).toBe('/provincial/application/321?status=APP&page=2#offers')
  })
})
