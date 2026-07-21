import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineNotification,
  Modal,
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
import EmptyState from '@/components/EmptyState'
import DisabledButtonTooltip from '@/components/DisabledButtonTooltip'
import PageHeader from '@/components/PageHeader'
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
  type IdTextOption,
} from '@/pages/shared/search-query-utils'
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { isAgentApplicant } from '@/pages/shared/application-form-utils'
import {
  loadSearchWithDeferredTotal,
  prefetchAdjacentSearchPages,
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
import {
  isValidEmail,
  normalizeTrimmedText as normalizeEmail,
  normalizeUpperText as normalizeReviewStatus,
} from '@/utils/text'

type ReviewActionStatus = {
  kind: 'success' | 'error'
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
const REJECT_EMAIL_MISSING_HELPER =
  'No client email was found. Enter an email address or deselect Send status email.'
const REJECT_EMAIL_PREVIEW_HELPER =
  "Defaults from the applicant's Oracle client-location email. Changes apply only to this notification."
const STATUS_EMAIL_UNAVAILABLE_HELPER =
  'Status emails are sent only for rejected or withdrawn applications.'
const EMAIL_NOT_CONFIGURED_MESSAGE =
  'Application status email is not configured yet. No email was sent.'
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
): URLSearchParams =>
  createSearchParams([
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

const ProvincialReviewPage = () => {
  const { capabilities, canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [productTypeOptions, setProductTypeOptions] = useState<SearchOption[]>([])
  const [regionOptions, setRegionOptions] = useState<IdTextOption[]>([])
  const [reviewStatusOptions, setReviewStatusOptions] = useState<SearchOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [results, setResults] = useState<ApplicationReviewSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<Record<string, boolean>>({})
  const [submittingApproval, setSubmittingApproval] = useState(false)
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
  const debouncedUrlState = useDebouncedValue(urlState)
  const filters = urlState.filters
  const sortField = urlState.sortField
  const sortDirection = urlState.sortDirection
  const pageSize = urlState.pageSize
  const clearSelection = useCallback(() => {
    setSelectedRowsById({})
    setReviewActionStatus(null)
  }, [])
  const updateFilter = useCallback(
    <K extends keyof ApplicationReviewSearchFilters>(
      key: K,
      value: ApplicationReviewSearchFilters[K],
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
  const commitResults = useCallback((nextResults: ApplicationReviewSearchResponse) => {
    setResults(nextResults)
  }, [])

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
          prefetchAdjacentSearchPages({
            pageId: 'provincial-review-search',
            principal: capabilities?.principal,
            request,
            response: cachedResults,
            search: searchApplicationReviews,
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
          response: ApplicationReviewSearchResponse,
          totalIsExact: boolean,
        ) => {
          if (pageCacheGeneration !== getPageDataCacheGeneration()) {
            return
          }
          if (totalIsExact) {
            if (!setPageDataCache(pageCacheKey, response, pageCacheGeneration)) {
              return
            }
            setCachedSearchTotal(totalCacheRef.current, totalCacheKey, response.page.totalElements)
            prefetchAdjacentSearchPages({
              pageId: 'provincial-review-search',
              principal: capabilities?.principal,
              request,
              response,
              search: searchApplicationReviews,
              onError: console.error,
            })
          }
          queueMicrotask(() => {
            if (isLatestRequest() && pageCacheGeneration === getPageDataCacheGeneration()) {
              commitResults(response)
            }
          })
        }
        const { response, totalIsExact } = await loadSearchWithDeferredTotal({
          request,
          cachedTotal,
          search: searchApplicationReviews,
          count: countApplicationReviews,
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
          setErrorMessage('Unable to retrieve application review search results.')
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
        APPLICATION_REVIEW_DEFAULT_PAGE_SIZE,
      ),
    )
  }

  const onHeaderClick = (column: ApplicationReviewSearchSortField) => {
    const nextDirection = getNextSortDirection(sortField, sortDirection, column)
    clearSelection()
    setSearchParams(
      buildSearchParams(filters, column, nextDirection, DEFAULT_SEARCH_PAGE, pageSize),
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
    setSendRejectEmail(true)
    setRejectValidationMessage('')
    setLoadingRejectEmail(false)
  }, [])

  const onOpenRejectPanel = useCallback(
    async (applicationNumber: string) => {
      if (!canApproveApplications) {
        setReviewActionStatus({
          kind: 'error',
          message: 'Your account is not authorized to reject applications.',
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
      setSendRejectEmail(true)
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
                : emailResult.message ||
                  'Application status updated, but email could not be queued.',
          })
        } else {
          setReviewActionStatus({
            kind: 'success',
            message: `Updated application ${rejectApplicationNumber} and queued email.`,
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

    setSubmittingApproval(true)
    setReviewActionStatus(null)

    try {
      const approvalResults = []
      for (const applicationNumber of selectedNumbers) {
        try {
          const recordVersion = await fetchCurrentApplicationRecordVersion(applicationNumber)
          const result = await approveApplicationReview(applicationNumber, recordVersion)
          approvalResults.push({
            applicationNumber,
            success: result.updated && result.valid,
            message: result.message,
          })
        } catch (error) {
          console.warn(`Unable to approve application ${applicationNumber}.`, error)
          approvalResults.push({
            applicationNumber,
            success: false,
            message: 'Request failed.',
          })
        }
      }

      const successCount = approvalResults.filter((result) => result.success).length
      const failureCount = approvalResults.length - successCount

      if (failureCount === 0) {
        setReviewActionStatus({
          kind: 'success',
          message: `Approved ${successCount} application(s).`,
        })
      } else {
        setReviewActionStatus({
          kind: 'error',
          message: `Approved ${successCount} application(s); ${failureCount} failed.`,
        })
      }

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
    } finally {
      setSubmittingApproval(false)
    }
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Provincial review"
          subtitle="Review and action provincial applications awaiting a decision."
        />
      </Column>

      {optionsUnavailable && <AuthoritativeOptionsUnavailableNotification />}

      {!!reviewActionStatus && (
        <AppNotification
          kind={reviewActionStatus.kind}
          title={reviewActionStatus.kind === 'success' ? 'Action complete' : 'Action failed'}
          subtitle={reviewActionStatus.message}
          autoDismissMs={reviewActionStatus.kind === 'success' ? 8000 : undefined}
          onCloseButtonClick={() => setReviewActionStatus(null)}
        />
      )}

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters">
          <div className="provincial-review-filters-panel">
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
            <div className="legacy-search-actions">
              <Button
                kind="primary"
                onClick={onSearch}
                disabled={loading || hasDateValidationError}
              >
                Search
              </Button>
              <Button kind="tertiary" onClick={onClearFilters} disabled={loading}>
                Clear Filters
              </Button>
            </div>
          </div>
        </section>
      </Column>

      <Modal
        open={Boolean(rejectApplicationNumber)}
        passiveModal
        size="md"
        modalLabel="Application review"
        modalHeading={`Update application ${rejectApplicationNumber}`}
        aria-label="Application review"
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
              setSendRejectEmail(EMAIL_STATUS_CODES.has(statusCode))
              setRejectValidationMessage('')
            }}
          />
          <TextArea
            id="reviewRejectRemark"
            labelText="Remarks"
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
            labelText="Client email address"
            helperText={
              !rejectStatusSupportsEmail
                ? STATUS_EMAIL_UNAVAILABLE_HELPER
                : loadingRejectEmail
                  ? 'Loading from client account...'
                  : !rejectEmailAddress
                    ? REJECT_EMAIL_MISSING_HELPER
                    : REJECT_EMAIL_PREVIEW_HELPER
            }
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
          <Button kind="secondary" disabled={submittingReject} onClick={closeRejectPanel}>
            Cancel
          </Button>
          <Button
            kind="danger"
            disabled={
              optionsUnavailable || !rejectStatusAvailable || loadingRejectEmail || submittingReject
            }
            onClick={() => void onRejectApplicationClick()}
          >
            {submittingReject ? 'Updating...' : 'Update Application'}
          </Button>
        </div>
      </Modal>

      <Column sm={4} md={8} lg={16}>
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
                  : `${results.page.totalElements} results found`}
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
                kind="secondary"
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
          <SearchResultsTableFrame loading={loading} loadingDescription="Loading review queue...">
            {errorMessage ? (
              <EmptyState
                role="alert"
                title="Review queue unavailable"
                description={errorMessage}
              />
            ) : results.content.length > 0 ? (
              <Table useZebraStyles>
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
                      <TableHeader key={column.id}>
                        {column.sortField ? (
                          <button
                            type="button"
                            className="legacy-sort-button"
                            onClick={() => onHeaderClick(column.sortField!)}
                          >
                            {column.label}
                            {sortField === column.sortField
                              ? ` (${sortDirection.toUpperCase()})`
                              : ''}
                          </button>
                        ) : (
                          column.label
                        )}
                      </TableHeader>
                    ))}
                    <TableHeader>Action</TableHeader>
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
                      <TableCell>{row.volume}</TableCell>
                      <TableCell>{row.speciesEndUse}</TableCell>
                      <TableCell>{row.listingDate}</TableCell>
                      <TableCell>{row.region}</TableCell>
                      <TableCell>
                        <Button
                          kind="ghost"
                          size="sm"
                          disabled={
                            !canApproveApplications ||
                            !isReviewableSourceStatus(row.status) ||
                            optionsUnavailable ||
                            !rejectStatusAvailable ||
                            submittingReject
                          }
                          onClick={() => void onOpenRejectPanel(row.applicationNumber)}
                        >
                          Reject
                        </Button>
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
                onChange={({ page, pageSize: nextPageSize }) => {
                  clearSelection()
                  setSearchParams(
                    buildSearchParams(filters, sortField, sortDirection, page, nextPageSize),
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
