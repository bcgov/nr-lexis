import { StrictMode, type ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ThemeProvider from '@/context/theme/ThemeProvider'
import AppRoutes from '@/routes/AppRoutes'
import {
  createLoggedOutTestAuthContext,
  createTestAuthContext,
  createTestCapabilities,
} from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/pages/ProvincialOfferDetails', () => ({ default: () => <h1>Offer details</h1> }))
vi.mock('@/pages/ProvincialReview', () => ({ default: () => <h1>Application review</h1> }))
vi.mock('@/pages/Federal', () => ({ default: () => <h1>Federal search</h1> }))
vi.mock('@/pages/Forbidden', () => ({ default: () => <h1>Access denied</h1> }))
vi.mock('@/pages/Unauthorized', () => ({ default: () => <h1>No assigned role</h1> }))

const mockedUseAuth = vi.mocked(useAuth)
const destinationKey = 'lexis.login-destination'
const offerLink = '/provincial/offers/123?tab=details#offer-details'
const app = () => (
  <StrictMode>
    <ThemeProvider>
      <AppRoutes />
    </ThemeProvider>
  </StrictMode>
)

describe('Signed-out deep links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.config = {}
    window.sessionStorage.clear()
    mockedUseAuth.mockReturnValue(createLoggedOutTestAuthContext())
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it.each([
    ['Log in with IDIR', 'idir'],
    ['Log in with Business BCeID', 'business-bceid'],
  ])('preserves a valid offer link through %s and the OAuth callback', async (button, provider) => {
    const login = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue(createLoggedOutTestAuthContext({ login }))
    window.history.replaceState({}, '', offerLink)
    const view = render(app())

    expect(await screen.findByRole('button', { name: button })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '404' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Offer details' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: button }))
    expect(login).toHaveBeenCalledWith(provider)
    expect(window.sessionStorage.getItem(destinationKey)).toBe(offerLink)

    view.unmount()
    window.history.replaceState({}, '', '/dashboard')
    mockedUseAuth.mockReturnValue(createTestAuthContext())
    render(app())

    expect(await screen.findByRole('heading', { name: 'Offer details' })).toBeVisible()
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(offerLink)
    expect(window.sessionStorage.getItem(destinationKey)).toBeNull()
  })

  it('waits for organization selection before consuming the destination', async () => {
    window.sessionStorage.setItem(destinationKey, offerLink)
    window.history.replaceState({}, '', '/')
    const capabilities = createTestCapabilities({
      roles: ['PROVINCIAL_SUBMITTER'],
      availableForestClientNumbers: ['11111111', '22222222'],
      forestClientSelectionRequired: true,
    })
    mockedUseAuth.mockReturnValue(createTestAuthContext({ capabilities }))
    const view = render(app())

    expect(await screen.findByRole('heading', { name: 'Select organization' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Offer details' })).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem(destinationKey)).toBe(offerLink)

    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: {
          ...capabilities,
          forestClientNumber: '22222222',
          forestClientSelectionRequired: false,
        },
      }),
    )
    view.rerender(app())

    expect(await screen.findByRole('heading', { name: 'Offer details' })).toBeVisible()
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(offerLink)
    expect(window.sessionStorage.getItem(destinationKey)).toBeNull()
  })

  it('keeps the destination when login discovers an existing session without an OAuth redirect', async () => {
    window.history.replaceState({}, '', offerLink)
    const view = render(app())
    await userEvent.click(await screen.findByRole('button', { name: 'Log in with IDIR' }))
    expect(window.sessionStorage.getItem(destinationKey)).toBe(offerLink)

    mockedUseAuth.mockReturnValue(createTestAuthContext())
    view.rerender(app())

    expect(await screen.findByRole('heading', { name: 'Offer details' })).toBeVisible()
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(offerLink)
    expect(window.sessionStorage.getItem(destinationKey)).toBeNull()
  })

  it('still denies the resumed route when its actions are not granted', async () => {
    window.sessionStorage.setItem(destinationKey, offerLink)
    window.history.replaceState({}, '', '/')
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    render(app())

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Offer details' })).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem(destinationKey)).toBeNull()
  })

  it('keeps accounts without roles on the access page and discards the destination', async () => {
    window.sessionStorage.setItem(destinationKey, offerLink)
    window.history.replaceState({}, '', '/')
    mockedUseAuth.mockReturnValue(createTestAuthContext({ hasAnyRole: false }))
    render(app())

    expect(await screen.findByRole('heading', { name: 'No assigned role' })).toBeVisible()
    expect(window.sessionStorage.getItem(destinationKey)).toBeNull()
  })

  it.each(['/unknown', '/admin/schedules', '/indianReserve'])(
    'keeps unsupported path %s at 404',
    async (path) => {
      window.history.replaceState({}, '', path)
      render(app())

      expect(await screen.findByRole('heading', { name: '404' })).toBeVisible()
      expect(screen.queryByRole('button', { name: 'Log in with IDIR' })).not.toBeInTheDocument()
    },
  )

  it.each([
    'https://example.com/provincial/offers/123',
    '//example.com/provincial/offers/123',
    '/\\example.com/provincial/offers/123',
    '/%2fexample.com',
    '/unknown',
    '/logout',
    '/select-organization',
    '/admin/schedules',
  ])('discards unsupported stored destination %s', async (destination) => {
    window.sessionStorage.setItem(destinationKey, destination)
    window.history.replaceState({}, '', '/')
    mockedUseAuth.mockReturnValue(createTestAuthContext())
    render(app())

    expect(await screen.findByRole('heading', { name: 'Application review' })).toBeVisible()
    expect(window.location.pathname).toBe('/provincial/review')
    expect(window.sessionStorage.getItem(destinationKey)).toBeNull()
  })

  it('retains the retired federal upload redirect after login', async () => {
    window.sessionStorage.setItem(destinationKey, '/federal/application/upload')
    window.history.replaceState({}, '', '/')
    mockedUseAuth.mockReturnValue(createTestAuthContext())
    render(app())

    expect(await screen.findByRole('heading', { name: 'Federal search' })).toBeVisible()
    expect(window.location.pathname).toBe('/federal')
  })

  it('discards a pending destination when login initiation fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedUseAuth.mockReturnValue(
      createLoggedOutTestAuthContext({
        login: vi.fn().mockRejectedValue(new Error('login unavailable')),
      }),
    )
    window.history.replaceState({}, '', offerLink)
    render(app())
    await userEvent.click(await screen.findByRole('button', { name: 'Log in with IDIR' }))

    expect(await screen.findByText('Unable to start the login flow.')).toBeVisible()
    expect(window.sessionStorage.getItem(destinationKey)).toBeNull()
    errorSpy.mockRestore()
  })

  it('starts a fresh root login without reusing an abandoned destination', async () => {
    window.sessionStorage.setItem(destinationKey, offerLink)
    window.history.replaceState({}, '', '/')
    render(app())

    await userEvent.click(screen.getByRole('button', { name: 'Log in with IDIR' }))
    await waitFor(() => expect(window.sessionStorage.getItem(destinationKey)).toBeNull())
  })
})
