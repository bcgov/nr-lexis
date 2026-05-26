import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '@/components/Dashboard'

describe('Dashboard', () => {
  test('renders a heading with the correct text', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )
    expect(screen.getByText(/LEXIS Dashboard/i)).toBeInTheDocument()
  })
})
