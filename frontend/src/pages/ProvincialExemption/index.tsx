import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Link } from 'react-router-dom'
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
  ProvincialExemptionSearchFilters,
  ProvincialExemptionSearchItem,
  ProvincialExemptionSearchRequest,
  ProvincialExemptionSearchResponse,
  ProvincialExemptionSearchSortField,
} from '@/interfaces/ProvincialExemptionSearch'
import { searchProvincialExemptions } from '@/service/provincial-exemption-search-service'
import {
  fetchProvincialExemptionOptions,
  type SearchOption,
} from '@/service/search-options-service'

type RegionOption = {
  id: string
  text: string
}

type ApprovalStatus = {
  kind: 'error' | 'success'
  message: string
}

const FALLBACK_REGION_OPTIONS: RegionOption[] = [
  { id: 'CAR', text: 'Cariboo (CAR)' },
  { id: 'KAM', text: 'Kamloops (KAM)' },
  { id: 'NEL', text: 'Northeast (NEL)' },
  { id: 'OMI', text: 'Omineca (OMI)' },
  { id: 'SKE', text: 'Skeena (SKE)' },
]

const FALLBACK_EXEMPTION_TYPE_OPTIONS: SearchOption[] = [
  { value: 'SECTION_1', label: 'Section 1' },
  { value: 'SECTION_2', label: 'Section 2' },
  { value: 'SECTION_3', label: 'Section 3' },
]

const FALLBACK_EXEMPTION_STATUS_OPTIONS: SearchOption[] = [
  { value: 'NEW', label: 'New' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const INITIAL_FILTERS: ProvincialExemptionSearchFilters = {
  applicationNumber: '',
  packageNumber: '',
  exemptionNumber: '',
  region: [],
  listFromDate: '',
  listToDate: '',
  exemptionTypeCode: '',
  exemptionStatusCode: '',
  applicantClientNumber: '',
  ownerClientNumber: '',
}

const EMPTY_RESULTS: ProvincialExemptionSearchResponse = {
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

const SORT_COLUMNS: {
  id: ProvincialExemptionSearchSortField
  label: string
}[] = [
  { id: 'exemptionNumber', label: 'Exemption' },
  { id: 'type', label: 'Type' },
  { id: 'status', label: 'Status' },
  { id: 'applicantClientNumber', label: 'Applicant Client Nbr' },
  { id: 'ownerClientNumber', label: 'Owner Client Nbr' },
  { id: 'approvedVolume', label: 'Approved Vol (m³)' },
  { id: 'balanceRemaining', label: 'Bal Remaining (m³)' },
  { id: 'listingDate', label: 'Listing Date' },
  { id: 'expiryDate', label: 'Expiry Date' },
  { id: 'region', label: 'Region' },
]

const ProvincialExemptionPage: FC = () => {
  const [filters, setFilters] = useState<ProvincialExemptionSearchFilters>(INITIAL_FILTERS)
  const [selectedRegions, setSelectedRegions] = useState<RegionOption[]>([])
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>(FALLBACK_REGION_OPTIONS)
  const [exemptionTypeOptions, setExemptionTypeOptions] = useState<SearchOption[]>(
    FALLBACK_EXEMPTION_TYPE_OPTIONS,
  )
  const [exemptionStatusOptions, setExemptionStatusOptions] = useState<SearchOption[]>(
    FALLBACK_EXEMPTION_STATUS_OPTIONS,
  )
  const [results, setResults] = useState<ProvincialExemptionSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sortField, setSortField] = useState<ProvincialExemptionSearchSortField>('exemptionNumber')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [pageSize, setPageSize] = useState(10)
  const [selectedRowsById, setSelectedRowsById] = useState<
    Record<string, ProvincialExemptionSearchItem>
  >({})
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null)

  const hasDateValidationError = useMemo(() => {
    return !isValidIsoDate(filters.listFromDate) || !isValidIsoDate(filters.listToDate)
  }, [filters.listFromDate, filters.listToDate])

  const runSearch = useCallback(async (request: ProvincialExemptionSearchRequest) => {
    if (
      !isValidIsoDate(request.filters.listFromDate) ||
      !isValidIsoDate(request.filters.listToDate)
    ) {
      return
    }

    setLoading(true)
    setErrorMessage('')
    try {
      const response = await searchProvincialExemptions(request)
      setResults(response)
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to retrieve exemption search results.')
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
      sortField: 'exemptionNumber',
      sortDirection: 'asc',
    })
  }, [runSearch])

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialExemptionOptions()

      if (options.exemptionTypes.length > 0) {
        setExemptionTypeOptions(options.exemptionTypes)
      }
      if (options.exemptionStatuses.length > 0) {
        setExemptionStatusOptions(options.exemptionStatuses)
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
    setApprovalStatus(null)
    void runSearch({
      filters,
      page: 0,
      pageSize,
      sortField,
      sortDirection,
    })
  }

  const onHeaderClick = (column: ProvincialExemptionSearchSortField) => {
    const nextDirection = sortField === column && sortDirection === 'asc' ? 'desc' : 'asc'
    setSelectedRowsById({})
    setApprovalStatus(null)
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

  const selectableRows = useMemo(() => {
    return results.content.filter(
      (item) => item.canApprove && item.statusCode === 'NEW' && !item.isLocked,
    )
  }, [results.content])

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
    const selectedRows = Object.values(selectedRowsById)
    if (selectedRows.length === 0) {
      setApprovalStatus({
        kind: 'error',
        message: 'Select at least one new exemption before approving.',
      })
      return
    }

    setApprovalStatus({
      kind: 'success',
      message: `Ready to approve ${selectedRows.length} selected exemption(s).`,
    })
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial Exemption Search</h1>
        <p>
          Migrated from <code>src/main/webapp/WEB-INF/jsp/provincial/exemption/search.jsp</code> and{' '}
          <code>src/main/webapp/javascript/provincial/exemption/search.js</code>.
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
            <TextInput
              id="packageNumber"
              labelText="Package Number"
              value={filters.packageNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, packageNumber: event.target.value }))
              }
            />
            <TextInput
              id="exemptionNumber"
              labelText="Exemption Number"
              value={filters.exemptionNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, exemptionNumber: event.target.value }))
              }
            />
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
              id="listFromDate"
              labelText="List From Date (YYYY-MM-DD)"
              value={filters.listFromDate}
              invalid={!isValidIsoDate(filters.listFromDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, listFromDate: event.target.value }))
              }
            />
            <TextInput
              id="listToDate"
              labelText="List To Date (YYYY-MM-DD)"
              value={filters.listToDate}
              invalid={!isValidIsoDate(filters.listToDate)}
              invalidText="Date must be YYYY-MM-DD"
              onChange={(event) =>
                setFilters((current) => ({ ...current, listToDate: event.target.value }))
              }
            />
            <Select
              id="exemptionTypeCode"
              labelText="Exemption Type"
              value={filters.exemptionTypeCode}
              onChange={(event) =>
                setFilters((current) => ({ ...current, exemptionTypeCode: event.target.value }))
              }
            >
              <SelectItem text="All types" value="" />
              {exemptionTypeOptions.map((option) => (
                <SelectItem key={option.value || 'all'} text={option.label} value={option.value} />
              ))}
            </Select>
            <Select
              id="exemptionStatusCode"
              labelText="Exemption Status"
              value={filters.exemptionStatusCode}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  exemptionStatusCode: event.target.value,
                }))
              }
            >
              <SelectItem text="All statuses" value="" />
              {exemptionStatusOptions.map((option) => (
                <SelectItem key={option.value || 'all'} text={option.label} value={option.value} />
              ))}
            </Select>
            <TextInput
              id="applicantClientNumber"
              labelText="Applicant Client Number"
              value={filters.applicantClientNumber}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  applicantClientNumber: event.target.value,
                }))
              }
            />
            <TextInput
              id="ownerClientNumber"
              labelText="Owner Client Number"
              value={filters.ownerClientNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, ownerClientNumber: event.target.value }))
              }
            />
          </div>
          <div className="legacy-search-actions">
            <Button
              kind="primary"
              onClick={onSearch}
              disabled={loading || hasDateValidationError}
              size="md"
            >
              Search
            </Button>
            <Button
              kind="secondary"
              size="md"
              onClick={onApproveSelectedClick}
              disabled={Object.keys(selectedRowsById).length === 0}
            >
              Approve Selected Exemption
            </Button>
            <Link className="cds--link" to="/provincial/exemption/create">
              Add Exemption
            </Link>
          </div>
          {approvalStatus && (
            <InlineNotification
              className="legacy-inline-notification"
              kind={approvalStatus.kind}
              title={approvalStatus.kind === 'error' ? 'Validation failed' : 'Selection ready'}
              subtitle={approvalStatus.message}
              onCloseButtonClick={() => setApprovalStatus(null)}
            />
          )}
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <h2 className="dashboard-title">Search Results</h2>
        {loading && <InlineLoading description="Loading exemption search results..." />}
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
                {results.content.map((row) => {
                  const canSelectRow = row.canApprove && row.statusCode === 'NEW' && !row.isLocked
                  return (
                    <TableRow key={row.exemptionNumber}>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
                        {row.canViewExemption ? (
                          <Link
                            className="cds--link"
                            to={`/provincial/exemption/${row.exemptionNumber}`}
                          >
                            {row.exemptionNumber}
                          </Link>
                        ) : (
                          row.exemptionNumber
                        )}
                      </TableCell>
                      <TableCell>{row.type}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>{row.applicantClientNumber || '-'}</TableCell>
                      <TableCell>{row.ownerClientNumber}</TableCell>
                      <TableCell>{row.approvedVolume}</TableCell>
                      <TableCell>{row.balanceRemaining}</TableCell>
                      <TableCell>{row.listingDate}</TableCell>
                      <TableCell>{row.expiryDate}</TableCell>
                      <TableCell>{row.region}</TableCell>
                    </TableRow>
                  )
                })}
                {results.content.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11}>
                      No exemptions found for the selected criteria.
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

export default ProvincialExemptionPage
