import { InlineLoading, TableToolbar, TableToolbarContent } from '@carbon/react'
import type { FC, ReactNode } from 'react'

type SearchResultsTableFrameProps = {
  children: ReactNode
  loading: boolean
  loadingDescription: string
  totalItems?: number
  totalItemsLabel?: string
}

const SearchResultsTableFrame: FC<SearchResultsTableFrameProps> = ({
  children,
  loading,
  loadingDescription,
  totalItems,
  totalItemsLabel,
}) => (
  <div className="legacy-search-table-frame" aria-busy={loading}>
    {totalItems !== undefined && (
      <div className="legacy-search-table-toolbar">
        <TableToolbar>
          <TableToolbarContent>
            <p className="legacy-search-result-count">
              {totalItemsLabel ?? `${totalItems} results found`}
            </p>
          </TableToolbarContent>
        </TableToolbar>
      </div>
    )}
    <div
      className={loading ? 'legacy-search-table-content is-loading' : 'legacy-search-table-content'}
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

export default SearchResultsTableFrame
