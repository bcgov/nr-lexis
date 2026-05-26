import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
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
  ApplicationReviewSearchFilters,
  ApplicationReviewSearchRequest,
  ApplicationReviewSearchResponse,
  ApplicationReviewSearchSortField,
} from '@/interfaces/ApplicationReviewSearch'
import { searchApplicationReviews } from '@/service/application-review-search-service'
import { fetchApplicationReviewOptions, type SearchOption } from '@/service/search-options-service'

type RegionOption = {
  id: string
  text: string
}

const FALLBACK_PRODUCT_TYPE_OPTIONS: SearchOption[] = [
  { value: 'LOG', label: 'Logs' },
  { value: 'LUM', label: 'Lumber' },
]

const FALLBACK_REGION_OPTIONS: RegionOption[] = [
  { id: '11', text: 'Cariboo (11)' },
  { id: '12', text: 'Coast (12)' },
  { id: '24', text: 'Skeena (24)' },
]

const INITIAL_FILTERS: ApplicationReviewSearchFilters = {
  applicationNumber: '',
  productTypeCode: '',
  region: [],
  receivedFromDate: '',
  receivedToDate: '',
  listingFromDate: '',
  listingToDate: '',
}

const EMPTY_RESULTS: ApplicationReviewSearchResponse = {
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
  id: ApplicationReviewSearchSortField
  label: string
}[] = [
  { id: 'applicationNumber', label: 'Application' },
  { id: 'volume', label: 'Volume (m³)' },
  { id: 'speciesEndUse', label: 'Species / End Use' },
  { id: 'listingDate', label: 'Listing Date' },
  { id: 'status', label: 'Status' },
  { id: 'region', label: 'Region' },
]

const ProvincialReviewPage: FC = () => {
  const [filters, setFilters] = useState<ApplicationReviewSearchFilters>(INITIAL_FILTERS)
  const [productTypeOptions, setProductTypeOptions] = useState<SearchOption[]>(
    FALLBACK_PRODUCT_TYPE_OPTIONS,
  )
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>(FALLBACK_REGION_OPTIONS)
  const [selectedRegions, setSelectedRegions] = useState<RegionOption[]>([])
  const [results, setResults] = useState<ApplicationReviewSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sortField, setSortField] = useState<ApplicationReviewSearchSortField>('applicationNumber')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
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

  const runSearch = useCallback(async (request: ApplicationReviewSearchRequest) => {
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
      const response = await searchApplicationReviews(request)
      setResults(response)
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to retrieve application review search results.')
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
      sortField: 'applicationNumber',
      sortDirection: 'asc',
    })
  }, [runSearch])

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchApplicationReviewOptions()

      if (options.productTypes.length > 0) {
        setProductTypeOptions(options.productTypes)
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

  const onHeaderClick = (column: ApplicationReviewSearchSortField) => {
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
        <h1>Provincial Review</h1>
        <p>
          Base review queue parity for <code>applicationsReview</code> migration.
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
            <Select
              id="productTypeCode"
              labelText="Product Type"
              value={filters.productTypeCode}
              onChange={(event) =>
                setFilters((current) => ({ ...current, productTypeCode: event.target.value }))
              }
            >
              <SelectItem text="All product types" value="" />
              {productTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} text={option.label} />
              ))}
            </Select>
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
            <Button kind="primary" onClick={onSearch} disabled={loading || hasDateValidationError}>
              Search
            </Button>
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <h2 className="dashboard-title">Review Queue</h2>
        {loading && <InlineLoading description="Loading review queue..." />}
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
                    <TableCell>{row.applicationNumber}</TableCell>
                    <TableCell>{row.volume}</TableCell>
                    <TableCell>{row.speciesEndUse}</TableCell>
                    <TableCell>{row.listingDate}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.region}</TableCell>
                  </TableRow>
                ))}
                {results.content.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      No review records found for the selected criteria.
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

export default ProvincialReviewPage
