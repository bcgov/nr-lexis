import { DataTableSkeleton, InlineLoading, TableToolbar, TableToolbarContent } from '@carbon/react'
import type { ReactNode } from 'react'
import { formatSearchResultCount } from '@/pages/shared/deferred-search-total'
import TableFrame from './TableFrame'

type SearchResultsTableFrameProps = {
  children: ReactNode
  loading: boolean
  loadingDescription: string
  totalItems?: number
  totalItemsLabel?: ReactNode
  resultName?: string
  actions?: ReactNode
  /** The number of result columns; the loading skeleton shows a grey bar in each header. */
  columnCount?: number
  /** With no results, the toolbar is hidden from view but still announces the count. */
  hideZeroCount?: boolean
}

function SearchResultsTableFrame({
  children,
  loading,
  loadingDescription,
  totalItems,
  totalItemsLabel,
  resultName = 'result',
  actions,
  columnCount = 6,
  hideZeroCount = false,
}: SearchResultsTableFrameProps) {
  const toolbarHidden = hideZeroCount && !loading && totalItems === 0 && !actions
  return (
    <div className="legacy-search-table-frame">
      {(loading || totalItems !== undefined || actions) && (
        <div
          className={`legacy-search-table-toolbar${actions ? ' legacy-search-table-toolbar--with-actions' : ''}${toolbarHidden ? ' cds--visually-hidden' : ''}`}
        >
          <TableToolbar>
            <TableToolbarContent>
              {loading && (
                <div className="legacy-search-result-loading">
                  <InlineLoading description={loadingDescription} />
                </div>
              )}
              {/* Stays mounted so the new count is announced after each search. */}
              <div className="legacy-search-result-count" aria-live="polite" aria-atomic="true">
                {!loading && totalItems !== undefined
                  ? (totalItemsLabel ?? formatSearchResultCount(totalItems, resultName))
                  : null}
              </div>
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
