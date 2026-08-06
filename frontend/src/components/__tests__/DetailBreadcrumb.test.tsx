import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import DetailBreadcrumb from '@/components/DetailBreadcrumb'

const LocationDisplay = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

describe('DetailBreadcrumb', () => {
  it('renders canonical parent navigation with normal link semantics', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?status=ACT']}>
        <DetailBreadcrumb label="Provincial application search" to="/provincial/application" />
        <Routes>
          <Route path="/provincial/application" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>,
    )

    const parentLink = screen.getByRole('link', {
      name: 'Back to Provincial application search',
    })

    expect(parentLink).toHaveClass('back-link')
    expect(parentLink).toHaveAttribute('href', '/provincial/application')
    expect(parentLink.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    await userEvent.click(parentLink)
    expect(screen.getByTestId('location')).toHaveTextContent('/provincial/application')
  })
})
