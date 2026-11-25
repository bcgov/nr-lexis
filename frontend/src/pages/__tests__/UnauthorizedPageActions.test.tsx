import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ThemeProvider from '@/context/theme/ThemeProvider'
import UnauthorizedPage from '@/pages/Unauthorized'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

const renderPage = () => {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/unauthorized']}>
        <Routes>
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('Unauthorized page actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    document.title = ''
  })

  it('renders the no-role state with the landing composition and signed-in identity', () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\norole',
          roles: [],
        }),
      }),
    )

    renderPage()

    expect(screen.getByRole('heading', { name: 'Access not granted' })).toBeInTheDocument()
    expect(screen.getByText(/idir\\norole/)).toBeInTheDocument()
    expect(screen.getByAltText('British Columbia forest landscape')).toBeInTheDocument()
    expect(document.querySelector('.app-shell')).not.toBeInTheDocument()
  })

  it('names the browser tab after the heading and restores the previous name on leave', () => {
    document.title = 'Provincial applications'
    mockedUseAuth.mockReturnValue(createTestAuthContext())

    const { unmount } = renderPage()

    expect(document.title).toBe('Access not granted')

    unmount()

    expect(document.title).toBe('Provincial applications')
  })

  it('calls logout', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue(createTestAuthContext({ logout }))

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(logout).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith()
    expect(screen.getByRole('heading', { name: 'Access not granted' })).toBeInTheDocument()
  })

  it('directs an account with both approver roles to its administrator without naming them', () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'IDIR\\staff',
          roles: [],
          accessDeniedReason: 'INCOMPATIBLE_APPROVER_ROLES',
        }),
      }),
    )

    renderPage()

    expect(
      screen.getByText(
        'You’re signed in as IDIR\\staff, but your account is not authorized to use LEXIS. Contact your administrator.',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/Approver/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeVisible()
  })
})
