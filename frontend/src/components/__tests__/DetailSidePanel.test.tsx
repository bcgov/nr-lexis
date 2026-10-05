import { fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, vi } from 'vitest'

import DetailSidePanel from '@/components/DetailSidePanel'

const RemarkPanel = ({ onClose }: { onClose: () => void }) => {
  const launcherRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="detail-page">
      <button ref={launcherRef} type="button">
        Add remark
      </button>
      <DetailSidePanel
        open
        title="Add remark"
        contentSelector=".detail-page"
        initialFocusSelector="#remark"
        launcherRef={launcherRef}
        fallbackFocusSelector=".detail-page button"
        actions={[]}
        onClose={onClose}
      >
        <textarea id="remark" aria-label="Remark" />
      </DetailSidePanel>
    </div>
  )
}

describe('DetailSidePanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ignores an overlay Escape that a dialog above the panel already handled', () => {
    const onClose = vi.fn()
    render(<RemarkPanel onClose={onClose} />)
    // Carbon's Modal closes on a document Escape and marks it handled.
    const closeDialog = (event: KeyboardEvent) => event.preventDefault()
    document.addEventListener('keydown', closeDialog)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    document.removeEventListener('keydown', closeDialog)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
