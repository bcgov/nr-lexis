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
import EmptyState from '@/components/EmptyState'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import IsoDatePicker from '../../components/IsoDatePicker'
import RegionMultiSelect from '@/components/RegionMultiSelect'
import PageHeader from '@/components/PageHeader'
import SearchSubmitButton from '@/components/SearchSubmitButton'
import type {
  ProvincialOfferSearchFilters,
  ProvincialOfferSearchRequest,
  ProvincialOfferSearchResponse,
  ProvincialOfferSearchSortField,
} from '@/interfaces/ProvincialOfferSearch'
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
  getNextSortDirection,
  mapSelectedOptionsById,
  mapValueLabelOptionsToIdTextOptions,
  parseCsvParam,
  parseEnumParam,
  parsePageSizeParam,
  parsePositiveIntParam,
  parseSortDirectionParam,
  type IdTextOption,
} from '@/pages/shared/search-query-utils'
import { useSearchFilterDraft } from '@/pages/shared/useSearchFilterDraft'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  loadSearchWithDeferredTotal,
  prefetchAdjacentSearchPages,
} from '@/pages/shared/deferred-search-total'
import {
  countProvincialOffers,
  searchProvincialOffers,
} from '@/service/provincial-offer-search-service'
import {
  fetchProvincialApplicationOptions,
  fetchProvincialOfferOptions,
} from '@/service/search-options-service'
import { formatBusinessIsoDate } from '@/utils/date'

const INITIAL_FILTERS: ProvincialOfferSearchFilters = {
  applicationNumber: '',
  packageNumber: '',
  clientNumber: '',
  listingFromDate: '',
  listingToDate: '',
  region: [],
  withdrawalFromDate: '',
  withdrawalToDate: '',
}

const EMPTY_RESULTS = createEmptyPagedSearchResponse<ProvincialOfferSearchResponse>()

const SORT_COLUMNS: {
  id: ProvincialOfferSearchSortField
  label: string
}[] = [
  { id: 'offerNumber', label: 'Offer' },
  { id: 'applicationNumber', label: 'Application' },
  { id: 'packageNumber', label: 'Package' },
  { id: 'listingDate', label: 'Listing date' },
  { id: 'region', label: 'Natural resource region code' },
  { id: 'offerWithdrawalDate', label: 'Offer withdrawn date' },
]

const DEFAULT_SORT_FIELD: ProvincialOfferSearchSortField = 'listingDate'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'asc'
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ProvincialOfferSearchSortField[]

const buildSearchParams = (
  filters: ProvincialOfferSearchFilters,
  sortField: ProvincialOfferSearchSortField,
  sortDirection: 'asc' | 'desc',
  page: number,
  pageSize: number,
): URLSearchParams =>
  createSearchParams([
    ['applicationNumber', filters.applicationNumber],
    ['packageNumber', filters.packageNumber],
    ['clientNumber', filters.clientNumber],
    ['listingFromDate', filters.listingFromDate],
    ['listingToDate', filters.listingToDate],
    ['region', filters.region],
    ['withdrawalFromDate', filters.withdrawalFromDate],
    ['withdrawalToDate', filters.withdrawalToDate],
    ['sortField', sortField],
    ['sortDirection', sortDirection],
    ['page', page],
    ['pageSize', pageSize],
  ])

const ProvincialOffersPage = () => {
  const { capabilities, canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [regionOptions, setRegionOptions] = useState<IdTextOption[]>([])
  const [results, setResults] = useState<ProvincialOfferSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [defaultListingToDate, setDefaultListingToDate] = useState('')
  const [isOptionsLoaded, setIsOptionsLoaded] = useState(false)
  const [offerOptionsUnavailable, setOfferOptionsUnavailable] = useState(false)
  const [applicationOptionsUnavailable, setApplicationOptionsUnavailable] = useState(false)
  const totalCacheRef = useRef<SearchTotalCache>(new Map())
  const canCreateOffer = canPerform('createOffer')
  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
  )

  const urlState = useMemo(() => {
    const urlFilters: ProvincialOfferSearchFilters = {
      applicationNumber: searchParams.get('applicationNumber') ?? '',
      packageNumber: searchParams.get('packageNumber') ?? '',
      clientNumber: searchParams.get('clientNumber') ?? '',
      listingFromDate: searchParams.get('listingFromDate') ?? '',
      listingToDate: searchParams.get('listingToDate') ?? '',
      region: parseCsvParam(searchParams.get('region')),
      withdrawalFromDate: searchParams.get('withdrawalFromDate') ?? '',
      withdrawalToDate: searchParams.get('withdrawalToDate') ?? '',
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
  const appliedFilters = urlState.filters
  const [filters, setFilters] = useSearchFilterDraft(appliedFilters)
  const sortField = urlState.sortField
  const sortDirection = urlState.sortDirection
  const pageSize = urlState.pageSize
  const requestFilters = appliedFilters
  const hasSearchQuery = searchParams.toString().length > 0
  const updateFilter = useCallback(
    <K extends keyof ProvincialOfferSearchFilters>(
      key: K,
      value: ProvincialOfferSearchFilters[K],
    ) => {
      setFilters((currentFilters) => ({ ...currentFilters, [key]: value }))
    },
    [setFilters],
  )

  const selectedRegions = useMemo(
    () => mapSelectedOptionsById(filters.region, regionOptions, (id) => `Region ${id}`),
    [filters.region, regionOptions],
  )

  const hasDateValidationError = useMemo(() => {
    return hasInvalidIsoDateValue(
      filters.listingFromDate,
      filters.listingToDate,
      filters.withdrawalFromDate,
      filters.withdrawalToDate,
    )
  }, [
    filters.listingFromDate,
    filters.listingToDate,
    filters.withdrawalFromDate,
    filters.withdrawalToDate,
  ])

  const beginSearchRequest = useLatestRequestGuard()
  const commitResults = useCallback((nextResults: ProvincialOfferSearchResponse) => {
    setResults(nextResults)
  }, [])

  const runSearch = useCallback(
    async (request: ProvincialOfferSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheGeneration = getPageDataCacheGeneration()
      const pageCacheKey = buildPageDataCacheKey(
        'provincial-offer-search',
        capabilities?.principal,
        request,
      )
      const isLatestRequest = beginSearchRequest()
      if (!options.force) {
        const cachedResults = getPageDataCache<ProvincialOfferSearchResponse>(pageCacheKey)
        if (cachedResults) {
          setCachedSearchTotal(
            totalCacheRef.current,
            buildSearchTotalCacheKey(request.filters),
            cachedResults.page.totalElements,
          )
          prefetchAdjacentSearchPages({
            pageId: 'provincial-offer-search',
            principal: capabilities?.principal,
            request,
            response: cachedResults,
            search: searchProvincialOffers,
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
          request.filters.listingFromDate,
          request.filters.listingToDate,
          request.filters.withdrawalFromDate,
          request.filters.withdrawalToDate,
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
          response: ProvincialOfferSearchResponse,
          totalIsExact: boolean,
        ) => {
          if (pageCacheGeneration !== getPageDataCacheGeneration()) {
            return
          }
          if (totalIsExact) {
            if (!setPageDataCache(pageCacheKey, response, pageCacheGeneration)) {
              return
            }
            setCachedSearchTotal(totalCacheRef.current, totalCacheKey, response.page.totalElements)
            prefetchAdjacentSearchPages({
              pageId: 'provincial-offer-search',
              principal: capabilities?.principal,
              request,
              response,
              search: searchProvincialOffers,
              onError: console.error,
            })
          }
          queueMicrotask(() => {
            if (isLatestRequest() && pageCacheGeneration === getPageDataCacheGeneration()) {
              commitResults(response)
            }
          })
        }
        const { response, totalIsExact } = await loadSearchWithDeferredTotal({
          request,
          cachedTotal,
          search: searchProvincialOffers,
          count: countProvincialOffers,
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
          setErrorMessage('Unable to retrieve offer search results.')
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
    if (!hasSearchQuery) {
      return
    }

    void runSearch({
      filters: requestFilters,
      page: urlState.page - 1,
      pageSize: urlState.pageSize,
      sortField: urlState.sortField,
      sortDirection: urlState.sortDirection,
    })
  }, [
    hasSearchQuery,
    requestFilters,
    runSearch,
    urlState.page,
    urlState.pageSize,
    urlState.sortDirection,
    urlState.sortField,
  ])

  useEffect(() => {
    const loadOptions = async () => {
      const [offerResult, applicationResult] = await Promise.allSettled([
        fetchProvincialOfferOptions(),
        fetchProvincialApplicationOptions(),
      ])

      if (offerResult.status === 'fulfilled') {
        setRegionOptions(mapValueLabelOptionsToIdTextOptions(offerResult.value.regions))
        setOfferOptionsUnavailable(false)
      } else {
        setOfferOptionsUnavailable(true)
      }
      if (applicationResult.status === 'fulfilled') {
        setDefaultListingToDate(
          applicationResult.value.currentSchedules.find((option) => option.value.trim())?.label ??
            formatBusinessIsoDate(),
        )
        setApplicationOptionsUnavailable(false)
      } else {
        setApplicationOptionsUnavailable(true)
      }
      setIsOptionsLoaded(true)
    }

    void loadOptions()
  }, [])

  useEffect(() => {
    if (!isOptionsLoaded) {
      return
    }

    const hasSearchQuery = searchParams.toString().length > 0
    if (!hasSearchQuery) {
      setSearchParams(
        buildSearchParams(
          {
            ...INITIAL_FILTERS,
            listingToDate: defaultListingToDate,
          },
          DEFAULT_SORT_FIELD,
          DEFAULT_SORT_DIRECTION,
          DEFAULT_SEARCH_PAGE,
          DEFAULT_SEARCH_PAGE_SIZE,
        ),
        { replace: true },
      )
    }
  }, [defaultListingToDate, isOptionsLoaded, searchParams, setSearchParams])

  const onSearch = () => {
    if (loading || hasDateValidationError) {
      return
    }
    const nextSearchParams = buildSearchParams(
      filters,
      sortField,
      sortDirection,
      DEFAULT_SEARCH_PAGE,
      pageSize,
    )
    if (nextSearchParams.toString() === searchParams.toString()) {
      void runSearch(
        {
          filters,
          page: DEFAULT_SEARCH_PAGE - 1,
          pageSize,
          sortField,
          sortDirection,
        },
        { force: true },
      )
      return
    }
    setSearchParams(nextSearchParams)
  }

  const onClearFilters = () => {
    setFilters(INITIAL_FILTERS)
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

  const onHeaderClick = (column: ProvincialOfferSearchSortField) => {
    const nextDirection = getNextSortDirection(sortField, sortDirection, column)
    setSearchParams(
      buildSearchParams(appliedFilters, column, nextDirection, DEFAULT_SEARCH_PAGE, pageSize),
    )
  }

  return (
    <Grid fullWidth className="default-grid provincial-offer-search-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Provincial offers search"
          subtitle="Find provincial purchase offers and open offer details."
        />
      </Column>

      {(offerOptionsUnavailable || applicationOptionsUnavailable) && (
        <AuthoritativeOptionsUnavailableNotification />
      )}

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters provincial-offer-search-filters">
          <Tile>
            <form
              className="legacy-search-form"
              onSubmit={(event) => {
                event.preventDefault()
                onSearch()
              }}
            >
              <div className="legacy-search-grid provincial-offer-search-grid">
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
                <TextInput
                  id="clientNumber"
                  labelText="Client number"
                  value={filters.clientNumber}
                  onChange={(event) => updateFilter('clientNumber', event.target.value)}
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
                <RegionMultiSelect
                  id="region"
                  titleText="Region"
                  items={regionOptions}
                  placeholder="Select region(s)"
                  selectedItems={selectedRegions}
                  disabled={!isOptionsLoaded || offerOptionsUnavailable}
                  onChange={(nextSelected) => {
                    updateFilter(
                      'region',
                      nextSelected.map((item) => item.id),
                    )
                  }}
                />
                <IsoDatePicker
                  id="withdrawalFromDate"
                  labelText="Withdrawn from date"
                  value={filters.withdrawalFromDate}
                  invalid={!isValidIsoDate(filters.withdrawalFromDate)}
                  invalidText="Date must be YYYY-MM-DD"
                  onChange={(value) => updateFilter('withdrawalFromDate', value)}
                />
                <IsoDatePicker
                  id="withdrawalToDate"
                  labelText="Withdrawn to date"
                  value={filters.withdrawalToDate}
                  invalid={!isValidIsoDate(filters.withdrawalToDate)}
                  invalidText="Date must be YYYY-MM-DD"
                  onChange={(value) => updateFilter('withdrawalToDate', value)}
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
                  Clear Filters
                </Button>
                <SearchSubmitButton loading={loading} disabled={hasDateValidationError} />
                {canCreateOffer && (
                  <Link className="cds--link" to="/provincial/offers/create">
                    Add Offer
                  </Link>
                )}
              </div>
            </form>
          </Tile>
        </section>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section
          className="legacy-search-section legacy-search-section--results"
          aria-label="Search results"
        >
          <SearchResultsTableFrame
            loading={loading}
            loadingDescription="Loading offer search results..."
            totalItems={
              errorMessage || (loading && results.content.length === 0)
                ? undefined
                : results.page.totalElements
            }
          >
            {errorMessage ? (
              <EmptyState
                role="alert"
                title="Offer search unavailable"
                description={errorMessage}
              />
            ) : results.content.length > 0 ? (
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
                        </button>
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.content.map((row) => (
                    <TableRow key={row.offerNumber}>
                      <TableCell>
                        <Link
                          className="cds--link"
                          to={withCurrentSearch(`/provincial/offers/${row.offerNumber}`)}
                        >
                          {row.offerNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{row.applicationNumber}</TableCell>
                      <TableCell>{row.packageNumber || 'No Packages'}</TableCell>
                      <TableCell className="legacy-search-table-date">{row.listingDate}</TableCell>
                      <TableCell>{row.region}</TableCell>
                      <TableCell className="legacy-search-table-date">
                        {row.offerWithdrawalDate || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : !loading ? (
              <EmptyState
                title="No offers found"
                description="No offers found for the selected criteria."
              />
            ) : null}
            {!errorMessage && (!loading || results.content.length > 0) && (
              <Pagination
                page={results.page.number + 1}
                pageSize={results.page.size}
                pageSizes={[...SEARCH_PAGE_SIZE_OPTIONS]}
                totalItems={results.page.totalElements}
                onChange={({ page, pageSize: nextPageSize }) => {
                  setSearchParams(
                    buildSearchParams(appliedFilters, sortField, sortDirection, page, nextPageSize),
                  )
                }}
              />
            )}
          </SearchResultsTableFrame>
        </section>
      </Column>
    </Grid>
  )
}

export default ProvincialOffersPage
