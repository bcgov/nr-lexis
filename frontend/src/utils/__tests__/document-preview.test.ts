import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDocumentPreview } from '@/utils/document-preview'
import { triggerBrowserDownload } from '@/utils/download'

vi.mock('@/utils/download', () => ({ triggerBrowserDownload: vi.fn() }))

describe('document previews', () => {
  let previewTarget: Window
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:permit-document')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    previewTarget = {
      closed: false,
      location: { replace: vi.fn() },
      close: vi.fn(),
    } as unknown as Window
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('opens an authenticated octet-stream PDF in the reserved tab with its preview type', () => {
    const blob = new Blob(['%PDF-1.7'], { type: 'application/octet-stream' })
    openDocumentPreview(blob, 'permit.PDF', previewTarget)

    const previewBlob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    expect(previewBlob.type).toBe('application/pdf')
    expect(previewBlob.size).toBe(blob.size)
    expect(previewTarget.location.replace).toHaveBeenCalledWith('blob:permit-document')
    expect(previewTarget.close).not.toHaveBeenCalled()
    expect(triggerBrowserDownload).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.runOnlyPendingTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:permit-document')
  })

  it.each(['image/png', 'image/jpeg', 'text/plain;charset=utf-8'])(
    'preserves the safe response MIME type %s',
    (type) => {
      const blob = new Blob(['preview'], { type })
      openDocumentPreview(blob, 'document', previewTarget)
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
      expect(triggerBrowserDownload).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['text/html', 'unsafe.pdf'],
    ['image/svg+xml', 'diagram.svg'],
    ['application/octet-stream', 'document.docx'],
    ['application/octet-stream', 'archive.zip'],
  ])('downloads unsupported %s content without an inline preview', (type, filename) => {
    const blob = new Blob(['document'], { type })
    openDocumentPreview(blob, filename, previewTarget)
    expect(triggerBrowserDownload).toHaveBeenCalledWith(blob, filename)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(previewTarget.close).toHaveBeenCalledOnce()
    expect(previewTarget.location.replace).not.toHaveBeenCalled()
  })

  it('downloads the document when the browser blocked the reserved tab', () => {
    const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
    openDocumentPreview(blob, 'permit.pdf', null)
    expect(triggerBrowserDownload).toHaveBeenCalledWith(blob, 'permit.pdf')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('does not reopen a reserved tab that the user closed while loading', () => {
    Object.defineProperty(previewTarget, 'closed', { value: true })
    openDocumentPreview(new Blob(['%PDF-1.7']), 'permit.pdf', previewTarget)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(triggerBrowserDownload).not.toHaveBeenCalled()
  })
})
