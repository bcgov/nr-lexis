import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
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
import SearchResultsTableFrame from '@/components/SearchResultsTableFrame'
import IsoDatePicker from '@/components/IsoDatePicker'
import type {
  ProvincialOfferSearchFilters,
  ProvincialOfferSearchRequest,
  ProvincialOfferSearchResponse,
  ProvincialOfferSearchSortField,
} from '@/interfaces/ProvincialOfferSearch'
import { useAuth } from '@/context/auth/useAuth'
import { isValidIsoDate } from '@/pages/shared/create-form-utils'
import {
  buildPageDataCacheKey,
  getPageDataCache,
  setPageDataCache,
} from '@/pages/shared/page-data-cache'
import {
  mapSelectedOptionsById,
  parseCsvParam,
  parseEnumParam,
  parsePositiveIntParam,
  parseSortDirectionParam,
  setSearchParam,
} from '@/pages/shared/search-query-utils'
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { searchProvincialOffers } from '@/service/provincial-offer-search-service'
import {
  fetchProvincialApplicationOptions,
  fetchProvincialOfferOptions,
} from '@/service/search-options-service'

type RegionOption = {
  id: string
  text: string
}

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

const EMPTY_RESULTS: ProvincialOfferSearchResponse = {
  content: [],
  page: {
    number: 0,
    size: 10,
    totalElements: 0,
    totalPages: 1,
  },
}

const SORT_COLUMNS: {
  id: ProvincialOfferSearchSortField
  label: string
}[] = [
  { id: 'offerNumber', label: 'Offer' },
  { id: 'applicationNumber', label: 'Application' },
  { id: 'packageNumber', label: 'Package' },
  { id: 'listingDate', label: 'Listing Date' },
  { id: 'region', label: 'Natural Resource Region Code' },
  { id: 'offerWithdrawalDate', label: 'Offer Withdrawn Date' },
]

const DEFAULT_SORT_FIELD: ProvincialOfferSearchSortField = 'listingDate'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'asc'
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 20, 30] as const
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ProvincialOfferSearchSortField[]
const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${(date.getMonth() + 1).toString().padStart(2, '0')}`
  const day = `${date.getDate().toString().padStart(2, '0')}`
  return `${year}-${month}-${day}`
}

const buildSearchParams = (
  filters: ProvincialOfferSearchFilters,
  sortField: ProvincialOfferSearchSortField,
  sortDirection: 'asc' | 'desc',
  page: number,
  pageSize: number,
): URLSearchParams => {
  const params = new URLSearchParams()

  setSearchParam(params, 'applicationNumber', filters.applicationNumber)
  setSearchParam(params, 'packageNumber', filters.packageNumber)
  setSearchParam(params, 'clientNumber', filters.clientNumber)
  setSearchParam(params, 'listingFromDate', filters.listingFromDate)
  setSearchParam(params, 'listingToDate', filters.listingToDate)
  setSearchParam(params, 'region', filters.region)
  setSearchParam(params, 'withdrawalFromDate', filters.withdrawalFromDate)
  setSearchParam(params, 'withdrawalToDate', filters.withdrawalToDate)
  setSearchParam(params, 'sortField', sortField)
  setSearchParam(params, 'sortDirection', sortDirection)
  setSearchParam(params, 'page', page)
  setSearchParam(params, 'pageSize', pageSize)

  return params
}

const ProvincialOffersPage: FC = () => {
  const { capabilities, canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([])
  const [results, setResults] = useState<ProvincialOfferSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [defaultListingToDate, setDefaultListingToDate] = useState('')
  const [isOptionsLoaded, setIsOptionsLoaded] = useState(false)
  const canCreateOffer = canPerform('createOffer')
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
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

    const parsedPageSize = parsePositiveIntParam(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE)

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
      page: parsePositiveIntParam(searchParams.get('page'), DEFAULT_PAGE),
      pageSize: PAGE_SIZE_OPTIONS.includes(parsedPageSize as (typeof PAGE_SIZE_OPTIONS)[number])
        ? parsedPageSize
        : DEFAULT_PAGE_SIZE,
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
        buildSearchParams(nextFilters, sortField, sortDirection, DEFAULT_PAGE, pageSize),
        { replace: true },
      )
    },
    [filters, pageSize, setSearchParams, sortDirection, sortField],
  )

  const selectedRegions = useMemo(
    () => mapSelectedOptionsById(filters.region, regionOptions, (id) => `Region ${id}`),
    [filters.region, regionOptions],
  )

  const hasDateValidationError = useMemo(() => {
    return (
      !isValidIsoDate(filters.listingFromDate) ||
      !isValidIsoDate(filters.listingToDate) ||
      !isValidIsoDate(filters.withdrawalFromDate) ||
      !isValidIsoDate(filters.withdrawalToDate)
    )
  }, [
    filters.listingFromDate,
    filters.listingToDate,
    filters.withdrawalFromDate,
    filters.withdrawalToDate,
  ])

  const beginSearchRequest = useLatestRequestGuard()

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
          setResults(cachedResults)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      const isLatestRequest = beginSearchRequest()
      if (
        !isValidIsoDate(request.filters.listingFromDate) ||
        !isValidIsoDate(request.filters.listingToDate) ||
        !isValidIsoDate(request.filters.withdrawalFromDate) ||
        !isValidIsoDate(request.filters.withdrawalToDate)
      ) {
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      try {
        const response = await searchProvincialOffers(request)
        if (isLatestRequest()) {
          setPageDataCache(pageCacheKey, response)
          setResults(response)
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
    [beginSearchRequest, capabilities?.principal],
  )

  useEffect(() => {
    void runSearch({
      filters: debouncedUrlState.filters,
      page: debouncedUrlState.page - 1,
      pageSize: debouncedUrlState.pageSize,
      sortField: debouncedUrlState.sortField,
      sortDirection: debouncedUrlState.sortDirection,
    })
  }, [debouncedUrlState, runSearch])

  useEffect(() => {
    const loadOptions = async () => {
      const [offerOptions, applicationOptions] = await Promise.all([
        fetchProvincialOfferOptions(),
        fetchProvincialApplicationOptions(),
      ])
      setRegionOptions(
        offerOptions.regions.map((option) => ({
          id: option.value,
          text: `${option.label} (${option.value})`,
        })),
      )
      setDefaultListingToDate(
        applicationOptions.currentSchedules[0]?.value ?? formatDate(new Date()),
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
          { ...INITIAL_FILTERS, listingToDate: defaultListingToDate },
          DEFAULT_SORT_FIELD,
          DEFAULT_SORT_DIRECTION,
          DEFAULT_PAGE,
          DEFAULT_PAGE_SIZE,
        ),
        { replace: true },
      )
    }
  }, [defaultListingToDate, isOptionsLoaded, searchParams, setSearchParams])

  const onSearch = () => {
    setSearchParams(buildSearchParams(filters, sortField, sortDirection, DEFAULT_PAGE, pageSize))
  }

  const onClearFilters = () => {
    setSearchParams(
      buildSearchParams(
        INITIAL_FILTERS,
        DEFAULT_SORT_FIELD,
        DEFAULT_SORT_DIRECTION,
        DEFAULT_PAGE,
        DEFAULT_PAGE_SIZE,
      ),
    )
  }

  const onHeaderClick = (column: ProvincialOfferSearchSortField) => {
    const nextDirection = sortField === column && sortDirection === 'asc' ? 'desc' : 'asc'
    setSearchParams(buildSearchParams(filters, column, nextDirection, DEFAULT_PAGE, pageSize))
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial Offers Search</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-grid">
            <TextInput
              id="applicationNumber"
              labelText="Application Number"
              value={filters.applicationNumber}
              onChange={(event) => updateFilter('applicationNumber', event.target.value)}
            />
            <TextInput
              id="packageNumber"
              labelText="Package Number"
              value={filters.packageNumber}
              onChange={(event) => updateFilter('packageNumber', event.target.value)}
            />
            <TextInput
              id="clientNumber"
              labelText="Client Number"
              value={filters.clientNumber}
              onChange={(event) => updateFilter('clientNumber', event.target.value)}
            />
            <IsoDatePicker
              id="listingFromDate"
              labelText="Listing From Date (YYYY-MM-DD)"
              value={filters.listingFromDate}
              invalid={!isValidIsoDate(filters.listingFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(value) => updateFilter('listingFromDate', value)}
            />
            <IsoDatePicker
              id="listingToDate"
              labelText="Listing To Date (YYYY-MM-DD)"
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
              label="Select region(s)"
              selectionFeedback="fixed"
              selectedItems={selectedRegions}
              onChange={(event) => {
                const nextSelected = (event.selectedItems ?? []) as RegionOption[]
                updateFilter(
                  'region',
                  nextSelected.map((item) => item.id),
                )
              }}
            />
            <IsoDatePicker
              id="withdrawalFromDate"
              labelText="Withdrawn From Date (YYYY-MM-DD)"
              value={filters.withdrawalFromDate}
              invalid={!isValidIsoDate(filters.withdrawalFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(value) => updateFilter('withdrawalFromDate', value)}
            />
            <IsoDatePicker
              id="withdrawalToDate"
              labelText="Withdrawn To Date (YYYY-MM-DD)"
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
      </Column>

      <Column sm={4} md={8} lg={16}>
        <h2 className="dashboard-title">Search Results</h2>
        {!!errorMessage && <p className="legacy-search-error">{errorMessage}</p>}
        <SearchResultsTableFrame
          loading={loading}
          loadingDescription="Loading offer search results..."
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
            pageSizes={[10, 20, 30]}
            totalItems={results.page.totalElements}
            onChange={({ page, pageSize: nextPageSize }) => {
              setSearchParams(
                buildSearchParams(filters, sortField, sortDirection, page, nextPageSize),
              )
            }}
          />
        </SearchResultsTableFrame>
      </Column>
    </Grid>
  )
}

export default ProvincialOffersPage
