import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
import EmptyState from '@/components/EmptyState'
import ForestClientComboBox from '@/components/ForestClientComboBox'
import PageHeader from '@/components/PageHeader'
import SearchSubmitButton from '@/components/SearchSubmitButton'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import SearchableSelect from '../../components/SearchableSelect'
import StatusTag from '@/components/StatusTag'
import IsoDatePicker from '../../components/IsoDatePicker'
import type {
  FederalApplicationSearchFilters,
  FederalApplicationSearchRequest,
  FederalApplicationSearchResponse,
} from '@/interfaces/FederalApplicationSearch'
import { useAuth } from '@/context/auth/useAuth'
import { hasInvalidIsoDateValue, isValidIsoDate } from '@/pages/shared/create-form-utils'
import {
  buildPageDataCacheKey,
  getPageDataCache,
  getPageDataCacheGeneration,
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
  parsePageSizeParam,
  parsePositiveIntParam,
} from '@/pages/shared/search-query-utils'
import { useSearchFilterDraft } from '@/pages/shared/useSearchFilterDraft'
import { usePersistedSearchParams } from '@/pages/shared/usePersistedSearchParams'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  formatDeferredSearchTotalLabel,
  loadSearchWithDeferredTotal,
  prefetchAdjacentSearchPages,
  type DeferredSearchTotalStatus,
} from '@/pages/shared/deferred-search-total'
import {
  countFederalApplications,
  searchFederalApplications,
} from '@/service/federal-application-search-service'
import { fetchFederalApplicationOptions, type SearchOption } from '@/service/search-options-service'
import { displayTableValue } from '@/utils/text'

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

const RESULT_COLUMNS: {
  id: string
  label: string
}[] = [
  { id: 'federalApplicationNumber', label: 'Application' },
  { id: 'status', label: 'Status' },
  { id: 'clientNumber', label: 'Client' },
  { id: 'reason', label: 'Reason' },
  { id: 'receivedDate', label: 'Received date' },
  { id: 'listingDate', label: 'Listing date' },
]

const buildSearchParams = (
  filters: FederalApplicationSearchFilters,
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
    ['page', page],
    ['pageSize', pageSize],
  ])

const FederalPage = () => {
  const { capabilities, canPerform, isLoading } = useAuth()
  const [searchParams, setSearchParams] = usePersistedSearchParams('federal-applications')
  const [applicationStatusOptions, setApplicationStatusOptions] = useState<SearchOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [searchResult, setSearchResult] = useState<{
    results: FederalApplicationSearchResponse
    totalStatus: DeferredSearchTotalStatus
  }>({ results: EMPTY_RESULTS, totalStatus: 'exact' })
  const { results, totalStatus } = searchResult
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const totalCacheRef = useRef<SearchTotalCache>(new Map())
  const canFilterFederalByClient = canPerform('/createExemption')
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
      page: parsePositiveIntParam(searchParams.get('page'), DEFAULT_SEARCH_PAGE),
      pageSize: parsePageSizeParam(
        searchParams.get('pageSize'),
        DEFAULT_SEARCH_PAGE_SIZE,
        SEARCH_PAGE_SIZE_OPTIONS,
      ),
    }
  }, [searchParams])
  const appliedFilters = urlState.filters
  const [filters, setFilters] = useSearchFilterDraft(appliedFilters)
  const [clientSearchResetKey, setClientSearchResetKey] = useState(0)
  const pageSize = urlState.pageSize
  const requestFilters = appliedFilters
  const hasSearchQuery = searchParams.toString().length > 0
  const updateFilter = useCallback(
    (key: keyof FederalApplicationSearchFilters, value: string) => {
      setFilters((currentFilters) => ({ ...currentFilters, [key]: value }))
    },
    [setFilters],
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
  const commitResults = useCallback(
    (nextResults: FederalApplicationSearchResponse, nextTotalStatus: DeferredSearchTotalStatus) => {
      setSearchResult({ results: nextResults, totalStatus: nextTotalStatus })
    },
    [],
  )

  const runSearch = useCallback(
    async (request: FederalApplicationSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheGeneration = getPageDataCacheGeneration()
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
          commitResults(cachedResults, 'exact')
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
        const cachedTotal = options.force
          ? undefined
          : getCachedSearchTotal(totalCacheRef.current, totalCacheKey)
        const commitSearchResponse = (
          response: FederalApplicationSearchResponse,
          totalIsExact: boolean,
        ) => {
          if (totalIsExact && setPageDataCache(pageCacheKey, response, pageCacheGeneration)) {
            setCachedSearchTotal(totalCacheRef.current, totalCacheKey, response.page.totalElements)
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
              commitResults(response, totalIsExact ? 'exact' : 'pending')
            }
          })
        }
        const { response, totalIsExact, deferredResponse } = await loadSearchWithDeferredTotal({
          request,
          cachedTotal,
          search: searchFederalApplications,
          count: countFederalApplications,
          deferCount: true,
        })
        if (isLatestRequest()) {
          commitSearchResponse(response, totalIsExact)
        }
        if (deferredResponse) {
          void deferredResponse
            .then((exactResponse) => {
              if (isLatestRequest()) {
                commitSearchResponse(exactResponse, true)
              }
            })
            .catch((error) => {
              console.error(error)
              if (isLatestRequest()) {
                commitResults(response, 'unavailable')
              }
            })
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve federal application search results.')
          commitResults(EMPTY_RESULTS, 'exact')
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
    if (!hasSearchQuery) {
      return
    }

    void runSearch({
      filters: requestFilters,
      page: urlState.page - 1,
      pageSize: urlState.pageSize,
    })
  }, [hasSearchQuery, requestFilters, runSearch, urlState.page, urlState.pageSize])

  useEffect(() => {
    if (!isLoading && !hasSearchQuery) {
      setFilters((currentFilters) =>
        currentFilters.applicationStatus === 'APP'
          ? currentFilters
          : {
              ...currentFilters,
              applicationStatus: 'APP',
            },
      )
    }
  }, [hasSearchQuery, isLoading, setFilters])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const options = await fetchFederalApplicationOptions()
        setApplicationStatusOptions(options.applicationStatuses)
        setOptionsUnavailable(false)
      } catch {
        setOptionsUnavailable(true)
      } finally {
        setOptionsLoading(false)
      }
    }

    void loadOptions()
  }, [])

  const onSearch = () => {
    if (loading || hasDateValidationError) {
      return
    }
    const nextSearchParams = buildSearchParams(filters, DEFAULT_SEARCH_PAGE, pageSize)
    if (nextSearchParams.toString() === searchParams.toString()) {
      void runSearch(
        {
          filters,
          page: DEFAULT_SEARCH_PAGE - 1,
          pageSize,
        },
        { force: true },
      )
      return
    }
    setSearchParams(nextSearchParams)
  }

  const onClearFilters = () => {
    setClientSearchResetKey((current) => current + 1)
    setFilters(INITIAL_FILTERS)
    // INTENTIONAL_LEGACY_DIVERGENCE(CLEAR_ALL_RESETS_SEARCH)
    setSearchParams(new URLSearchParams())
  }

  return (
    <Grid fullWidth className="default-grid fullbleed-table-page federal-application-search-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Federal application search"
          subtitle="Find federal applications and open application details."
        />
      </Column>

      {optionsUnavailable && <AuthoritativeOptionsUnavailableNotification />}

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters federal-application-search-filters">
          <Tile>
            <form
              className="legacy-search-form"
              onSubmit={(event) => {
                event.preventDefault()
                onSearch()
              }}
            >
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
                  disabled={optionsLoading || optionsUnavailable}
                  onChange={(value) => updateFilter('applicationStatus', value)}
                />
                {canFilterFederalByClient && (
                  <ForestClientComboBox
                    id="clientNumber"
                    labelText="Client number"
                    value={filters.clientNumber}
                    resetKey={clientSearchResetKey}
                    onChange={(value) => updateFilter('clientNumber', value)}
                  />
                )}
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
                  type="button"
                  kind="tertiary"
                  onClick={onClearFilters}
                  disabled={loading}
                  size="md"
                >
                  Clear all
                </Button>
                <SearchSubmitButton loading={loading} disabled={hasDateValidationError} />
              </div>
            </form>
          </Tile>
        </section>
      </Column>

      <Column
        sm={4}
        md={8}
        lg={16}
        hidden={!hasSearchQuery}
        style={{ display: hasSearchQuery ? undefined : 'none' }}
      >
        <section
          className="legacy-search-section legacy-search-section--results"
          aria-label="Search results"
        >
          <SearchResultsTableFrame
            loading={loading}
            loadingDescription="Loading federal application search results…"
            columnCount={RESULT_COLUMNS.length}
            totalItems={
              errorMessage || (loading && results.content.length === 0)
                ? undefined
                : results.page.totalElements
            }
            totalItemsLabel={formatDeferredSearchTotalLabel(
              results.page.totalElements,
              totalStatus,
              results.page.number * results.page.size + results.content.length,
            )}
          >
            {errorMessage ? (
              <EmptyState
                role="alert"
                title="Federal application search unavailable"
                description={errorMessage}
              />
            ) : results.content.length > 0 ? (
              <Table size="md" useZebraStyles>
                <TableHead>
                  <TableRow>
                    {RESULT_COLUMNS.map((column) => (
                      <TableHeader key={column.id}>{column.label}</TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.content.map((row) => (
                    <TableRow key={row.applicationNumber}>
                      <TableCell>
                        <Link
                          className="cds--link"
                          to={withCurrentSearch(`/federal/application/${row.applicationNumber}`)}
                          state={{
                            returnTo: {
                              label: 'Federal application search',
                              to: withCurrentSearch('/federal'),
                            },
                          }}
                        >
                          {row.federalApplicationNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusTag status={row.status} />
                      </TableCell>
                      <TableCell>{displayTableValue(row.clientNumber)}</TableCell>
                      <TableCell>{displayTableValue(row.reason)}</TableCell>
                      <TableCell className="legacy-search-table-date">
                        {displayTableValue(row.receivedDate)}
                      </TableCell>
                      <TableCell className="legacy-search-table-date">
                        {displayTableValue(row.listingDate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : !loading ? (
              <EmptyState
                title="No federal applications found"
                description="No federal applications found for the selected criteria."
              />
            ) : null}
            {!errorMessage && (!loading || results.content.length > 0) && (
              <Pagination
                page={results.page.number + 1}
                pageSize={results.page.size}
                pageSizes={[...SEARCH_PAGE_SIZE_OPTIONS]}
                totalItems={results.page.totalElements}
                pagesUnknown={totalStatus !== 'exact'}
                isLastPage={totalStatus !== 'exact' && results.content.length < results.page.size}
                onChange={({ page, pageSize: nextPageSize }) => {
                  setSearchParams(buildSearchParams(appliedFilters, page, nextPageSize))
                }}
              />
            )}
          </SearchResultsTableFrame>
        </section>
      </Column>
    </Grid>
  )
}

export default FederalPage
