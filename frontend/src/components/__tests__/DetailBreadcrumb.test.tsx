import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import { readDetailReturnTo } from '@/pages/shared/detail-navigation'

const LocationDisplay = () => {
  const location = useLocation()
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
      <span data-testid="location-state">{JSON.stringify(location.state ?? null)}</span>
    </div>
  )
}

const ApplicationDetailDisplay = () => {
  const location = useLocation()
  return (
    <>
      <DetailBreadcrumb
        label="Provincial application search"
        to="/provincial/application"
        returnTo={readDetailReturnTo(location.state)}
      />
      <LocationDisplay />
    </>
  )
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

  it('prefers the originating list and preserves its exact query', () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-1']}>
        <DetailBreadcrumb
          label="Provincial exemption search"
          to="/provincial/exemption"
          returnTo={{
            label: 'Federal application search',
            to: '/federal?applicationStatus=APP&sortField=receivedDate&page=3&pageSize=25',
          }}
        />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('link', { name: 'Back to Federal application search' }),
    ).toHaveAttribute(
      'href',
      '/federal?applicationStatus=APP&sortField=receivedDate&page=3&pageSize=25',
    )
  })

  it('renders a Carbon breadcrumb for nested detail navigation', async () => {
    const summaryState = {
      returnTo: {
        label: 'My Applications',
        to: '/provincial/summary?page=2&pageSize=25',
      },
    }
    const applicationReturnTo = {
      label: 'Application 321',
      to: '/provincial/application/321?tab=offers',
      state: summaryState,
    }

    render(
      <MemoryRouter initialEntries={['/provincial/offers/81001']}>
        <Routes>
          <Route
            path="/provincial/offers/81001"
            element={
              <DetailBreadcrumb
                label="Provincial offer detail"
                to="/provincial/offers"
                returnTo={applicationReturnTo}
              />
            }
          />
          <Route path="/provincial/application/321" element={<ApplicationDetailDisplay />} />
          <Route path="/provincial/summary" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>,
    )

    const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(within(breadcrumb).getByRole('link', { name: 'My Applications' })).toHaveAttribute(
      'href',
      '/provincial/summary?page=2&pageSize=25',
    )
    const applicationLink = within(breadcrumb).getByRole('link', { name: 'Application 321' })
    expect(applicationLink).toHaveAttribute('href', '/provincial/application/321?tab=offers')

    await userEvent.click(applicationLink)
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/provincial/application/321?tab=offers',
    )
    expect(screen.getByTestId('location-state')).toHaveTextContent(JSON.stringify(summaryState))

    const summaryLink = screen.getByRole('link', { name: 'Back to My Applications' })
    await userEvent.click(summaryLink)
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/provincial/summary?page=2&pageSize=25',
    )
  })

  it('keeps a single-item trail as the accessible Back link', () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <DetailBreadcrumb label="Provincial application search" to="/provincial/application" />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('link', { name: 'Back to Provincial application search' }),
    ).toBeVisible()
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).not.toBeInTheDocument()
  })

  it('omits the current page and repeated routes from related-detail cycles', () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?tab=offers']}>
        <DetailBreadcrumb
          label="Provincial application search"
          to="/provincial/application"
          returnTo={{
            label: 'Offer 81001',
            to: '/provincial/offers/81001',
            state: {
              returnTo: {
                label: 'Application 321',
                to: '/provincial/application/321?tab=items',
                state: {
                  returnTo: {
                    label: 'My Applications',
                    to: '/provincial/summary?page=2',
                  },
                },
              },
            },
          }}
        />
      </MemoryRouter>,
    )

    const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(within(breadcrumb).getByRole('link', { name: 'My Applications' })).toBeVisible()
    expect(within(breadcrumb).getByRole('link', { name: 'Offer 81001' })).toBeVisible()
    expect(
      within(breadcrumb).queryByRole('link', { name: 'Application 321' }),
    ).not.toBeInTheDocument()
  })
})
