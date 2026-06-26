import { useCallback, useEffect, useMemo, useState } from 'react'
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
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import { AppNotification } from '../../components/AppNotification'
import SearchableSelect from '../../components/SearchableSelect'
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
  setPageDataCache,
} from '@/pages/shared/page-data-cache'
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
import { isAgentApplicant } from '@/pages/shared/application-form-utils'
import {
  approveApplicationReview,
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

const EMPTY_RESULTS = createEmptyPagedSearchResponse<ApplicationReviewSearchResponse>()

const SORT_COLUMNS: {
  id: ApplicationReviewSearchSortField
  label: string
}[] = [
  { id: 'applicationNumber', label: 'Application' },
  { id: 'volume', label: 'Volume (m³)' },
  { id: 'speciesEndUse', label: 'Species / end use' },
  { id: 'listingDate', label: 'Listing date' },
  { id: 'status', label: 'Status' },
  { id: 'region', label: 'Region' },
]

const DEFAULT_SORT_FIELD: ApplicationReviewSearchSortField = 'applicationNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc'
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ApplicationReviewSearchSortField[]
const REJECT_STATUS_CODE = 'REJ'
const REJECT_REMARK_REQUIRED_MESSAGE = 'Rejection remark is required.'
const REJECT_EMAIL_REQUIRED_MESSAGE = 'Enter a valid client email address before rejecting.'
const EMAIL_NOT_CONFIGURED_MESSAGE =
  'Application status email is not configured yet. No email was sent.'

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

  return ownerEmail || agentEmail
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
  const [results, setResults] = useState<ApplicationReviewSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<Record<string, boolean>>({})
  const [submittingApproval, setSubmittingApproval] = useState(false)
  const [rejectApplicationNumber, setRejectApplicationNumber] = useState('')
  const [rejectEmailAddress, setRejectEmailAddress] = useState('')
  const [rejectRemark, setRejectRemark] = useState('')
  const [rejectValidationMessage, setRejectValidationMessage] = useState('')
  const [loadingRejectEmail, setLoadingRejectEmail] = useState(false)
  const [submittingReject, setSubmittingReject] = useState(false)
  const [reviewActionStatus, setReviewActionStatus] = useState<ReviewActionStatus | null>(null)
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
  const selectedRegionHelperText =
    selectedRegions.length > 0
      ? `Selected: ${selectedRegions.map((region) => region.text).join(', ')}`
      : undefined

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
    return results.content.filter((row) => normalizeReviewStatus(row.status) === 'NEW')
  }, [canApproveApplications, results.content])

  const selectedRowsCount = useMemo(() => {
    return Object.keys(selectedRowsById).length
  }, [selectedRowsById])

  const allSelectableRowsAreSelected = useMemo(() => {
    if (selectableRows.length === 0) {
      return false
    }
    return selectableRows.every((row) => Boolean(selectedRowsById[row.applicationNumber]))
  }, [selectableRows, selectedRowsById])

  const beginSearchRequest = useLatestRequestGuard()

  const runSearch = useCallback(
    async (request: ApplicationReviewSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheKey = buildPageDataCacheKey(
        'provincial-review-search',
        capabilities?.principal,
        request,
      )
      if (!options.force) {
        const cachedResults = getPageDataCache<ApplicationReviewSearchResponse>(pageCacheKey)
        if (cachedResults) {
          setResults(cachedResults)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      const isLatestRequest = beginSearchRequest()
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
        const response = await searchApplicationReviews(request)
        if (isLatestRequest()) {
          setPageDataCache(pageCacheKey, response)
          setResults(response)
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
      const options = await fetchApplicationReviewOptions()

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
    setRejectEmailAddress('')
    setRejectRemark('')
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

      setReviewActionStatus(null)
      setRejectApplicationNumber(applicationNumber)
      setRejectEmailAddress('')
      setRejectRemark('')
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
        if (!candidateEmail) {
          setRejectValidationMessage(
            'No client email was found for this application. Enter one before rejecting.',
          )
        }
      } catch (error) {
        console.error(error)
        setRejectValidationMessage('Unable to load client email for this application.')
      } finally {
        setLoadingRejectEmail(false)
      }
    },
    [canApproveApplications],
  )

  const onRejectApplicationClick = async () => {
    if (!canApproveApplications || !rejectApplicationNumber) {
      return
    }

    const clientEmailAddress = normalizeReviewEmail(rejectEmailAddress)
    const remark = rejectRemark.trim()
    if (!remark) {
      setRejectValidationMessage(REJECT_REMARK_REQUIRED_MESSAGE)
      return
    }
    if (!clientEmailAddress || !isValidEmail(clientEmailAddress)) {
      setRejectValidationMessage(REJECT_EMAIL_REQUIRED_MESSAGE)
      return
    }

    const payload = {
      statusCode: REJECT_STATUS_CODE,
      remark,
      clientEmailAddress,
    }

    setSubmittingReject(true)
    setReviewActionStatus(null)
    setRejectValidationMessage('')

    try {
      const updateResult = await updateApplicationReviewStatus(rejectApplicationNumber, payload)
      if (!updateResult.valid || !updateResult.updated) {
        setReviewActionStatus({
          kind: 'error',
          message: updateResult.message || 'Unable to reject application.',
        })
        return
      }

      const emailResult = await sendApplicationReviewStatusEmail(rejectApplicationNumber, payload)
      if (!emailResult.success) {
        setReviewActionStatus({
          kind: 'error',
          message:
            emailResult.message === EMAIL_NOT_CONFIGURED_MESSAGE
              ? 'Application rejected, but status email is not configured yet.'
              : emailResult.message || 'Application rejected, but email failed.',
        })
      } else {
        setReviewActionStatus({
          kind: 'success',
          message: `Rejected application ${rejectApplicationNumber} and sent email.`,
        })
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
        message: 'Unable to reject application.',
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

    const selectedNumbers = Object.keys(selectedRowsById)
    if (selectedNumbers.length === 0) {
      setReviewActionStatus({
        kind: 'error',
        message: 'Select at least one NEW application before approving.',
      })
      return
    }

    setSubmittingApproval(true)
    setReviewActionStatus(null)

    try {
      const approvalResults = []
      for (const applicationNumber of selectedNumbers) {
        try {
          const result = await approveApplicationReview(applicationNumber)
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
        <h1>Provincial review</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters">
          <Tile>
            <div className="legacy-search-grid">
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
              <IsoDatePicker
                id="receivedFromDate"
                labelText="Received from date (YYYY-MM-DD)"
                value={filters.receivedFromDate}
                invalid={!isValidIsoDate(filters.receivedFromDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('receivedFromDate', value)}
              />
              <IsoDatePicker
                id="receivedToDate"
                labelText="Received to date (YYYY-MM-DD)"
                value={filters.receivedToDate}
                invalid={!isValidIsoDate(filters.receivedToDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('receivedToDate', value)}
              />
              <IsoDatePicker
                id="listingFromDate"
                labelText="Listing from date (YYYY-MM-DD)"
                value={filters.listingFromDate}
                invalid={!isValidIsoDate(filters.listingFromDate)}
                invalidText="Date must be YYYY-MM-DD"
                onChange={(value) => updateFilter('listingFromDate', value)}
              />
              <IsoDatePicker
                id="listingToDate"
                labelText="Listing to date (YYYY-MM-DD)"
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
            </div>
            {!!reviewActionStatus && (
              <AppNotification
                className="legacy-inline-notification"
                kind={reviewActionStatus.kind}
                title={reviewActionStatus.kind === 'success' ? 'Action complete' : 'Action failed'}
                subtitle={reviewActionStatus.message}
                autoDismissMs={reviewActionStatus.kind === 'success' ? 8000 : undefined}
                onCloseButtonClick={() => setReviewActionStatus(null)}
              />
            )}
            {!!rejectApplicationNumber && (
              <section className="legacy-search-section review-reject-panel">
                <h2 className="dashboard-title">Reject application {rejectApplicationNumber}</h2>
                <div className="legacy-search-grid">
                  <TextInput
                    id="reviewRejectEmail"
                    labelText="Client email address"
                    helperText={
                      loadingRejectEmail
                        ? 'Loading from client account...'
                        : 'Loaded from client account; edit if required.'
                    }
                    value={rejectEmailAddress}
                    invalid={rejectValidationMessage === REJECT_EMAIL_REQUIRED_MESSAGE}
                    invalidText={rejectValidationMessage}
                    disabled={loadingRejectEmail || submittingReject}
                    onChange={(event) => {
                      setRejectEmailAddress(event.target.value)
                      setRejectValidationMessage('')
                    }}
                  />
                  <TextArea
                    id="reviewRejectRemark"
                    labelText="Rejection remark"
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
                </div>
                {!!rejectValidationMessage &&
                  rejectValidationMessage !== REJECT_EMAIL_REQUIRED_MESSAGE &&
                  rejectValidationMessage !== REJECT_REMARK_REQUIRED_MESSAGE && (
                    <AppNotification
                      className="legacy-inline-notification"
                      kind="error"
                      title="Reject validation"
                      subtitle={rejectValidationMessage}
                      lowContrast
                      onCloseButtonClick={() => setRejectValidationMessage('')}
                    />
                  )}
                <div className="legacy-search-actions">
                  <Button
                    kind="danger"
                    size="sm"
                    disabled={loadingRejectEmail || submittingReject}
                    onClick={() => void onRejectApplicationClick()}
                  >
                    Reject Application
                  </Button>
                  <Button
                    kind="tertiary"
                    size="sm"
                    disabled={submittingReject}
                    onClick={closeRejectPanel}
                  >
                    Cancel
                  </Button>
                </div>
              </section>
            )}
          </Tile>
        </section>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--results">
          <h2 className="dashboard-title">Review queue</h2>
          {!!errorMessage && <p className="legacy-search-error">{errorMessage}</p>}
          <SearchResultsTableFrame
            loading={loading}
            loadingDescription="Loading review queue..."
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
                      disabled={selectableRows.length === 0 || !canApproveApplications}
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
                  <TableHeader>Action</TableHeader>
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
                        disabled={
                          !canApproveApplications || normalizeReviewStatus(row.status) !== 'NEW'
                        }
                        onChange={(_, payload) =>
                          toggleRowSelection(row.applicationNumber, Boolean(payload.checked))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {canOpenApplicationDetails ? (
                        <Link
                          className="cds--link"
                          to={withCurrentSearch(`/provincial/application/${row.applicationNumber}`)}
                        >
                          {row.applicationNumber}
                        </Link>
                      ) : (
                        row.applicationNumber
                      )}
                    </TableCell>
                    <TableCell>{row.volume}</TableCell>
                    <TableCell>{row.speciesEndUse}</TableCell>
                    <TableCell>{row.listingDate}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.region}</TableCell>
                    <TableCell>
                      <Button
                        kind="ghost"
                        size="sm"
                        disabled={
                          !canApproveApplications ||
                          normalizeReviewStatus(row.status) !== 'NEW' ||
                          submittingReject
                        }
                        onClick={() => void onOpenRejectPanel(row.applicationNumber)}
                      >
                        Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {results.content.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      No review records found for the selected criteria.
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

export default ProvincialReviewPage
