import { describe, expect, it } from 'vitest'

import {
  locationPath,
  readDetailReturnTo,
  readDetailReturnTrail,
  withDetailReturnTo,
} from '@/pages/shared/detail-navigation'
import type { DetailReturnTo } from '@/pages/shared/detail-navigation'

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
    expect(
      readDetailReturnTo({ returnTo: { label: 'Search', to: '\\evil.example' } }),
    ).toBeUndefined()
    expect(
      readDetailReturnTo({ returnTo: { label: 'Search', to: '/\\evil.example' } }),
    ).toBeUndefined()
    expect(
      readDetailReturnTo({ returnTo: { label: 'Search', to: 'C:\\evil.example' } }),
    ).toBeUndefined()
  })

  it('snapshots the full parent state under the immediate return target', () => {
    const parentState = {
      returnTo: {
        label: 'My Applications',
        to: '/provincial/summary?page=2&pageSize=25',
      },
      lexisDetailTab: 'offers',
    }

    expect(
      withDetailReturnTo(parentState, {
        label: 'Provincial offer detail',
        to: '/provincial/offers/81001',
      }),
    ).toEqual({
      returnTo: {
        label: 'Provincial offer detail',
        to: '/provincial/offers/81001',
        state: parentState,
      },
      lexisDetailTab: 'offers',
    })
  })

  it('preserves creation notices while replacing the immediate return target', () => {
    const parentState = { offerCreationNotice: { warnings: ['warning'] } }

    expect(
      withDetailReturnTo(parentState, {
        label: 'Provincial offer detail',
        to: '/provincial/offers/81001',
      }),
    ).toEqual({
      offerCreationNotice: { warnings: ['warning'] },
      returnTo: {
        label: 'Provincial offer detail',
        to: '/provincial/offers/81001',
        state: parentState,
      },
    })
  })

  it('seeds a fallback parent for direct parent-to-child navigation', () => {
    const fallbackParent = {
      label: 'My Applications',
      to: '/provincial/summary?page=2&pageSize=25',
    }

    expect(
      withDetailReturnTo(
        { lexisDetailTab: 'offers' },
        { label: 'Provincial application detail', to: '/provincial/application/321' },
        fallbackParent,
      ),
    ).toEqual({
      lexisDetailTab: 'offers',
      returnTo: {
        label: 'Provincial application detail',
        to: '/provincial/application/321',
        state: {
          lexisDetailTab: 'offers',
          returnTo: fallbackParent,
        },
      },
    })
  })

  it('seeds a fallback parent when the existing return target is malformed', () => {
    const fallbackParent = {
      label: 'Application search',
      to: '/provincial/application?status=APP',
    }

    expect(
      withDetailReturnTo(
        { returnTo: { label: 'bad', to: '\\evil.example' } },
        { label: 'Application detail', to: '/provincial/application/321' },
        fallbackParent,
      ),
    ).toEqual({
      returnTo: {
        label: 'Application detail',
        to: '/provincial/application/321',
        state: { returnTo: fallbackParent },
      },
    })
  })

  it('reads the ancestor-to-immediate trail in bounded order', () => {
    const summary = {
      label: 'My Applications',
      to: '/provincial/summary?page=2&pageSize=25',
    }
    const application = {
      label: 'Application 321',
      to: '/provincial/application/321?tab=offers',
      state: { returnTo: summary },
    }

    expect(readDetailReturnTrail(application)).toEqual([summary, application])
  })

  it('stops safely on a cyclic trail', () => {
    const cyclicState: Record<string, unknown> = {}
    const cyclicReturnTo = {
      label: 'Cyclic detail',
      to: '/provincial/application/321',
    } as DetailReturnTo
    cyclicReturnTo.state = cyclicState
    cyclicState.returnTo = cyclicReturnTo

    expect(readDetailReturnTrail(cyclicReturnTo)).toEqual([cyclicReturnTo])
  })

  it('bounds malformed or unexpectedly deep trails', () => {
    let returnTo: DetailReturnTo = { label: 'Ancestor 0', to: '/detail/0' }
    for (let depth = 1; depth < 15; depth += 1) {
      returnTo = {
        label: `Ancestor ${depth}`,
        to: `/detail/${depth}`,
        state: { returnTo },
      }
    }

    const trail = readDetailReturnTrail(returnTo)

    expect(trail).toHaveLength(10)
    expect(trail.at(-1)).toMatchObject({ label: 'Ancestor 14', to: '/detail/14' })
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
