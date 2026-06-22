import { describe, expect, it } from 'vitest'
import {
  documentValueAsBoolean,
  documentValueAsString,
  documentValueAsStringArray,
  normalizeDocumentRowBase,
  parseDocumentArrayPayload,
  parseRemoveDocumentSuccess,
} from '@/service/document-service-utils'

describe('document-service-utils', () => {
  it('coerces document values without broad object stringification', () => {
    expect(documentValueAsString('  file.pdf  ')).toBe('file.pdf')
    expect(documentValueAsString(123)).toBe('123')
    expect(documentValueAsString(Number.NaN)).toBe('')
    expect(documentValueAsString({ value: 'file.pdf' })).toBe('')

    expect(documentValueAsBoolean(true)).toBe(true)
    expect(documentValueAsBoolean(' TRUE ')).toBe(true)
    expect(documentValueAsBoolean('yes')).toBe(false)
  })

  it('coerces document string arrays with trimmed nonblank entries', () => {
    expect(documentValueAsStringArray(['  file.pdf  ', '', 123, Number.NaN, null])).toEqual([
      'file.pdf',
      '123',
    ])
    expect(documentValueAsStringArray('file.pdf')).toEqual([])
  })

  it('extracts array payloads from common response envelopes', () => {
    const rows = [{ id: 1 }]
    expect(parseDocumentArrayPayload(rows)).toBe(rows)
    expect(parseDocumentArrayPayload({ results: rows })).toBe(rows)
    expect(parseDocumentArrayPayload({ invoiceList: rows }, ['invoiceList'])).toBe(rows)
    expect(parseDocumentArrayPayload({ invoiceList: rows })).toBeNull()
    expect(parseDocumentArrayPayload({ rows: 'not rows' })).toBeNull()
  })

  it('normalizes base document rows from api aliases', () => {
    expect(
      normalizeDocumentRowBase(
        {
          fileId: 55,
          fileName: ' example.pdf ',
          fileDescription: ' Uploaded file ',
          attachmentTypeDescription: ' PDF ',
        },
        0,
      ),
    ).toEqual({
      id: '55',
      name: 'example.pdf',
      description: 'Uploaded file',
      type: 'PDF',
    })

    expect(normalizeDocumentRowBase({}, 1)).toEqual({
      id: 'document-2',
      name: 'Document 2',
      description: '',
      type: '',
    })

    expect(normalizeDocumentRowBase('not a row', 2)).toEqual({
      id: 'document-3',
      name: 'Document 3',
      description: '',
      type: '',
    })
  })

  it('parses remove document success flags', () => {
    expect(parseRemoveDocumentSuccess(true)).toBe(true)
    expect(parseRemoveDocumentSuccess({ success: 'true' })).toBe(true)
    expect(parseRemoveDocumentSuccess({ removed: true })).toBe(true)
    expect(parseRemoveDocumentSuccess({ valid: 'false' })).toBe(false)
    expect(parseRemoveDocumentSuccess({ ok: true })).toBe(false)
  })
})
