import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { triggerBrowserDownload } from '@/utils/download'

describe('download utilities', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('downloads a blob with the supplied filename', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const report = new Blob(['report'], { type: 'application/pdf' })

    triggerBrowserDownload(report, 'advertising-list.pdf')

    const clickedAnchor = clickSpy.mock.instances[0] as HTMLAnchorElement
    expect(URL.createObjectURL).toHaveBeenCalledWith(report)
    expect(clickedAnchor.href).toBe('blob:report')
    expect(clickedAnchor.download).toBe('advertising-list.pdf')
    expect(clickedAnchor.isConnected).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report')
  })
})
