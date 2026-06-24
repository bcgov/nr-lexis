import { describe, expect, it, vi } from 'vitest'
import { parseJsonValue } from '@/utils/json'

describe('json utilities', () => {
  it('parses JSON values', () => {
    expect(parseJsonValue('{"value":"test"}')).toEqual({ value: 'test' })
    expect(parseJsonValue('[1,2]')).toEqual([1, 2])
  })

  it('returns null for empty or invalid JSON values', () => {
    const onError = vi.fn()

    expect(parseJsonValue(null)).toBeNull()
    expect(parseJsonValue('')).toBeNull()
    expect(parseJsonValue('not-json', onError)).toBeNull()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
