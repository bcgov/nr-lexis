import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEARCH_PAGE,
  DEFAULT_SEARCH_PAGE_SIZE,
  SEARCH_PAGE_SIZE_OPTIONS,
  appendSearchParamsToPath,
  createEmptyPagedSearchResponse,
  createSearchParams,
  getNextSortDirection,
  mapSelectedOptionsById,
  mapValueLabelOptionsToIdTextOptions,
  parseCsvParam,
  parseEnumParam,
  parsePageSizeParam,
  parsePositiveIntParam,
  parseSortDirectionParam,
  searchParamsWithValue,
  setSearchParam,
} from '@/pages/shared/search-query-utils'

describe('search-query-utils', () => {
  it('defines shared search pagination defaults', () => {
    expect(DEFAULT_SEARCH_PAGE).toBe(1)
    expect(DEFAULT_SEARCH_PAGE_SIZE).toBe(20)
    expect(SEARCH_PAGE_SIZE_OPTIONS).toEqual([20, 50, 100, 200])
  })

  it('creates empty paged search responses', () => {
    expect(createEmptyPagedSearchResponse()).toEqual({
      content: [],
      page: {
        number: 0,
        size: 20,
        totalElements: 0,
        totalPages: 1,
      },
    })
    expect(createEmptyPagedSearchResponse(20).page.size).toBe(20)
  })

  it('parses comma separated parameters', () => {
    expect(parseCsvParam(' A, ,B , C ')).toEqual(['A', 'B', 'C'])
    expect(parseCsvParam(null)).toEqual([])
  })

  it('appends current search parameters to a route path', () => {
    expect(appendSearchParamsToPath('/provincial/application', new URLSearchParams())).toBe(
      '/provincial/application',
    )
    expect(
      appendSearchParamsToPath(
        '/provincial/application/123',
        new URLSearchParams('page=2&region=RSI'),
      ),
    ).toBe('/provincial/application/123?page=2&region=RSI')
  })

  it('sets values and removes blank values from existing search parameters', () => {
    const existingParams = new URLSearchParams('page=2&packageFilter=ABC')

    expect(searchParamsWithValue(existingParams, 'packageFilter', 'XYZ').toString()).toBe(
      'page=2&packageFilter=XYZ',
    )
    expect(searchParamsWithValue(existingParams, 'packageFilter', '   ').toString()).toBe('page=2')
  })

  it('parses positive integer parameters with fallback', () => {
    expect(parsePositiveIntParam('20', 10)).toBe(20)
    expect(parsePositiveIntParam('0', 10)).toBe(10)
    expect(parsePositiveIntParam('abc', 10)).toBe(10)
  })

  it('parses constrained page sizes with fallback', () => {
    expect(parsePageSizeParam('20', DEFAULT_SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE_OPTIONS)).toBe(20)
    expect(parsePageSizeParam('25', DEFAULT_SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE_OPTIONS)).toBe(20)
    expect(parsePageSizeParam('0', DEFAULT_SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE_OPTIONS)).toBe(20)
  })

  it('parses constrained enum and sort direction values', () => {
    expect(parseEnumParam('name', ['name', 'date'] as const, 'date')).toBe('name')
    expect(parseEnumParam('missing', ['name', 'date'] as const, 'date')).toBe('date')
    expect(parseSortDirectionParam('DESC', 'asc')).toBe('desc')
    expect(parseSortDirectionParam('sideways', 'asc')).toBe('asc')
  })

  it('returns the next sort direction for table headers', () => {
    expect(getNextSortDirection('name', 'asc', 'name')).toBe('desc')
    expect(getNextSortDirection('name', 'desc', 'name')).toBe('asc')
    expect(getNextSortDirection('name', 'desc', 'date')).toBe('asc')
  })

  it('sets non-blank scalar and array search parameters', () => {
    const params = new URLSearchParams()

    setSearchParam(params, 'query', ' timber ')
    setSearchParam(params, 'page', 2)
    setSearchParam(params, 'regions', [' RSC ', '', 'RSI'])
    setSearchParam(params, 'blank', ' ')

    expect(params.toString()).toBe('query=timber&page=2&regions=RSC%2CRSI')
  })

  it('creates search parameters from ordered entries', () => {
    const params = createSearchParams([
      ['query', ' timber '],
      ['page', 2],
      ['regions', [' RSC ', '', 'RSI']],
      ['blank', ' '],
      ['missing', null],
    ])

    expect(params.toString()).toBe('query=timber&page=2&regions=RSC%2CRSI')
  })

  it('maps selected ids back to option objects with fallback labels', () => {
    expect(mapSelectedOptionsById(['RSI', 'RSC'], [{ id: 'RSI', text: 'South Island' }])).toEqual([
      { id: 'RSI', text: 'South Island' },
      { id: 'RSC', text: 'RSC' },
    ])
  })

  it('uses custom fallback labels for selected ids before options load', () => {
    expect(mapSelectedOptionsById(['1818'], [], (id) => `Region ${id}`)).toEqual([
      { id: '1818', text: 'Region 1818' },
    ])
  })

  it('maps value-label options to id-text options', () => {
    expect(
      mapValueLabelOptionsToIdTextOptions([
        { value: 'RSI', label: 'South Island Natural Resource Region' },
        { value: 'RSC', label: 'Cariboo Natural Resource Region' },
      ]),
    ).toEqual([
      { id: 'RSI', text: 'South Island Natural Resource Region' },
      { id: 'RSC', text: 'Cariboo Natural Resource Region' },
    ])
  })
})
