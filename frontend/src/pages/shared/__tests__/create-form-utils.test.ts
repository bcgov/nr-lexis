import { describe, expect, it } from 'vitest'
import { mergeCreateDraftPayload } from '@/pages/shared/create-form-utils'

describe('create-form-utils', () => {
  it('merges draft payloads over the provided initial form', () => {
    const initialForm = {
      applicationNumber: '',
      comments: '',
      speciesCodes: [] as string[],
    }

    expect(
      mergeCreateDraftPayload(
        {
          applicationNumber: '45963',
          speciesCodes: ['HE'],
        },
        initialForm,
      ),
    ).toEqual({
      applicationNumber: '45963',
      comments: '',
      speciesCodes: ['HE'],
    })
  })

  it('returns the provided initial form for invalid draft payloads', () => {
    const initialForm = {
      applicationNumber: 'prefilled',
      comments: 'keep me',
    }

    expect(mergeCreateDraftPayload(null, initialForm)).toBe(initialForm)
    expect(mergeCreateDraftPayload('invalid', initialForm)).toBe(initialForm)
  })
})
