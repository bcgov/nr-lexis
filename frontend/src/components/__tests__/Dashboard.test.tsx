import { render, screen } from '@testing-library/react'
import Dashboard from '@/components/Dashboard'

describe('Dashboard', () => {
  test('renders a heading with the correct text', () => {
    render(<Dashboard />)
    expect(screen.getByText(/Employee ID/i)).toBeInTheDocument()
  })
})
