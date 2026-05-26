import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Link } from 'react-router-dom'
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
} from '@/interfaces/FederalApplicationSearch'
import { searchFederalApplications } from '@/service/federal-application-search-service'

const APPLICATION_STATUS_OPTIONS = ['', 'Draft', 'Submitted', 'Returned', 'Approved', 'Closed']

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

const isValidIsoDate = (value: string): boolean => {
  if (!value.trim()) return true
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)
}

const FederalPage: FC = () => {
  const [filters, setFilters] = useState<FederalApplicationSearchFilters>(INITIAL_FILTERS)
  const [results, setResults] = useState<FederalApplicationSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [pageSize, setPageSize] = useState(10)

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
      filters: INITIAL_FILTERS,
      page: 0,
      pageSize: 10,
    })
  }, [runSearch])

  const onSearch = () => {
    void runSearch({
      filters,
      page: 0,
      pageSize,
    })
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
              onChange={(event) =>
                setFilters((current) => ({ ...current, applicationNumber: event.target.value }))
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
            <Select
              id="applicationStatus"
              labelText="Application Status"
              value={filters.applicationStatus}
              onChange={(event) =>
                setFilters((current) => ({ ...current, applicationStatus: event.target.value }))
              }
            >
              {APPLICATION_STATUS_OPTIONS.map((value) => (
                <SelectItem key={value || 'all'} text={value || 'All statuses'} value={value} />
              ))}
            </Select>
            <TextInput
              id="clientNumber"
              labelText="Client Number"
              value={filters.clientNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, clientNumber: event.target.value }))
              }
            />
            <TextInput
              id="receivedFromDate"
              labelText="Received From Date (YYYY-MM-DD)"
              value={filters.receivedFromDate}
              invalid={!isValidIsoDate(filters.receivedFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, receivedFromDate: event.target.value }))
              }
            />
            <TextInput
              id="receivedToDate"
              labelText="Received To Date (YYYY-MM-DD)"
              value={filters.receivedToDate}
              invalid={!isValidIsoDate(filters.receivedToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, receivedToDate: event.target.value }))
              }
            />
            <TextInput
              id="listingFromDate"
              labelText="Listing From Date (YYYY-MM-DD)"
              value={filters.listingFromDate}
              invalid={!isValidIsoDate(filters.listingFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, listingFromDate: event.target.value }))
              }
            />
            <TextInput
              id="listingToDate"
              labelText="Listing To Date (YYYY-MM-DD)"
              value={filters.listingToDate}
              invalid={!isValidIsoDate(filters.listingToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, listingToDate: event.target.value }))
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
                  <TableHeader>Application</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Client</TableHeader>
                  <TableHeader>Reason</TableHeader>
                  <TableHeader>Received Date</TableHeader>
                  <TableHeader>Listing Date</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.content.map((row) => (
                  <TableRow key={row.applicationNumber}>
                    <TableCell>
                      <Link
                        className="cds--link"
                        to={`/federal/application/${row.applicationNumber}`}
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
                setPageSize(nextPageSize)
                void runSearch({
                  filters,
                  page: page - 1,
                  pageSize: nextPageSize,
                })
              }}
            />
          </>
        )}
      </Column>
    </Grid>
  )
}

export default FederalPage
