import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Button,
  Checkbox,
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
import { AppNotification } from '@/components/AppNotification'
import SearchableSelect from '@/components/SearchableSelect'
import type {
  ProvincialExemptionSearchFilters,
  ProvincialExemptionSearchItem,
  ProvincialExemptionSearchRequest,
  ProvincialExemptionSearchResponse,
  ProvincialExemptionSearchSortField,
} from '@/interfaces/ProvincialExemptionSearch'
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
import { searchProvincialExemptions } from '@/service/provincial-exemption-search-service'
import {
  fetchProvincialExemptionOptions,
  type SearchOption,
} from '@/service/search-options-service'
import IsoDatePicker from '@/components/IsoDatePicker'

type RegionOption = {
  id: string
  text: string
}

type ApprovalStatus = {
  kind: 'error' | 'success'
  message: string
}

const INITIAL_FILTERS: ProvincialExemptionSearchFilters = {
  applicationNumber: '',
  packageNumber: '',
  exemptionNumber: '',
  region: [],
  listFromDate: '',
  listToDate: '',
  exemptionTypeCode: '',
  exemptionStatusCode: '',
  applicantClientNumber: '',
  ownerClientNumber: '',
}

const EMPTY_RESULTS: ProvincialExemptionSearchResponse = {
  content: [],
  page: {
    number: 0,
    size: 10,
    totalElements: 0,
    totalPages: 1,
  },
}

const SORT_COLUMNS: {
  id: ProvincialExemptionSearchSortField
  label: string
}[] = [
  { id: 'exemptionNumber', label: 'Exemption' },
  { id: 'type', label: 'Type' },
  { id: 'status', label: 'Status' },
  { id: 'applicantClientNumber', label: 'Applicant client number' },
  { id: 'ownerClientNumber', label: 'Owner client number' },
  { id: 'approvedVolume', label: 'Approved volume (m³)' },
  { id: 'balanceRemaining', label: 'Balance remaining (m³)' },
  { id: 'listingDate', label: 'Listing date' },
  { id: 'expiryDate', label: 'Expiry date' },
  { id: 'region', label: 'Region' },
]

const DEFAULT_SORT_FIELD: ProvincialExemptionSearchSortField = 'exemptionNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'asc'
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 20, 30] as const
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ProvincialExemptionSearchSortField[]

const buildSearchParams = (
  filters: ProvincialExemptionSearchFilters,
  sortField: ProvincialExemptionSearchSortField,
  sortDirection: 'asc' | 'desc',
  page: number,
  pageSize: number,
): URLSearchParams => {
  const params = new URLSearchParams()

  setSearchParam(params, 'applicationNumber', filters.applicationNumber)
  setSearchParam(params, 'packageNumber', filters.packageNumber)
  setSearchParam(params, 'exemptionNumber', filters.exemptionNumber)
  setSearchParam(params, 'region', filters.region)
  setSearchParam(params, 'listFromDate', filters.listFromDate)
  setSearchParam(params, 'listToDate', filters.listToDate)
  setSearchParam(params, 'exemptionTypeCode', filters.exemptionTypeCode)
  setSearchParam(params, 'exemptionStatusCode', filters.exemptionStatusCode)
  setSearchParam(params, 'applicantClientNumber', filters.applicantClientNumber)
  setSearchParam(params, 'ownerClientNumber', filters.ownerClientNumber)
  setSearchParam(params, 'sortField', sortField)
  setSearchParam(params, 'sortDirection', sortDirection)
  setSearchParam(params, 'page', page)
  setSearchParam(params, 'pageSize', pageSize)

  return params
}

const ProvincialExemptionPage: FC = () => {
  const { capabilities, canPerform, isLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([])
  const [exemptionTypeOptions, setExemptionTypeOptions] = useState<SearchOption[]>([])
  const [exemptionStatusOptions, setExemptionStatusOptions] = useState<SearchOption[]>([])
  const [results, setResults] = useState<ProvincialExemptionSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<
    Record<string, ProvincialExemptionSearchItem>
  >({})
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null)
  const canCreateExemption = canPerform('/createExemption')
  const canApproveExemption = canPerform('approveExemption')
  const selectedRowsCount = Object.keys(selectedRowsById).length
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
    [searchParams],
  )

  const urlState = useMemo(() => {
    const urlFilters: ProvincialExemptionSearchFilters = {
      applicationNumber: searchParams.get('applicationNumber') ?? '',
      packageNumber: searchParams.get('packageNumber') ?? '',
      exemptionNumber: searchParams.get('exemptionNumber') ?? '',
      region: parseCsvParam(searchParams.get('region')),
      listFromDate: searchParams.get('listFromDate') ?? '',
      listToDate: searchParams.get('listToDate') ?? '',
      exemptionTypeCode: searchParams.get('exemptionTypeCode') ?? '',
      exemptionStatusCode: searchParams.get('exemptionStatusCode') ?? '',
      applicantClientNumber: searchParams.get('applicantClientNumber') ?? '',
      ownerClientNumber: searchParams.get('ownerClientNumber') ?? '',
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
    setApprovalStatus(null)
  }, [])
  const updateFilter = useCallback(
    <K extends keyof ProvincialExemptionSearchFilters>(
      key: K,
      value: ProvincialExemptionSearchFilters[K],
    ) => {
      const nextFilters = {
        ...filters,
        [key]: value,
      }
      clearSelection()
      setSearchParams(
        buildSearchParams(nextFilters, sortField, sortDirection, DEFAULT_PAGE, pageSize),
        { replace: true },
      )
    },
    [clearSelection, filters, pageSize, setSearchParams, sortDirection, sortField],
  )

  const selectedRegions = useMemo(
    () => mapSelectedOptionsById(filters.region, regionOptions, (id) => `Region ${id}`),
    [filters.region, regionOptions],
  )

  const hasDateValidationError = useMemo(() => {
    return !isValidIsoDate(filters.listFromDate) || !isValidIsoDate(filters.listToDate)
  }, [filters.listFromDate, filters.listToDate])

  const beginSearchRequest = useLatestRequestGuard()

  const runSearch = useCallback(
    async (request: ProvincialExemptionSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheKey = buildPageDataCacheKey(
        'provincial-exemption-search',
        capabilities?.principal,
        request,
      )
      if (!options.force) {
        const cachedResults = getPageDataCache<ProvincialExemptionSearchResponse>(pageCacheKey)
        if (cachedResults) {
          setResults(cachedResults)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      const isLatestRequest = beginSearchRequest()
      if (
        !isValidIsoDate(request.filters.listFromDate) ||
        !isValidIsoDate(request.filters.listToDate)
      ) {
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      try {
        const response = await searchProvincialExemptions(request)
        if (isLatestRequest()) {
          setPageDataCache(pageCacheKey, response)
          setResults(response)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve exemption search results.')
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
    const isExemptionApprover =
      capabilities.roles.includes('EXEMPTION_APPROVER') ||
      capabilities.roles.includes('LEXIS_EXEMPTION_APPROVER')
    const hasSearchQuery = searchParams.toString().length > 0
    const orgUnitNo = capabilities.orgUnitNo
    const defaultRegion =
      orgUnitNo && regionOptions.some((option) => option.id === orgUnitNo) ? [orgUnitNo] : []
    if (
      !isLoading &&
      !hasSearchQuery &&
      isExemptionApprover &&
      orgUnitNo &&
      regionOptions.length === 0
    ) {
      return
    }
    if (!isLoading && !hasSearchQuery && isExemptionApprover) {
      setSearchParams(
        buildSearchParams(
          {
            ...INITIAL_FILTERS,
            exemptionStatusCode: 'NEW',
            exemptionTypeCode: 'M',
            region: defaultRegion,
          },
          DEFAULT_SORT_FIELD,
          DEFAULT_SORT_DIRECTION,
          DEFAULT_PAGE,
          DEFAULT_PAGE_SIZE,
        ),
        { replace: true },
      )
    }
  }, [
    capabilities.orgUnitNo,
    capabilities.roles,
    isLoading,
    regionOptions,
    searchParams,
    setSearchParams,
  ])

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialExemptionOptions()

      setExemptionTypeOptions(options.exemptionTypes)
      setExemptionStatusOptions(options.exemptionStatuses)
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

  const onHeaderClick = (column: ProvincialExemptionSearchSortField) => {
    const nextDirection = sortField === column && sortDirection === 'asc' ? 'desc' : 'asc'
    clearSelection()
    setSearchParams(buildSearchParams(filters, column, nextDirection, DEFAULT_PAGE, pageSize))
  }

  const selectableRows = useMemo(() => {
    if (!canApproveExemption) {
      return []
    }
    return results.content.filter(
      (item) => item.canApprove && item.statusCode === 'NEW' && !item.isLocked,
    )
  }, [canApproveExemption, results.content])

  const allSelectableRowsAreSelected = useMemo(() => {
    if (selectableRows.length === 0) return false
    return selectableRows.every((item) => Boolean(selectedRowsById[item.exemptionNumber]))
  }, [selectableRows, selectedRowsById])

  const toggleRowSelection = (row: ProvincialExemptionSearchItem, checked: boolean) => {
    setApprovalStatus(null)
    setSelectedRowsById((current) => {
      const next = { ...current }
      if (checked) {
        next[row.exemptionNumber] = row
      } else {
        delete next[row.exemptionNumber]
      }
      return next
    })
  }

  const toggleSelectAllRowsOnPage = (checked: boolean) => {
    setApprovalStatus(null)
    setSelectedRowsById((current) => {
      const next = { ...current }
      selectableRows.forEach((row) => {
        if (checked) {
          next[row.exemptionNumber] = row
        } else {
          delete next[row.exemptionNumber]
        }
      })
      return next
    })
  }

  const onApproveSelectedClick = () => {
    if (!canApproveExemption) {
      setApprovalStatus({
        kind: 'error',
        message: 'Your account is not authorized to approve exemptions.',
      })
      return
    }

    const selectedRows = Object.values(selectedRowsById)
    if (selectedRows.length === 0) {
      setApprovalStatus({
        kind: 'error',
        message: 'Select at least one new exemption before approving.',
      })
      return
    }

    setApprovalStatus({
      kind: 'success',
      message: `Ready to approve ${selectedRows.length} selected exemption(s).`,
    })
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial exemption search</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters">
          <Tile>
            <div className="legacy-search-grid">
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
                id="exemptionNumber"
                labelText="Exemption number"
                value={filters.exemptionNumber}
                onChange={(event) => updateFilter('exemptionNumber', event.target.value)}
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
                id="listFromDate"
                labelText="List from date (YYYY-MM-DD)"
                value={filters.listFromDate}
                invalid={!isValidIsoDate(filters.listFromDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('listFromDate', value)}
              />
              <IsoDatePicker
                id="listToDate"
                labelText="List to date (YYYY-MM-DD)"
                value={filters.listToDate}
                invalid={!isValidIsoDate(filters.listToDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('listToDate', value)}
              />
              <SearchableSelect
                id="exemptionTypeCode"
                labelText="Exemption type"
                value={filters.exemptionTypeCode}
                placeholder="All types"
                options={exemptionTypeOptions}
                onChange={(value) => updateFilter('exemptionTypeCode', value)}
              />
              <SearchableSelect
                id="exemptionStatusCode"
                labelText="Exemption status"
                value={filters.exemptionStatusCode}
                placeholder="All statuses"
                options={exemptionStatusOptions}
                onChange={(value) => updateFilter('exemptionStatusCode', value)}
              />
              <TextInput
                id="applicantClientNumber"
                labelText="Applicant client number"
                value={filters.applicantClientNumber}
                onChange={(event) => updateFilter('applicantClientNumber', event.target.value)}
              />
              <TextInput
                id="ownerClientNumber"
                labelText="Owner client number"
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
              <Button
                kind="secondary"
                size="md"
                onClick={onApproveSelectedClick}
                disabled={selectedRowsCount === 0 || !canApproveExemption}
              >
                Approve Selected Exemption
              </Button>
              {canCreateExemption && (
                <Link className="cds--link" to="/provincial/exemption/create">
                  Add Exemption
                </Link>
              )}
            </div>
            {approvalStatus && (
              <AppNotification
                className="legacy-inline-notification"
                kind={approvalStatus.kind}
                title={approvalStatus.kind === 'error' ? 'Validation failed' : 'Selection ready'}
                subtitle={approvalStatus.message}
                autoDismissMs={approvalStatus.kind === 'success' ? 8000 : undefined}
                onCloseButtonClick={() => setApprovalStatus(null)}
              />
            )}
          </Tile>
        </section>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--results">
          <h2 className="dashboard-title">Search results</h2>
          {!!errorMessage && <p className="legacy-search-error">{errorMessage}</p>}
          <SearchResultsTableFrame
            loading={loading}
            loadingDescription="Loading exemption search results..."
            totalItems={results.page.totalElements}
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
                </TableRow>
              </TableHead>
              <TableBody>
                {results.content.map((row) => {
                  const canSelectRow =
                    canApproveExemption &&
                    row.canApprove &&
                    row.statusCode === 'NEW' &&
                    !row.isLocked
                  return (
                    <TableRow key={row.exemptionNumber}>
                      <TableCell>
                        <Checkbox
                          id={`selectRow-${row.exemptionNumber}`}
                          hideLabel
                          labelText={`Select ${row.exemptionNumber}`}
                          checked={Boolean(selectedRowsById[row.exemptionNumber])}
                          disabled={!canSelectRow}
                          onChange={(_, payload) =>
                            toggleRowSelection(row, Boolean(payload.checked))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {row.canViewExemption ? (
                          <Link
                            className="cds--link"
                            to={withCurrentSearch(`/provincial/exemption/${row.exemptionNumber}`)}
                          >
                            {row.exemptionNumber}
                          </Link>
                        ) : (
                          row.exemptionNumber
                        )}
                      </TableCell>
                      <TableCell>{row.type}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>{row.applicantClientNumber || '-'}</TableCell>
                      <TableCell>{row.ownerClientNumber}</TableCell>
                      <TableCell>{row.approvedVolume}</TableCell>
                      <TableCell>{row.balanceRemaining}</TableCell>
                      <TableCell>{row.listingDate}</TableCell>
                      <TableCell>{row.expiryDate}</TableCell>
                      <TableCell>{row.region}</TableCell>
                    </TableRow>
                  )
                })}
                {results.content.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11}>
                      No exemptions found for the selected criteria.
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
        </section>
      </Column>
    </Grid>
  )
}

export default ProvincialExemptionPage
