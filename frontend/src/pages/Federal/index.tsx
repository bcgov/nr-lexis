import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  Pagination,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextInput,
  Tile,
} from '@carbon/react'
import type {
  FederalApplicationSearchFilters,
  FederalApplicationSearchRequest,
  FederalApplicationSearchResponse,
  FederalApplicationSearchSortField,
} from '@/interfaces/FederalApplicationSearch'
import {
  parseEnumParam,
  parsePositiveIntParam,
  parseSortDirectionParam,
  setSearchParam,
} from '@/pages/shared/search-query-utils'
import { searchFederalApplications } from '@/service/federal-application-search-service'
import { fetchFederalApplicationOptions, type SearchOption } from '@/service/search-options-service'

const FALLBACK_APPLICATION_STATUS_OPTIONS: SearchOption[] = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Submitted', label: 'Submitted' },
  { value: 'Returned', label: 'Returned' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Closed', label: 'Closed' },
]

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

const EMPTY_RESULTS: FederalApplicationSearchResponse = {
  content: [],
  page: {
    number: 0,
    size: 10,
    totalElements: 0,
    totalPages: 1,
  },
}

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 20, 30] as const
const SORT_COLUMNS: {
  id: FederalApplicationSearchSortField
  label: string
}[] = [
  { id: 'federalApplicationNumber', label: 'Application' },
  { id: 'status', label: 'Status' },
  { id: 'clientNumber', label: 'Client' },
  { id: 'reason', label: 'Reason' },
  { id: 'receivedDate', label: 'Received Date' },
  { id: 'listingDate', label: 'Listing Date' },
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
): URLSearchParams => {
  const params = new URLSearchParams()

  setSearchParam(params, 'applicationNumber', filters.applicationNumber)
  setSearchParam(params, 'packageNumber', filters.packageNumber)
  setSearchParam(params, 'applicationStatus', filters.applicationStatus)
  setSearchParam(params, 'clientNumber', filters.clientNumber)
  setSearchParam(params, 'receivedFromDate', filters.receivedFromDate)
  setSearchParam(params, 'receivedToDate', filters.receivedToDate)
  setSearchParam(params, 'listingFromDate', filters.listingFromDate)
  setSearchParam(params, 'listingToDate', filters.listingToDate)
  setSearchParam(params, 'sortField', sortField)
  setSearchParam(params, 'sortDirection', sortDirection)
  setSearchParam(params, 'page', page)
  setSearchParam(params, 'pageSize', pageSize)

  return params
}

const isValidIsoDate = (value: string): boolean => {
  if (!value.trim()) return true
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)
}

const FederalPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [applicationStatusOptions, setApplicationStatusOptions] = useState<SearchOption[]>(
    FALLBACK_APPLICATION_STATUS_OPTIONS,
  )
  const [results, setResults] = useState<FederalApplicationSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
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
  const filters = urlState.filters
  const sortField = urlState.sortField
  const sortDirection = urlState.sortDirection
  const pageSize = urlState.pageSize
  const updateFilter = useCallback(
    (key: keyof FederalApplicationSearchFilters, value: string) => {
      const nextFilters = { ...filters, [key]: value }
      setSearchParams(
        buildSearchParams(nextFilters, sortField, sortDirection, DEFAULT_PAGE, pageSize),
        { replace: true },
      )
    },
    [filters, pageSize, setSearchParams, sortDirection, sortField],
  )

  const hasDateValidationError = useMemo(() => {
    return (
      !isValidIsoDate(filters.receivedFromDate) ||
      !isValidIsoDate(filters.receivedToDate) ||
      !isValidIsoDate(filters.listingFromDate) ||
      !isValidIsoDate(filters.listingToDate)
    )
  }, [
    filters.receivedFromDate,
    filters.receivedToDate,
    filters.listingFromDate,
    filters.listingToDate,
  ])

  const runSearch = useCallback(async (request: FederalApplicationSearchRequest) => {
    if (
      !isValidIsoDate(request.filters.receivedFromDate) ||
      !isValidIsoDate(request.filters.receivedToDate) ||
      !isValidIsoDate(request.filters.listingFromDate) ||
      !isValidIsoDate(request.filters.listingToDate)
    ) {
      return
    }

    setLoading(true)
    setErrorMessage('')
    try {
      const response = await searchFederalApplications(request)
      setResults(response)
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to retrieve federal application search results.')
      setResults(EMPTY_RESULTS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void runSearch({
      filters: urlState.filters,
      sortField: urlState.sortField,
      sortDirection: urlState.sortDirection,
      page: urlState.page - 1,
      pageSize: urlState.pageSize,
    })
  }, [runSearch, urlState])

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchFederalApplicationOptions()
      if (options.applicationStatuses.length > 0) {
        setApplicationStatusOptions(options.applicationStatuses)
      }
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

  const onHeaderClick = (column: FederalApplicationSearchSortField) => {
    const nextDirection = sortField === column && sortDirection === 'asc' ? 'desc' : 'asc'
    setSearchParams(buildSearchParams(filters, column, nextDirection, DEFAULT_PAGE, pageSize))
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Federal Application Search</h1>
        <p>
          Migrated from <code>src/main/webapp/WEB-INF/jsp/federal/application/search.jsp</code> and{' '}
          <code>src/main/webapp/javascript/federal/search.js</code>.
        </p>
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
            <Select
              id="applicationStatus"
              labelText="Application Status"
              value={filters.applicationStatus}
              onChange={(event) => updateFilter('applicationStatus', event.target.value)}
            >
              <SelectItem text="All statuses" value="" />
              {applicationStatusOptions.map((option) => (
                <SelectItem key={option.value} text={option.label} value={option.value} />
              ))}
            </Select>
            <TextInput
              id="clientNumber"
              labelText="Client Number"
              value={filters.clientNumber}
              onChange={(event) => updateFilter('clientNumber', event.target.value)}
            />
            <TextInput
              id="receivedFromDate"
              labelText="Received From Date (YYYY-MM-DD)"
              value={filters.receivedFromDate}
              invalid={!isValidIsoDate(filters.receivedFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) => updateFilter('receivedFromDate', event.target.value)}
            />
            <TextInput
              id="receivedToDate"
              labelText="Received To Date (YYYY-MM-DD)"
              value={filters.receivedToDate}
              invalid={!isValidIsoDate(filters.receivedToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) => updateFilter('receivedToDate', event.target.value)}
            />
            <TextInput
              id="listingFromDate"
              labelText="Listing From Date (YYYY-MM-DD)"
              value={filters.listingFromDate}
              invalid={!isValidIsoDate(filters.listingFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) => updateFilter('listingFromDate', event.target.value)}
            />
            <TextInput
              id="listingToDate"
              labelText="Listing To Date (YYYY-MM-DD)"
              value={filters.listingToDate}
              invalid={!isValidIsoDate(filters.listingToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) => updateFilter('listingToDate', event.target.value)}
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
      </Column>

      <Column sm={4} md={8} lg={16}>
        <h2 className="dashboard-title">Search Results</h2>
        {loading && <InlineLoading description="Loading federal application search results..." />}
        {!!errorMessage && <p className="legacy-search-error">{errorMessage}</p>}
        {!loading && (
          <>
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
                  </TableRow>
                ))}
                {results.content.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      No federal applications found for the selected criteria.
                    </TableCell>
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
          </>
        )}
      </Column>
    </Grid>
  )
}

export default FederalPage
