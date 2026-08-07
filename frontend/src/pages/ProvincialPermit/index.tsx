import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
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
import SearchResultsTableFrame from '../../components/SearchResultsTableFrame'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import SearchSubmitButton from '@/components/SearchSubmitButton'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import SearchableSelect from '../../components/SearchableSelect'
import RegionMultiSelect from '@/components/RegionMultiSelect'
import StatusTag from '@/components/StatusTag'
import type {
  ProvincialPermitSearchFilters,
  ProvincialPermitSearchRequest,
  ProvincialPermitSearchResponse,
  ProvincialPermitSearchSortField,
} from '@/interfaces/ProvincialPermitSearch'
import { useAuth } from '@/context/auth/useAuth'
import { hasProvincialStaffRole } from '@/context/auth/role-utils'
import { hasInvalidIsoDateValue, isValidIsoDate } from '@/pages/shared/create-form-utils'
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
import IsoDatePicker from '../../components/IsoDatePicker'
import { useSearchFilterDraft } from '@/pages/shared/useSearchFilterDraft'
import { usePersistedSearchParams } from '@/pages/shared/usePersistedSearchParams'
import { useDefaultRegionPreference } from '@/pages/shared/useDefaultRegionPreference'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  loadSearchWithDeferredTotal,
  prefetchAdjacentSearchPages,
} from '@/pages/shared/deferred-search-total'
import {
  countProvincialPermits,
  searchProvincialPermits,
} from '@/service/provincial-permit-search-service'
import { fetchProvincialPermitOptions, type SearchOption } from '@/service/search-options-service'
import { resolveDefaultZoneRegionIds } from '@/service/user-preference-service'
import { formatPermitNumber } from '@/utils/permit'
import { displayTableValue } from '@/utils/text'

const INITIAL_FILTERS: ProvincialPermitSearchFilters = {
  applicationNumber: '',
  packageNumber: '',
  region: [],
  issuedFromDate: '',
  issuedToDate: '',
  permitStatus: '',
  permitNumber: '',
  invoiceNumber: '',
  ownerClientNumber: '',
  applicantClientNumber: '',
}

const EMPTY_RESULTS = createEmptyPagedSearchResponse<ProvincialPermitSearchResponse>()

const SORT_COLUMNS: {
  id: ProvincialPermitSearchSortField
  label: string
}[] = [
  { id: 'permitNumber', label: 'Permit' },
  { id: 'permitStatus', label: 'Status' },
  { id: 'applicantClientNumber', label: 'Applicant client number' },
  { id: 'ownerClientNumber', label: 'Owner client number' },
  { id: 'permitVolume', label: 'Total volume (m³)' },
  { id: 'dateIssued', label: 'Issue date' },
  { id: 'region', label: 'Region' },
]

const DEFAULT_SORT_FIELD: ProvincialPermitSearchSortField = 'permitNumber'
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc'
const SORT_FIELD_OPTIONS = SORT_COLUMNS.map(
  (column) => column.id,
) as ProvincialPermitSearchSortField[]

const buildSearchParams = (
  filters: ProvincialPermitSearchFilters,
  sortField: ProvincialPermitSearchSortField,
  sortDirection: 'asc' | 'desc',
  page: number,
  pageSize: number,
): URLSearchParams =>
  createSearchParams([
    ['applicationNumber', filters.applicationNumber],
    ['packageNumber', filters.packageNumber],
    ['region', filters.region],
    ['issuedFromDate', filters.issuedFromDate],
    ['issuedToDate', filters.issuedToDate],
    ['permitStatus', filters.permitStatus],
    ['permitNumber', filters.permitNumber],
    ['invoiceNumber', filters.invoiceNumber],
    ['ownerClientNumber', filters.ownerClientNumber],
    ['applicantClientNumber', filters.applicantClientNumber],
    ['sortField', sortField],
    ['sortDirection', sortDirection],
    ['page', page],
    ['pageSize', pageSize],
  ])

const ProvincialPermitPage = () => {
  const { capabilities } = useAuth()
  const [searchParams, setSearchParams] = usePersistedSearchParams('provincial-permits')
  const [regionOptions, setRegionOptions] = useState<IdTextOption[]>([])
  const { defaultRegion: defaultZone, preferenceLoading } = useDefaultRegionPreference(
    hasProvincialStaffRole(capabilities.roles),
  )
  const [permitStatusOptions, setPermitStatusOptions] = useState<SearchOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [results, setResults] = useState<ProvincialPermitSearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const totalCacheRef = useRef<SearchTotalCache>(new Map())
  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
  )

  const urlState = useMemo(() => {
    const urlFilters: ProvincialPermitSearchFilters = {
      applicationNumber: searchParams.get('applicationNumber') ?? '',
      packageNumber: searchParams.get('packageNumber') ?? '',
      region: parseCsvParam(searchParams.get('region')),
      issuedFromDate: searchParams.get('issuedFromDate') ?? '',
      issuedToDate: searchParams.get('issuedToDate') ?? '',
      permitStatus: searchParams.get('permitStatus') ?? '',
      permitNumber: searchParams.get('permitNumber') ?? '',
      invoiceNumber: searchParams.get('invoiceNumber') ?? '',
      ownerClientNumber: searchParams.get('ownerClientNumber') ?? '',
      applicantClientNumber: searchParams.get('applicantClientNumber') ?? '',
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
  const updateFilter = useCallback(
    <K extends keyof ProvincialPermitSearchFilters>(
      key: K,
      value: ProvincialPermitSearchFilters[K],
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
  const regionDefaultPending =
    !searchParams.has('region') &&
    (optionsLoading ||
      preferenceLoading ||
      (!optionsUnavailable && defaultZoneRegionIds.length > 0))

  const hasDateValidationError = useMemo(() => {
    return hasInvalidIsoDateValue(filters.issuedFromDate, filters.issuedToDate)
  }, [filters.issuedFromDate, filters.issuedToDate])

  const beginSearchRequest = useLatestRequestGuard()
  const commitResults = useCallback((nextResults: ProvincialPermitSearchResponse) => {
    setResults(nextResults)
  }, [])

  const runSearch = useCallback(
    async (request: ProvincialPermitSearchRequest, options: { force?: boolean } = {}) => {
      const pageCacheGeneration = getPageDataCacheGeneration()
      const pageCacheKey = buildPageDataCacheKey(
        'provincial-permit-search',
        capabilities?.principal,
        request,
      )
      const isLatestRequest = beginSearchRequest()
      if (!options.force) {
        const cachedResults = getPageDataCache<ProvincialPermitSearchResponse>(pageCacheKey)
        if (cachedResults) {
          setCachedSearchTotal(
            totalCacheRef.current,
            buildSearchTotalCacheKey(request.filters),
            cachedResults.page.totalElements,
          )
          prefetchAdjacentSearchPages({
            pageId: 'provincial-permit-search',
            principal: capabilities?.principal,
            request,
            response: cachedResults,
            search: searchProvincialPermits,
            onError: console.error,
          })
          setResults(cachedResults)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      if (hasInvalidIsoDateValue(request.filters.issuedFromDate, request.filters.issuedToDate)) {
        setLoading(false)
        return
      }
      setLoading(true)
      setErrorMessage('')
      try {
        const cacheKey = buildSearchTotalCacheKey(request.filters)
        const cachedTotal = options.force
          ? undefined
          : getCachedSearchTotal(totalCacheRef.current, cacheKey)
        const commitSearchResponse = (
          response: ProvincialPermitSearchResponse,
          totalIsExact: boolean,
        ) => {
          if (totalIsExact && setPageDataCache(pageCacheKey, response, pageCacheGeneration)) {
            setCachedSearchTotal(totalCacheRef.current, cacheKey, response.page.totalElements)
            prefetchAdjacentSearchPages({
              pageId: 'provincial-permit-search',
              principal: capabilities?.principal,
              request,
              response,
              search: searchProvincialPermits,
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
          search: searchProvincialPermits,
          count: countProvincialPermits,
        })
        if (isLatestRequest()) {
          commitSearchResponse(response, totalIsExact)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve permit search results.')
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
    const loadOptions = async () => {
      try {
        const options = await fetchProvincialPermitOptions()
        setPermitStatusOptions(options.permitStatuses)
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
        DEFAULT_SEARCH_PAGE_SIZE,
      ),
    )
  }

  const onHeaderClick = (column: ProvincialPermitSearchSortField) => {
    const nextDirection = getNextSortDirection(sortField, sortDirection, column)
    setSearchParams(
      buildSearchParams(appliedFilters, column, nextDirection, DEFAULT_SEARCH_PAGE, pageSize),
    )
  }

  return (
    <Grid fullWidth className="default-grid fullbleed-table-page provincial-permit-search-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Provincial permit search"
          subtitle="Find provincial export permits and open permit details."
        />
      </Column>

      {optionsUnavailable && <AuthoritativeOptionsUnavailableNotification />}

      <Column sm={4} md={8} lg={16}>
        <section className="legacy-search-section legacy-search-section--filters provincial-permit-search-filters">
          <Tile>
            <form
              className="legacy-search-form"
              onSubmit={(event) => {
                event.preventDefault()
                onSearch()
              }}
            >
              <div className="legacy-search-grid provincial-permit-search-grid">
                <TextInput
                  id="applicationNumber"
                  labelText="Application number"
                  value={filters.applicationNumber}
                  onChange={(event) => updateFilter('applicationNumber', event.target.value)}
                />
                <SearchableSelect
                  id="permitStatus"
                  labelText="Permit status"
                  value={filters.permitStatus}
                  placeholder="All statuses"
                  options={permitStatusOptions}
                  disabled={optionsLoading || optionsUnavailable}
                  onChange={(value) => updateFilter('permitStatus', value)}
                />
                <TextInput
                  id="packageNumber"
                  labelText="Package number"
                  value={filters.packageNumber}
                  onChange={(event) => updateFilter('packageNumber', event.target.value)}
                />
                <TextInput
                  id="permitNumber"
                  labelText="Permit number"
                  value={filters.permitNumber}
                  onChange={(event) => updateFilter('permitNumber', event.target.value)}
                />
                {/* INTENTIONAL_LEGACY_DIVERGENCE(SEARCH_FILTER_EXPANSION):
                    Modern permit search makes the existing invoice-number criterion visible. */}
                <TextInput
                  id="invoiceNumber"
                  labelText="Invoice number"
                  value={filters.invoiceNumber}
                  onChange={(event) => updateFilter('invoiceNumber', event.target.value)}
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
                <TextInput
                  id="applicantClientNumber"
                  labelText="Applicant client number"
                  value={filters.applicantClientNumber}
                  onChange={(event) => updateFilter('applicantClientNumber', event.target.value)}
                />
                <TextInput
                  id="ownerClientNumber"
                  labelText="Owner client number"
                  value={filters.ownerClientNumber}
                  onChange={(event) => updateFilter('ownerClientNumber', event.target.value)}
                />
                <IsoDatePicker
                  id="issuedFromDate"
                  labelText="Issued from date"
                  value={filters.issuedFromDate}
                  invalid={!isValidIsoDate(filters.issuedFromDate)}
                  invalidText="Date must be YYYY-MM-DD"
                  onChange={(value) => updateFilter('issuedFromDate', value)}
                />
                <IsoDatePicker
                  id="issuedToDate"
                  labelText="Issued to date"
                  value={filters.issuedToDate}
                  invalid={!isValidIsoDate(filters.issuedToDate)}
                  invalidText="Date must be YYYY-MM-DD"
                  onChange={(value) => updateFilter('issuedToDate', value)}
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
            loadingDescription="Loading permit search results…"
            totalItems={
              errorMessage || (loading && results.content.length === 0)
                ? undefined
                : results.page.totalElements
            }
          >
            {errorMessage ? (
              <EmptyState
                role="alert"
                title="Permit search unavailable"
                description={errorMessage}
              />
            ) : results.content.length > 0 ? (
              <Table size="md" useZebraStyles>
                <TableHead>
                  <TableRow>
                    {SORT_COLUMNS.map((column) => (
                      <TableHeader key={column.id}>
                        <button
                          type="button"
                          className="legacy-sort-button"
                          onClick={() => onHeaderClick(column.id)}
                        >
                          {column.label}
                        </button>
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.content.map((row) => (
                    <TableRow key={row.permitNumber}>
                      <TableCell>
                        <Link
                          className="cds--link"
                          to={withCurrentSearch(`/provincial/permit/${row.permitNumber}`)}
                        >
                          {formatPermitNumber(row.permitNumber, row.status)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusTag status={row.status} />
                      </TableCell>
                      <TableCell>{displayTableValue(row.applicantClientNumber)}</TableCell>
                      <TableCell>{displayTableValue(row.ownerClientNumber)}</TableCell>
                      <TableCell>{displayTableValue(row.totalVolume)}</TableCell>
                      <TableCell className="legacy-search-table-date">
                        {displayTableValue(row.issueDate)}
                      </TableCell>
                      <TableCell>{displayTableValue(row.region)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : !loading ? (
              <EmptyState
                title="No permits found"
                description="No permits found for the selected criteria."
              />
            ) : null}
            {!errorMessage && (!loading || results.content.length > 0) && (
              <Pagination
                page={results.page.number + 1}
                pageSize={results.page.size}
                pageSizes={[...SEARCH_PAGE_SIZE_OPTIONS]}
                totalItems={results.page.totalElements}
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
    </Grid>
  )
}

export default ProvincialPermitPage
