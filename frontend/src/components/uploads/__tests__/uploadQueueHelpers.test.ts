import { describe, expect, it } from 'vitest'
import {
  extractUploadErrorDetails,
  GENERIC_SUBMISSION_FAILURE_MESSAGE,
} from '@/components/uploads/uploadQueueHelpers'

describe('uploadQueueHelpers', () => {
  it('keeps actionable validation errors from failed uploads', () => {
    const result = extractUploadErrorDetails({
      response: {
        status: 422,
        data: {
          message: 'LEXIS application submission rejected.',
          errors: ['Package TEST23-652-7D-2 already exists.'],
        },
      },
    })

    expect(result.message).toBe('Package TEST23-652-7D-2 already exists.')
    expect(result.details.errors).toEqual(['Package TEST23-652-7D-2 already exists.'])
  })

  it('hides raw server response details from hard upload failures', () => {
    const result = extractUploadErrorDetails(
      {
        response: {
          status: 500,
          data: {
            timestamp: '2026-06-16T18:13:00Z',
            status: 500,
            error: 'Internal Server Error',
            path: '/api/v1/fsp/submissions',
          },
        },
      },
      GENERIC_SUBMISSION_FAILURE_MESSAGE,
    )

    expect(result.message).toBe(GENERIC_SUBMISSION_FAILURE_MESSAGE)
    expect(result.details.summary).toBe(GENERIC_SUBMISSION_FAILURE_MESSAGE)
    expect(result.details.errors).toEqual([GENERIC_SUBMISSION_FAILURE_MESSAGE])
    expect(JSON.stringify(result)).not.toContain('/api/v1/fsp/submissions')
    expect(JSON.stringify(result)).not.toContain('Internal Server Error')
  })
})
