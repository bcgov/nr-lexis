import { describe, expect, it } from 'vitest'
import { extractResponseFilename, getResponseHeaderValue } from '@/service/http-response-utils'

describe('http-response-utils', () => {
  it('reads headers case-insensitively', () => {
    expect(getResponseHeaderValue({ 'content-type': 'application/pdf' }, 'Content-Type')).toBe(
      'application/pdf',
    )
    expect(getResponseHeaderValue({ 'CONTENT-TYPE': ['text/csv'] }, 'content-type')).toBe(
      'text/csv',
    )
    expect(getResponseHeaderValue({}, 'content-type')).toBeNull()
  })

  it('extracts filenames from content disposition headers', () => {
    expect(
      extractResponseFilename(
        { 'content-disposition': "attachment; filename*=UTF-8''permit%20detail.pdf" },
        'fallback.pdf',
      ),
    ).toBe('permit detail.pdf')
    expect(
      extractResponseFilename(
        { 'content-disposition': 'attachment; filename="report.csv"' },
        'fallback.csv',
      ),
    ).toBe('report.csv')
    expect(extractResponseFilename({}, 'fallback.pdf')).toBe('fallback.pdf')
  })
})
