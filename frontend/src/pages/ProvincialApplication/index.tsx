import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import { AppNotification } from '../../components/AppNotification'
import EmptyState from '@/components/EmptyState'
import DisabledButtonTooltip from '@/components/DisabledButtonTooltip'
import PageHeader from '@/components/PageHeader'
import SearchSubmitButton from '@/components/SearchSubmitButton'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import SearchableSelect from '../../components/SearchableSelect'
import RegionMultiSelect from '@/components/RegionMultiSelect'
import StatusTag from '@/components/StatusTag'
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
  getPageDataCacheGeneration,
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
import { useSearchFilterDraft } from '@/pages/shared/useSearchFilterDraft'
import { usePersistedSearchParams } from '@/pages/shared/usePersistedSearchParams'
import { useDefaultRegionPreference } from '@/pages/shared/useDefaultRegionPreference'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  loadSearchWithDeferredTotal,
  prefetchAdjacentSearchPages,
} from '@/pages/shared/deferred-search-total'
import {
  countProvincialApplications,
  searchProvincialApplications,
} from '@/service/provincial-application-search-service'
import {
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'
import { resolveDefaultRegionAreaIds } from '@/service/user-preference-service'
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
  receivedFromDate: '',
  receivedToDate: '',
  listingFromDate: '',
  listingToDate: '',
  exportScheduleId: '',
  applicantClientNumber: '',
  ownerClientNumber: '',
}

const EMPTY_RESULTS = createEmptyPagedSearchResponse<ProvincialApplicationSearchResponse>()

const RESULT_COLUMNS: {
  id: string
  label: string
  sortField?: ProvincialApplicationSearchSortField
}[] = [
  { id: 'applicationNumber', label: 'Application', sortField: 'applicationNumber' },
  { id: 'status', label: 'Status' },
  {
    id: 'applicantClientNumber',
    label: 'Applicant client number',
    sortField: 'applicantClientNumber',
  },
  {
    id: 'ownerClientNumber',
    label: 'Owner client number',
    sortField: 'displayOwnerClientNumber',
  },
  { id: 'region', label: 'Region', sortField: 'regionCode' },
  { id: 'applicationVolume', label: 'Application volume (m³)' },
  { id: 'exemptionNumber', label: 'Exemption number', sortField: 'exemptionNumber' },
  { id: 'listingDate', label: 'Listing date', sortField: 'listingDate' },
]

const DEFAULT_SORT_FIELD: ProvincialApplicationSearchSortField = 'applicationNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc'
const SORT_FIELD_OPTIONS = RESULT_COLUMNS.flatMap((column) =>
  column.sortField ? [column.sortField] : [],
)

const disabledExemptionSelectionDescription = (row: ProvincialApplicationSearchItem): string =>
  row.exemptionNumber
    ? 'This application already has an exemption.'
    : 'This application is not eligible to create an exemption.'

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
    ['receivedFromDate', filters.receivedFromDate],
    ['receivedToDate', filters.receivedToDate],
    ['listingFromDate', filters.listingFromDate],
    ['listingToDate', filters.listingToDate],
    ['exportScheduleId', filters.exportScheduleId ?? ''],
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
  const [searchParams, setSearchParams] = usePersistedSearchParams('provincial-applications')
  const [regionOptions, setRegionOptions] = useState<IdTextOption[]>([])
  const { defaultRegion, preferenceLoading } = useDefaultRegionPreference()
  const [exemptionTypeOptions, setExemptionTypeOptions] = useState<SearchOption[]>([])
  const [applicationStatusOptions, setApplicationStatusOptions] = useState<SearchOption[]>([])
  const [productTypeOptions, setProductTypeOptions] = useState<SearchOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
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
  const visibleResultColumns = canCreateExemption
    ? RESULT_COLUMNS
    : RESULT_COLUMNS.filter((column) => column.id !== 'applicantClientNumber')
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
      receivedFromDate: searchParams.get('receivedFromDate') ?? '',
      receivedToDate: searchParams.get('receivedToDate') ?? '',
      listingFromDate: searchParams.get('listingFromDate') ?? '',
      listingToDate: searchParams.get('listingToDate') ?? '',
      exportScheduleId: searchParams.get('exportScheduleId') ?? '',
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
  const appliedFilters = urlState.filters
  const [filters, setFilters] = useSearchFilterDraft(appliedFilters)
  const sortField = urlState.sortField
  const sortDirection = urlState.sortDirection
  const pageSize = urlState.pageSize
  const requestFilters = appliedFilters
  const hasSearchQuery = searchParams.toString().length > 0
  const clearSelection = useCallback(() => {
    setSelectedRowsById({})
    setExemptionStatus(null)
  }, [])
  const updateFilter = useCallback(
    <K extends keyof ProvincialApplicationSearchFilters>(
      key: K,
      value: ProvincialApplicationSearchFilters[K],
    ) => {
      clearSelection()
      setFilters((currentFilters) => ({ ...currentFilters, [key]: value }))
    },
    [clearSelection, setFilters],
  )

  const selectedRegions = useMemo(
    () => mapSelectedOptionsById(filters.region, regionOptions, (id) => `Region ${id}`),
    [filters.region, regionOptions],
  )
  const defaultRegionAreaIds = useMemo(
    () =>
      resolveDefaultRegionAreaIds(
        defaultRegion,
        regionOptions.map((region) => region.id),
      ),
    [defaultRegion, regionOptions],
  )
  const regionDefaultPending =
    !searchParams.has('region') &&
    (optionsLoading ||
      preferenceLoading ||
      (!optionsUnavailable && defaultRegionAreaIds.length > 0))

  const hasDateValidationError = useMemo(() => {
    return hasInvalidIsoDateValue(
      filters.receivedFromDate,
      filters.receivedToDate,
      filters.listingFromDate,
      filters.listingToDate,
    )
  }, [
    filters.receivedFromDate,
    filters.receivedToDate,
    filters.listingFromDate,
    filters.listingToDate,
  ])

  const beginSearchRequest = useLatestRequestGuard()
  const commitResults = useCallback((nextResults: ProvincialApplicationSearchResponse) => {
    setResults(nextResults)
  }, [])

  const runSearch = useCallback(
    async (request: ProvincialApplicationSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheGeneration = getPageDataCacheGeneration()
      const pageCacheKey = buildPageDataCacheKey(
        'provincial-application-search',
        capabilities?.principal,
        request,
      )
      const isLatestRequest = beginSearchRequest()
      if (!options.force) {
        const cachedResults = getPageDataCache<ProvincialApplicationSearchResponse>(pageCacheKey)
        if (cachedResults) {
          setCachedSearchTotal(
            totalCacheRef.current,
            buildSearchTotalCacheKey(request.filters),
            cachedResults.page.totalElements,
          )
          prefetchAdjacentSearchPages({
            pageId: 'provincial-application-search',
            principal: capabilities?.principal,
            request,
            response: cachedResults,
            search: searchProvincialApplications,
            onError: console.error,
          })
          setResults(cachedResults)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      if (
        hasInvalidIsoDateValue(
          request.filters.receivedFromDate,
          request.filters.receivedToDate,
          request.filters.listingFromDate,
          request.filters.listingToDate,
        )
      ) {
        setLoading(false)
        return
      }
      setLoading(true)
      setErrorMessage('')
      try {
        const totalCacheKey = buildSearchTotalCacheKey(request.filters)
        const cachedTotal = options.force
          ? undefined
          : getCachedSearchTotal(totalCacheRef.current, totalCacheKey)
        const commitSearchResponse = (
          response: ProvincialApplicationSearchResponse,
          totalIsExact: boolean,
        ) => {
          if (totalIsExact && setPageDataCache(pageCacheKey, response, pageCacheGeneration)) {
            setCachedSearchTotal(totalCacheRef.current, totalCacheKey, response.page.totalElements)
            prefetchAdjacentSearchPages({
              pageId: 'provincial-application-search',
              principal: capabilities?.principal,
              request,
              response,
              search: searchProvincialApplications,
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
          search: searchProvincialApplications,
          count: countProvincialApplications,
        })
        if (isLatestRequest()) {
          commitSearchResponse(response, totalIsExact)
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
    [beginSearchRequest, capabilities?.principal, commitResults],
  )

  useEffect(() => {
    if (!hasSearchQuery || regionDefaultPending) {
      return
    }

    void runSearch({
      filters: requestFilters,
      page: urlState.page - 1,
      pageSize: urlState.pageSize,
      sortField: urlState.sortField,
      sortDirection: urlState.sortDirection,
    })
  }, [
    hasSearchQuery,
    regionDefaultPending,
    requestFilters,
    runSearch,
    urlState.page,
    urlState.pageSize,
    urlState.sortDirection,
    urlState.sortField,
  ])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const options = await fetchProvincialApplicationOptions()

        setExemptionTypeOptions(options.exemptionTypes)
        setApplicationStatusOptions(options.applicationStatuses)
        setProductTypeOptions(options.productTypes)
        setRegionOptions(mapValueLabelOptionsToIdTextOptions(options.regions))
        setOptionsUnavailable(false)
      } catch {
        setOptionsUnavailable(true)
      } finally {
        setOptionsLoading(false)
      }
    }

    void loadOptions()
  }, [])

  useEffect(() => {
    if (
      optionsLoading ||
      preferenceLoading ||
      optionsUnavailable ||
      searchParams.has('region') ||
      defaultRegionAreaIds.length === 0
    ) {
      return
    }

    if (hasSearchQuery) {
      setSearchParams(
        buildSearchParams(
          {
            ...urlState.filters,
            region: defaultRegionAreaIds,
          },
          urlState.sortField,
          urlState.sortDirection,
          urlState.page,
          urlState.pageSize,
        ),
        { replace: true },
      )
      return
    }

    setFilters((currentFilters) => ({
      ...currentFilters,
      region: defaultRegionAreaIds,
    }))
  }, [
    defaultRegionAreaIds,
    hasSearchQuery,
    optionsLoading,
    optionsUnavailable,
    preferenceLoading,
    searchParams,
    setFilters,
    setSearchParams,
    urlState,
  ])

  const onSearch = () => {
    if (loading || hasDateValidationError) {
      return
    }
    clearSelection()
    const nextSearchParams = buildSearchParams(
      filters,
      sortField,
      sortDirection,
      DEFAULT_SEARCH_PAGE,
      pageSize,
    )
    if (nextSearchParams.toString() === searchParams.toString()) {
      void runSearch(
        {
          filters,
          page: DEFAULT_SEARCH_PAGE - 1,
          pageSize,
          sortField,
          sortDirection,
        },
        { force: true },
      )
      return
    }
    setSearchParams(nextSearchParams)
  }

  const onClearFilters = () => {
    clearSelection()
    const defaultFilters = {
      ...INITIAL_FILTERS,
      region: defaultRegionAreaIds,
    }
    setFilters(defaultFilters)
    setSearchParams(
      buildSearchParams(
        defaultFilters,
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
      buildSearchParams(appliedFilters, column, nextDirection, DEFAULT_SEARCH_PAGE, pageSize),
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
    <Grid
      fullWidth
      className="default-grid fullbleed-table-page provincial-application-search-page"
    >
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Provincial application search"
          subtitle="Find provincial applications and manage eligible application workflows."
        />
      </Column>

      {optionsUnavailable && <AuthoritativeOptionsUnavailableNotification />}

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters provincial-application-search-filters">
          <Tile>
            <form
              className="legacy-search-form"
              onSubmit={(event) => {
                event.preventDefault()
                onSearch()
              }}
            >
              {filters.exportScheduleId && (
                <InlineNotification
                  kind="info"
                  lowContrast
                  title="Export schedule filter applied"
                  subtitle={`Showing applications assigned to export schedule ${filters.exportScheduleId}.`}
                  onCloseButtonClick={() => updateFilter('exportScheduleId', '')}
                />
              )}
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
                  disabled={optionsLoading || optionsUnavailable}
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
                  disabled={optionsLoading || optionsUnavailable}
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
                  disabled={optionsLoading || optionsUnavailable}
                  onChange={(value) => updateFilter('productTypeCode', value)}
                />
                <RegionMultiSelect
                  id="region"
                  titleText="Region"
                  items={regionOptions}
                  placeholder="Select region(s)"
                  selectedItems={selectedRegions}
                  disabled={optionsLoading || optionsUnavailable}
                  onChange={(nextSelected) => {
                    updateFilter(
                      'region',
                      nextSelected.map((item) => item.id),
                    )
                  }}
                />
                {canCreateExemption && (
                  <>
                    <TextInput
                      id="applicantClientNumber"
                      labelText="Applicant client number"
                      value={filters.applicantClientNumber}
                      onChange={(event) =>
                        updateFilter('applicantClientNumber', event.target.value)
                      }
                    />
                    <TextInput
                      id="ownerClientNumber"
                      labelText="Owner client number"
                      value={filters.ownerClientNumber}
                      onChange={(event) => updateFilter('ownerClientNumber', event.target.value)}
                    />
                  </>
                )}
                {/* INTENTIONAL_LEGACY_DIVERGENCE(SEARCH_FILTER_EXPANSION):
                    Modern application search exposes received-date criteria not shown in legacy. */}
                <IsoDatePicker
                  id="receivedFromDate"
                  labelText="Received from date"
                  value={filters.receivedFromDate}
                  invalid={!isValidIsoDate(filters.receivedFromDate)}
                  invalidText="Date must be YYYY-MM-DD"
                  onChange={(value) => updateFilter('receivedFromDate', value)}
                />
                <IsoDatePicker
                  id="receivedToDate"
                  labelText="Received to date"
                  value={filters.receivedToDate}
                  invalid={!isValidIsoDate(filters.receivedToDate)}
                  invalidText="Date must be YYYY-MM-DD"
                  onChange={(value) => updateFilter('receivedToDate', value)}
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
                  type="button"
                  kind="tertiary"
                  onClick={onClearFilters}
                  disabled={loading}
                  size="md"
                >
                  Clear all
                </Button>
                <SearchSubmitButton loading={loading} disabled={hasDateValidationError} />
                {canCreateExemption && (
                  <DisabledButtonTooltip
                    disabled={selectedRowsCount === 0}
                    description="Select at least one eligible application."
                  >
                    <Button
                      type="button"
                      kind="tertiary"
                      size="md"
                      onClick={onCreateExemptionClick}
                      disabled={selectedRowsCount === 0}
                    >
                      Create exemption for Selected Applications
                    </Button>
                  </DisabledButtonTooltip>
                )}
              </div>
              {canCreateApplication && (
                <div className="provincial-application-create-link">
                  <Link className="cds--link" to="/provincial/application/create">
                    Add Application
                  </Link>
                </div>
              )}
              {exemptionStatus && (
                <AppNotification
                  className="legacy-inline-notification"
                  kind={exemptionStatus.kind}
                  title="Validation failed"
                  subtitle={exemptionStatus.message}
                  onCloseButtonClick={() => setExemptionStatus(null)}
                />
              )}
            </form>
          </Tile>
        </section>
      </Column>

      <Column
        sm={4}
        md={8}
        lg={16}
        hidden={!hasSearchQuery}
        style={{ display: hasSearchQuery ? undefined : 'none' }}
      >
        <section
          className="legacy-search-section legacy-search-section--results"
          aria-label="Search results"
        >
          <SearchResultsTableFrame
            loading={loading}
            loadingDescription="Loading application search results..."
            totalItems={
              errorMessage || (loading && results.content.length === 0)
                ? undefined
                : results.page.totalElements
            }
          >
            {errorMessage ? (
              <EmptyState
                role="alert"
                title="Application search unavailable"
                description={errorMessage}
              />
            ) : results.content.length > 0 ? (
              <Table size="md" useZebraStyles>
                <TableHead>
                  <TableRow>
                    {canCreateExemption && (
                      <TableHeader>
                        <DisabledButtonTooltip
                          disabled={selectableRows.length === 0}
                          description="No eligible applications are available on this page."
                        >
                          <Checkbox
                            id="selectAllCurrentPageRows"
                            hideLabel
                            labelText="Select all rows on this page"
                            checked={allSelectableRowsAreSelected}
                            disabled={selectableRows.length === 0}
                            onChange={(_, payload) =>
                              toggleSelectAllRowsOnPage(Boolean(payload.checked))
                            }
                          />
                        </DisabledButtonTooltip>
                      </TableHeader>
                    )}
                    {visibleResultColumns.map((column) => (
                      <TableHeader key={column.id}>
                        {column.sortField ? (
                          <button
                            type="button"
                            className="legacy-sort-button"
                            onClick={() => onHeaderClick(column.sortField!)}
                          >
                            {column.label}
                          </button>
                        ) : (
                          column.label
                        )}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.content.map((row) => (
                    <TableRow key={row.applicationNumber}>
                      {canCreateExemption && (
                        <TableCell>
                          <DisabledButtonTooltip
                            disabled={!row.allowCreateExemption}
                            description={disabledExemptionSelectionDescription(row)}
                          >
                            <Checkbox
                              id={`selectRow-${row.applicationNumber}`}
                              hideLabel
                              labelText={`Select ${row.applicationNumber}`}
                              checked={Boolean(selectedRowsById[row.applicationNumber])}
                              disabled={!row.allowCreateExemption}
                              onChange={(_, payload) =>
                                toggleRowSelection(row, Boolean(payload.checked))
                              }
                            />
                          </DisabledButtonTooltip>
                        </TableCell>
                      )}
                      <TableCell>
                        <Link
                          className="cds--link"
                          to={withCurrentSearch(`/provincial/application/${row.applicationNumber}`)}
                        >
                          {row.applicationNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusTag status={row.status} />
                      </TableCell>
                      {canCreateExemption && <TableCell>{row.applicantClientNumber}</TableCell>}
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
                      <TableCell className="legacy-search-table-date">{row.listingDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : !loading ? (
              <EmptyState
                title="No applications found"
                description="No applications found for the selected criteria."
              />
            ) : null}
            {!errorMessage && (!loading || results.content.length > 0) && (
              <Pagination
                page={results.page.number + 1}
                pageSize={results.page.size}
                pageSizes={[...SEARCH_PAGE_SIZE_OPTIONS]}
                totalItems={results.page.totalElements}
                onChange={({ page, pageSize: nextPageSize }) => {
                  clearSelection()
                  setSearchParams(
                    buildSearchParams(appliedFilters, sortField, sortDirection, page, nextPageSize),
                  )
                }}
              />
            )}
          </SearchResultsTableFrame>
        </section>
      </Column>
    </Grid>
  )
}

export default ProvincialApplicationPage
