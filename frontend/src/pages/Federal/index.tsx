import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Button,
  Column,
  Grid,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextInput,
  Tile,
} from '@carbon/react'
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import SearchableSelect from '../../components/SearchableSelect'
import IsoDatePicker from '../../components/IsoDatePicker'
import type {
  FederalApplicationSearchFilters,
  FederalApplicationSearchRequest,
  FederalApplicationSearchResponse,
  FederalApplicationSearchSortField,
} from '@/interfaces/FederalApplicationSearch'
import { useAuth } from '@/context/auth/useAuth'
import { hasInvalidIsoDateValue, isValidIsoDate } from '@/pages/shared/create-form-utils'
import {
  buildPageDataCacheKey,
  getPageDataCache,
  setPageDataCache,
} from '@/pages/shared/page-data-cache'
import {
  buildSearchTotalCacheKey,
  getCachedSearchTotal,
  setCachedSearchTotal,
  type SearchTotalCache,
} from '@/pages/shared/search-total-cache'
import {
  DEFAULT_SEARCH_PAGE,
  DEFAULT_SEARCH_PAGE_SIZE,
  SEARCH_PAGE_SIZE_OPTIONS,
  appendSearchParamsToPath,
  createEmptyPagedSearchResponse,
  createSearchParams,
  getNextSortDirection,
  parseEnumParam,
  parsePageSizeParam,
  parsePositiveIntParam,
  parseSortDirectionParam,
} from '@/pages/shared/search-query-utils'
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  loadSearchWithDeferredTotal,
  prefetchAdjacentSearchPages,
} from '@/pages/shared/deferred-search-total'
import {
  countFederalApplications,
  searchFederalApplications,
} from '@/service/federal-application-search-service'
import { fetchFederalApplicationOptions, type SearchOption } from '@/service/search-options-service'

const INITIAL_FILTERS: FederalApplicationSearchFilters = {
  applicationNumber: '',
  packageNumber: '',
  applicationStatus: '',
  clientNumber: '',
  receivedFromDate: '',
  receivedToDate: '',
  listingFromDate: '',
  listingToDate: '',
}

const EMPTY_RESULTS = createEmptyPagedSearchResponse<FederalApplicationSearchResponse>()

const SORT_COLUMNS: {
  id: FederalApplicationSearchSortField
  label: string
}[] = [
  { id: 'federalApplicationNumber', label: 'Application' },
  { id: 'status', label: 'Status' },
  { id: 'clientNumber', label: 'Client' },
  { id: 'reason', label: 'Reason' },
  { id: 'receivedDate', label: 'Received date' },
  { id: 'listingDate', label: 'Listing date' },
]
const DEFAULT_SORT_FIELD: FederalApplicationSearchSortField = 'federalApplicationNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'asc'
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as FederalApplicationSearchSortField[]

const buildSearchParams = (
  filters: FederalApplicationSearchFilters,
  sortField: FederalApplicationSearchSortField,
  sortDirection: 'asc' | 'desc',
  page: number,
  pageSize: number,
): URLSearchParams =>
  createSearchParams([
    ['applicationNumber', filters.applicationNumber],
    ['packageNumber', filters.packageNumber],
    ['applicationStatus', filters.applicationStatus],
    ['clientNumber', filters.clientNumber],
    ['receivedFromDate', filters.receivedFromDate],
    ['receivedToDate', filters.receivedToDate],
    ['listingFromDate', filters.listingFromDate],
    ['listingToDate', filters.listingToDate],
    ['sortField', sortField],
    ['sortDirection', sortDirection],
    ['page', page],
    ['pageSize', pageSize],
  ])

const FederalPage = () => {
  const { capabilities, isLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [applicationStatusOptions, setApplicationStatusOptions] = useState<SearchOption[]>([])
  const [results, setResults] = useState<FederalApplicationSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const totalCacheRef = useRef<SearchTotalCache>(new Map())
  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
  )

  const urlState = useMemo(() => {
    const urlFilters: FederalApplicationSearchFilters = {
      applicationNumber: searchParams.get('applicationNumber') ?? '',
      packageNumber: searchParams.get('packageNumber') ?? '',
      applicationStatus: searchParams.get('applicationStatus') ?? '',
      clientNumber: searchParams.get('clientNumber') ?? '',
      receivedFromDate: searchParams.get('receivedFromDate') ?? '',
      receivedToDate: searchParams.get('receivedToDate') ?? '',
      listingFromDate: searchParams.get('listingFromDate') ?? '',
      listingToDate: searchParams.get('listingToDate') ?? '',
    }

    return {
      filters: urlFilters,
      sortField: parseEnumParam(
        searchParams.get('sortField'),
        SORT_FIELD_OPTIONS,
        DEFAULT_SORT_FIELD,
      ),
      sortDirection: parseSortDirectionParam(
        searchParams.get('sortDirection'),
        DEFAULT_SORT_DIRECTION,
      ),
      page: parsePositiveIntParam(searchParams.get('page'), DEFAULT_SEARCH_PAGE),
      pageSize: parsePageSizeParam(
        searchParams.get('pageSize'),
        DEFAULT_SEARCH_PAGE_SIZE,
        SEARCH_PAGE_SIZE_OPTIONS,
      ),
    }
  }, [searchParams])
  const debouncedUrlState = useDebouncedValue(urlState)
  const filters = urlState.filters
  const sortField = urlState.sortField
  const sortDirection = urlState.sortDirection
  const pageSize = urlState.pageSize
  const updateFilter = useCallback(
    (key: keyof FederalApplicationSearchFilters, value: string) => {
      const nextFilters = { ...filters, [key]: value }
      setSearchParams(
        buildSearchParams(nextFilters, sortField, sortDirection, DEFAULT_SEARCH_PAGE, pageSize),
        { replace: true },
      )
    },
    [filters, pageSize, setSearchParams, sortDirection, sortField],
  )

  const hasDateValidationError = useMemo(() => {
    return hasInvalidIsoDateValue(
      filters.receivedFromDate,
      filters.receivedToDate,
      filters.listingFromDate,
      filters.listingToDate,
    )
  }, [
    filters.receivedFromDate,
    filters.receivedToDate,
    filters.listingFromDate,
    filters.listingToDate,
  ])

  const beginSearchRequest = useLatestRequestGuard()
  const commitResults = useCallback((nextResults: FederalApplicationSearchResponse) => {
    setResults(nextResults)
  }, [])

  const runSearch = useCallback(
    async (request: FederalApplicationSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheKey = buildPageDataCacheKey(
        'federal-application-search',
        capabilities?.principal,
        request,
      )
      const isLatestRequest = beginSearchRequest()
      if (!options.force) {
        const cachedResults = getPageDataCache<FederalApplicationSearchResponse>(pageCacheKey)
        if (cachedResults) {
          setCachedSearchTotal(
            totalCacheRef.current,
            buildSearchTotalCacheKey(request.filters),
            cachedResults.page.totalElements,
          )
          prefetchAdjacentSearchPages({
            pageId: 'federal-application-search',
            principal: capabilities?.principal,
            request,
            response: cachedResults,
            search: searchFederalApplications,
            onError: console.error,
          })
          setResults(cachedResults)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      if (
        hasInvalidIsoDateValue(
          request.filters.receivedFromDate,
          request.filters.receivedToDate,
          request.filters.listingFromDate,
          request.filters.listingToDate,
        )
      ) {
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      try {
        const totalCacheKey = buildSearchTotalCacheKey(request.filters)
        const cachedTotal = getCachedSearchTotal(totalCacheRef.current, totalCacheKey)
        const commitSearchResponse = (
          response: FederalApplicationSearchResponse,
          totalIsExact: boolean,
        ) => {
          if (totalIsExact) {
            setCachedSearchTotal(totalCacheRef.current, totalCacheKey, response.page.totalElements)
            setPageDataCache(pageCacheKey, response)
            prefetchAdjacentSearchPages({
              pageId: 'federal-application-search',
              principal: capabilities?.principal,
              request,
              response,
              search: searchFederalApplications,
              onError: console.error,
            })
          }
          queueMicrotask(() => {
            if (isLatestRequest()) {
              commitResults(response)
            }
          })
        }
        const { response, totalIsExact } = await loadSearchWithDeferredTotal({
          request,
          cachedTotal,
          search: searchFederalApplications,
          count: countFederalApplications,
          isLatestRequest,
          onExactTotal: (resolvedResponse) => commitSearchResponse(resolvedResponse, true),
          onCountError: console.error,
        })
        if (isLatestRequest()) {
          commitSearchResponse(response, totalIsExact)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve federal application search results.')
          setResults(EMPTY_RESULTS)
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    },
    [beginSearchRequest, capabilities?.principal, commitResults],
  )

  useEffect(() => {
    if (searchParams.toString().length === 0) {
      return
    }

    void runSearch({
      filters: debouncedUrlState.filters,
      sortField: debouncedUrlState.sortField,
      sortDirection: debouncedUrlState.sortDirection,
      page: debouncedUrlState.page - 1,
      pageSize: debouncedUrlState.pageSize,
    })
  }, [debouncedUrlState, runSearch, searchParams])

  useEffect(() => {
    const hasSearchQuery = searchParams.toString().length > 0
    if (!isLoading && !hasSearchQuery) {
      setSearchParams(
        buildSearchParams(
          { ...INITIAL_FILTERS, applicationStatus: 'APP' },
          DEFAULT_SORT_FIELD,
          DEFAULT_SORT_DIRECTION,
          DEFAULT_SEARCH_PAGE,
          DEFAULT_SEARCH_PAGE_SIZE,
        ),
        { replace: true },
      )
    }
  }, [isLoading, searchParams, setSearchParams])

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchFederalApplicationOptions()
      setApplicationStatusOptions(options.applicationStatuses)
    }

    void loadOptions()
  }, [])

  const onSearch = () => {
    setSearchParams(
      buildSearchParams(filters, sortField, sortDirection, DEFAULT_SEARCH_PAGE, pageSize),
    )
  }

  const onClearFilters = () => {
    setSearchParams(
      buildSearchParams(
        INITIAL_FILTERS,
        DEFAULT_SORT_FIELD,
        DEFAULT_SORT_DIRECTION,
        DEFAULT_SEARCH_PAGE,
        DEFAULT_SEARCH_PAGE_SIZE,
      ),
    )
  }

  const onHeaderClick = (column: FederalApplicationSearchSortField) => {
    const nextDirection = getNextSortDirection(sortField, sortDirection, column)
    setSearchParams(
      buildSearchParams(filters, column, nextDirection, DEFAULT_SEARCH_PAGE, pageSize),
    )
  }

  return (
    <Grid fullWidth className="default-grid federal-application-search-page">
      <Column sm={4} md={8} lg={16}>
        <h1>Federal application search</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters federal-application-search-filters">
          <Tile>
            <div className="legacy-search-grid federal-application-search-grid">
              <TextInput
                id="applicationNumber"
                labelText="Application number"
                value={filters.applicationNumber}
                onChange={(event) => updateFilter('applicationNumber', event.target.value)}
              />
              <TextInput
                id="packageNumber"
                labelText="Package number"
                value={filters.packageNumber}
                onChange={(event) => updateFilter('packageNumber', event.target.value)}
              />
              <SearchableSelect
                id="applicationStatus"
                labelText="Application status"
                value={filters.applicationStatus}
                placeholder="All statuses"
                options={applicationStatusOptions}
                onChange={(value) => updateFilter('applicationStatus', value)}
              />
              <TextInput
                id="clientNumber"
                labelText="Client number"
                value={filters.clientNumber}
                onChange={(event) => updateFilter('clientNumber', event.target.value)}
              />
              <IsoDatePicker
                id="receivedFromDate"
                labelText="Received from date"
                value={filters.receivedFromDate}
                invalid={!isValidIsoDate(filters.receivedFromDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('receivedFromDate', value)}
              />
              <IsoDatePicker
                id="receivedToDate"
                labelText="Received to date"
                value={filters.receivedToDate}
                invalid={!isValidIsoDate(filters.receivedToDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('receivedToDate', value)}
              />
              <IsoDatePicker
                id="listingFromDate"
                labelText="Listing from date"
                value={filters.listingFromDate}
                invalid={!isValidIsoDate(filters.listingFromDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('listingFromDate', value)}
              />
              <IsoDatePicker
                id="listingToDate"
                labelText="Listing to date"
                value={filters.listingToDate}
                invalid={!isValidIsoDate(filters.listingToDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('listingToDate', value)}
              />
            </div>
            <div className="legacy-search-actions">
              <Button
                kind="primary"
                onClick={onSearch}
                disabled={loading || hasDateValidationError}
                size="md"
              >
                Search
              </Button>
              <Button kind="tertiary" onClick={onClearFilters} disabled={loading} size="md">
                Clear Filters
              </Button>
            </div>
          </Tile>
        </section>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--results">
          <h2 className="dashboard-title">Search results</h2>
          {!!errorMessage && <p className="legacy-search-error">{errorMessage}</p>}
          <SearchResultsTableFrame
            loading={loading}
            loadingDescription="Loading federal application search results..."
            totalItems={results.page.totalElements}
          >
            <Table useZebraStyles>
              <TableHead>
                <TableRow>
                  {SORT_COLUMNS.map((column) => (
                    <TableHeader key={column.id}>
                      <button
                        type="button"
                        className="legacy-sort-button"
                        onClick={() => onHeaderClick(column.id)}
                      >
                        {column.label}
                        {sortField === column.id ? ` (${sortDirection.toUpperCase()})` : ''}
                      </button>
                    </TableHeader>
                  ))}
                  <TableHeader>Exemption type</TableHeader>
                  <TableHeader>Exemption number</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.content.map((row) => (
                  <TableRow key={row.applicationNumber}>
                    <TableCell>
                      <Link
                        className="cds--link"
                        to={withCurrentSearch(`/federal/application/${row.applicationNumber}`)}
                      >
                        {row.federalApplicationNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.clientNumber}</TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{row.receivedDate}</TableCell>
                    <TableCell>{row.listingDate}</TableCell>
                    <TableCell>{row.exemptionType || '-'}</TableCell>
                    <TableCell>
                      {row.exemptionNumber ? (
                        <Link
                          className="cds--link"
                          to={withCurrentSearch(`/provincial/exemption/${row.exemptionNumber}`)}
                        >
                          {row.exemptionNumber}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {results.content.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      No federal applications found for the selected criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <Pagination
              page={results.page.number + 1}
              pageSize={results.page.size}
              pageSizes={[...SEARCH_PAGE_SIZE_OPTIONS]}
              totalItems={results.page.totalElements}
              onChange={({ page, pageSize: nextPageSize }) => {
                setSearchParams(
                  buildSearchParams(filters, sortField, sortDirection, page, nextPageSize),
                )
              }}
            />
          </SearchResultsTableFrame>
        </section>
      </Column>
    </Grid>
  )
}

export default FederalPage
