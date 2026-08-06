import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Locked } from '@carbon/icons-react'
import { Link, useNavigate } from 'react-router-dom'
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
  TextInput,
  Tile,
} from '@carbon/react'
import { AppNotification } from '../../components/AppNotification'
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import EmptyState from '@/components/EmptyState'
import DisabledButtonTooltip from '@/components/DisabledButtonTooltip'
import PageHeader from '@/components/PageHeader'
import SearchSubmitButton from '@/components/SearchSubmitButton'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import SearchableSelect from '../../components/SearchableSelect'
import StatusTag from '@/components/StatusTag'
import IsoDatePicker from '../../components/IsoDatePicker'
import type {
  FederalApplicationSearchFilters,
  FederalApplicationSearchItem,
  FederalApplicationSearchRequest,
  FederalApplicationSearchResponse,
} from '@/interfaces/FederalApplicationSearch'
import { useAuth } from '@/context/auth/useAuth'
import { hasRole } from '@/context/auth/role-utils'
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
  parsePageSizeParam,
  parsePositiveIntParam,
} from '@/pages/shared/search-query-utils'
import { useSearchFilterDraft } from '@/pages/shared/useSearchFilterDraft'
import { usePersistedSearchParams } from '@/pages/shared/usePersistedSearchParams'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  loadSearchWithDeferredTotal,
  prefetchAdjacentSearchPages,
} from '@/pages/shared/deferred-search-total'
import {
  countFederalApplications,
  searchFederalApplications,
} from '@/service/federal-application-search-service'
import { fetchFederalApplicationOptions, type SearchOption } from '@/service/search-options-service'

type ExemptionSelectionStatus = {
  kind: 'error'
  message: string
}

type FederalExemptionCreatePrefillState = {
  selectedApplicationNumbers: string[]
  applicationSource: 'federal'
}

const INITIAL_FILTERS: FederalApplicationSearchFilters = {
  applicationNumber: '',
  packageNumber: '',
  applicationStatus: '',
  clientNumber: '',
  receivedFromDate: '',
  receivedToDate: '',
  listingFromDate: '',
  listingToDate: '',
}

const EMPTY_RESULTS = createEmptyPagedSearchResponse<FederalApplicationSearchResponse>()

const RESULT_COLUMNS: {
  id: string
  label: string
}[] = [
  { id: 'federalApplicationNumber', label: 'Application' },
  { id: 'status', label: 'Status' },
  { id: 'clientNumber', label: 'Client' },
  { id: 'reason', label: 'Reason' },
  { id: 'receivedDate', label: 'Received date' },
  { id: 'listingDate', label: 'Listing date' },
]

const disabledFederalExemptionSelectionDescription = (row: FederalApplicationSearchItem): string =>
  row.exemptionNumber
    ? 'This application already has an exemption.'
    : 'This application is not eligible to create an exemption.'

const buildSearchParams = (
  filters: FederalApplicationSearchFilters,
  page: number,
  pageSize: number,
): URLSearchParams =>
  createSearchParams([
    ['applicationNumber', filters.applicationNumber],
    ['packageNumber', filters.packageNumber],
    ['applicationStatus', filters.applicationStatus],
    ['clientNumber', filters.clientNumber],
    ['receivedFromDate', filters.receivedFromDate],
    ['receivedToDate', filters.receivedToDate],
    ['listingFromDate', filters.listingFromDate],
    ['listingToDate', filters.listingToDate],
    ['page', page],
    ['pageSize', pageSize],
  ])

const FederalPage = () => {
  const navigate = useNavigate()
  const { capabilities, canPerform, isLoading } = useAuth()
  const [searchParams, setSearchParams] = usePersistedSearchParams('federal-applications')
  const [applicationStatusOptions, setApplicationStatusOptions] = useState<SearchOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [results, setResults] = useState<FederalApplicationSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedRowsById, setSelectedRowsById] = useState<
    Record<string, FederalApplicationSearchItem>
  >({})
  const [exemptionSelectionStatus, setExemptionSelectionStatus] =
    useState<ExemptionSelectionStatus | null>(null)
  const totalCacheRef = useRef<SearchTotalCache>(new Map())
  const canFilterFederalByClient = canPerform('/createExemption')
  const canCreateFederalExemption =
    canPerform('/createExemption') &&
    canPerform('viewFederalApplication') &&
    !hasRole(capabilities.roles, 'APPLICATION_APPROVER')
  const selectedRowsCount = Object.keys(selectedRowsById).length
  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
  )

  const urlState = useMemo(() => {
    const urlFilters: FederalApplicationSearchFilters = {
      applicationNumber: searchParams.get('applicationNumber') ?? '',
      packageNumber: searchParams.get('packageNumber') ?? '',
      applicationStatus: searchParams.get('applicationStatus') ?? '',
      clientNumber: searchParams.get('clientNumber') ?? '',
      receivedFromDate: searchParams.get('receivedFromDate') ?? '',
      receivedToDate: searchParams.get('receivedToDate') ?? '',
      listingFromDate: searchParams.get('listingFromDate') ?? '',
      listingToDate: searchParams.get('listingToDate') ?? '',
    }

    return {
      filters: urlFilters,
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
  const pageSize = urlState.pageSize
  const requestFilters = appliedFilters
  const hasSearchQuery = searchParams.toString().length > 0
  const clearSelection = useCallback(() => {
    setSelectedRowsById({})
    setExemptionSelectionStatus(null)
  }, [])
  const updateFilter = useCallback(
    (key: keyof FederalApplicationSearchFilters, value: string) => {
      clearSelection()
      setFilters((currentFilters) => ({ ...currentFilters, [key]: value }))
    },
    [clearSelection, setFilters],
  )

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

  const beginSearchRequest = useLatestRequestGuard()
  const commitResults = useCallback((nextResults: FederalApplicationSearchResponse) => {
    setResults(nextResults)
  }, [])

  const runSearch = useCallback(
    async (request: FederalApplicationSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheGeneration = getPageDataCacheGeneration()
      const pageCacheKey = buildPageDataCacheKey(
        'federal-application-search',
        capabilities?.principal,
        request,
      )
      const isLatestRequest = beginSearchRequest()
      if (!options.force) {
        const cachedResults = getPageDataCache<FederalApplicationSearchResponse>(pageCacheKey)
        if (cachedResults) {
          setCachedSearchTotal(
            totalCacheRef.current,
            buildSearchTotalCacheKey(request.filters),
            cachedResults.page.totalElements,
          )
          prefetchAdjacentSearchPages({
            pageId: 'federal-application-search',
            principal: capabilities?.principal,
            request,
            response: cachedResults,
            search: searchFederalApplications,
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
          response: FederalApplicationSearchResponse,
          totalIsExact: boolean,
        ) => {
          if (totalIsExact && setPageDataCache(pageCacheKey, response, pageCacheGeneration)) {
            setCachedSearchTotal(totalCacheRef.current, totalCacheKey, response.page.totalElements)
            prefetchAdjacentSearchPages({
              pageId: 'federal-application-search',
              principal: capabilities?.principal,
              request,
              response,
              search: searchFederalApplications,
              onError: console.error,
            })
          }
          queueMicrotask(() => {
            if (isLatestRequest()) {
              commitResults(response)
            }
          })
        }
        const { response, totalIsExact } = await loadSearchWithDeferredTotal({
          request,
          cachedTotal,
          search: searchFederalApplications,
          count: countFederalApplications,
        })
        if (isLatestRequest()) {
          commitSearchResponse(response, totalIsExact)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve federal application search results.')
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
    if (!hasSearchQuery) {
      return
    }

    void runSearch({
      filters: requestFilters,
      page: urlState.page - 1,
      pageSize: urlState.pageSize,
    })
  }, [hasSearchQuery, requestFilters, runSearch, urlState.page, urlState.pageSize])

  useEffect(() => {
    if (!isLoading && !hasSearchQuery) {
      setFilters((currentFilters) =>
        currentFilters.applicationStatus === 'APP'
          ? currentFilters
          : {
              ...currentFilters,
              applicationStatus: 'APP',
            },
      )
    }
  }, [hasSearchQuery, isLoading, setFilters])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const options = await fetchFederalApplicationOptions()
        setApplicationStatusOptions(options.applicationStatuses)
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
    if (loading || hasDateValidationError) {
      return
    }
    clearSelection()
    const nextSearchParams = buildSearchParams(filters, DEFAULT_SEARCH_PAGE, pageSize)
    if (nextSearchParams.toString() === searchParams.toString()) {
      void runSearch(
        {
          filters,
          page: DEFAULT_SEARCH_PAGE - 1,
          pageSize,
        },
        { force: true },
      )
      return
    }
    setSearchParams(nextSearchParams)
  }

  const onClearFilters = () => {
    clearSelection()
    setFilters(INITIAL_FILTERS)
    setSearchParams(
      buildSearchParams(INITIAL_FILTERS, DEFAULT_SEARCH_PAGE, DEFAULT_SEARCH_PAGE_SIZE),
    )
  }

  const selectableRows = useMemo(() => {
    if (!canCreateFederalExemption) {
      return []
    }
    return results.content.filter((item) => item.allowCreateExemption)
  }, [canCreateFederalExemption, results.content])

  const allSelectableRowsAreSelected = useMemo(() => {
    if (selectableRows.length === 0) {
      return false
    }
    return selectableRows.every((item) => Boolean(selectedRowsById[item.applicationNumber]))
  }, [selectableRows, selectedRowsById])

  const toggleRowSelection = (row: FederalApplicationSearchItem, checked: boolean) => {
    if (!canCreateFederalExemption || !row.allowCreateExemption) {
      return
    }
    setExemptionSelectionStatus(null)
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
    if (!canCreateFederalExemption) {
      return
    }
    setExemptionSelectionStatus(null)
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
    if (!canCreateFederalExemption) {
      setExemptionSelectionStatus({
        kind: 'error',
        message: 'Your account is not authorized to create exemptions from federal applications.',
      })
      return
    }

    const selectedRows = Object.values(selectedRowsById)
    if (selectedRows.length === 0) {
      setExemptionSelectionStatus({
        kind: 'error',
        message: 'Select at least one eligible federal application before creating an exemption.',
      })
      return
    }

    const firstClientNumber = selectedRows[0].clientNumber.trim()
    const allRowsMatchClientNumber = selectedRows.every(
      (row) => row.clientNumber.trim() === firstClientNumber,
    )
    if (!allRowsMatchClientNumber) {
      setExemptionSelectionStatus({
        kind: 'error',
        message:
          'Selected federal applications do not share the same client number. Multi-application exemptions require matching clients.',
      })
      return
    }

    const selectedApplicationNumbers = selectedRows.map((row) => row.applicationNumber)
    const query = new URLSearchParams({
      applications: selectedApplicationNumbers.join(','),
      source: 'federal',
    })
    const prefillState: FederalExemptionCreatePrefillState = {
      selectedApplicationNumbers,
      applicationSource: 'federal',
    }
    navigate(`/provincial/exemption/create?${query.toString()}`, { state: prefillState })
  }

  return (
    <Grid fullWidth className="default-grid fullbleed-table-page federal-application-search-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Federal application search"
          subtitle="Find federal applications and open application details."
        />
      </Column>

      {optionsUnavailable && <AuthoritativeOptionsUnavailableNotification />}

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters federal-application-search-filters">
          <Tile>
            <form
              className="legacy-search-form"
              onSubmit={(event) => {
                event.preventDefault()
                onSearch()
              }}
            >
              <div className="legacy-search-grid federal-application-search-grid">
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
                <SearchableSelect
                  id="applicationStatus"
                  labelText="Application status"
                  value={filters.applicationStatus}
                  placeholder="All statuses"
                  options={applicationStatusOptions}
                  disabled={optionsLoading || optionsUnavailable}
                  onChange={(value) => updateFilter('applicationStatus', value)}
                />
                {canFilterFederalByClient && (
                  <TextInput
                    id="clientNumber"
                    labelText="Client number"
                    value={filters.clientNumber}
                    onChange={(event) => updateFilter('clientNumber', event.target.value)}
                  />
                )}
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
                  type="button"
                  kind="tertiary"
                  onClick={onClearFilters}
                  disabled={loading}
                  size="md"
                >
                  Clear Filters
                </Button>
                <SearchSubmitButton loading={loading} disabled={hasDateValidationError} />
                {canCreateFederalExemption && (
                  <DisabledButtonTooltip
                    disabled={selectedRowsCount === 0}
                    description="Select at least one eligible application."
                  >
                    <Button
                      type="button"
                      kind="secondary"
                      size="md"
                      onClick={onCreateExemptionClick}
                      disabled={selectedRowsCount === 0}
                    >
                      Create exemption for Selected Applications
                    </Button>
                  </DisabledButtonTooltip>
                )}
              </div>
              {exemptionSelectionStatus && (
                <AppNotification
                  className="legacy-inline-notification"
                  kind={exemptionSelectionStatus.kind}
                  title="Validation failed"
                  subtitle={exemptionSelectionStatus.message}
                  onCloseButtonClick={() => setExemptionSelectionStatus(null)}
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
            loadingDescription="Loading federal application search results..."
            totalItems={
              errorMessage || (loading && results.content.length === 0)
                ? undefined
                : results.page.totalElements
            }
          >
            {errorMessage ? (
              <EmptyState
                role="alert"
                title="Federal application search unavailable"
                description={errorMessage}
              />
            ) : results.content.length > 0 ? (
              <Table size="md" useZebraStyles>
                <TableHead>
                  <TableRow>
                    {canCreateFederalExemption && (
                      <TableHeader>
                        <DisabledButtonTooltip
                          disabled={selectableRows.length === 0}
                          description="No eligible federal applications are available on this page."
                        >
                          <Checkbox
                            id="selectAllCurrentPageFederalRows"
                            hideLabel
                            labelText="Select all eligible federal applications on this page"
                            checked={allSelectableRowsAreSelected}
                            disabled={selectableRows.length === 0}
                            onChange={(_, payload) =>
                              toggleSelectAllRowsOnPage(Boolean(payload.checked))
                            }
                          />
                        </DisabledButtonTooltip>
                      </TableHeader>
                    )}
                    {RESULT_COLUMNS.map((column) => (
                      <TableHeader key={column.id}>{column.label}</TableHeader>
                    ))}
                    <TableHeader>Exemption type</TableHeader>
                    <TableHeader>Exemption number</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.content.map((row) => (
                    <TableRow key={row.applicationNumber}>
                      {canCreateFederalExemption && (
                        <TableCell>
                          {row.eligibleForExemption && row.locked ? (
                            <span
                              className="federal-application-lock"
                              role="status"
                              aria-label={`Federal application ${row.federalApplicationNumber} is locked`}
                              title="This application is currently locked"
                            >
                              <Locked size={16} aria-hidden="true" />
                              Locked
                            </span>
                          ) : (
                            <DisabledButtonTooltip
                              disabled={!row.allowCreateExemption}
                              description={disabledFederalExemptionSelectionDescription(row)}
                            >
                              <Checkbox
                                id={`selectFederalRow-${row.applicationNumber}`}
                                hideLabel
                                labelText={`Select federal application ${row.federalApplicationNumber}`}
                                checked={Boolean(selectedRowsById[row.applicationNumber])}
                                disabled={!row.allowCreateExemption}
                                onChange={(_, payload) =>
                                  toggleRowSelection(row, Boolean(payload.checked))
                                }
                              />
                            </DisabledButtonTooltip>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <Link
                          className="cds--link"
                          to={withCurrentSearch(`/federal/application/${row.applicationNumber}`)}
                        >
                          {row.federalApplicationNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusTag status={row.status} />
                      </TableCell>
                      <TableCell>{row.clientNumber}</TableCell>
                      <TableCell>{row.reason}</TableCell>
                      <TableCell className="legacy-search-table-date">{row.receivedDate}</TableCell>
                      <TableCell className="legacy-search-table-date">{row.listingDate}</TableCell>
                      <TableCell>{row.exemptionType || '-'}</TableCell>
                      <TableCell>
                        {row.exemptionNumber ? (
                          <Link
                            className="cds--link"
                            to={withCurrentSearch(`/provincial/exemption/${row.exemptionNumber}`)}
                          >
                            {row.exemptionNumber}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : !loading ? (
              <EmptyState
                title="No federal applications found"
                description="No federal applications found for the selected criteria."
              />
            ) : null}
            {!errorMessage && (!loading || results.content.length > 0) && (
              <Pagination
                page={results.page.number + 1}
                pageSize={results.page.size}
                pageSizes={[...SEARCH_PAGE_SIZE_OPTIONS]}
                totalItems={results.page.totalElements}
                onChange={({ page, pageSize: nextPageSize }) => {
                  clearSelection()
                  setSearchParams(buildSearchParams(appliedFilters, page, nextPageSize))
                }}
              />
            )}
          </SearchResultsTableFrame>
        </section>
      </Column>
    </Grid>
  )
}

export default FederalPage
