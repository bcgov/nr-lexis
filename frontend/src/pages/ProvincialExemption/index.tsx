import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Column,
  DismissibleTag,
  Grid,
  Pagination,
  Table,
  TableBody,
  TableBatchActions,
  TableBatchAction,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { Add, Checkmark } from '@carbon/icons-react'
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import EmptyState from '@/components/EmptyState'
import ForestClientComboBox from '@/components/ForestClientComboBox'
import DisabledButtonTooltip from '@/components/DisabledButtonTooltip'
import ExemptionApprovalModal, {
  type ExemptionApprovalOutcome,
} from '@/components/ExemptionApprovalModal'
import {
  exemptionApprovalResults,
  type ExemptionApprovalFailure,
} from '@/components/exemption-approval-results'
import { ActionResultNotification } from '@/components/ActionResultNotification'
import type { ActionResult } from '@/utils/action-result'
import UnsavedChangesGuard from '@/components/UnsavedChangesGuard'
import PageHeader from '@/components/PageHeader'
import SearchSubmitButton from '@/components/SearchSubmitButton'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import SearchableSelect from '../../components/SearchableSelect'
import RegionMultiSelect from '@/components/RegionMultiSelect'
import StatusTag, { getStatusTagVariant } from '@/components/StatusTag'
import type {
  ProvincialExemptionSearchFilters,
  ProvincialExemptionSearchItem,
  ProvincialExemptionSearchRequest,
  ProvincialExemptionSearchResponse,
  ProvincialExemptionSearchSortField,
} from '@/interfaces/ProvincialExemptionSearch'
import { useAuth } from '@/context/auth/useAuth'
import { useAllowedRegionOptions } from '@/context/auth/useAllowedRegionOptions'
import { hasProvincialStaffRole, isPureExemptionApprover } from '@/context/auth/role-utils'
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
  countProvincialExemptions,
  searchProvincialExemptions,
} from '@/service/provincial-exemption-search-service'
import {
  fetchProvincialExemptionOptions,
  type SearchOption,
} from '@/service/search-options-service'
import IsoDateRangePicker from '@/components/IsoDateRangePicker'
import {
  approveExemptions,
  type ExemptionApprovalResult,
} from '@/service/provincial-exemption-detail-service'
import { fetchCurrentExemptionRecordVersion } from '@/service/record-version-service'
import { sanitizeNotificationText } from '@/utils/notification-messages'
import { isClientErrorResponse } from '@/utils/http-error'
import { firstStringField, isRecord } from '@/utils/record'
import { resolveDefaultZoneRegionIds } from '@/service/user-preference-service'
import { displayTableValue } from '@/utils/text'
import { formatIsoDateLabel } from '@/utils/date'
import './ProvincialExemption.scss'
import { formatVolume } from '@/utils/volume'

const APPROVAL_REQUEST_FAILED_MESSAGE = 'The approval request could not be completed.'

const searchOptionLabel = (code: string, options: SearchOption[]): string => {
  const normalized = code.trim().toUpperCase()
  return (
    options.find((option) => option.value.trim().toUpperCase() === normalized)?.label.trim() ||
    code.trim()
  )
}

// Keeps each reported problem on its own line so the results can list them.
const normalizeApprovalMessage = (message: string): string =>
  message
    .replace(/<\/?br\s*\/?\s*>/gi, '\n')
    .replace(/(?:^|\s)\*\s*/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()

const normalizeApprovalFailureMessage = (message: string | null | undefined): string =>
  sanitizeNotificationText(
    normalizeApprovalMessage(message ?? ''),
    APPROVAL_REQUEST_FAILED_MESSAGE,
  ) || APPROVAL_REQUEST_FAILED_MESSAGE

const approvalResponseFailureMessage = (approval: ExemptionApprovalResult): string =>
  normalizeApprovalFailureMessage(
    [approval.errorMessage, ...approval.errors, ...approval.warnings].filter(Boolean).join(' '),
  )

const approvalRequestFailureMessage = (error: unknown): string => {
  const errorRecord = isRecord(error) ? error : null
  const response = errorRecord && isRecord(errorRecord.response) ? errorRecord.response : null
  const responseData = response?.data
  const responseMessage =
    typeof responseData === 'string'
      ? responseData
      : isRecord(responseData)
        ? firstStringField(responseData, ['detail', 'message', 'title'])
        : ''
  const errorMessage = error instanceof Error ? error.message : ''
  return normalizeApprovalFailureMessage(responseMessage || errorMessage)
}

const approvedExemptionMessage = (count: number): string =>
  `Approved ${count} ${count === 1 ? 'exemption' : 'exemptions'}.`

const INITIAL_FILTERS: ProvincialExemptionSearchFilters = {
  applicationNumber: '',
  packageNumber: '',
  exemptionNumber: '',
  region: [],
  approvalFromDate: '',
  approvalToDate: '',
  listFromDate: '',
  listToDate: '',
  exemptionTypeCode: '',
  exemptionStatusCode: '',
  applicantClientNumber: '',
  ownerClientNumber: '',
  agentClientNumber: '',
}

const EMPTY_RESULTS = createEmptyPagedSearchResponse<ProvincialExemptionSearchResponse>()
const EXEMPTION_BATCH_SELECTION = batchSelectionTranslator('exemption', 'exemptions')

const SORT_COLUMNS: {
  id: ProvincialExemptionSearchSortField
  label: string
}[] = [
  { id: 'exemptionNumber', label: 'Exemption' },
  { id: 'type', label: 'Type' },
  { id: 'status', label: 'Status' },
  { id: 'ownerClientNumber', label: 'Owner client' },
  { id: 'applicantClientNumber', label: 'Agent client' },
  { id: 'approvedVolume', label: 'Approval volume (m³)' },
  { id: 'balanceRemaining', label: 'Balance remaining (m³)' },
  { id: 'listingDate', label: 'List date' },
  { id: 'expiryDate', label: 'Expiry date' },
  { id: 'region', label: 'Region' },
]

const DEFAULT_SORT_FIELD: ProvincialExemptionSearchSortField = 'exemptionNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc'
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ProvincialExemptionSearchSortField[]

const isMinisterialExemption = (row: ProvincialExemptionSearchItem): boolean =>
  row.typeCode.trim().toUpperCase() === 'M'

// INTENTIONAL_LEGACY_DIVERGENCE(EXEMPTION_APPROVAL_MINISTERIAL_ONLY)
// Figma: search approval is only for Ministerial exemptions in New status.
const isApprovalSelectable = (row: ProvincialExemptionSearchItem): boolean =>
  row.canApprove && row.statusCode === 'NEW' && isMinisterialExemption(row) && !row.isLocked

const disabledApprovalSelectionDescription = (row: ProvincialExemptionSearchItem): string => {
  if (row.isLocked) {
    return 'This exemption is currently locked and cannot be approved.'
  }
  if (row.statusCode !== 'NEW') {
    return 'Only new exemptions can be approved.'
  }
  if (!isMinisterialExemption(row)) {
    return 'Only Ministerial exemptions can be approved from search.'
  }
  return 'This exemption is not eligible for approval.'
}

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
    ['agentClientNumber', filters.agentClientNumber ?? ''],
    ['sortField', sortField],
    ['sortDirection', sortDirection],
    ['page', page],
    ['pageSize', pageSize],
  ])

const ProvincialExemptionPage = () => {
  const { capabilities, canPerform } = useAuth()
  const [searchParams, setSearchParams] = usePersistedSearchParams('provincial-exemptions')
  const [allRegionOptions, setAllRegionOptions] = useState<IdTextOption[]>([])
  const regionOptions = useAllowedRegionOptions(allRegionOptions, '/exemptionSearch', 'id')
  const { defaultRegion: defaultZone, preferenceLoading } = useDefaultRegionPreference(
    hasProvincialStaffRole(capabilities.roles),
  )
  const [exemptionTypeOptions, setExemptionTypeOptions] = useState<SearchOption[]>([])
  const [exemptionStatusOptions, setExemptionStatusOptions] = useState<SearchOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [searchResult, setSearchResult] = useState<{
    results: ProvincialExemptionSearchResponse
    totalStatus: DeferredSearchTotalStatus
  }>({ results: EMPTY_RESULTS, totalStatus: 'exact' })
  const { results, totalStatus } = searchResult
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<
    Record<string, ProvincialExemptionSearchItem>
  >({})
  // A batch can approve some exemptions and not others, so each outcome has its own notification.
  const [approvalResults, setApprovalResults] = useState<ActionResult[]>([])
  const approvalResultsRef = useRef<HTMLDivElement>(null)
  const approvalRowsRef = useRef<Record<string, ProvincialExemptionSearchItem>>({})
  const [approvalConfirmationOpen, setApprovalConfirmationOpen] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approvalDialogBusy, setApprovalDialogBusy] = useState(false)
  useEffect(() => {
    if (approvalConfirmationOpen || !approvalResults.length) return
    const frame = requestAnimationFrame(() => {
      approvalResultsRef.current?.focus()
      approvalResultsRef.current?.scrollIntoView?.({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [approvalConfirmationOpen, approvalResults])
  const totalCacheRef = useRef<SearchTotalCache>(new Map())
  const canCreateExemption = canPerform('/createExemption')
  const canApproveExemption = canPerform('approveExemption')
  // Provincial Submitter searches are always scoped to the authenticated forest client;
  // client-number criteria are meaningful only for provincial staff searches.
  const canFilterByClient = hasProvincialStaffRole(capabilities.roles)
  const shouldDefaultApprovalFilters =
    capabilities?.roles.includes('EXEMPTION_APPROVER') ||
    capabilities?.roles.includes('LEXIS_EXEMPTION_APPROVER') ||
    false
  // The server searches only Ministerial exemptions for these users, so the filter shows that.
  const exemptionTypeLocked = isPureExemptionApprover(capabilities?.roles)
  const selectedRowsCount = Object.keys(selectedRowsById).length
  const selectedExemptionNumbers = Object.keys(selectedRowsById)
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
      // Figma has no approval-date criteria, so an old link can't apply a hidden one.
      approvalFromDate: '',
      approvalToDate: '',
      listFromDate: searchParams.get('listFromDate') ?? '',
      listToDate: searchParams.get('listToDate') ?? '',
      exemptionTypeCode: exemptionTypeLocked ? 'M' : (searchParams.get('exemptionTypeCode') ?? ''),
      exemptionStatusCode: searchParams.get('exemptionStatusCode') ?? '',
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
  }, [exemptionTypeLocked, searchParams])
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
  }, [])
  const updateFilter = useCallback(
    <K extends keyof ProvincialExemptionSearchFilters>(
      key: K,
      value: ProvincialExemptionSearchFilters[K],
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
    return hasInvalidIsoDateValue(filters.listFromDate, filters.listToDate)
  }, [filters.listFromDate, filters.listToDate])

  const beginSearchRequest = useLatestRequestGuard()
  const commitResults = useCallback(
    (
      nextResults: ProvincialExemptionSearchResponse,
      nextTotalStatus: DeferredSearchTotalStatus,
    ) => {
      setSearchResult({ results: nextResults, totalStatus: nextTotalStatus })
    },
    [],
  )

  const runSearch = useCallback(
    async (
      request: ProvincialExemptionSearchRequest,
      options: { force?: boolean } = {},
    ): Promise<boolean> => {
      const pageCacheGeneration = getPageDataCacheGeneration()
      const pageCacheKey = buildPageDataCacheKey(
        'provincial-exemption-search',
        capabilities?.principal,
        request,
      )
      const isLatestRequest = beginSearchRequest()
      if (!options.force) {
        const cachedResults = getPageDataCache<ProvincialExemptionSearchResponse>(pageCacheKey)
        if (cachedResults) {
          setCachedSearchTotal(
            totalCacheRef.current,
            buildSearchTotalCacheKey(request.filters),
            cachedResults.page.totalElements,
          )
          prefetchNextSearchPage({
            pageId: 'provincial-exemption-search',
            principal: capabilities?.principal,
            request,
            response: cachedResults,
            search: searchProvincialExemptions,
            onError: console.error,
          })
          commitResults(cachedResults, 'exact')
          setLoading(false)
          setErrorMessage('')
          return true
        }
      }

      if (hasInvalidIsoDateValue(request.filters.listFromDate, request.filters.listToDate)) {
        setLoading(false)
        return false
      }

      setLoading(true)
      setErrorMessage('')
      try {
        const totalCacheKey = buildSearchTotalCacheKey(request.filters)
        const cachedTotal = options.force
          ? undefined
          : getCachedSearchTotal(totalCacheRef.current, totalCacheKey)
        const commitSearchResponse = (
          response: ProvincialExemptionSearchResponse,
          totalIsExact: boolean,
        ) => {
          if (totalIsExact && setPageDataCache(pageCacheKey, response, pageCacheGeneration)) {
            setCachedSearchTotal(totalCacheRef.current, totalCacheKey, response.page.totalElements)
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
              commitResults(response, totalIsExact ? 'exact' : 'pending')
            }
          })
        }
        const { response, totalIsExact, deferredResponse } = await loadSearchWithDeferredTotal({
          request,
          cachedTotal,
          search: searchProvincialExemptions,
          count: countProvincialExemptions,
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
        return true
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve exemption search results.')
          commitResults(EMPTY_RESULTS, 'exact')
        }
        return false
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
    if (!hasSearchQuery && shouldDefaultApprovalFilters) {
      setFilters((currentFilters) =>
        currentFilters.exemptionStatusCode === 'NEW' && currentFilters.exemptionTypeCode === 'M'
          ? currentFilters
          : {
              ...currentFilters,
              exemptionStatusCode: 'NEW',
              exemptionTypeCode: 'M',
            },
      )
    }
  }, [hasSearchQuery, setFilters, shouldDefaultApprovalFilters])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const options = await fetchProvincialExemptionOptions(true)

        setExemptionTypeOptions(options.exemptionTypes)
        setExemptionStatusOptions(options.exemptionStatuses)
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
      exemptionTypeCode: shouldDefaultApprovalFilters ? 'M' : INITIAL_FILTERS.exemptionTypeCode,
      exemptionStatusCode: shouldDefaultApprovalFilters
        ? 'NEW'
        : INITIAL_FILTERS.exemptionStatusCode,
      region: defaultZoneRegionIds,
    }
    setFilters(defaultFilters)
    // INTENTIONAL_LEGACY_DIVERGENCE(CLEAR_ALL_RESETS_SEARCH)
    setSearchParams(new URLSearchParams())
  }

  const onHeaderClick = (column: ProvincialExemptionSearchSortField) => {
    const nextDirection = getNextSortDirection(sortField, sortDirection, column)
    clearSelection()
    setSearchParams(
      buildSearchParams(appliedFilters, column, nextDirection, DEFAULT_SEARCH_PAGE, pageSize),
    )
  }

  const selectableRows = useMemo(() => {
    if (!canApproveExemption) {
      return []
    }
    return results.content.filter(isApprovalSelectable)
  }, [canApproveExemption, results.content])

  const allSelectableRowsAreSelected = useMemo(() => {
    if (selectableRows.length === 0) return false
    return selectableRows.every((item) => Boolean(selectedRowsById[item.exemptionNumber]))
  }, [selectableRows, selectedRowsById])

  const toggleRowSelection = (row: ProvincialExemptionSearchItem, checked: boolean) => {
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
      setApprovalResults([
        {
          kind: 'error',
          title: 'Approval failed',
          message: 'Your account is not authorized to approve exemptions.',
        },
      ])
      return
    }

    const selectedRows = Object.values(selectedRowsById)
    if (selectedRows.length === 0) {
      setApprovalResults([
        {
          kind: 'error',
          title: 'Approval failed',
          message: 'Select at least one new exemption before approving.',
        },
      ])
      return
    }

    // Figma: earlier results stay until a new approval replaces them, even if this one is cancelled.
    approvalRowsRef.current = { ...selectedRowsById }
    setApprovalConfirmationOpen(true)
  }

  const closeApprovalConfirmation = () => setApprovalConfirmationOpen(false)

  const exemptionResultLink = (exemptionNumber: string) =>
    approvalRowsRef.current[exemptionNumber]?.canViewExemption
      ? {
          to: withCurrentSearch(`/provincial/exemption/${exemptionNumber}`),
          state: {
            returnTo: {
              label: 'Exemption search',
              to: withCurrentSearch('/provincial/exemption'),
            },
          },
        }
      : {}

  const onConfirmApproval = async (): Promise<ExemptionApprovalOutcome> => {
    const selectedRows = { ...selectedRowsById }
    const selectedNumbers = Object.keys(selectedRows)
    if (approving) {
      return { approvedNumbers: [], message: 'Approval is already in progress.', warning: true }
    }
    if (selectedNumbers.length === 0) {
      setApprovalResults([
        {
          kind: 'error',
          title: 'Approval failed',
          message: 'Select at least one exemption to approve.',
        },
      ])
      return {
        approvedNumbers: [],
        message: 'Select at least one exemption to approve.',
        warning: true,
      }
    }

    setApproving(true)
    setApprovalResults([])
    try {
      const approvals: ExemptionApprovalResult[] = []
      const failures: ExemptionApprovalFailure[] = []
      const unconfirmedNumbers: string[] = []
      const approvedNumbers: string[] = []
      for (const exemptionNumber of selectedNumbers) {
        let approvalRequested = false
        try {
          const recordVersion = await fetchCurrentExemptionRecordVersion(exemptionNumber)
          approvalRequested = true
          const approval = await approveExemptions([exemptionNumber], recordVersion)
          if (approval.success && approval.valid) {
            approvals.push(approval)
            approvedNumbers.push(exemptionNumber)
          } else {
            failures.push({
              exemptionNumber,
              message: approvalResponseFailureMessage(approval),
            })
          }
        } catch (error) {
          console.warn(`Unable to approve exemption ${exemptionNumber}.`, error)
          // After a 5xx or lost response the approval may still have been saved.
          if (approvalRequested && !isClientErrorResponse(error)) {
            unconfirmedNumbers.push(exemptionNumber)
          } else {
            failures.push({
              exemptionNumber,
              message: approvalRequestFailureMessage(error),
            })
          }
        }
      }

      setSelectedRowsById({})

      if (approvals.length === 0) {
        return {
          approvedNumbers: [],
          message: 'No selected exemptions were approved.',
          warning: true,
          unconfirmed: unconfirmedNumbers.length > 0,
          failures,
          unconfirmedNumbers,
        }
      }

      const notes = [
        ...new Set(
          approvals
            .map((approval) => normalizeApprovalMessage(approval.errorMessage))
            .filter(Boolean),
        ),
      ]
      let refreshed = false
      try {
        refreshed = await runSearch(
          {
            filters: urlState.filters,
            page: urlState.page - 1,
            pageSize: urlState.pageSize,
            sortField: urlState.sortField,
            sortDirection: urlState.sortDirection,
          },
          { force: true },
        )
      } catch (refreshError) {
        console.error(refreshError)
      }
      if (!refreshed) notes.push('Refresh the page to see the latest status.')
      return {
        approvedNumbers,
        message: approvedExemptionMessage(approvals.length),
        warning: notes.length > 0,
        failures,
        unconfirmedNumbers,
        notes,
      }
    } catch (error) {
      console.error(error)
      setApprovalResults([
        {
          kind: 'error',
          title: 'Approval failed',
          message: 'Unable to approve the selected exemptions.',
        },
      ])
      return {
        approvedNumbers: [],
        message: 'Unable to approve the selected exemptions.',
        warning: true,
      }
    } finally {
      setApproving(false)
    }
  }

  return (
    <Grid fullWidth className="default-grid fullbleed-table-page provincial-exemption-search-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Exemption search"
          subtitle="Find, review, and manage provincial exemptions."
          actions={
            canCreateExemption ? (
              <Button
                as={Link}
                to="/provincial/exemption/create"
                kind="primary"
                size="md"
                renderIcon={Add}
              >
                Add exemption
              </Button>
            ) : undefined
          }
          actionsLabel="Exemption actions"
        />
      </Column>

      {optionsUnavailable && <AuthoritativeOptionsUnavailableNotification />}

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters provincial-exemption-search-filters">
          <Tile>
            <form
              className="legacy-search-form"
              onSubmit={(event) => {
                event.preventDefault()
                onSearch()
              }}
            >
              <div className="legacy-search-grid provincial-exemption-search-grid">
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
                  fromId="listFromDate"
                  toId="listToDate"
                  fromLabel="List date from"
                  toLabel="List date to"
                  fromValue={filters.listFromDate}
                  toValue={filters.listToDate}
                  onChange={([listFromDate, listToDate]) => {
                    clearSelection()
                    setFilters((current) => ({ ...current, listFromDate, listToDate }))
                  }}
                />
                <SearchableSelect
                  id="exemptionTypeCode"
                  labelText="Exemption type"
                  value={filters.exemptionTypeCode}
                  placeholder="All types"
                  options={exemptionTypeOptions}
                  disabled={optionsLoading || optionsUnavailable}
                  readOnly={exemptionTypeLocked}
                  onChange={(value) => updateFilter('exemptionTypeCode', value)}
                />
                <SearchableSelect
                  id="exemptionStatusCode"
                  labelText="Exemption status"
                  value={filters.exemptionStatusCode}
                  placeholder="All statuses"
                  options={exemptionStatusOptions}
                  disabled={optionsLoading || optionsUnavailable}
                  onChange={(value) => updateFilter('exemptionStatusCode', value)}
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
                    Matches the agent, or the owner when no agent is recorded. Select Search to
                    apply changes.
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
              <div
                ref={approvalResultsRef}
                tabIndex={-1}
                className="exemption-search-results-notifications"
              >
                {!approvalConfirmationOpen &&
                  approvalResults.map((result) => (
                    <ActionResultNotification
                      key={result.kind}
                      className="legacy-inline-notification"
                      result={result}
                      onClose={() =>
                        setApprovalResults((current) => current.filter((item) => item !== result))
                      }
                    />
                  ))}
              </div>
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
            loadingDescription="Loading exemption search results…"
            columnCount={SORT_COLUMNS.length + (canApproveExemption ? 1 : 0)}
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
              canApproveExemption && selectedRowsCount > 0 ? (
                <TableBatchActions
                  totalSelected={selectedRowsCount}
                  shouldShowBatchActions
                  onCancel={clearSelection}
                  translateWithId={EXEMPTION_BATCH_SELECTION}
                >
                  <TableBatchAction
                    renderIcon={Checkmark}
                    onClick={onApproveSelectedClick}
                    disabled={approving}
                  >
                    {approving ? 'Approving…' : 'Approve'}
                  </TableBatchAction>
                </TableBatchActions>
              ) : undefined
            }
          >
            {errorMessage ? (
              <EmptyState
                role="alert"
                title="Exemption search unavailable"
                description={errorMessage}
              />
            ) : results.content.length > 0 ? (
              <Table
                size="md"
                useZebraStyles
                className={canApproveExemption ? 'exemption-search-table--selectable' : undefined}
              >
                <TableHead>
                  <TableRow>
                    {canApproveExemption && (
                      <TableHeader>
                        <DisabledButtonTooltip
                          disabled={selectableRows.length === 0}
                          description="No eligible exemptions are available on this page."
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
                    {SORT_COLUMNS.map((column) => (
                      <TableHeader
                        key={column.id}
                        isSortable
                        isSortHeader={sortField === column.id}
                        sortDirection={
                          sortField === column.id ? toCarbonSortDirection(sortDirection) : 'NONE'
                        }
                        onClick={() => onHeaderClick(column.id)}
                      >
                        {column.label}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.content.map((row) => {
                    const canSelectRow = canApproveExemption && isApprovalSelectable(row)
                    const canViewExemption = row.canViewExemption
                    return (
                      <TableRow key={row.exemptionNumber}>
                        {canApproveExemption && (
                          <TableCell>
                            <div className="provincial-exemption-search-row-action">
                              <DisabledButtonTooltip
                                disabled={!canSelectRow}
                                description={disabledApprovalSelectionDescription(row)}
                              >
                                {canSelectRow ? (
                                  <Checkbox
                                    id={`selectRow-${row.exemptionNumber}`}
                                    hideLabel
                                    labelText={`Select exemption ${row.exemptionNumber}`}
                                    checked={Boolean(selectedRowsById[row.exemptionNumber])}
                                    disabled={!canSelectRow}
                                    onChange={(_, payload) =>
                                      toggleRowSelection(row, Boolean(payload.checked))
                                    }
                                  />
                                ) : (
                                  <span className="sr-only">
                                    {disabledApprovalSelectionDescription(row)}
                                  </span>
                                )}
                              </DisabledButtonTooltip>
                              {row.isLocked && <Tag type="gray">Locked</Tag>}
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          {canViewExemption ? (
                            <Link
                              className="cds--link"
                              to={withCurrentSearch(`/provincial/exemption/${row.exemptionNumber}`)}
                              state={{
                                returnTo: {
                                  label: 'Exemption search',
                                  to: withCurrentSearch('/provincial/exemption'),
                                },
                              }}
                            >
                              {row.exemptionNumber}
                            </Link>
                          ) : (
                            row.exemptionNumber
                          )}
                        </TableCell>
                        <TableCell>
                          {displayTableValue(
                            searchOptionLabel(row.typeCode || row.type, exemptionTypeOptions),
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusTag
                            status={searchOptionLabel(
                              row.statusCode || row.status,
                              exemptionStatusOptions,
                            )}
                            variant={getStatusTagVariant(row.statusCode || row.status)}
                          />
                        </TableCell>
                        <TableCell>{displayTableValue(row.ownerClientNumber)}</TableCell>
                        <TableCell>{displayTableValue(row.applicantClientNumber)}</TableCell>
                        <TableCell>{formatVolume(row.approvedVolume)}</TableCell>
                        <TableCell>{row.balanceRemaining.toFixed(1)}</TableCell>
                        <TableCell className="legacy-search-table-date">
                          {displayTableValue(formatIsoDateLabel(row.listingDate))}
                        </TableCell>
                        <TableCell className="legacy-search-table-date">
                          {displayTableValue(formatIsoDateLabel(row.expiryDate))}
                        </TableCell>
                        <TableCell>{displayTableValue(row.region)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : !loading ? (
              <EmptyState
                title="No exemptions found"
                description="No exemptions found for the selected criteria."
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

      {approvalConfirmationOpen && (
        <ExemptionApprovalModal
          exemptionNumbers={selectedExemptionNumbers}
          onApprove={onConfirmApproval}
          onComplete={(report) =>
            setApprovalResults(exemptionApprovalResults(report, exemptionResultLink))
          }
          onClose={closeApprovalConfirmation}
          onBusyChange={setApprovalDialogBusy}
        />
      )}
      <UnsavedChangesGuard
        isDirty={false}
        isBusy={approving || approvalDialogBusy}
        onSave={async () => false}
        onDiscard={() => {}}
        subject="these exemptions"
      />
    </Grid>
  )
}

export default ProvincialExemptionPage
