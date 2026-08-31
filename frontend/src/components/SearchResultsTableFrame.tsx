import { DataTableSkeleton, InlineLoading, TableToolbar, TableToolbarContent } from '@carbon/react'
import type { ReactNode } from 'react'
import TableFrame from './TableFrame'

export type SearchResultsTableFrameProps = {
  children: ReactNode
  loading: boolean
  loadingDescription: string
  totalItems?: number
  totalItemsLabel?: ReactNode
  actions?: ReactNode
  columnCount?: number
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
  actions,
  columnCount = 6,
}: SearchResultsTableFrameProps) {
  return (
    <div className="legacy-search-table-frame">
      {(loading || totalItems !== undefined || actions) && (
        <div
          className={`legacy-search-table-toolbar${actions ? ' legacy-search-table-toolbar--with-actions' : ''}`}
        >
          <TableToolbar>
            <TableToolbarContent>
              {loading ? (
                <div className="legacy-search-result-loading">
                  <InlineLoading description={loadingDescription} />
                </div>
              ) : totalItems !== undefined ? (
                <div className="legacy-search-result-count" aria-live="polite">
                  {totalItemsLabel ?? formatSearchResultCount(totalItems)}
                </div>
              ) : null}
              {actions ? (
                <div className="legacy-search-table-toolbar__actions">{actions}</div>
              ) : null}
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
            columnCount={columnCount}
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
