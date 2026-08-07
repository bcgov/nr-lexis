import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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
  it('restores the last applied search when its page is mounted without a query', async () => {
    const firstRender = renderProbe('/provincial/application?status=NEW&page=2')

    await waitFor(() => {
      expect(screen.getByTestId('hook-search')).toHaveTextContent('status=NEW&page=2')
    })
    firstRender.unmount()

    renderProbe('/provincial/application')

    expect(screen.getByTestId('hook-search')).toHaveTextContent('status=NEW&page=2')
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent('?status=NEW&page=2')
    })
  })

  it('does not invent search state for a fresh page visit', () => {
    renderProbe('/provincial/application')

    expect(screen.getByTestId('hook-search')).toBeEmptyDOMElement()
    expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
  })

  it('removes saved state when the applied query is cleared', async () => {
    const firstRender = renderProbe('/provincial/application?status=NEW')
    await waitFor(() => {
      expect(screen.getByTestId('hook-search')).toHaveTextContent('status=NEW')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear query' }))
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
    })
    firstRender.unmount()

    renderProbe('/provincial/application')
    expect(screen.getByTestId('hook-search')).toBeEmptyDOMElement()
  })

  it('clears only LEXIS search state at an authentication boundary', async () => {
    renderProbe('/provincial/application?status=NEW')
    await waitFor(() => {
      expect(screen.getByTestId('hook-search')).toHaveTextContent('status=NEW')
    })
    window.sessionStorage.setItem('unrelated', 'keep')

    clearPersistedSearchState()

    const rerendered = renderProbe('/provincial/application')
    expect(screen.getAllByTestId('hook-search').at(-1)).toBeEmptyDOMElement()
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep')
    rerendered.unmount()
  })

  it('resets only provincial region filters when the default zone changes', async () => {
    window.sessionStorage.setItem(
      'lexis.search-state.v1.provincial-review',
      'status=SUBMITTED&region=1903%2C1904&page=3',
    )
    window.sessionStorage.setItem(
      'lexis.search-state.v1.federal-applications',
      'region=1903&page=4',
    )
    renderProbe('/provincial/application?status=NEW&region=1903%2C1904&page=2')

    fireEvent.click(screen.getByRole('button', { name: 'Apply default zone' }))

    await waitFor(() => {
      expect(screen.getByTestId('hook-search')).toHaveTextContent('status=NEW&page=2')
      expect(screen.getByTestId('hook-search')).not.toHaveTextContent('region=')
    })
    expect(window.sessionStorage.getItem('lexis.search-state.v1.provincial-review')).toBe(
      'status=SUBMITTED&page=3',
    )
    expect(window.sessionStorage.getItem('lexis.search-state.v1.federal-applications')).toBe(
      'region=1903&page=4',
    )
  })
})
