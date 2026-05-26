import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
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
  approveApplicationReview,
  searchApplicationReviews,
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

const FALLBACK_PRODUCT_TYPE_OPTIONS: SearchOption[] = [
  { value: 'LOG', label: 'Logs' },
  { value: 'LUM', label: 'Lumber' },
]

const FALLBACK_REGION_OPTIONS: RegionOption[] = [
  { id: '11', text: 'Cariboo (11)' },
  { id: '12', text: 'Coast (12)' },
  { id: '24', text: 'Skeena (24)' },
]

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

const ProvincialReviewPage: FC = () => {
  const { capabilities } = useAuth()
  const [filters, setFilters] = useState<ApplicationReviewSearchFilters>(INITIAL_FILTERS)
  const [productTypeOptions, setProductTypeOptions] = useState<SearchOption[]>(
    FALLBACK_PRODUCT_TYPE_OPTIONS,
  )
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>(FALLBACK_REGION_OPTIONS)
  const [selectedRegions, setSelectedRegions] = useState<RegionOption[]>([])
  const [results, setResults] = useState<ApplicationReviewSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sortField, setSortField] = useState<ApplicationReviewSearchSortField>('applicationNumber')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [pageSize, setPageSize] = useState(10)
  const [selectedRowsById, setSelectedRowsById] = useState<Record<string, boolean>>({})
  const [submittingApproval, setSubmittingApproval] = useState(false)
  const [reviewActionStatus, setReviewActionStatus] = useState<ReviewActionStatus | null>(null)
  const canApproveApplications = useMemo(() => {
    return (
      capabilities.roles.includes('APPLICATION_APPROVER') || capabilities.roles.includes('ADMIN')
    )
  }, [capabilities.roles])

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

  const runSearch = useCallback(async (request: ApplicationReviewSearchRequest) => {
    if (
      !isValidIsoDate(request.filters.receivedFromDate) ||
      !isValidIsoDate(request.filters.receivedToDate) ||
      !isValidIsoDate(request.filters.listingFromDate) ||
      !isValidIsoDate(request.filters.listingToDate)
    ) {
      return
    }

    setLoading(true)
    setErrorMessage('')
    try {
      const response = await searchApplicationReviews(request)
      setResults(response)
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to retrieve application review search results.')
      setResults(EMPTY_RESULTS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void runSearch({
      filters: INITIAL_FILTERS,
      page: 0,
      pageSize: 10,
      sortField: 'applicationNumber',
      sortDirection: 'asc',
    })
  }, [runSearch])

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchApplicationReviewOptions()

      if (options.productTypes.length > 0) {
        setProductTypeOptions(options.productTypes)
      }

      if (options.regions.length > 0) {
        setRegionOptions(
          options.regions.map((option) => ({
            id: option.value,
            text: `${option.label} (${option.value})`,
          })),
        )
      }
    }

    void loadOptions()
  }, [])

  const onSearch = () => {
    setSelectedRowsById({})
    setReviewActionStatus(null)
    void runSearch({
      filters,
      page: 0,
      pageSize,
      sortField,
      sortDirection,
    })
  }

  const onHeaderClick = (column: ApplicationReviewSearchSortField) => {
    const nextDirection = sortField === column && sortDirection === 'asc' ? 'desc' : 'asc'
    setSelectedRowsById({})
    setReviewActionStatus(null)
    setSortField(column)
    setSortDirection(nextDirection)
    void runSearch({
      filters,
      page: 0,
      pageSize,
      sortField: column,
      sortDirection: nextDirection,
    })
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
      const approvalResults = await Promise.all(
        selectedNumbers.map(async (applicationNumber) => {
          try {
            const result = await approveApplicationReview(applicationNumber)
            return {
              applicationNumber,
              success: result.updated && result.valid,
              message: result.message,
            }
          } catch (error) {
            console.warn(`Unable to approve application ${applicationNumber}.`, error)
            return {
              applicationNumber,
              success: false,
              message: 'Request failed.',
            }
          }
        }),
      )

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
        filters,
        page: results.page.number,
        pageSize,
        sortField,
        sortDirection,
      })
    } finally {
      setSubmittingApproval(false)
    }
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial Review</h1>
        <p>
          Base review queue parity for <code>applicationsReview</code> migration.
        </p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-grid">
            <TextInput
              id="applicationNumber"
              labelText="Application Number"
              value={filters.applicationNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, applicationNumber: event.target.value }))
              }
            />
            <Select
              id="productTypeCode"
              labelText="Product Type"
              value={filters.productTypeCode}
              onChange={(event) =>
                setFilters((current) => ({ ...current, productTypeCode: event.target.value }))
              }
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
                setSelectedRegions(nextSelected)
                setFilters((current) => ({
                  ...current,
                  region: nextSelected.map((item) => item.id),
                }))
              }}
            />
            <TextInput
              id="receivedFromDate"
              labelText="Received From Date (YYYY-MM-DD)"
              value={filters.receivedFromDate}
              invalid={!isValidIsoDate(filters.receivedFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, receivedFromDate: event.target.value }))
              }
            />
            <TextInput
              id="receivedToDate"
              labelText="Received To Date (YYYY-MM-DD)"
              value={filters.receivedToDate}
              invalid={!isValidIsoDate(filters.receivedToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, receivedToDate: event.target.value }))
              }
            />
            <TextInput
              id="listingFromDate"
              labelText="Listing From Date (YYYY-MM-DD)"
              value={filters.listingFromDate}
              invalid={!isValidIsoDate(filters.listingFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, listingFromDate: event.target.value }))
              }
            />
            <TextInput
              id="listingToDate"
              labelText="Listing To Date (YYYY-MM-DD)"
              value={filters.listingToDate}
              invalid={!isValidIsoDate(filters.listingToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, listingToDate: event.target.value }))
              }
            />
          </div>
          <div className="legacy-search-actions">
            <Button kind="primary" onClick={onSearch} disabled={loading || hasDateValidationError}>
              Search
            </Button>
            <Button
              kind="secondary"
              onClick={() => void onApproveSelectedClick()}
              disabled={
                loading || submittingApproval || selectedRowsCount === 0 || !canApproveApplications
              }
            >
              Approve Selected Applications
            </Button>
          </div>
          {!!reviewActionStatus && (
            <InlineNotification
              className="legacy-inline-notification"
              kind={reviewActionStatus.kind}
              title={
                reviewActionStatus.kind === 'success' ? 'Approval complete' : 'Approval failed'
              }
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
                    <TableCell>{row.applicationNumber}</TableCell>
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
                setSelectedRowsById({})
                setReviewActionStatus(null)
                setPageSize(nextPageSize)
                void runSearch({
                  filters,
                  page: page - 1,
                  pageSize: nextPageSize,
                  sortField,
                  sortDirection,
                })
              }}
            />
          </>
        )}
      </Column>
    </Grid>
  )
}

export default ProvincialReviewPage
