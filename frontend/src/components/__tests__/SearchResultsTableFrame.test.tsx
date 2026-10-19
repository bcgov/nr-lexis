import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@carbon/react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Pagination from '@/components/Pagination'
import { formatDeferredSearchTotalLabel } from '@/pages/shared/deferred-search-total'
import SearchResultsTableFrame from '../SearchResultsTableFrame'

const SortableResults = ({ page = 1, rows = 1 }: { page?: number; rows?: number }) => (
  <>
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Application</TableHeader>
          <TableHeader isSortable isSortHeader sortDirection="DESC" onClick={() => undefined}>
            List date
          </TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: rows }, (_, index) => (
          <TableRow key={index}>
            <TableCell>{`Row ${index + 1}`}</TableCell>
            <TableCell>2026-01-10</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    <Pagination
      page={page}
      pageSize={10}
      pageSizes={[10, 25]}
      totalItems={20}
      onChange={() => undefined}
    />
  </>
)

const resultsFrame = (loading: boolean, results = <SortableResults />) => (
  <>
    <input aria-label="Filter" />
    <SearchResultsTableFrame loading={loading} loadingDescription="Searching">
      {results}
    </SearchResultsTableFrame>
  </>
)

// Moves focus to a control and runs a load that removes it, as a search does.
const focusThenLoad = (
  rerender: (ui: React.ReactElement) => void,
  control: HTMLElement,
  results = <SortableResults />,
) => {
  act(() => control.focus())
  expect(control).toHaveFocus()
  rerender(resultsFrame(true, results))
  expect(document.body).toHaveFocus()
}

describe('SearchResultsTableFrame', () => {
  it.each([
    [1, '1 application found'],
    [7, '7 applications found'],
  ])('names the searched object for an exact count of %s', (totalItems, expected) => {
    render(
      <SearchResultsTableFrame
        loading={false}
        loadingDescription="Loading applications…"
        totalItems={totalItems}
        resultName="application"
      >
        <table />
      </SearchResultsTableFrame>,
    )
    expect(screen.getByText(expected)).toBeVisible()
  })
  it('replaces stale rows with a labelled table skeleton while loading', () => {
    const { container } = render(
      <SearchResultsTableFrame loading loadingDescription="Loading search results…">
        <table>
          <tbody>
            <tr>
              <td>Existing rows</td>
            </tr>
          </tbody>
        </table>
      </SearchResultsTableFrame>,
    )

    expect(container.firstElementChild).not.toHaveAttribute('aria-busy')
    expect(screen.getByRole('region', { name: 'Search results table' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getByText('Loading search results…')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Loading search results…' })).toBeInTheDocument()
    expect(screen.queryByText('Existing rows')).not.toBeInTheDocument()
  })

  it('returns focus to the sort header once the results reload', async () => {
    const { rerender } = render(resultsFrame(false))
    focusThenLoad(rerender, screen.getByRole('button', { name: /List date/ }))

    rerender(resultsFrame(false))

    await waitFor(() => expect(screen.getByRole('button', { name: /List date/ })).toHaveFocus())
  })

  it.each([
    ['Next page', { page: 1 }],
    ['Previous page', { page: 2 }],
  ])('returns focus to the %s button once the results reload', async (name, { page }) => {
    const { rerender } = render(resultsFrame(false, <SortableResults page={page} />))
    focusThenLoad(rerender, screen.getByRole('button', { name }), <SortableResults page={page} />)

    rerender(resultsFrame(false, <SortableResults page={page} />))

    await waitFor(() => expect(screen.getByRole('button', { name })).toHaveFocus())
  })

  it.each([['Items per page:'], ['Page of 2 pages']])(
    'returns focus to the %s select once the results reload',
    async (name) => {
      const { rerender } = render(resultsFrame(false))
      focusThenLoad(rerender, screen.getByRole('combobox', { name }))

      rerender(resultsFrame(false))

      await waitFor(() => expect(screen.getByRole('combobox', { name })).toHaveFocus())
    },
  )

  it('moves focus to Previous page when Next page is disabled on the last page', async () => {
    const { rerender } = render(resultsFrame(false))
    focusThenLoad(rerender, screen.getByRole('button', { name: 'Next page' }))

    rerender(resultsFrame(false, <SortableResults page={2} />))

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Previous page' })).toHaveFocus())
  })

  it('moves focus to the results when the controls it held are gone', async () => {
    const { container, rerender } = render(resultsFrame(false))
    focusThenLoad(rerender, screen.getByRole('button', { name: 'Next page' }))

    rerender(resultsFrame(false, <p>No results found</p>))

    await waitFor(() => expect(container.querySelector('.legacy-search-table-frame')).toHaveFocus())
    expect(container.querySelector('.legacy-search-table-frame')).toHaveAttribute('tabindex', '-1')
  })

  it('does not move focus when the search starts from outside the results', async () => {
    const { rerender } = render(resultsFrame(false))
    const filter = screen.getByRole('textbox', { name: 'Filter' })
    act(() => filter.focus())

    rerender(resultsFrame(true))
    rerender(resultsFrame(false))
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })

    expect(filter).toHaveFocus()
  })

  it('does not take focus back for a control that had already released it', async () => {
    const { rerender } = render(resultsFrame(false))
    const sortHeader = screen.getByRole('button', { name: /List date/ })
    act(() => sortHeader.focus())
    act(() => sortHeader.blur())

    rerender(resultsFrame(true))
    rerender(resultsFrame(false))
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })

    expect(document.body).toHaveFocus()
  })

  it.each(['click', 'key'])(
    'leaves focus where the user moves to by %s while the results load',
    async (how) => {
      const { rerender } = render(resultsFrame(false))
      focusThenLoad(rerender, screen.getByRole('button', { name: /List date/ }))

      const filter = screen.getByRole('textbox', { name: 'Filter' })
      if (how === 'click') {
        await userEvent.click(filter)
      } else {
        await userEvent.tab()
        expect(filter).toHaveFocus()
      }
      rerender(resultsFrame(false))
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })

      expect(filter).toHaveFocus()
    },
  )

  it('keeps the loading skeleton and busy state while focus is waiting to return', () => {
    const { rerender } = render(resultsFrame(false))
    focusThenLoad(rerender, screen.getByRole('button', { name: /List date/ }))

    expect(screen.getByRole('region', { name: 'Search results table' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getByRole('table', { name: 'Searching' })).toBeInTheDocument()
    expect(screen.queryByText('Row 1')).not.toBeInTheDocument()
  })

  it('matches the loading skeleton to the rendered result columns', () => {
    render(
      <SearchResultsTableFrame loading loadingDescription="Loading search results…" columnCount={9}>
        <table />
      </SearchResultsTableFrame>,
    )

    const firstSkeletonRow = screen
      .getByRole('table', { name: 'Loading search results…' })
      .querySelector('tbody tr')

    expect(firstSkeletonRow?.querySelectorAll('td')).toHaveLength(9)
  })

  it('shows a grey bar instead of a name in each skeleton header', () => {
    render(
      <SearchResultsTableFrame loading loadingDescription="Searching" columnCount={3}>
        <table />
      </SearchResultsTableFrame>,
    )

    const headers = Array.from(
      screen.getByRole('table', { name: 'Searching' }).querySelectorAll('thead th'),
    )
    expect(headers).toHaveLength(3)
    headers.forEach((header) => {
      expect(header.textContent).toBe('')
      expect(header.querySelector(':scope > span')).toBeInTheDocument()
    })
  })

  it('omits the loading indicator when the table frame is not loading', () => {
    const { container } = render(
      <SearchResultsTableFrame loading={false} loadingDescription="Loading search results…">
        <table>
          <tbody>
            <tr>
              <td>Loaded rows</td>
            </tr>
          </tbody>
        </table>
      </SearchResultsTableFrame>,
    )

    expect(container.firstElementChild).not.toHaveAttribute('aria-busy')
    expect(screen.getByRole('region', { name: 'Search results table' })).toHaveAttribute(
      'aria-busy',
      'false',
    )
    expect(screen.getByRole('region', { name: 'Search results table' })).not.toHaveAttribute(
      'inert',
    )
    expect(screen.getByRole('region', { name: 'Search results table' })).not.toHaveAttribute(
      'tabindex',
    )
    expect(screen.queryByText('Loading search results…')).not.toBeInTheDocument()
    expect(screen.getByText('Loaded rows')).toBeInTheDocument()
  })

  it('becomes keyboard-focusable only when the table overflows', async () => {
    render(
      <SearchResultsTableFrame loading={false} loadingDescription="Loading search results…">
        <table>
          <tbody>
            <tr>
              <td>Wide results</td>
            </tr>
          </tbody>
        </table>
      </SearchResultsTableFrame>,
    )

    const viewport = screen.getByRole('region', { name: 'Search results table' })
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 640 })
    fireEvent(window, new Event('resize'))

    await waitFor(() => expect(viewport).toHaveAttribute('tabindex', '0'))
  })

  it('keeps the count live region mounted so a new search total is announced', () => {
    const frame = (loading: boolean) => (
      <SearchResultsTableFrame
        loading={loading}
        loadingDescription="Loading search results…"
        totalItems={3}
      >
        <table>
          <tbody>
            <tr>
              <td>Rows</td>
            </tr>
          </tbody>
        </table>
      </SearchResultsTableFrame>
    )
    const { container, rerender } = render(frame(true))
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeEmptyDOMElement()

    rerender(frame(false))
    expect(container.querySelector('[aria-live="polite"]')).toBe(liveRegion)
    expect(liveRegion).toHaveTextContent('3 results found')
  })

  it('can hide a zero count from view while still announcing it', () => {
    const frame = (loading: boolean, totalItems?: number, hideZeroCount = true) => (
      <SearchResultsTableFrame
        loading={loading}
        loadingDescription="Searching"
        totalItems={totalItems}
        resultName="application"
        hideZeroCount={hideZeroCount}
      >
        <p>No results found</p>
      </SearchResultsTableFrame>
    )
    const { container, rerender } = render(frame(true))
    const toolbar = container.querySelector('.legacy-search-table-toolbar')
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(toolbar).not.toHaveClass('cds--visually-hidden')

    rerender(frame(false, 0))
    expect(container.querySelector('.legacy-search-table-toolbar')).toBe(toolbar)
    expect(toolbar).toHaveClass('cds--visually-hidden')
    expect(container.querySelector('[aria-live="polite"]')).toBe(liveRegion)
    expect(liveRegion).toHaveTextContent('0 applications found')

    rerender(frame(false, 3))
    expect(toolbar).not.toHaveClass('cds--visually-hidden')
    expect(liveRegion).toHaveTextContent('3 applications found')

    rerender(frame(false, 0, false))
    expect(toolbar).not.toHaveClass('cds--visually-hidden')
  })

  it('renders a result count label when total items are provided', () => {
    render(
      <SearchResultsTableFrame
        loading={false}
        loadingDescription="Loading search results…"
        totalItems={12}
      >
        <table>
          <tbody>
            <tr>
              <td>Rows</td>
            </tr>
          </tbody>
        </table>
      </SearchResultsTableFrame>,
    )

    expect(screen.getByText('12 results found')).toBeInTheDocument()
  })

  it.each([
    [1, '1 result found'],
    [1234, '1,234 results found'],
  ])('formats a %s-item result count for people', (totalItems, expectedLabel) => {
    render(
      <SearchResultsTableFrame
        loading={false}
        loadingDescription="Loading search results…"
        totalItems={totalItems}
      >
        <table>
          <tbody>
            <tr>
              <td>Rows</td>
            </tr>
          </tbody>
        </table>
      </SearchResultsTableFrame>,
    )

    expect(screen.getByText(expectedLabel)).toBeInTheDocument()
  })

  it('shows a Carbon text skeleton instead of count text while the total is pending', () => {
    const { container } = render(
      <SearchResultsTableFrame
        loading={false}
        loadingDescription="Loading search results…"
        totalItems={11}
        totalItemsLabel={formatDeferredSearchTotalLabel(11, 'pending', 10)}
      >
        <table>
          <tbody>
            <tr>
              <td>Rows</td>
            </tr>
          </tbody>
        </table>
      </SearchResultsTableFrame>,
    )

    expect(screen.getByRole('status', { name: 'Counting search results' })).toBeInTheDocument()
    expect(container.querySelector('.cds--skeleton__text')).toBeInTheDocument()
    expect(screen.queryByText(/counting/i)).not.toBeInTheDocument()
  })

  it('places page actions in the result-count toolbar', () => {
    render(
      <SearchResultsTableFrame
        loading={false}
        loadingDescription="Loading search results…"
        totalItems={3}
        actions={<button type="button">Add record</button>}
      >
        <table>
          <tbody>
            <tr>
              <td>Rows</td>
            </tr>
          </tbody>
        </table>
      </SearchResultsTableFrame>,
    )

    const toolbar = screen.getByRole('group', { name: 'data table toolbar' })
    expect(within(toolbar).getByText('3 results found')).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Add record' })).toBeInTheDocument()
  })
})
