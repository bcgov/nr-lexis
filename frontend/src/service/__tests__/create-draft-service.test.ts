import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteCreateDraft,
  listCreateDrafts,
  saveCreateDraft,
} from '@/service/create-draft-service'

const MODULE = 'provincial-application'
const STORAGE_KEY = `lexis.create-drafts.${MODULE}`

describe('create-draft-service', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('saves drafts newest first and limits stored records', () => {
    vi.setSystemTime(new Date('2026-06-15T15:00:00.000Z'))

    const saved = saveCreateDraft(MODULE, { applicationNumber: '123' })

    expect(saved).toEqual({
      id: expect.stringMatching(/^DRF-\d+-[A-Z0-9]{6}$/),
      module: MODULE,
      savedAt: '2026-06-15T15:00:00.000Z',
      payload: { applicationNumber: '123' },
    })
    expect(listCreateDrafts(MODULE)).toEqual([saved])

    for (let index = 0; index < 30; index += 1) {
      vi.setSystemTime(new Date(`2026-06-15T15:${String(index + 1).padStart(2, '0')}:00.000Z`))
      saveCreateDraft(MODULE, { index })
    }

    const storedDrafts = listCreateDrafts(MODULE)
    expect(storedDrafts).toHaveLength(25)
    expect(storedDrafts[0].payload).toEqual({ index: 29 })
  })

  it('filters malformed persisted draft records', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'DRF-1-ABC123',
          module: MODULE,
          savedAt: '2026-06-15T15:00:00.000Z',
          payload: { applicationNumber: '123' },
        },
        {
          id: 1,
          module: MODULE,
          savedAt: '2026-06-15T15:01:00.000Z',
          payload: { applicationNumber: '124' },
        },
        null,
      ]),
    )

    expect(listCreateDrafts(MODULE)).toEqual([
      {
        id: 'DRF-1-ABC123',
        module: MODULE,
        savedAt: '2026-06-15T15:00:00.000Z',
        payload: { applicationNumber: '123' },
      },
    ])
  })

  it('returns an empty list for invalid JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY, 'not json')

    expect(listCreateDrafts(MODULE)).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('deletes drafts by id', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'DRF-1-ABC123',
          module: MODULE,
          savedAt: '2026-06-15T15:00:00.000Z',
          payload: { applicationNumber: '123' },
        },
      ]),
    )

    expect(deleteCreateDraft(MODULE, 'missing')).toBe(false)
    expect(deleteCreateDraft(MODULE, 'DRF-1-ABC123')).toBe(true)
    expect(listCreateDrafts(MODULE)).toEqual([])
  })
})
