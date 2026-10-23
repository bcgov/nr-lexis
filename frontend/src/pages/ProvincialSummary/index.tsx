import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Certificate,
  Currency,
  DataDefinition,
  Enterprise,
  Renew,
  Result,
  Rule,
  Search,
  TagExport,
  type CarbonIconType,
} from '@carbon/icons-react'
import { FinanceAndOperations } from '@carbon/pictograms-react'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tile,
} from '@carbon/react'
import { Link } from 'react-router-dom'
import DetailCardTitle from '@/components/DetailCardTitle'
import EmptyState from '@/components/EmptyState'
import Pagination from '@/components/Pagination'
import PageHeader from '@/components/PageHeader'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import { useAuth } from '@/context/auth/useAuth'
import { RecordField, RecordFieldGrid, RecordFieldRow } from '@/pages/shared/RecordFieldGrid'
import { displayValue } from '@/utils/display-value'
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
import { formatPermitNumber, formatPermitStatus } from '@/utils/permit'
import { displayVolume } from '@/utils/volume'

const SUMMARY_PAGE_SIZE = 10

// Records opened from any Summary table name the page itself in their Back link.
const SUMMARY_RETURN_STATE = { returnTo: { label: 'Summary', to: '/provincial/summary' } }

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
  icon: CarbonIconType
  loadingDescription: string
  emptyTitle: string
  emptyDescription: string
  searchPath?: string
  searchLabel?: string
  headerAction?: ReactNode
  unrequestedState?: ReactNode
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

const formatNumber = (value: number | null | undefined): ReactNode =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2 }).format(value)
    : displayValue(value)

const formatCurrency = (value: number | null | undefined): ReactNode =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
        currencyDisplay: 'narrowSymbol',
      }).format(value)
    : displayValue(value)

function SummarySection<T>({
  title,
  icon,
  loadingDescription,
  emptyTitle,
  emptyDescription,
  searchPath,
  searchLabel,
  headerAction,
  unrequestedState,
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
      <div className="provincial-summary-section__header">
        <DetailCardTitle id={headingId} icon={icon}>
          {title}
        </DetailCardTitle>
        {headerAction || searchPath ? (
          <div className="provincial-summary-section__actions">
            {headerAction}
            {searchPath ? (
              <Button as={Link} to={searchPath} kind="tertiary" size="md" renderIcon={Search}>
                {searchLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
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
            <Button kind="tertiary" size="md" onClick={() => onLoad(data.page)}>
              Try again
            </Button>
          }
        />
      ) : !requested ? (
        unrequestedState
      ) : data.results.length === 0 ? (
        <EmptyState headingLevel={3} title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          {renderTable(data.results)}
          <Pagination
            page={data.page + 1}
            pageSize={data.size}
            pageSizes={[SUMMARY_PAGE_SIZE]}
            totalItems={data.total}
            onChange={({ page }) => onLoad(page - 1)}
          />
        </>
      )}
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
  // Display fees goes away once the fees start loading, so focus moves on to Refresh fees.
  const focusRefreshFeesRef = useRef(false)

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
        <Tile className="provincial-summary-card">
          <section className="provincial-summary-client" aria-labelledby="summary-client">
            <DetailCardTitle id="summary-client" icon={Enterprise}>
              Client
            </DetailCardTitle>
            <RecordFieldGrid>
              <RecordFieldRow>
                <RecordField label="Client number" value={displayValue(clientNumber)} />
                <RecordField
                  label="Company name"
                  value={clientLoading ? 'Loading company name…' : displayValue(companyName)}
                />
              </RecordFieldRow>
            </RecordFieldGrid>
            {clientDetailsError ? (
              <EmptyState
                role="alert"
                headingLevel={3}
                title="Client details unavailable"
                description={clientDetailsError}
                action={
                  <Button
                    kind="tertiary"
                    size="md"
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
          </section>

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
                title="My applications"
                icon={Result}
                loadingDescription="Loading your applications…"
                emptyTitle="No applications found"
                emptyDescription="No provincial applications are linked to this forest client."
                searchPath="/provincial/application"
                searchLabel="Search applications"
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
                          {renderSortHeader(applications, 'listingDate', 'List date')}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow key={row.application}>
                            <TableCell>
                              <Link
                                className="cds--link"
                                to={`/provincial/application/${row.application}`}
                                state={SUMMARY_RETURN_STATE}
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
                                  state={SUMMARY_RETURN_STATE}
                                >
                                  {row.exemptionNumber}
                                </Link>
                              ) : (
                                displayValue('')
                              )}
                            </TableCell>
                            <TableCell>
                              {row.packageNumberAry.length > 0
                                ? row.packageNumberAry.join(', ')
                                : displayValue('')}
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
                title="My offers"
                icon={DataDefinition}
                loadingDescription="Loading your offers…"
                emptyTitle="No offers found"
                emptyDescription="No purchase offers are linked to this forest client."
                searchPath="/provincial/offers"
                searchLabel="Search offers"
                renderTable={(rows: SummaryOffer[]) => (
                  <TableFrame ariaLabel="My offers table">
                    <Table useZebraStyles size="sm">
                      <TableHead>
                        <TableRow>
                          <TableHeader>Offer</TableHeader>
                          {renderSortHeader(offers, 'applicationNumber', 'Application')}
                          {renderSortHeader(offers, 'packageNumber', 'Package')}
                          {renderSortHeader(offers, 'listingDate', 'List date')}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow key={row.offerNumber}>
                            <TableCell>
                              <Link
                                className="cds--link"
                                to={`/provincial/offers/${row.offerNumber}`}
                                state={SUMMARY_RETURN_STATE}
                              >
                                {row.offerNumber}
                              </Link>
                            </TableCell>
                            <TableCell>{displayValue(row.application)}</TableCell>
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
                title="My exemptions"
                icon={Rule}
                loadingDescription="Loading your exemptions…"
                emptyTitle="No exemptions found"
                emptyDescription="No exemptions are linked to this forest client."
                searchPath="/provincial/exemption"
                searchLabel="Search exemptions"
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
                          <TableHeader>Approval volume (m³)</TableHeader>
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
                                state={SUMMARY_RETURN_STATE}
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
                            <TableCell>{displayVolume(row.approvedVolume)}</TableCell>
                            <TableCell>{displayVolume(row.balanceRemaining)}</TableCell>
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
                title="My permits"
                icon={Certificate}
                loadingDescription="Loading your permits…"
                emptyTitle="No permits found"
                emptyDescription="No permits are linked to this forest client."
                searchPath="/provincial/permit"
                searchLabel="Search permits"
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
                          <TableHeader>Issued date</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow key={row.permit}>
                            <TableCell>
                              <Link
                                className="cds--link"
                                to={`/provincial/permit/${row.permit}`}
                                state={SUMMARY_RETURN_STATE}
                              >
                                {formatPermitNumber(row.permit, row.status)}
                              </Link>
                            </TableCell>
                            <TableCell>{displayValue(row.ownerClientNumber)}</TableCell>
                            <TableCell>{displayValue(row.agentClientNumber)}</TableCell>
                            <TableCell>
                              <StatusTag status={formatPermitStatus(row.status)} />
                            </TableCell>
                            <TableCell>{displayValue(row.exemption)}</TableCell>
                            <TableCell>{formatNumber(row.totalPieces)}</TableCell>
                            <TableCell>{displayVolume(row.totalVolume)}</TableCell>
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
                title="My fees"
                icon={Currency}
                loadingDescription="Calculating your fees…"
                emptyTitle="No fees found"
                emptyDescription="No permit fees are linked to this forest client."
                searchPath="/provincial/permit"
                searchLabel="Search fees by permit"
                unrequestedState={
                  <EmptyState
                    className="provincial-summary-fees-prompt"
                    headingLevel={3}
                    icon={<FinanceAndOperations width={48} height={48} />}
                    title="View your permit fees"
                    description="Fee totals are calculated on request."
                    action={
                      <Button
                        kind="tertiary"
                        size="md"
                        onClick={() => {
                          focusRefreshFeesRef.current = true
                          void fees.load(0)
                        }}
                      >
                        Display fees
                      </Button>
                    }
                  />
                }
                headerAction={
                  fees.requested ? (
                    <Button
                      ref={(button: HTMLButtonElement | null) => {
                        if (button && focusRefreshFeesRef.current) {
                          focusRefreshFeesRef.current = false
                          button.focus()
                        }
                      }}
                      kind="ghost"
                      size="md"
                      renderIcon={Renew}
                      onClick={() => fees.load(0)}
                    >
                      Refresh fees
                    </Button>
                  ) : undefined
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
                                state={SUMMARY_RETURN_STATE}
                              >
                                {formatPermitNumber(row.permit, row.status)}
                              </Link>
                            </TableCell>
                            <TableCell>{displayVolume(row.volume)}</TableCell>
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
                title="Offers placed"
                icon={TagExport}
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
                          {renderSortHeader(offersPlaced, 'listingDate', 'List date')}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow key={row.offerNumber}>
                            <TableCell>
                              <Link
                                className="cds--link"
                                to={`/provincial/offers/${row.offerNumber}`}
                                state={SUMMARY_RETURN_STATE}
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
        </Tile>
      </Column>
    </Grid>
  )
}

export default ProvincialSummaryPage
