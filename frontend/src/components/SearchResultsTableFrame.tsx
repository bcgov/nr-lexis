import { InlineLoading } from '@carbon/react'
import type { FC, ReactNode } from 'react'

type SearchResultsTableFrameProps = {
  children: ReactNode
  loading: boolean
  loadingDescription: string
}

const SearchResultsTableFrame: FC<SearchResultsTableFrameProps> = ({
  children,
  loading,
  loadingDescription,
}) => (
  <div className="legacy-search-table-frame" aria-busy={loading}>
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
