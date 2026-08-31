import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { Add } from '@carbon/icons-react'
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import { AppNotification } from '../../components/AppNotification'
import ConfirmationModal from '@/components/ConfirmationModal'
import EmptyState from '@/components/EmptyState'
import DisabledButtonTooltip from '@/components/DisabledButtonTooltip'
import ExemptionApprovalEmailModal, {
  type ExemptionApprovalRecipient,
} from '@/components/ExemptionApprovalEmailModal'
import PageHeader from '@/components/PageHeader'
import SearchSubmitButton from '@/components/SearchSubmitButton'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import SearchableSelect from '../../components/SearchableSelect'
import RegionMultiSelect from '@/components/RegionMultiSelect'
import StatusTag from '@/components/StatusTag'
import type {
  ProvincialExemptionSearchFilters,
  ProvincialExemptionSearchItem,
  ProvincialExemptionSearchRequest,
  ProvincialExemptionSearchResponse,
  ProvincialExemptionSearchSortField,
} from '@/interfaces/ProvincialExemptionSearch'
import { useAuth } from '@/context/auth/useAuth'
import { hasProvincialStaffRole } from '@/context/auth/role-utils'
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
import IsoDatePicker from '../../components/IsoDatePicker'
import {
  approveExemptions,
  sendExemptionApprovalEmails,
  type ExemptionApprovalResult,
} from '@/service/provincial-exemption-detail-service'
import { fetchCurrentExemptionRecordVersion } from '@/service/record-version-service'
import { formatLocalIsoDate } from '@/utils/date'
import { sanitizeNotificationText } from '@/utils/notification-messages'
import { firstStringField, isRecord } from '@/utils/record'
import { resolveDefaultZoneRegionIds } from '@/service/user-preference-service'
import { displayTableValue } from '@/utils/text'

type ApprovalStatus = {
  kind: 'error' | 'success' | 'warning'
  message: string
}

type ApprovalEmailContext = {
  approvedCount: number
  partialFailure: string
}

type ExemptionApprovalFailure = {
  exemptionNumber: string
  message: string
}

const APPROVAL_REQUEST_FAILED_MESSAGE = 'The approval request could not be completed.'

const normalizeApprovalMessage = (message: string): string =>
  message
    .replace(/<\/?br\s*\/?\s*>/gi, ' ')
    .replace(/(?:^|\s)\*\s*/g, ' ')
    .replace(/\s+/g, ' ')
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
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc'
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ProvincialExemptionSearchSortField[]

const disabledApprovalSelectionDescription = (row: ProvincialExemptionSearchItem): string => {
  if (row.isLocked) {
    return 'This exemption is currently locked and cannot be approved.'
  }
  if (row.statusCode !== 'NEW') {
    return 'Only new exemptions can be approved.'
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
    ['approvalFromDate', filters.approvalFromDate],
    ['approvalToDate', filters.approvalToDate],
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
  const [searchParams, setSearchParams] = usePersistedSearchParams('provincial-exemptions')
  const [regionOptions, setRegionOptions] = useState<IdTextOption[]>([])
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
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null)
  const [approvalConfirmationOpen, setApprovalConfirmationOpen] = useState(false)
  const [approvalCertified, setApprovalCertified] = useState(false)
  const [approvalDate, setApprovalDate] = useState('')
  const [approving, setApproving] = useState(false)
  const [approvalEmailRecipients, setApprovalEmailRecipients] = useState<
    ExemptionApprovalRecipient[]
  >([])
  const [approvalEmailContext, setApprovalEmailContext] = useState<ApprovalEmailContext | null>(
    null,
  )
  const [sendingApprovalEmail, setSendingApprovalEmail] = useState(false)
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
      approvalFromDate: searchParams.get('approvalFromDate') ?? '',
      approvalToDate: searchParams.get('approvalToDate') ?? '',
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
  const appliedFilters = urlState.filters
  const [filters, setFilters] = useSearchFilterDraft(appliedFilters)
  const sortField = urlState.sortField
  const sortDirection = urlState.sortDirection
  const pageSize = urlState.pageSize
  const requestFilters = appliedFilters
  const hasSearchQuery = searchParams.toString().length > 0
  const clearSelection = useCallback(() => {
    setSelectedRowsById({})
    setApprovalStatus(null)
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
    return hasInvalidIsoDateValue(
      filters.approvalFromDate,
      filters.approvalToDate,
      filters.listFromDate,
      filters.listToDate,
    )
  }, [filters.approvalFromDate, filters.approvalToDate, filters.listFromDate, filters.listToDate])

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
    async (request: ProvincialExemptionSearchRequest, options: { force?: boolean } = {}) => {
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
          return
        }
      }

      if (
        hasInvalidIsoDateValue(
          request.filters.approvalFromDate,
          request.filters.approvalToDate,
          request.filters.listFromDate,
          request.filters.listToDate,
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
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve exemption search results.')
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
        const options = await fetchProvincialExemptionOptions()

        setExemptionTypeOptions(options.exemptionTypes)
        setExemptionStatusOptions(options.exemptionStatuses)
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
    const defaultFilters = {
      ...INITIAL_FILTERS,
      exemptionTypeCode: shouldDefaultApprovalFilters ? 'M' : INITIAL_FILTERS.exemptionTypeCode,
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

    setApprovalCertified(false)
    setApprovalDate(formatLocalIsoDate(new Date()))
    setApprovalConfirmationOpen(true)
  }

  const closeApprovalConfirmation = () => {
    if (approving) return
    setApprovalConfirmationOpen(false)
    setApprovalCertified(false)
    setApprovalDate('')
  }

  const closeApprovalEmail = () => {
    if (sendingApprovalEmail) return
    const approvedCount = approvalEmailContext?.approvedCount ?? approvalEmailRecipients.length
    const messages = [
      approvedExemptionMessage(approvedCount),
      approvedCount === 1
        ? 'Approval notification was skipped.'
        : 'Approval notifications were skipped.',
    ]
    if (approvalEmailContext?.partialFailure) {
      messages.push(approvalEmailContext.partialFailure)
    }
    setApprovalStatus({ kind: 'warning', message: messages.join(' ') })
    setApprovalEmailRecipients([])
    setApprovalEmailContext(null)
  }

  const onSendApprovalEmails = async (recipients: ExemptionApprovalRecipient[]) => {
    if (sendingApprovalEmail) return
    const approvedCount = approvalEmailContext?.approvedCount ?? recipients.length
    const partialFailure = approvalEmailContext?.partialFailure ?? ''
    setSendingApprovalEmail(true)
    try {
      const email = await sendExemptionApprovalEmails(recipients)
      const messages = [approvedExemptionMessage(approvedCount)]
      messages.push(
        email.success
          ? email.message || 'Approval emails sent.'
          : email.message || 'Approval emails could not be sent.',
      )
      if (partialFailure) {
        messages.push(partialFailure)
      }
      setApprovalStatus({
        kind: email.success && !partialFailure ? 'success' : 'warning',
        message: messages.join(' '),
      })
    } catch (error) {
      console.error(error)
      const messages = [
        approvedExemptionMessage(approvedCount),
        'Approval emails could not be sent.',
      ]
      if (partialFailure) {
        messages.push(partialFailure)
      }
      setApprovalStatus({ kind: 'warning', message: messages.join(' ') })
    } finally {
      setSendingApprovalEmail(false)
      setApprovalEmailRecipients([])
      setApprovalEmailContext(null)
    }
  }

  const onConfirmApproval = async (): Promise<boolean> => {
    const selectedRows = { ...selectedRowsById }
    const selectedNumbers = Object.keys(selectedRows)
    if (approving || !approvalCertified) {
      return false
    }
    if (selectedNumbers.length === 0) {
      setApprovalStatus({ kind: 'error', message: 'Select at least one exemption to approve.' })
      return false
    }

    setApproving(true)
    setApprovalStatus(null)
    try {
      const approvals: ExemptionApprovalResult[] = []
      const failures: ExemptionApprovalFailure[] = []
      for (const exemptionNumber of selectedNumbers) {
        try {
          const recordVersion = await fetchCurrentExemptionRecordVersion(exemptionNumber)
          const approval = await approveExemptions([exemptionNumber], recordVersion)
          if (approval.success && approval.valid) {
            approvals.push(approval)
          } else {
            failures.push({
              exemptionNumber,
              message: approvalResponseFailureMessage(approval),
            })
          }
        } catch (error) {
          console.warn(`Unable to approve exemption ${exemptionNumber}.`, error)
          failures.push({
            exemptionNumber,
            message: approvalRequestFailureMessage(error),
          })
        }
      }

      const failureCount = failures.length
      const failureDetails = failures
        .map(({ exemptionNumber, message }) => `${exemptionNumber} — ${message}`)
        .join('; ')
      const failedRowsById = Object.fromEntries(
        failures.flatMap(({ exemptionNumber }) => {
          const row = selectedRows[exemptionNumber]
          return row ? ([[exemptionNumber, row]] as const) : []
        }),
      )
      setSelectedRowsById(failedRowsById)

      if (approvals.length === 0) {
        setApprovalStatus({
          kind: 'error',
          message: `No selected exemptions were approved; ${failureCount} failed. Failed exemptions: ${failureDetails}`,
        })
        return false
      }

      const partialMessages = approvals
        .map((approval) => normalizeApprovalMessage(approval.errorMessage))
        .filter(Boolean)
      if (failureCount > 0) {
        partialMessages.push(
          `${failureCount} selected ${failureCount === 1 ? 'exemption' : 'exemptions'} failed to approve. Failed exemptions: ${failureDetails}`,
        )
      }
      const partialFailure = [...new Set(partialMessages)].join(' ')
      const recipients = approvals.flatMap((approval) =>
        approval.sendGrid.map(([number, email]): ExemptionApprovalRecipient => [number, email]),
      )
      const approvedCount = approvals.length
      const messages = [approvedExemptionMessage(approvedCount)]
      messages.push(
        recipients.length > 0
          ? 'Review the applicant recipients before sending notifications.'
          : 'No applicant notification recipients were returned.',
      )
      if (partialFailure) {
        messages.push(partialFailure)
      }

      setApprovalStatus({
        kind: recipients.length > 0 && !partialFailure ? 'success' : 'warning',
        message: messages.join(' '),
      })
      setApprovalEmailContext(recipients.length > 0 ? { approvedCount, partialFailure } : null)
      setApprovalEmailRecipients(recipients)
      try {
        await runSearch(
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
        setApprovalStatus((current) => ({
          kind: 'warning',
          message: `${current?.message || approvedExemptionMessage(approvedCount)} Refresh the page to see the latest status.`,
        }))
      }
      return true
    } catch (error) {
      console.error(error)
      setApprovalStatus({
        kind: 'error',
        message: 'Unable to approve the selected exemptions.',
      })
      return false
    } finally {
      setApproving(false)
    }
  }

  return (
    <Grid fullWidth className="default-grid fullbleed-table-page provincial-exemption-search-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Provincial exemption search"
          subtitle="Find, review, and manage provincial exemptions."
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
                <SearchableSelect
                  id="exemptionStatusCode"
                  labelText="Exemption status"
                  value={filters.exemptionStatusCode}
                  placeholder="All statuses"
                  options={exemptionStatusOptions}
                  disabled={optionsLoading || optionsUnavailable}
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
                  disabled={optionsLoading || optionsUnavailable}
                  onChange={(value) => updateFilter('exemptionTypeCode', value)}
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
                {canFilterByClient && (
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
                    Modern exemption search exposes approval-date criteria hidden in legacy. */}
                <IsoDatePicker
                  id="approvalFromDate"
                  labelText="Approval from date"
                  value={filters.approvalFromDate}
                  invalid={!isValidIsoDate(filters.approvalFromDate)}
                  invalidText="Date must be YYYY-MM-DD"
                  onChange={(value) => updateFilter('approvalFromDate', value)}
                />
                <IsoDatePicker
                  id="approvalToDate"
                  labelText="Approval to date"
                  value={filters.approvalToDate}
                  invalid={!isValidIsoDate(filters.approvalToDate)}
                  invalidText="Date must be YYYY-MM-DD"
                  onChange={(value) => updateFilter('approvalToDate', value)}
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
              {approvalStatus && (
                <AppNotification
                  className="legacy-inline-notification"
                  kind={approvalStatus.kind}
                  title={
                    approvalStatus.kind === 'error'
                      ? 'Approval failed'
                      : approvalStatus.kind === 'warning'
                        ? 'Approval completed with warnings'
                        : 'Approval completed'
                  }
                  subtitle={approvalStatus.message}
                  autoDismissMs={approvalStatus.kind === 'success' ? 6000 : undefined}
                  onCloseButtonClick={() => setApprovalStatus(null)}
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
              canApproveExemption || canCreateExemption ? (
                <>
                  {canApproveExemption && (
                    <DisabledButtonTooltip
                      disabled={selectedRowsCount === 0 || approving}
                      description={
                        approving
                          ? 'Wait for the approval request to finish.'
                          : 'Select at least one exemption to approve.'
                      }
                    >
                      <Button
                        type="button"
                        kind="tertiary"
                        size="md"
                        onClick={onApproveSelectedClick}
                        disabled={selectedRowsCount === 0 || approving}
                      >
                        {approving ? 'Approving…' : 'Approve selected exemptions'}
                      </Button>
                    </DisabledButtonTooltip>
                  )}
                  {canCreateExemption && (
                    <Button
                      as={Link}
                      to="/provincial/exemption/create"
                      kind="primary"
                      size="md"
                      renderIcon={Add}
                    >
                      Add exemption
                    </Button>
                  )}
                </>
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
              <Table size="md" useZebraStyles>
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
                    const canSelectRow =
                      canApproveExemption &&
                      row.canApprove &&
                      row.statusCode === 'NEW' &&
                      !row.isLocked
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
                                  label: 'Provincial exemption search',
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
                        <TableCell>{displayTableValue(row.type)}</TableCell>
                        <TableCell>
                          <StatusTag status={row.status} />
                        </TableCell>
                        <TableCell>{displayTableValue(row.applicantClientNumber)}</TableCell>
                        <TableCell>{displayTableValue(row.ownerClientNumber)}</TableCell>
                        <TableCell>{displayTableValue(row.approvedVolume)}</TableCell>
                        <TableCell>{displayTableValue(row.balanceRemaining)}</TableCell>
                        <TableCell className="legacy-search-table-date">
                          {displayTableValue(row.listingDate)}
                        </TableCell>
                        <TableCell className="legacy-search-table-date">
                          {displayTableValue(row.expiryDate)}
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
              <Pagination
                page={results.page.number + 1}
                pageSize={results.page.size}
                pageSizes={[...SEARCH_PAGE_SIZE_OPTIONS]}
                totalItems={results.page.totalElements}
                pagesUnknown={totalStatus !== 'exact'}
                isLastPage={totalStatus !== 'exact' && results.content.length < results.page.size}
                onChange={({ page, pageSize: nextPageSize }) => {
                  setSearchParams(
                    buildSearchParams(appliedFilters, sortField, sortDirection, page, nextPageSize),
                  )
                }}
              />
            )}
          </SearchResultsTableFrame>
        </section>
      </Column>

      {approvalConfirmationOpen && (
        <ConfirmationModal
          open
          title="Approve selected exemptions"
          description={`You are about to approve the following ${
            selectedRowsCount === 1 ? 'exemption' : 'exemptions'
          }:`}
          confirmLabel="Approve exemptions"
          pendingLabel="Approving…"
          confirmDisabled={approving || !approvalCertified}
          onClose={closeApprovalConfirmation}
          onError={() => undefined}
          onConfirm={async () => {
            const approved = await onConfirmApproval()
            if (!approved) {
              throw new Error('Exemption approval failed.')
            }
          }}
        >
          <ul>
            {selectedExemptionNumbers.map((number) => (
              <li key={number}>{number}</li>
            ))}
          </ul>
          <p>
            By checking the box below you certify that{' '}
            {selectedRowsCount === 1 ? 'this exemption has' : 'these exemptions have'} been
            approved.
            {selectedRowsCount === 1 ? ' This exemption' : ' These exemptions'} will be marked with
            an approval date of {approvalDate}.
          </p>
          <Checkbox
            id="approveSelectedExemptionsCertification"
            labelText={`I certify that ${
              selectedRowsCount === 1 ? 'this exemption has' : 'these exemptions have'
            } been approved.`}
            checked={approvalCertified}
            disabled={approving}
            onChange={(_, { checked }) => setApprovalCertified(Boolean(checked))}
          />
        </ConfirmationModal>
      )}
      {approvalEmailRecipients.length > 0 && (
        <ExemptionApprovalEmailModal
          recipients={approvalEmailRecipients}
          sending={sendingApprovalEmail}
          onRecipientsChange={setApprovalEmailRecipients}
          onSend={(recipients) => void onSendApprovalEmails(recipients)}
          onSkip={closeApprovalEmail}
        />
      )}
    </Grid>
  )
}

export default ProvincialExemptionPage
