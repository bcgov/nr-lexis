import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useNavigate } from 'react-router-dom'
import { AppNotification } from '../../components/AppNotification'
import ContentLoadingOverlay from '@/components/ContentLoadingOverlay'
import { useAuth } from '@/context/auth/useAuth'
import {
  buildPageDataCacheKey,
  getPageDataCache,
  getPageDataCacheGeneration,
  setPageDataCache,
} from '@/pages/shared/page-data-cache'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  countApplicationReviews,
  previewApplicationReviews,
} from '@/service/application-review-search-service'
import { countFederalApplications } from '@/service/federal-application-search-service'
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

type SummaryMetric = {
  key: SummaryMetricKey
  label: string
  description: string
  total: number
}

type SummaryReviewPreviewRow = {
  applicationNumber: string
  status: string
  listingDate: string
  region: string
}

type SummaryPageCacheData = {
  metrics: SummaryMetric[]
  reviewPreview: SummaryReviewPreviewRow[]
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
}

const INITIAL_METRICS: SummaryMetric[] = [
  {
    key: 'provincialApplications',
    label: 'Provincial applications',
    description: 'Total matched by current base search defaults.',
    total: 0,
  },
  {
    key: 'provincialExemptions',
    label: 'Provincial exemptions',
    description: 'Total exemption files in search scope.',
    total: 0,
  },
  {
    key: 'provincialOffers',
    label: 'Provincial offers',
    description: 'Total purchase offers in search scope.',
    total: 0,
  },
  {
    key: 'provincialPermits',
    label: 'Provincial permits',
    description: 'Total permit files in search scope.',
    total: 0,
  },
  {
    key: 'reviewQueue',
    label: 'Provincial review queue',
    description: 'Total applications in review queue.',
    total: 0,
  },
  {
    key: 'federalApplications',
    label: 'Federal applications',
    description: 'Total federal application files in scope.',
    total: 0,
  },
]

const ProvincialSummaryPage = () => {
  const navigate = useNavigate()
  const { capabilities, canPerform } = useAuth()
  const [metrics, setMetrics] = useState<SummaryMetric[]>(INITIAL_METRICS)
  const [hasLoadedSummary, setHasLoadedSummary] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [reviewPreview, setReviewPreview] = useState<SummaryReviewPreviewRow[]>([])
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

  const visibleMetrics = useMemo(
    () => INITIAL_METRICS.filter((metric) => canAccessSummaryRoute(metric.key)),
    [canAccessSummaryRoute],
  )

  const loadSummary = useCallback(
    async (options: { force?: boolean } = {}) => {
      const pageCacheGeneration = getPageDataCacheGeneration()
      const pageCacheKey = buildPageDataCacheKey('provincial-summary', capabilities?.principal, {
        visibleMetrics: visibleMetrics.map((metric) => metric.key),
        canOpenReviewApplication,
      })
      if (!options.force) {
        const cachedSummary = getPageDataCache<SummaryPageCacheData>(pageCacheKey)
        if (cachedSummary) {
          setMetrics(cachedSummary.metrics)
          setReviewPreview(cachedSummary.reviewPreview)
          setHasLoadedSummary(true)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

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
                receivedFromDate: '',
                receivedToDate: '',
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
                approvalFromDate: '',
                approvalToDate: '',
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
                invoiceNumber: '',
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
        }

        if (isLatestRequest() && pageCacheGeneration === getPageDataCacheGeneration()) {
          const nextMetrics = INITIAL_METRICS.map((metric) => ({
            ...metric,
            total: totalsByKey[metric.key],
          }))
          const nextReviewPreview = (reviewQueuePreview?.content ?? []).map((item) => ({
            applicationNumber: item.applicationNumber,
            status: item.status,
            listingDate: item.listingDate,
            region: item.region,
          }))

          const cacheUpdated = setPageDataCache(
            pageCacheKey,
            {
              metrics: nextMetrics,
              reviewPreview: nextReviewPreview,
            },
            pageCacheGeneration,
          )
          if (cacheUpdated) {
            setMetrics(nextMetrics)
            setReviewPreview(nextReviewPreview)
            setHasLoadedSummary(true)
          }
        }
      } catch (error) {
        if (isLatestRequest() && pageCacheGeneration === getPageDataCacheGeneration()) {
          console.error(error)
          setErrorMessage('Unable to calculate provincial summary metrics.')
          if (!hasLoadedSummary) {
            setMetrics(INITIAL_METRICS)
            setReviewPreview([])
          }
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    },
    [
      beginSummaryRequest,
      canAccessSummaryRoute,
      canOpenReviewApplication,
      capabilities?.principal,
      hasLoadedSummary,
      visibleMetrics,
    ],
  )

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const isRefreshingSummary = loading && hasLoadedSummary

  return (
    <Grid
      fullWidth
      className={`default-grid content-loading-region${isRefreshingSummary ? ' is-loading' : ''}`}
      inert={isRefreshingSummary ? true : undefined}
      aria-busy={isRefreshingSummary}
    >
      <ContentLoadingOverlay
        loading={isRefreshingSummary}
        loadingDescription="Refreshing summary metrics..."
      />
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial summary</h1>
        <p>Drill-down summary for operational totals and review queue triage.</p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-actions">
            <Button
              kind="secondary"
              onClick={() => void loadSummary({ force: true })}
              disabled={loading}
            >
              Refresh Summary
            </Button>
            {canAccessSummaryRoute('reviewQueue') && (
              <Button kind="ghost" onClick={() => navigate(SUMMARY_ROUTE_CONFIG.reviewQueue.path)}>
                Open review queue
              </Button>
            )}
          </div>
        </Tile>
      </Column>

      {loading && !hasLoadedSummary && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading summary metrics..." />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="error"
            title="Summary error"
            subtitle={errorMessage}
            lowContrast
            onCloseButtonClick={() => setErrorMessage('')}
          />
        </Column>
      )}

      {hasLoadedSummary &&
        metrics
          .filter((metric) =>
            visibleMetrics.some((visibleMetric) => visibleMetric.key === metric.key),
          )
          .map((metric) => (
            <Column key={metric.key} sm={4} md={4} lg={5}>
              <Tile>
                <h2 className="dashboard-title">{metric.label}</h2>
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

      {hasLoadedSummary && canAccessSummaryRoute('reviewQueue') && (
        <Column sm={4} md={8} lg={16}>
          <Tile>
            <h2 className="dashboard-title">Review queue preview</h2>
            <Table useZebraStyles>
              <TableHead>
                <TableRow>
                  <TableHeader>Application</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Listing date</TableHeader>
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
