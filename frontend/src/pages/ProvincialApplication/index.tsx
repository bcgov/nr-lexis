import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
  ProvincialApplicationSearchFilters,
  ProvincialApplicationSearchItem,
  ProvincialApplicationSearchRequest,
  ProvincialApplicationSearchResponse,
  ProvincialApplicationSearchSortField,
} from '@/interfaces/ProvincialApplicationSearch'
import { useAuth } from '@/context/auth/useAuth'
import {
  parseCsvParam,
  parseEnumParam,
  parsePositiveIntParam,
  parseSortDirectionParam,
  setSearchParam,
} from '@/pages/shared/search-query-utils'
import { searchProvincialApplications } from '@/service/provincial-application-search-service'
import {
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'

type RegionOption = {
  id: string
  text: string
}

type ExemptionStatus = {
  kind: 'error'
  message: string
}

type ExemptionCreatePrefillState = {
  selectedApplicationNumbers: string[]
  applicantClientNumber: string
  ownerClientNumber: string
}

const FALLBACK_REGION_OPTIONS: RegionOption[] = [
  { id: '11', text: 'Cariboo (11)' },
  { id: '12', text: 'Coast (12)' },
  { id: '24', text: 'Skeena (24)' },
]

const INITIAL_FILTERS: ProvincialApplicationSearchFilters = {
  applicationNumber: '',
  packageNumber: '',
  exemptionType: '',
  exemptionNumber: '',
  applicationStatus: '',
  productTypeCode: '',
  region: [],
  listingFromDate: '',
  listingToDate: '',
  applicantClientNumber: '',
  ownerClientNumber: '',
}

const EMPTY_RESULTS: ProvincialApplicationSearchResponse = {
  content: [],
  page: {
    number: 0,
    size: 10,
    totalElements: 0,
    totalPages: 1,
  },
}

const FALLBACK_EXEMPTION_TYPE_OPTIONS: SearchOption[] = [
  { value: 'ALL', label: 'All' },
  { value: 'FEE', label: 'Fee in Lieu' },
  { value: 'APP', label: 'Application Exemption' },
]

const FALLBACK_APPLICATION_STATUS_OPTIONS: SearchOption[] = [
  { value: 'NEW', label: 'New' },
  { value: 'REV', label: 'In Review' },
  { value: 'PER', label: 'Permitted' },
]

const FALLBACK_PRODUCT_TYPE_OPTIONS: SearchOption[] = [
  { value: 'LOG', label: 'Logs' },
  { value: 'LUM', label: 'Lumber' },
]

const isValidIsoDate = (value: string): boolean => {
  if (!value.trim()) return true
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)
}

const SORT_COLUMNS: {
  id: ProvincialApplicationSearchSortField
  label: string
}[] = [
  { id: 'applicationNumber', label: 'Application' },
  { id: 'status', label: 'Status' },
  { id: 'applicantClientNumber', label: 'Applicant Client Number' },
  { id: 'ownerClientNumber', label: 'Owner Client Number' },
  { id: 'region', label: 'Region' },
  { id: 'applicationVolume', label: 'Application Volume (m³)' },
  { id: 'exemptionNumber', label: 'Exemption Number' },
  { id: 'listingDate', label: 'Listing Date' },
]

const DEFAULT_SORT_FIELD: ProvincialApplicationSearchSortField = 'applicationNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc'
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 20, 30] as const
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ProvincialApplicationSearchSortField[]

const buildSearchParams = (
  filters: ProvincialApplicationSearchFilters,
  sortField: ProvincialApplicationSearchSortField,
  sortDirection: 'asc' | 'desc',
  page: number,
  pageSize: number,
): URLSearchParams => {
  const params = new URLSearchParams()

  setSearchParam(params, 'applicationNumber', filters.applicationNumber)
  setSearchParam(params, 'packageNumber', filters.packageNumber)
  setSearchParam(params, 'exemptionType', filters.exemptionType)
  setSearchParam(params, 'exemptionNumber', filters.exemptionNumber)
  setSearchParam(params, 'applicationStatus', filters.applicationStatus)
  setSearchParam(params, 'productTypeCode', filters.productTypeCode)
  setSearchParam(params, 'region', filters.region)
  setSearchParam(params, 'listingFromDate', filters.listingFromDate)
  setSearchParam(params, 'listingToDate', filters.listingToDate)
  setSearchParam(params, 'applicantClientNumber', filters.applicantClientNumber)
  setSearchParam(params, 'ownerClientNumber', filters.ownerClientNumber)
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

const ProvincialApplicationPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<ProvincialApplicationSearchFilters>(INITIAL_FILTERS)
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>(FALLBACK_REGION_OPTIONS)
  const [exemptionTypeOptions, setExemptionTypeOptions] = useState<SearchOption[]>(
    FALLBACK_EXEMPTION_TYPE_OPTIONS,
  )
  const [applicationStatusOptions, setApplicationStatusOptions] = useState<SearchOption[]>(
    FALLBACK_APPLICATION_STATUS_OPTIONS,
  )
  const [productTypeOptions, setProductTypeOptions] = useState<SearchOption[]>(
    FALLBACK_PRODUCT_TYPE_OPTIONS,
  )
  const [results, setResults] = useState<ProvincialApplicationSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sortField, setSortField] =
    useState<ProvincialApplicationSearchSortField>(DEFAULT_SORT_FIELD)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(DEFAULT_SORT_DIRECTION)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [selectedRowsById, setSelectedRowsById] = useState<
    Record<string, ProvincialApplicationSearchItem>
  >({})
  const [exemptionStatus, setExemptionStatus] = useState<ExemptionStatus | null>(null)
  const canCreateExemption = canPerform('/createExemption')
  const canCreateApplication = canPerform('createApplication')
  const selectedRowsCount = Object.keys(selectedRowsById).length

  const urlState = useMemo(() => {
    const urlFilters: ProvincialApplicationSearchFilters = {
      applicationNumber: searchParams.get('applicationNumber') ?? '',
      packageNumber: searchParams.get('packageNumber') ?? '',
      exemptionType: searchParams.get('exemptionType') ?? '',
      exemptionNumber: searchParams.get('exemptionNumber') ?? '',
      applicationStatus: searchParams.get('applicationStatus') ?? '',
      productTypeCode: searchParams.get('productTypeCode') ?? '',
      region: parseCsvParam(searchParams.get('region')),
      listingFromDate: searchParams.get('listingFromDate') ?? '',
      listingToDate: searchParams.get('listingToDate') ?? '',
      applicantClientNumber: searchParams.get('applicantClientNumber') ?? '',
      ownerClientNumber: searchParams.get('ownerClientNumber') ?? '',
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

  const selectedRegions = useMemo(
    () => mapSelectedRegions(filters.region, regionOptions),
    [filters.region, regionOptions],
  )

  const hasDateValidationError = useMemo(() => {
    return !isValidIsoDate(filters.listingFromDate) || !isValidIsoDate(filters.listingToDate)
  }, [filters.listingFromDate, filters.listingToDate])

  const runSearch = useCallback(async (request: ProvincialApplicationSearchRequest) => {
    if (
      !isValidIsoDate(request.filters.listingFromDate) ||
      !isValidIsoDate(request.filters.listingToDate)
    ) {
      return
    }
    setLoading(true)
    setErrorMessage('')
    try {
      const response = await searchProvincialApplications(request)
      setResults(response)
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to retrieve application search results.')
      setResults(EMPTY_RESULTS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setFilters(urlState.filters)
    setSortField(urlState.sortField)
    setSortDirection(urlState.sortDirection)
    setPageSize(urlState.pageSize)
    setSelectedRowsById({})
    setExemptionStatus(null)
  }, [urlState])

  useEffect(() => {
    void runSearch({
      filters: urlState.filters,
      page: urlState.page - 1,
      pageSize: urlState.pageSize,
      sortField: urlState.sortField,
      sortDirection: urlState.sortDirection,
    })
  }, [runSearch, urlState])

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialApplicationOptions()

      if (options.exemptionTypes.length > 0) {
        setExemptionTypeOptions(options.exemptionTypes)
      }
      if (options.applicationStatuses.length > 0) {
        setApplicationStatusOptions(options.applicationStatuses)
      }
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
    setExemptionStatus(null)
    setSearchParams(buildSearchParams(filters, sortField, sortDirection, DEFAULT_PAGE, pageSize))
  }

  const onHeaderClick = (column: ProvincialApplicationSearchSortField) => {
    const nextDirection = sortField === column && sortDirection === 'asc' ? 'desc' : 'asc'
    setSelectedRowsById({})
    setExemptionStatus(null)
    setSearchParams(buildSearchParams(filters, column, nextDirection, DEFAULT_PAGE, pageSize))
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

  const onCreateExemptionClick = () => {
    if (!canCreateExemption) {
      setExemptionStatus({
        kind: 'error',
        message: 'Your account is not authorized to create exemptions.',
      })
      return
    }

    const selectedRows = Object.values(selectedRowsById)
    if (selectedRows.length === 0) {
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

    if (!allRowsMatchClientNumbers) {
      setExemptionStatus({
        kind: 'error',
        message:
          'Selected applications do not share the same client numbers. Multi-application exemptions require matching clients.',
      })
      return
    }

    const prefillState: ExemptionCreatePrefillState = {
      selectedApplicationNumbers: selectedRows.map((row) => row.applicationNumber),
      applicantClientNumber: firstRow.applicantClientNumber,
      ownerClientNumber: firstRow.ownerClientNumber,
    }

    navigate('/provincial/exemption/create', { state: prefillState })
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial Application Search</h1>
        <p>
          Migrated from <code>src/main/webapp/WEB-INF/jsp/provincial/application/search.jsp</code>{' '}
          and <code>src/main/webapp/javascript/provincial/application/search.js</code>.
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
            <Select
              id="exemptionType"
              labelText="Exemption Type"
              value={filters.exemptionType}
              onChange={(event) =>
                setFilters((current) => ({ ...current, exemptionType: event.target.value }))
              }
            >
              <SelectItem text="All types" value="" />
              {exemptionTypeOptions.map((option) => (
                <SelectItem key={option.value} text={option.label} value={option.value} />
              ))}
            </Select>
            <TextInput
              id="exemptionNumber"
              labelText="Exemption Number"
              value={filters.exemptionNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, exemptionNumber: event.target.value }))
              }
            />
            <Select
              id="applicationStatus"
              labelText="Application Status"
              value={filters.applicationStatus}
              onChange={(event) =>
                setFilters((current) => ({ ...current, applicationStatus: event.target.value }))
              }
            >
              <SelectItem text="All statuses" value="" />
              {applicationStatusOptions.map((option) => (
                <SelectItem key={option.value} text={option.label} value={option.value} />
              ))}
            </Select>
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
                <SelectItem key={option.value} text={option.label} value={option.value} />
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
                setFilters((current) => ({
                  ...current,
                  region: nextSelected.map((item) => item.id),
                }))
              }}
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
              onClick={onCreateExemptionClick}
              disabled={selectedRowsCount === 0 || !canCreateExemption}
            >
              Create Exemption for Selected Applications
            </Button>
            {canCreateApplication && (
              <Link className="cds--link" to="/provincial/application/create">
                Add Application
              </Link>
            )}
          </div>
          {exemptionStatus && (
            <InlineNotification
              className="legacy-inline-notification"
              kind={exemptionStatus.kind}
              title="Validation failed"
              subtitle={exemptionStatus.message}
              onCloseButtonClick={() => setExemptionStatus(null)}
            />
          )}
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <h2 className="dashboard-title">Search Results</h2>
        {loading && <InlineLoading description="Loading application search results..." />}
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
                      disabled={selectableRows.length === 0}
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
                        disabled={!canCreateExemption || !row.allowCreateExemption}
                        onChange={(_, payload) => toggleRowSelection(row, Boolean(payload.checked))}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        className="cds--link"
                        to={`/provincial/application/${row.applicationNumber}`}
                      >
                        {row.applicationNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.applicantClientNumber}</TableCell>
                    <TableCell>{row.ownerClientNumber}</TableCell>
                    <TableCell>{row.region}</TableCell>
                    <TableCell>{row.applicationVolume}</TableCell>
                    <TableCell>
                      {row.exemptionNumber ? (
                        <Link
                          className="cds--link"
                          to={`/provincial/exemption/${row.exemptionNumber}`}
                        >
                          {row.exemptionNumber}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{row.listingDate}</TableCell>
                  </TableRow>
                ))}
                {results.content.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      No applications found for the selected criteria.
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
                setExemptionStatus(null)
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

export default ProvincialApplicationPage
