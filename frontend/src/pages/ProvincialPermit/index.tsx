import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react'
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
import SearchableSelect from '@/components/SearchableSelect'
import type {
  ProvincialPermitSearchFilters,
  ProvincialPermitSearchRequest,
  ProvincialPermitSearchResponse,
  ProvincialPermitSearchSortField,
} from '@/interfaces/ProvincialPermitSearch'
import { useAuth } from '@/context/auth/useAuth'
import {
  parseCsvParam,
  parseEnumParam,
  parsePositiveIntParam,
  parseSortDirectionParam,
  setSearchParam,
} from '@/pages/shared/search-query-utils'
import {
  buildPageDataCacheKey,
  getPageDataCache,
  setPageDataCache,
} from '@/pages/shared/page-data-cache'
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { searchProvincialPermits } from '@/service/provincial-permit-search-service'
import { fetchProvincialPermitOptions, type SearchOption } from '@/service/search-options-service'

type RegionOption = {
  id: string
  text: string
}

const INITIAL_FILTERS: ProvincialPermitSearchFilters = {
  applicationNumber: '',
  packageNumber: '',
  region: [],
  issuedFromDate: '',
  issuedToDate: '',
  permitStatus: '',
  permitNumber: '',
  ownerClientNumber: '',
  applicantClientNumber: '',
}

const EMPTY_RESULTS: ProvincialPermitSearchResponse = {
  content: [],
  page: {
    number: 0,
    size: 10,
    totalElements: 0,
    totalPages: 1,
  },
}

const isValidIsoDate = (value: string): boolean => {
  if (!value.trim()) return true
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)
}

const SORT_COLUMNS: {
  id: ProvincialPermitSearchSortField
  label: string
}[] = [
  { id: 'permitNumber', label: 'Permit' },
  { id: 'status', label: 'Status' },
  { id: 'applicantClientNumber', label: 'Applicant Client Nbr' },
  { id: 'ownerClientNumber', label: 'Owner Client Nbr' },
  { id: 'totalVolume', label: 'Total Volume (m³)' },
  { id: 'issueDate', label: 'Issue Date' },
  { id: 'region', label: 'Region' },
]

const DEFAULT_SORT_FIELD: ProvincialPermitSearchSortField = 'permitNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'asc'
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 20, 30] as const
const PERMIT_TOTAL_CACHE_TTL_MS = 60_000
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ProvincialPermitSearchSortField[]

type PermitTotalCacheEntry = {
  total: number
  expiresAt: number
}

const trimFilterValue = (value: string): string => value.trim()

const buildPermitTotalCacheKey = (filters: ProvincialPermitSearchFilters): string =>
  JSON.stringify({
    applicationNumber: trimFilterValue(filters.applicationNumber),
    packageNumber: trimFilterValue(filters.packageNumber),
    region: filters.region.map(trimFilterValue).filter(Boolean).sort(),
    issuedFromDate: trimFilterValue(filters.issuedFromDate),
    issuedToDate: trimFilterValue(filters.issuedToDate),
    permitStatus: trimFilterValue(filters.permitStatus),
    permitNumber: trimFilterValue(filters.permitNumber),
    ownerClientNumber: trimFilterValue(filters.ownerClientNumber),
    applicantClientNumber: trimFilterValue(filters.applicantClientNumber),
  })

const buildSearchParams = (
  filters: ProvincialPermitSearchFilters,
  sortField: ProvincialPermitSearchSortField,
  sortDirection: 'asc' | 'desc',
  page: number,
  pageSize: number,
): URLSearchParams => {
  const params = new URLSearchParams()

  setSearchParam(params, 'applicationNumber', filters.applicationNumber)
  setSearchParam(params, 'packageNumber', filters.packageNumber)
  setSearchParam(params, 'region', filters.region)
  setSearchParam(params, 'issuedFromDate', filters.issuedFromDate)
  setSearchParam(params, 'issuedToDate', filters.issuedToDate)
  setSearchParam(params, 'permitStatus', filters.permitStatus)
  setSearchParam(params, 'permitNumber', filters.permitNumber)
  setSearchParam(params, 'ownerClientNumber', filters.ownerClientNumber)
  setSearchParam(params, 'applicantClientNumber', filters.applicantClientNumber)
  setSearchParam(params, 'sortField', sortField)
  setSearchParam(params, 'sortDirection', sortDirection)
  setSearchParam(params, 'page', page)
  setSearchParam(params, 'pageSize', pageSize)

  return params
}

const mapSelectedRegions = (regionIds: string[], regionOptions: RegionOption[]): RegionOption[] => {
  const optionMap = new Map(regionOptions.map((option) => [option.id, option]))
  return regionIds.map((regionId) => optionMap.get(regionId) ?? { id: regionId, text: regionId })
}

const ProvincialPermitPage: FC = () => {
  const { capabilities, canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([])
  const [permitStatusOptions, setPermitStatusOptions] = useState<SearchOption[]>([])
  const [results, setResults] = useState<ProvincialPermitSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const permitTotalCacheRef = useRef<Map<string, PermitTotalCacheEntry>>(new Map())
  const canCreatePermit = canPerform('createPermit')
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
    [searchParams],
  )

  const urlState = useMemo(() => {
    const urlFilters: ProvincialPermitSearchFilters = {
      applicationNumber: searchParams.get('applicationNumber') ?? '',
      packageNumber: searchParams.get('packageNumber') ?? '',
      region: parseCsvParam(searchParams.get('region')),
      issuedFromDate: searchParams.get('issuedFromDate') ?? '',
      issuedToDate: searchParams.get('issuedToDate') ?? '',
      permitStatus: searchParams.get('permitStatus') ?? '',
      permitNumber: searchParams.get('permitNumber') ?? '',
      ownerClientNumber: searchParams.get('ownerClientNumber') ?? '',
      applicantClientNumber: searchParams.get('applicantClientNumber') ?? '',
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
    <K extends keyof ProvincialPermitSearchFilters>(
      key: K,
      value: ProvincialPermitSearchFilters[K],
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
    () => mapSelectedRegions(filters.region, regionOptions),
    [filters.region, regionOptions],
  )

  const hasDateValidationError = useMemo(() => {
    return !isValidIsoDate(filters.issuedFromDate) || !isValidIsoDate(filters.issuedToDate)
  }, [filters.issuedFromDate, filters.issuedToDate])

  const beginSearchRequest = useLatestRequestGuard()

  const runSearch = useCallback(
    async (request: ProvincialPermitSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheKey = buildPageDataCacheKey(
        'provincial-permit-search',
        capabilities?.principal,
        request,
      )
      if (!options.force) {
        const cachedResults = getPageDataCache<ProvincialPermitSearchResponse>(pageCacheKey)
        if (cachedResults) {
          permitTotalCacheRef.current.set(buildPermitTotalCacheKey(request.filters), {
            total: cachedResults.page.totalElements,
            expiresAt: Date.now() + PERMIT_TOTAL_CACHE_TTL_MS,
          })
          setResults(cachedResults)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      const isLatestRequest = beginSearchRequest()
      if (
        !isValidIsoDate(request.filters.issuedFromDate) ||
        !isValidIsoDate(request.filters.issuedToDate)
      ) {
        setLoading(false)
        return
      }
      setLoading(true)
      setErrorMessage('')
      try {
        const cacheKey = buildPermitTotalCacheKey(request.filters)
        const cachedEntry = permitTotalCacheRef.current.get(cacheKey)
        const cachedTotal =
          cachedEntry && cachedEntry.expiresAt > Date.now() ? cachedEntry.total : undefined
        if (cachedEntry && cachedTotal === undefined) {
          permitTotalCacheRef.current.delete(cacheKey)
        }

        const response =
          cachedTotal === undefined
            ? await searchProvincialPermits(request)
            : await searchProvincialPermits(request, { knownTotal: cachedTotal })
        if (isLatestRequest()) {
          permitTotalCacheRef.current.set(cacheKey, {
            total: response.page.totalElements,
            expiresAt: Date.now() + PERMIT_TOTAL_CACHE_TTL_MS,
          })
          setPageDataCache(pageCacheKey, response)
          setResults(response)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve permit search results.')
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
      const options = await fetchProvincialPermitOptions()
      setPermitStatusOptions(options.permitStatuses)
      setRegionOptions(
        options.regions.map((option) => ({
          id: option.value,
          text: `${option.label} (${option.value})`,
        })),
      )
    }

    void loadOptions()
  }, [])

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

  const onHeaderClick = (column: ProvincialPermitSearchSortField) => {
    const nextDirection = sortField === column && sortDirection === 'asc' ? 'desc' : 'asc'
    setSearchParams(buildSearchParams(filters, column, nextDirection, DEFAULT_PAGE, pageSize))
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial Permit Search</h1>
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
            <TextInput
              id="issuedFromDate"
              labelText="Issued From Date (YYYY-MM-DD)"
              value={filters.issuedFromDate}
              invalid={!isValidIsoDate(filters.issuedFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) => updateFilter('issuedFromDate', event.target.value)}
            />
            <TextInput
              id="issuedToDate"
              labelText="Issued To Date (YYYY-MM-DD)"
              value={filters.issuedToDate}
              invalid={!isValidIsoDate(filters.issuedToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) => updateFilter('issuedToDate', event.target.value)}
            />
            <SearchableSelect
              id="permitStatus"
              labelText="Permit Status"
              value={filters.permitStatus}
              placeholder="All statuses"
              options={permitStatusOptions}
              onChange={(value) => updateFilter('permitStatus', value)}
            />
            <TextInput
              id="permitNumber"
              labelText="Permit Number"
              value={filters.permitNumber}
              onChange={(event) => updateFilter('permitNumber', event.target.value)}
            />
            <TextInput
              id="applicantClientNumber"
              labelText="Applicant Client Number"
              value={filters.applicantClientNumber}
              onChange={(event) => updateFilter('applicantClientNumber', event.target.value)}
            />
            <TextInput
              id="ownerClientNumber"
              labelText="Owner Client Number"
              value={filters.ownerClientNumber}
              onChange={(event) => updateFilter('ownerClientNumber', event.target.value)}
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
            {canCreatePermit && (
              <Link className="cds--link" to="/provincial/permit/create">
                Add Permit
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
          loadingDescription="Loading permit search results..."
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
                <TableRow key={row.permitNumber}>
                  <TableCell>
                    <Link
                      className="cds--link"
                      to={withCurrentSearch(`/provincial/permit/${row.permitNumber}`)}
                    >
                      {row.permitNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.applicantClientNumber}</TableCell>
                  <TableCell>{row.ownerClientNumber}</TableCell>
                  <TableCell>{row.totalVolume}</TableCell>
                  <TableCell>{row.issueDate}</TableCell>
                  <TableCell>{row.region}</TableCell>
                </TableRow>
              ))}
              {results.content.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>No permits found for the selected criteria.</TableCell>
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

export default ProvincialPermitPage
