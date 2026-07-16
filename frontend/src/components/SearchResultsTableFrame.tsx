import { InlineLoading, TableToolbar, TableToolbarContent } from '@carbon/react'
import type { ReactNode } from 'react'

export type SearchResultsTableFrameProps = {
  children: ReactNode
  loading: boolean
  loadingDescription: string
  totalItems?: number
  totalItemsLabel?: string
}

const formatSearchResultCount = (totalItems: number): string => {
  const formattedTotal = new Intl.NumberFormat('en-CA').format(totalItems)
  return `${formattedTotal} ${totalItems === 1 ? 'result' : 'results'} found`
}

function SearchResultsTableFrame({
  children,
  loading,
  loadingDescription,
  totalItems,
  totalItemsLabel,
}: SearchResultsTableFrameProps) {
  return (
    <div className="legacy-search-table-frame" aria-busy={loading}>
      {totalItems !== undefined && (
        <div className="legacy-search-table-toolbar">
          <TableToolbar>
            <TableToolbarContent>
              <p className="legacy-search-result-count">
                {totalItemsLabel ?? formatSearchResultCount(totalItems)}
              </p>
            </TableToolbarContent>
          </TableToolbar>
        </div>
      )}
      <div
        className={
          loading ? 'legacy-search-table-content is-loading' : 'legacy-search-table-content'
        }
        role="region"
        aria-label="Search results table"
        tabIndex={0}
      >
        {children}
      </div>
      {loading && (
        <div className="legacy-search-table-loader">
          <InlineLoading description={loadingDescription} />
        </div>
      )}
    </div>
  )
}

export default SearchResultsTableFrame
