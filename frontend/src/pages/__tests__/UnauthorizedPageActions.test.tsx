import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import UnauthorizedPage from '@/pages/Unauthorized'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

const renderPage = () => {
  render(
    <MemoryRouter initialEntries={['/unauthorized']}>
      <Routes>
        <Route path="/" element={<div>landing-page</div>} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Unauthorized page actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates back to landing page', async () => {
    mockedUseAuth.mockReturnValue({
      logout: vi.fn().mockResolvedValue(undefined),
    } as any)

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Back to Landing' }))

    expect(await screen.findByText('landing-page')).toBeInTheDocument()
  })

  it('calls logout and navigates to landing page', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue({
      logout,
    } as any)

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Log Out' }))

    expect(logout).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('landing-page')).toBeInTheDocument()
  })
})
