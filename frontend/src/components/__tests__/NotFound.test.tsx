import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotFound from '@/components/NotFound'

describe('NotFound', () => {
  test('renders a heading with the correct text', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    )
    const headingElement = screen.getByRole('heading', { name: /404/i })
    expect(headingElement).toBeInTheDocument()
  })
})
