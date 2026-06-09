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
import {
  countApplicationReviews,
  previewApplicationReviews,
} from '@/service/application-review-search-service'
import { countFederalApplications } from '@/service/federal-application-search-service'
import { countIndianReservePermits } from '@/service/indian-reserve-permit-search-service'
import { countProvincialApplications } from '@/service/provincial-application-search-service'
import { countProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { countProvincialOffers } from '@/service/provincial-offer-search-service'
import { countProvincialPermits } from '@/service/provincial-permit-search-service'

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

  const visibleMetrics = useMemo(
    () => INITIAL_METRICS.filter((metric) => canAccessSummaryRoute(metric.key)),
    [canAccessSummaryRoute],
  )

  const loadSummary = useCallback(async () => {
    const isLatestRequest = beginSummaryRequest()
    setLoading(true)
    setErrorMessage('')

    try {
      const loadMetric = async <T,>(
        canAccess: boolean,
        load: () => Promise<T>,
      ): Promise<T | null> => (canAccess ? load() : null)

      const [
        provincialApplications,
        provincialExemptions,
        provincialOffers,
        provincialPermits,
        reviewQueueTotal,
        reviewQueuePreview,
        federalApplications,
        indianReservePermits,
      ] = await Promise.all([
        loadMetric(canAccessSummaryRoute('provincialApplications'), () =>
          countProvincialApplications({
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
        ),
        loadMetric(canAccessSummaryRoute('provincialExemptions'), () =>
          countProvincialExemptions({
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
        ),
        loadMetric(canAccessSummaryRoute('provincialOffers'), () =>
          countProvincialOffers({
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
        ),
        loadMetric(canAccessSummaryRoute('provincialPermits'), () =>
          countProvincialPermits({
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
        ),
        loadMetric(canAccessSummaryRoute('reviewQueue'), () =>
          countApplicationReviews({
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
            pageSize: 1,
            sortField: 'applicationNumber',
            sortDirection: 'asc',
          }),
        ),
        loadMetric(canAccessSummaryRoute('reviewQueue'), () =>
          previewApplicationReviews({
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
        ),
        loadMetric(canAccessSummaryRoute('federalApplications'), () =>
          countFederalApplications({
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
        ),
        loadMetric(canAccessSummaryRoute('indianReservePermits'), () =>
          countIndianReservePermits({
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
        ),
      ])

      const totalsByKey: Record<SummaryMetricKey, number> = {
        provincialApplications: provincialApplications ?? 0,
        provincialExemptions: provincialExemptions ?? 0,
        provincialOffers: provincialOffers ?? 0,
        provincialPermits: provincialPermits ?? 0,
        reviewQueue: reviewQueueTotal ?? 0,
        federalApplications: federalApplications ?? 0,
        indianReservePermits: indianReservePermits ?? 0,
      }

      if (isLatestRequest()) {
        setMetrics(
          INITIAL_METRICS.map((metric) => ({
            ...metric,
            total: totalsByKey[metric.key],
          })),
        )

        setReviewPreview(
          (reviewQueuePreview?.content ?? []).map((item) => ({
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
            {canAccessSummaryRoute('reviewQueue') && (
              <Button kind="ghost" onClick={() => navigate(SUMMARY_ROUTE_CONFIG.reviewQueue.path)}>
                Open Review Queue
              </Button>
            )}
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
        metrics
          .filter((metric) =>
            visibleMetrics.some((visibleMetric) => visibleMetric.key === metric.key),
          )
          .map((metric) => (
            <Column key={metric.key} sm={4} md={4} lg={5}>
              <Tile>
                <h2 className="dashboard-title">{metric.label}</h2>
                <Tag type="green">Available</Tag>
                <p className="summary-metric-value">{metric.total.toLocaleString()}</p>
                <p>{metric.description}</p>
                <div className="legacy-search-actions">
                  <Button
                    kind="primary"
                    size="sm"
                    onClick={() => navigate(SUMMARY_ROUTE_CONFIG[metric.key].path)}
                  >
                    Open
                  </Button>
                </div>
              </Tile>
            </Column>
          ))}

      {canAccessSummaryRoute('reviewQueue') && (
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
                  {canOpenReviewApplication && <TableHeader>Open</TableHeader>}
                </TableRow>
              </TableHead>
              <TableBody>
                {reviewPreview.map((row) => (
                  <TableRow key={row.applicationNumber}>
                    <TableCell>{row.applicationNumber}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.listingDate}</TableCell>
                    <TableCell>{row.region}</TableCell>
                    {canOpenReviewApplication && (
                      <TableCell>
                        <Button
                          kind="ghost"
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/provincial/application/${encodeURIComponent(row.applicationNumber)}`,
                            )
                          }
                        >
                          Open
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {reviewPreview.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canOpenReviewApplication ? 5 : 4}>
                      No review queue data available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Tile>
        </Column>
      )}
    </Grid>
  )
}

export default ProvincialSummaryPage
