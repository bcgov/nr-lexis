import { describe, expect, it } from 'vitest'
import { getResponseStatus } from '@/utils/http-error'

describe('http error utilities', () => {
  it('returns numeric response status from error-like records', () => {
    expect(getResponseStatus({ response: { status: 403 } })).toBe(403)
  })

  it('ignores missing or non-numeric response status values', () => {
    expect(getResponseStatus(null)).toBeUndefined()
    expect(getResponseStatus({})).toBeUndefined()
    expect(getResponseStatus({ response: { status: '403' } })).toBeUndefined()
  })
})
