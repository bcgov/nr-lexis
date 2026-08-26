import type { APIResponse, Page } from '@playwright/test'
import { describe, expect, it, vi } from 'vitest'
import { getWithAuth } from '../../../e2e/utils/regression-auth'

const pageWithGet = (get: ReturnType<typeof vi.fn>) => {
  const waitForTimeout = vi.fn().mockResolvedValue(undefined)
  const page = {
    context: () => ({ cookies: vi.fn().mockResolvedValue([]) }),
    evaluate: vi.fn().mockResolvedValue({
      cookieCandidateCount: 0,
      storageCandidateCount: 0,
    }),
    request: { get },
    waitForTimeout,
  } as unknown as Page

  return { page, waitForTimeout }
}

describe('getWithAuth', () => {
  it('retries a transient transport failure before returning the response', async () => {
    const response = {} as APIResponse
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('apiRequestContext.get: connect ETIMEDOUT'))
      .mockResolvedValue(response)
    const { page, waitForTimeout } = pageWithGet(get)

    await expect(getWithAuth(page, '/api/lexis/shipping-reference-options')).resolves.toBe(response)
    expect(get).toHaveBeenCalledTimes(2)
    expect(waitForTimeout).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-transport failure', async () => {
    const error = new Error('request payload could not be serialized')
    const get = vi.fn().mockRejectedValue(error)
    const { page, waitForTimeout } = pageWithGet(get)

    await expect(getWithAuth(page, '/api/lexis/shipping-reference-options')).rejects.toBe(error)
    expect(get).toHaveBeenCalledTimes(1)
    expect(waitForTimeout).not.toHaveBeenCalled()
  })

  it('preserves the final transient error after three attempts', async () => {
    const finalError = new Error('apiRequestContext.get: connect ETIMEDOUT final')
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('apiRequestContext.get: connect ETIMEDOUT first'))
      .mockRejectedValueOnce(new Error('apiRequestContext.get: connect ETIMEDOUT second'))
      .mockRejectedValueOnce(finalError)
    const { page, waitForTimeout } = pageWithGet(get)

    await expect(getWithAuth(page, '/api/lexis/shipping-reference-options')).rejects.toBe(
      finalError,
    )
    expect(get).toHaveBeenCalledTimes(3)
    expect(waitForTimeout).toHaveBeenCalledTimes(2)
  })
})
