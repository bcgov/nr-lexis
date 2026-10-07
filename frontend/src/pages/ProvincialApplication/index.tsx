import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Column,
  DismissibleTag,
  Grid,
  InlineNotification,
  Pagination,
  Table,
  TableBody,
  TableBatchActions,
  TableBatchAction,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextInput,
  Tile,
} from '@carbon/react'
import { Add } from '@carbon/icons-react'
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import { AppNotification } from '../../components/AppNotification'
import EmptyState from '@/components/EmptyState'
import ForestClientComboBox from '@/components/ForestClientComboBox'
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
import { useAllowedRegionOptions } from '@/context/auth/useAllowedRegionOptions'
import { hasProvincialStaffRole } from '@/context/auth/role-utils'
import { hasInvalidIsoDateValue } from '@/pages/shared/create-form-utils'
import { batchSelectionTranslator } from '@/pages/shared/batch-selection'
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
  toCarbonSortDirection,
  type IdTextOption,
} from '@/pages/shared/search-query-utils'
import { useSearchFilterDraft } from '@/pages/shared/useSearchFilterDraft'
import { usePersistedSearchParams } from '@/pages/shared/usePersistedSearchParams'
import { useDefaultRegionPreference } from '@/pages/shared/useDefaultRegionPreference'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  formatDeferredSearchTotalLabel,
  loadSearchWithDeferredTotal,
  prefetchNextSearchPage,
  type DeferredSearchTotalStatus,
} from '@/pages/shared/deferred-search-total'
import {
  countProvincialApplications,
  searchProvincialApplications,
} from '@/service/provincial-application-search-service'
import {
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'
import { resolveDefaultZoneRegionIds } from '@/service/user-preference-service'
import { displayTableValue } from '@/utils/text'
import { formatIsoDateLabel } from '@/utils/date'
import IsoDateRangePicker from '@/components/IsoDateRangePicker'
import ConfirmationModal from '@/components/ConfirmationModal'
import {
  fetchProvincialExemptionCreatePreview,
  submitProvincialExemptionCreate,
} from '@/service/create-submit-service'
import { formatVolume } from '@/utils/volume'

type ExemptionStatus = {
  kind: 'error'
  message: string
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
  agentClientNumber: '',
}

const EMPTY_RESULTS = createEmptyPagedSearchResponse<ProvincialApplicationSearchResponse>()
const APPLICATION_BATCH_SELECTION = batchSelectionTranslator('application', 'applications')

// INTENTIONAL_LEGACY_DIVERGENCE(SEARCH_RESULT_COLUMNS)
const RESULT_COLUMNS: {
  id: string
  label: string
  sortField?: ProvincialApplicationSearchSortField
}[] = [
  { id: 'applicationNumber', label: 'Application', sortField: 'applicationNumber' },
  { id: 'status', label: 'Status' },
  {
    id: 'ownerClientNumber',
    label: 'Owner client number',
    sortField: 'displayOwnerClientNumber',
  },
  { id: 'agentClientNumber', label: 'Agent client number', sortField: 'agentClientNumber' },
  { id: 'applicationVolume', label: 'Application volume (m³)' },
  { id: 'exemptionNumber', label: 'Exemption number', sortField: 'exemptionNumber' },
  { id: 'listingDate', label: 'List date', sortField: 'listingDate' },
  { id: 'region', label: 'Region', sortField: 'regionCode' },
]

const DEFAULT_SORT_FIELD: ProvincialApplicationSearchSortField = 'applicationNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc'
const SORT_FIELD_OPTIONS = RESULT_COLUMNS.flatMap((column) =>
  column.sortField ? [column.sortField] : [],
)

const disabledExemptionSelectionDescription = (row: ProvincialApplicationSearchItem): string => {
  if (row.exemptionNumber) {
    return 'This application already has an exemption.'
  }
  if (row.locked) {
    return 'This application is currently locked and cannot be selected.'
  }
  return 'Eligible applications must be approved, have no existing exemption or active valid offer, and not have a future listing date unless they are standing timber.'
}

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
    ['exportScheduleId', filters.exportScheduleId ?? ''],
    ['applicantClientNumber', filters.applicantClientNumber],
    ['ownerClientNumber', filters.ownerClientNumber],
    ['agentClientNumber', filters.agentClientNumber ?? ''],
    ['sortField', sortField],
    ['sortDirection', sortDirection],
    ['page', page],
    ['pageSize', pageSize],
  ])

const ProvincialApplicationPage = () => {
  const navigate = useNavigate()
  const { capabilities, canPerform } = useAuth()
  const [searchParams, setSearchParams] = usePersistedSearchParams('provincial-applications')
  const [allRegionOptions, setAllRegionOptions] = useState<IdTextOption[]>([])
  const regionOptions = useAllowedRegionOptions(allRegionOptions, '/applicationSearch', 'id')
  const { defaultRegion: defaultZone, preferenceLoading } = useDefaultRegionPreference(
    hasProvincialStaffRole(capabilities.roles),
  )
  const [exemptionTypeOptions, setExemptionTypeOptions] = useState<SearchOption[]>([])
  const [applicationStatusOptions, setApplicationStatusOptions] = useState<SearchOption[]>([])
  const [productTypeOptions, setProductTypeOptions] = useState<SearchOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [searchResult, setSearchResult] = useState<{
    results: ProvincialApplicationSearchResponse
    totalStatus: DeferredSearchTotalStatus
  }>({ results: EMPTY_RESULTS, totalStatus: 'exact' })
  const { results, totalStatus } = searchResult
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<
    Record<string, ProvincialApplicationSearchItem>
  >({})
  const [exemptionStatus, setExemptionStatus] = useState<ExemptionStatus | null>(null)
  // The applications in Figma's "Create new exemption" confirmation, while it is open.
  const [exemptionConfirmationNumbers, setExemptionConfirmationNumbers] = useState<string[] | null>(
    null,
  )
  const totalCacheRef = useRef<SearchTotalCache>(new Map())
  const canCreateExemption = canPerform('/createExemption')
  const canCreateApplication = canPerform('createApplication')
  const canFilterByClient = hasProvincialStaffRole(capabilities.roles)
  const visibleResultColumns = canCreateExemption
    ? RESULT_COLUMNS
    : RESULT_COLUMNS.filter((column) => column.id !== 'agentClientNumber')
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
      // Figma has no received-date criteria, so an old link can't apply a hidden one.
      receivedFromDate: '',
      receivedToDate: '',
      listingFromDate: searchParams.get('listingFromDate') ?? '',
      listingToDate: searchParams.get('listingToDate') ?? '',
      exportScheduleId: searchParams.get('exportScheduleId') ?? '',
      applicantClientNumber: searchParams.get('applicantClientNumber') ?? '',
      ownerClientNumber: searchParams.get('ownerClientNumber') ?? '',
      agentClientNumber: searchParams.get('agentClientNumber') ?? '',
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
  const [clientSearchResetKey, setClientSearchResetKey] = useState(0)
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
  const defaultZoneRegionIds = useMemo(
    () =>
      resolveDefaultZoneRegionIds(
        defaultZone,
        regionOptions.map((region) => region.id),
      ),
    [defaultZone, regionOptions],
  )
  const regionDefaultPending =
    !searchParams.has('region') &&
    (optionsLoading ||
      preferenceLoading ||
      (!optionsUnavailable && defaultZoneRegionIds.length > 0))

  const hasDateValidationError = useMemo(() => {
    return hasInvalidIsoDateValue(filters.listingFromDate, filters.listingToDate)
  }, [filters.listingFromDate, filters.listingToDate])

  const beginSearchRequest = useLatestRequestGuard()
  const commitResults = useCallback(
    (
      nextResults: ProvincialApplicationSearchResponse,
      nextTotalStatus: DeferredSearchTotalStatus,
    ) => {
      setSearchResult({ results: nextResults, totalStatus: nextTotalStatus })
    },
    [],
  )

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
          prefetchNextSearchPage({
            pageId: 'provincial-application-search',
            principal: capabilities?.principal,
            request,
            response: cachedResults,
            search: searchProvincialApplications,
            onError: console.error,
          })
          commitResults(cachedResults, 'exact')
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      if (hasInvalidIsoDateValue(request.filters.listingFromDate, request.filters.listingToDate)) {
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
            prefetchNextSearchPage({
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
              commitResults(response, totalIsExact ? 'exact' : 'pending')
            }
          })
        }
        const { response, totalIsExact, deferredResponse } = await loadSearchWithDeferredTotal({
          request,
          cachedTotal,
          search: searchProvincialApplications,
          count: countProvincialApplications,
          deferCount: true,
        })
        if (isLatestRequest()) {
          commitSearchResponse(response, totalIsExact)
        }
        if (deferredResponse) {
          void deferredResponse
            .then((exactResponse) => {
              if (isLatestRequest()) {
                commitSearchResponse(exactResponse, true)
              }
            })
            .catch((error) => {
              console.error(error)
              if (isLatestRequest()) {
                commitResults(response, 'unavailable')
              }
            })
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve application search results.')
          commitResults(EMPTY_RESULTS, 'exact')
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
        const options = await fetchProvincialApplicationOptions(true)

        setExemptionTypeOptions(options.exemptionTypes)
        setApplicationStatusOptions(options.applicationStatuses)
        setProductTypeOptions(options.productTypes)
        setAllRegionOptions(mapValueLabelOptionsToIdTextOptions(options.regions))
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
      defaultZoneRegionIds.length === 0
    ) {
      return
    }

    if (hasSearchQuery) {
      setSearchParams(
        buildSearchParams(
          {
            ...urlState.filters,
            region: defaultZoneRegionIds,
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
      region: defaultZoneRegionIds,
    }))
  }, [
    defaultZoneRegionIds,
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
    setClientSearchResetKey((current) => current + 1)
    const defaultFilters = {
      ...INITIAL_FILTERS,
      region: defaultZoneRegionIds,
    }
    setFilters(defaultFilters)
    // INTENTIONAL_LEGACY_DIVERGENCE(CLEAR_ALL_RESETS_SEARCH)
    setSearchParams(new URLSearchParams())
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
    const selectedRows = Object.values(selectedRowsById)
    // The selection stays while the confirmation is open, so Cancel returns to it.
    if (!canCreateExemption) {
      clearSelection()
      setExemptionStatus({
        kind: 'error',
        message: 'Your account is not authorized to create exemptions.',
      })
      return
    }

    if (selectedRows.length === 0) {
      clearSelection()
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
      clearSelection()
      setExemptionStatus({
        kind: 'error',
        message:
          'Selected applications do not share the same client numbers. Multi-application exemptions require matching clients.',
      })
      return
    }

    setExemptionConfirmationNumbers(selectedRows.map((row) => row.applicationNumber))
  }

  // INTENTIONAL_LEGACY_DIVERGENCE(APPLICATION_SEARCH_CREATE_EXEMPTION)
  // Figma: confirm, create the exemption from the applications, then open it on its Applicant tab.
  // The preview re-validates the applications, so a retry can't add them to a second exemption.
  const createExemptionFromApplications = async (applicationNumbers: string[]) => {
    const preview = await fetchProvincialExemptionCreatePreview(applicationNumbers)
    const result = await submitProvincialExemptionCreate({
      applicationNumber: preview.applicationNumbers[0] ?? '',
      linkedApplicationNumbers: preview.applicationNumbers,
      exemptionNumber: '',
      exemptionTypeCode: preview.exemptionTypeCode,
      exemptionStatusCode: preview.exemptionStatusCode,
      approvalDate: '',
      expiryDate: preview.expiryDate,
      approvedVolume: preview.approvedVolume,
      enableRateOverride: false,
      feeRate: '',
      regionNumbers: [],
      otherConditions: '',
    })
    if (!result.success) {
      throw new Error(
        result.outcomeUnknown
          ? `LEXIS could not confirm whether the exemption was created. Search for application ${preview.applicationNumbers[0]} to check before trying again.`
          : result.errors[0] ||
              result.message ||
              'The exemption could not be created. Please try again. If the problem persists, contact support.',
      )
    }
    if (!result.createdId) {
      throw new Error(
        `The exemption was created, but LEXIS did not return its number. Search for application ${preview.applicationNumbers[0]} to open it.`,
      )
    }
    navigate(`/provincial/exemption/${encodeURIComponent(result.createdId)}`, {
      state: {
        exemptionCreationNotice: {
          exemptionNumber: result.createdId,
          applicationNumbers: preview.applicationNumbers,
        },
        returnTo: { label: 'Application search', to: withCurrentSearch('/provincial/application') },
      },
    })
  }

  return (
    <Grid
      fullWidth
      className="default-grid fullbleed-table-page provincial-application-search-page"
    >
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Application search"
          subtitle="Find provincial applications and manage eligible application workflows."
          actions={
            canCreateApplication ? (
              <Button
                as={Link}
                to="/provincial/application/create"
                kind="primary"
                size="md"
                renderIcon={Add}
              >
                Add application
              </Button>
            ) : undefined
          }
          actionsLabel="Application actions"
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
                <IsoDateRangePicker
                  fromId="listingFromDate"
                  toId="listingToDate"
                  fromLabel="List date from"
                  toLabel="List date to"
                  fromValue={filters.listingFromDate}
                  toValue={filters.listingToDate}
                  onChange={([listingFromDate, listingToDate]) => {
                    clearSelection()
                    setFilters((current) => ({ ...current, listingFromDate, listingToDate }))
                  }}
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
                <SearchableSelect
                  id="applicationStatus"
                  labelText="Application status"
                  value={filters.applicationStatus}
                  placeholder="All statuses"
                  options={applicationStatusOptions}
                  disabled={optionsLoading || optionsUnavailable}
                  onChange={(value) => updateFilter('applicationStatus', value)}
                />
                {canFilterByClient && (
                  <>
                    <ForestClientComboBox
                      id="ownerClientNumber"
                      labelText="Owner client"
                      value={filters.ownerClientNumber}
                      resetKey={clientSearchResetKey}
                      onChange={(value) => updateFilter('ownerClientNumber', value)}
                    />
                    <ForestClientComboBox
                      id="agentClientNumber"
                      labelText="Agent client"
                      value={filters.agentClientNumber ?? ''}
                      resetKey={clientSearchResetKey}
                      onChange={(value) => updateFilter('agentClientNumber', value)}
                    />
                  </>
                )}
                <div className="application-search-product-filter">
                  <SearchableSelect
                    id="productTypeCode"
                    labelText="Product type"
                    value={filters.productTypeCode}
                    placeholder="All product types"
                    options={productTypeOptions}
                    disabled={optionsLoading || optionsUnavailable}
                    onChange={(value) => updateFilter('productTypeCode', value)}
                  />
                </div>
              </div>
              {canFilterByClient && filters.applicantClientNumber && (
                <div>
                  <DismissibleTag
                    text={`Applicant client: ${filters.applicantClientNumber}`}
                    title="Remove applicant client filter"
                    dismissTooltipLabel="Remove applicant client filter"
                    onClose={() => updateFilter('applicantClientNumber', '')}
                  />
                  <p className="cds--form__helper-text">
                    Matches the designated applicant (owner or agent). Select Search to apply
                    changes.
                  </p>
                </div>
              )}
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
            loadingDescription="Loading application search results…"
            columnCount={visibleResultColumns.length + (canCreateExemption ? 1 : 0)}
            totalItems={
              errorMessage || (loading && results.content.length === 0)
                ? undefined
                : results.page.totalElements
            }
            totalItemsLabel={formatDeferredSearchTotalLabel(
              results.page.totalElements,
              totalStatus,
              results.page.number * results.page.size + results.content.length,
            )}
            actions={
              canCreateExemption && selectedRowsCount > 0 ? (
                <TableBatchActions
                  totalSelected={selectedRowsCount}
                  shouldShowBatchActions
                  onCancel={clearSelection}
                  translateWithId={APPLICATION_BATCH_SELECTION}
                >
                  <TableBatchAction renderIcon={Add} onClick={onCreateExemptionClick}>
                    Create exemption
                  </TableBatchAction>
                </TableBatchActions>
              ) : undefined
            }
          >
            {errorMessage ? (
              <EmptyState
                role="alert"
                title="Application search unavailable"
                description={errorMessage}
              />
            ) : results.content.length > 0 ? (
              <Table
                size="md"
                useZebraStyles
                className={canCreateExemption ? 'application-search-table--selectable' : undefined}
              >
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
                      <TableHeader
                        key={column.id}
                        isSortable={Boolean(column.sortField)}
                        isSortHeader={column.sortField === sortField}
                        sortDirection={
                          column.sortField === sortField
                            ? toCarbonSortDirection(sortDirection)
                            : 'NONE'
                        }
                        onClick={
                          column.sortField ? () => onHeaderClick(column.sortField!) : undefined
                        }
                      >
                        {column.label}
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
                            {row.allowCreateExemption ? (
                              <Checkbox
                                id={`selectRow-${row.applicationNumber}`}
                                hideLabel
                                labelText={`Select application ${row.applicationNumber}`}
                                checked={Boolean(selectedRowsById[row.applicationNumber])}
                                disabled={!row.allowCreateExemption}
                                onChange={(_, payload) =>
                                  toggleRowSelection(row, Boolean(payload.checked))
                                }
                              />
                            ) : (
                              <span className="sr-only">
                                {disabledExemptionSelectionDescription(row)}
                              </span>
                            )}
                          </DisabledButtonTooltip>
                        </TableCell>
                      )}
                      <TableCell>
                        <Link
                          className="cds--link"
                          to={withCurrentSearch(`/provincial/application/${row.applicationNumber}`)}
                          state={{
                            returnTo: {
                              label: 'Application search',
                              to: withCurrentSearch('/provincial/application'),
                            },
                          }}
                        >
                          {row.applicationNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusTag
                          status={
                            applicationStatusOptions.find((option) => option.value === row.status)
                              ?.label ?? row.status
                          }
                        />
                      </TableCell>
                      <TableCell>{displayTableValue(row.ownerClientNumber)}</TableCell>
                      {canCreateExemption && (
                        <TableCell>{displayTableValue(row.agentClientNumber)}</TableCell>
                      )}
                      <TableCell>{formatVolume(row.applicationVolume)}</TableCell>
                      <TableCell>
                        {row.exemptionNumber ? (
                          <Link
                            className="cds--link"
                            to={withCurrentSearch(`/provincial/exemption/${row.exemptionNumber}`)}
                            state={{
                              returnTo: {
                                label: 'Application search',
                                to: withCurrentSearch('/provincial/application'),
                              },
                            }}
                          >
                            {row.exemptionNumber}
                          </Link>
                        ) : (
                          displayTableValue(row.exemptionNumber)
                        )}
                      </TableCell>
                      <TableCell className="legacy-search-table-date">
                        {displayTableValue(formatIsoDateLabel(row.listingDate))}
                      </TableCell>
                      <TableCell>{displayTableValue(row.region)}</TableCell>
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
              <>
                <div className="legacy-search-result-count legacy-search-result-count--footer">
                  {formatDeferredSearchTotalLabel(
                    results.page.totalElements,
                    totalStatus,
                    results.page.number * results.page.size + results.content.length,
                  ) ??
                    `${results.page.totalElements.toLocaleString('en-CA')} ${results.page.totalElements === 1 ? 'result' : 'results'} found`}
                </div>
                <Pagination
                  page={results.page.number + 1}
                  pageSize={results.page.size}
                  pageSizes={[...SEARCH_PAGE_SIZE_OPTIONS]}
                  totalItems={results.page.totalElements}
                  pagesUnknown={totalStatus !== 'exact'}
                  isLastPage={totalStatus !== 'exact' && results.content.length < results.page.size}
                  onChange={({ page, pageSize: nextPageSize }) => {
                    clearSelection()
                    setSearchParams(
                      buildSearchParams(
                        appliedFilters,
                        sortField,
                        sortDirection,
                        page,
                        nextPageSize,
                      ),
                    )
                  }}
                />
              </>
            )}
          </SearchResultsTableFrame>
        </section>
      </Column>
      {exemptionConfirmationNumbers && (
        <ConfirmationModal
          open
          title="Create new exemption"
          description="You are about to create a new exemption with the following applications:"
          confirmLabel="Create exemption"
          pendingLabel="Creating exemption…"
          errorTitle="Exemption not created"
          onConfirm={() => createExemptionFromApplications(exemptionConfirmationNumbers)}
          onClose={() => setExemptionConfirmationNumbers(null)}
        >
          <ul className="application-exemption-confirmation__list">
            {exemptionConfirmationNumbers.map((applicationNumber) => (
              <li key={applicationNumber}>
                <strong>{applicationNumber}</strong>
              </li>
            ))}
          </ul>
          <p>This action cannot be undone.</p>
        </ConfirmationModal>
      )}
    </Grid>
  )
}

export default ProvincialApplicationPage
