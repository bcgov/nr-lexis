import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { searchApplicationReviews } from '@/service/application-review-search-service'
import { searchFederalApplications } from '@/service/federal-application-search-service'
import { searchIndianReservePermits } from '@/service/indian-reserve-permit-search-service'
import { searchProvincialApplications } from '@/service/provincial-application-search-service'
import { searchProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialOffers } from '@/service/provincial-offer-search-service'
import { searchProvincialPermits } from '@/service/provincial-permit-search-service'

type SummaryMetricKey =
  | 'provincialApplications'
  | 'provincialExemptions'
  | 'provincialOffers'
  | 'provincialPermits'
  | 'reviewQueue'
  | 'federalApplications'
  | 'indianReservePermits'

type SummaryMetric = {
  key: SummaryMetricKey
  label: string
  description: string
  total: number
}

type SummaryRouteConfig = {
  path: string
  requiredActions: string[]
}

const SUMMARY_ROUTE_CONFIG: Record<SummaryMetricKey, SummaryRouteConfig> = {
  provincialApplications: {
    path: '/provincial/application',
    requiredActions: ['/applicationSearch'],
  },
  provincialExemptions: {
    path: '/provincial/exemption',
    requiredActions: ['/exemptionSearch'],
  },
  provincialOffers: {
    path: '/provincial/offers',
    requiredActions: ['/offersSearch'],
  },
  provincialPermits: {
    path: '/provincial/permit',
    requiredActions: ['/permitSearch'],
  },
  reviewQueue: {
    path: '/provincial/review',
    requiredActions: ['/applicationsReview'],
  },
  federalApplications: {
    path: '/federal',
    requiredActions: ['/federalApplicationSearch', 'viewFederalApplication'],
  },
  indianReservePermits: {
    path: '/indian-reserve',
    requiredActions: ['/indianReservePermitSearch', 'viewOICApplication'],
  },
}

const INITIAL_METRICS: SummaryMetric[] = [
  {
    key: 'provincialApplications',
    label: 'Provincial Applications',
    description: 'Total matched by current base search defaults.',
    total: 0,
  },
  {
    key: 'provincialExemptions',
    label: 'Provincial Exemptions',
    description: 'Total exemption files in search scope.',
    total: 0,
  },
  {
    key: 'provincialOffers',
    label: 'Provincial Offers',
    description: 'Total purchase offers in search scope.',
    total: 0,
  },
  {
    key: 'provincialPermits',
    label: 'Provincial Permits',
    description: 'Total permit files in search scope.',
    total: 0,
  },
  {
    key: 'reviewQueue',
    label: 'Provincial Review Queue',
    description: 'Total applications in review queue.',
    total: 0,
  },
  {
    key: 'federalApplications',
    label: 'Federal Applications',
    description: 'Total federal application files in scope.',
    total: 0,
  },
  {
    key: 'indianReservePermits',
    label: 'Indigenous Reserve Permits',
    description: 'Total reserve permit files in scope.',
    total: 0,
  },
]

const ProvincialSummaryPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const [metrics, setMetrics] = useState<SummaryMetric[]>(INITIAL_METRICS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [reviewPreview, setReviewPreview] = useState<
    { applicationNumber: string; status: string; listingDate: string; region: string }[]
  >([])
  const beginSummaryRequest = useLatestRequestGuard()

  const canAccessSummaryRoute = useCallback(
    (key: SummaryMetricKey): boolean => {
      const routeConfig = SUMMARY_ROUTE_CONFIG[key]
      return routeConfig.requiredActions.some((action) => canPerform(action))
    },
    [canPerform],
  )

  const canOpenReviewApplication =
    canPerform('/applicationSearch') && canPerform('/applicationDetails')

  const accessibleMetricCount = useMemo(() => {
    return INITIAL_METRICS.filter((metric) => canAccessSummaryRoute(metric.key)).length
  }, [canAccessSummaryRoute])

  const loadSummary = useCallback(async () => {
    const isLatestRequest = beginSummaryRequest()
    setLoading(true)
    setErrorMessage('')

    try {
      const loadMetric = async <T,>(
        canAccess: boolean,
        load: () => Promise<T>,
      ): Promise<T | null> => (canAccess ? load() : null)

      const provincialApplications = await loadMetric(
        canAccessSummaryRoute('provincialApplications'),
        () =>
          searchProvincialApplications({
            filters: {
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
            },
            page: 0,
            pageSize: 1,
            sortField: 'applicationNumber',
            sortDirection: 'desc',
          }),
      )
      const provincialExemptions = await loadMetric(
        canAccessSummaryRoute('provincialExemptions'),
        () =>
          searchProvincialExemptions({
            filters: {
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
            },
            page: 0,
            pageSize: 1,
            sortField: 'exemptionNumber',
            sortDirection: 'asc',
          }),
      )
      const provincialOffers = await loadMetric(canAccessSummaryRoute('provincialOffers'), () =>
        searchProvincialOffers({
          filters: {
            applicationNumber: '',
            packageNumber: '',
            clientNumber: '',
            listingFromDate: '',
            listingToDate: '',
            region: [],
            withdrawalFromDate: '',
            withdrawalToDate: '',
          },
          page: 0,
          pageSize: 1,
          sortField: 'offerNumber',
          sortDirection: 'asc',
        }),
      )
      const provincialPermits = await loadMetric(canAccessSummaryRoute('provincialPermits'), () =>
        searchProvincialPermits({
          filters: {
            applicationNumber: '',
            packageNumber: '',
            region: [],
            issuedFromDate: '',
            issuedToDate: '',
            permitStatus: '',
            permitNumber: '',
            ownerClientNumber: '',
            applicantClientNumber: '',
          },
          page: 0,
          pageSize: 1,
          sortField: 'permitNumber',
          sortDirection: 'asc',
        }),
      )
      const reviewQueue = await loadMetric(canAccessSummaryRoute('reviewQueue'), () =>
        searchApplicationReviews({
          filters: {
            applicationNumber: '',
            productTypeCode: '',
            region: [],
            receivedFromDate: '',
            receivedToDate: '',
            listingFromDate: '',
            listingToDate: '',
          },
          page: 0,
          pageSize: 5,
          sortField: 'applicationNumber',
          sortDirection: 'asc',
        }),
      )
      const federalApplications = await loadMetric(
        canAccessSummaryRoute('federalApplications'),
        () =>
          searchFederalApplications({
            filters: {
              applicationNumber: '',
              packageNumber: '',
              applicationStatus: '',
              clientNumber: '',
              receivedFromDate: '',
              receivedToDate: '',
              listingFromDate: '',
              listingToDate: '',
            },
            page: 0,
            pageSize: 1,
            sortField: 'federalApplicationNumber',
            sortDirection: 'asc',
          }),
      )
      const indianReservePermits = await loadMetric(
        canAccessSummaryRoute('indianReservePermits'),
        () =>
          searchIndianReservePermits({
            filters: {
              permitNumber: '',
              packageNumber: '',
              fromPermitIssueDate: '',
              toPermitIssueDate: '',
              fromEstimatedShippingDate: '',
              toEstimatedShippingDate: '',
            },
            page: 0,
            pageSize: 1,
            sortField: 'permitNumber',
            sortDirection: 'asc',
          }),
      )

      const totalsByKey: Record<SummaryMetricKey, number> = {
        provincialApplications: provincialApplications?.page.totalElements ?? 0,
        provincialExemptions: provincialExemptions?.page.totalElements ?? 0,
        provincialOffers: provincialOffers?.page.totalElements ?? 0,
        provincialPermits: provincialPermits?.page.totalElements ?? 0,
        reviewQueue: reviewQueue?.page.totalElements ?? 0,
        federalApplications: federalApplications?.page.totalElements ?? 0,
        indianReservePermits: indianReservePermits?.page.totalElements ?? 0,
      }

      if (isLatestRequest()) {
        setMetrics(
          INITIAL_METRICS.map((metric) => ({
            ...metric,
            total: totalsByKey[metric.key],
          })),
        )

        setReviewPreview(
          (reviewQueue?.content ?? []).map((item) => ({
            applicationNumber: item.applicationNumber,
            status: item.status,
            listingDate: item.listingDate,
            region: item.region,
          })),
        )
      }
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setErrorMessage('Unable to calculate provincial summary metrics.')
        setMetrics(INITIAL_METRICS)
        setReviewPreview([])
      }
    } finally {
      if (isLatestRequest()) {
        setLoading(false)
      }
    }
  }, [beginSummaryRequest, canAccessSummaryRoute])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial Summary</h1>
        <p>Drill-down dashboard for operational totals and review queue triage.</p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <p>
            Accessible modules: <strong>{accessibleMetricCount}</strong> of{' '}
            <strong>{INITIAL_METRICS.length}</strong>
          </p>
          <div className="legacy-search-actions">
            <Button kind="secondary" onClick={() => void loadSummary()} disabled={loading}>
              Refresh Summary
            </Button>
            <Button
              kind="ghost"
              disabled={!canAccessSummaryRoute('reviewQueue')}
              onClick={() => navigate(SUMMARY_ROUTE_CONFIG.reviewQueue.path)}
            >
              Open Review Queue
            </Button>
          </div>
        </Tile>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading summary metrics..." />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <Column sm={4} md={8} lg={16}>
          <InlineNotification
            kind="error"
            title="Summary Error"
            subtitle={errorMessage}
            lowContrast
            onCloseButtonClick={() => setErrorMessage('')}
          />
        </Column>
      )}

      {!loading &&
        metrics.map((metric) => {
          const hasAccess = canAccessSummaryRoute(metric.key)
          return (
            <Column key={metric.key} sm={4} md={4} lg={5}>
              <Tile>
                <h2 className="dashboard-title">{metric.label}</h2>
                <Tag type={hasAccess ? 'green' : 'red'}>
                  {hasAccess ? 'Available' : 'Not Granted'}
                </Tag>
                <p className="summary-metric-value">{metric.total.toLocaleString()}</p>
                <p>{metric.description}</p>
                <div className="legacy-search-actions">
                  <Button
                    kind={hasAccess ? 'primary' : 'ghost'}
                    size="sm"
                    disabled={!hasAccess}
                    onClick={() => navigate(SUMMARY_ROUTE_CONFIG[metric.key].path)}
                  >
                    Open
                  </Button>
                </div>
              </Tile>
            </Column>
          )
        })}

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Review Queue Preview</h2>
          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Application</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Listing Date</TableHeader>
                <TableHeader>Region</TableHeader>
                <TableHeader>Open</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {reviewPreview.map((row) => (
                <TableRow key={row.applicationNumber}>
                  <TableCell>{row.applicationNumber}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.listingDate}</TableCell>
                  <TableCell>{row.region}</TableCell>
                  <TableCell>
                    <Button
                      kind="ghost"
                      size="sm"
                      disabled={!canOpenReviewApplication}
                      onClick={() =>
                        navigate(
                          `/provincial/application/${encodeURIComponent(row.applicationNumber)}`,
                        )
                      }
                    >
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {reviewPreview.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No review queue data available.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Tile>
      </Column>
    </Grid>
  )
}

export default ProvincialSummaryPage
