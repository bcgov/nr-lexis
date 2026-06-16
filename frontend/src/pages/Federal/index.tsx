import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineNotification,
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
import IsoDatePicker from '@/components/IsoDatePicker'
import type {
  FederalApplicationSearchFilters,
  FederalApplicationSearchItem,
  FederalApplicationSearchRequest,
  FederalApplicationSearchResponse,
  FederalApplicationSearchSortField,
} from '@/interfaces/FederalApplicationSearch'
import { useAuth } from '@/context/auth/useAuth'
import { isValidIsoDate } from '@/pages/shared/create-form-utils'
import {
  buildPageDataCacheKey,
  getPageDataCache,
  setPageDataCache,
} from '@/pages/shared/page-data-cache'
import {
  parseEnumParam,
  parsePositiveIntParam,
  parseSortDirectionParam,
  setSearchParam,
} from '@/pages/shared/search-query-utils'
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { searchFederalApplications } from '@/service/federal-application-search-service'
import { fetchFederalApplicationOptions, type SearchOption } from '@/service/search-options-service'

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

type ExemptionSelectionStatus = {
  kind: 'error' | 'success'
  message: string
}

type ExemptionCreatePrefillState = {
  selectedApplicationNumbers: string[]
  applicantClientNumber: string
  ownerClientNumber: string
}

const FederalPage: FC = () => {
  const navigate = useNavigate()
  const { capabilities, canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [applicationStatusOptions, setApplicationStatusOptions] = useState<SearchOption[]>([])
  const [results, setResults] = useState<FederalApplicationSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<
    Record<string, FederalApplicationSearchItem>
  >({})
  const [exemptionSelectionStatus, setExemptionSelectionStatus] =
    useState<ExemptionSelectionStatus | null>(null)
  const canCreateExemption = canPerform('/createExemption')
  const selectedRowsCount = Object.keys(selectedRowsById).length
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
  const debouncedUrlState = useDebouncedValue(urlState)
  const filters = urlState.filters
  const sortField = urlState.sortField
  const sortDirection = urlState.sortDirection
  const pageSize = urlState.pageSize
  const clearSelection = useCallback(() => {
    setSelectedRowsById({})
    setExemptionSelectionStatus(null)
  }, [])
  const updateFilter = useCallback(
    (key: keyof FederalApplicationSearchFilters, value: string) => {
      const nextFilters = { ...filters, [key]: value }
      clearSelection()
      setSearchParams(
        buildSearchParams(nextFilters, sortField, sortDirection, DEFAULT_PAGE, pageSize),
        { replace: true },
      )
    },
    [clearSelection, filters, pageSize, setSearchParams, sortDirection, sortField],
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

  const beginSearchRequest = useLatestRequestGuard()

  const runSearch = useCallback(
    async (request: FederalApplicationSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheKey = buildPageDataCacheKey(
        'federal-application-search',
        capabilities?.principal,
        request,
      )
      if (!options.force) {
        const cachedResults = getPageDataCache<FederalApplicationSearchResponse>(pageCacheKey)
        if (cachedResults) {
          setResults(cachedResults)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      const isLatestRequest = beginSearchRequest()
      if (
        !isValidIsoDate(request.filters.receivedFromDate) ||
        !isValidIsoDate(request.filters.receivedToDate) ||
        !isValidIsoDate(request.filters.listingFromDate) ||
        !isValidIsoDate(request.filters.listingToDate)
      ) {
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      try {
        const response = await searchFederalApplications(request)
        if (isLatestRequest()) {
          setPageDataCache(pageCacheKey, response)
          setResults(response)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve federal application search results.')
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
      sortField: debouncedUrlState.sortField,
      sortDirection: debouncedUrlState.sortDirection,
      page: debouncedUrlState.page - 1,
      pageSize: debouncedUrlState.pageSize,
    })
  }, [debouncedUrlState, runSearch])

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchFederalApplicationOptions()
      setApplicationStatusOptions(options.applicationStatuses)
    }

    void loadOptions()
  }, [])

  const onSearch = () => {
    clearSelection()
    setSearchParams(buildSearchParams(filters, sortField, sortDirection, DEFAULT_PAGE, pageSize))
  }

  const onClearFilters = () => {
    clearSelection()
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
    clearSelection()
    setSearchParams(buildSearchParams(filters, column, nextDirection, DEFAULT_PAGE, pageSize))
  }

  const selectableRows = useMemo(() => {
    if (!canCreateExemption) {
      return []
    }
    return results.content.filter((item) => item.allowCreateExemption)
  }, [canCreateExemption, results.content])

  const allSelectableRowsAreSelected = useMemo(() => {
    if (selectableRows.length === 0) return false
    return selectableRows.every((item) => Boolean(selectedRowsById[item.applicationNumber]))
  }, [selectableRows, selectedRowsById])

  const toggleRowSelection = (row: FederalApplicationSearchItem, checked: boolean) => {
    setExemptionSelectionStatus(null)
    setSelectedRowsById((current) => {
      const next = { ...current }
      if (checked) {
        next[row.applicationNumber] = row
      } else {
        delete next[row.applicationNumber]
      }
      return next
    })
  }

  const toggleSelectAllRowsOnPage = (checked: boolean) => {
    setExemptionSelectionStatus(null)
    setSelectedRowsById((current) => {
      const next = { ...current }
      selectableRows.forEach((row) => {
        if (checked) {
          next[row.applicationNumber] = row
        } else {
          delete next[row.applicationNumber]
        }
      })
      return next
    })
  }

  const onCreateExemptionClick = () => {
    if (!canCreateExemption) {
      setExemptionSelectionStatus({
        kind: 'error',
        message: 'Your account is not authorized to create exemptions.',
      })
      return
    }

    const selectedRows = Object.values(selectedRowsById)
    if (selectedRows.length === 0) {
      setExemptionSelectionStatus({
        kind: 'error',
        message: 'Select at least one federal application before creating an exemption.',
      })
      return
    }

    const firstRow = selectedRows[0]
    const allRowsMatchClientNumbers = selectedRows.every(
      (row) => row.clientNumber === firstRow.clientNumber,
    )

    if (!allRowsMatchClientNumbers) {
      setExemptionSelectionStatus({
        kind: 'error',
        message:
          'Selected federal applications do not share the same client number. Multi-application exemptions require matching clients.',
      })
      return
    }

    const prefillState: ExemptionCreatePrefillState = {
      selectedApplicationNumbers: selectedRows.map((row) => row.applicationNumber),
      applicantClientNumber: firstRow.clientNumber,
      ownerClientNumber: firstRow.clientNumber,
    }

    navigate('/provincial/exemption/create', { state: prefillState })
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Federal Application Search</h1>
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
            <SearchableSelect
              id="applicationStatus"
              labelText="Application Status"
              value={filters.applicationStatus}
              placeholder="All statuses"
              options={applicationStatusOptions}
              onChange={(value) => updateFilter('applicationStatus', value)}
            />
            <TextInput
              id="clientNumber"
              labelText="Client Number"
              value={filters.clientNumber}
              onChange={(event) => updateFilter('clientNumber', event.target.value)}
            />
            <IsoDatePicker
              id="receivedFromDate"
              labelText="Received From Date (YYYY-MM-DD)"
              value={filters.receivedFromDate}
              invalid={!isValidIsoDate(filters.receivedFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(value) => updateFilter('receivedFromDate', value)}
            />
            <IsoDatePicker
              id="receivedToDate"
              labelText="Received To Date (YYYY-MM-DD)"
              value={filters.receivedToDate}
              invalid={!isValidIsoDate(filters.receivedToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(value) => updateFilter('receivedToDate', value)}
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
            <Button
              kind="secondary"
              size="md"
              onClick={onCreateExemptionClick}
              disabled={selectedRowsCount === 0 || !canCreateExemption}
            >
              Create Exemption for Selected Applications
            </Button>
          </div>
          {exemptionSelectionStatus && (
            <InlineNotification
              className="legacy-inline-notification"
              kind={exemptionSelectionStatus.kind}
              title={
                exemptionSelectionStatus.kind === 'error' ? 'Validation failed' : 'Selection ready'
              }
              subtitle={exemptionSelectionStatus.message}
              onCloseButtonClick={() => setExemptionSelectionStatus(null)}
            />
          )}
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <h2 className="dashboard-title">Search Results</h2>
        {!!errorMessage && <p className="legacy-search-error">{errorMessage}</p>}
        <SearchResultsTableFrame
          loading={loading}
          loadingDescription="Loading federal application search results..."
        >
          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>
                  <Checkbox
                    id="selectAllCurrentPageRows"
                    hideLabel
                    labelText="Select all rows on this page"
                    checked={allSelectableRowsAreSelected}
                    disabled={selectableRows.length === 0}
                    onChange={(_, payload) => toggleSelectAllRowsOnPage(Boolean(payload.checked))}
                  />
                </TableHeader>
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
                <TableHeader>Exemption Type</TableHeader>
                <TableHeader>Exemption Number</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.content.map((row) => (
                <TableRow key={row.applicationNumber}>
                  <TableCell>
                    <Checkbox
                      id={`selectRow-${row.applicationNumber}`}
                      hideLabel
                      labelText={`Select ${row.applicationNumber}`}
                      checked={Boolean(selectedRowsById[row.applicationNumber])}
                      disabled={!canCreateExemption || !row.allowCreateExemption}
                      onChange={(_, payload) => toggleRowSelection(row, Boolean(payload.checked))}
                    />
                  </TableCell>
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
                  <TableCell>{row.exemptionType || '-'}</TableCell>
                  <TableCell>
                    {row.exemptionNumber ? (
                      <Link
                        className="cds--link"
                        to={withCurrentSearch(`/provincial/exemption/${row.exemptionNumber}`)}
                      >
                        {row.exemptionNumber}
                      </Link>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>{row.receivedDate}</TableCell>
                  <TableCell>{row.listingDate}</TableCell>
                </TableRow>
              ))}
              {results.content.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>
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
              clearSelection()
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

export default FederalPage
