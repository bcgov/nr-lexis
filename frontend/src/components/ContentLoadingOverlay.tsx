import { InlineLoading } from '@carbon/react'
import { createPortal } from 'react-dom'

export type ContentLoadingOverlayProps = {
  loading: boolean
  loadingDescription: string
}

function ContentLoadingOverlay({ loading, loadingDescription }: ContentLoadingOverlayProps) {
  if (!loading || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="content-loading-overlay__indicator" role="status" aria-live="polite">
      <InlineLoading description={loadingDescription} />
    </div>,
    document.body,
  )
}

export default ContentLoadingOverlay
