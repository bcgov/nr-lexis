import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import Dashboard from '@/components/Dashboard'
import { useAuth } from '@/context/auth/useAuth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('Dashboard', () => {
  const mockedUseAuth = vi.mocked(useAuth)

  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)
  })

  test('renders a heading with the correct text', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )
    expect(screen.getByText(/LEXIS Dashboard/i)).toBeInTheDocument()
  })
})
