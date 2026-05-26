import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
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
import type {
  IndianReservePermitSearchFilters,
  IndianReservePermitSearchRequest,
  IndianReservePermitSearchResponse,
} from '@/interfaces/IndianReservePermitSearch'
import { useAuth } from '@/context/auth/useAuth'
import { parsePositiveIntParam, setSearchParam } from '@/pages/shared/search-query-utils'
import { searchIndianReservePermits } from '@/service/indian-reserve-permit-search-service'

const INITIAL_FILTERS: IndianReservePermitSearchFilters = {
  permitNumber: '',
  packageNumber: '',
  fromPermitIssueDate: '',
  toPermitIssueDate: '',
  fromEstimatedShippingDate: '',
  toEstimatedShippingDate: '',
}

const EMPTY_RESULTS: IndianReservePermitSearchResponse = {
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

const buildSearchParams = (
  filters: IndianReservePermitSearchFilters,
  page: number,
  pageSize: number,
): URLSearchParams => {
  const params = new URLSearchParams()

  setSearchParam(params, 'permitNumber', filters.permitNumber)
  setSearchParam(params, 'packageNumber', filters.packageNumber)
  setSearchParam(params, 'fromPermitIssueDate', filters.fromPermitIssueDate)
  setSearchParam(params, 'toPermitIssueDate', filters.toPermitIssueDate)
  setSearchParam(params, 'fromEstimatedShippingDate', filters.fromEstimatedShippingDate)
  setSearchParam(params, 'toEstimatedShippingDate', filters.toEstimatedShippingDate)
  setSearchParam(params, 'page', page)
  setSearchParam(params, 'pageSize', pageSize)

  return params
}

const isValidIsoDate = (value: string): boolean => {
  if (!value.trim()) return true
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)
}

const IndianReservePage: FC = () => {
  const { canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<IndianReservePermitSearchFilters>(INITIAL_FILTERS)
  const [results, setResults] = useState<IndianReservePermitSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const canCreatePermit = canPerform('viewOICApplication')

  const urlState = useMemo(() => {
    const urlFilters: IndianReservePermitSearchFilters = {
      permitNumber: searchParams.get('permitNumber') ?? '',
      packageNumber: searchParams.get('packageNumber') ?? '',
      fromPermitIssueDate: searchParams.get('fromPermitIssueDate') ?? '',
      toPermitIssueDate: searchParams.get('toPermitIssueDate') ?? '',
      fromEstimatedShippingDate: searchParams.get('fromEstimatedShippingDate') ?? '',
      toEstimatedShippingDate: searchParams.get('toEstimatedShippingDate') ?? '',
    }
    const parsedPageSize = parsePositiveIntParam(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE)

    return {
      filters: urlFilters,
      page: parsePositiveIntParam(searchParams.get('page'), DEFAULT_PAGE),
      pageSize: PAGE_SIZE_OPTIONS.includes(parsedPageSize as (typeof PAGE_SIZE_OPTIONS)[number])
        ? parsedPageSize
        : DEFAULT_PAGE_SIZE,
    }
  }, [searchParams])

  const hasDateValidationError = useMemo(() => {
    return (
      !isValidIsoDate(filters.fromPermitIssueDate) ||
      !isValidIsoDate(filters.toPermitIssueDate) ||
      !isValidIsoDate(filters.fromEstimatedShippingDate) ||
      !isValidIsoDate(filters.toEstimatedShippingDate)
    )
  }, [
    filters.fromPermitIssueDate,
    filters.toPermitIssueDate,
    filters.fromEstimatedShippingDate,
    filters.toEstimatedShippingDate,
  ])

  const runSearch = useCallback(async (request: IndianReservePermitSearchRequest) => {
    if (
      !isValidIsoDate(request.filters.fromPermitIssueDate) ||
      !isValidIsoDate(request.filters.toPermitIssueDate) ||
      !isValidIsoDate(request.filters.fromEstimatedShippingDate) ||
      !isValidIsoDate(request.filters.toEstimatedShippingDate)
    ) {
      return
    }

    setLoading(true)
    setErrorMessage('')
    try {
      const response = await searchIndianReservePermits(request)
      setResults(response)
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to retrieve indian reserve permit search results.')
      setResults(EMPTY_RESULTS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setFilters(urlState.filters)
    setPageSize(urlState.pageSize)
  }, [urlState])

  useEffect(() => {
    void runSearch({
      filters: urlState.filters,
      page: urlState.page - 1,
      pageSize: urlState.pageSize,
    })
  }, [runSearch, urlState])

  const onSearch = () => {
    setSearchParams(buildSearchParams(filters, DEFAULT_PAGE, pageSize))
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Indian Reserve Permit Search</h1>
        <p>
          Migrated from <code>src/main/webapp/WEB-INF/jsp/indianReserve/permit/search.jsp</code> and{' '}
          <code>src/main/webapp/javascript/indianReserve/search.js</code>.
        </p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-grid">
            <TextInput
              id="permitNumber"
              labelText="Permit Number"
              value={filters.permitNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, permitNumber: event.target.value }))
              }
            />
            <TextInput
              id="packageNumber"
              labelText="Package Number"
              value={filters.packageNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, packageNumber: event.target.value }))
              }
            />
            <TextInput
              id="fromPermitIssueDate"
              labelText="Issued From Date (YYYY-MM-DD)"
              value={filters.fromPermitIssueDate}
              invalid={!isValidIsoDate(filters.fromPermitIssueDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, fromPermitIssueDate: event.target.value }))
              }
            />
            <TextInput
              id="toPermitIssueDate"
              labelText="Issued To Date (YYYY-MM-DD)"
              value={filters.toPermitIssueDate}
              invalid={!isValidIsoDate(filters.toPermitIssueDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, toPermitIssueDate: event.target.value }))
              }
            />
            <TextInput
              id="fromEstimatedShippingDate"
              labelText="Shipping From Date (YYYY-MM-DD)"
              value={filters.fromEstimatedShippingDate}
              invalid={!isValidIsoDate(filters.fromEstimatedShippingDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  fromEstimatedShippingDate: event.target.value,
                }))
              }
            />
            <TextInput
              id="toEstimatedShippingDate"
              labelText="Shipping To Date (YYYY-MM-DD)"
              value={filters.toEstimatedShippingDate}
              invalid={!isValidIsoDate(filters.toEstimatedShippingDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  toEstimatedShippingDate: event.target.value,
                }))
              }
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
            {canCreatePermit && (
              <Link className="cds--link" to="/indian-reserve/permit/create">
                Add Permit
              </Link>
            )}
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <h2 className="dashboard-title">Search Results</h2>
        {loading && <InlineLoading description="Loading indian reserve permit search results..." />}
        {!!errorMessage && <p className="legacy-search-error">{errorMessage}</p>}
        {!loading && (
          <>
            <Table useZebraStyles>
              <TableHead>
                <TableRow>
                  <TableHeader>Permit</TableHeader>
                  <TableHeader>Client</TableHeader>
                  <TableHeader>Issue Date</TableHeader>
                  <TableHeader>Shipping Date</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.content.map((row) => (
                  <TableRow key={row.permitNumber}>
                    <TableCell>
                      <Link className="cds--link" to={`/indian-reserve/permit/${row.permitNumber}`}>
                        {row.permitNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{row.clientNumber}</TableCell>
                    <TableCell>{row.issueDate}</TableCell>
                    <TableCell>{row.shippingDate}</TableCell>
                  </TableRow>
                ))}
                {results.content.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      No indian reserve permits found for the selected criteria.
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
                setSearchParams(buildSearchParams(filters, page, nextPageSize))
              }}
            />
          </>
        )}
      </Column>
    </Grid>
  )
}

export default IndianReservePage
