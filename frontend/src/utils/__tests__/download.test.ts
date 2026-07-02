import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openBlobInNewTab } from '@/utils/download'

const WINDOW_FEATURES = 'height=900,width=1280,menubar=0,resizable=1,status=1,scrollbars=1'

describe('download utilities', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('revokes blob URLs immediately when a popup is blocked', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    expect(openBlobInNewTab(new Blob(['test']), 'reportWindow')).toBe(false)

    expect(openSpy).toHaveBeenCalledWith('blob:test', 'reportWindow', WINDOW_FEATURES)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('keeps blob URLs available briefly when a new tab opens', () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockReturnValue({} as Window)

    expect(openBlobInNewTab(new Blob(['test']), 'reportWindow')).toBe(true)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    vi.advanceTimersByTime(60_000)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
