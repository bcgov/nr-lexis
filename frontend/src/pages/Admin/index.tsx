import { useMemo, useState, type FC } from 'react'
import {
  Button,
  Checkbox,
  Column,
  Grid,
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
import { useAuth } from '@/context/auth/useAuth'

type LegacyLaunchTool = {
  id: string
  label: string
  requiredAction: string
  legacyPath: string
  actionMapping: string
  description: string
}

const LEGACY_ADMIN_TOOLS: LegacyLaunchTool[] = [
  {
    id: 'lexisAgentAdmin',
    label: 'LEXIS Administration',
    requiredAction: '/lexisAgentAdmin',
    legacyPath: '/lexisAgentAdmin.do',
    actionMapping: 'view',
    description: 'Legacy administration dashboard.',
  },
  {
    id: 'lexisPolicyAdmin',
    label: 'Fee Policy Administration',
    requiredAction: '/lexisPolicyAdmin',
    legacyPath: '/lexisPolicyAdmin.do',
    actionMapping: 'view',
    description: 'Legacy fee policy administration page.',
  },
  {
    id: 'lexisFILAdmin',
    label: 'FIL Percent Administration',
    requiredAction: '/lexisFILAdmin',
    legacyPath: '/lexisFILAdmin.do',
    actionMapping: 'view',
    description: 'Legacy fee-in-lieu percent policy page.',
  },
]

const LEGACY_UPLOAD_TOOLS: LegacyLaunchTool[] = [
  {
    id: 'fileApplicationUpload',
    label: 'Application Upload',
    requiredAction: '/fileApplicationUpload',
    legacyPath: '/fileApplicationUpload.do',
    actionMapping: 'display',
    description: 'Legacy file upload workflow for applications.',
  },
  {
    id: 'fileExemptionUpload',
    label: 'Exemption Upload',
    requiredAction: '/fileExemptionUpload',
    legacyPath: '/fileExemptionUpload.do',
    actionMapping: 'display',
    description: 'Legacy file upload workflow for exemptions.',
  },
  {
    id: 'filePermitUpload',
    label: 'Permit Upload',
    requiredAction: '/filePermitUpload',
    legacyPath: '/filePermitUpload.do',
    actionMapping: 'display',
    description: 'Legacy file upload workflow for permits.',
  },
  {
    id: 'fileInvoiceUpload',
    label: 'Invoice Upload',
    requiredAction: '/fileInvoiceUpload',
    legacyPath: '/fileInvoiceUpload.do',
    actionMapping: 'display',
    description: 'Legacy file upload workflow for invoices.',
  },
]

const LEGACY_ACTION_CATALOG = [
  '/applicationDetails',
  '/applicationRemarks',
  '/applicationReport',
  '/applicationSearch',
  '/applicationsReview',
  '/approvedExemptionReport',
  '/blankListing',
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
  '/indianReservePermitDetails',
  '/indianReservePermitSearch',
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
  '/speciesGradeReport',
  '/summary',
  '/teacReport',
  '/tenureReport',
  '/transportReport',
  'approveExemption',
  'createApplication',
  'createOffer',
  'createPermit',
  'industryListing',
  'mofrListing',
  'saveExemption',
  'savePermit',
  'viewFederalApplication',
  'viewOICApplication',
] as const

const ROUTE_ACCESS_CHECKS = [
  { label: 'Provincial Summary', action: '/summary' },
  { label: 'Provincial Review', action: '/applicationsReview' },
  { label: 'Provincial Application Search', action: '/applicationSearch' },
  { label: 'Provincial Exemption Search', action: '/exemptionSearch' },
  { label: 'Provincial Offers Search', action: '/offersSearch' },
  { label: 'Provincial Permit Search', action: '/permitSearch' },
  { label: 'Federal Application Search', action: '/federalApplicationSearch' },
  { label: 'Indian Reserve Permit Search', action: '/indianReservePermitSearch' },
  { label: 'Reports', action: '/applicationReport' },
  { label: 'Admin', action: '/lexisAgentAdmin' },
]

const normalizeText = (value: string): string => value.trim().toLowerCase()

const getLegacyEndpointBase = (): string => {
  const configured = (import.meta.env.VITE_LEXIS_LEGACY_ENDPOINT_BASE ?? '/api').trim()
  if (!configured) {
    return '/api'
  }
  return configured.endsWith('/') ? configured.slice(0, -1) : configured
}

const buildLegacyToolUrl = (tool: LegacyLaunchTool): string => {
  const url = new URL(`${window.location.origin}${getLegacyEndpointBase()}${tool.legacyPath}`)
  url.searchParams.set('actionMapping', tool.actionMapping)
  return url.toString()
}

const AdminPage: FC = () => {
  const { capabilities, canPerform, refresh } = useAuth()
  const [actionFilter, setActionFilter] = useState('')
  const [showGrantedOnly, setShowGrantedOnly] = useState(false)
  const [launchErrorMessage, setLaunchErrorMessage] = useState('')

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

  const openLegacyTool = (tool: LegacyLaunchTool): void => {
    setLaunchErrorMessage('')
    const popup = window.open(
      buildLegacyToolUrl(tool),
      'legacyAdminWindow',
      'height=900,width=1280,menubar=0,resizable=1,status=1,scrollbars=1',
    )

    if (!popup) {
      setLaunchErrorMessage('Unable to open legacy tool window. Enable popups and try again.')
    }
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Administration</h1>
        <p>Base administration and authorization visibility for migration parity.</p>
      </Column>

      <Column sm={4} md={8} lg={8}>
        <Tile>
          <h2 className="dashboard-title">Session Snapshot</h2>
          <p>
            Principal: <strong>{capabilities.principal ?? 'Anonymous'}</strong>
          </p>
          <p>
            Authenticated: <strong>{capabilities.authenticated ? 'Yes' : 'No'}</strong>
          </p>
          <p>
            Welcome Target: <strong>{capabilities.welcomeTarget ?? 'N/A'}</strong>
          </p>
          <p>
            Legacy Path: <strong>{capabilities.legacyPath ?? 'N/A'}</strong>
          </p>
          <div className="landing-role-tags">
            {capabilities.roles.length === 0 && <Tag type="gray">No roles</Tag>}
            {capabilities.roles.map((role) => (
              <Tag key={role} type="blue">
                {role}
              </Tag>
            ))}
          </div>
          <div className="legacy-search-actions">
            <Button kind="ghost" size="sm" onClick={() => void refresh()}>
              Refresh Capabilities
            </Button>
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={8}>
        <Tile>
          <h2 className="dashboard-title">Route Access Check</h2>
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
                      <Tag type={granted ? 'green' : 'red'}>{granted ? 'Allowed' : 'Denied'}</Tag>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Legacy Admin and Upload Launchers</h2>
          <p>
            These links preserve `nr-lexis-main` entry points while Spring replacements are
            completed.
          </p>
          <p className="landing-help-text">
            TODO: replace direct legacy endpoint launches with native React screens once policy and
            upload APIs are ported.
          </p>

          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Tool</TableHeader>
                <TableHeader>Required Action</TableHeader>
                <TableHeader>Access</TableHeader>
                <TableHeader>Launch</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...LEGACY_ADMIN_TOOLS, ...LEGACY_UPLOAD_TOOLS].map((tool) => {
                const granted = canPerform(tool.requiredAction)
                return (
                  <TableRow key={tool.id}>
                    <TableCell>
                      <strong>{tool.label}</strong>
                      <div>{tool.description}</div>
                      <code>{tool.legacyPath}</code>
                    </TableCell>
                    <TableCell>
                      <code>{tool.requiredAction}</code>
                    </TableCell>
                    <TableCell>
                      <Tag type={granted ? 'green' : 'red'}>{granted ? 'Allowed' : 'Denied'}</Tag>
                    </TableCell>
                    <TableCell>
                      <Button
                        kind="secondary"
                        size="sm"
                        onClick={() => openLegacyTool(tool)}
                        disabled={!granted}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {launchErrorMessage && (
            <InlineNotification
              kind="error"
              title="Launch Error"
              subtitle={launchErrorMessage}
              lowContrast
              onCloseButtonClick={() => setLaunchErrorMessage('')}
            />
          )}
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Legacy Action Matrix</h2>
          <p>
            Granted actions: <strong>{grantedActionCount}</strong> of{' '}
            <strong>{LEGACY_ACTION_CATALOG.length}</strong>
          </p>
          <div className="legacy-search-grid">
            <TextInput
              id="actionFilter"
              labelText="Filter Action Name"
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
                      <Tag type={granted ? 'green' : 'red'}>{granted ? 'Yes' : 'No'}</Tag>
                    </TableCell>
                  </TableRow>
                )
              })}
              {visibleActions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2}>No actions matched the current filters.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Tile>
      </Column>
    </Grid>
  )
}

export default AdminPage
