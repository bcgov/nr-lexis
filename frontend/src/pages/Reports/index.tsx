import { useMemo, useState, type FC } from 'react'
import {
  Checkbox,
  Column,
  Grid,
  Select,
  SelectItem,
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

type ReportDefinition = {
  id: string
  title: string
  category: 'Provincial' | 'Federal' | 'Cross-Module'
  action: string
  description: string
}

const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'applicationReport',
    title: 'Application Report',
    category: 'Provincial',
    action: '/applicationReport',
    description: 'Applications by status and timeline.',
  },
  {
    id: 'offerReport',
    title: 'Offer Report',
    category: 'Provincial',
    action: '/offerReport',
    description: 'Offer activity and approval outcomes.',
  },
  {
    id: 'teacReport',
    title: 'TEAC Report',
    category: 'Cross-Module',
    action: '/teacReport',
    description: 'TEAC package readiness and review data.',
  },
  {
    id: 'exemptionReport',
    title: 'Exemption Report',
    category: 'Provincial',
    action: '/exemptionReport',
    description: 'Exemption volumes, balances, and status.',
  },
  {
    id: 'permitLedgerReport',
    title: 'Permit Ledger Report',
    category: 'Provincial',
    action: '/permitLedgerReport',
    description: 'Permit issuance and ledger summary.',
  },
  {
    id: 'transportReport',
    title: 'Transport Report',
    category: 'Cross-Module',
    action: '/transportReport',
    description: 'Destination and transport statistics.',
  },
  {
    id: 'speciesGradeReport',
    title: 'Species & Grade Report',
    category: 'Provincial',
    action: '/speciesGradeReport',
    description: 'Species/grade composition analytics.',
  },
  {
    id: 'feeReport',
    title: 'Fee Report',
    category: 'Provincial',
    action: '/feeReport',
    description: 'Fee in lieu and invoice totals.',
  },
  {
    id: 'tenureReport',
    title: 'Tenure Analysis Report',
    category: 'Cross-Module',
    action: '/tenureReport',
    description: 'Tenure trends by region and period.',
  },
  {
    id: 'mofrListing',
    title: 'MOFR Listing Export',
    category: 'Federal',
    action: 'mofrListing',
    description: 'Exportable listing output for MOFR workflows.',
  },
]

const normalizeText = (value: string): string => value.trim().toLowerCase()

const ReportsPage: FC = () => {
  const { canPerform } = useAuth()
  const [searchText, setSearchText] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | ReportDefinition['category']>(
    'ALL',
  )
  const [showGrantedOnly, setShowGrantedOnly] = useState(false)

  const visibleReports = useMemo(() => {
    return REPORT_DEFINITIONS.filter((report) => {
      const hasAccess = canPerform(report.action)
      if (showGrantedOnly && !hasAccess) {
        return false
      }
      if (selectedCategory !== 'ALL' && report.category !== selectedCategory) {
        return false
      }
      if (!searchText.trim()) {
        return true
      }
      return (
        normalizeText(report.title).includes(normalizeText(searchText)) ||
        normalizeText(report.action).includes(normalizeText(searchText))
      )
    })
  }, [canPerform, searchText, selectedCategory, showGrantedOnly])

  const accessibleCount = useMemo(() => {
    return REPORT_DEFINITIONS.filter((report) => canPerform(report.action)).length
  }, [canPerform])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Reports</h1>
        <p>
          Base report catalog parity for legacy report actions. Access is driven by granted actions
          from session capabilities.
        </p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <p>
            Accessible reports: <strong>{accessibleCount}</strong> of{' '}
            <strong>{REPORT_DEFINITIONS.length}</strong>
          </p>
          <div className="legacy-search-grid">
            <TextInput
              id="reportSearch"
              labelText="Search report name or action"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              id="reportCategory"
              labelText="Category"
              value={selectedCategory}
              onChange={(event) =>
                setSelectedCategory(event.target.value as 'ALL' | ReportDefinition['category'])
              }
            >
              <SelectItem value="ALL" text="All categories" />
              <SelectItem value="Provincial" text="Provincial" />
              <SelectItem value="Federal" text="Federal" />
              <SelectItem value="Cross-Module" text="Cross-Module" />
            </Select>
            <div>
              <Checkbox
                id="showGrantedReportsOnly"
                labelText="Show accessible reports only"
                checked={showGrantedOnly}
                onChange={(_, payload) => setShowGrantedOnly(Boolean(payload.checked))}
              />
            </div>
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Report</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader>Required Action</TableHeader>
                <TableHeader>Access</TableHeader>
                <TableHeader>Description</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleReports.map((report) => {
                const hasAccess = canPerform(report.action)
                return (
                  <TableRow key={report.id}>
                    <TableCell>{report.title}</TableCell>
                    <TableCell>{report.category}</TableCell>
                    <TableCell>
                      <code>{report.action}</code>
                    </TableCell>
                    <TableCell>
                      <Tag type={hasAccess ? 'green' : 'red'}>
                        {hasAccess ? 'Available' : 'Not Granted'}
                      </Tag>
                    </TableCell>
                    <TableCell>{report.description}</TableCell>
                  </TableRow>
                )
              })}
              {visibleReports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No reports matched the current filters.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Tile>
      </Column>
    </Grid>
  )
}

export default ReportsPage
