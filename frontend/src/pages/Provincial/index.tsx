import { useCallback, useMemo, useState, type FC } from 'react'
import {
  Button,
  Checkbox,
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
  TextInput,
  Tile,
} from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { searchApplicationReviews } from '@/service/application-review-search-service'
import { searchProvincialApplications } from '@/service/provincial-application-search-service'
import { searchProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialOffers } from '@/service/provincial-offer-search-service'
import { searchProvincialPermits } from '@/service/provincial-permit-search-service'

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
    title: 'Review Queue',
    description: 'Review queue for application approval workflow.',
    path: '/provincial/review',
    requiredActions: ['/applicationsReview'],
    metricKey: 'reviewQueue',
  },
  {
    id: 'summary',
    title: 'Summary',
    description: 'Cross-module summary metrics and queue preview.',
    path: '/provincial/summary',
    requiredActions: ['/summary'],
    metricKey: null,
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
    label: 'Create Application',
    path: '/provincial/application/create',
    requiredActions: ['/applicationSearch', 'createApplication'],
  },
  {
    id: 'createExemption',
    label: 'Create Exemption',
    path: '/provincial/exemption/create',
    requiredActions: ['/exemptionSearch', '/createExemption'],
  },
  {
    id: 'createOffer',
    label: 'Create Offer',
    path: '/provincial/offers/create',
    requiredActions: ['/offersSearch', 'createOffer'],
  },
  {
    id: 'createPermit',
    label: 'Create Permit',
    path: '/provincial/permit/create',
    requiredActions: ['/permitSearch', 'createPermit'],
  },
  {
    id: 'openReviewQueue',
    label: 'Open Review Queue',
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

const normalizeText = (value: string): string => value.trim().toLowerCase()

const ProvincialPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const [searchText, setSearchText] = useState('')
  const [showAccessibleOnly, setShowAccessibleOnly] = useState(false)
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

      const applications = await loadMetric(canAccessWorkflowTotal('provincialApplications'), () =>
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
      const exemptions = await loadMetric(canAccessWorkflowTotal('provincialExemptions'), () =>
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
      const offers = await loadMetric(canAccessWorkflowTotal('provincialOffers'), () =>
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
      const permits = await loadMetric(canAccessWorkflowTotal('provincialPermits'), () =>
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
      const reviewQueue = await loadMetric(canAccessWorkflowTotal('reviewQueue'), () =>
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

      if (isLatestRequest()) {
        setTotals({
          provincialApplications: applications?.page.totalElements ?? 0,
          provincialExemptions: exemptions?.page.totalElements ?? 0,
          provincialOffers: offers?.page.totalElements ?? 0,
          provincialPermits: permits?.page.totalElements ?? 0,
          reviewQueue: reviewQueue?.page.totalElements ?? 0,
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
      if (showAccessibleOnly && !hasAccess) {
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
  }, [canPerform, searchText, showAccessibleOnly])

  const accessibleCount = useMemo(() => {
    return WORKFLOWS.filter((workflow) =>
      workflow.requiredActions.some((action) => canPerform(action)),
    ).length
  }, [canPerform])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial</h1>
        <p>Provincial module landing with route access checks and search totals.</p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <p>
            Accessible workflows: <strong>{accessibleCount}</strong> of{' '}
            <strong>{WORKFLOWS.length}</strong>
          </p>
          <div className="legacy-search-grid">
            <TextInput
              id="provincialWorkflowSearch"
              labelText="Search workflow"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search title, route, or description"
            />
            <div>
              <Checkbox
                id="provincialShowAccessibleOnly"
                labelText="Show accessible workflows only"
                checked={showAccessibleOnly}
                onChange={(_, payload) => setShowAccessibleOnly(Boolean(payload.checked))}
              />
            </div>
          </div>
          <div className="legacy-search-actions">
            <Button kind="secondary" onClick={() => void loadTotals()} disabled={loadingTotals}>
              Refresh Totals
            </Button>
            <Button kind="ghost" onClick={() => navigate('/provincial/summary')}>
              Open Summary
            </Button>
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Quick Actions</h2>
          <div className="legacy-search-actions">
            {QUICK_ACTIONS.map((action) => {
              const canAccessAction = action.requiredActions.some((requiredAction) =>
                canPerform(requiredAction),
              )

              return (
                <Button
                  key={action.id}
                  kind={canAccessAction ? 'primary' : 'ghost'}
                  size="sm"
                  disabled={!canAccessAction}
                  onClick={() => navigate(action.path)}
                >
                  {action.label}
                </Button>
              )
            })}
          </div>
        </Tile>
      </Column>

      {loadingTotals && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Refreshing provincial totals..." />
        </Column>
      )}

      {!loadingTotals && !!totalsError && (
        <Column sm={4} md={8} lg={16}>
          <InlineNotification
            kind="warning"
            title="Totals Warning"
            subtitle={totalsError}
            lowContrast
            onCloseButtonClick={() => setTotalsError('')}
          />
        </Column>
      )}

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Workflow</TableHeader>
                <TableHeader>Description</TableHeader>
                <TableHeader>Route</TableHeader>
                <TableHeader>Access</TableHeader>
                <TableHeader>Total</TableHeader>
                <TableHeader>Open</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleWorkflows.map((workflow) => {
                const hasAccess = workflow.requiredActions.some((action) => canPerform(action))
                const workflowTotal = workflow.metricKey ? totals[workflow.metricKey] : null

                return (
                  <TableRow key={workflow.id}>
                    <TableCell>{workflow.title}</TableCell>
                    <TableCell>{workflow.description}</TableCell>
                    <TableCell>
                      <code>{workflow.path}</code>
                    </TableCell>
                    <TableCell>
                      <Tag type={hasAccess ? 'green' : 'red'}>
                        {hasAccess ? 'Available' : 'Not Granted'}
                      </Tag>
                    </TableCell>
                    <TableCell>
                      {workflowTotal === null || !totalsLoaded
                        ? '-'
                        : workflowTotal.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        kind={hasAccess ? 'primary' : 'ghost'}
                        size="sm"
                        disabled={!hasAccess}
                        onClick={() => navigate(workflow.path)}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {visibleWorkflows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    No provincial workflows matched the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Tile>
      </Column>
    </Grid>
  )
}

export default ProvincialPage
