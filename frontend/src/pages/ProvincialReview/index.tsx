import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  Table,
  TableBatchAction,
  TableBatchActions,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextInput,
  Tooltip,
} from '@carbon/react'
import { CheckmarkOutline, CloseOutline, Information } from '@carbon/icons-react'
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import { ActionResultNotification } from '@/components/ActionResultNotification'
import Pagination from '@/components/Pagination'
import type { ActionResult } from '@/utils/action-result'
import ConfirmationModal from '@/components/ConfirmationModal'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import SearchSubmitButton from '@/components/SearchSubmitButton'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import SearchableSelect from '../../components/SearchableSelect'
import RegionMultiSelect from '@/components/RegionMultiSelect'
import StatusTag from '@/components/StatusTag'
import UnsavedChangesGuard from '@/components/UnsavedChangesGuard'
import IsoDateRangePicker from '../../components/IsoDateRangePicker'
import type {
  ApplicationReviewSearchFilters,
  ApplicationReviewSearchItem,
  ApplicationReviewSearchRequest,
  ApplicationReviewSearchResponse,
  ApplicationReviewSearchSortField,
} from '@/interfaces/ApplicationReviewSearch'
import { useAuth } from '@/context/auth/useAuth'
import { useAllowedRegionOptions } from '@/context/auth/useAllowedRegionOptions'
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
  approveApplicationReview,
  countApplicationReviews,
  searchApplicationReviews,
} from '@/service/application-review-search-service'
import { fetchApplicationReviewOptions, type SearchOption } from '@/service/search-options-service'
import { fetchCurrentApplicationRecordVersion } from '@/service/record-version-service'
import { resolveDefaultZoneRegionIds } from '@/service/user-preference-service'
import { displayTableValue } from '@/utils/text'
import { firstStringField, isRecord } from '@/utils/record'
import { sanitizeNotificationText } from '@/utils/notification-messages'
import DisapproveApplicationModal, { type DisapprovalOutcome } from './DisapproveApplicationModal'
import {
  approvalResults,
  disapprovalResult,
  resultAnnouncement,
  type ApplicationApprovalFailure,
} from './review-results'

import './ProvincialReview.scss'
import { formatVolume } from '@/utils/volume'

const hasInvalidSearchDates = (filters: ApplicationReviewSearchFilters): boolean =>
  hasInvalidIsoDateRange(filters.receivedFromDate, filters.receivedToDate) ||
  hasInvalidIsoDateRange(filters.listingFromDate, filters.listingToDate)

const INITIAL_FILTERS: ApplicationReviewSearchFilters = {
  applicationNumber: '',
  productTypeCode: '',
  region: [],
  receivedFromDate: '',
  receivedToDate: '',
  listingFromDate: '',
  listingToDate: '',
}

// INTENTIONAL_LEGACY_DIVERGENCE(APPLICATION_REVIEW_PAGE_SIZE): the review queue opens with more
// rows than other searches, using the same page-size options.
const APPLICATION_REVIEW_DEFAULT_PAGE_SIZE = 100

const EMPTY_RESULTS = createEmptyPagedSearchResponse<ApplicationReviewSearchResponse>(
  APPLICATION_REVIEW_DEFAULT_PAGE_SIZE,
)
const APPLICATION_BATCH_SELECTION = batchSelectionTranslator('application', 'applications')

const RESULT_COLUMNS: {
  id: string
  label: string
  sortField?: ApplicationReviewSearchSortField
}[] = [
  { id: 'applicationNumber', label: 'Application', sortField: 'applicationNumber' },
  { id: 'status', label: 'Status' },
  { id: 'volume', label: 'Application volume (m³)' },
  { id: 'speciesEndUse', label: 'Species end use sort' },
  { id: 'listingDate', label: 'List date', sortField: 'listingDate' },
  { id: 'region', label: 'Region', sortField: 'regionCode' },
]

const DEFAULT_SORT_FIELD: ApplicationReviewSearchSortField = 'applicationNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc'
const SORT_FIELD_OPTIONS = RESULT_COLUMNS.flatMap((column) =>
  column.sortField ? [column.sortField] : [],
)
// INTENTIONAL_LEGACY_DIVERGENCE(APPLICATION_REVIEW_DISAPPROVE_STATUSES)
const DISAPPROVE_STATUS_CODES = new Set(['REJ', 'WDN'])
const APPROVAL_REQUEST_FAILED_MESSAGE = 'The approval request could not be completed.'
const SEARCH_ERROR_MESSAGE = 'Unable to retrieve applications for review. Try again.'

const approvalConfirmationTitle = (count: number): string =>
  count === 1 ? 'Approve application' : 'Approve applications'

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

const sameFilters = (
  left: ApplicationReviewSearchFilters,
  right: ApplicationReviewSearchFilters,
): boolean =>
  left.applicationNumber.trim() === right.applicationNumber.trim() &&
  left.productTypeCode === right.productTypeCode &&
  left.receivedFromDate === right.receivedFromDate &&
  left.receivedToDate === right.receivedToDate &&
  left.listingFromDate === right.listingFromDate &&
  left.listingToDate === right.listingToDate &&
  [...left.region].sort().join(',') === [...right.region].sort().join(',')

const sameSearchParams = (left: URLSearchParams, right: URLSearchParams): boolean => {
  const canonical = (params: URLSearchParams) => {
    const sorted = new URLSearchParams(params)
    sorted.sort()
    return sorted.toString()
  }
  return canonical(left) === canonical(right)
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

/** Where focus goes once an approval or disapproval has finished and the queue has refreshed. */
type PendingFocus =
  | { kind: 'results' }
  | { kind: 'nextRow'; applicationNumber: string | undefined; index: number; announcement: string }

const ProvincialReviewPage = () => {
  const { capabilities, canPerform } = useAuth()
  const [searchParams, setSearchParams] = usePersistedSearchParams('provincial-review')
  const [productTypeOptions, setProductTypeOptions] = useState<SearchOption[]>([])
  const [allRegionOptions, setAllRegionOptions] = useState<IdTextOption[]>([])
  const regionOptions = useAllowedRegionOptions(allRegionOptions, '/applicationsReview', 'id')
  const { defaultRegion: defaultZone, preferenceLoading } = useDefaultRegionPreference(
    canUseDefaultRegionPreference(capabilities),
  )
  const [reviewStatusOptions, setReviewStatusOptions] = useState<SearchOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [searchResult, setSearchResult] = useState<{
    results: ApplicationReviewSearchResponse
    totalStatus: DeferredSearchTotalStatus
    searched: boolean
  }>({ results: EMPTY_RESULTS, totalStatus: 'exact', searched: false })
  const { results, totalStatus, searched } = searchResult
  const [loading, setLoading] = useState(false)
  // Results show as loading, not as zero results, until the first search returns.
  const resultsLoading = loading || !searched
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<Record<string, boolean>>({})
  const [submittingApproval, setSubmittingApproval] = useState(false)
  const [approvalConfirmationNumbers, setApprovalConfirmationNumbers] = useState<string[]>([])
  const [disapproveTarget, setDisapproveTarget] = useState<{
    applicationNumber: string
    index: number
    nextApplicationNumber: string | undefined
  } | null>(null)
  const [disapproving, setDisapproving] = useState(false)
  // At most one success and one failure: a batch approval can do both. They stay until closed
  // or replaced by the next approval or disapproval.
  const [reviewResults, setReviewResults] = useState<ActionResult[]>([])
  const reviewResultsRef = useRef<HTMLDivElement>(null)
  const [announcement, setAnnouncement] = useState('')
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null)
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
        SEARCH_PAGE_SIZE_OPTIONS,
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
  // A saved link with invalid dates doesn't run its search, so it has no results to show.
  const showResults = hasSearchQuery && !hasInvalidSearchDates(appliedFilters)
  // No results show only the empty state, without counts or pagination.
  const noResults = results.content.length === 0 && results.page.totalElements === 0
  const clearSelection = useCallback(() => {
    setSelectedRowsById({})
  }, [])
  const selectAllRowsRef = useRef<HTMLInputElement>(null)
  // Cancel closes the batch bar that holds focus, so focus goes to the header checkbox.
  const cancelBatchSelection = useCallback(() => {
    clearSelection()
    requestAnimationFrame(() => selectAllRowsRef.current?.focus())
  }, [clearSelection])
  const updateFilter = useCallback(
    <K extends keyof ApplicationReviewSearchFilters>(
      key: K,
      value: ApplicationReviewSearchFilters[K],
    ) => {
      setFilters((currentFilters) => ({ ...currentFilters, [key]: value }))
    },
    [setFilters],
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
  const defaultQueueFilters = useMemo(
    () => ({ ...INITIAL_FILTERS, region: defaultZoneRegionIds }),
    [defaultZoneRegionIds],
  )
  // With the default filters, no results means the queue itself is empty.
  const showingQueue = sameFilters(appliedFilters, defaultQueueFilters)
  const regionDefaultPending =
    !searchParams.has('region') &&
    (optionsLoading ||
      preferenceLoading ||
      (!optionsUnavailable && defaultZoneRegionIds.length > 0))
  const disapproveStatusOptions = useMemo(
    () =>
      reviewStatusOptions.filter((option) =>
        DISAPPROVE_STATUS_CODES.has(option.value.trim().toUpperCase()),
      ),
    [reviewStatusOptions],
  )

  const hasDateValidationError = hasInvalidSearchDates(filters)

  // The queue holds only New and Pending applications, so every row can be approved.
  const selectedNumbers = useMemo(
    () =>
      results.content
        .filter((row) => Boolean(selectedRowsById[row.applicationNumber]))
        .map((row) => row.applicationNumber),
    [results.content, selectedRowsById],
  )
  const selectedRowsCount = selectedNumbers.length
  const allRowsSelected = results.content.length > 0 && selectedRowsCount === results.content.length
  const modalOpen = approvalConfirmationNumbers.length > 0 || Boolean(disapproveTarget)
  const rowActionsDisabled =
    selectedRowsCount > 0 || submittingApproval || disapproving || modalOpen
  const disapproveAvailable = !optionsUnavailable && disapproveStatusOptions.length > 0

  const beginSearchRequest = useLatestRequestGuard()
  const commitResults = useCallback(
    (nextResults: ApplicationReviewSearchResponse, nextTotalStatus: DeferredSearchTotalStatus) => {
      setSearchResult({ results: nextResults, totalStatus: nextTotalStatus, searched: true })
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
          setErrorMessage(SEARCH_ERROR_MESSAGE)
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

  const refreshResults = () =>
    runSearch(
      {
        filters: urlState.filters,
        page: urlState.page - 1,
        pageSize: urlState.pageSize,
        sortField: urlState.sortField,
        sortDirection: urlState.sortDirection,
      },
      { force: true },
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
        setAllRegionOptions(mapValueLabelOptionsToIdTextOptions(options.regions))
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

  // The page opens with the queue: every New and Pending application, in the user's default
  // zone when one is set.
  useEffect(() => {
    if (hasSearchQuery || optionsLoading || preferenceLoading) {
      return
    }
    setSearchParams(
      buildSearchParams(
        defaultQueueFilters,
        DEFAULT_SORT_FIELD,
        DEFAULT_SORT_DIRECTION,
        DEFAULT_SEARCH_PAGE,
        APPLICATION_REVIEW_DEFAULT_PAGE_SIZE,
      ),
      { replace: true },
    )
  }, [defaultQueueFilters, hasSearchQuery, optionsLoading, preferenceLoading, setSearchParams])

  useEffect(() => {
    if (
      optionsLoading ||
      preferenceLoading ||
      optionsUnavailable ||
      !hasSearchQuery ||
      searchParams.has('region') ||
      defaultZoneRegionIds.length === 0
    ) {
      return
    }

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
  }, [
    defaultZoneRegionIds,
    hasSearchQuery,
    optionsLoading,
    optionsUnavailable,
    preferenceLoading,
    searchParams,
    setSearchParams,
    urlState,
  ])

  // Focus moves once the dialog has closed and the refreshed queue shows.
  useEffect(() => {
    if (!pendingFocus || modalOpen || loading || submittingApproval || disapproving) {
      return
    }
    const frame = requestAnimationFrame(() => {
      setPendingFocus(null)
      if (pendingFocus.kind === 'results') {
        reviewResultsRef.current?.focus()
        reviewResultsRef.current?.scrollIntoView?.({ block: 'nearest' })
        return
      }
      const approveButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('button[data-review-approve]'),
      )
      const target =
        approveButtons.find(
          (button) => button.dataset.reviewApprove === pendingFocus.applicationNumber,
        ) ?? approveButtons[Math.min(pendingFocus.index, approveButtons.length - 1)]
      ;(target ?? reviewResultsRef.current)?.focus()
      setAnnouncement(pendingFocus.announcement)
    })
    return () => cancelAnimationFrame(frame)
  }, [disapproving, loading, modalOpen, pendingFocus, submittingApproval])

  const showReviewResults = (nextResults: ActionResult[]) => {
    setAnnouncement('')
    setReviewResults(nextResults)
  }

  // A search the URL already holds runs again; any other search goes through the URL.
  const runSearchFor = (
    nextSearchParams: URLSearchParams,
    request: ApplicationReviewSearchRequest,
  ) => {
    if (sameSearchParams(nextSearchParams, searchParams)) {
      void runSearch(request, { force: true })
      return
    }
    setSearchParams(nextSearchParams)
  }

  const onSearch = () => {
    if (loading || hasDateValidationError) {
      return
    }
    clearSelection()
    runSearchFor(
      buildSearchParams(filters, sortField, sortDirection, DEFAULT_SEARCH_PAGE, pageSize),
      { filters, page: DEFAULT_SEARCH_PAGE - 1, pageSize, sortField, sortDirection },
    )
  }

  // INTENTIONAL_LEGACY_DIVERGENCE(APPLICATION_REVIEW_CLEAR_ALL): Clear all returns the filters to
  // their defaults and reloads the queue.
  const onClearFilters = () => {
    clearSelection()
    setFilters(defaultQueueFilters)
    runSearchFor(
      buildSearchParams(
        defaultQueueFilters,
        sortField,
        sortDirection,
        DEFAULT_SEARCH_PAGE,
        pageSize,
      ),
      {
        filters: defaultQueueFilters,
        page: DEFAULT_SEARCH_PAGE - 1,
        pageSize,
        sortField,
        sortDirection,
      },
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
    setSelectedRowsById(
      checked
        ? Object.fromEntries(results.content.map((row) => [row.applicationNumber, true]))
        : {},
    )
  }

  const applicationResultLink = (applicationNumber: string) =>
    canOpenApplicationDetails
      ? {
          to: withCurrentSearch(`/provincial/application/${applicationNumber}`),
          state: {
            returnTo: {
              label: 'Application review',
              to: withCurrentSearch('/provincial/review'),
            },
          },
        }
      : {}

  // The row after the acted-on one, which takes its place once it leaves the queue.
  const nextRowAfter = (index: number): string | undefined =>
    (results.content[index + 1] ?? results.content[index - 1])?.applicationNumber

  const approveApplications = async (
    applicationNumbers: string[],
    fromRow: boolean,
  ): Promise<ActionResult[]> => {
    setSubmittingApproval(true)
    try {
      const approvedNumbers: string[] = []
      const failures: ApplicationApprovalFailure[] = []
      for (const applicationNumber of applicationNumbers) {
        try {
          const recordVersion = await fetchCurrentApplicationRecordVersion(applicationNumber)
          const result = await approveApplicationReview(applicationNumber, recordVersion)
          if (result.updated && result.valid) {
            approvedNumbers.push(applicationNumber)
          } else {
            failures.push({
              applicationNumber,
              message: normalizeApprovalFailureMessage(result.message),
            })
          }
        } catch (error) {
          console.warn(`Unable to approve application ${applicationNumber}.`, error)
          failures.push({ applicationNumber, message: approvalRequestFailureMessage(error) })
        }
      }

      const nextResults = approvalResults(approvedNumbers, failures, fromRow, applicationResultLink)
      // The selection clears after every attempt, so the batch actions bar closes.
      clearSelection()
      showReviewResults(nextResults)
      await refreshResults()
      return nextResults
    } finally {
      setSubmittingApproval(false)
    }
  }

  const onConfirmApproveSelected = async () => {
    if (approvalConfirmationNumbers.length > 0) {
      await approveApplications(approvalConfirmationNumbers, false)
      setPendingFocus({ kind: 'results' })
    }
  }

  // Approve on a row approves straight away, as legacy does.
  const onApproveRow = async (row: ApplicationReviewSearchItem, index: number) => {
    const nextApplicationNumber = nextRowAfter(index)
    const nextResults = await approveApplications([row.applicationNumber], true)
    setPendingFocus({
      kind: 'nextRow',
      applicationNumber: nextApplicationNumber,
      index,
      announcement: resultAnnouncement(nextResults),
    })
  }

  const onDisapproved = async (outcome: DisapprovalOutcome) => {
    const target = disapproveTarget
    setDisapproveTarget(null)
    const result = disapprovalResult(outcome, applicationResultLink)
    clearSelection()
    showReviewResults([result])
    await refreshResults()
    setPendingFocus({
      kind: 'nextRow',
      applicationNumber: target?.nextApplicationNumber,
      index: target?.index ?? 0,
      announcement: resultAnnouncement([result]),
    })
  }

  return (
    <Grid fullWidth className="default-grid fullbleed-table-page provincial-review-search-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Application review"
          subtitle="Approve or disapprove applications for the Advertising List"
        />
      </Column>

      {optionsUnavailable && <AuthoritativeOptionsUnavailableNotification />}

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
                placeholder="All"
                allOptionLabel="All"
                options={productTypeOptions}
                disabled={optionsLoading || optionsUnavailable}
                onChange={(value) => updateFilter('productTypeCode', value)}
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
                fromId="receivedFromDate"
                toId="receivedToDate"
                fromLabel="Received date from"
                toLabel="Received date to"
                fromValue={filters.receivedFromDate}
                toValue={filters.receivedToDate}
                onChange={([receivedFromDate, receivedToDate]) => {
                  setFilters((current) => ({ ...current, receivedFromDate, receivedToDate }))
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
                  setFilters((current) => ({ ...current, listingFromDate, listingToDate }))
                }}
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
              <SearchSubmitButton loading={loading} invalid={hasDateValidationError} />
            </div>
            <div
              ref={reviewResultsRef}
              tabIndex={-1}
              className="provincial-review-results-notifications"
            >
              {reviewResults.map((result) => (
                <ActionResultNotification
                  key={result.kind}
                  className="legacy-inline-notification"
                  result={result}
                  onClose={() =>
                    setReviewResults((current) => current.filter((item) => item !== result))
                  }
                />
              ))}
            </div>
          </form>
        </section>
      </Column>

      {/* Results of Approve and Disapprove on a row are read out while focus stays in the table. */}
      <div className="cds--visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {approvalConfirmationNumbers.length > 0 && (
        <ConfirmationModal
          open
          title={approvalConfirmationTitle(approvalConfirmationNumbers.length)}
          description={`You are about to approve the following ${
            approvalConfirmationNumbers.length === 1 ? 'application' : 'applications'
          }:`}
          confirmLabel="Approve"
          pendingLabel="Approving…"
          className="provincial-review-approval-modal"
          onClose={() => setApprovalConfirmationNumbers([])}
          onConfirm={onConfirmApproveSelected}
        >
          <ul
            className="provincial-review-approval-modal__application-list"
            aria-label="Applications to approve"
            tabIndex={0}
          >
            {approvalConfirmationNumbers.map((applicationNumber) => (
              <li key={applicationNumber}>
                <strong>{applicationNumber}</strong>
              </li>
            ))}
          </ul>
        </ConfirmationModal>
      )}

      {disapproveTarget && (
        <DisapproveApplicationModal
          applicationNumber={disapproveTarget.applicationNumber}
          statusOptions={disapproveStatusOptions}
          onComplete={(outcome) => void onDisapproved(outcome)}
          onClose={() => setDisapproveTarget(null)}
          onBusyChange={setDisapproving}
        />
      )}
      <UnsavedChangesGuard
        isDirty={false}
        isBusy={submittingApproval || disapproving}
        onDiscard={() => {}}
        subject="these applications"
      />

      <Column
        sm={4}
        md={8}
        lg={16}
        hidden={!showResults}
        style={{ display: showResults ? undefined : 'none' }}
      >
        <section
          className="legacy-search-section legacy-search-section--results"
          aria-label="Applications to review"
        >
          {canApproveApplications && (
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
            resultName="application"
            loading={resultsLoading}
            loadingDescription="Searching"
            columnCount={RESULT_COLUMNS.length + (canApproveApplications ? 1 : 0)}
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
              canApproveApplications && selectedRowsCount > 0 ? (
                <TableBatchActions
                  totalSelected={selectedRowsCount}
                  shouldShowBatchActions
                  onCancel={cancelBatchSelection}
                  translateWithId={APPLICATION_BATCH_SELECTION}
                >
                  <TableBatchAction
                    renderIcon={CheckmarkOutline}
                    disabled={submittingApproval}
                    onClick={() => setApprovalConfirmationNumbers(selectedNumbers)}
                  >
                    Approve
                  </TableBatchAction>
                </TableBatchActions>
              ) : undefined
            }
          >
            {errorMessage ? (
              <EmptyState
                role="alert"
                title="Application review unavailable"
                description={errorMessage}
              />
            ) : results.content.length > 0 ? (
              <Table size="md" useZebraStyles>
                <TableHead>
                  <TableRow>
                    {canApproveApplications && (
                      <TableHeader>
                        <Checkbox
                          ref={selectAllRowsRef}
                          id="selectAllCurrentPageRows"
                          hideLabel
                          labelText="Select all rows on this page"
                          checked={allRowsSelected}
                          indeterminate={selectedRowsCount > 0 && !allRowsSelected}
                          onChange={(_, payload) =>
                            toggleSelectAllRowsOnPage(Boolean(payload.checked))
                          }
                        />
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
                    {canApproveApplications && <TableHeader>Actions</TableHeader>}
                  </TableRow>
                </TableHead>
                {/* The toolbar announces the result count; the rows are not read out as they change. */}
                <TableBody aria-live="off">
                  {results.content.map((row, index) => (
                    <TableRow key={row.applicationNumber}>
                      {canApproveApplications && (
                        <TableCell>
                          <Checkbox
                            id={`selectRow-${row.applicationNumber}`}
                            hideLabel
                            labelText={`Select application ${row.applicationNumber}`}
                            checked={Boolean(selectedRowsById[row.applicationNumber])}
                            onChange={(_, payload) =>
                              toggleRowSelection(row.applicationNumber, Boolean(payload.checked))
                            }
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        {canOpenApplicationDetails ? (
                          <Link
                            className="cds--link"
                            to={withCurrentSearch(
                              `/provincial/application/${row.applicationNumber}`,
                            )}
                            state={{
                              returnTo: {
                                label: 'Application review',
                                to: withCurrentSearch('/provincial/review'),
                              },
                            }}
                          >
                            {row.applicationNumber}
                          </Link>
                        ) : (
                          row.applicationNumber
                        )}
                        {row.showInfoIcon && (
                          <Tooltip
                            autoAlign
                            description="Application contains timber mark(s) from MU44"
                          >
                            <button
                              type="button"
                              className="provincial-review-mu44-info"
                              aria-label="Application contains timber mark(s) from MU44"
                            >
                              <Information size={16} aria-hidden="true" />
                            </button>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusTag status={row.status} />
                      </TableCell>
                      <TableCell>{displayTableValue(formatVolume(row.volume))}</TableCell>
                      <TableCell>{displayTableValue(row.speciesEndUse)}</TableCell>
                      <TableCell className="legacy-search-table-date">
                        {displayTableValue(row.listingDate)}
                      </TableCell>
                      <TableCell>{displayTableValue(row.region)}</TableCell>
                      {canApproveApplications && (
                        <TableCell>
                          <div className="provincial-review-row-actions">
                            <Button
                              kind="ghost"
                              size="md"
                              renderIcon={CheckmarkOutline}
                              aria-label={`Approve application ${row.applicationNumber}`}
                              data-review-approve={row.applicationNumber}
                              disabled={rowActionsDisabled}
                              onClick={() => void onApproveRow(row, index)}
                            >
                              Approve
                            </Button>
                            <Button
                              kind="ghost"
                              size="md"
                              renderIcon={CloseOutline}
                              aria-label={`Disapprove application ${row.applicationNumber}`}
                              disabled={rowActionsDisabled || !disapproveAvailable}
                              onClick={() =>
                                setDisapproveTarget({
                                  applicationNumber: row.applicationNumber,
                                  index,
                                  nextApplicationNumber: nextRowAfter(index),
                                })
                              }
                            >
                              Disapprove
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : !resultsLoading ? (
              showingQueue ? (
                <EmptyState
                  title="No applications to review"
                  description="New and pending applications show here when clients submit them."
                />
              ) : (
                <EmptyState
                  title="No results found"
                  description="No records match your search criteria. Try adjusting your filters and searching again."
                />
              )
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
    </Grid>
  )
}

export default ProvincialReviewPage
