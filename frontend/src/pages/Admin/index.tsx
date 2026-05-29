import { useMemo, useState, type FC } from 'react'
import {
  Button,
  Checkbox,
  Column,
  Grid,
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

type LegacyLaunchTool = {
  id: string
  label: string
  requiredAction: string
  description: string
  reactUploadType?: 'application' | 'exemption' | 'permit' | 'invoice' | 'scaleXml'
  reactPath?: string
}

const LEGACY_ADMIN_TOOLS: LegacyLaunchTool[] = [
  {
    id: 'lexisAgentAdmin',
    label: 'LEXIS Administration',
    requiredAction: '/lexisAgentAdmin',
    description: 'Legacy administration dashboard.',
    reactPath: '/admin',
  },
  {
    id: 'lexisPolicyAdmin',
    label: 'Fee Policy Administration',
    requiredAction: '/lexisPolicyAdmin',
    description: 'Legacy fee policy administration page.',
    reactPath: '/admin/policies',
  },
  {
    id: 'lexisFILAdmin',
    label: 'FIL Percent Administration',
    requiredAction: '/lexisFILAdmin',
    description: 'Legacy fee-in-lieu percent policy page.',
    reactPath: '/admin/policies',
  },
]

const LEGACY_UPLOAD_TOOLS: LegacyLaunchTool[] = [
  {
    id: 'fileApplicationUpload',
    label: 'Application Upload',
    requiredAction: '/fileApplicationUpload',
    description: 'Legacy file upload workflow for applications.',
    reactUploadType: 'application',
  },
  {
    id: 'fileExemptionUpload',
    label: 'Exemption Upload',
    requiredAction: '/fileExemptionUpload',
    description: 'Legacy file upload workflow for exemptions.',
    reactUploadType: 'exemption',
  },
  {
    id: 'filePermitUpload',
    label: 'Permit Upload',
    requiredAction: '/filePermitUpload',
    description: 'Legacy file upload workflow for permits.',
    reactUploadType: 'permit',
  },
  {
    id: 'fileInvoiceUpload',
    label: 'Invoice Upload',
    requiredAction: '/fileInvoiceUpload',
    description: 'Legacy file upload workflow for invoices.',
    reactUploadType: 'invoice',
  },
  {
    id: 'scaleXmlUpload',
    label: 'Scale XML Upload',
    requiredAction: 'savePermit',
    description: 'Parse multiple scale rows from XML before saving them to a permit.',
    reactUploadType: 'scaleXml',
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
  { label: 'Indigenous Reserve Permit Search', action: '/indianReservePermitSearch' },
  { label: 'Reports', action: '/applicationReport' },
  { label: 'Admin', action: '/lexisAgentAdmin' },
]

const normalizeText = (value: string): string => value.trim().toLowerCase()

const AdminPage: FC = () => {
  const navigate = useNavigate()
  const { capabilities, canPerform, refresh } = useAuth()
  const [actionFilter, setActionFilter] = useState('')
  const [showGrantedOnly, setShowGrantedOnly] = useState(false)

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
          <h2 className="dashboard-title">Admin and Upload Tools</h2>
          <p>
            Open native React workflows for admin and upload tasks while backend migration
            progresses.
          </p>

          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Tool</TableHeader>
                <TableHeader>Required Action</TableHeader>
                <TableHeader>Access</TableHeader>
                <TableHeader>Open</TableHeader>
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
                    </TableCell>
                    <TableCell>
                      <code>{tool.requiredAction}</code>
                    </TableCell>
                    <TableCell>
                      <Tag type={granted ? 'green' : 'red'}>{granted ? 'Allowed' : 'Denied'}</Tag>
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
                      ) : tool.reactPath ? (
                        <Button
                          kind="secondary"
                          size="sm"
                          onClick={() => navigate(tool.reactPath)}
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
