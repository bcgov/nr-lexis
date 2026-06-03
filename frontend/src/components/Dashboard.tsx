import { useCallback, useMemo, useState, type FC } from 'react'
import { Button, Column, Grid, InlineLoading, InlineNotification, Tag, Tile } from '@carbon/react'
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
    id: 'provincialSummary',
    title: 'Provincial Summary',
    description: 'Operational totals and review queue drilldown.',
    path: '/provincial/summary',
    requiredActions: ['/summary'],
  },
  {
    id: 'provincialReview',
    title: 'Provincial Review',
    description: 'Approval and triage queue for applications.',
    path: '/provincial/review',
    requiredActions: ['/applicationsReview'],
    countKey: 'reviewQueue',
  },
  {
    id: 'provincialApplications',
    title: 'Provincial Applications',
    description: 'Search and manage provincial applications.',
    path: '/provincial/application',
    requiredActions: ['/applicationSearch'],
    countKey: 'provincialApplications',
  },
  {
    id: 'provincialExemptions',
    title: 'Provincial Exemptions',
    description: 'Search and maintain exemption files.',
    path: '/provincial/exemption',
    requiredActions: ['/exemptionSearch'],
    countKey: 'provincialExemptions',
  },
  {
    id: 'provincialOffers',
    title: 'Provincial Offers',
    description: 'Search and inspect offer activity.',
    path: '/provincial/offers',
    requiredActions: ['/offersSearch'],
    countKey: 'provincialOffers',
  },
  {
    id: 'provincialPermits',
    title: 'Provincial Permits',
    description: 'Search and inspect permit details.',
    path: '/provincial/permit',
    requiredActions: ['/permitSearch'],
    countKey: 'provincialPermits',
  },
  {
    id: 'federalApplications',
    title: 'Federal Applications',
    description: 'Access federal application search workflows.',
    path: '/federal',
    requiredActions: ['/federalApplicationSearch', 'viewFederalApplication'],
    countKey: 'federalApplications',
  },
  {
    id: 'indianReservePermits',
    title: 'Indigenous Reserve Permits',
    description: 'Access reserve permit search workflows.',
    path: '/indian-reserve',
    requiredActions: ['/indianReservePermitSearch', 'viewOICApplication'],
    countKey: 'indianReservePermits',
  },
  {
    id: 'reports',
    title: 'Reports',
    description: 'Generate report outputs and export packages.',
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
    id: 'admin',
    title: 'Admin',
    description: 'Policy and upload administration workflows.',
    path: '/admin',
    requiredActions: ['/lexisAgentAdmin'],
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
    title: 'Open Review Queue',
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
  const { canPerform } = useAuth()
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

  const accessibleModuleCount = useMemo(() => {
    return DASHBOARD_MODULES.filter((module) => canAccessModule(module.requiredActions)).length
  }, [canAccessModule])

  const loadCounts = useCallback(async () => {
    const isLatestRequest = beginCountsRequest()
    setLoading(true)
    setErrorMessage('')

    try {
      const loadMetric = async <T,>(
        canAccess: boolean,
        load: () => Promise<T>,
      ): Promise<T | null> => (canAccess ? load() : null)

      const provincialApplications = await loadMetric(canAccessModule(['/applicationSearch']), () =>
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
      const provincialExemptions = await loadMetric(canAccessModule(['/exemptionSearch']), () =>
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
      const provincialOffers = await loadMetric(canAccessModule(['/offersSearch']), () =>
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
      const provincialPermits = await loadMetric(canAccessModule(['/permitSearch']), () =>
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
      const reviewQueue = await loadMetric(canAccessModule(['/applicationsReview']), () =>
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
          pageSize: 1,
          sortField: 'applicationNumber',
          sortDirection: 'asc',
        }),
      )
      const federalApplications = await loadMetric(
        canAccessModule(['/federalApplicationSearch', 'viewFederalApplication']),
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
        canAccessModule(['/indianReservePermitSearch', 'viewOICApplication']),
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

      if (isLatestRequest()) {
        setCounts({
          provincialApplications: provincialApplications?.page.totalElements ?? 0,
          provincialExemptions: provincialExemptions?.page.totalElements ?? 0,
          provincialOffers: provincialOffers?.page.totalElements ?? 0,
          provincialPermits: provincialPermits?.page.totalElements ?? 0,
          reviewQueue: reviewQueue?.page.totalElements ?? 0,
          federalApplications: federalApplications?.page.totalElements ?? 0,
          indianReservePermits: indianReservePermits?.page.totalElements ?? 0,
        })
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
  }, [beginCountsRequest, canAccessModule])

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
          <p>
            Accessible modules: <strong>{accessibleModuleCount}</strong> of{' '}
            <strong>{DASHBOARD_MODULES.length}</strong>
          </p>
          <div className="legacy-search-actions">
            <Button kind="secondary" onClick={() => void loadCounts()} disabled={loading}>
              Refresh Dashboard
            </Button>
            <Button
              kind="ghost"
              disabled={!canAccessModule(['/summary'])}
              onClick={() => navigate('/provincial/summary')}
            >
              Open Provincial Summary
            </Button>
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Quick Actions</h2>
          <div className="legacy-search-actions">
            {DASHBOARD_QUICK_ACTIONS.map((action) => {
              const hasAccess = canAccessModule(action.requiredActions)
              return (
                <Button
                  key={action.id}
                  kind={hasAccess ? 'primary' : 'ghost'}
                  size="sm"
                  disabled={!hasAccess}
                  onClick={() => navigate(action.path)}
                >
                  {action.title}
                </Button>
              )
            })}
          </div>
        </Tile>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Refreshing dashboard metrics..." />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <Column sm={4} md={8} lg={16}>
          <InlineNotification
            kind="warning"
            title="Dashboard Warning"
            subtitle={errorMessage}
            lowContrast
            onCloseButtonClick={() => setErrorMessage('')}
          />
        </Column>
      )}

      {DASHBOARD_MODULES.map((module) => {
        const hasAccess = canAccessModule(module.requiredActions)
        const total = module.countKey ? counts[module.countKey] : null

        return (
          <Column key={module.id} sm={4} md={4} lg={8}>
            <Tile>
              <h2 className="dashboard-title">{module.title}</h2>
              <Tag type={hasAccess ? 'green' : 'red'}>
                {hasAccess ? 'Available' : 'Not Granted'}
              </Tag>
              {total !== null && (
                <p className="summary-metric-value">
                  {countsLoaded ? total.toLocaleString() : '-'}
                </p>
              )}
              <p>{module.description}</p>
              <div className="legacy-search-actions">
                <Button
                  kind={hasAccess ? 'primary' : 'ghost'}
                  size="sm"
                  disabled={!hasAccess}
                  onClick={() => navigate(module.path)}
                >
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
