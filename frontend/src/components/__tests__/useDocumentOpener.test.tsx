import { act, renderHook } from '@testing-library/react'

import { useDocumentOpener } from '@/components/documents/useDocumentOpener'
import type { DocumentRowBase } from '@/service/document-service-utils'
import { openDocumentPreview } from '@/utils/document-preview'
import { triggerBrowserDownload } from '@/utils/download'

vi.mock('@/utils/document-preview', () => ({ openDocumentPreview: vi.fn() }))
vi.mock('@/utils/download', () => ({ triggerBrowserDownload: vi.fn() }))

const row: DocumentRowBase = { id: '7', name: 'permit.pdf', description: '', type: 'Permit' }
const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' })

const reservedTab = () =>
  ({ closed: false, close: vi.fn(), opener: {} }) as unknown as Window & { close: () => void }

describe('useDocumentOpener', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('reserves a tab for Open and previews the document there', async () => {
    const previewTarget = reservedTab()
    vi.spyOn(window, 'open').mockReturnValue(previewTarget)
    const fetchDocument = vi.fn().mockResolvedValue({ blob, filename: 'server-name.pdf' })
    const onStart = vi.fn()
    const { result } = renderHook(() =>
      useDocumentOpener({ recordKey: '777', fetchDocument, onStart, onError: vi.fn() }),
    )

    await act(() => result.current(row, true))

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(previewTarget.opener).toBeNull()
    expect(fetchDocument).toHaveBeenCalledWith(row)
    expect(openDocumentPreview).toHaveBeenCalledWith(blob, 'server-name.pdf', previewTarget)
    expect(triggerBrowserDownload).not.toHaveBeenCalled()
  })

  it('downloads without a tab, falling back to the row name', async () => {
    const openSpy = vi.spyOn(window, 'open')
    const { result } = renderHook(() =>
      useDocumentOpener({
        recordKey: '777',
        fetchDocument: vi.fn().mockResolvedValue({ blob }),
        onError: vi.fn(),
      }),
    )

    await act(() => result.current(row, false))

    expect(openSpy).not.toHaveBeenCalled()
    expect(triggerBrowserDownload).toHaveBeenCalledWith(blob, 'permit.pdf')
  })

  it('closes the reserved tab and reports a failed read', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const previewTarget = reservedTab()
    vi.spyOn(window, 'open').mockReturnValue(previewTarget)
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useDocumentOpener({
        recordKey: '777',
        fetchDocument: vi.fn().mockRejectedValue(new Error('unavailable')),
        onError,
      }),
    )

    await act(() => result.current(row, true))
    await act(() => result.current(row, false))

    expect(previewTarget.close).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenNthCalledWith(1, 'Unable to open the selected document.')
    expect(onError).toHaveBeenNthCalledWith(2, 'Unable to download the selected document.')
    expect(consoleError).toHaveBeenCalledTimes(2)
  })

  it('drops a read that finishes after the record changes and closes its reserved tab', async () => {
    const previewTarget = reservedTab()
    vi.spyOn(window, 'open').mockReturnValue(previewTarget)
    let resolveRead!: (value: { blob: Blob }) => void
    const fetchDocument = vi.fn(
      () =>
        new Promise<{ blob: Blob }>((resolve) => {
          resolveRead = resolve
        }),
    )
    const onError = vi.fn()
    const { result, rerender } = renderHook(
      ({ recordKey }) => useDocumentOpener({ recordKey, fetchDocument, onError }),
      { initialProps: { recordKey: '777' } },
    )

    let pending!: Promise<void>
    act(() => {
      pending = result.current(row, true)
    })
    rerender({ recordKey: '778' })
    expect(previewTarget.close).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveRead({ blob })
      await pending
    })

    expect(openDocumentPreview).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})
