import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  MultiSelect,
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
  ProvincialPermitSearchFilters,
  ProvincialPermitSearchRequest,
  ProvincialPermitSearchResponse,
  ProvincialPermitSearchSortField,
} from '@/interfaces/ProvincialPermitSearch'
import { useAuth } from '@/context/auth/useAuth'
import { searchProvincialPermits } from '@/service/provincial-permit-search-service'
import { fetchProvincialPermitOptions, type SearchOption } from '@/service/search-options-service'

type RegionOption = {
  id: string
  text: string
}

const FALLBACK_REGION_OPTIONS: RegionOption[] = [
  { id: 'CAR', text: 'Cariboo (CAR)' },
  { id: 'KAM', text: 'Kamloops (KAM)' },
  { id: 'NEL', text: 'Northeast (NEL)' },
  { id: 'OMI', text: 'Omineca (OMI)' },
  { id: 'SKE', text: 'Skeena (SKE)' },
]

const FALLBACK_PERMIT_STATUS_OPTIONS: SearchOption[] = [
  { value: 'Active', label: 'Active' },
  { value: 'Issued', label: 'Issued' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Cancelled', label: 'Cancelled' },
]

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

const ProvincialPermitPage: FC = () => {
  const { canPerform } = useAuth()
  const [filters, setFilters] = useState<ProvincialPermitSearchFilters>(INITIAL_FILTERS)
  const [selectedRegions, setSelectedRegions] = useState<RegionOption[]>([])
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>(FALLBACK_REGION_OPTIONS)
  const [permitStatusOptions, setPermitStatusOptions] = useState<SearchOption[]>(
    FALLBACK_PERMIT_STATUS_OPTIONS,
  )
  const [results, setResults] = useState<ProvincialPermitSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sortField, setSortField] = useState<ProvincialPermitSearchSortField>('permitNumber')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [pageSize, setPageSize] = useState(10)
  const canCreatePermit = canPerform('createPermit')

  const hasDateValidationError = useMemo(() => {
    return !isValidIsoDate(filters.issuedFromDate) || !isValidIsoDate(filters.issuedToDate)
  }, [filters.issuedFromDate, filters.issuedToDate])

  const runSearch = useCallback(async (request: ProvincialPermitSearchRequest) => {
    if (
      !isValidIsoDate(request.filters.issuedFromDate) ||
      !isValidIsoDate(request.filters.issuedToDate)
    ) {
      return
    }
    setLoading(true)
    setErrorMessage('')
    try {
      const response = await searchProvincialPermits(request)
      setResults(response)
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to retrieve permit search results.')
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
      sortField: 'permitNumber',
      sortDirection: 'asc',
    })
  }, [runSearch])

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialPermitOptions()
      if (options.permitStatuses.length > 0) {
        setPermitStatusOptions(options.permitStatuses)
      }
      if (options.regions.length > 0) {
        setRegionOptions(
          options.regions.map((option) => ({
            id: option.value,
            text: `${option.label} (${option.value})`,
          })),
        )
      }
    }

    void loadOptions()
  }, [])

  const onSearch = () => {
    void runSearch({
      filters,
      page: 0,
      pageSize,
      sortField,
      sortDirection,
    })
  }

  const onHeaderClick = (column: ProvincialPermitSearchSortField) => {
    const nextDirection = sortField === column && sortDirection === 'asc' ? 'desc' : 'asc'
    setSortField(column)
    setSortDirection(nextDirection)
    void runSearch({
      filters,
      page: 0,
      pageSize,
      sortField: column,
      sortDirection: nextDirection,
    })
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial Permit Search</h1>
        <p>
          Migrated from <code>src/main/webapp/WEB-INF/jsp/provincial/permit/search.jsp</code> and
          <code> src/main/webapp/javascript/provincial/permit/search.js</code>.
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
            <MultiSelect
              id="region"
              titleText="Region"
              items={regionOptions}
              itemToString={(item) => (item ? item.text : '')}
              label="Select region(s)"
              selectionFeedback="fixed"
              selectedItems={selectedRegions}
              onChange={(event) => {
                const nextSelected = (event.selectedItems ?? []) as RegionOption[]
                setSelectedRegions(nextSelected)
                setFilters((current) => ({
                  ...current,
                  region: nextSelected.map((item) => item.id),
                }))
              }}
            />
            <TextInput
              id="issuedFromDate"
              labelText="Issued From Date (YYYY-MM-DD)"
              value={filters.issuedFromDate}
              invalid={!isValidIsoDate(filters.issuedFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, issuedFromDate: event.target.value }))
              }
            />
            <TextInput
              id="issuedToDate"
              labelText="Issued To Date (YYYY-MM-DD)"
              value={filters.issuedToDate}
              invalid={!isValidIsoDate(filters.issuedToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, issuedToDate: event.target.value }))
              }
            />
            <Select
              id="permitStatus"
              labelText="Permit Status"
              value={filters.permitStatus}
              onChange={(event) =>
                setFilters((current) => ({ ...current, permitStatus: event.target.value }))
              }
            >
              <SelectItem text="All statuses" value="" />
              {permitStatusOptions.map((option) => (
                <SelectItem key={option.value} text={option.label} value={option.value} />
              ))}
            </Select>
            <TextInput
              id="permitNumber"
              labelText="Permit Number"
              value={filters.permitNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, permitNumber: event.target.value }))
              }
            />
            <TextInput
              id="applicantClientNumber"
              labelText="Applicant Client Number"
              value={filters.applicantClientNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, applicantClientNumber: event.target.value }))
              }
            />
            <TextInput
              id="ownerClientNumber"
              labelText="Owner Client Number"
              value={filters.ownerClientNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, ownerClientNumber: event.target.value }))
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
              <Link className="cds--link" to="/provincial/permit/create">
                Add Permit
              </Link>
            )}
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <h2 className="dashboard-title">Search Results</h2>
        {loading && <InlineLoading description="Loading permit search results..." />}
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
                  <TableRow key={row.permitNumber}>
                    <TableCell>
                      <Link className="cds--link" to={`/provincial/permit/${row.permitNumber}`}>
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
                setPageSize(nextPageSize)
                void runSearch({
                  filters,
                  page: page - 1,
                  pageSize: nextPageSize,
                  sortField,
                  sortDirection,
                })
              }}
            />
          </>
        )}
      </Column>
    </Grid>
  )
}

export default ProvincialPermitPage
