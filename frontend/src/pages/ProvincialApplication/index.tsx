import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
  ProvincialApplicationSearchFilters,
  ProvincialApplicationSearchItem,
  ProvincialApplicationSearchRequest,
  ProvincialApplicationSearchResponse,
  ProvincialApplicationSearchSortField,
} from '@/interfaces/ProvincialApplicationSearch'
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
import { searchProvincialApplications } from '@/service/provincial-application-search-service'
import {
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'
import IsoDatePicker from '../../components/IsoDatePicker'

type ExemptionStatus = {
  kind: 'error'
  message: string
}

type ExemptionCreatePrefillState = {
  selectedApplicationNumbers: string[]
  applicantClientNumber: string
  ownerClientNumber: string
}

const INITIAL_FILTERS: ProvincialApplicationSearchFilters = {
  applicationNumber: '',
  packageNumber: '',
  exemptionType: '',
  exemptionNumber: '',
  applicationStatus: '',
  productTypeCode: '',
  region: [],
  listingFromDate: '',
  listingToDate: '',
  applicantClientNumber: '',
  ownerClientNumber: '',
}

const EMPTY_RESULTS = createEmptyPagedSearchResponse<ProvincialApplicationSearchResponse>()

const SORT_COLUMNS: {
  id: ProvincialApplicationSearchSortField
  label: string
}[] = [
  { id: 'applicationNumber', label: 'Application' },
  { id: 'status', label: 'Status' },
  { id: 'applicantClientNumber', label: 'Applicant client number' },
  { id: 'ownerClientNumber', label: 'Owner client number' },
  { id: 'region', label: 'Region' },
  { id: 'applicationVolume', label: 'Application volume (m³)' },
  { id: 'exemptionNumber', label: 'Exemption number' },
  { id: 'listingDate', label: 'Listing date' },
]

const DEFAULT_SORT_FIELD: ProvincialApplicationSearchSortField = 'applicationNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc'
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ProvincialApplicationSearchSortField[]

const buildSearchParams = (
  filters: ProvincialApplicationSearchFilters,
  sortField: ProvincialApplicationSearchSortField,
  sortDirection: 'asc' | 'desc',
  page: number,
  pageSize: number,
): URLSearchParams =>
  createSearchParams([
    ['applicationNumber', filters.applicationNumber],
    ['packageNumber', filters.packageNumber],
    ['exemptionType', filters.exemptionType],
    ['exemptionNumber', filters.exemptionNumber],
    ['applicationStatus', filters.applicationStatus],
    ['productTypeCode', filters.productTypeCode],
    ['region', filters.region],
    ['listingFromDate', filters.listingFromDate],
    ['listingToDate', filters.listingToDate],
    ['applicantClientNumber', filters.applicantClientNumber],
    ['ownerClientNumber', filters.ownerClientNumber],
    ['sortField', sortField],
    ['sortDirection', sortDirection],
    ['page', page],
    ['pageSize', pageSize],
  ])

const ProvincialApplicationPage = () => {
  const navigate = useNavigate()
  const { capabilities, canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [regionOptions, setRegionOptions] = useState<IdTextOption[]>([])
  const [exemptionTypeOptions, setExemptionTypeOptions] = useState<SearchOption[]>([])
  const [applicationStatusOptions, setApplicationStatusOptions] = useState<SearchOption[]>([])
  const [productTypeOptions, setProductTypeOptions] = useState<SearchOption[]>([])
  const [results, setResults] = useState<ProvincialApplicationSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<
    Record<string, ProvincialApplicationSearchItem>
  >({})
  const [exemptionStatus, setExemptionStatus] = useState<ExemptionStatus | null>(null)
  const totalCacheRef = useRef<SearchTotalCache>(new Map())
  const canCreateExemption = canPerform('/createExemption')
  const canCreateApplication = canPerform('createApplication')
  const canUploadApplicationSubmission = canPerform('uploadApplicationSubmission')
  const selectedRowsCount = Object.keys(selectedRowsById).length
  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
  )

  const urlState = useMemo(() => {
    const urlFilters: ProvincialApplicationSearchFilters = {
      applicationNumber: searchParams.get('applicationNumber') ?? '',
      packageNumber: searchParams.get('packageNumber') ?? '',
      exemptionType: searchParams.get('exemptionType') ?? '',
      exemptionNumber: searchParams.get('exemptionNumber') ?? '',
      applicationStatus: searchParams.get('applicationStatus') ?? '',
      productTypeCode: searchParams.get('productTypeCode') ?? '',
      region: parseCsvParam(searchParams.get('region')),
      listingFromDate: searchParams.get('listingFromDate') ?? '',
      listingToDate: searchParams.get('listingToDate') ?? '',
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
    setExemptionStatus(null)
  }, [])
  const updateFilter = useCallback(
    <K extends keyof ProvincialApplicationSearchFilters>(
      key: K,
      value: ProvincialApplicationSearchFilters[K],
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
    return hasInvalidIsoDateValue(filters.listingFromDate, filters.listingToDate)
  }, [filters.listingFromDate, filters.listingToDate])

  const beginSearchRequest = useLatestRequestGuard()

  const runSearch = useCallback(
    async (request: ProvincialApplicationSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheKey = buildPageDataCacheKey(
        'provincial-application-search',
        capabilities?.principal,
        request,
      )
      if (!options.force) {
        const cachedResults = getPageDataCache<ProvincialApplicationSearchResponse>(pageCacheKey)
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
      if (hasInvalidIsoDateValue(request.filters.listingFromDate, request.filters.listingToDate)) {
        setLoading(false)
        return
      }
      setLoading(true)
      setErrorMessage('')
      try {
        const totalCacheKey = buildSearchTotalCacheKey(request.filters)
        const cachedTotal = getCachedSearchTotal(totalCacheRef.current, totalCacheKey)
        const response =
          cachedTotal === undefined
            ? await searchProvincialApplications(request)
            : await searchProvincialApplications(request, { knownTotal: cachedTotal })
        if (isLatestRequest()) {
          setCachedSearchTotal(totalCacheRef.current, totalCacheKey, response.page.totalElements)
          setPageDataCache(pageCacheKey, response)
          setResults(response)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve application search results.')
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
      const options = await fetchProvincialApplicationOptions()

      setExemptionTypeOptions(options.exemptionTypes)
      setApplicationStatusOptions(options.applicationStatuses)
      setProductTypeOptions(options.productTypes)
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

  const onHeaderClick = (column: ProvincialApplicationSearchSortField) => {
    const nextDirection = getNextSortDirection(sortField, sortDirection, column)
    clearSelection()
    setSearchParams(
      buildSearchParams(filters, column, nextDirection, DEFAULT_SEARCH_PAGE, pageSize),
    )
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

  const toggleRowSelection = (row: ProvincialApplicationSearchItem, checked: boolean) => {
    setExemptionStatus(null)
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
    setExemptionStatus(null)
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
      setExemptionStatus({
        kind: 'error',
        message: 'Your account is not authorized to create exemptions.',
      })
      return
    }

    const selectedRows = Object.values(selectedRowsById)
    if (selectedRows.length === 0) {
      setExemptionStatus({
        kind: 'error',
        message: 'Select at least one application before creating an exemption.',
      })
      return
    }

    const firstRow = selectedRows[0]
    const allRowsMatchClientNumbers = selectedRows.every(
      (row) =>
        row.applicantClientNumber === firstRow.applicantClientNumber &&
        row.ownerClientNumber === firstRow.ownerClientNumber,
    )

    if (!allRowsMatchClientNumbers) {
      setExemptionStatus({
        kind: 'error',
        message:
          'Selected applications do not share the same client numbers. Multi-application exemptions require matching clients.',
      })
      return
    }

    const prefillState: ExemptionCreatePrefillState = {
      selectedApplicationNumbers: selectedRows.map((row) => row.applicationNumber),
      applicantClientNumber: firstRow.applicantClientNumber,
      ownerClientNumber: firstRow.ownerClientNumber,
    }

    navigate('/provincial/exemption/create', { state: prefillState })
  }

  return (
    <Grid fullWidth className="default-grid provincial-application-search-page">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial application search</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters provincial-application-search-filters">
          <Tile>
            <div className="legacy-search-grid provincial-application-search-grid">
              <TextInput
                id="applicationNumber"
                labelText="Application number"
                value={filters.applicationNumber}
                onChange={(event) => updateFilter('applicationNumber', event.target.value)}
              />
              <SearchableSelect
                id="applicationStatus"
                labelText="Application status"
                value={filters.applicationStatus}
                placeholder="All statuses"
                options={applicationStatusOptions}
                onChange={(value) => updateFilter('applicationStatus', value)}
              />
              <TextInput
                id="packageNumber"
                labelText="Package number"
                value={filters.packageNumber}
                onChange={(event) => updateFilter('packageNumber', event.target.value)}
              />
              <SearchableSelect
                id="exemptionType"
                labelText="Exemption type"
                value={filters.exemptionType}
                placeholder="All types"
                options={exemptionTypeOptions}
                onChange={(value) => updateFilter('exemptionType', value)}
              />
              <TextInput
                id="exemptionNumber"
                labelText="Exemption number"
                value={filters.exemptionNumber}
                onChange={(event) => updateFilter('exemptionNumber', event.target.value)}
              />
              <SearchableSelect
                id="productTypeCode"
                labelText="Product type"
                value={filters.productTypeCode}
                placeholder="All product types"
                options={productTypeOptions}
                onChange={(value) => updateFilter('productTypeCode', value)}
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
                id="listingFromDate"
                labelText="Listing from date"
                value={filters.listingFromDate}
                invalid={!isValidIsoDate(filters.listingFromDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('listingFromDate', value)}
              />
              <IsoDatePicker
                id="listingToDate"
                labelText="Listing to date"
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
                Create exemption for Selected Applications
              </Button>
              {canCreateApplication && (
                <Link className="cds--link" to="/provincial/application/create">
                  Add Application
                </Link>
              )}
              {canUploadApplicationSubmission && (
                <Link className="cds--link" to="/provincial/application/upload">
                  Upload Application Submission
                </Link>
              )}
            </div>
            {exemptionStatus && (
              <AppNotification
                className="legacy-inline-notification"
                kind={exemptionStatus.kind}
                title="Validation failed"
                subtitle={exemptionStatus.message}
                onCloseButtonClick={() => setExemptionStatus(null)}
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
            loadingDescription="Loading application search results..."
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
                        to={withCurrentSearch(`/provincial/application/${row.applicationNumber}`)}
                      >
                        {row.applicationNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.applicantClientNumber}</TableCell>
                    <TableCell>{row.ownerClientNumber}</TableCell>
                    <TableCell>{row.region}</TableCell>
                    <TableCell>{row.applicationVolume}</TableCell>
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
                    <TableCell>{row.listingDate}</TableCell>
                  </TableRow>
                ))}
                {results.content.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      No applications found for the selected criteria.
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

export default ProvincialApplicationPage
