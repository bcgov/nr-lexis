import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'

describe('useLatestRequestGuard', () => {
  it('only treats the most recently started request as latest', () => {
    const { result } = renderHook(() => useLatestRequestGuard())

    const isFirstRequestLatest = result.current()
    const isSecondRequestLatest = result.current()

    expect(isFirstRequestLatest()).toBe(false)
    expect(isSecondRequestLatest()).toBe(true)
  })

  it('invalidates active requests when the component unmounts', () => {
    const { result, unmount } = renderHook(() => useLatestRequestGuard())

    const isRequestLatest = result.current()
    expect(isRequestLatest()).toBe(true)

    unmount()

    expect(isRequestLatest()).toBe(false)
  })
})
