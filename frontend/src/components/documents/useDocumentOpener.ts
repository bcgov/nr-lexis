import { useCallback, useEffect, useRef } from 'react'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import type { DocumentRowBase } from '@/service/document-service-utils'
import { openDocumentPreview } from '@/utils/document-preview'
import { triggerBrowserDownload } from '@/utils/download'

type OpenedDocument = {
  blob: Blob
  filename?: string
}

type UseDocumentOpenerOptions<Row extends DocumentRowBase> = {
  /** The record that owns the documents. Changing it closes reserved tabs and drops late reads. */
  recordKey: string | undefined
  fetchDocument: (row: Row) => Promise<OpenedDocument>
  /** Runs before each read, so the host can clear an earlier result. */
  onStart?: () => void
  onError: (message: string) => void
}

/** Opens a document in a new tab, or downloads it, for one record's Documents tab. */
export const useDocumentOpener = <Row extends DocumentRowBase>({
  recordKey,
  fetchDocument,
  onStart,
  onError,
}: UseDocumentOpenerOptions<Row>) => {
  const beginRecordRequest = useLatestRequestGuard()
  const isCurrentRecordRef = useRef<() => boolean>(() => false)
  const pendingPreviewsRef = useRef(new Set<Window>())

  useEffect(() => {
    isCurrentRecordRef.current = beginRecordRequest()
    const pendingPreviews = pendingPreviewsRef.current
    return () => {
      beginRecordRequest()
      pendingPreviews.forEach((previewTarget) => previewTarget.close())
      pendingPreviews.clear()
    }
  }, [beginRecordRequest, recordKey])

  return useCallback(
    async (row: Row, preview: boolean) => {
      const isCurrentRecord = isCurrentRecordRef.current
      let previewTarget: Window | null = null
      const closePendingPreview = () => {
        if (previewTarget && pendingPreviewsRef.current.delete(previewTarget)) {
          previewTarget.close()
        }
      }
      onStart?.()
      try {
        if (preview) {
          // Reserve the tab during the click, before the authenticated document request.
          previewTarget = window.open('about:blank', '_blank')
          if (previewTarget) {
            pendingPreviewsRef.current.add(previewTarget)
            previewTarget.opener = null
          }
        }
        const result = await fetchDocument(row)
        if (!isCurrentRecord()) {
          closePendingPreview()
          return
        }
        const filename = result.filename || row.name
        if (preview) {
          openDocumentPreview(result.blob, filename, previewTarget)
        } else {
          triggerBrowserDownload(result.blob, filename)
        }
      } catch (error) {
        closePendingPreview()
        if (!isCurrentRecord()) return
        console.error(error)
        onError(
          preview
            ? 'Unable to open the selected document.'
            : 'Unable to download the selected document.',
        )
      } finally {
        if (previewTarget) pendingPreviewsRef.current.delete(previewTarget)
      }
    },
    [fetchDocument, onError, onStart],
  )
}
