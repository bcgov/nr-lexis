import { beforeEach, describe, expect, it } from 'vitest'
import {
  automaticLoginProvider,
  forgetLoginProvider,
  markAutomaticLoginAttempted,
  rememberCompletedLoginProvider,
  setPendingLoginProvider,
} from '@/context/auth/login-provider'

const lastProviderKey = 'lexis.last-login-provider'

describe('login provider memory', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem(lastProviderKey)
  })

  it('offers no automatic sign-in before any sign-in has completed', () => {
    setPendingLoginProvider('idir')

    expect(automaticLoginProvider()).toBeNull()
    expect(window.localStorage.getItem(lastProviderKey)).toBeNull()
  })

  it.each(['idir', 'business-bceid'] as const)(
    'offers %s to other tabs once its sign-in completes',
    (provider) => {
      setPendingLoginProvider(provider)
      rememberCompletedLoginProvider()

      expect(window.localStorage.getItem(lastProviderKey)).toBe(provider)
      // Another tab shares local storage but starts with its own empty session storage.
      window.sessionStorage.clear()
      expect(automaticLoginProvider()).toBe(provider)
    },
  )

  it('tries the automatic sign-in once per tab until a sign-in completes there', () => {
    window.localStorage.setItem(lastProviderKey, 'idir')
    markAutomaticLoginAttempted()

    expect(automaticLoginProvider()).toBeNull()

    setPendingLoginProvider('idir')
    rememberCompletedLoginProvider()
    expect(automaticLoginProvider()).toBe('idir')
  })

  it('forgets the provider for every tab', () => {
    setPendingLoginProvider('business-bceid')
    rememberCompletedLoginProvider()
    forgetLoginProvider()

    expect(window.localStorage.getItem(lastProviderKey)).toBeNull()
    expect(automaticLoginProvider()).toBeNull()
  })

  it('ignores a stored value that is not a provider', () => {
    window.localStorage.setItem(lastProviderKey, 'https://example.test')

    expect(automaticLoginProvider()).toBeNull()
  })
})
