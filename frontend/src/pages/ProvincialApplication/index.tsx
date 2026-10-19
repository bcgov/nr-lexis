import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Column,
  DismissibleTag,
  Grid,
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
import { Add, Rule } from '@carbon/icons-react'
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import { AppNotification } from '../../components/AppNotification'
import EmptyState from '@/components/EmptyState'
import Pagination from '@/components/Pagination'
import ForestClientComboBox from '@/components/ForestClientComboBox'
import DisabledButtonTooltip from '@/components/DisabledButtonTooltip'
import IneligibleRowCheckbox from '@/components/IneligibleRowCheckbox'
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
import { canUseDefaultRegionPreference } from '@/context/auth/region-utils'
import { hasInvalidIsoDateRange } from '@/pages/shared/create-form-utils'
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

const EXEMPTION_PERMISSION_MESSAGE = "You don't have permission to create this exemption."
const EXEMPTION_DIFFERENT_CLIENTS_MESSAGE =
  'The selected applications must have the same owner and agent. Change your selection and try again.'
const EXEMPTION_CREATE_FAILED_MESSAGE =
  'The exemption could not be created. Please try again. If the problem persists, contact support.'

// The exemption create checks report these server messages; the search explains them in its own
// words. When an application changed after the search, the results refresh to show its state.
const EXEMPTION_CREATE_ERRORS: {
  pattern: RegExp
  message: (match: RegExpExecArray) => string
  refreshResults?: boolean
}[] = [
  {
    pattern: /^Application (\S+) must have a status of approved\.$/,
    message: ([, application]) =>
      `Application ${application} is no longer Approved. Its current status now shows in the results.`,
    refreshResults: true,
  },
  {
    pattern: /^Application (\S+) is already assigned to exemption (\S+?)\.$/,
    message: ([, application, exemption]) =>
      `Application ${application} is already in exemption ${exemption}. Remove it from your selection and try again.`,
    refreshResults: true,
  },
  {
    pattern: /^Application (\S+) has valid offers and cannot be added to an exemption\.$/,
    message: ([, application]) =>
      `Application ${application} has a valid offer, so it can't be exempted. Remove it from your selection and try again.`,
    refreshResults: true,
  },
  {
    pattern: /^Application (\S+) listing date has not passed\.$/,
    message: ([, application]) =>
      `Application ${application} can't be exempted until its list date has passed. Remove it from your selection and try again.`,
  },
  {
    pattern:
      /^Application \S+ cannot be added to this exemption because its owner or agent client details do not match the other applications\.$/,
    message: () => EXEMPTION_DIFFERENT_CLIENTS_MESSAGE,
  },
  {
    pattern: /^Insufficient privileges to add application \S+\.$/,
    message: () => EXEMPTION_PERMISSION_MESSAGE,
  },
]

// Any other failure gets the generic message, never the server's own text.
const exemptionCreateError = (error: unknown): { message: string; refreshResults: boolean } => {
  const serverMessage = error instanceof Error ? error.message.trim() : ''
  for (const { pattern, message, refreshResults = false } of EXEMPTION_CREATE_ERRORS) {
    const match = pattern.exec(serverMessage)
    if (match) return { message: message(match), refreshResults }
  }
  return { message: EXEMPTION_CREATE_FAILED_MESSAGE, refreshResults: false }
}

const hasInvalidSearchDates = (filters: ProvincialApplicationSearchFilters): boolean =>
  hasInvalidIsoDateRange(filters.listingFromDate, filters.listingToDate)

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
  { id: 'applicationNumber', label: 'Application number', sortField: 'applicationNumber' },
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
    canUseDefaultRegionPreference(capabilities),
  )
  const [exemptionTypeOptions, setExemptionTypeOptions] = useState<SearchOption[]>([])
  const [applicationStatusOptions, setApplicationStatusOptions] = useState<SearchOption[]>([])
  const [productTypeOptions, setProductTypeOptions] = useState<SearchOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [searchResult, setSearchResult] = useState<{
    results: ProvincialApplicationSearchResponse
    totalStatus: DeferredSearchTotalStatus
    searched: boolean
  }>({ results: EMPTY_RESULTS, totalStatus: 'exact', searched: false })
  const { results, totalStatus, searched } = searchResult
  const [loading, setLoading] = useState(false)
  // Results show as loading, not as zero results, until the first search returns.
  const resultsLoading = loading || !searched
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<
    Record<string, ProvincialApplicationSearchItem>
  >({})
  const [exemptionStatus, setExemptionStatus] = useState<ExemptionStatus | null>(null)
  // The applications in Figma's "Create new exemption" confirmation, while it is open.
  const [exemptionConfirmationNumbers, setExemptionConfirmationNumbers] = useState<string[] | null>(
    null,
  )
  // The batch action that opened the confirmation gets focus back when it closes.
  const createExemptionActionRef = useRef<HTMLElement | null>(null)
  const totalCacheRef = useRef<SearchTotalCache>(new Map())
  const canCreateExemption = canPerform('/createExemption')
  const canCreateApplication = canPerform('createApplication')
  const canFilterByClient = hasProvincialStaffRole(capabilities.roles)
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
  // A saved link with invalid dates doesn't run its search, so it has no results to show.
  const showResults = hasSearchQuery && !hasInvalidSearchDates(appliedFilters)
  // No results show only the empty state, without counts or pagination.
  const noResults = results.content.length === 0 && results.page.totalElements === 0
  const clearSelection = useCallback(() => {
    setSelectedRowsById({})
    setExemptionStatus(null)
  }, [])
  const selectAllRowsRef = useRef<HTMLInputElement>(null)
  const resultsFrameRef = useRef<HTMLDivElement>(null)
  // Cancel closes the batch bar that holds focus, so focus goes to the header checkbox.
  const cancelBatchSelection = useCallback(() => {
    clearSelection()
    requestAnimationFrame(() => {
      const selectAll = selectAllRowsRef.current
      if (selectAll && !selectAll.disabled) {
        selectAll.focus()
      } else {
        resultsFrameRef.current?.focus()
      }
    })
  }, [clearSelection])
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

  const hasDateValidationError = hasInvalidSearchDates(filters)

  const beginSearchRequest = useLatestRequestGuard()
  const commitResults = useCallback(
    (
      nextResults: ProvincialApplicationSearchResponse,
      nextTotalStatus: DeferredSearchTotalStatus,
    ) => {
      setSearchResult({ results: nextResults, totalStatus: nextTotalStatus, searched: true })
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

      if (hasInvalidSearchDates(request.filters)) {
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
          setErrorMessage('Unable to retrieve application search results. Try again.')
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
  const someSelectableRowsAreSelected = selectableRows.some((item) =>
    Boolean(selectedRowsById[item.applicationNumber]),
  )

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

  const onCreateExemptionClick = (event: MouseEvent<HTMLElement>) => {
    createExemptionActionRef.current = event.currentTarget
    const selectedRows = Object.values(selectedRowsById)
    // The selection stays while the confirmation is open, so Cancel returns to it.
    if (!canCreateExemption) {
      clearSelection()
      setExemptionStatus({ kind: 'error', message: EXEMPTION_PERMISSION_MESSAGE })
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

    // The selection and the focused batch action stay, so the selection can be changed.
    if (!allRowsMatchClientNumbers) {
      setExemptionStatus({ kind: 'error', message: EXEMPTION_DIFFERENT_CLIENTS_MESSAGE })
      return
    }

    setExemptionStatus(null)
    setExemptionConfirmationNumbers(selectedRows.map((row) => row.applicationNumber))
  }

  const refreshResults = () =>
    void runSearch(
      {
        filters: appliedFilters,
        page: urlState.page - 1,
        pageSize,
        sortField,
        sortDirection,
      },
      { force: true },
    )

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
    if (!result.success || !result.createdId) {
      throw new Error(result.errors[0] || result.message)
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

  // A failure closes the confirmation and shows the reason above the results, with the selection
  // kept and focus back on the batch action.
  const confirmExemptionCreate = async (applicationNumbers: string[]) => {
    try {
      await createExemptionFromApplications(applicationNumbers)
    } catch (error) {
      const createError = exemptionCreateError(error)
      setExemptionStatus({ kind: 'error', message: createError.message })
      if (createError.refreshResults) refreshResults()
    }
  }

  return (
    <Grid
      fullWidth
      className="default-grid fullbleed-table-page provincial-application-search-page"
    >
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Application search"
          subtitle="Find applications and check their status"
          focusTitle="whenFocusLost"
          actions={
            canCreateApplication ? (
              <Button
                as={Link}
                to="/provincial/application/create"
                kind="tertiary"
                size="md"
                renderIcon={Add}
              >
                Create application
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
                  placeholder="All"
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
                  placeholder="All"
                  allOptionLabel="All"
                  options={exemptionTypeOptions}
                  disabled={optionsLoading || optionsUnavailable}
                  onChange={(value) => updateFilter('exemptionType', value)}
                />
                <SearchableSelect
                  id="applicationStatus"
                  labelText="Application status"
                  value={filters.applicationStatus}
                  placeholder="All"
                  allOptionLabel="All"
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
                    placeholder="All"
                    allOptionLabel="All"
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
                <SearchSubmitButton loading={loading} invalid={hasDateValidationError} />
              </div>
            </form>
          </Tile>
        </section>
      </Column>

      {exemptionStatus && (
        <AppNotification
          kind={exemptionStatus.kind}
          role="alert"
          title="Exemption not created"
          subtitle={exemptionStatus.message}
          onCloseButtonClick={() => setExemptionStatus(null)}
        />
      )}

      <Column
        sm={4}
        md={8}
        lg={16}
        hidden={!showResults}
        style={{ display: showResults ? undefined : 'none' }}
      >
        <section
          className="legacy-search-section legacy-search-section--results"
          aria-label="Search results"
        >
          {canCreateExemption && (
            // The batch bar only mounts once something is selected, so the count is announced here.
            <div className="cds--visually-hidden" aria-live="polite" aria-atomic="true">
              {selectedRowsCount > 0
                ? APPLICATION_BATCH_SELECTION('carbon.table.batch.items.selected', {
                    totalSelected: selectedRowsCount,
                  })
                : null}
            </div>
          )}
          <SearchResultsTableFrame
            ref={resultsFrameRef}
            resultName="application"
            loading={resultsLoading}
            loadingDescription="Searching"
            columnCount={RESULT_COLUMNS.length}
            totalItems={
              errorMessage || (resultsLoading && results.content.length === 0)
                ? undefined
                : results.page.totalElements
            }
            hideZeroCount
            totalItemsLabel={formatDeferredSearchTotalLabel(
              results.page.totalElements,
              totalStatus,
              results.page.number * results.page.size + results.content.length,
              'application',
            )}
            actions={
              canCreateExemption && selectedRowsCount > 0 ? (
                <TableBatchActions
                  totalSelected={selectedRowsCount}
                  shouldShowBatchActions
                  onCancel={cancelBatchSelection}
                  translateWithId={APPLICATION_BATCH_SELECTION}
                >
                  <TableBatchAction renderIcon={Rule} onClick={onCreateExemptionClick}>
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
                            ref={selectAllRowsRef}
                            id="selectAllCurrentPageRows"
                            hideLabel
                            labelText="Select all eligible rows on this page"
                            checked={allSelectableRowsAreSelected}
                            indeterminate={
                              someSelectableRowsAreSelected && !allSelectableRowsAreSelected
                            }
                            disabled={selectableRows.length === 0}
                            onChange={(_, payload) =>
                              toggleSelectAllRowsOnPage(Boolean(payload.checked))
                            }
                          />
                        </DisabledButtonTooltip>
                      </TableHeader>
                    )}
                    {RESULT_COLUMNS.map((column) => (
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
                {/* The toolbar announces the result count, so the rows aren't read out again. */}
                <TableBody aria-live="off">
                  {results.content.map((row) => (
                    <TableRow key={row.applicationNumber}>
                      {canCreateExemption && (
                        <TableCell>
                          {row.allowCreateExemption ? (
                            <Checkbox
                              id={`selectRow-${row.applicationNumber}`}
                              hideLabel
                              labelText={`Select application ${row.applicationNumber}`}
                              checked={Boolean(selectedRowsById[row.applicationNumber])}
                              onChange={(_, payload) =>
                                toggleRowSelection(row, Boolean(payload.checked))
                              }
                            />
                          ) : (
                            <IneligibleRowCheckbox
                              id={`selectRow-${row.applicationNumber}`}
                              labelText={`Select application ${row.applicationNumber}`}
                              reason={disabledExemptionSelectionDescription(row)}
                            />
                          )}
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
                      <TableCell>{displayTableValue(row.agentClientNumber)}</TableCell>
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
                        {displayTableValue(row.listingDate)}
                      </TableCell>
                      <TableCell>{displayTableValue(row.region)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : !resultsLoading ? (
              <EmptyState
                title="No results found"
                description="No records match your search criteria. Try adjusting your filters and searching again."
              />
            ) : null}
            {!errorMessage && !noResults && (!resultsLoading || results.content.length > 0) && (
              <Pagination
                page={results.page.number + 1}
                pageSize={results.page.size}
                pageSizes={[...SEARCH_PAGE_SIZE_OPTIONS]}
                totalItems={results.page.totalElements}
                totalPending={totalStatus === 'pending'}
                pagesUnknown={totalStatus !== 'exact'}
                isLastPage={totalStatus !== 'exact' && results.content.length < results.page.size}
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
      {exemptionConfirmationNumbers && (
        <ConfirmationModal
          open
          title="Create new exemption"
          className="lexis-confirmation-modal--form"
          description="You are about to create a new exemption with the following applications:"
          confirmLabel="Create exemption"
          pendingLabel="Creating exemption…"
          launcherButtonRef={createExemptionActionRef}
          onConfirm={() => confirmExemptionCreate(exemptionConfirmationNumbers)}
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
