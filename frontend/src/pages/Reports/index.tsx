import { useMemo, useState, type FC } from 'react'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineNotification,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextArea,
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
  legacyPath: string
  fields: ReportFieldDefinition[]
  actionMappings: ReportActionMapping[]
}

type ReportFieldDefinition = {
  key: string
  label: string
  type: 'text' | 'date' | 'select' | 'textarea'
  placeholder?: string
  options?: Array<{
    value: string
    label: string
  }>
  helperText?: string
}

type ReportActionMapping = {
  value: string
  label: string
}

const OUTPUT_FORMAT_FIELD: ReportFieldDefinition = {
  key: 'outputFormat',
  label: 'Output Format',
  type: 'select',
  options: [
    { value: 'PDF', label: 'PDF' },
    { value: 'CSV', label: 'CSV' },
  ],
}

const REGION_CODES_FIELD: ReportFieldDefinition = {
  key: 'region',
  label: 'Region Codes',
  type: 'text',
  placeholder: 'Comma-separated region codes',
}

const ORG_UNIT_CODES_FIELD: ReportFieldDefinition = {
  key: 'orgUnitNumber',
  label: 'Region Codes',
  type: 'text',
  placeholder: 'Comma-separated region codes',
}

const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'applicationReport',
    title: 'Application Report',
    category: 'Provincial',
    action: '/applicationReport',
    description: 'Applications by status and timeline.',
    legacyPath: '/applicationReport.do',
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      REGION_CODES_FIELD,
      {
        key: 'exemptionReason',
        label: 'Exemption Reason Code',
        type: 'text',
      },
      {
        key: 'exportJurisdictionCode',
        label: 'Jurisdiction Code',
        type: 'text',
      },
      {
        key: 'clientNumber',
        label: 'Client Number',
        type: 'text',
      },
      {
        key: 'growthType',
        label: 'Growth Type Code',
        type: 'text',
      },
      {
        key: 'fromDate',
        label: 'Received From Date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Received To Date',
        type: 'date',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
  {
    id: 'offerReport',
    title: 'Offer Report',
    category: 'Provincial',
    action: '/offerReport',
    description: 'Offer activity and approval outcomes.',
    legacyPath: '/offerReport.do',
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      REGION_CODES_FIELD,
      {
        key: 'exportJurisdictionCode',
        label: 'Jurisdiction Code',
        type: 'text',
      },
      {
        key: 'clientNumber',
        label: 'Client Number',
        type: 'text',
      },
      {
        key: 'fromDate',
        label: 'Application From Date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Application To Date',
        type: 'date',
      },
      {
        key: 'withdrawnFromDate',
        label: 'Withdrawn From Date',
        type: 'date',
      },
      {
        key: 'withdrawnToDate',
        label: 'Withdrawn To Date',
        type: 'date',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
  {
    id: 'teacReport',
    title: 'TEAC Report',
    category: 'Cross-Module',
    action: '/teacReport',
    description: 'TEAC package readiness and review data.',
    legacyPath: '/teacReport.do',
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      REGION_CODES_FIELD,
      {
        key: 'exportJurisdictionCode',
        label: 'Jurisdiction Code',
        type: 'text',
      },
      {
        key: 'exportSchedule',
        label: 'Advertising Schedule',
        type: 'text',
        helperText: 'Use exportSchedule ID or formatted value from backend schedule data.',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
  {
    id: 'exemptionReport',
    title: 'Exemption Report',
    category: 'Provincial',
    action: '/exemptionReport',
    description: 'Exemption volumes, balances, and status.',
    legacyPath: '/exemptionReport.do',
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      REGION_CODES_FIELD,
      {
        key: 'exemptionReason',
        label: 'Exemption Reason Code',
        type: 'text',
      },
      {
        key: 'growthType',
        label: 'Growth Type Code',
        type: 'text',
      },
      {
        key: 'exemptionType',
        label: 'Exemption Type Code',
        type: 'text',
      },
      {
        key: 'exemptionStatus',
        label: 'Exemption Status Code',
        type: 'text',
      },
      {
        key: 'listingFromDate',
        label: 'Listing From Date',
        type: 'date',
      },
      {
        key: 'listingToDate',
        label: 'Listing To Date',
        type: 'date',
      },
      {
        key: 'clientNumber',
        label: 'Client Number',
        type: 'text',
      },
      {
        key: 'exemptionNumber',
        label: 'Exemption Number',
        type: 'text',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
  {
    id: 'permitLedgerReport',
    title: 'Permit Ledger Report',
    category: 'Provincial',
    action: '/permitLedgerReport',
    description: 'Permit issuance and ledger summary.',
    legacyPath: '/permitLedgerReport.do',
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      REGION_CODES_FIELD,
      {
        key: 'clientNumber',
        label: 'Client Number',
        type: 'text',
      },
      {
        key: 'exemptionNumber',
        label: 'Exemption Number',
        type: 'text',
      },
      {
        key: 'exemptionType',
        label: 'Exemption Type Code',
        type: 'text',
      },
      {
        key: 'exemptionReason',
        label: 'Exemption Reason Code',
        type: 'text',
      },
      {
        key: 'permitStatus',
        label: 'Permit Status Code',
        type: 'text',
      },
      {
        key: 'growthType',
        label: 'Growth Type Code',
        type: 'text',
      },
      {
        key: 'timberMark',
        label: 'Timber Mark',
        type: 'text',
      },
      {
        key: 'destinationCountry',
        label: 'Destination Country Code',
        type: 'text',
      },
      {
        key: 'fromDate',
        label: 'Issued From Date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Issued To Date',
        type: 'date',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
  {
    id: 'transportReport',
    title: 'Transport Report',
    category: 'Cross-Module',
    action: '/transportReport',
    description: 'Destination and transport statistics.',
    legacyPath: '/transportReport.do',
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      {
        key: 'jurisdiction',
        label: 'Jurisdiction Code',
        type: 'text',
      },
      REGION_CODES_FIELD,
      {
        key: 'destinationCountry',
        label: 'Destination Country Code',
        type: 'text',
      },
      {
        key: 'portOfExport',
        label: 'Port of Export Code',
        type: 'text',
      },
      {
        key: 'status',
        label: 'Permit Status Code',
        type: 'text',
      },
      {
        key: 'fromDate',
        label: 'Permit Issued From Date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Permit Issued To Date',
        type: 'date',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
  {
    id: 'speciesGradeReport',
    title: 'Species & Grade Report',
    category: 'Provincial',
    action: '/speciesGradeReport',
    description: 'Species/grade composition analytics.',
    legacyPath: '/speciesGradeReport.do',
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      REGION_CODES_FIELD,
      {
        key: 'permitStatus',
        label: 'Permit Status Code',
        type: 'text',
      },
      {
        key: 'exemptionNumber',
        label: 'Exemption Number',
        type: 'text',
      },
      {
        key: 'exemptionType',
        label: 'Exemption Type Code',
        type: 'text',
      },
      {
        key: 'exemptionReason',
        label: 'Exemption Reason Code',
        type: 'text',
      },
      {
        key: 'growthType',
        label: 'Growth Type Code',
        type: 'text',
      },
      {
        key: 'timberMark',
        label: 'Timber Mark',
        type: 'text',
      },
      {
        key: 'forestFileId',
        label: 'Forest File ID',
        type: 'text',
      },
      {
        key: 'fromDate',
        label: 'Permit Issued From Date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Permit Issued To Date',
        type: 'date',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
  {
    id: 'feeReport',
    title: 'Fee Report',
    category: 'Provincial',
    action: '/feeReport',
    description: 'Fee in lieu and invoice totals.',
    legacyPath: '/feeReport.do',
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      ORG_UNIT_CODES_FIELD,
      {
        key: 'exemptionNumber',
        label: 'Exemption Number',
        type: 'text',
      },
      {
        key: 'exemptionType',
        label: 'Exemption Type Code',
        type: 'text',
      },
      {
        key: 'exemptionReason',
        label: 'Exemption Reason Code',
        type: 'text',
      },
      {
        key: 'growthType',
        label: 'Growth Type Code',
        type: 'text',
      },
      {
        key: 'fromDate',
        label: 'Permit Issued From Date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Permit Issued To Date',
        type: 'date',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
  {
    id: 'tenureReport',
    title: 'Tenure Analysis Report',
    category: 'Cross-Module',
    action: '/tenureReport',
    description: 'Tenure trends by region and period.',
    legacyPath: '/tenureReport.do',
    actionMappings: [
      { value: 'generatePermitReport', label: 'Permit Details Report' },
      { value: 'generateTenureReport', label: 'Tenure Types Report' },
      { value: 'generateMarkReport', label: 'Timber Marks Report' },
      { value: 'generateFileReport', label: 'Forest File Report' },
    ],
    fields: [
      {
        key: 'fromDate',
        label: 'Issued From Date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Issued To Date',
        type: 'date',
      },
      REGION_CODES_FIELD,
      {
        key: 'exemptionNumber',
        label: 'Exemption Number',
        type: 'text',
      },
      {
        key: 'exemptionType',
        label: 'Exemption Type Code',
        type: 'text',
      },
      {
        key: 'clientNumber',
        label: 'Client Number',
        type: 'text',
      },
      {
        key: 'forestFileId',
        label: 'Forest File ID',
        type: 'text',
      },
      {
        key: 'exemptionReason',
        label: 'Exemption Reason Code',
        type: 'text',
      },
      {
        key: 'clientType',
        label: 'Client Type',
        type: 'select',
        options: [
          { value: '', label: 'Select client type' },
          { value: 'P', label: 'Permit Holder' },
          { value: 'M', label: 'Mark Holder' },
        ],
      },
      {
        key: 'tenureTypes',
        label: 'Tenure Types',
        type: 'textarea',
        placeholder: 'Comma-separated values (max 6)',
      },
      {
        key: 'timberMarks',
        label: 'Timber Marks',
        type: 'textarea',
        placeholder: 'Comma-separated values (max 6)',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
  {
    id: 'mofrListing',
    title: 'MOFR Listing Export',
    category: 'Federal',
    action: 'mofrListing',
    description: 'Exportable listing output for MOFR workflows.',
    legacyPath: '/biweeklyListing.do',
    actionMappings: [
      { value: 'generateIndustryPDF', label: 'Advertising List PDF' },
      { value: 'generateIndustryCSV', label: 'Advertising List CSV' },
      { value: 'generate', label: 'Generate With Filters' },
    ],
    fields: [
      REGION_CODES_FIELD,
      {
        key: 'exportJurisdictionCode',
        label: 'Jurisdiction Code',
        type: 'text',
      },
      {
        key: 'fromDate',
        label: 'Listing From Date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Listing To Date',
        type: 'date',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
]

const normalizeText = (value: string): string => value.trim().toLowerCase()

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

const normalizeClientNumber = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed || !/^[0-9]+$/.test(trimmed)) {
    return trimmed
  }

  return trimmed.padStart(8, '0')
}

const normalizeUppercase = (value: string): string => value.trim().toUpperCase()

const getReportBasePath = (): string => {
  const configured = (import.meta.env.VITE_LEXIS_REPORT_ENDPOINT_BASE ?? '/api').trim()
  if (!configured) {
    return '/api'
  }
  return configured.endsWith('/') ? configured.slice(0, -1) : configured
}

const appendCsvValues = (url: URL, key: string, value: string): void => {
  splitCsv(value).forEach((entry) => url.searchParams.append(key, entry))
}

const buildReportUrl = (
  report: ReportDefinition,
  values: Record<string, string>,
  selectedActionMapping: string,
): string => {
  const basePath = getReportBasePath()
  const url = new URL(`${window.location.origin}${basePath}${report.legacyPath}`)

  url.searchParams.set('actionMapping', selectedActionMapping)

  Object.entries(values).forEach(([key, rawValue]) => {
    const value = rawValue.trim()
    if (!value || key === 'tenureTypes' || key === 'timberMarks') {
      return
    }

    if (key === 'clientNumber') {
      url.searchParams.set(key, normalizeClientNumber(value))
      return
    }

    if (key === 'forestFileId' || key === 'timberMark') {
      url.searchParams.set(key, normalizeUppercase(value))
      return
    }

    if (key === 'region' || key === 'orgUnitNumber') {
      appendCsvValues(url, key, value)
      return
    }

    url.searchParams.set(key, value)
  })

  if (report.id === 'tenureReport') {
    const tenureTypes = splitCsv(values.tenureTypes ?? '').slice(0, 6)
    const timberMarks = splitCsv(values.timberMarks ?? '').slice(0, 6)

    tenureTypes.forEach((value, index) => {
      url.searchParams.set(`tenureType${index + 1}`, normalizeUppercase(value))
    })

    timberMarks.forEach((value, index) => {
      url.searchParams.set(`timberMark${index + 1}`, normalizeUppercase(value))
    })
  }

  return url.toString()
}

const ReportsPage: FC = () => {
  const { canPerform } = useAuth()
  const [searchText, setSearchText] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | ReportDefinition['category']>(
    'ALL',
  )
  const [showGrantedOnly, setShowGrantedOnly] = useState(false)
  const [selectedReportId, setSelectedReportId] = useState(REPORT_DEFINITIONS[0].id)
  const [reportValuesById, setReportValuesById] = useState<Record<string, Record<string, string>>>(
    {},
  )
  const [selectedActionById, setSelectedActionById] = useState<Record<string, string>>({})
  const [launchErrorMessage, setLaunchErrorMessage] = useState('')

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

  const selectedReport =
    REPORT_DEFINITIONS.find((report) => report.id === selectedReportId) ?? REPORT_DEFINITIONS[0]

  const selectedReportValues = useMemo(() => {
    return reportValuesById[selectedReport.id] ?? {}
  }, [reportValuesById, selectedReport.id])

  const selectedActionMapping =
    selectedActionById[selectedReport.id] ?? selectedReport.actionMappings[0].value

  const previewUrl = useMemo(() => {
    return buildReportUrl(selectedReport, selectedReportValues, selectedActionMapping)
  }, [selectedActionMapping, selectedReport, selectedReportValues])

  const onSelectReport = (reportId: string): void => {
    setSelectedReportId(reportId)
    setLaunchErrorMessage('')
  }

  const onUpdateField = (fieldKey: string, value: string): void => {
    setReportValuesById((current) => ({
      ...current,
      [selectedReport.id]: {
        ...current[selectedReport.id],
        [fieldKey]: value,
      },
    }))
  }

  const onResetFields = (): void => {
    setReportValuesById((current) => ({
      ...current,
      [selectedReport.id]: {},
    }))
    setLaunchErrorMessage('')
  }

  const onOpenReportRequest = (): void => {
    setLaunchErrorMessage('')
    const reportWindow = window.open(
      previewUrl,
      'reportWindow',
      'height=900,width=1280,menubar=0,resizable=1,status=1,scrollbars=1',
    )

    if (!reportWindow) {
      setLaunchErrorMessage('Unable to open report window. Enable popups for this site and retry.')
    }
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Reports</h1>
        <p>
          Legacy report launcher parity for key LEXIS report actions. Access is driven by granted
          actions from session capabilities.
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
          <p className="landing-help-text">
            TODO: replace free-text code inputs with backend-driven report option endpoints when
            Spring report APIs are ported.
          </p>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={9}>
        <Tile>
          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Report</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader>Required Action</TableHeader>
                <TableHeader>Access</TableHeader>
                <TableHeader>Open</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleReports.map((report) => {
                const hasAccess = canPerform(report.action)
                const isSelected = selectedReport.id === report.id
                return (
                  <TableRow key={report.id} className={isSelected ? 'selected-row' : undefined}>
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
                    <TableCell>
                      <Button
                        kind={isSelected ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={() => onSelectReport(report.id)}
                      >
                        {isSelected ? 'Selected' : 'Configure'}
                      </Button>
                    </TableCell>
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

      <Column sm={4} md={8} lg={7}>
        <Tile>
          <h2 className="dashboard-title">{selectedReport.title}</h2>
          <p>{selectedReport.description}</p>
          <p>
            Legacy endpoint: <code>{selectedReport.legacyPath}</code>
          </p>
          <p>
            Required action: <code>{selectedReport.action}</code>
          </p>
          <div className="legacy-search-grid">
            <Select
              id="reportActionMapping"
              labelText="Action Mapping"
              value={selectedActionMapping}
              onChange={(event) =>
                setSelectedActionById((current) => ({
                  ...current,
                  [selectedReport.id]: event.target.value,
                }))
              }
            >
              {selectedReport.actionMappings.map((actionMapping) => (
                <SelectItem
                  key={actionMapping.value}
                  value={actionMapping.value}
                  text={actionMapping.label}
                />
              ))}
            </Select>
            {selectedReport.fields.map((field) => {
              const currentValue =
                selectedReportValues[field.key] ?? (field.key === 'outputFormat' ? 'PDF' : '')

              if (field.type === 'select') {
                return (
                  <Select
                    key={field.key}
                    id={`${selectedReport.id}-${field.key}`}
                    labelText={field.label}
                    value={currentValue}
                    onChange={(event) => onUpdateField(field.key, event.target.value)}
                  >
                    {(field.options ?? [{ value: '', label: 'Select an option' }]).map((option) => (
                      <SelectItem key={option.value} value={option.value} text={option.label} />
                    ))}
                  </Select>
                )
              }

              if (field.type === 'textarea') {
                return (
                  <TextArea
                    key={field.key}
                    id={`${selectedReport.id}-${field.key}`}
                    labelText={field.label}
                    value={currentValue}
                    placeholder={field.placeholder}
                    helperText={field.helperText}
                    onChange={(event) => onUpdateField(field.key, event.target.value)}
                    rows={3}
                  />
                )
              }

              return (
                <TextInput
                  key={field.key}
                  id={`${selectedReport.id}-${field.key}`}
                  type={field.type === 'date' ? 'date' : 'text'}
                  labelText={field.label}
                  value={currentValue}
                  placeholder={field.placeholder}
                  helperText={field.helperText}
                  onChange={(event) => onUpdateField(field.key, event.target.value)}
                />
              )
            })}
          </div>
          <div className="legacy-search-actions">
            <Button
              kind="primary"
              onClick={onOpenReportRequest}
              disabled={!canPerform(selectedReport.action)}
            >
              Open Report Request
            </Button>
            <Button kind="ghost" onClick={onResetFields}>
              Reset Fields
            </Button>
          </div>
          {!canPerform(selectedReport.action) && (
            <p className="landing-help-text">
              This report is blocked because the required action is not granted.
            </p>
          )}
          <TextArea
            id="reportRequestPreviewUrl"
            labelText="Generated Request URL"
            value={previewUrl}
            readOnly
            rows={6}
          />
          {launchErrorMessage && (
            <InlineNotification
              kind="error"
              title="Report Launch Error"
              subtitle={launchErrorMessage}
              lowContrast
              onCloseButtonClick={() => setLaunchErrorMessage('')}
            />
          )}
        </Tile>
      </Column>
    </Grid>
  )
}

export default ReportsPage
