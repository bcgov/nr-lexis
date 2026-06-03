import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'

describe('useDebouncedValue', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the initial value immediately', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useDebouncedValue('initial', 250))

    expect(result.current).toBe('initial')
  })

  it('updates only after the debounce delay', () => {
    vi.useFakeTimers()

    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'ab' })

    act(() => {
      vi.advanceTimersByTime(249)
    })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('ab')
  })

  it('emits only the latest value when updates arrive before the delay', () => {
    vi.useFakeTimers()

    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'ab' })
    act(() => {
      vi.advanceTimersByTime(100)
    })

    rerender({ value: 'abc' })
    act(() => {
      vi.advanceTimersByTime(250)
    })

    expect(result.current).toBe('abc')
  })
})
