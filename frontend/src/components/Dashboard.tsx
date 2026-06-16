import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Button, Column, Grid, InlineLoading, Tag, Tile } from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import { AppNotification } from '@/components/AppNotification'
import { useAuth } from '@/context/auth/useAuth'
import {
  buildPageDataCacheKey,
  getPageDataCache,
  setPageDataCache,
} from '@/pages/shared/page-data-cache'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { countApplicationReviews } from '@/service/application-review-search-service'
import { countFederalApplications } from '@/service/federal-application-search-service'
import { countIndianReservePermits } from '@/service/indian-reserve-permit-search-service'
import { countProvincialApplications } from '@/service/provincial-application-search-service'
import { countProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { countProvincialOffers } from '@/service/provincial-offer-search-service'
import { countProvincialPermits } from '@/service/provincial-permit-search-service'

type DashboardCountKey =
  | 'provincialApplications'
  | 'provincialExemptions'
  | 'provincialOffers'
  | 'provincialPermits'
  | 'reviewQueue'
  | 'federalApplications'
  | 'indianReservePermits'

type DashboardModule = {
  id: string
  title: string
  description: string
  path: string
  requiredActions: string[]
  countKey?: DashboardCountKey
}

type DashboardCounts = Record<DashboardCountKey, number>

const DASHBOARD_MODULES: DashboardModule[] = [
  {
    id: 'provincialReview',
    title: 'Provincial review',
    description: 'Approval and triage queue for applications.',
    path: '/provincial/review',
    requiredActions: ['/applicationsReview'],
    countKey: 'reviewQueue',
  },
  {
    id: 'provincialApplications',
    title: 'Provincial applications',
    description: 'Search and manage provincial applications.',
    path: '/provincial/application',
    requiredActions: ['/applicationSearch'],
    countKey: 'provincialApplications',
  },
  {
    id: 'provincialExemptions',
    title: 'Provincial exemptions',
    description: 'Search and maintain exemption files.',
    path: '/provincial/exemption',
    requiredActions: ['/exemptionSearch'],
    countKey: 'provincialExemptions',
  },
  {
    id: 'provincialOffers',
    title: 'Provincial offers',
    description: 'Search and inspect offer activity.',
    path: '/provincial/offers',
    requiredActions: ['/offersSearch'],
    countKey: 'provincialOffers',
  },
  {
    id: 'provincialPermits',
    title: 'Provincial permits',
    description: 'Search and inspect permit details.',
    path: '/provincial/permit',
    requiredActions: ['/permitSearch'],
    countKey: 'provincialPermits',
  },
  {
    id: 'federalApplications',
    title: 'Federal applications',
    description: 'Search federal applications.',
    path: '/federal',
    requiredActions: ['/federalApplicationSearch', 'viewFederalApplication'],
    countKey: 'federalApplications',
  },
  {
    id: 'indianReservePermits',
    title: 'Indigenous reserve permits',
    description: 'Search reserve permits.',
    path: '/indian-reserve',
    requiredActions: ['/indianReservePermitSearch', 'viewOICApplication'],
    countKey: 'indianReservePermits',
  },
]

const DASHBOARD_QUICK_ACTIONS: DashboardModule[] = [
  {
    id: 'openProvincialHub',
    title: 'Open Provincial Hub',
    description: '',
    path: '/provincial',
    requiredActions: [
      '/summary',
      '/applicationsReview',
      '/applicationSearch',
      '/exemptionSearch',
      '/offersSearch',
      '/permitSearch',
    ],
  },
  {
    id: 'openReviewQueue',
    title: 'Open review queue',
    description: '',
    path: '/provincial/review',
    requiredActions: ['/applicationsReview'],
  },
  {
    id: 'openReports',
    title: 'Open Reports',
    description: '',
    path: '/reports',
    requiredActions: [
      '/applicationReport',
      '/offerReport',
      '/teacReport',
      '/exemptionReport',
      '/permitLedgerReport',
      '/transportReport',
      '/speciesGradeReport',
      '/feeReport',
      '/tenureReport',
      'mofrListing',
    ],
  },
  {
    id: 'openAdmin',
    title: 'Open Admin',
    description: '',
    path: '/admin',
    requiredActions: ['/lexisAgentAdmin'],
  },
]

const INITIAL_COUNTS: DashboardCounts = {
  provincialApplications: 0,
  provincialExemptions: 0,
  provincialOffers: 0,
  provincialPermits: 0,
  reviewQueue: 0,
  federalApplications: 0,
  indianReservePermits: 0,
}

const Dashboard: FC = () => {
  const navigate = useNavigate()
  const { capabilities, canPerform } = useAuth()
  const [counts, setCounts] = useState<DashboardCounts>(INITIAL_COUNTS)
  const [countsLoaded, setCountsLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const beginCountsRequest = useLatestRequestGuard()

  const canAccessModule = useCallback(
    (requiredActions: string[]): boolean => {
      return requiredActions.some((action) => canPerform(action))
    },
    [canPerform],
  )

  const visibleModules = useMemo(
    () => DASHBOARD_MODULES.filter((module) => canAccessModule(module.requiredActions)),
    [canAccessModule],
  )

  const visibleQuickActions = useMemo(
    () => DASHBOARD_QUICK_ACTIONS.filter((action) => canAccessModule(action.requiredActions)),
    [canAccessModule],
  )

  const loadCounts = useCallback(
    async (options: { force?: boolean } = {}) => {
      const pageCacheKey = buildPageDataCacheKey('dashboard-counts', capabilities?.principal, {
        visibleModules: visibleModules.map((module) => module.id),
      })
      if (!options.force) {
        const cachedCounts = getPageDataCache<DashboardCounts>(pageCacheKey)
        if (cachedCounts) {
          setCounts(cachedCounts)
          setCountsLoaded(true)
          setLoading(false)
          setErrorMessage('')
          return
        }
      }

      const isLatestRequest = beginCountsRequest()
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
          reviewQueue,
          federalApplications,
          indianReservePermits,
        ] = await Promise.all([
          loadMetric(canAccessModule(['/applicationSearch']), () =>
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
          loadMetric(canAccessModule(['/exemptionSearch']), () =>
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
          loadMetric(canAccessModule(['/offersSearch']), () =>
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
          loadMetric(canAccessModule(['/permitSearch']), () =>
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
          loadMetric(canAccessModule(['/applicationsReview']), () =>
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
          loadMetric(canAccessModule(['/federalApplicationSearch', 'viewFederalApplication']), () =>
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
          loadMetric(canAccessModule(['/indianReservePermitSearch', 'viewOICApplication']), () =>
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

        if (isLatestRequest()) {
          const nextCounts = {
            provincialApplications: provincialApplications ?? 0,
            provincialExemptions: provincialExemptions ?? 0,
            provincialOffers: provincialOffers ?? 0,
            provincialPermits: provincialPermits ?? 0,
            reviewQueue: reviewQueue ?? 0,
            federalApplications: federalApplications ?? 0,
            indianReservePermits: indianReservePermits ?? 0,
          }
          setCounts(nextCounts)
          setPageDataCache(pageCacheKey, nextCounts)
          setCountsLoaded(true)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setCounts(INITIAL_COUNTS)
          setCountsLoaded(false)
          setErrorMessage('Unable to refresh dashboard counts.')
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    },
    [beginCountsRequest, canAccessModule, capabilities?.principal, visibleModules],
  )

  useEffect(() => {
    void loadCounts()
  }, [loadCounts])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1 className="dashboard-title">LEXIS Dashboard</h1>
        <p>
          Role-aware launchpad for base search tables, review queues, and administration routes.
        </p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-actions">
            <Button
              kind="secondary"
              onClick={() => void loadCounts({ force: true })}
              disabled={loading}
            >
              Refresh Dashboard
            </Button>
          </div>
        </Tile>
      </Column>

      {visibleQuickActions.length > 0 && (
        <Column sm={4} md={8} lg={16}>
          <Tile>
            <h2 className="dashboard-title">Quick actions</h2>
            <div className="legacy-search-actions">
              {visibleQuickActions.map((action) => (
                <Button
                  key={action.id}
                  kind="primary"
                  size="sm"
                  onClick={() => navigate(action.path)}
                >
                  {action.title}
                </Button>
              ))}
            </div>
          </Tile>
        </Column>
      )}

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Refreshing dashboard metrics..." />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="warning"
            title="Dashboard warning"
            subtitle={errorMessage}
            lowContrast
            onCloseButtonClick={() => setErrorMessage('')}
          />
        </Column>
      )}

      {visibleModules.map((module) => {
        const total = module.countKey ? counts[module.countKey] : null

        return (
          <Column key={module.id} sm={4} md={4} lg={8}>
            <Tile>
              <h2 className="dashboard-title">{module.title}</h2>
              <Tag type="green">Available</Tag>
              {total !== null && (
                <p className="summary-metric-value">
                  {countsLoaded ? total.toLocaleString() : '-'}
                </p>
              )}
              <p>{module.description}</p>
              <div className="legacy-search-actions">
                <Button kind="primary" size="sm" onClick={() => navigate(module.path)}>
                  Open
                </Button>
              </div>
            </Tile>
          </Column>
        )
      })}
    </Grid>
  )
}

export default Dashboard
