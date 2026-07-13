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

    const navigation = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const parentLink = screen.getByRole('link', { name: 'Provincial application search' })

    expect(navigation).toContainElement(parentLink)
    expect(parentLink).toHaveAttribute('href', '/provincial/application')

    await userEvent.click(parentLink)
    expect(screen.getByTestId('location')).toHaveTextContent('/provincial/application')
  })
})
