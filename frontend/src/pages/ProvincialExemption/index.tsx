import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import { AppNotification } from '../../components/AppNotification'
import SearchableSelect from '../../components/SearchableSelect'
import type {
  ProvincialExemptionSearchFilters,
  ProvincialExemptionSearchItem,
  ProvincialExemptionSearchRequest,
  ProvincialExemptionSearchResponse,
  ProvincialExemptionSearchSortField,
} from '@/interfaces/ProvincialExemptionSearch'
import { useAuth } from '@/context/auth/useAuth'
import { hasInvalidIsoDateValue, isValidIsoDate } from '@/pages/shared/create-form-utils'
import {
  buildPageDataCacheKey,
  getPageDataCache,
  setPageDataCache,
} from '@/pages/shared/page-data-cache'
import {
  buildSearchTotalCacheKey,
  getCachedSearchTotal,
  setCachedSearchTotal,
  type SearchTotalCache,
} from '@/pages/shared/search-total-cache'
import {
  DEFAULT_SEARCH_PAGE,
  DEFAULT_SEARCH_PAGE_SIZE,
  SEARCH_PAGE_SIZE_OPTIONS,
  appendSearchParamsToPath,
  createEmptyPagedSearchResponse,
  createSearchParams,
  getNextSortDirection,
  mapSelectedOptionsById,
  mapValueLabelOptionsToIdTextOptions,
  parseCsvParam,
  parseEnumParam,
  parsePageSizeParam,
  parsePositiveIntParam,
  parseSortDirectionParam,
  type IdTextOption,
} from '@/pages/shared/search-query-utils'
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  loadSearchWithDeferredTotal,
  prefetchNextSearchPage,
} from '@/pages/shared/deferred-search-total'
import {
  countProvincialExemptions,
  searchProvincialExemptions,
} from '@/service/provincial-exemption-search-service'
import {
  fetchProvincialExemptionOptions,
  type SearchOption,
} from '@/service/search-options-service'
import IsoDatePicker from '../../components/IsoDatePicker'

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

const EMPTY_RESULTS = createEmptyPagedSearchResponse<ProvincialExemptionSearchResponse>()

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
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ProvincialExemptionSearchSortField[]

const buildSearchParams = (
  filters: ProvincialExemptionSearchFilters,
  sortField: ProvincialExemptionSearchSortField,
  sortDirection: 'asc' | 'desc',
  page: number,
  pageSize: number,
): URLSearchParams =>
  createSearchParams([
    ['applicationNumber', filters.applicationNumber],
    ['packageNumber', filters.packageNumber],
    ['exemptionNumber', filters.exemptionNumber],
    ['region', filters.region],
    ['listFromDate', filters.listFromDate],
    ['listToDate', filters.listToDate],
    ['exemptionTypeCode', filters.exemptionTypeCode],
    ['exemptionStatusCode', filters.exemptionStatusCode],
    ['applicantClientNumber', filters.applicantClientNumber],
    ['ownerClientNumber', filters.ownerClientNumber],
    ['sortField', sortField],
    ['sortDirection', sortDirection],
    ['page', page],
    ['pageSize', pageSize],
  ])

const ProvincialExemptionPage = () => {
  const { capabilities, canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [regionOptions, setRegionOptions] = useState<IdTextOption[]>([])
  const [exemptionTypeOptions, setExemptionTypeOptions] = useState<SearchOption[]>([])
  const [exemptionStatusOptions, setExemptionStatusOptions] = useState<SearchOption[]>([])
  const [results, setResults] = useState<ProvincialExemptionSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<
    Record<string, ProvincialExemptionSearchItem>
  >({})
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null)
  const totalCacheRef = useRef<SearchTotalCache>(new Map())
  const canCreateExemption = canPerform('/createExemption')
  const canApproveExemption = canPerform('approveExemption')
  const shouldDefaultApprovalFilters =
    capabilities?.roles.includes('EXEMPTION_APPROVER') ||
    capabilities?.roles.includes('LEXIS_EXEMPTION_APPROVER') ||
    false
  const selectedRowsCount = Object.keys(selectedRowsById).length
  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
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
      page: parsePositiveIntParam(searchParams.get('page'), DEFAULT_SEARCH_PAGE),
      pageSize: parsePageSizeParam(
        searchParams.get('pageSize'),
        DEFAULT_SEARCH_PAGE_SIZE,
        SEARCH_PAGE_SIZE_OPTIONS,
      ),
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
        buildSearchParams(nextFilters, sortField, sortDirection, DEFAULT_SEARCH_PAGE, pageSize),
        { replace: true },
      )
    },
    [clearSelection, filters, pageSize, setSearchParams, sortDirection, sortField],
  )

  const selectedRegions = useMemo(
    () => mapSelectedOptionsById(filters.region, regionOptions, (id) => `Region ${id}`),
    [filters.region, regionOptions],
  )
  const selectedRegionHelperText =
    selectedRegions.length > 0
      ? `Selected: ${selectedRegions.map((region) => region.text).join(', ')}`
      : undefined

  const hasDateValidationError = useMemo(() => {
    return hasInvalidIsoDateValue(filters.listFromDate, filters.listToDate)
  }, [filters.listFromDate, filters.listToDate])

  const beginSearchRequest = useLatestRequestGuard()
  const commitResults = useCallback((nextResults: ProvincialExemptionSearchResponse) => {
    setResults(nextResults)
  }, [])

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
          setCachedSearchTotal(
            totalCacheRef.current,
            buildSearchTotalCacheKey(request.filters),
            cachedResults.page.totalElements,
          )
          setResults(cachedResults)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      const isLatestRequest = beginSearchRequest()
      if (hasInvalidIsoDateValue(request.filters.listFromDate, request.filters.listToDate)) {
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      try {
        const totalCacheKey = buildSearchTotalCacheKey(request.filters)
        const cachedTotal = getCachedSearchTotal(totalCacheRef.current, totalCacheKey)
        const commitSearchResponse = (
          response: ProvincialExemptionSearchResponse,
          totalIsExact: boolean,
        ) => {
          if (totalIsExact) {
            setCachedSearchTotal(totalCacheRef.current, totalCacheKey, response.page.totalElements)
            setPageDataCache(pageCacheKey, response)
            prefetchNextSearchPage({
              pageId: 'provincial-exemption-search',
              principal: capabilities?.principal,
              request,
              response,
              search: searchProvincialExemptions,
              onError: console.error,
            })
          }
          queueMicrotask(() => {
            if (isLatestRequest()) {
              commitResults(response)
            }
          })
        }
        const { response, totalIsExact } = await loadSearchWithDeferredTotal({
          request,
          cachedTotal,
          search: searchProvincialExemptions,
          count: countProvincialExemptions,
          isLatestRequest,
          onExactTotal: (resolvedResponse) => commitSearchResponse(resolvedResponse, true),
          onCountError: console.error,
        })
        if (isLatestRequest()) {
          commitSearchResponse(response, totalIsExact)
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
    [beginSearchRequest, capabilities?.principal, commitResults],
  )

  useEffect(() => {
    if (searchParams.toString().length === 0 && shouldDefaultApprovalFilters) {
      return
    }

    void runSearch({
      filters: debouncedUrlState.filters,
      page: debouncedUrlState.page - 1,
      pageSize: debouncedUrlState.pageSize,
      sortField: debouncedUrlState.sortField,
      sortDirection: debouncedUrlState.sortDirection,
    })
  }, [debouncedUrlState, runSearch, searchParams, shouldDefaultApprovalFilters])

  useEffect(() => {
    const hasSearchQuery = searchParams.toString().length > 0
    if (!hasSearchQuery && shouldDefaultApprovalFilters) {
      setSearchParams(
        buildSearchParams(
          {
            ...INITIAL_FILTERS,
            exemptionStatusCode: 'NEW',
            exemptionTypeCode: 'M',
          },
          DEFAULT_SORT_FIELD,
          DEFAULT_SORT_DIRECTION,
          DEFAULT_SEARCH_PAGE,
          DEFAULT_SEARCH_PAGE_SIZE,
        ),
        { replace: true },
      )
    }
  }, [searchParams, setSearchParams, shouldDefaultApprovalFilters])

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialExemptionOptions()

      setExemptionTypeOptions(options.exemptionTypes)
      setExemptionStatusOptions(options.exemptionStatuses)
      setRegionOptions(mapValueLabelOptionsToIdTextOptions(options.regions))
    }

    void loadOptions()
  }, [])

  const onSearch = () => {
    clearSelection()
    setSearchParams(
      buildSearchParams(filters, sortField, sortDirection, DEFAULT_SEARCH_PAGE, pageSize),
    )
  }

  const onClearFilters = () => {
    clearSelection()
    setSearchParams(
      buildSearchParams(
        INITIAL_FILTERS,
        DEFAULT_SORT_FIELD,
        DEFAULT_SORT_DIRECTION,
        DEFAULT_SEARCH_PAGE,
        DEFAULT_SEARCH_PAGE_SIZE,
      ),
    )
  }

  const onHeaderClick = (column: ProvincialExemptionSearchSortField) => {
    const nextDirection = getNextSortDirection(sortField, sortDirection, column)
    clearSelection()
    setSearchParams(
      buildSearchParams(filters, column, nextDirection, DEFAULT_SEARCH_PAGE, pageSize),
    )
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
    <Grid fullWidth className="default-grid provincial-exemption-search-page">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial exemption search</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters provincial-exemption-search-filters">
          <Tile>
            <div className="legacy-search-grid provincial-exemption-search-grid">
              <TextInput
                id="applicationNumber"
                labelText="Application number"
                value={filters.applicationNumber}
                onChange={(event) => updateFilter('applicationNumber', event.target.value)}
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
                id="packageNumber"
                labelText="Package number"
                value={filters.packageNumber}
                onChange={(event) => updateFilter('packageNumber', event.target.value)}
              />
              <SearchableSelect
                id="exemptionTypeCode"
                labelText="Exemption type"
                value={filters.exemptionTypeCode}
                placeholder="All types"
                options={exemptionTypeOptions}
                onChange={(value) => updateFilter('exemptionTypeCode', value)}
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
                placeholder="Select region(s)"
                helperText={selectedRegionHelperText}
                selectedItems={selectedRegions}
                onChange={(event) => {
                  const nextSelected = (event.selectedItems ?? []) as IdTextOption[]
                  updateFilter(
                    'region',
                    nextSelected.map((item) => item.id),
                  )
                }}
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
              <IsoDatePicker
                id="listFromDate"
                labelText="Listing from date"
                value={filters.listFromDate}
                invalid={!isValidIsoDate(filters.listFromDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('listFromDate', value)}
              />
              <IsoDatePicker
                id="listToDate"
                labelText="Listing to date"
                value={filters.listToDate}
                invalid={!isValidIsoDate(filters.listToDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('listToDate', value)}
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
              pageSizes={[...SEARCH_PAGE_SIZE_OPTIONS]}
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
