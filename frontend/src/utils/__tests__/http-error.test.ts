import { describe, expect, it } from 'vitest'
import { getResponseMessage, getResponseStatus } from '@/utils/http-error'

describe('http error utilities', () => {
  it('returns numeric response status from error-like records', () => {
    expect(getResponseStatus({ response: { status: 403 } })).toBe(403)
  })

  it('ignores missing or non-numeric response status values', () => {
    expect(getResponseStatus(null)).toBeUndefined()
    expect(getResponseStatus({})).toBeUndefined()
    expect(getResponseStatus({ response: { status: '403' } })).toBeUndefined()
  })

  it('returns a trimmed response message', () => {
    expect(
      getResponseMessage({ response: { data: { message: ' Invalid schedule order. ' } } }),
    ).toBe('Invalid schedule order.')
  })

  it('ignores missing, blank, or non-string response messages', () => {
    expect(getResponseMessage(null)).toBeUndefined()
    expect(getResponseMessage({ response: { data: { message: '   ' } } })).toBeUndefined()
    expect(getResponseMessage({ response: { data: { message: ['Invalid'] } } })).toBeUndefined()
  })
})
