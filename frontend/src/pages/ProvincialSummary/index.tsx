import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tile,
} from '@carbon/react'
import { Link } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import { useAuth } from '@/context/auth/useAuth'
import { DetailFieldTile } from '@/pages/shared/DetailSections'
import { fetchApplicationClientData } from '@/service/application-client-lookup-service'
import {
  fetchSummaryApplications,
  fetchSummaryExemptions,
  fetchSummaryFees,
  fetchSummaryOffers,
  fetchSummaryOffersPlaced,
  fetchSummaryPermits,
  type SummaryApplication,
  type SummaryExemption,
  type SummaryFee,
  type SummaryOffer,
  type SummaryPage,
  type SummaryPermit,
} from '@/service/summary-service'

const SUMMARY_PAGE_SIZE = 10

type SummaryPageLoader<T> = (
  page: number,
  size: number,
  sortField: string,
) => Promise<SummaryPage<T>>

type SummarySectionState<T> = {
  data: SummaryPage<T>
  loading: boolean
  error: string
  requested: boolean
  sortField: string
}

type SummarySectionProps<T> = SummarySectionState<T> & {
  title: string
  loadingDescription: string
  emptyTitle: string
  emptyDescription: string
  searchPath?: string
  searchLabel?: string
  headerAction?: ReactNode
  unrequestedMessage?: string
  onLoad: (page?: number) => void
  renderTable: (rows: T[]) => ReactNode
}

const emptySummaryPage = <T,>(): SummaryPage<T> => ({
  results: [],
  total: 0,
  page: 0,
  size: SUMMARY_PAGE_SIZE,
})

const useSummarySection = <T,>(
  loader: SummaryPageLoader<T>,
  errorMessage: string,
  defaultSortField: string,
  autoLoad = true,
  scopeKey = '',
) => {
  const requestSequenceRef = useRef(0)
  const sortFieldRef = useRef(defaultSortField)
  const [state, setState] = useState<SummarySectionState<T>>(() => ({
    data: emptySummaryPage<T>(),
    loading: false,
    error: '',
    requested: false,
    sortField: defaultSortField,
  }))

  const load = useCallback(
    async (page = 0, sortField = sortFieldRef.current) => {
      const sequence = requestSequenceRef.current + 1
      requestSequenceRef.current = sequence
      sortFieldRef.current = sortField
      setState((current) => ({
        ...current,
        data: { ...current.data, page },
        loading: true,
        error: '',
        requested: true,
        sortField,
      }))

      try {
        const data = await loader(page, SUMMARY_PAGE_SIZE, sortField)
        if (requestSequenceRef.current === sequence) {
          setState({ data, loading: false, error: '', requested: true, sortField })
        }
      } catch {
        if (requestSequenceRef.current === sequence) {
          setState((current) => ({ ...current, loading: false, error: errorMessage }))
        }
      }
    },
    [errorMessage, loader],
  )

  useEffect(() => {
    if (autoLoad && scopeKey) {
      void load(0)
    }
    return () => {
      requestSequenceRef.current += 1
    }
  }, [autoLoad, load, scopeKey])

  const sort = (field: string) => {
    const direction = sortFieldRef.current === `${field} ASC` ? 'DESC' : 'ASC'
    void load(0, `${field} ${direction}`)
  }

  return { ...state, load, sort }
}

const renderSortHeader = (
  section: { sortField: string; sort: (field: string) => void },
  field: string,
  label: string,
) => {
  const active = section.sortField.startsWith(`${field} `)
  return (
    <TableHeader
      isSortable
      isSortHeader={active}
      sortDirection={active ? (section.sortField.endsWith(' DESC') ? 'DESC' : 'ASC') : 'NONE'}
      onClick={() => section.sort(field)}
    >
      {label}
    </TableHeader>
  )
}

const displayValue = (value: string | null | undefined): string => {
  const normalized = value?.trim()
  return normalized || 'Not provided'
}

const formatNumber = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2 }).format(value)
    : 'Not provided'

const formatCurrency = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
        currencyDisplay: 'narrowSymbol',
      }).format(value)
    : 'Not available'

function SummarySection<T>({
  title,
  loadingDescription,
  emptyTitle,
  emptyDescription,
  searchPath,
  searchLabel,
  headerAction,
  unrequestedMessage,
  data,
  loading,
  error,
  requested,
  onLoad,
  renderTable,
}: SummarySectionProps<T>) {
  const headingId = `summary-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  return (
    <section className="provincial-summary-section" aria-labelledby={headingId}>
      <Tile>
        <div className="provincial-summary-section__header">
          <h2 id={headingId} className="detail-tile-title">
            {title}
          </h2>
          <div className="provincial-summary-section__actions">
            {headerAction}
            {searchPath ? (
              <Link
                className="cds--link"
                to={searchPath}
                aria-label={`Search ${searchLabel ?? title.toLowerCase()}`}
              >
                Search
              </Link>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="provincial-summary-section__loading">
            <InlineLoading description={loadingDescription} />
          </div>
        ) : error ? (
          <EmptyState
            role="alert"
            headingLevel={3}
            title={`${title} unavailable`}
            description={error}
            action={
              <Button kind="tertiary" size="sm" onClick={() => onLoad(data.page)}>
                Try again
              </Button>
            }
          />
        ) : !requested ? (
          <p className="provincial-summary-section__prompt">{unrequestedMessage}</p>
        ) : data.results.length === 0 ? (
          <EmptyState headingLevel={3} title={emptyTitle} description={emptyDescription} />
        ) : (
          <>
            {renderTable(data.results)}
            {data.total > data.size ? (
              <Pagination
                page={data.page + 1}
                pageSize={data.size}
                pageSizes={[SUMMARY_PAGE_SIZE]}
                totalItems={data.total}
                onChange={({ page }) => onLoad(page - 1)}
              />
            ) : null}
          </>
        )}
      </Tile>
    </section>
  )
}

const ProvincialSummaryPage = () => {
  const { capabilities } = useAuth()
  const clientNumber = capabilities.forestClientNumber?.trim() ?? ''
  const [clientDetails, setClientDetails] = useState<{
    clientNumber: string
    companyName: string
    error: string
  } | null>(null)
  const [clientDetailsRetryKey, setClientDetailsRetryKey] = useState(0)
  const activeClientDetails = clientDetails?.clientNumber === clientNumber ? clientDetails : null
  const companyName = activeClientDetails?.companyName ?? ''
  const clientDetailsError = activeClientDetails?.error ?? ''
  const clientLoading = Boolean(clientNumber) && activeClientDetails === null

  const applications = useSummarySection(
    fetchSummaryApplications,
    'Unable to load your applications.',
    'applicationNumber DESC',
    true,
    clientNumber,
  )
  const offers = useSummarySection(
    fetchSummaryOffers,
    'Unable to load your offers.',
    'offerNumber DESC',
    true,
    clientNumber,
  )
  const exemptions = useSummarySection(
    fetchSummaryExemptions,
    'Unable to load your exemptions.',
    'exemptionNumber DESC',
    true,
    clientNumber,
  )
  const permits = useSummarySection(
    fetchSummaryPermits,
    'Unable to load your permits.',
    'permitNumber DESC',
    true,
    clientNumber,
  )
  const fees = useSummarySection(
    fetchSummaryFees,
    'Unable to load your fees.',
    'permitNumber DESC',
    false,
    clientNumber,
  )
  const offersPlaced = useSummarySection(
    fetchSummaryOffersPlaced,
    'Unable to load offers placed by your client.',
    'offerNumber DESC',
    true,
    clientNumber,
  )

  useEffect(() => {
    let active = true
    if (!clientNumber) {
      return () => {
        active = false
      }
    }

    void fetchApplicationClientData(clientNumber, '00')
      .then((client) => {
        if (active) {
          setClientDetails({ clientNumber, companyName: client?.companyName ?? '', error: '' })
        }
      })
      .catch(() => {
        if (active) {
          setClientDetails({
            clientNumber,
            companyName: '',
            error: 'Client details could not be retrieved. Please try again.',
          })
        }
      })

    return () => {
      active = false
    }
  }, [clientDetailsRetryKey, clientNumber])

  return (
    <Grid fullWidth className="default-grid provincial-summary-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Summary"
          subtitle="View applications, offers, exemptions, permits, and fees for your active forest client."
        />
      </Column>

      <Column sm={4} md={8} lg={16}>
        <DetailFieldTile
          title="Client"
          fields={[
            { label: 'Client number', value: displayValue(clientNumber) },
            {
              label: 'Company name',
              value: clientLoading ? 'Loading company name…' : displayValue(companyName),
            },
          ]}
        />
        {clientDetailsError ? (
          <EmptyState
            role="alert"
            headingLevel={3}
            title="Client details unavailable"
            description={clientDetailsError}
            action={
              <Button
                kind="tertiary"
                size="sm"
                onClick={() => {
                  setClientDetails(null)
                  setClientDetailsRetryKey((current) => current + 1)
                }}
              >
                Try again
              </Button>
            }
          />
        ) : null}

        {!clientNumber ? (
          <EmptyState
            role="alert"
            title="No active forest client"
            description="Select an organization before opening the summary."
          />
        ) : (
          <>
            <SummarySection
              {...applications}
              onLoad={applications.load}
              title="My Applications"
              loadingDescription="Loading your applications…"
              emptyTitle="No applications found"
              emptyDescription="No provincial applications are linked to this forest client."
              searchPath="/provincial/application"
              searchLabel="applications"
              renderTable={(rows: SummaryApplication[]) => (
                <TableFrame ariaLabel="My applications table">
                  <Table useZebraStyles size="sm">
                    <TableHead>
                      <TableRow>
                        {renderSortHeader(applications, 'applicationNumber', 'Application')}
                        <TableHeader>Status</TableHeader>
                        <TableHeader>Exemption reason</TableHeader>
                        <TableHeader>Exemption type</TableHeader>
                        <TableHeader>Exemption number</TableHeader>
                        {renderSortHeader(applications, 'packageNumber', 'Package number')}
                        {renderSortHeader(applications, 'receivedDate', 'Received date')}
                        {renderSortHeader(applications, 'listingDate', 'Listing date')}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.application}>
                          <TableCell>
                            <Link
                              className="cds--link"
                              to={`/provincial/application/${row.application}`}
                              state={{
                                returnTo: { label: 'My Applications', to: '/provincial/summary' },
                              }}
                            >
                              {row.application}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <StatusTag status={row.status} />
                          </TableCell>
                          <TableCell>{displayValue(row.reason)}</TableCell>
                          <TableCell>{displayValue(row.exemptionType)}</TableCell>
                          <TableCell>
                            {row.exemptionNumber ? (
                              <Link
                                className="cds--link"
                                to={`/provincial/exemption/${encodeURIComponent(row.exemptionNumber)}`}
                                state={{
                                  returnTo: { label: 'My Applications', to: '/provincial/summary' },
                                }}
                              >
                                {row.exemptionNumber}
                              </Link>
                            ) : (
                              'Not provided'
                            )}
                          </TableCell>
                          <TableCell>
                            {row.packageNumberAry.length > 0
                              ? row.packageNumberAry.join(', ')
                              : 'Not provided'}
                          </TableCell>
                          <TableCell>{displayValue(row.receivedDate)}</TableCell>
                          <TableCell>{displayValue(row.listingDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableFrame>
              )}
            />

            <SummarySection
              {...offers}
              onLoad={offers.load}
              title="My Offers"
              loadingDescription="Loading your offers…"
              emptyTitle="No offers found"
              emptyDescription="No purchase offers are linked to this forest client."
              searchPath="/provincial/offers"
              searchLabel="offers"
              renderTable={(rows: SummaryOffer[]) => (
                <TableFrame ariaLabel="My offers table">
                  <Table useZebraStyles size="sm">
                    <TableHead>
                      <TableRow>
                        <TableHeader>Offer</TableHeader>
                        {renderSortHeader(offers, 'applicationNumber', 'Application')}
                        {renderSortHeader(offers, 'packageNumber', 'Package')}
                        {renderSortHeader(offers, 'listingDate', 'Listing date')}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.offerNumber}>
                          <TableCell>
                            <Link
                              className="cds--link"
                              to={`/provincial/offers/${row.offerNumber}`}
                              state={{
                                returnTo: { label: 'My Offers', to: '/provincial/summary' },
                              }}
                            >
                              {row.offerNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              className="cds--link"
                              to={`/provincial/application/${row.application}`}
                              state={{
                                returnTo: { label: 'My Offers', to: '/provincial/summary' },
                              }}
                            >
                              {row.application}
                            </Link>
                          </TableCell>
                          <TableCell>{displayValue(row.packageNumber)}</TableCell>
                          <TableCell>{displayValue(row.listingDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableFrame>
              )}
            />

            <SummarySection
              {...exemptions}
              onLoad={exemptions.load}
              title="My Exemptions"
              loadingDescription="Loading your exemptions…"
              emptyTitle="No exemptions found"
              emptyDescription="No exemptions are linked to this forest client."
              searchPath="/provincial/exemption"
              searchLabel="exemptions"
              renderTable={(rows: SummaryExemption[]) => (
                <TableFrame ariaLabel="My exemptions table">
                  <Table useZebraStyles size="sm">
                    <TableHead>
                      <TableRow>
                        {renderSortHeader(exemptions, 'exemptionNumber', 'Exemption')}
                        <TableHeader>Type</TableHeader>
                        <TableHeader>Owner client number</TableHeader>
                        <TableHeader>Agent client number</TableHeader>
                        <TableHeader>Status</TableHeader>
                        <TableHeader>Approved volume (m³)</TableHeader>
                        <TableHeader>Balance remaining (m³)</TableHeader>
                        {renderSortHeader(exemptions, 'exemptionApprovalDate', 'Approval date')}
                        <TableHeader>Expiry date</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.exemption}>
                          <TableCell>
                            <Link
                              className="cds--link"
                              to={`/provincial/exemption/${encodeURIComponent(row.exemption)}`}
                              state={{
                                returnTo: { label: 'My Exemptions', to: '/provincial/summary' },
                              }}
                            >
                              {row.exemption}
                            </Link>
                          </TableCell>
                          <TableCell>{displayValue(row.exemptionType)}</TableCell>
                          <TableCell>{displayValue(row.ownerClientNumber)}</TableCell>
                          <TableCell>{displayValue(row.agentClientNumber)}</TableCell>
                          <TableCell>
                            <StatusTag status={row.status} />
                          </TableCell>
                          <TableCell>{formatNumber(row.approvedVolume)}</TableCell>
                          <TableCell>{formatNumber(row.balanceRemaining)}</TableCell>
                          <TableCell>{displayValue(row.approvalDate)}</TableCell>
                          <TableCell>{displayValue(row.expiryDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableFrame>
              )}
            />

            <SummarySection
              {...permits}
              onLoad={permits.load}
              title="My Permits"
              loadingDescription="Loading your permits…"
              emptyTitle="No permits found"
              emptyDescription="No permits are linked to this forest client."
              searchPath="/provincial/permit"
              searchLabel="permits"
              renderTable={(rows: SummaryPermit[]) => (
                <TableFrame ariaLabel="My permits table">
                  <Table useZebraStyles size="sm">
                    <TableHead>
                      <TableRow>
                        {renderSortHeader(permits, 'permitNumber', 'Permit')}
                        <TableHeader>Owner client number</TableHeader>
                        <TableHeader>Agent client number</TableHeader>
                        <TableHeader>Status</TableHeader>
                        {renderSortHeader(permits, 'exemptionNumber', 'Exemption')}
                        <TableHeader>Total pieces</TableHeader>
                        <TableHeader>Total volume (m³)</TableHeader>
                        <TableHeader>Issue date</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.permit}>
                          <TableCell>
                            <Link
                              className="cds--link"
                              to={`/provincial/permit/${row.permit}`}
                              state={{
                                returnTo: { label: 'My Permits', to: '/provincial/summary' },
                              }}
                            >
                              {row.permit}
                            </Link>
                          </TableCell>
                          <TableCell>{displayValue(row.ownerClientNumber)}</TableCell>
                          <TableCell>{displayValue(row.agentClientNumber)}</TableCell>
                          <TableCell>
                            <StatusTag status={row.status} />
                          </TableCell>
                          <TableCell>
                            {row.exemption ? (
                              <Link
                                className="cds--link"
                                to={`/provincial/exemption/${encodeURIComponent(row.exemption)}`}
                                state={{
                                  returnTo: { label: 'My Permits', to: '/provincial/summary' },
                                }}
                              >
                                {row.exemption}
                              </Link>
                            ) : (
                              'Not provided'
                            )}
                          </TableCell>
                          <TableCell>{formatNumber(row.totalPieces)}</TableCell>
                          <TableCell>{formatNumber(row.totalVolume)}</TableCell>
                          <TableCell>{displayValue(row.issueDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableFrame>
              )}
            />

            <SummarySection
              {...fees}
              onLoad={fees.load}
              title="My Fees"
              loadingDescription="Calculating your fees…"
              emptyTitle="No fees found"
              emptyDescription="No permit fees are linked to this forest client."
              searchPath="/provincial/permit"
              searchLabel="permits"
              unrequestedMessage="Select Display fees to calculate current permit fee totals."
              headerAction={
                <Button kind="ghost" size="sm" onClick={() => fees.load(0)}>
                  {fees.requested ? 'Refresh fees' : 'Display fees'}
                </Button>
              }
              renderTable={(rows: SummaryFee[]) => (
                <TableFrame ariaLabel="My fees table">
                  <Table useZebraStyles size="sm">
                    <TableHead>
                      <TableRow>
                        {renderSortHeader(fees, 'permitNumber', 'Permit number')}
                        <TableHeader>Total volume (m³)</TableHeader>
                        <TableHeader>Total fees (CAD)</TableHeader>
                        <TableHeader>Receipt number</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.permit}>
                          <TableCell>
                            <Link
                              className="cds--link"
                              to={`/provincial/permit/${row.permit}`}
                              state={{
                                returnTo: { label: 'My Fees', to: '/provincial/summary' },
                              }}
                            >
                              {row.permit}
                            </Link>
                          </TableCell>
                          <TableCell>{formatNumber(row.volume)}</TableCell>
                          <TableCell>{formatCurrency(row.fees)}</TableCell>
                          <TableCell>{displayValue(row.receipt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableFrame>
              )}
            />

            <SummarySection
              {...offersPlaced}
              onLoad={offersPlaced.load}
              title="Offers Placed"
              loadingDescription="Loading offers placed by your client…"
              emptyTitle="No offers placed"
              emptyDescription="This forest client has not placed any active offers."
              renderTable={(rows: SummaryOffer[]) => (
                <TableFrame ariaLabel="Offers placed table">
                  <Table useZebraStyles size="sm">
                    <TableHead>
                      <TableRow>
                        <TableHeader>Offer</TableHeader>
                        {renderSortHeader(offersPlaced, 'applicationNumber', 'Application')}
                        {renderSortHeader(offersPlaced, 'packageNumber', 'Package')}
                        {renderSortHeader(offersPlaced, 'listingDate', 'Listing date')}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.offerNumber}>
                          <TableCell>
                            <Link
                              className="cds--link"
                              to={`/provincial/offers/${row.offerNumber}`}
                              state={{
                                returnTo: { label: 'Offers Placed', to: '/provincial/summary' },
                              }}
                            >
                              {row.offerNumber}
                            </Link>
                          </TableCell>
                          <TableCell>{row.application}</TableCell>
                          <TableCell>{displayValue(row.packageNumber)}</TableCell>
                          <TableCell>{displayValue(row.listingDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableFrame>
              )}
            />
          </>
        )}
      </Column>
    </Grid>
  )
}

export default ProvincialSummaryPage
