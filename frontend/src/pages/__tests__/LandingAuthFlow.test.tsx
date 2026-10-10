import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import {
  clearSessionExpiredLoginNotice,
  markSessionExpiredLoginNotice,
} from '@/context/auth/session-expiry'
import ThemeProvider from '@/context/theme/ThemeProvider'
import LandingPage from '@/pages/Landing'
import {
  createLoggedOutTestAuthContext,
  createTestAuthContext,
  createTestCapabilities,
} from '@/test-utils/auth'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

const renderPage = () => {
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('Landing auth flow smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    clearSessionExpiredLoginNotice()

    mockedUseAuth.mockReturnValue(
      createLoggedOutTestAuthContext({
        defaultRoute: '/provincial/application',
      }),
    )
  })

  it('runs IDIR login action from the landing entry button', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue(
      createLoggedOutTestAuthContext({
        defaultRoute: '/provincial/application',
        login,
      }),
    )

    renderPage()

    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByRole('heading', { level: 1, name: 'LEXIS' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Log Exemption Information System' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByText('Manage provincial log applications for exemptions, offers and permits.'),
    ).toBeInTheDocument()
    const supportingImage = document.querySelector<HTMLImageElement>('.landing-img')
    expect(supportingImage).toHaveAttribute('alt', '')
    expect(supportingImage).toHaveAttribute('aria-hidden', 'true')

    const loginButton = screen.getByRole('button', { name: 'Log in with IDIR' })
    expect(loginButton).toHaveClass('cds--layout--size-lg', 'cds--btn--expressive')
    expect(screen.getByRole('button', { name: 'Log in with Business BCeID' })).toHaveClass(
      'cds--layout--size-lg',
      'cds--btn--expressive',
    )
    await userEvent.click(loginButton)

    expect(login).toHaveBeenCalledWith('idir')
    expect(
      screen.queryByRole('button', { name: 'Continue to Application' }),
    ).not.toBeInTheDocument()
  })

  it('explains how to request access in a passive dialog', async () => {
    renderPage()

    const requestAccess = screen.getByRole('button', { name: 'Request access to LEXIS' })
    expect(requestAccess).toHaveClass('cds--link')
    expect(requestAccess).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.getByText('An active Business BCeID account is required.')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'Request access to LEXIS' })
    const modal = dialog.closest('.cds--modal')
    expect(modal).not.toHaveClass('is-visible')

    await userEvent.click(requestAccess)

    expect(modal).toHaveClass('is-visible')
    expect(within(dialog).queryByRole('button', { name: /submit|ok|cancel/i })).toBeNull()
    expect(
      within(dialog)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Where to send your request', 'What to include'])
    expect(
      within(dialog).getByText(
        'Email the export office for the region where the logs are harvested:',
      ),
    ).toBeInTheDocument()

    const [officeList, detailsList] = within(dialog).getAllByRole('list')
    expect(
      within(officeList)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Coast: Provincial.Log.Export.Analyst@gov.bc.ca',
      'North: NorthAreaExportScaling@gov.bc.ca',
      'South: Export.Applications@gov.bc.ca',
    ])
    expect(
      within(officeList)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      'mailto:Provincial.Log.Export.Analyst@gov.bc.ca',
      'mailto:NorthAreaExportScaling@gov.bc.ca',
      'mailto:Export.Applications@gov.bc.ca',
    ])
    expect(
      within(detailsList)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Name',
      'Email address',
      'Phone number',
      'Business BCeID username',
      'Company you represent as an employee or agent (include authorization)',
      'Ministry of Forests client number',
    ])
    await waitFor(() =>
      expect(
        within(dialog).getByRole('link', { name: 'Provincial.Log.Export.Analyst@gov.bc.ca' }),
      ).toHaveFocus(),
    )

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(modal).not.toHaveClass('is-visible')
    await waitFor(() => expect(requestAccess).toHaveFocus())
  })

  it('does not show a signed-out notice on the default login page', () => {
    renderPage()

    expect(screen.queryByText("You've been logged out")).not.toBeInTheDocument()
  })

  it('applies the saved dark theme and uses the reverse logo before login', () => {
    window.localStorage.setItem('lexis.ui.theme', 'g100')

    renderPage()

    expect(document.documentElement).toHaveAttribute('data-carbon-theme', 'g100')
    expect(
      screen
        .getByRole('img', { name: 'Government of British Columbia' })
        .querySelector('image')
        ?.getAttribute('href'),
    ).toContain('gov-bc-logo-horiz')
  })

  it('shows a dismissible signed-out notice after an automatic session expiry', async () => {
    markSessionExpiredLoginNotice()

    renderPage()

    expect(screen.getByText("You've been logged out")).toBeInTheDocument()
    expect(
      screen.getByText(
        'Your session expired for security reasons and any unsaved changes were lost. Log in again to continue.',
      ),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /close notification/i }))
    expect(screen.queryByText("You've been logged out")).not.toBeInTheDocument()
  })

  it('runs Business BCeID login action from the landing entry button', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue(
      createLoggedOutTestAuthContext({
        defaultRoute: '/provincial/application',
        login,
      }),
    )

    renderPage()

    const loginButton = screen.getByRole('button', { name: 'Log in with Business BCeID' })
    expect(loginButton).toHaveClass('cds--btn--tertiary')
    await userEvent.click(loginButton)

    expect(login).toHaveBeenCalledWith('business-bceid')
  })

  it('redirects logged in users to the default route without exposing session details', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    const refresh = vi.fn().mockResolvedValue(undefined)

    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          authenticated: true,
          principal: 'idir\\analyst',
          roles: ['PROVINCIAL_SUBMITTER_00012345'],
          welcomeTarget: '/applicationSearch',
          legacyPath: null,
          grantedActions: ['/applicationSearch'],
        }),
        defaultRoute: '/provincial/application',
        isLoggedIn: true,
        hasAnyRole: true,
        login,
        refresh,
        canPerform: vi.fn().mockReturnValue(true),
      }),
    )

    renderPage()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/provincial/application', { replace: true })
    })

    expect(screen.queryByText('idir\\analyst')).not.toBeInTheDocument()
    expect(screen.queryByText('PROVINCIAL_SUBMITTER_00012345')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh Session' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Continue to Application' }),
    ).not.toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('surfaces inline error when login initiation fails', async () => {
    mockedUseAuth.mockReturnValue(
      createLoggedOutTestAuthContext({
        defaultRoute: '/provincial/application',
        login: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    )

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Log in with IDIR' }))

    await waitFor(() => {
      expect(screen.getByText('Session error')).toBeInTheDocument()
      expect(screen.getByText('Unable to start the login flow.')).toBeInTheDocument()
    })
  })
})
