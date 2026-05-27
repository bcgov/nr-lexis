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
import { buildLegacyReportUrl, runReport } from '@/service/report-service'

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

const triggerBrowserDownload = (blob: Blob, filename: string): void => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

const openBlobInNewTab = (blob: Blob): boolean => {
  const objectUrl = URL.createObjectURL(blob)
  const openedWindow = window.open(
    objectUrl,
    'reportWindow',
    'height=900,width=1280,menubar=0,resizable=1,status=1,scrollbars=1',
  )

  if (!openedWindow) {
    URL.revokeObjectURL(objectUrl)
    return false
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  return true
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
  const [legacyFallbackMessage, setLegacyFallbackMessage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

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
    return buildLegacyReportUrl(
      selectedReport.legacyPath,
      selectedReportValues,
      selectedActionMapping,
    )
  }, [selectedActionMapping, selectedReport, selectedReportValues])

  const onSelectReport = (reportId: string): void => {
    setSelectedReportId(reportId)
    setLaunchErrorMessage('')
    setLegacyFallbackMessage('')
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
    setLegacyFallbackMessage('')
  }

  const onOpenReportRequest = async (): Promise<void> => {
    setLaunchErrorMessage('')
    setLegacyFallbackMessage('')
    setIsGenerating(true)

    try {
      const runResult = await runReport({
        reportId: selectedReport.id,
        legacyPath: selectedReport.legacyPath,
        actionMapping: selectedActionMapping,
        values: selectedReportValues,
      })

      if (runResult.source === 'api') {
        const outputFormat = (selectedReportValues.outputFormat ?? 'PDF').trim().toUpperCase()
        const shouldDownload = outputFormat === 'CSV'

        if (shouldDownload) {
          triggerBrowserDownload(runResult.blob, runResult.filename)
          return
        }

        const opened = openBlobInNewTab(runResult.blob)
        if (!opened) {
          triggerBrowserDownload(runResult.blob, runResult.filename)
          setLaunchErrorMessage(
            'Popup blocked while opening report preview. Downloaded the generated file instead.',
          )
        }
        return
      }

      setLegacyFallbackMessage(
        'Report API is not available for this request yet. Opened the legacy endpoint for parity.',
      )
      const fallbackWindow = window.open(
        runResult.legacyUrl,
        'reportWindow',
        'height=900,width=1280,menubar=0,resizable=1,status=1,scrollbars=1',
      )

      if (!fallbackWindow) {
        setLaunchErrorMessage(
          'Unable to open report window. Enable popups for this site and retry.',
        )
      }
    } catch (error) {
      console.error(error)
      setLaunchErrorMessage('Unable to generate report. Check values and try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Reports</h1>
        <p>
          API-first report generation for key LEXIS actions with automatic legacy fallback while
          Spring report endpoints are being finalized.
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
            Fallback endpoint: <code>{selectedReport.legacyPath}</code>
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
              onClick={() => void onOpenReportRequest()}
              disabled={!canPerform(selectedReport.action) || isGenerating}
            >
              {isGenerating ? 'Generating Report...' : 'Generate Report'}
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
            labelText="Legacy Fallback Request URL"
            value={previewUrl}
            readOnly
            rows={6}
          />
          {legacyFallbackMessage && (
            <InlineNotification
              kind="info"
              title="Legacy Fallback"
              subtitle={legacyFallbackMessage}
              lowContrast
              onCloseButtonClick={() => setLegacyFallbackMessage('')}
            />
          )}
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
