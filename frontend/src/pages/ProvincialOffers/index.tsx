import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  MultiSelect,
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
  ProvincialOfferSearchFilters,
  ProvincialOfferSearchRequest,
  ProvincialOfferSearchResponse,
  ProvincialOfferSearchSortField,
} from '@/interfaces/ProvincialOfferSearch'
import { searchProvincialOffers } from '@/service/provincial-offer-search-service'
import { fetchProvincialOfferOptions } from '@/service/search-options-service'

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

const isValidIsoDate = (value: string): boolean => {
  if (!value.trim()) return true
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)
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

const ProvincialOffersPage: FC = () => {
  const [filters, setFilters] = useState<ProvincialOfferSearchFilters>(INITIAL_FILTERS)
  const [selectedRegions, setSelectedRegions] = useState<RegionOption[]>([])
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>(FALLBACK_REGION_OPTIONS)
  const [results, setResults] = useState<ProvincialOfferSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sortField, setSortField] = useState<ProvincialOfferSearchSortField>('listingDate')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [pageSize, setPageSize] = useState(10)

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

  const runSearch = useCallback(async (request: ProvincialOfferSearchRequest) => {
    if (
      !isValidIsoDate(request.filters.listingFromDate) ||
      !isValidIsoDate(request.filters.listingToDate) ||
      !isValidIsoDate(request.filters.withdrawalFromDate) ||
      !isValidIsoDate(request.filters.withdrawalToDate)
    ) {
      return
    }

    setLoading(true)
    setErrorMessage('')
    try {
      const response = await searchProvincialOffers(request)
      setResults(response)
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to retrieve offer search results.')
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
      sortField: 'listingDate',
      sortDirection: 'asc',
    })
  }, [runSearch])

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialOfferOptions()
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

  const onHeaderClick = (column: ProvincialOfferSearchSortField) => {
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
        <h1>Provincial Offers Search</h1>
        <p>
          Migrated from <code>src/main/webapp/WEB-INF/jsp/provincial/offers/search.jsp</code> and{' '}
          <code>src/main/webapp/javascript/provincial/offers/search.js</code>.
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
            <TextInput
              id="clientNumber"
              labelText="Client Number"
              value={filters.clientNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, clientNumber: event.target.value }))
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
              id="withdrawalFromDate"
              labelText="Withdrawn From Date (YYYY-MM-DD)"
              value={filters.withdrawalFromDate}
              invalid={!isValidIsoDate(filters.withdrawalFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, withdrawalFromDate: event.target.value }))
              }
            />
            <TextInput
              id="withdrawalToDate"
              labelText="Withdrawn To Date (YYYY-MM-DD)"
              value={filters.withdrawalToDate}
              invalid={!isValidIsoDate(filters.withdrawalToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, withdrawalToDate: event.target.value }))
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
            <Link className="cds--link" to="/provincial/offers/create">
              Add Offer
            </Link>
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <h2 className="dashboard-title">Search Results</h2>
        {loading && <InlineLoading description="Loading offer search results..." />}
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
                  <TableRow key={row.offerNumber}>
                    <TableCell>
                      <Link className="cds--link" to={`/provincial/offers/${row.offerNumber}`}>
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

export default ProvincialOffersPage
