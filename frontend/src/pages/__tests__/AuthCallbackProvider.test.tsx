import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthCallback from '@/pages/AuthCallback'
import { completeOidcLogin } from '@/service/oidc-service'

vi.mock('@/service/oidc-service', () => ({ completeOidcLogin: vi.fn() }))

const mockedCompleteOidcLogin = vi.mocked(completeOidcLogin)
const lastProviderKey = 'lexis.last-login-provider'
const pendingProviderKey = 'lexis.pending-login-provider'

describe('AuthCallback login provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    window.localStorage.removeItem(lastProviderKey)
    // jsdom has no navigation, so the callback's reload is a no-op here.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('remembers the provider of a completed sign-in for other tabs', async () => {
    window.sessionStorage.setItem(pendingProviderKey, 'business-bceid')
    mockedCompleteOidcLogin.mockResolvedValue({} as Awaited<ReturnType<typeof completeOidcLogin>>)

    render(<AuthCallback />)

    await waitFor(() => expect(window.localStorage.getItem(lastProviderKey)).toBe('business-bceid'))
    expect(window.sessionStorage.getItem(pendingProviderKey)).toBeNull()
  })

  it('remembers nothing when the sign-in fails', async () => {
    window.sessionStorage.setItem(pendingProviderKey, 'idir')
    mockedCompleteOidcLogin.mockRejectedValue(new Error('state mismatch'))

    render(<AuthCallback />)

    await waitFor(() => expect(mockedCompleteOidcLogin).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(window.localStorage.getItem(lastProviderKey)).toBeNull()
  })
})
