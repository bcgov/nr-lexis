import { render, screen } from '@testing-library/react'
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

    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
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

    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'false')
    expect(screen.queryByText('Loading search results...')).not.toBeInTheDocument()
    expect(screen.getByText('Loaded rows')).toBeInTheDocument()
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
})
