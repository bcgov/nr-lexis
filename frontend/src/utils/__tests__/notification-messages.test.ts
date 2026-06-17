import { describe, expect, it } from 'vitest'
import {
  sanitizeNotificationText,
  sanitizeNotificationTextList,
} from '@/utils/notification-messages'

describe('notification message sanitization', () => {
  it('preserves actionable business validation messages', () => {
    expect(sanitizeNotificationText('Package TEST23-652-7D-2 already exists.')).toBe(
      'Package TEST23-652-7D-2 already exists.',
    )
  })

  it('replaces raw API envelopes with plain recovery guidance', () => {
    const rawError =
      'Submission failed (HTTP 500) {"timestamp":"2026-06-16T18:13:00Z","status":500,"error":"Internal Server Error","path":"/api/v1/fsp/submissions"}'

    expect(sanitizeNotificationText(rawError, 'Submission failed. Try again later.')).toBe(
      'Submission failed. Try again later.',
    )
  })

  it('preserves XML schema URLs but still hides application API paths', () => {
    expect(
      sanitizeNotificationText(
        'The XML schema location must use supported LEXIS schema version http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd.',
      ),
    ).toBe(
      'The XML schema location must use supported LEXIS schema version http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd.',
    )

    expect(
      sanitizeNotificationText(
        'Submission failed at /api/lexis/application-submissions.',
        'Submission failed. Try again later.',
      ),
    ).toBe('Submission failed. Try again later.')
  })

  it('deduplicates sanitized message lists', () => {
    expect(
      sanitizeNotificationTextList(
        [
          '{"timestamp":"2026-06-16T18:13:00Z","path":"/lexis/admin/uploads"}',
          'HTTP 500 Internal Server Error',
        ],
        'Upload failed. Please try again.',
      ),
    ).toEqual(['Upload failed. Please try again.'])
  })
})
