import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
  TextArea,
  TextInput,
} from '@carbon/react'
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import { AppNotification } from '../../components/AppNotification'
import ConfirmationModal from '@/components/ConfirmationModal'
import Modal from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import DisabledButtonTooltip from '@/components/DisabledButtonTooltip'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import SearchSubmitButton from '@/components/SearchSubmitButton'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import SearchableSelect from '../../components/SearchableSelect'
import RegionMultiSelect from '@/components/RegionMultiSelect'
import StatusTag from '@/components/StatusTag'
import IsoDatePicker from '../../components/IsoDatePicker'
import type {
  ApplicationReviewSearchFilters,
  ApplicationReviewSearchRequest,
  ApplicationReviewSearchResponse,
  ApplicationReviewSearchSortField,
} from '@/interfaces/ApplicationReviewSearch'
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
import { isAgentApplicant } from '@/pages/shared/application-form-utils'
import {
  formatDeferredSearchTotalLabel,
  loadSearchWithDeferredTotal,
  prefetchNextSearchPage,
  type DeferredSearchTotalStatus,
} from '@/pages/shared/deferred-search-total'
import {
  approveApplicationReview,
  countApplicationReviews,
  sendApplicationReviewStatusEmail,
  searchApplicationReviews,
  updateApplicationReviewStatus,
} from '@/service/application-review-search-service'
import {
  fetchApplicationClientData,
  type ApplicationClientData,
} from '@/service/application-client-lookup-service'
import {
  fetchApplicationSummarySnapshot,
  type ApplicationSummarySnapshot,
} from '@/service/provincial-application-items-service'
import { fetchApplicationReviewOptions, type SearchOption } from '@/service/search-options-service'
import { fetchCurrentApplicationRecordVersion } from '@/service/record-version-service'
import { resolveDefaultZoneRegionIds } from '@/service/user-preference-service'
import {
  displayTableValue,
  isValidEmail,
  normalizeTrimmedText as normalizeEmail,
  normalizeUpperText as normalizeReviewStatus,
} from '@/utils/text'
import { firstStringField, isRecord } from '@/utils/record'
import { sanitizeNotificationText } from '@/utils/notification-messages'

type ReviewActionStatus = {
  kind: 'success' | 'warning' | 'error'
  message: string
}

type ApplicationApprovalResult = {
  applicationNumber: string
  success: boolean
  message: string
}

const INITIAL_FILTERS: ApplicationReviewSearchFilters = {
  applicationNumber: '',
  productTypeCode: '',
  region: [],
  receivedFromDate: '',
  receivedToDate: '',
  listingFromDate: '',
  listingToDate: '',
}

const APPLICATION_REVIEW_DEFAULT_PAGE_SIZE = 100
const APPLICATION_REVIEW_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const

const EMPTY_RESULTS = createEmptyPagedSearchResponse<ApplicationReviewSearchResponse>(
  APPLICATION_REVIEW_DEFAULT_PAGE_SIZE,
)

const RESULT_COLUMNS: {
  id: string
  label: string
  sortField?: ApplicationReviewSearchSortField
}[] = [
  { id: 'applicationNumber', label: 'Application', sortField: 'applicationNumber' },
  { id: 'status', label: 'Status' },
  { id: 'volume', label: 'Application volume (m³)' },
  { id: 'speciesEndUse', label: 'Species end use sort' },
  { id: 'listingDate', label: 'Listing date', sortField: 'listingDate' },
  { id: 'region', label: 'Region', sortField: 'regionCode' },
]

const DEFAULT_SORT_FIELD: ApplicationReviewSearchSortField = 'applicationNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc'
const SORT_FIELD_OPTIONS = RESULT_COLUMNS.flatMap((column) =>
  column.sortField ? [column.sortField] : [],
)
const REJECT_STATUS_CODE = 'REJ'
const REVIEWABLE_SOURCE_STATUS_CODES = new Set(['NEW', 'PND'])
const EMAIL_STATUS_CODES = new Set(['REJ', 'WDN'])
const REJECT_STATUS_REQUIRED_MESSAGE = 'Choose an application status before updating.'
const REJECT_REMARK_REQUIRED_MESSAGE = 'Remarks are required.'
const REJECT_EMAIL_REQUIRED_MESSAGE =
  'Enter one valid client email address or deselect Send status email.'
const EMAIL_NOT_CONFIGURED_MESSAGE =
  'Application status email is not configured yet. No email was sent.'
const APPROVAL_REQUEST_FAILED_MESSAGE = 'The approval request could not be completed.'

const normalizeApprovalFailureMessage = (message: string | null | undefined): string =>
  sanitizeNotificationText(
    (message ?? '')
      .replace(/<\/?br\s*\/?\s*>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    APPROVAL_REQUEST_FAILED_MESSAGE,
  ) || APPROVAL_REQUEST_FAILED_MESSAGE

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

const formatApplicationVolume = (volume: number): string => volume.toFixed(1)

const isReviewableSourceStatus = (status: string | null | undefined): boolean =>
  REVIEWABLE_SOURCE_STATUS_CODES.has(normalizeReviewStatus(status ?? ''))

const disabledReviewSelectionDescription = (canApproveApplications: boolean): string =>
  !canApproveApplications
    ? 'You do not have permission to approve applications.'
    : 'Only New and Pending applications can be approved.'

const normalizeReviewEmail = (value: string | null | undefined): string => {
  const normalized = normalizeEmail(value ?? '')
  const lowered = normalized.toLowerCase()
  return lowered === 'none' || lowered === 'not on file' ? '' : normalized
}

const reviewEmailCandidate = (
  summary: ApplicationSummarySnapshot,
  ownerClientData: ApplicationClientData | null,
  agentClientData: ApplicationClientData | null,
): string => {
  const ownerEmail = normalizeReviewEmail(ownerClientData?.email ?? '')
  const agentEmail = normalizeReviewEmail(agentClientData?.email ?? '')

  if (isAgentApplicant(summary.applicantTypeCode)) {
    return agentEmail || ownerEmail
  }

  return ownerEmail
}

const buildSearchParams = (
  filters: ApplicationReviewSearchFilters,
  sortField: ApplicationReviewSearchSortField,
  sortDirection: 'asc' | 'desc',
  page: number,
  pageSize: number,
): URLSearchParams => {
  const params = createSearchParams([
    ['applicationNumber', filters.applicationNumber],
    ['productTypeCode', filters.productTypeCode],
    ['region', filters.region],
    ['receivedFromDate', filters.receivedFromDate],
    ['receivedToDate', filters.receivedToDate],
    ['listingFromDate', filters.listingFromDate],
    ['listingToDate', filters.listingToDate],
    ['sortField', sortField],
    ['sortDirection', sortDirection],
    ['page', page],
    ['pageSize', pageSize],
  ])

  if (filters.region.length === 0) {
    params.set('region', '')
  }

  return params
}

const ProvincialReviewPage = () => {
  const { capabilities, canPerform } = useAuth()
  const [searchParams, setSearchParams] = usePersistedSearchParams('provincial-review')
  const [productTypeOptions, setProductTypeOptions] = useState<SearchOption[]>([])
  const [regionOptions, setRegionOptions] = useState<IdTextOption[]>([])
  const { defaultRegion: defaultZone, preferenceLoading } = useDefaultRegionPreference(
    hasProvincialStaffRole(capabilities.roles),
  )
  const [reviewStatusOptions, setReviewStatusOptions] = useState<SearchOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [searchResult, setSearchResult] = useState<{
    results: ApplicationReviewSearchResponse
    totalStatus: DeferredSearchTotalStatus
  }>({ results: EMPTY_RESULTS, totalStatus: 'exact' })
  const { results, totalStatus } = searchResult
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<Record<string, boolean>>({})
  const [submittingApproval, setSubmittingApproval] = useState(false)
  const [approvalConfirmationNumbers, setApprovalConfirmationNumbers] = useState<string[]>([])
  const [rejectApplicationNumber, setRejectApplicationNumber] = useState('')
  const [rejectStatusCode, setRejectStatusCode] = useState(REJECT_STATUS_CODE)
  const [rejectEmailAddress, setRejectEmailAddress] = useState('')
  const [rejectRemark, setRejectRemark] = useState('')
  const [sendRejectEmail, setSendRejectEmail] = useState(true)
  const [rejectValidationMessage, setRejectValidationMessage] = useState('')
  const [loadingRejectEmail, setLoadingRejectEmail] = useState(false)
  const [submittingReject, setSubmittingReject] = useState(false)
  const [reviewActionStatus, setReviewActionStatus] = useState<ReviewActionStatus | null>(null)
  const totalCacheRef = useRef<SearchTotalCache>(new Map())
  const canApproveApplications = canPerform('/applicationsReview')
  const canOpenApplicationDetails =
    canPerform('/applicationSearch') && canPerform('/applicationDetails')
  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
  )
  const urlState = useMemo(() => {
    const urlFilters: ApplicationReviewSearchFilters = {
      applicationNumber: searchParams.get('applicationNumber') ?? '',
      productTypeCode: searchParams.get('productTypeCode') ?? '',
      region: parseCsvParam(searchParams.get('region')),
      receivedFromDate: searchParams.get('receivedFromDate') ?? '',
      receivedToDate: searchParams.get('receivedToDate') ?? '',
      listingFromDate: searchParams.get('listingFromDate') ?? '',
      listingToDate: searchParams.get('listingToDate') ?? '',
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
        APPLICATION_REVIEW_DEFAULT_PAGE_SIZE,
        APPLICATION_REVIEW_PAGE_SIZE_OPTIONS,
      ),
    }
  }, [searchParams])
  const filtersReady = !optionsLoading
  const appliedFilters = urlState.filters
  const [filters, setFilters] = useSearchFilterDraft(appliedFilters)
  const sortField = urlState.sortField
  const sortDirection = urlState.sortDirection
  const pageSize = urlState.pageSize
  const requestFilters = appliedFilters
  const hasSearchQuery = searchParams.toString().length > 0
  const clearSelection = useCallback(() => {
    setSelectedRowsById({})
    setReviewActionStatus(null)
  }, [])
  const updateFilter = useCallback(
    <K extends keyof ApplicationReviewSearchFilters>(
      key: K,
      value: ApplicationReviewSearchFilters[K],
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
  const rejectStatusSelectOptions = reviewStatusOptions
  const rejectStatusAvailable = reviewStatusOptions.some(
    (option) => option.value === REJECT_STATUS_CODE,
  )
  const rejectStatusSupportsEmail = EMAIL_STATUS_CODES.has(normalizeReviewStatus(rejectStatusCode))

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

  const selectableRows = useMemo(() => {
    if (!canApproveApplications) {
      return []
    }
    return results.content.filter((row) => isReviewableSourceStatus(row.status))
  }, [canApproveApplications, results.content])

  const selectedReviewableRows = useMemo(
    () => selectableRows.filter((row) => Boolean(selectedRowsById[row.applicationNumber])),
    [selectableRows, selectedRowsById],
  )
  const selectedRowsCount = selectedReviewableRows.length

  const allSelectableRowsAreSelected = useMemo(() => {
    if (selectableRows.length === 0) {
      return false
    }
    return selectableRows.every((row) => Boolean(selectedRowsById[row.applicationNumber]))
  }, [selectableRows, selectedRowsById])

  const beginSearchRequest = useLatestRequestGuard()
  const commitResults = useCallback(
    (nextResults: ApplicationReviewSearchResponse, nextTotalStatus: DeferredSearchTotalStatus) => {
      setSearchResult({ results: nextResults, totalStatus: nextTotalStatus })
    },
    [],
  )

  const runSearch = useCallback(
    async (request: ApplicationReviewSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheGeneration = getPageDataCacheGeneration()
      const pageCacheKey = buildPageDataCacheKey(
        'provincial-review-search',
        capabilities?.principal,
        request,
      )
      const isLatestRequest = beginSearchRequest()
      if (!options.force) {
        const cachedResults = getPageDataCache<ApplicationReviewSearchResponse>(pageCacheKey)
        if (cachedResults) {
          setCachedSearchTotal(
            totalCacheRef.current,
            buildSearchTotalCacheKey(request.filters),
            cachedResults.page.totalElements,
          )
          prefetchNextSearchPage({
            pageId: 'provincial-review-search',
            principal: capabilities?.principal,
            request,
            response: cachedResults,
            search: searchApplicationReviews,
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
          response: ApplicationReviewSearchResponse,
          totalIsExact: boolean,
        ) => {
          if (totalIsExact && setPageDataCache(pageCacheKey, response, pageCacheGeneration)) {
            setCachedSearchTotal(totalCacheRef.current, totalCacheKey, response.page.totalElements)
            prefetchNextSearchPage({
              pageId: 'provincial-review-search',
              principal: capabilities?.principal,
              request,
              response,
              search: searchApplicationReviews,
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
          search: searchApplicationReviews,
          count: countApplicationReviews,
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
          setErrorMessage('Unable to retrieve application review search results.')
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
    if (!filtersReady || regionDefaultPending) {
      return
    }
    if (!hasSearchQuery) {
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
    filtersReady,
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
        const options = await fetchApplicationReviewOptions()

        setProductTypeOptions(options.productTypes)
        setRegionOptions(mapValueLabelOptionsToIdTextOptions(options.regions))
        setReviewStatusOptions(options.reviewStatuses)
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
      region: defaultZoneRegionIds,
    }
    setFilters(defaultFilters)
    setSearchParams(
      buildSearchParams(
        defaultFilters,
        DEFAULT_SORT_FIELD,
        DEFAULT_SORT_DIRECTION,
        DEFAULT_SEARCH_PAGE,
        APPLICATION_REVIEW_DEFAULT_PAGE_SIZE,
      ),
    )
  }

  const onHeaderClick = (column: ApplicationReviewSearchSortField) => {
    const nextDirection = getNextSortDirection(sortField, sortDirection, column)
    clearSelection()
    setSearchParams(
      buildSearchParams(appliedFilters, column, nextDirection, DEFAULT_SEARCH_PAGE, pageSize),
    )
  }

  const toggleRowSelection = (applicationNumber: string, checked: boolean) => {
    setReviewActionStatus(null)
    setSelectedRowsById((current) => {
      const next = { ...current }
      if (checked) {
        next[applicationNumber] = true
      } else {
        delete next[applicationNumber]
      }
      return next
    })
  }

  const toggleSelectAllRowsOnPage = (checked: boolean) => {
    setReviewActionStatus(null)
    setSelectedRowsById((current) => {
      const next = { ...current }
      selectableRows.forEach((row) => {
        if (checked) {
          next[row.applicationNumber] = true
        } else {
          delete next[row.applicationNumber]
        }
      })
      return next
    })
  }

  const closeRejectPanel = useCallback(() => {
    setRejectApplicationNumber('')
    setRejectStatusCode(REJECT_STATUS_CODE)
    setRejectEmailAddress('')
    setRejectRemark('')
    setSendRejectEmail(false)
    setRejectValidationMessage('')
    setLoadingRejectEmail(false)
  }, [])

  const onOpenRejectPanel = useCallback(
    async (applicationNumber: string) => {
      if (!canApproveApplications) {
        setReviewActionStatus({
          kind: 'error',
          message: 'Your account is not authorized to disapprove applications.',
        })
        return
      }
      if (optionsUnavailable || !rejectStatusAvailable) {
        setReviewActionStatus({
          kind: 'error',
          message: 'Application status options are unavailable.',
        })
        return
      }

      setReviewActionStatus(null)
      setRejectApplicationNumber(applicationNumber)
      setRejectStatusCode(REJECT_STATUS_CODE)
      setRejectEmailAddress('')
      setRejectRemark('')
      setSendRejectEmail(false)
      setRejectValidationMessage('')
      setLoadingRejectEmail(true)

      try {
        const summary = await fetchApplicationSummarySnapshot(applicationNumber)
        if (!summary) {
          setRejectValidationMessage('Unable to load client email for this application.')
          return
        }

        const [ownerClientData, agentClientData] = await Promise.all([
          fetchApplicationClientData(summary.ownerClientNumber, summary.ownerClientLocationCode),
          isAgentApplicant(summary.applicantTypeCode)
            ? fetchApplicationClientData(summary.agentClientNumber, summary.agentClientLocationCode)
            : Promise.resolve(null),
        ])

        const candidateEmail = reviewEmailCandidate(summary, ownerClientData, agentClientData)
        setRejectEmailAddress(candidateEmail)
      } catch (error) {
        console.error(error)
        setRejectValidationMessage('Unable to load client email for this application.')
      } finally {
        setLoadingRejectEmail(false)
      }
    },
    [canApproveApplications, optionsUnavailable, rejectStatusAvailable],
  )

  const onRejectApplicationClick = async () => {
    if (
      !canApproveApplications ||
      !rejectApplicationNumber ||
      optionsUnavailable ||
      !rejectStatusAvailable
    ) {
      return
    }

    const statusCode = normalizeReviewStatus(rejectStatusCode)
    const clientEmailAddress = normalizeReviewEmail(rejectEmailAddress)
    const remark = rejectRemark.trim()
    const sendStatusEmail = EMAIL_STATUS_CODES.has(statusCode) && sendRejectEmail
    if (!statusCode) {
      setRejectValidationMessage(REJECT_STATUS_REQUIRED_MESSAGE)
      return
    }
    if (!remark) {
      setRejectValidationMessage(REJECT_REMARK_REQUIRED_MESSAGE)
      return
    }
    if (sendStatusEmail && (!clientEmailAddress || !isValidEmail(clientEmailAddress))) {
      setRejectValidationMessage(REJECT_EMAIL_REQUIRED_MESSAGE)
      return
    }

    const payload = {
      statusCode,
      remark,
      clientEmailAddress: sendStatusEmail ? clientEmailAddress : '',
    }

    setSubmittingReject(true)
    setReviewActionStatus(null)
    setRejectValidationMessage('')

    try {
      const recordVersion = await fetchCurrentApplicationRecordVersion(rejectApplicationNumber)
      const updateResult = await updateApplicationReviewStatus(
        rejectApplicationNumber,
        payload,
        recordVersion,
      )
      if (!updateResult.valid || !updateResult.updated) {
        setReviewActionStatus({
          kind: 'error',
          message: updateResult.message || 'Unable to reject application.',
        })
        return
      }

      if (!sendStatusEmail) {
        setReviewActionStatus({
          kind: 'success',
          message: `Updated application ${rejectApplicationNumber}.`,
        })
      } else {
        const emailResult = await sendApplicationReviewStatusEmail(rejectApplicationNumber, payload)
        if (!emailResult.success) {
          setReviewActionStatus({
            kind: 'error',
            message:
              emailResult.message === EMAIL_NOT_CONFIGURED_MESSAGE
                ? 'Application status updated, but status email is not configured yet.'
                : emailResult.message || 'Application status updated, but email could not be sent.',
          })
        } else {
          setReviewActionStatus({
            kind: 'success',
            message: `Updated application ${rejectApplicationNumber} and email sent.`,
          })
        }
      }

      closeRejectPanel()
      setSelectedRowsById({})
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
    } catch (error) {
      console.error(error)
      setReviewActionStatus({
        kind: 'error',
        message: 'Unable to update application.',
      })
    } finally {
      setSubmittingReject(false)
    }
  }

  const approveApplications = async (applicationNumbers: string[]): Promise<boolean> => {
    setSubmittingApproval(true)
    setReviewActionStatus(null)

    try {
      const approvalResults: ApplicationApprovalResult[] = []
      for (const applicationNumber of applicationNumbers) {
        try {
          const recordVersion = await fetchCurrentApplicationRecordVersion(applicationNumber)
          const result = await approveApplicationReview(applicationNumber, recordVersion)
          approvalResults.push({
            applicationNumber,
            success: result.updated && result.valid,
            message: normalizeApprovalFailureMessage(result.message),
          })
        } catch (error) {
          console.warn(`Unable to approve application ${applicationNumber}.`, error)
          approvalResults.push({
            applicationNumber,
            success: false,
            message: approvalRequestFailureMessage(error),
          })
        }
      }

      const successCount = approvalResults.filter((result) => result.success).length
      const failedResults = approvalResults.filter((result) => !result.success)
      const failureCount = failedResults.length

      if (failureCount === 0) {
        setReviewActionStatus({
          kind: 'success',
          message: `Approved ${successCount} application(s).`,
        })
      } else {
        const failureDetails = failedResults
          .map((result) => `${result.applicationNumber} — ${result.message}`)
          .join('; ')
        setReviewActionStatus({
          kind: successCount > 0 ? 'warning' : 'error',
          message: `${
            successCount > 0
              ? `Approved ${successCount} application(s); ${failureCount} failed.`
              : `No selected applications were approved; ${failureCount} failed.`
          } Failed applications: ${failureDetails}`,
        })
      }

      setSelectedRowsById(
        Object.fromEntries(failedResults.map((result) => [result.applicationNumber, true])),
      )
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
      return successCount > 0
    } finally {
      setSubmittingApproval(false)
    }
  }

  const onApproveSelectedClick = async () => {
    if (!canApproveApplications) {
      setReviewActionStatus({
        kind: 'error',
        message: 'Your account is not authorized to approve applications.',
      })
      return
    }

    const selectedNumbers = selectedReviewableRows.map((row) => row.applicationNumber)
    if (selectedNumbers.length === 0) {
      setReviewActionStatus({
        kind: 'error',
        message: 'Select at least one NEW or PND application before approving.',
      })
      return
    }

    setApprovalConfirmationNumbers(selectedNumbers)
  }

  const onConfirmApproveSelected = async () => {
    const selectedNumbers = approvalConfirmationNumbers
    if (selectedNumbers.length > 0) {
      const approved = await approveApplications(selectedNumbers)
      if (!approved) {
        throw new Error('No selected applications were approved.')
      }
    }
  }

  const onApproveApplicationClick = async (applicationNumber: string, sourceStatus: string) => {
    if (!canApproveApplications) {
      setReviewActionStatus({
        kind: 'error',
        message: 'Your account is not authorized to approve applications.',
      })
      return
    }

    if (!isReviewableSourceStatus(sourceStatus)) {
      setReviewActionStatus({
        kind: 'error',
        message: 'Only NEW or PND applications can be approved.',
      })
      return
    }

    await approveApplications([applicationNumber])
  }

  return (
    <Grid fullWidth className="default-grid fullbleed-table-page provincial-review-search-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Provincial application review"
          subtitle="Review and action provincial applications awaiting a decision."
        />
      </Column>

      {optionsUnavailable && <AuthoritativeOptionsUnavailableNotification />}

      {!!reviewActionStatus && (
        <AppNotification
          kind={reviewActionStatus.kind}
          title={
            reviewActionStatus.kind === 'success'
              ? 'Action complete'
              : reviewActionStatus.kind === 'warning'
                ? 'Approval partially completed'
                : 'Action failed'
          }
          subtitle={reviewActionStatus.message}
          autoDismissMs={reviewActionStatus.kind === 'success' ? 6000 : undefined}
          onCloseButtonClick={() => setReviewActionStatus(null)}
        />
      )}

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters">
          <form
            className="provincial-review-filters-panel"
            onSubmit={(event) => {
              event.preventDefault()
              onSearch()
            }}
          >
            <div className="legacy-search-grid provincial-review-search-grid">
              <TextInput
                id="applicationNumber"
                labelText="Application number"
                value={filters.applicationNumber}
                onChange={(event) => updateFilter('applicationNumber', event.target.value)}
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
            <div className="legacy-search-actions" role="group" aria-label="Review search actions">
              <Button
                type="button"
                kind="tertiary"
                size="md"
                onClick={onClearFilters}
                disabled={loading}
              >
                Clear all
              </Button>
              <SearchSubmitButton loading={loading} disabled={hasDateValidationError} />
            </div>
          </form>
        </section>
      </Column>

      <ConfirmationModal
        open={approvalConfirmationNumbers.length > 0}
        title="Approve applications"
        description="You are about to approve the following applications:"
        confirmLabel="Approve"
        pendingLabel="Approving…"
        confirmDisabled={submittingApproval}
        onClose={() => setApprovalConfirmationNumbers([])}
        onConfirm={onConfirmApproveSelected}
        onError={() => undefined}
      >
        <ul aria-label="Applications to approve">
          {approvalConfirmationNumbers.map((applicationNumber) => (
            <li key={applicationNumber}>{applicationNumber}</li>
          ))}
        </ul>
      </ConfirmationModal>

      <Modal
        open={Boolean(rejectApplicationNumber)}
        passiveModal
        size="md"
        modalHeading={`Update application ${rejectApplicationNumber}`}
        aria-label={`Update application ${rejectApplicationNumber}`}
        className="review-reject-modal"
        preventCloseOnClickOutside
        selectorPrimaryFocus="#reviewRejectStatus"
        onRequestClose={() => {
          if (!submittingReject) {
            closeRejectPanel()
          }
        }}
      >
        <div className="review-reject-modal__grid">
          <SearchableSelect
            id="reviewRejectStatus"
            labelText="Application status"
            value={rejectStatusCode}
            placeholder="Select application status"
            options={rejectStatusSelectOptions}
            invalid={rejectValidationMessage === REJECT_STATUS_REQUIRED_MESSAGE}
            invalidText={rejectValidationMessage}
            disabled={optionsUnavailable || !rejectStatusAvailable || submittingReject}
            onChange={(value) => {
              const statusCode = value.toUpperCase()
              setRejectStatusCode(statusCode)
              if (!EMAIL_STATUS_CODES.has(statusCode)) {
                setSendRejectEmail(false)
              }
              setRejectValidationMessage('')
            }}
          />
          <TextArea
            id="reviewRejectRemark"
            labelText="Remarks"
            rows={6}
            maxCount={250}
            value={rejectRemark}
            invalid={rejectValidationMessage === REJECT_REMARK_REQUIRED_MESSAGE}
            invalidText={rejectValidationMessage}
            disabled={submittingReject}
            onChange={(event) => {
              setRejectRemark(event.target.value.slice(0, 250))
              setRejectValidationMessage('')
            }}
          />
          <Checkbox
            id="reviewRejectSendEmail"
            labelText="Send status email"
            checked={sendRejectEmail}
            disabled={!rejectStatusSupportsEmail || loadingRejectEmail || submittingReject}
            onChange={(_, payload) => {
              setSendRejectEmail(Boolean(payload.checked))
              setRejectValidationMessage('')
            }}
          />
          <TextInput
            id="reviewRejectEmail"
            labelText="Send to:"
            value={rejectEmailAddress}
            disabled={!rejectStatusSupportsEmail || loadingRejectEmail || submittingReject}
            invalid={rejectValidationMessage === REJECT_EMAIL_REQUIRED_MESSAGE}
            invalidText={rejectValidationMessage}
            onChange={(event) => {
              setRejectEmailAddress(event.target.value)
              setRejectValidationMessage('')
            }}
          />
          {!!rejectValidationMessage &&
            rejectValidationMessage !== REJECT_STATUS_REQUIRED_MESSAGE &&
            rejectValidationMessage !== REJECT_REMARK_REQUIRED_MESSAGE && (
              <InlineNotification
                kind="error"
                title="Review validation"
                subtitle={rejectValidationMessage}
                lowContrast
                onCloseButtonClick={() => setRejectValidationMessage('')}
              />
            )}
        </div>
        <div className="review-reject-modal__actions">
          <Button kind="tertiary" disabled={submittingReject} onClick={closeRejectPanel}>
            Cancel
          </Button>
          <Button
            kind="primary"
            disabled={
              optionsUnavailable || !rejectStatusAvailable || loadingRejectEmail || submittingReject
            }
            renderIcon={submittingReject ? PendingIcon : undefined}
            onClick={() => void onRejectApplicationClick()}
          >
            {submittingReject ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Modal>

      <Column
        sm={4}
        md={8}
        lg={16}
        hidden={!hasSearchQuery}
        style={{ display: hasSearchQuery ? undefined : 'none' }}
      >
        <section
          className="legacy-search-section legacy-search-section--results"
          aria-label="Review queue"
        >
          <div className="provincial-review-table-toolbar">
            <p className="legacy-search-result-count">
              {errorMessage
                ? 'Results unavailable'
                : loading && results.content.length === 0
                  ? 'Loading results…'
                  : (formatDeferredSearchTotalLabel(
                      results.page.totalElements,
                      totalStatus,
                      results.page.number * results.page.size + results.content.length,
                    ) ??
                    `${new Intl.NumberFormat('en-CA').format(results.page.totalElements)} results found`)}
            </p>
            <DisabledButtonTooltip
              disabled={
                loading ||
                submittingApproval ||
                submittingReject ||
                selectedRowsCount === 0 ||
                !canApproveApplications
              }
              description={
                loading
                  ? 'Wait for the review results to load.'
                  : submittingApproval || submittingReject
                    ? 'Wait for the current review update to finish.'
                    : !canApproveApplications
                      ? 'You do not have permission to approve applications.'
                      : 'Select at least one application to approve.'
              }
            >
              <Button
                kind="tertiary"
                onClick={() => void onApproveSelectedClick()}
                disabled={
                  loading ||
                  submittingApproval ||
                  submittingReject ||
                  selectedRowsCount === 0 ||
                  !canApproveApplications
                }
              >
                Approve Selected Applications
              </Button>
            </DisabledButtonTooltip>
          </div>
          <SearchResultsTableFrame loading={loading} loadingDescription="Loading review queue…">
            {errorMessage ? (
              <EmptyState
                role="alert"
                title="Review queue unavailable"
                description={errorMessage}
              />
            ) : results.content.length > 0 ? (
              <Table size="md" useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>
                      <DisabledButtonTooltip
                        disabled={selectableRows.length === 0 || !canApproveApplications}
                        description={
                          !canApproveApplications
                            ? 'You do not have permission to approve applications.'
                            : 'No New or Pending applications are available on this page.'
                        }
                      >
                        <Checkbox
                          id="selectAllCurrentPageRows"
                          hideLabel
                          labelText="Select all rows on this page"
                          checked={allSelectableRowsAreSelected}
                          disabled={selectableRows.length === 0 || !canApproveApplications}
                          onChange={(_, payload) =>
                            toggleSelectAllRowsOnPage(Boolean(payload.checked))
                          }
                        />
                      </DisabledButtonTooltip>
                    </TableHeader>
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
                    <TableHeader>Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.content.map((row) => (
                    <TableRow key={row.applicationNumber}>
                      <TableCell>
                        <DisabledButtonTooltip
                          disabled={
                            !canApproveApplications || !isReviewableSourceStatus(row.status)
                          }
                          description={disabledReviewSelectionDescription(canApproveApplications)}
                        >
                          <Checkbox
                            id={`selectRow-${row.applicationNumber}`}
                            hideLabel
                            labelText={`Select ${row.applicationNumber}`}
                            checked={Boolean(selectedRowsById[row.applicationNumber])}
                            disabled={
                              !canApproveApplications || !isReviewableSourceStatus(row.status)
                            }
                            onChange={(_, payload) =>
                              toggleRowSelection(row.applicationNumber, Boolean(payload.checked))
                            }
                          />
                        </DisabledButtonTooltip>
                      </TableCell>
                      <TableCell>
                        {canOpenApplicationDetails ? (
                          <Link
                            className="cds--link"
                            to={withCurrentSearch(
                              `/provincial/application/${row.applicationNumber}`,
                            )}
                            state={{
                              returnTo: {
                                label: 'Provincial application review',
                                to: withCurrentSearch('/provincial/review'),
                              },
                            }}
                          >
                            {row.applicationNumber}
                          </Link>
                        ) : (
                          row.applicationNumber
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusTag status={row.status} />
                      </TableCell>
                      <TableCell>
                        {displayTableValue(formatApplicationVolume(row.volume))}
                      </TableCell>
                      <TableCell>{displayTableValue(row.speciesEndUse)}</TableCell>
                      <TableCell className="legacy-search-table-date">
                        {displayTableValue(row.listingDate)}
                      </TableCell>
                      <TableCell>{displayTableValue(row.region)}</TableCell>
                      <TableCell>
                        <div className="provincial-review-row-actions">
                          <Button
                            kind="ghost"
                            size="sm"
                            disabled={
                              !canApproveApplications ||
                              !isReviewableSourceStatus(row.status) ||
                              submittingApproval ||
                              submittingReject
                            }
                            onClick={() =>
                              void onApproveApplicationClick(row.applicationNumber, row.status)
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            kind="ghost"
                            size="sm"
                            disabled={
                              !canApproveApplications ||
                              !isReviewableSourceStatus(row.status) ||
                              optionsUnavailable ||
                              !rejectStatusAvailable ||
                              submittingApproval ||
                              submittingReject
                            }
                            onClick={() => void onOpenRejectPanel(row.applicationNumber)}
                          >
                            Disapprove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : !loading ? (
              <EmptyState
                title="No review records found"
                description="No review records found for the selected criteria."
              />
            ) : null}
            {!errorMessage && (!loading || results.content.length > 0) && (
              <Pagination
                page={results.page.number + 1}
                pageSize={results.page.size}
                pageSizes={[...APPLICATION_REVIEW_PAGE_SIZE_OPTIONS]}
                totalItems={results.page.totalElements}
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
    </Grid>
  )
}

export default ProvincialReviewPage
