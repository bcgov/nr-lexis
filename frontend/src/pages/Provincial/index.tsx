import { useCallback, useMemo, useState } from 'react'
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
  TextInput,
  Tile,
} from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import { AppNotification } from '../../components/AppNotification'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import TableFrame from '@/components/TableFrame'
import { useAuth } from '@/context/auth/useAuth'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { countApplicationReviews } from '@/service/application-review-search-service'
import { countProvincialApplications } from '@/service/provincial-application-search-service'
import { countProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { countProvincialOffers } from '@/service/provincial-offer-search-service'
import { countProvincialPermits } from '@/service/provincial-permit-search-service'
import { normalizeFilterText as normalizeText } from '@/utils/text'

type WorkflowMetricKey =
  | 'provincialApplications'
  | 'provincialExemptions'
  | 'provincialOffers'
  | 'provincialPermits'
  | 'reviewQueue'

type ProvincialWorkflowDefinition = {
  id: string
  title: string
  description: string
  path: string
  requiredActions: string[]
  metricKey: WorkflowMetricKey | null
}

type WorkflowTotals = Record<WorkflowMetricKey, number>

type ProvincialQuickAction = {
  id: string
  label: string
  path: string
  requiredActions: string[]
}

const WORKFLOWS: ProvincialWorkflowDefinition[] = [
  {
    id: 'applicationSearch',
    title: 'Applications',
    description: 'Search and maintain provincial applications.',
    path: '/provincial/application',
    requiredActions: ['/applicationSearch'],
    metricKey: 'provincialApplications',
  },
  {
    id: 'exemptionSearch',
    title: 'Exemptions',
    description: 'Search exemption files and volume balances.',
    path: '/provincial/exemption',
    requiredActions: ['/exemptionSearch'],
    metricKey: 'provincialExemptions',
  },
  {
    id: 'offersSearch',
    title: 'Offers',
    description: 'Search purchase offers and withdrawal activity.',
    path: '/provincial/offers',
    requiredActions: ['/offersSearch'],
    metricKey: 'provincialOffers',
  },
  {
    id: 'permitSearch',
    title: 'Permits',
    description: 'Search provincial permits and open permit details.',
    path: '/provincial/permit',
    requiredActions: ['/permitSearch'],
    metricKey: 'provincialPermits',
  },
  {
    id: 'applicationsReview',
    title: 'Review queue',
    description: 'Application approval queue.',
    path: '/provincial/review',
    requiredActions: ['/applicationsReview'],
    metricKey: 'reviewQueue',
  },
]

const EMPTY_TOTALS: WorkflowTotals = {
  provincialApplications: 0,
  provincialExemptions: 0,
  provincialOffers: 0,
  provincialPermits: 0,
  reviewQueue: 0,
}

const QUICK_ACTIONS: ProvincialQuickAction[] = [
  {
    id: 'createApplication',
    label: 'Create application',
    path: '/provincial/application/create',
    requiredActions: ['/applicationSearch', 'createApplication'],
  },
  {
    id: 'uploadApplicationSubmission',
    label: 'Upload application submission',
    path: '/provincial/application/upload',
    requiredActions: ['uploadApplicationSubmission'],
  },
  {
    id: 'createExemption',
    label: 'Create exemption',
    path: '/provincial/exemption/create',
    requiredActions: ['/exemptionSearch', '/createExemption'],
  },
  {
    id: 'createOffer',
    label: 'Create offer',
    path: '/provincial/offers/create',
    requiredActions: ['/offersSearch', 'createOffer'],
  },
  {
    id: 'openReviewQueue',
    label: 'Open review queue',
    path: '/provincial/review',
    requiredActions: ['/applicationsReview'],
  },
]

const WORKFLOW_TOTAL_ACTION_REQUIREMENTS: Record<WorkflowMetricKey, string[]> = {
  provincialApplications: ['/applicationSearch'],
  provincialExemptions: ['/exemptionSearch'],
  provincialOffers: ['/offersSearch'],
  provincialPermits: ['/permitSearch'],
  reviewQueue: ['/applicationsReview'],
}

const ProvincialPage = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const [searchText, setSearchText] = useState('')
  const [loadingTotals, setLoadingTotals] = useState(false)
  const [totalsError, setTotalsError] = useState('')
  const [totals, setTotals] = useState<WorkflowTotals>(EMPTY_TOTALS)
  const [totalsLoaded, setTotalsLoaded] = useState(false)
  const beginTotalsRequest = useLatestRequestGuard()

  const canAccessWorkflowTotal = useCallback(
    (key: WorkflowMetricKey): boolean => {
      return WORKFLOW_TOTAL_ACTION_REQUIREMENTS[key].some((action) => canPerform(action))
    },
    [canPerform],
  )

  const loadTotals = useCallback(async () => {
    const isLatestRequest = beginTotalsRequest()
    setLoadingTotals(true)
    setTotalsError('')

    try {
      const loadMetric = async <T,>(
        canAccess: boolean,
        load: () => Promise<T>,
      ): Promise<T | null> => (canAccess ? load() : null)

      const [applications, exemptions, offers, permits, reviewQueue] = await Promise.all([
        loadMetric(canAccessWorkflowTotal('provincialApplications'), () =>
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
        loadMetric(canAccessWorkflowTotal('provincialExemptions'), () =>
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
        loadMetric(canAccessWorkflowTotal('provincialOffers'), () =>
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
        loadMetric(canAccessWorkflowTotal('provincialPermits'), () =>
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
        loadMetric(canAccessWorkflowTotal('reviewQueue'), () =>
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
      ])

      if (isLatestRequest()) {
        setTotals({
          provincialApplications: applications ?? 0,
          provincialExemptions: exemptions ?? 0,
          provincialOffers: offers ?? 0,
          provincialPermits: permits ?? 0,
          reviewQueue: reviewQueue ?? 0,
        })
        setTotalsLoaded(true)
      }
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setTotalsError('Unable to refresh provincial totals.')
        setTotals(EMPTY_TOTALS)
        setTotalsLoaded(false)
      }
    } finally {
      if (isLatestRequest()) {
        setLoadingTotals(false)
      }
    }
  }, [beginTotalsRequest, canAccessWorkflowTotal])

  const visibleWorkflows = useMemo(() => {
    return WORKFLOWS.filter((workflow) => {
      const hasAccess = workflow.requiredActions.some((action) => canPerform(action))
      if (!hasAccess) {
        return false
      }

      if (!searchText.trim()) {
        return true
      }

      const normalized = normalizeText(searchText)
      return (
        normalizeText(workflow.title).includes(normalized) ||
        normalizeText(workflow.description).includes(normalized) ||
        normalizeText(workflow.path).includes(normalized)
      )
    })
  }, [canPerform, searchText])

  const visibleQuickActions = useMemo(
    () =>
      QUICK_ACTIONS.filter((action) =>
        action.requiredActions.every((requiredAction) => canPerform(requiredAction)),
      ),
    [canPerform],
  )

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Provincial workflows"
          subtitle="Open provincial applications, exemptions, offers, permits, and review work."
        />
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-grid">
            <TextInput
              id="provincialWorkflowSearch"
              labelText="Search area"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search title, route, or description"
            />
          </div>
          <div className="legacy-search-actions">
            <Button kind="tertiary" onClick={() => void loadTotals()} disabled={loadingTotals}>
              Refresh Totals
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
                  {action.label}
                </Button>
              ))}
            </div>
          </Tile>
        </Column>
      )}

      {loadingTotals && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Refreshing provincial totals…" />
        </Column>
      )}

      {!loadingTotals && !!totalsError && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="warning"
            title="Totals warning"
            subtitle={totalsError}
            lowContrast
            onCloseButtonClick={() => setTotalsError('')}
          />
        </Column>
      )}

      <Column sm={4} md={8} lg={16}>
        <Tile>
          {visibleWorkflows.length > 0 ? (
            <TableFrame ariaLabel="Provincial workflows table">
              <Table size="md" useZebraStyles className="dashboard-data-table">
                <TableHead>
                  <TableRow>
                    <TableHeader>Area</TableHeader>
                    <TableHeader>Description</TableHeader>
                    <TableHeader>Route</TableHeader>
                    <TableHeader>Total</TableHeader>
                    <TableHeader>Open</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleWorkflows.map((workflow) => {
                    const workflowTotal = workflow.metricKey ? totals[workflow.metricKey] : null

                    return (
                      <TableRow key={workflow.id}>
                        <TableCell>{workflow.title}</TableCell>
                        <TableCell>{workflow.description}</TableCell>
                        <TableCell>
                          <code>{workflow.path}</code>
                        </TableCell>
                        <TableCell>
                          {workflowTotal === null || !totalsLoaded
                            ? '—'
                            : workflowTotal.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Button kind="primary" size="sm" onClick={() => navigate(workflow.path)}>
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableFrame>
          ) : (
            <EmptyState
              title="No provincial workflows found"
              description="No provincial areas matched the current filters."
            />
          )}
        </Tile>
      </Column>
    </Grid>
  )
}

export default ProvincialPage
