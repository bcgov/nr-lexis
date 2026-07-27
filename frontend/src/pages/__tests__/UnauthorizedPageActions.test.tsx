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
  render(
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

  it('calls logout', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue(createTestAuthContext({ logout }))

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(logout).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith()
    expect(screen.getByRole('heading', { name: 'Access not granted' })).toBeInTheDocument()
  })
})
