import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
  MultiSelect,
  Pagination,
  Select,
  SelectItem,
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
import type {
  ApplicationReviewSearchFilters,
  ApplicationReviewSearchRequest,
  ApplicationReviewSearchResponse,
  ApplicationReviewSearchSortField,
} from '@/interfaces/ApplicationReviewSearch'
import { useAuth } from '@/context/auth/useAuth'
import {
  parseCsvParam,
  parseEnumParam,
  parsePositiveIntParam,
  parseSortDirectionParam,
  setSearchParam,
} from '@/pages/shared/search-query-utils'
import {
  getVisibleFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  approveApplicationReview,
  sendApplicationReviewStatusEmail,
  searchApplicationReviews,
  updateApplicationReviewStatus,
} from '@/service/application-review-search-service'
import { fetchApplicationReviewOptions, type SearchOption } from '@/service/search-options-service'

type RegionOption = {
  id: string
  text: string
}

type ReviewActionStatus = {
  kind: 'success' | 'error'
  message: string
}

type ReviewStatusField = 'reviewStatusCode' | 'reviewStatusEmail'

const INITIAL_FILTERS: ApplicationReviewSearchFilters = {
  applicationNumber: '',
  productTypeCode: '',
  region: [],
  receivedFromDate: '',
  receivedToDate: '',
  listingFromDate: '',
  listingToDate: '',
}

const EMPTY_RESULTS: ApplicationReviewSearchResponse = {
  content: [],
  page: {
    number: 0,
    size: 10,
    totalElements: 0,
    totalPages: 1,
  },
}

const isValidIsoDate = (value: string): boolean => {
  if (!value.trim()) return true
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)
}

const normalizeReviewStatus = (status: string): string => status.trim().toUpperCase()
const normalizeEmail = (email: string): string => email.trim()
const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

const EMAIL_SUPPORTED_STATUS_CODES = new Set(['REJ', 'WDN'])

const SORT_COLUMNS: {
  id: ApplicationReviewSearchSortField
  label: string
}[] = [
  { id: 'applicationNumber', label: 'Application' },
  { id: 'volume', label: 'Volume (m³)' },
  { id: 'speciesEndUse', label: 'Species / End Use' },
  { id: 'listingDate', label: 'Listing Date' },
  { id: 'status', label: 'Status' },
  { id: 'region', label: 'Region' },
]

const DEFAULT_SORT_FIELD: ApplicationReviewSearchSortField = 'applicationNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'asc'
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 20, 30] as const
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ApplicationReviewSearchSortField[]

const buildSearchParams = (
  filters: ApplicationReviewSearchFilters,
  sortField: ApplicationReviewSearchSortField,
  sortDirection: 'asc' | 'desc',
  page: number,
  pageSize: number,
): URLSearchParams => {
  const params = new URLSearchParams()

  setSearchParam(params, 'applicationNumber', filters.applicationNumber)
  setSearchParam(params, 'productTypeCode', filters.productTypeCode)
  setSearchParam(params, 'region', filters.region)
  setSearchParam(params, 'receivedFromDate', filters.receivedFromDate)
  setSearchParam(params, 'receivedToDate', filters.receivedToDate)
  setSearchParam(params, 'listingFromDate', filters.listingFromDate)
  setSearchParam(params, 'listingToDate', filters.listingToDate)
  setSearchParam(params, 'sortField', sortField)
  setSearchParam(params, 'sortDirection', sortDirection)
  setSearchParam(params, 'page', page)
  setSearchParam(params, 'pageSize', pageSize)

  return params
}

const mapSelectedRegions = (regionIds: string[], regionOptions: RegionOption[]): RegionOption[] => {
  const optionMap = new Map(regionOptions.map((option) => [option.id, option]))
  return regionIds.map((regionId) => optionMap.get(regionId) ?? { id: regionId, text: regionId })
}

const ProvincialReviewPage: FC = () => {
  const { canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [productTypeOptions, setProductTypeOptions] = useState<SearchOption[]>([])
  const [reviewStatusOptions, setReviewStatusOptions] = useState<SearchOption[]>([])
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([])
  const [results, setResults] = useState<ApplicationReviewSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<Record<string, boolean>>({})
  const [submittingApproval, setSubmittingApproval] = useState(false)
  const [submittingStatusUpdate, setSubmittingStatusUpdate] = useState(false)
  const [selectedStatusCode, setSelectedStatusCode] = useState('')
  const [statusRemark, setStatusRemark] = useState('')
  const [statusEmailAddress, setStatusEmailAddress] = useState('')
  const [reviewActionStatus, setReviewActionStatus] = useState<ReviewActionStatus | null>(null)
  const [touchedStatusFields, setTouchedStatusFields] = useState<TouchedFields<ReviewStatusField>>(
    {},
  )
  const [showStatusValidationErrors, setShowStatusValidationErrors] = useState(false)
  const canApproveApplications = canPerform('/applicationsReview')
  const canOpenApplicationDetails =
    canPerform('/applicationSearch') && canPerform('/applicationDetails')
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
    [searchParams],
  )
  const normalizedStatusCode = useMemo(
    () => normalizeReviewStatus(selectedStatusCode),
    [selectedStatusCode],
  )
  const canSendStatusEmail = EMAIL_SUPPORTED_STATUS_CODES.has(normalizedStatusCode)
  const statusFieldErrors = useMemo<FieldErrors<ReviewStatusField>>(
    () => ({
      reviewStatusCode: requiredFieldError(selectedStatusCode, 'Update status code') ?? undefined,
      reviewStatusEmail:
        statusEmailAddress.trim() && !isValidEmail(statusEmailAddress)
          ? 'Enter a valid email address.'
          : undefined,
    }),
    [selectedStatusCode, statusEmailAddress],
  )

  const markStatusFieldTouched = (field: ReviewStatusField): void => {
    setTouchedStatusFields((current) => ({ ...current, [field]: true }))
  }

  const statusFieldError = (field: ReviewStatusField): string | undefined =>
    getVisibleFieldError(field, statusFieldErrors, touchedStatusFields, showStatusValidationErrors)

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
    const parsedPageSize = parsePositiveIntParam(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE)

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
      page: parsePositiveIntParam(searchParams.get('page'), DEFAULT_PAGE),
      pageSize: PAGE_SIZE_OPTIONS.includes(parsedPageSize as (typeof PAGE_SIZE_OPTIONS)[number])
        ? parsedPageSize
        : DEFAULT_PAGE_SIZE,
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
        buildSearchParams(nextFilters, sortField, sortDirection, DEFAULT_PAGE, pageSize),
        { replace: true },
      )
    },
    [clearSelection, filters, pageSize, setSearchParams, sortDirection, sortField],
  )

  const selectedRegions = useMemo(
    () => mapSelectedRegions(filters.region, regionOptions),
    [filters.region, regionOptions],
  )

  const hasDateValidationError = useMemo(() => {
    return (
      !isValidIsoDate(filters.receivedFromDate) ||
      !isValidIsoDate(filters.receivedToDate) ||
      !isValidIsoDate(filters.listingFromDate) ||
      !isValidIsoDate(filters.listingToDate)
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
    async (request: ApplicationReviewSearchRequest) => {
      const isLatestRequest = beginSearchRequest()
      if (
        !isValidIsoDate(request.filters.receivedFromDate) ||
        !isValidIsoDate(request.filters.receivedToDate) ||
        !isValidIsoDate(request.filters.listingFromDate) ||
        !isValidIsoDate(request.filters.listingToDate)
      ) {
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      try {
        const response = await searchApplicationReviews(request)
        if (isLatestRequest()) {
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
    [beginSearchRequest],
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
      setReviewStatusOptions(options.reviewStatuses)
      setRegionOptions(
        options.regions.map((option) => ({
          id: option.value,
          text: `${option.label} (${option.value})`,
        })),
      )
    }

    void loadOptions()
  }, [])

  const onSearch = () => {
    clearSelection()
    setSearchParams(buildSearchParams(filters, sortField, sortDirection, DEFAULT_PAGE, pageSize))
  }

  const onClearFilters = () => {
    clearSelection()
    setSearchParams(
      buildSearchParams(
        INITIAL_FILTERS,
        DEFAULT_SORT_FIELD,
        DEFAULT_SORT_DIRECTION,
        DEFAULT_PAGE,
        DEFAULT_PAGE_SIZE,
      ),
    )
  }

  const onHeaderClick = (column: ApplicationReviewSearchSortField) => {
    const nextDirection = sortField === column && sortDirection === 'asc' ? 'desc' : 'asc'
    clearSelection()
    setSearchParams(buildSearchParams(filters, column, nextDirection, DEFAULT_PAGE, pageSize))
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
      await runSearch({
        filters: urlState.filters,
        page: urlState.page - 1,
        pageSize: urlState.pageSize,
        sortField: urlState.sortField,
        sortDirection: urlState.sortDirection,
      })
    } finally {
      setSubmittingApproval(false)
    }
  }

  const onUpdateSelectedStatusClick = async (sendEmail: boolean) => {
    if (!canApproveApplications) {
      setReviewActionStatus({
        kind: 'error',
        message: 'Your account is not authorized to update application status.',
      })
      return
    }

    const selectedNumbers = Object.keys(selectedRowsById)
    if (selectedNumbers.length === 0) {
      setReviewActionStatus({
        kind: 'error',
        message: 'Select at least one NEW application before updating status.',
      })
      return
    }

    if (!normalizedStatusCode) {
      setShowStatusValidationErrors(true)
      setReviewActionStatus({
        kind: 'error',
        message: 'Select a review status before updating.',
      })
      return
    }

    const normalizedEmail = normalizeEmail(statusEmailAddress)
    if (sendEmail) {
      if (!canSendStatusEmail) {
        setReviewActionStatus({
          kind: 'error',
          message: 'Status email is only supported for REJ and WDN.',
        })
        return
      }

      if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
        setShowStatusValidationErrors(true)
        setReviewActionStatus({
          kind: 'error',
          message: 'Enter a valid client email address before sending status email.',
        })
        return
      }
    }

    setSubmittingStatusUpdate(true)
    setReviewActionStatus(null)

    try {
      const updateResults = []
      for (const applicationNumber of selectedNumbers) {
        try {
          const updateResponse = await updateApplicationReviewStatus(applicationNumber, {
            statusCode: normalizedStatusCode,
            remark: statusRemark,
            clientEmailAddress: normalizedEmail,
          })

          const updateSuccess = updateResponse.updated && updateResponse.valid
          let emailSuccess = true
          let emailMessage = ''

          if (sendEmail && updateSuccess) {
            const emailResponse = await sendApplicationReviewStatusEmail(applicationNumber, {
              statusCode: normalizedStatusCode,
              remark: statusRemark,
              clientEmailAddress: normalizedEmail,
            })
            emailSuccess = emailResponse.success
            emailMessage = emailResponse.message
          }

          updateResults.push({
            success: updateSuccess && emailSuccess,
            updateSuccess,
            emailSuccess,
            message: emailMessage || updateResponse.message,
          })
        } catch (error) {
          console.warn(`Unable to update status for application ${applicationNumber}.`, error)
          updateResults.push({
            success: false,
            updateSuccess: false,
            emailSuccess: !sendEmail,
            message: 'Request failed.',
          })
        }
      }

      const successCount = updateResults.filter((result) => result.success).length
      const failureCount = updateResults.length - successCount
      const emailFailureCount = sendEmail
        ? updateResults.filter((result) => !result.emailSuccess).length
        : 0

      if (failureCount === 0) {
        setReviewActionStatus({
          kind: 'success',
          message: sendEmail
            ? `Updated status and sent email for ${successCount} application(s).`
            : `Updated status for ${successCount} application(s).`,
        })
      } else {
        const emailFailureSuffix =
          sendEmail && emailFailureCount > 0 ? ` ${emailFailureCount} email(s) failed.` : ''
        setReviewActionStatus({
          kind: 'error',
          message: sendEmail
            ? `Updated and emailed ${successCount} application(s); ${failureCount} failed.${emailFailureSuffix}`
            : `Updated ${successCount} application(s); ${failureCount} failed.`,
        })
      }

      setSelectedRowsById({})
      await runSearch({
        filters: urlState.filters,
        page: urlState.page - 1,
        pageSize: urlState.pageSize,
        sortField: urlState.sortField,
        sortDirection: urlState.sortDirection,
      })
    } finally {
      setSubmittingStatusUpdate(false)
    }
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial Review</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-grid">
            <TextInput
              id="applicationNumber"
              labelText="Application Number"
              value={filters.applicationNumber}
              onChange={(event) => updateFilter('applicationNumber', event.target.value)}
            />
            <Select
              id="productTypeCode"
              labelText="Product Type"
              value={filters.productTypeCode}
              onChange={(event) => updateFilter('productTypeCode', event.target.value)}
            >
              <SelectItem text="All product types" value="" />
              {productTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} text={option.label} />
              ))}
            </Select>
            <MultiSelect
              id="region"
              titleText="Region"
              items={regionOptions}
              itemToString={(item) => (item ? item.text : '')}
              label="Select region(s)"
              selectionFeedback="fixed"
              selectedItems={selectedRegions}
              onChange={(event) => {
                const nextSelected = (event.selectedItems ?? []) as RegionOption[]
                updateFilter(
                  'region',
                  nextSelected.map((item) => item.id),
                )
              }}
            />
            <TextInput
              id="receivedFromDate"
              labelText="Received From Date (YYYY-MM-DD)"
              value={filters.receivedFromDate}
              invalid={!isValidIsoDate(filters.receivedFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) => updateFilter('receivedFromDate', event.target.value)}
            />
            <TextInput
              id="receivedToDate"
              labelText="Received To Date (YYYY-MM-DD)"
              value={filters.receivedToDate}
              invalid={!isValidIsoDate(filters.receivedToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) => updateFilter('receivedToDate', event.target.value)}
            />
            <TextInput
              id="listingFromDate"
              labelText="Listing From Date (YYYY-MM-DD)"
              value={filters.listingFromDate}
              invalid={!isValidIsoDate(filters.listingFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) => updateFilter('listingFromDate', event.target.value)}
            />
            <TextInput
              id="listingToDate"
              labelText="Listing To Date (YYYY-MM-DD)"
              value={filters.listingToDate}
              invalid={!isValidIsoDate(filters.listingToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) => updateFilter('listingToDate', event.target.value)}
            />
          </div>
          <div className="legacy-search-actions">
            <Button kind="primary" onClick={onSearch} disabled={loading || hasDateValidationError}>
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
                submittingStatusUpdate ||
                selectedRowsCount === 0 ||
                !canApproveApplications
              }
            >
              Approve Selected Applications
            </Button>
          </div>
          <div className="legacy-search-grid">
            <Select
              id="reviewStatusCode"
              labelText="Update Status Code"
              value={selectedStatusCode}
              onChange={(event) => {
                setReviewActionStatus(null)
                setShowStatusValidationErrors(false)
                setSelectedStatusCode(event.target.value)
              }}
              invalid={!!statusFieldError('reviewStatusCode')}
              invalidText={statusFieldError('reviewStatusCode')}
              onBlur={() => markStatusFieldTouched('reviewStatusCode')}
            >
              <SelectItem value="" text="Select status" />
              {reviewStatusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} text={option.label} />
              ))}
            </Select>
            <TextInput
              id="reviewStatusEmail"
              labelText="Client Email Address (required for status email)"
              value={statusEmailAddress}
              invalid={
                !!statusFieldError('reviewStatusEmail') ||
                (Boolean(statusEmailAddress) && !isValidEmail(statusEmailAddress))
              }
              invalidText={statusFieldError('reviewStatusEmail') ?? 'Enter a valid email address.'}
              onBlur={() => markStatusFieldTouched('reviewStatusEmail')}
              onChange={(event) => {
                setReviewActionStatus(null)
                setStatusEmailAddress(event.target.value)
              }}
            />
          </div>
          <div className="legacy-search-actions">
            <Button
              kind="tertiary"
              onClick={() => void onUpdateSelectedStatusClick(false)}
              disabled={
                loading ||
                submittingApproval ||
                submittingStatusUpdate ||
                selectedRowsCount === 0 ||
                !canApproveApplications
              }
            >
              Update Selected Status
            </Button>
            <Button
              kind="tertiary"
              onClick={() => void onUpdateSelectedStatusClick(true)}
              disabled={
                loading ||
                submittingApproval ||
                submittingStatusUpdate ||
                selectedRowsCount === 0 ||
                !canApproveApplications
              }
            >
              Update Status and Send Email
            </Button>
          </div>
          <div className="legacy-search-actions">
            <TextArea
              id="reviewStatusRemark"
              labelText="Status Remark"
              value={statusRemark}
              onChange={(event) => {
                setReviewActionStatus(null)
                setStatusRemark(event.target.value)
              }}
            />
          </div>
          {!!reviewActionStatus && (
            <InlineNotification
              className="legacy-inline-notification"
              kind={reviewActionStatus.kind}
              title={reviewActionStatus.kind === 'success' ? 'Action complete' : 'Action failed'}
              subtitle={reviewActionStatus.message}
              onCloseButtonClick={() => setReviewActionStatus(null)}
            />
          )}
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <h2 className="dashboard-title">Review Queue</h2>
        {loading && <InlineLoading description="Loading review queue..." />}
        {!!errorMessage && <p className="legacy-search-error">{errorMessage}</p>}
        {!loading && (
          <>
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
                  </TableRow>
                ))}
                {results.content.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      No review records found for the selected criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <Pagination
              page={results.page.number + 1}
              pageSize={results.page.size}
              pageSizes={[10, 20, 30]}
              totalItems={results.page.totalElements}
              onChange={({ page, pageSize: nextPageSize }) => {
                clearSelection()
                setSearchParams(
                  buildSearchParams(filters, sortField, sortDirection, page, nextPageSize),
                )
              }}
            />
          </>
        )}
      </Column>
    </Grid>
  )
}

export default ProvincialReviewPage
