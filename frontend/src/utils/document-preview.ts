import { triggerBrowserDownload } from './download'

const PREVIEW_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
])
const PREVIEW_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
}

export const openDocumentPreview = (
  blob: Blob,
  filename: string,
  previewTarget: Window | null,
): void => {
  if (previewTarget?.closed) return
  const mimeType = blob.type.split(';')[0].trim().toLowerCase()
  const inferredMimeType =
    !mimeType || mimeType === 'application/octet-stream'
      ? PREVIEW_MIME_BY_EXTENSION[filename.split('.').pop()?.toLowerCase() ?? '']
      : undefined
  const previewBlob = PREVIEW_MIME_TYPES.has(mimeType)
    ? blob
    : inferredMimeType && PREVIEW_MIME_TYPES.has(inferredMimeType)
      ? new Blob([blob], { type: inferredMimeType })
      : null

  if (!previewBlob || !previewTarget) {
    previewTarget?.close()
    triggerBrowserDownload(blob, filename)
    return
  }

  const objectUrl = URL.createObjectURL(previewBlob)
  try {
    previewTarget.location.replace(objectUrl)
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
  // Give the new tab time to load the blob before releasing its URL.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}
