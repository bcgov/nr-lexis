import { DataTableSkeleton, InlineLoading, TableToolbar, TableToolbarContent } from '@carbon/react'
import type { ReactNode } from 'react'
import TableFrame from './TableFrame'

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
    <div className="legacy-search-table-frame">
      {(loading || totalItems !== undefined) && (
        <div className="legacy-search-table-toolbar">
          <TableToolbar>
            <TableToolbarContent>
              {loading ? (
                <div className="legacy-search-result-loading">
                  <InlineLoading description={loadingDescription} />
                </div>
              ) : (
                <p className="legacy-search-result-count">
                  {totalItemsLabel ?? formatSearchResultCount(totalItems!)}
                </p>
              )}
            </TableToolbarContent>
          </TableToolbar>
        </div>
      )}
      <TableFrame
        ariaLabel="Search results table"
        className="legacy-search-table-content"
        aria-busy={loading}
      >
        {loading ? (
          <DataTableSkeleton
            aria-label={loadingDescription}
            columnCount={6}
            rowCount={5}
            showHeader={false}
            showToolbar={false}
          />
        ) : (
          children
        )}
      </TableFrame>
    </div>
  )
}

export default SearchResultsTableFrame
