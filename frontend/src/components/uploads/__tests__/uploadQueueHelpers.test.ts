import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_EXTENSIONS,
  extractUploadErrorDetails,
  GENERIC_SUBMISSION_FAILURE_MESSAGE,
  validateDocumentUploadDescription,
  validateDocumentUploadFile,
  validateUploadFileSize,
} from '@/components/uploads/uploadQueueHelpers'

describe('uploadQueueHelpers', () => {
  it('rejects document files above the shared 20 MiB business limit', () => {
    const oversized = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.pdf')

    expect(validateDocumentUploadFile(oversized)).toBe('File must be 20 MiB or smaller.')
    expect(validateUploadFileSize(oversized)).toBe('File must be 20 MiB or smaller.')
  })

  it('uses the authoritative attachment extension allowlist for the file picker and queue', () => {
    expect(DOCUMENT_UPLOAD_ACCEPT).toBe(
      '.bmp,.csv,.doc,.docx,.jpg,.pdf,.png,.rtf,.txt,.xls,.xlsx,.xml,.zip',
    )

    for (const extension of DOCUMENT_UPLOAD_EXTENSIONS) {
      expect(validateDocumentUploadFile(new File(['content'], `evidence${extension}`))).toBe('')
    }

    expect(validateDocumentUploadFile(new File(['content'], 'evidence.exe'))).toContain(
      'File type is not supported',
    )
  })

  it('validates Oracle-compatible attachment metadata before queueing', () => {
    expect(validateDocumentUploadFile(new File(['content'], 'résumé.pdf'))).toBe(
      'File name must use printable US-ASCII characters without path separators.',
    )
    expect(validateDocumentUploadFile(new File(['content'], `${'a'.repeat(247)}.pdf`))).toBe(
      'File name must be 250 bytes or fewer.',
    )
    expect(validateDocumentUploadDescription('Résumé')).toBe(
      'Document description must use US-ASCII characters.',
    )
    expect(validateDocumentUploadDescription('a'.repeat(251))).toBe(
      'Document description must be 250 bytes or fewer.',
    )
    expect(validateDocumentUploadDescription('Line one\nLine two')).toBe('')
  })

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

  it('keeps actionable validation errors when the backend returns a single string', () => {
    const result = extractUploadErrorDetails({
      response: {
        status: 422,
        data: {
          errors: 'Application number is required.',
        },
      },
    })

    expect(result.message).toBe('Application number is required.')
    expect(result.details.errors).toEqual(['Application number is required.'])
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

  it('keeps plain-language multipart upload errors from the backend', () => {
    const result = extractUploadErrorDetails({
      response: {
        status: 413,
        data: {
          message: 'The selected file is too large. Choose a smaller file and try again.',
          errors: ['The selected file is too large. Choose a smaller file and try again.'],
        },
      },
    })

    expect(result.message).toBe(
      'The selected file is too large. Choose a smaller file and try again.',
    )
    expect(result.details.errors).toEqual([
      'The selected file is too large. Choose a smaller file and try again.',
    ])
  })

  it('uses a plain-language file-size message when a 413 response has no structured body', () => {
    const result = extractUploadErrorDetails({
      response: {
        status: 413,
        data: '',
      },
    })

    expect(result.message).toBe(
      'The selected file is too large. Choose a smaller file and try again.',
    )
    expect(result.details.errors).toEqual([
      'The selected file is too large. Choose a smaller file and try again.',
    ])
  })
})
