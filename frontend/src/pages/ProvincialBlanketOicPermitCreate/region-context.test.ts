import { describe, expect, it } from 'vitest'
import { resolveBlanketOicRegionContext } from './region-context'

const regionOptions = [
  { id: '1903', text: 'Region 1903' },
  { id: '1904', text: 'Region 1904' },
  { id: '1905', text: 'Region 1905' },
  { id: '1906', text: 'Region 1906' },
  { id: '1907', text: 'Region 1907' },
  { id: '1908', text: 'Region 1908' },
  { id: '1909', text: 'Region 1909' },
  { id: '1910', text: 'Region 1910' },
]

describe('resolveBlanketOicRegionContext', () => {
  it('uses the first recognized exemption region and limits choices to its group', () => {
    const context = resolveBlanketOicRegionContext(regionOptions, ['1910', '1905'])

    expect(context).toEqual({
      defaultRegionNumber: '1910',
      options: [
        { id: '1909', text: 'Region 1909' },
        { id: '1910', text: 'Region 1910' },
      ],
      errorMessage: '',
    })
  })

  it('does not provide a fallback when the exemption region is missing or unavailable', () => {
    expect(resolveBlanketOicRegionContext(regionOptions, [])).toEqual({
      defaultRegionNumber: '',
      options: [],
      errorMessage: 'No recognized region is available for this exemption.',
    })

    expect(resolveBlanketOicRegionContext(regionOptions, ['1999'])).toEqual({
      defaultRegionNumber: '',
      options: [],
      errorMessage: 'No recognized region is available for this exemption.',
    })

    expect(resolveBlanketOicRegionContext([{ id: '1909', text: 'Region 1909' }], ['1910'])).toEqual(
      {
        defaultRegionNumber: '',
        options: [],
        errorMessage: "The exemption's region is unavailable. Reload before creating a permit.",
      },
    )
  })
})
