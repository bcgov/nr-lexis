import { useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineNotification,
  Pagination,
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
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import SearchResultsTableFrame from '@/components/SearchResultsTableFrame'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import { useAuth } from '@/context/auth/useAuth'
import {
  searchFamUserRoleAssignments,
  type FamUserRoleAssignmentSearchResponse,
} from '@/service/fam-user-access-service'
import { resolveFamManageUrl } from '@/service/fam-manage-url'
import { normalizeFilterText as normalizeText } from '@/utils/text'

type LegacyLaunchTool = {
  id: string
  label: string
  requiredAction: string
  description: string
  reactUploadType?: 'application' | 'exemption' | 'permit' | 'invoice'
  reactPath?: string
}

const LEGACY_ADMIN_TOOLS: LegacyLaunchTool[] = [
  {
    id: 'lexisAgentAdmin',
    label: 'LEXIS administration',
    requiredAction: '/lexisAgentAdmin',
    description: 'User and access administration.',
    reactPath: '/admin',
  },
  {
    id: 'lexisPolicyAdmin',
    label: 'Fee policy administration',
    requiredAction: '/lexisPolicyAdmin',
    description: 'Fee policy administration.',
    reactPath: '/admin/policies/fee',
  },
  {
    id: 'lexisFILAdmin',
    label: 'Fee in lieu percent administration',
    requiredAction: '/lexisFILAdmin',
    description: 'Fee-in-lieu percent policy administration.',
    reactPath: '/admin/policies/fil',
  },
  {
    id: 'exportScheduleAdmin',
    label: 'Export schedule administration',
    requiredAction: '/lexisPolicyAdmin',
    description: 'Manage upcoming advertising list dates in EXPORT_SCHEDULE.',
    reactPath: '/admin/schedules',
  },
  {
    id: 'rtmEmsLogAmv',
    label: 'Average Monthly Values',
    requiredAction: '/rtmEmsLogAmvAdmin',
    description: 'Manage EMS log average monthly values.',
    reactPath: '/admin/rtm/emslogamv',
  },
]

const LEGACY_UPLOAD_TOOLS: LegacyLaunchTool[] = [
  {
    id: 'applicationSubmissionUpload',
    label: 'Application submission upload',
    requiredAction: 'uploadApplicationSubmission',
    description: 'Create applications from ESF LEXIS XML or GeoJSON submissions.',
    reactPath: '/provincial/application/upload',
  },
  {
    id: 'fileApplicationUpload',
    label: 'Application upload',
    requiredAction: '/fileApplicationUpload',
    description: 'Application document upload.',
    reactUploadType: 'application',
  },
  {
    id: 'fileExemptionUpload',
    label: 'Exemption upload',
    requiredAction: '/fileExemptionUpload',
    description: 'Exemption document upload.',
    reactUploadType: 'exemption',
  },
  {
    id: 'filePermitUpload',
    label: 'Permit upload',
    requiredAction: '/filePermitUpload',
    description: 'Permit document upload.',
    reactUploadType: 'permit',
  },
  {
    id: 'fileInvoiceUpload',
    label: 'Invoice upload',
    requiredAction: '/fileInvoiceUpload',
    description: 'Invoice document upload.',
    reactUploadType: 'invoice',
  },
]

const LEGACY_ACTION_CATALOG = [
  '/applicationDetails',
  '/applicationRemarks',
  '/applicationReport',
  '/applicationSearch',
  '/applicationsReview',
  '/approvedExemptionReport',
  '/changeApplicantType',
  '/createExemption',
  '/editCompletedApplications',
  '/exemptionDetails',
  '/exemptionReport',
  '/exemptionSearch',
  '/federalApplicationDetails',
  '/federalApplicationSearch',
  '/feeReport',
  '/fileApplicationUpload',
  '/fileExemptionUpload',
  '/fileInvoiceUpload',
  '/filePermitUpload',
  '/lexisAgentAdmin',
  '/lexisFILAdmin',
  '/lexisPolicyAdmin',
  '/offerDetails',
  '/offerReport',
  '/offersSearch',
  '/permitDetails',
  '/permitLedgerReport',
  '/permitReport',
  '/permitSearch',
  '/permitsReview',
  '/rtmEmsLogAmvAdmin',
  '/speciesGradeReport',
  '/teacReport',
  '/tenureReport',
  '/transportReport',
  'approveExemption',
  'createApplication',
  'createOffer',
  'manageFederalApplication',
  'mofrListing',
  'saveExemption',
  'savePermit',
  'uploadApplicationSubmission',
  'viewFederalApplication',
] as const

const ROUTE_ACCESS_CHECKS = [
  { label: 'Provincial review', action: '/applicationsReview' },
  { label: 'Provincial application search', action: '/applicationSearch' },
  { label: 'Provincial exemption search', action: '/exemptionSearch' },
  { label: 'Provincial offers search', action: '/offersSearch' },
  { label: 'Provincial permit search', action: '/permitSearch' },
  { label: 'Federal application search', action: '/federalApplicationSearch' },
  { label: 'Reports', action: '/applicationReport' },
  { label: 'Admin', action: '/lexisAgentAdmin' },
  { label: 'Average Monthly Values', action: '/rtmEmsLogAmvAdmin' },
]

const FAM_USER_ROLE_PAGE_SIZES = [10, 25, 50, 100]

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || String(value).trim().length === 0) {
    return '-'
  }
  return String(value)
}

const AdminPage = () => {
  const navigate = useNavigate()
  const { capabilities, canPerform, refresh } = useAuth()
  const [actionFilter, setActionFilter] = useState('')
  const [showGrantedOnly, setShowGrantedOnly] = useState(false)
  const [famSearchText, setFamSearchText] = useState('')
  const [famPageNumber, setFamPageNumber] = useState(1)
  const [famPageSize, setFamPageSize] = useState(10)
  const [famSearchResponse, setFamSearchResponse] =
    useState<FamUserRoleAssignmentSearchResponse | null>(null)
  const [famSearchError, setFamSearchError] = useState<string | null>(null)
  const [isFamSearchLoading, setIsFamSearchLoading] = useState(false)

  const visibleActions = useMemo(() => {
    return LEGACY_ACTION_CATALOG.filter((action) => {
      if (showGrantedOnly && !canPerform(action)) {
        return false
      }
      if (!actionFilter.trim()) {
        return true
      }
      return normalizeText(action).includes(normalizeText(actionFilter))
    })
  }, [actionFilter, canPerform, showGrantedOnly])

  const grantedActionCount = useMemo(() => {
    return LEGACY_ACTION_CATALOG.filter((action) => canPerform(action)).length
  }, [canPerform])
  const canSearchFamUserAccess = canPerform('/lexisAgentAdmin')
  const famManageUrl = resolveFamManageUrl()

  const runFamUserSearch = async (pageNumber = famPageNumber, pageSize = famPageSize) => {
    const search = famSearchText.trim()
    if (search.length < 3) {
      setFamSearchError('Enter at least 3 characters to search IDIR identities.')
      setFamSearchResponse(null)
      return
    }

    setIsFamSearchLoading(true)
    setFamSearchError(null)
    try {
      const response = await searchFamUserRoleAssignments({
        search,
        pageNumber,
        pageSize,
        sortBy: 'user_name',
        sortOrder: 'asc',
      })
      setFamSearchResponse(response)
      setFamPageNumber(response.pageNumber || pageNumber)
      setFamPageSize(response.pageSize || pageSize)
      if (response.message) {
        setFamSearchError(response.message)
      }
    } catch (error) {
      setFamSearchError(
        error instanceof Error ? error.message : 'Unable to search IDIR identities.',
      )
      setFamSearchResponse(null)
    } finally {
      setIsFamSearchLoading(false)
    }
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Administration"
          subtitle="Review session capabilities, verify IDIR identities, and open authorized administration tools."
          actions={
            <Button kind="ghost" size="sm" onClick={() => void refresh()}>
              Refresh Capabilities
            </Button>
          }
        />
      </Column>

      <Column sm={4} md={8} lg={8}>
        <Tile>
          <h2 className="dashboard-title">Session snapshot</h2>
          <p>
            Principal: <strong>{capabilities.principal ?? 'Anonymous'}</strong>
          </p>
          <p>
            Authenticated: <strong>{capabilities.authenticated ? 'Yes' : 'No'}</strong>
          </p>
          <p>
            Welcome Target: <strong>{capabilities.welcomeTarget ?? 'N/A'}</strong>
          </p>
          <div className="landing-role-tags">
            {capabilities.roles.length === 0 && <Tag type="gray">No roles</Tag>}
            {capabilities.roles.map((role) => (
              <Tag key={role} type="blue">
                {role}
              </Tag>
            ))}
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={8}>
        <Tile>
          <h2 className="dashboard-title">Route access check</h2>
          <Table useZebraStyles size="sm">
            <TableHead>
              <TableRow>
                <TableHeader>Route</TableHeader>
                <TableHeader>Access</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {ROUTE_ACCESS_CHECKS.map((entry) => {
                const granted = canPerform(entry.action)
                return (
                  <TableRow key={entry.label}>
                    <TableCell>{entry.label}</TableCell>
                    <TableCell>
                      <StatusTag
                        status={granted ? 'Allowed' : 'Denied'}
                        variant={granted ? 'positive' : 'negative'}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Tile>
      </Column>

      {canSearchFamUserAccess && (
        <Column sm={4} md={8} lg={16}>
          <Tile className="admin-identity-workspace">
            <div className="admin-section-heading">
              <div>
                <h2 className="dashboard-title">IDIR identity lookup</h2>
                <p>
                  Confirm that an IDIR identity exists before managing LEXIS role assignments in
                  FAM. This lookup does not display or change FAM roles.
                </p>
              </div>
              <Button
                href={famManageUrl}
                kind="tertiary"
                rel="noopener noreferrer"
                size="sm"
                target="_blank"
              >
                Manage in FAM
              </Button>
            </div>

            <div className="admin-identity-workspace__search">
              <div className="admin-identity-workspace__field">
                <TextInput
                  id="famUserSearch"
                  labelText="IDIR username"
                  value={famSearchText}
                  onChange={(event) => setFamSearchText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setFamPageNumber(1)
                      void runFamUserSearch(1, famPageSize)
                    }
                  }}
                />
              </div>
              <div className="admin-identity-workspace__actions">
                <Button
                  type="button"
                  onClick={() => {
                    setFamPageNumber(1)
                    void runFamUserSearch(1, famPageSize)
                  }}
                  disabled={isFamSearchLoading}
                >
                  Search IDIR
                </Button>
              </div>
            </div>

            {famSearchError && (
              <InlineNotification
                kind={famSearchResponse?.configured === false ? 'warning' : 'error'}
                lowContrast
                title="IDIR identity lookup"
                subtitle={famSearchError}
              />
            )}

            <SearchResultsTableFrame
              loading={isFamSearchLoading}
              loadingDescription="Loading IDIR identities..."
              totalItems={famSearchResponse?.configured ? famSearchResponse.total : undefined}
              totalItemsLabel={
                famSearchResponse?.configured
                  ? `${famSearchResponse.total.toLocaleString('en-CA')} IDIR ${famSearchResponse.total === 1 ? 'identity' : 'identities'} found`
                  : undefined
              }
            >
              {famSearchResponse?.results.length ? (
                <Table useZebraStyles size="sm">
                  <TableHead>
                    <TableRow>
                      <TableHeader>User</TableHeader>
                      <TableHeader>Type</TableHeader>
                      <TableHeader>Email</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {famSearchResponse.results.map((assignment) => (
                      <TableRow key={assignment.userId ?? assignment.userName}>
                        <TableCell>
                          <strong>{displayValue(assignment.userName)}</strong>
                          <div>{displayValue(assignment.fullName)}</div>
                        </TableCell>
                        <TableCell>
                          {displayValue(assignment.userTypeDescription ?? assignment.userTypeCode)}
                        </TableCell>
                        <TableCell>{displayValue(assignment.email)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : famSearchResponse ? (
                <EmptyState
                  title={
                    famSearchResponse.configured
                      ? 'No IDIR identities found'
                      : 'IDIR lookup unavailable'
                  }
                  description={
                    famSearchResponse.configured
                      ? 'No IDIR identities matched the current search.'
                      : 'IDIR identity lookup is not configured.'
                  }
                  headingLevel={3}
                />
              ) : (
                <EmptyState
                  title="Search IDIR identities"
                  description="Search to confirm an IDIR identity before opening FAM."
                  headingLevel={3}
                />
              )}

              {famSearchResponse && famSearchResponse.configured && (
                <Pagination
                  backwardText="Previous page"
                  forwardText="Next page"
                  itemsPerPageText="Items per page"
                  page={famPageNumber}
                  pageSize={famPageSize}
                  pageSizes={FAM_USER_ROLE_PAGE_SIZES}
                  totalItems={famSearchResponse.total}
                  onChange={({ page, pageSize }) => {
                    setFamPageNumber(page)
                    setFamPageSize(pageSize)
                    void runFamUserSearch(page, pageSize)
                  }}
                />
              )}
            </SearchResultsTableFrame>
          </Tile>
        </Column>
      )}

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Admin and upload tools</h2>

          <TableFrame ariaLabel="Admin and upload tools table">
            <Table useZebraStyles className="dashboard-data-table">
              <TableHead>
                <TableRow>
                  <TableHeader>Tool</TableHeader>
                  <TableHeader>Required action</TableHeader>
                  <TableHeader>Access</TableHeader>
                  <TableHeader>Open</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...LEGACY_ADMIN_TOOLS, ...LEGACY_UPLOAD_TOOLS].map((tool) => {
                  const granted = canPerform(tool.requiredAction)
                  const reactPath = tool.reactPath
                  return (
                    <TableRow key={tool.id}>
                      <TableCell>
                        <strong>{tool.label}</strong>
                        <div>{tool.description}</div>
                      </TableCell>
                      <TableCell>
                        <code>{tool.requiredAction}</code>
                      </TableCell>
                      <TableCell>
                        <StatusTag
                          status={granted ? 'Allowed' : 'Denied'}
                          variant={granted ? 'positive' : 'negative'}
                        />
                      </TableCell>
                      <TableCell>
                        {tool.reactUploadType ? (
                          <Button
                            kind="secondary"
                            size="sm"
                            onClick={() => navigate(`/admin/uploads?type=${tool.reactUploadType}`)}
                            disabled={!granted}
                          >
                            Open
                          </Button>
                        ) : reactPath ? (
                          <Button
                            kind="secondary"
                            size="sm"
                            onClick={() => navigate(reactPath)}
                            disabled={!granted}
                          >
                            Open
                          </Button>
                        ) : (
                          <span>-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableFrame>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Legacy action matrix</h2>
          <p>
            Granted actions: <strong>{grantedActionCount}</strong> of{' '}
            <strong>{LEGACY_ACTION_CATALOG.length}</strong>
          </p>
          <div className="legacy-search-grid">
            <TextInput
              id="actionFilter"
              labelText="Filter action name"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
            />
            <div>
              <Checkbox
                id="showGrantedOnly"
                labelText="Show granted actions only"
                checked={showGrantedOnly}
                onChange={(_, { checked }) => setShowGrantedOnly(Boolean(checked))}
              />
            </div>
          </div>

          {visibleActions.length > 0 ? (
            <Table useZebraStyles>
              <TableHead>
                <TableRow>
                  <TableHeader>Action</TableHeader>
                  <TableHeader>Granted</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleActions.map((action) => {
                  const granted = canPerform(action)
                  return (
                    <TableRow key={action}>
                      <TableCell>
                        <code>{action}</code>
                      </TableCell>
                      <TableCell>
                        <StatusTag
                          status={granted ? 'Yes' : 'No'}
                          variant={granted ? 'positive' : 'negative'}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No actions matched"
              description="No actions matched the current filters."
              headingLevel={3}
            />
          )}
        </Tile>
      </Column>
    </Grid>
  )
}

export default AdminPage
