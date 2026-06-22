import { describe, expect, it } from 'vitest'
import { toUrlEncodedParams } from '@/service/legacy-form-utils'

describe('legacy-form-utils', () => {
  it('encodes only populated legacy form fields', () => {
    const params = toUrlEncodedParams({
      populated: 'value',
      empty: '',
      whitespace: '   ',
      missing: undefined,
      zero: '0',
    })

    expect(params.get('populated')).toBe('value')
    expect(params.get('zero')).toBe('0')
    expect(params.has('empty')).toBe(false)
    expect(params.has('whitespace')).toBe(false)
    expect(params.has('missing')).toBe(false)
  })
})
