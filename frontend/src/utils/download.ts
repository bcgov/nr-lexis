const DEFAULT_REPORT_WINDOW_FEATURES =
  'height=900,width=1280,menubar=0,resizable=1,status=1,scrollbars=1'

export const triggerBrowserDownload = (blob: Blob, filename: string): void => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export const openBlobInNewTab = (
  blob: Blob,
  windowName: string,
  windowFeatures = DEFAULT_REPORT_WINDOW_FEATURES,
): boolean => {
  const objectUrl = URL.createObjectURL(blob)
  const openedWindow = window.open(objectUrl, windowName, windowFeatures)

  if (!openedWindow) {
    URL.revokeObjectURL(objectUrl)
    return false
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  return true
}
