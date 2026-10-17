import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  clearPersistedSearchState,
  resetPersistedRegionSearchState,
  usePersistedSearchParams,
} from '@/pages/shared/usePersistedSearchParams'

const SearchStateProbe = () => {
  const location = useLocation()
  const [searchParams, setSearchParams] = usePersistedSearchParams('provincial-applications')

  return (
    <>
      <output data-testid="hook-search">{searchParams.toString()}</output>
      <output data-testid="location-search">{location.search}</output>
      <button type="button" onClick={() => setSearchParams(new URLSearchParams())}>
        Clear query
      </button>
      <button type="button" onClick={resetPersistedRegionSearchState}>
        Apply default zone
      </button>
    </>
  )
}

const renderProbe = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SearchStateProbe />
    </MemoryRouter>,
  )

describe('usePersistedSearchParams', () => {
  it('opens a search without a query in its initial state, even after an earlier search', async () => {
    const firstRender = renderProbe('/provincial/application?status=NEW&page=2')
    await waitFor(() => {
      expect(screen.getByTestId('hook-search')).toHaveTextContent('status=NEW&page=2')
    })
    firstRender.unmount()

    renderProbe('/provincial/application')

    expect(screen.getByTestId('hook-search')).toBeEmptyDOMElement()
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
    })
  })

  it('returns to the applied search through browser history', async () => {
    const router = createMemoryRouter(
      [
        { path: '/provincial/application', element: <SearchStateProbe /> },
        { path: '/provincial/application/:applicationNumber', element: <h1>Application</h1> },
      ],
      {
        initialEntries: ['/provincial/application?status=NEW&page=2', '/provincial/application/1'],
        initialIndex: 1,
      },
    )
    render(<RouterProvider router={router} />)

    await router.navigate(-1)

    expect(await screen.findByTestId('hook-search')).toHaveTextContent('status=NEW&page=2')
  })

  it('clears the query when the applied search is cleared', async () => {
    renderProbe('/provincial/application?status=NEW')
    await waitFor(() => {
      expect(screen.getByTestId('hook-search')).toHaveTextContent('status=NEW')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear query' }))

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
    })
  })

  it('clears only LEXIS search state at an authentication boundary', () => {
    window.sessionStorage.setItem('lexis.search-state.v1.provincial-applications', 'status=NEW')
    window.sessionStorage.setItem('unrelated', 'keep')

    clearPersistedSearchState()

    expect(
      window.sessionStorage.getItem('lexis.search-state.v1.provincial-applications'),
    ).toBeNull()
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep')
  })

  it('drops the region filter from the open search when the default zone changes', async () => {
    renderProbe('/provincial/application?status=NEW&region=1903%2C1904&page=2')

    fireEvent.click(screen.getByRole('button', { name: 'Apply default zone' }))

    await waitFor(() => {
      expect(screen.getByTestId('hook-search')).toHaveTextContent('status=NEW&page=2')
      expect(screen.getByTestId('hook-search')).not.toHaveTextContent('region=')
    })
  })
})
