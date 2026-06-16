import { describe, expect, it } from 'vitest'
import {
  mapSelectedOptionsById,
  parseCsvParam,
  parseEnumParam,
  parsePositiveIntParam,
  parseSortDirectionParam,
  setSearchParam,
} from '@/pages/shared/search-query-utils'

describe('search-query-utils', () => {
  it('parses comma separated parameters', () => {
    expect(parseCsvParam(' A, ,B , C ')).toEqual(['A', 'B', 'C'])
    expect(parseCsvParam(null)).toEqual([])
  })

  it('parses positive integer parameters with fallback', () => {
    expect(parsePositiveIntParam('20', 10)).toBe(20)
    expect(parsePositiveIntParam('0', 10)).toBe(10)
    expect(parsePositiveIntParam('abc', 10)).toBe(10)
  })

  it('parses constrained enum and sort direction values', () => {
    expect(parseEnumParam('name', ['name', 'date'] as const, 'date')).toBe('name')
    expect(parseEnumParam('missing', ['name', 'date'] as const, 'date')).toBe('date')
    expect(parseSortDirectionParam('DESC', 'asc')).toBe('desc')
    expect(parseSortDirectionParam('sideways', 'asc')).toBe('asc')
  })

  it('sets non-blank scalar and array search parameters', () => {
    const params = new URLSearchParams()

    setSearchParam(params, 'query', ' timber ')
    setSearchParam(params, 'page', 2)
    setSearchParam(params, 'regions', [' RSC ', '', 'RSI'])
    setSearchParam(params, 'blank', ' ')

    expect(params.toString()).toBe('query=timber&page=2&regions=RSC%2CRSI')
  })

  it('maps selected ids back to option objects with fallback labels', () => {
    expect(
      mapSelectedOptionsById(['RSI', 'RSC'], [{ id: 'RSI', text: 'South Island' }]),
    ).toEqual([
      { id: 'RSI', text: 'South Island' },
      { id: 'RSC', text: 'RSC' },
    ])
  })
})
