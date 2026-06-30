import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Button,
  Column,
  Grid,
  FilterableMultiSelect,
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
import IsoDatePicker from '../../components/IsoDatePicker'
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
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { loadSearchWithDeferredTotal } from '@/pages/shared/deferred-search-total'
import {
  countProvincialOffers,
  searchProvincialOffers,
} from '@/service/provincial-offer-search-service'
import {
  fetchProvincialApplicationOptions,
  fetchProvincialOfferOptions,
} from '@/service/search-options-service'
import { formatLocalIsoDate } from '@/utils/date'

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
  const debouncedUrlState = useDebouncedValue(urlState)
  const filters = urlState.filters
  const sortField = urlState.sortField
  const sortDirection = urlState.sortDirection
  const pageSize = urlState.pageSize
  const updateFilter = useCallback(
    <K extends keyof ProvincialOfferSearchFilters>(
      key: K,
      value: ProvincialOfferSearchFilters[K],
    ) => {
      const nextFilters = {
        ...filters,
        [key]: value,
      }
      setSearchParams(
        buildSearchParams(nextFilters, sortField, sortDirection, DEFAULT_SEARCH_PAGE, pageSize),
        { replace: true },
      )
    },
    [filters, pageSize, setSearchParams, sortDirection, sortField],
  )

  const selectedRegions = useMemo(
    () => mapSelectedOptionsById(filters.region, regionOptions, (id) => `Region ${id}`),
    [filters.region, regionOptions],
  )
  const selectedRegionHelperText =
    selectedRegions.length > 0
      ? `Selected: ${selectedRegions.map((region) => region.text).join(', ')}`
      : undefined

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
      const pageCacheKey = buildPageDataCacheKey(
        'provincial-offer-search',
        capabilities?.principal,
        request,
      )
      if (!options.force) {
        const cachedResults = getPageDataCache<ProvincialOfferSearchResponse>(pageCacheKey)
        if (cachedResults) {
          setCachedSearchTotal(
            totalCacheRef.current,
            buildSearchTotalCacheKey(request.filters),
            cachedResults.page.totalElements,
          )
          setResults(cachedResults)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      const isLatestRequest = beginSearchRequest()
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
        const cachedTotal = getCachedSearchTotal(totalCacheRef.current, totalCacheKey)
        const commitSearchResponse = (
          response: ProvincialOfferSearchResponse,
          totalIsExact: boolean,
        ) => {
          if (totalIsExact) {
            setCachedSearchTotal(totalCacheRef.current, totalCacheKey, response.page.totalElements)
            setPageDataCache(pageCacheKey, response)
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
    if (searchParams.toString().length === 0) {
      return
    }

    void runSearch({
      filters: debouncedUrlState.filters,
      page: debouncedUrlState.page - 1,
      pageSize: debouncedUrlState.pageSize,
      sortField: debouncedUrlState.sortField,
      sortDirection: debouncedUrlState.sortDirection,
    })
  }, [debouncedUrlState, runSearch, searchParams])

  useEffect(() => {
    const loadOptions = async () => {
      const [offerOptions, applicationOptions] = await Promise.all([
        fetchProvincialOfferOptions(),
        fetchProvincialApplicationOptions(),
      ])
      setRegionOptions(mapValueLabelOptionsToIdTextOptions(offerOptions.regions))
      setDefaultListingToDate(
        applicationOptions.currentSchedules.find((option) => option.value.trim())?.label ??
          formatLocalIsoDate(new Date()),
      )
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

  const onHeaderClick = (column: ProvincialOfferSearchSortField) => {
    const nextDirection = getNextSortDirection(sortField, sortDirection, column)
    setSearchParams(
      buildSearchParams(filters, column, nextDirection, DEFAULT_SEARCH_PAGE, pageSize),
    )
  }

  return (
    <Grid fullWidth className="default-grid provincial-offer-search-page">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial offers search</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters provincial-offer-search-filters">
          <Tile>
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
              <FilterableMultiSelect
                id="region"
                titleText="Region"
                items={regionOptions}
                itemToString={(item) => (item ? item.text : '')}
                placeholder="Select region(s)"
                helperText={selectedRegionHelperText}
                selectedItems={selectedRegions}
                onChange={(event) => {
                  const nextSelected = (event.selectedItems ?? []) as IdTextOption[]
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
              {canCreateOffer && (
                <Link className="cds--link" to="/provincial/offers/create">
                  Add Offer
                </Link>
              )}
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
            loadingDescription="Loading offer search results..."
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
                    <TableCell>{row.listingDate}</TableCell>
                    <TableCell>{row.region}</TableCell>
                    <TableCell>{row.offerWithdrawalDate || '-'}</TableCell>
                  </TableRow>
                ))}
                {results.content.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>No offers found for the selected criteria.</TableCell>
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

export default ProvincialOffersPage
