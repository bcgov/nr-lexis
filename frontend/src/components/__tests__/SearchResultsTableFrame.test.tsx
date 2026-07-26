import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SearchResultsTableFrame from '../SearchResultsTableFrame'

describe('SearchResultsTableFrame', () => {
  it('marks the table frame busy and shows centered loading copy while loading', () => {
    const { container } = render(
      <SearchResultsTableFrame loading loadingDescription="Loading search results...">
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
    expect(screen.getByRole('region', { name: 'Search results table' })).toHaveAttribute('inert')
    expect(screen.getByText('Loading search results...')).toBeInTheDocument()
    expect(screen.getByText('Existing rows')).toBeInTheDocument()
  })

  it('omits the loading indicator when the table frame is not loading', () => {
    const { container } = render(
      <SearchResultsTableFrame loading={false} loadingDescription="Loading search results...">
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
    expect(screen.queryByText('Loading search results...')).not.toBeInTheDocument()
    expect(screen.getByText('Loaded rows')).toBeInTheDocument()
  })

  it('becomes keyboard-focusable only when the table overflows', async () => {
    render(
      <SearchResultsTableFrame loading={false} loadingDescription="Loading search results...">
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

  it('renders a result count label when total items are provided', () => {
    render(
      <SearchResultsTableFrame
        loading={false}
        loadingDescription="Loading search results..."
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
        loadingDescription="Loading search results..."
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
})
