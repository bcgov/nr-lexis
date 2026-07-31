import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Button, Column, Grid, TextArea, TextInput, Tile } from '@carbon/react'
import { AppNotification } from '../../components/AppNotification'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import SearchableSelect from '../../components/SearchableSelect'
import RegionMultiSelect from '@/components/RegionMultiSelect'
import { setSearchParam } from '@/pages/shared/search-query-utils'
import { useAuth } from '@/context/auth/useAuth'
import { ReportRequestError, runReport } from '@/service/report-service'
import { triggerBrowserDownload } from '@/utils/download'
import { businessDateParts, formatIsoDateParts, formatLocalIsoDate } from '@/utils/date'
import { parseJsonValue } from '@/utils/json'
import { isRecord } from '@/utils/record'
import {
  fetchReportOptions,
  fetchProvincialApplicationOptions,
  fetchProvincialExemptionOptions,
  fetchProvincialPermitOptions,
  type SearchOption,
} from '@/service/search-options-service'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'

type ReportDefinition = {
  id: string
  title: string
  category: 'Provincial' | 'Federal' | 'Cross-Module'
  action: string
  description: string
  fields: ReportFieldDefinition[]
  actionMappings: ReportActionMapping[]
}

type ReportFieldDefinition = {
  key: string
  label: string
  type: 'text' | 'date' | 'select' | 'textarea' | 'multiselect'
  optionKey?: string
  defaultValue?: string
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

type ReportOptionSource = 'application' | 'exemption' | 'permit' | 'report'
type ReportOptionSources = {
  application: Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>
  exemption: Awaited<ReturnType<typeof fetchProvincialExemptionOptions>>
  permit: Awaited<ReturnType<typeof fetchProvincialPermitOptions>>
  report: Awaited<ReturnType<typeof fetchReportOptions>>
}

const REPORT_OPTION_KEYS = new Set([
  'applicationRegions',
  'biweeklyJurisdictions',
  'destinationCountry',
  'exemptionReason',
  'exemptionStatus',
  'exemptionType',
  'exemptionTypeCode',
  'exportSchedule',
  'growthType',
  'jurisdiction',
  'orgUnitNumber',
  'permitStatus',
  'portOfExport',
  'region',
  'reportJurisdictions',
  'status',
  'teacJurisdictions',
  'tenureExemptionTypes',
])

const REPORT_OPTIONS_UNAVAILABLE_MESSAGE =
  'Authoritative report options could not be loaded. Affected controls and report generation are disabled. Reload the page to try again.'

const getReportOptionSource = (field: ReportFieldDefinition): ReportOptionSource | null =>
  REPORT_OPTION_KEYS.has(field.optionKey ?? field.key) ? 'report' : null

const OUTPUT_FORMAT_FIELD: ReportFieldDefinition = {
  key: 'outputFormat',
  label: 'Output format',
  type: 'select',
  options: [
    { value: 'PDF', label: 'PDF' },
    { value: 'CSV', label: 'CSV' },
  ],
}

const TENURE_OUTPUT_FORMAT_FIELD: ReportFieldDefinition = {
  ...OUTPUT_FORMAT_FIELD,
  options: [
    { value: 'PDF', label: 'PDF' },
    { value: 'XLSX', label: 'XLSX' },
  ],
}

const TEAC_JURISDICTION_FIELD: ReportFieldDefinition = {
  key: 'exportJurisdictionCode',
  label: 'Jurisdiction',
  type: 'select',
  optionKey: 'teacJurisdictions',
}

const BIWEEKLY_JURISDICTION_FIELD: ReportFieldDefinition = {
  key: 'exportJurisdictionCode',
  label: 'Jurisdiction',
  type: 'select',
  optionKey: 'biweeklyJurisdictions',
}

const REPORT_JURISDICTION_FIELD: ReportFieldDefinition = {
  key: 'exportJurisdictionCode',
  label: 'Jurisdiction',
  type: 'select',
  optionKey: 'reportJurisdictions',
}

const TRANSPORT_JURISDICTION_FIELD: ReportFieldDefinition = {
  ...REPORT_JURISDICTION_FIELD,
  key: 'jurisdiction',
}

const SINGLE_REGION_CODE_FIELD: ReportFieldDefinition = {
  key: 'region',
  label: 'Region',
  type: 'select',
}

const APPLICATION_REGION_CODE_FIELD: ReportFieldDefinition = {
  ...SINGLE_REGION_CODE_FIELD,
  optionKey: 'applicationRegions',
  defaultValue: '0',
}

const REGION_CODES_FIELD: ReportFieldDefinition = {
  key: 'region',
  label: 'Region',
  type: 'multiselect',
}

const ORG_UNIT_CODES_FIELD: ReportFieldDefinition = {
  key: 'orgUnitNumber',
  label: 'Region',
  type: 'multiselect',
}

const EXEMPTION_REASON_FIELD: ReportFieldDefinition = {
  key: 'exemptionReason',
  label: 'Exemption reason',
  type: 'select',
}

const EXEMPTION_TYPE_FIELD: ReportFieldDefinition = {
  key: 'exemptionType',
  label: 'Exemption type',
  type: 'select',
}

const TENURE_EXEMPTION_TYPE_FIELD: ReportFieldDefinition = {
  ...EXEMPTION_TYPE_FIELD,
  optionKey: 'tenureExemptionTypes',
}

const GROWTH_TYPE_FIELD: ReportFieldDefinition = {
  key: 'growthType',
  label: 'Growth type',
  type: 'select',
}

const PERMIT_STATUS_FIELD: ReportFieldDefinition = {
  key: 'permitStatus',
  label: 'Permit status',
  type: 'select',
}

const DESTINATION_COUNTRY_FIELD: ReportFieldDefinition = {
  key: 'destinationCountry',
  label: 'Final destination country',
  type: 'select',
}

const PORT_OF_EXPORT_FIELD: ReportFieldDefinition = {
  key: 'portOfExport',
  label: 'Customs port of export',
  type: 'select',
}

const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'applicationReport',
    title: 'Application Report',
    category: 'Provincial',
    action: '/applicationReport',
    description: 'Applications by status and timeline.',
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      APPLICATION_REGION_CODE_FIELD,
      EXEMPTION_REASON_FIELD,
      BIWEEKLY_JURISDICTION_FIELD,
      {
        key: 'clientNumber',
        label: 'Client number',
        type: 'text',
      },
      GROWTH_TYPE_FIELD,
      {
        key: 'fromDate',
        label: 'Received from date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Received to date',
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
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      REGION_CODES_FIELD,
      REPORT_JURISDICTION_FIELD,
      {
        key: 'clientNumber',
        label: 'Client number',
        type: 'text',
      },
      {
        key: 'fromDate',
        label: 'Application from date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Application to date',
        type: 'date',
      },
      {
        key: 'withdrawnFromDate',
        label: 'Withdrawn from date',
        type: 'date',
      },
      {
        key: 'withdrawnToDate',
        label: 'Withdrawn to date',
        type: 'date',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
  {
    id: 'teacReport',
    title: 'Timber Export Advisory Committee package report',
    category: 'Cross-Module',
    action: '/teacReport',
    description: 'Timber Export Advisory Committee package readiness and review data.',
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      REGION_CODES_FIELD,
      TEAC_JURISDICTION_FIELD,
      {
        key: 'exportSchedule',
        label: 'Advertising date',
        type: 'select',
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
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      REGION_CODES_FIELD,
      EXEMPTION_REASON_FIELD,
      GROWTH_TYPE_FIELD,
      EXEMPTION_TYPE_FIELD,
      {
        key: 'exemptionStatus',
        label: 'Exemption status',
        type: 'select',
      },
      {
        key: 'listingFromDate',
        label: 'Listing from date',
        type: 'date',
      },
      {
        key: 'listingToDate',
        label: 'Listing to date',
        type: 'date',
      },
      {
        key: 'clientNumber',
        label: 'Client number',
        type: 'text',
      },
      {
        key: 'exemptionNumber',
        label: 'Exemption number',
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
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      REGION_CODES_FIELD,
      {
        key: 'clientNumber',
        label: 'Client number',
        type: 'text',
      },
      {
        key: 'exemptionNumber',
        label: 'Exemption number',
        type: 'text',
      },
      EXEMPTION_TYPE_FIELD,
      EXEMPTION_REASON_FIELD,
      PERMIT_STATUS_FIELD,
      GROWTH_TYPE_FIELD,
      {
        key: 'timberMark',
        label: 'Timber mark',
        type: 'text',
      },
      DESTINATION_COUNTRY_FIELD,
      {
        key: 'fromDate',
        label: 'Issued from date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Issued to date',
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
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      TRANSPORT_JURISDICTION_FIELD,
      REGION_CODES_FIELD,
      DESTINATION_COUNTRY_FIELD,
      PORT_OF_EXPORT_FIELD,
      {
        key: 'status',
        label: 'Permit status',
        type: 'select',
      },
      {
        key: 'fromDate',
        label: 'Permit issued from date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Permit issued to date',
        type: 'date',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
  {
    id: 'speciesGradeReport',
    title: 'Species and Grade Report',
    category: 'Provincial',
    action: '/speciesGradeReport',
    description: 'Species/grade composition analytics.',
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      REGION_CODES_FIELD,
      {
        key: 'permitStatus',
        label: 'Permit status',
        type: 'select',
        defaultValue: 'COM',
      },
      {
        key: 'exemptionNumber',
        label: 'Exemption number',
        type: 'text',
      },
      EXEMPTION_TYPE_FIELD,
      EXEMPTION_REASON_FIELD,
      GROWTH_TYPE_FIELD,
      {
        key: 'timberMark',
        label: 'Timber mark',
        type: 'text',
      },
      {
        key: 'forestFileId',
        label: 'Forest file ID',
        type: 'text',
      },
      {
        key: 'fromDate',
        label: 'Permit issued from date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Permit issued to date',
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
    actionMappings: [{ value: 'generate', label: 'Generate' }],
    fields: [
      ORG_UNIT_CODES_FIELD,
      {
        key: 'exemptionNumber',
        label: 'Exemption number',
        type: 'text',
      },
      EXEMPTION_TYPE_FIELD,
      EXEMPTION_REASON_FIELD,
      GROWTH_TYPE_FIELD,
      {
        key: 'fromDate',
        label: 'Permit issued from date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Permit issued to date',
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
    actionMappings: [
      { value: 'generatePermitReport', label: 'Permit details report' },
      { value: 'generateTenureReport', label: 'Tenure types report' },
      { value: 'generateMarkReport', label: 'Timber marks report' },
      { value: 'generateFileReport', label: 'Forest file report' },
    ],
    fields: [
      {
        key: 'fromDate',
        label: 'Issued from date',
        type: 'date',
        defaultValue: getLegacyTenureDefaultFromDate(),
      },
      {
        key: 'toDate',
        label: 'Issued to date',
        type: 'date',
        defaultValue: getLegacyTenureDefaultToDate(),
      },
      REGION_CODES_FIELD,
      {
        key: 'exemptionNumber',
        label: 'Exemption number',
        type: 'text',
      },
      TENURE_EXEMPTION_TYPE_FIELD,
      {
        key: 'clientNumber',
        label: 'Client number',
        type: 'text',
      },
      {
        key: 'forestFileId',
        label: 'Forest file ID',
        type: 'text',
      },
      EXEMPTION_REASON_FIELD,
      {
        key: 'clientType',
        label: 'Client type',
        type: 'select',
        options: [
          { value: 'P', label: 'Permit holder' },
          { value: 'M', label: 'Mark holder' },
        ],
      },
      {
        key: 'tenureType1',
        label: 'Tenure type 1',
        type: 'text',
      },
      {
        key: 'tenureType2',
        label: 'Tenure type 2',
        type: 'text',
      },
      {
        key: 'tenureType3',
        label: 'Tenure type 3',
        type: 'text',
      },
      {
        key: 'tenureType4',
        label: 'Tenure type 4',
        type: 'text',
      },
      {
        key: 'tenureType5',
        label: 'Tenure type 5',
        type: 'text',
      },
      {
        key: 'tenureType6',
        label: 'Tenure type 6',
        type: 'text',
      },
      {
        key: 'timberMark1',
        label: 'Timber mark 1',
        type: 'text',
      },
      {
        key: 'timberMark2',
        label: 'Timber mark 2',
        type: 'text',
      },
      {
        key: 'timberMark3',
        label: 'Timber mark 3',
        type: 'text',
      },
      {
        key: 'timberMark4',
        label: 'Timber mark 4',
        type: 'text',
      },
      {
        key: 'timberMark5',
        label: 'Timber mark 5',
        type: 'text',
      },
      {
        key: 'timberMark6',
        label: 'Timber mark 6',
        type: 'text',
      },
      TENURE_OUTPUT_FORMAT_FIELD,
    ],
  },
  // INTENTIONAL_LEGACY_DIVERGENCE(ADVERTISING_REPORT_VARIANT_RETIREMENT):
  // Legacy generateIndustryPDF/CSV shortcuts are consolidated into this filtered report.
  {
    id: 'biweeklyListing',
    title: 'Advertising List',
    category: 'Cross-Module',
    action: 'mofrListing',
    description: 'Advertising list output in PDF or CSV format.',
    actionMappings: [{ value: 'generate', label: 'Generate with filters' }],
    fields: [
      REGION_CODES_FIELD,
      BIWEEKLY_JURISDICTION_FIELD,
      {
        key: 'fromDate',
        label: 'Listing from date',
        type: 'date',
      },
      {
        key: 'toDate',
        label: 'Listing to date',
        type: 'date',
      },
      OUTPUT_FORMAT_FIELD,
    ],
  },
]

const BLANK_SCHEDULE_DATE_VALUE = '__blank_schedule_date__'

type CurrentAdvertisingPeriod = {
  fromDate: string
  toDate: string
}

function getLegacyTenureDefaultFromDate(): string {
  const today = businessDateParts()
  return formatIsoDateParts(today.year - 1, today.month, 1)
}

function getLegacyTenureDefaultToDate(): string {
  const today = businessDateParts()
  const previousMonth = new Date(Date.UTC(today.year, today.month - 1, 0))
  return formatIsoDateParts(
    previousMonth.getUTCFullYear(),
    previousMonth.getUTCMonth() + 1,
    previousMonth.getUTCDate(),
  )
}

function getLegacyTenureToDateFromFromDate(fromDate: string): string {
  const normalizedFromDate = fromDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedFromDate)) {
    return ''
  }

  const [year, month, day] = normalizedFromDate.split('-').map(Number)
  const parsedDate = new Date(year, month - 1, day)
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return ''
  }

  const toDate = new Date(year + 1, month - 1, day)
  toDate.setDate(toDate.getDate() - 1)
  return formatLocalIsoDate(toDate)
}

const mergeOptions = (...optionGroups: SearchOption[][]): SearchOption[] => {
  const byCode = new Map<string, SearchOption>()
  optionGroups.flat().forEach((option) => {
    if (!byCode.has(option.value)) {
      byCode.set(option.value, option)
    }
  })
  return Array.from(byCode.values())
}

const resolveCurrentAdvertisingPeriod = (
  options: SearchOption[],
): CurrentAdvertisingPeriod | null => {
  const advertisingDates = options
    .map((option) => option.label.trim())
    .filter((label) => /^\d{4}-\d{2}-\d{2}$/.test(label))
    .slice(0, 2)

  if (advertisingDates.length < 2) {
    return null
  }

  const [fromDate, nextAdvertisingDate] = advertisingDates
  const [year, month, day] = nextAdvertisingDate.split('-').map(Number)
  const nextDate = new Date(Date.UTC(year, month - 1, day))
  if (
    nextDate.getUTCFullYear() !== year ||
    nextDate.getUTCMonth() !== month - 1 ||
    nextDate.getUTCDate() !== day
  ) {
    return null
  }

  nextDate.setUTCDate(nextDate.getUTCDate() - 1)
  const toDate = formatIsoDateParts(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate(),
  )
  if (toDate < fromDate) {
    return null
  }

  return { fromDate, toDate }
}

const getRequiredReportOptionSources = (report: ReportDefinition): ReportOptionSource[] => {
  const sources = new Set<ReportOptionSource>()
  report.fields.forEach((field) => {
    const source = getReportOptionSource(field)
    if (source) {
      sources.add(source)
    }
  })

  return Array.from(sources)
}

const parseRecordParam = (value: string | null): Record<string, string> => {
  if (!value) {
    return {}
  }

  const parsed = parseJsonValue(value, (error) => {
    console.warn('Unable to parse report values from URL state.', error)
  })
  if (!isRecord(parsed)) {
    return {}
  }

  return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, fieldValue]) => {
    if (typeof fieldValue === 'string') {
      acc[key] = fieldValue
    }
    return acc
  }, {})
}

const sanitizeReportValues = (
  report: ReportDefinition,
  values: Record<string, string>,
): Record<string, string> => {
  const allowedKeys = new Set(report.fields.map((field) => field.key))
  return Object.entries(values).reduce<Record<string, string>>((acc, [key, value]) => {
    if (allowedKeys.has(key)) {
      acc[key] = value
    }
    return acc
  }, {})
}

const hasOwnValue = (values: Record<string, string>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(values, key)

const isExplicitBlankBiweeklyDateValue = (value: string | undefined): boolean =>
  value === BLANK_SCHEDULE_DATE_VALUE || value === ''

const appendSelectedOptionLabels = (
  report: ReportDefinition,
  values: Record<string, string>,
  optionsByKey: Record<string, SearchOption[]>,
): Record<string, string> => {
  const result = { ...values }
  report.fields.forEach((field) => {
    if (field.key === 'outputFormat' || (field.type !== 'select' && field.type !== 'multiselect')) {
      return
    }

    const value = result[field.key]
    if (!value) {
      return
    }

    const options =
      optionsByKey[field.optionKey ?? field.key] ??
      (getReportOptionSource(field) ? [] : (field.options ?? []))
    if (options.length === 0) {
      return
    }

    const labels = value
      .split(',')
      .map((selectedValue) => selectedValue.trim())
      .filter(Boolean)
      .map((selectedValue) => options.find((option) => option.value === selectedValue)?.label)
      .filter((label): label is string => Boolean(label && label.trim()))

    if (labels.length > 0) {
      result[`${field.key}Label`] = labels.join(', ')
    }
  })
  return result
}

const buildEffectiveReportValues = (
  report: ReportDefinition,
  values: Record<string, string>,
  optionsByKey: Record<string, SearchOption[]> = {},
  defaultRegion = '',
): Record<string, string> => {
  const effectiveValues = { ...values }
  report.fields.forEach((field) => {
    if (
      field.defaultValue !== undefined &&
      (effectiveValues[field.key] === undefined || effectiveValues[field.key] === '')
    ) {
      effectiveValues[field.key] = field.defaultValue
      return
    }

    if (
      field.type === 'multiselect' &&
      !effectiveValues[field.key] &&
      (field.key === 'region' || field.key === 'orgUnitNumber')
    ) {
      if (defaultRegion) {
        effectiveValues[field.key] = defaultRegion
      }
      return
    }

    if (
      field.key === 'outputFormat' ||
      field.type !== 'select' ||
      effectiveValues[field.key] ||
      hasOwnValue(values, field.key)
    ) {
      return
    }

    const options =
      optionsByKey[field.optionKey ?? field.key] ??
      (getReportOptionSource(field) ? [] : (field.options ?? []))
    if (options.length > 0 && options[0].value !== '') {
      effectiveValues[field.key] = options[0].value
    }
  })
  if (report.id === 'biweeklyListing') {
    for (const key of ['fromDate', 'toDate'] as const) {
      if (effectiveValues[key] === BLANK_SCHEDULE_DATE_VALUE) {
        effectiveValues[key] = ''
      }
    }
  }
  return Object.entries(appendSelectedOptionLabels(report, effectiveValues, optionsByKey)).reduce<
    Record<string, string>
  >((acc, [key, value]) => {
    const shouldPreserveExplicitBlankBiweeklyDate =
      report.id === 'biweeklyListing' &&
      (key === 'fromDate' || key === 'toDate') &&
      hasOwnValue(values, key) &&
      isExplicitBlankBiweeklyDateValue(values[key]) &&
      !value.trim()
    if (value.trim() || shouldPreserveExplicitBlankBiweeklyDate) {
      acc[key] = value
    }
    return acc
  }, {})
}

const resolveReportById = (reportId: string): ReportDefinition => {
  return REPORT_DEFINITIONS.find((report) => report.id === reportId) ?? REPORT_DEFINITIONS[0]
}

const resolveActionMapping = (report: ReportDefinition, actionValue: string | null): string => {
  const mappedValue = (actionValue ?? '').trim()
  if (report.actionMappings.some((actionMapping) => actionMapping.value === mappedValue)) {
    return mappedValue
  }

  return report.actionMappings[0].value
}

const buildReportSearchParams = (payload: {
  selectedReportId: string
  selectedActionMapping: string
  selectedReportValues: Record<string, string>
  includeReportParam: boolean
}): URLSearchParams => {
  const params = new URLSearchParams()

  if (payload.includeReportParam) {
    setSearchParam(params, 'report', payload.selectedReportId)
  }
  setSearchParam(params, 'action', payload.selectedActionMapping)
  if (Object.keys(payload.selectedReportValues).length > 0) {
    params.set('values', JSON.stringify(payload.selectedReportValues))
  }

  return params
}

const APPLICATION_REPORT_LIMITER_MESSAGE =
  'Choose at least one Application Report filter before generating: region, jurisdiction, exemption reason, client number, growth type, or received date.'
const BIWEEKLY_DATE_RANGE_MESSAGE =
  'Choose a Listing from date and Listing to date before generating the Advertising List.'

const hasApplicationReportLimiter = (values: Record<string, string>): boolean => {
  const limiterKeys = [
    'region',
    'exportJurisdictionCode',
    'jurisdiction',
    'exemptionReason',
    'clientNumber',
    'growthType',
    'fromDate',
    'toDate',
  ]

  return limiterKeys.some((key) => {
    const value = values[key]?.trim()
    if (!value) {
      return false
    }

    if (key === 'region') {
      return value
        .split(',')
        .map((item) => item.trim())
        .some((item) => item && item !== '0')
    }

    return true
  })
}

const validateReportLaunch = (
  report: ReportDefinition,
  values: Record<string, string>,
): string | null => {
  if (report.id === 'applicationReport' && !hasApplicationReportLimiter(values)) {
    return APPLICATION_REPORT_LIMITER_MESSAGE
  }

  const hasExplicitBlankBiweeklyDateRange =
    report.id === 'biweeklyListing' &&
    hasOwnValue(values, 'fromDate') &&
    hasOwnValue(values, 'toDate') &&
    isExplicitBlankBiweeklyDateValue(values.fromDate) &&
    isExplicitBlankBiweeklyDateValue(values.toDate) &&
    !values.fromDate.trim() &&
    !values.toDate.trim()

  if (
    report.id === 'biweeklyListing' &&
    !hasExplicitBlankBiweeklyDateRange &&
    (!values.fromDate?.trim() || !values.toDate?.trim())
  ) {
    return BIWEEKLY_DATE_RANGE_MESSAGE
  }

  return null
}

const ReportsPage = () => {
  const { reportId: routeReportId } = useParams<{ reportId?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { canPerform } = useAuth()
  const requestedReportId = useMemo(() => {
    const requestedReportId = (routeReportId ?? searchParams.get('report') ?? '').trim()
    if (REPORT_DEFINITIONS.some((report) => report.id === requestedReportId)) {
      return requestedReportId
    }
    return REPORT_DEFINITIONS[0].id
  }, [routeReportId, searchParams])
  const initialReport = useMemo(() => resolveReportById(requestedReportId), [requestedReportId])
  const initialReportValues = useMemo(() => {
    const parsedValues = parseRecordParam(searchParams.get('values'))
    return sanitizeReportValues(initialReport, parsedValues)
  }, [initialReport, searchParams])
  const initialSelectedAction = useMemo(() => {
    return resolveActionMapping(initialReport, searchParams.get('action'))
  }, [initialReport, searchParams])

  const [selectedReportId, setSelectedReportId] = useState(initialReport.id)
  const [reportValuesById, setReportValuesById] = useState<Record<string, Record<string, string>>>({
    [initialReport.id]: initialReportValues,
  })
  const [selectedActionById, setSelectedActionById] = useState<Record<string, string>>({
    [initialReport.id]: initialSelectedAction,
  })
  const [reportOptionSourcesByKey, setReportOptionSourcesByKey] = useState<
    Partial<ReportOptionSources>
  >({})
  const [reportOptionFailuresByKey, setReportOptionFailuresByKey] = useState<
    Partial<Record<ReportOptionSource, string>>
  >({})
  const [expandedDestinationCountryReports, setExpandedDestinationCountryReports] = useState<
    Record<string, boolean>
  >({})
  const [launchErrorMessage, setLaunchErrorMessage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const beginReportOptionsRequest = useLatestRequestGuard()

  const accessibleReports = useMemo(() => {
    return REPORT_DEFINITIONS.filter((report) => canPerform(report.action))
  }, [canPerform])

  const selectedReport =
    accessibleReports.find((report) => report.id === selectedReportId) ??
    accessibleReports[0] ??
    REPORT_DEFINITIONS[0]
  const hasSelectedReportAccess = accessibleReports.some(
    (report) => report.id === selectedReport.id,
  )

  const selectedReportValues = useMemo(() => {
    return reportValuesById[selectedReport.id] ?? {}
  }, [reportValuesById, selectedReport.id])

  const selectedActionMapping = resolveActionMapping(
    selectedReport,
    selectedActionById[selectedReport.id] ?? null,
  )
  const requiredReportOptionSources = useMemo(
    () => (hasSelectedReportAccess ? getRequiredReportOptionSources(selectedReport) : []),
    [hasSelectedReportAccess, selectedReport],
  )
  const reportFieldOptionsByKey = useMemo<Record<string, SearchOption[]>>(() => {
    const reportOptions = reportOptionSourcesByKey.report
    const destinationCountryOptions =
      expandedDestinationCountryReports[selectedReport.id] &&
      reportOptions?.allDestinationCountries.length
        ? reportOptions.allDestinationCountries
        : (reportOptions?.destinationCountries ?? [])
    const exemptionTypeOptions = mergeOptions(
      reportOptions?.exemptionTypes ?? [],
      reportOptionSourcesByKey.application?.exemptionTypes ?? [],
      reportOptionSourcesByKey.exemption?.exemptionTypes ?? [],
    )

    return {
      ...(reportOptions
        ? {
            applicationRegions: [{ value: '0', label: 'All' }, ...reportOptions.regions],
          }
        : {}),
      ...(exemptionTypeOptions.length > 0
        ? {
            exemptionType: exemptionTypeOptions,
            exemptionTypeCode: exemptionTypeOptions,
          }
        : {}),
      ...(reportOptions?.tenureExemptionTypes.length
        ? { tenureExemptionTypes: reportOptions.tenureExemptionTypes }
        : {}),
      ...(reportOptions?.exemptionReasons.length
        ? { exemptionReason: reportOptions.exemptionReasons }
        : {}),
      ...(reportOptions?.growthTypes.length ? { growthType: reportOptions.growthTypes } : {}),
      ...(reportOptionSourcesByKey.exemption?.exemptionStatuses.length
        ? {
            exemptionStatus: mergeOptions(
              reportOptions?.exemptionStatuses ?? [],
              reportOptionSourcesByKey.exemption.exemptionStatuses,
            ),
          }
        : reportOptions?.exemptionStatuses.length
          ? { exemptionStatus: reportOptions.exemptionStatuses }
          : {}),
      ...(reportOptions?.permitStatuses.length
        ? {
            permitStatus: reportOptions.permitStatuses,
            status: reportOptions.permitStatuses,
          }
        : {}),
      ...(reportOptionSourcesByKey.permit?.permitStatuses.length
        ? {
            permitStatus: mergeOptions(
              reportOptions?.permitStatuses ?? [],
              reportOptionSourcesByKey.permit.permitStatuses,
            ),
            status: mergeOptions(
              reportOptions?.permitStatuses ?? [],
              reportOptionSourcesByKey.permit.permitStatuses,
            ),
          }
        : {}),
      ...(destinationCountryOptions.length
        ? { destinationCountry: destinationCountryOptions }
        : {}),
      ...(reportOptions?.portsOfExport.length ? { portOfExport: reportOptions.portsOfExport } : {}),
      ...(reportOptions?.currentSchedules.length
        ? {
            exportSchedule: reportOptions.currentSchedules,
          }
        : {}),
      ...(reportOptions?.reportJurisdictions.length
        ? {
            reportJurisdictions: reportOptions.reportJurisdictions,
            jurisdiction: reportOptions.reportJurisdictions,
          }
        : {}),
      ...(reportOptions?.biweeklyJurisdictions.length
        ? { biweeklyJurisdictions: reportOptions.biweeklyJurisdictions }
        : {}),
      ...(reportOptions?.teacJurisdictions.length
        ? { teacJurisdictions: reportOptions.teacJurisdictions }
        : {}),
      ...(reportOptions?.regions.length
        ? {
            region: reportOptions.regions,
            orgUnitNumber: reportOptions.regions,
          }
        : {}),
    }
  }, [expandedDestinationCountryReports, reportOptionSourcesByKey, selectedReport.id])

  const requiredReportOptionsFailed = requiredReportOptionSources.some((source) =>
    Boolean(reportOptionFailuresByKey[source]),
  )
  const requiredReportOptionsLoading = requiredReportOptionSources.some(
    (source) => !reportOptionSourcesByKey[source] && !reportOptionFailuresByKey[source],
  )
  const reportGenerationDisabled = requiredReportOptionsLoading || requiredReportOptionsFailed

  const defaultReportRegion = reportOptionSourcesByKey.report?.defaultRegion ?? ''
  const currentAdvertisingPeriod = useMemo(
    () => resolveCurrentAdvertisingPeriod(reportOptionSourcesByKey.report?.currentSchedules ?? []),
    [reportOptionSourcesByKey.report?.currentSchedules],
  )

  useEffect(() => {
    const nextReport = resolveReportById(requestedReportId)
    const nextReportValues = sanitizeReportValues(
      nextReport,
      parseRecordParam(searchParams.get('values')),
    )
    const nextAction = resolveActionMapping(nextReport, searchParams.get('action'))

    let isActive = true
    void Promise.resolve().then(() => {
      if (!isActive) {
        return
      }

      setSelectedReportId((current) => (current === nextReport.id ? current : nextReport.id))
      setReportValuesById((current) => {
        if (!searchParams.has('values') && current[nextReport.id]) {
          return current
        }

        return {
          ...current,
          [nextReport.id]: nextReportValues,
        }
      })
      setSelectedActionById((current) => {
        if (!searchParams.has('action') && current[nextReport.id]) {
          return current
        }

        return {
          ...current,
          [nextReport.id]: nextAction,
        }
      })
      setLaunchErrorMessage('')
    })

    return () => {
      isActive = false
    }
  }, [requestedReportId, searchParams])

  useEffect(() => {
    const nextParams = buildReportSearchParams({
      selectedReportId: selectedReport.id,
      selectedActionMapping,
      selectedReportValues,
      includeReportParam: !routeReportId,
    })
    const nextQuery = nextParams.toString()
    if (nextQuery !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [
    searchParams,
    selectedActionMapping,
    selectedReport.id,
    selectedReportValues,
    setSearchParams,
    routeReportId,
  ])

  useEffect(() => {
    const loadReportFieldOptions = async () => {
      const missingSources = requiredReportOptionSources.filter(
        (source) => !reportOptionSourcesByKey[source] && !reportOptionFailuresByKey[source],
      )
      if (missingSources.length === 0) {
        beginReportOptionsRequest()
        return
      }

      const isLatestRequest = beginReportOptionsRequest()
      const loadedSources: Partial<ReportOptionSources> = {}

      for (const source of missingSources) {
        try {
          if (source === 'application') {
            loadedSources.application = await fetchProvincialApplicationOptions()
          } else if (source === 'exemption') {
            loadedSources.exemption = await fetchProvincialExemptionOptions()
          } else if (source === 'permit') {
            loadedSources.permit = await fetchProvincialPermitOptions()
          } else {
            loadedSources.report = await fetchReportOptions()
          }

          if (!isLatestRequest()) {
            return
          }
        } catch (error) {
          if (!isLatestRequest()) {
            return
          }
          console.warn('Unable to load report field options.', error)
          setReportOptionFailuresByKey((current) => ({
            ...current,
            [source]: REPORT_OPTIONS_UNAVAILABLE_MESSAGE,
          }))
          return
        }
      }

      setReportOptionSourcesByKey((current) => ({
        ...current,
        ...loadedSources,
      }))
    }

    void loadReportFieldOptions()
  }, [
    beginReportOptionsRequest,
    reportOptionFailuresByKey,
    reportOptionSourcesByKey,
    requiredReportOptionSources,
  ])

  const onUpdateField = (fieldKey: string, value: string): void => {
    const clearsSpeciesForestFile =
      selectedReport.id === 'speciesGradeReport' && fieldKey === 'timberMark' && value.trim()
    const clearsSpeciesTimberMark =
      selectedReport.id === 'speciesGradeReport' && fieldKey === 'forestFileId' && value.trim()

    setReportValuesById((current) => ({
      ...current,
      [selectedReport.id]: {
        ...current[selectedReport.id],
        [fieldKey]: value,
        ...(clearsSpeciesForestFile ? { forestFileId: '' } : {}),
        ...(clearsSpeciesTimberMark ? { timberMark: '' } : {}),
        ...(selectedReport.id === 'tenureReport' && fieldKey === 'fromDate'
          ? { toDate: getLegacyTenureToDateFromFromDate(value) }
          : {}),
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

  const onUseCurrentAdvertisingPeriod = (): void => {
    if (!currentAdvertisingPeriod || selectedReport.id !== 'biweeklyListing') {
      return
    }
    setReportValuesById((current) => ({
      ...current,
      [selectedReport.id]: {
        ...current[selectedReport.id],
        ...currentAdvertisingPeriod,
      },
    }))
    setLaunchErrorMessage('')
  }

  const onOpenReportRequest = async (): Promise<void> => {
    setLaunchErrorMessage('')

    if (reportGenerationDisabled) {
      setLaunchErrorMessage(REPORT_OPTIONS_UNAVAILABLE_MESSAGE)
      return
    }

    setIsGenerating(true)

    try {
      const effectiveReportValues = buildEffectiveReportValues(
        selectedReport,
        selectedReportValues,
        reportFieldOptionsByKey,
        defaultReportRegion,
      )
      const validationError = validateReportLaunch(selectedReport, effectiveReportValues)
      if (validationError) {
        setLaunchErrorMessage(validationError)
        return
      }

      const runResult = await runReport({
        reportId: selectedReport.id,
        actionMapping: selectedActionMapping,
        values: effectiveReportValues,
      })

      triggerBrowserDownload(runResult.blob, runResult.filename)
    } catch (error) {
      console.error(error)
      setLaunchErrorMessage(
        error instanceof ReportRequestError
          ? error.message
          : 'Unable to generate report. Check values and try again.',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Grid fullWidth className="default-grid reports-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          headingId="selected-report-title"
          title={hasSelectedReportAccess ? selectedReport.title : 'Reports'}
          subtitle={
            hasSelectedReportAccess
              ? selectedReport.description
              : 'Generate and download the reports available to your session.'
          }
        />
      </Column>

      <Column sm={4} md={8} lg={16} className="report-parameter-panel">
        {hasSelectedReportAccess ? (
          <Tile
            className="report-config-panel"
            role="region"
            aria-labelledby="selected-report-title"
          >
            <>
              {requiredReportOptionsFailed && (
                <AppNotification
                  kind="error"
                  title="Report options unavailable"
                  subtitle={REPORT_OPTIONS_UNAVAILABLE_MESSAGE}
                  lowContrast
                />
              )}
              <div className="legacy-search-grid report-parameter-grid report-config-fields">
                {selectedReport.actionMappings.length > 1 && (
                  <SearchableSelect
                    id="reportActionMapping"
                    labelText="Report variant"
                    value={selectedActionMapping}
                    options={selectedReport.actionMappings}
                    onChange={(value) =>
                      setSelectedActionById((current) => ({
                        ...current,
                        [selectedReport.id]: value || selectedReport.actionMappings[0].value,
                      }))
                    }
                  />
                )}
                {selectedReport.fields.map((field) => {
                  const defaultMultiselectValue =
                    (field.key === 'region' || field.key === 'orgUnitNumber') && defaultReportRegion
                      ? defaultReportRegion
                      : ''
                  const hasSelectedFieldValue = hasOwnValue(selectedReportValues, field.key)
                  const currentValue =
                    (hasSelectedFieldValue
                      ? selectedReportValues[field.key]
                      : field.defaultValue) ??
                    (defaultMultiselectValue || (field.key === 'outputFormat' ? 'PDF' : ''))
                  const dynamicOptions = reportFieldOptionsByKey[field.optionKey ?? field.key] ?? []
                  const optionSource = getReportOptionSource(field)
                  const optionSourceLoaded =
                    !optionSource || Boolean(reportOptionSourcesByKey[optionSource])
                  const optionSourceFailed = optionSource
                    ? Boolean(reportOptionFailuresByKey[optionSource])
                    : false
                  const optionControlDisabled =
                    Boolean(optionSource) &&
                    (!optionSourceLoaded || optionSourceFailed || dynamicOptions.length === 0)
                  const selectOptions = optionSource
                    ? dynamicOptions
                    : dynamicOptions.length > 0
                      ? dynamicOptions
                      : (field.options ?? [])
                  const optionPlaceholder = optionSourceFailed
                    ? 'Options unavailable'
                    : !optionSourceLoaded
                      ? 'Loading options...'
                      : optionControlDisabled
                        ? 'No options available'
                        : undefined
                  const resolvedCurrentValue =
                    field.type === 'select' &&
                    field.key !== 'outputFormat' &&
                    !hasSelectedFieldValue &&
                    !currentValue &&
                    selectOptions.length > 0 &&
                    selectOptions[0].value !== ''
                      ? selectOptions[0].value
                      : currentValue

                  if (field.type === 'multiselect') {
                    const selectedValues = new Set(
                      resolvedCurrentValue
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                    const regionItems = dynamicOptions.map((option) => ({
                      id: option.value,
                      text: option.label,
                    }))
                    const selectedItems = regionItems.filter((option) =>
                      selectedValues.has(option.id),
                    )

                    return (
                      <RegionMultiSelect
                        key={field.key}
                        id={`${selectedReport.id}-${field.key}`}
                        titleText={field.label}
                        items={regionItems}
                        placeholder={optionPlaceholder ?? 'Select region(s)'}
                        selectedItems={selectedItems}
                        disabled={optionControlDisabled}
                        onChange={(nextSelected) => {
                          onUpdateField(
                            field.key,
                            nextSelected.map((option) => option.id).join(','),
                          )
                        }}
                      />
                    )
                  }

                  const shouldRenderSelect = field.type === 'select'

                  if (shouldRenderSelect) {
                    const canExpandDestinationCountries =
                      field.key === 'destinationCountry' &&
                      Boolean(reportOptionSourcesByKey.report?.allDestinationCountries.length) &&
                      !expandedDestinationCountryReports[selectedReport.id]
                    const providedOptions = selectOptions
                    const hasCurrentValue = providedOptions.some(
                      (option) => option.value === resolvedCurrentValue,
                    )
                    const resolvedOptions = hasCurrentValue
                      ? providedOptions
                      : resolvedCurrentValue && (!optionSource || providedOptions.length > 0)
                        ? [
                            ...providedOptions,
                            {
                              value: resolvedCurrentValue,
                              label: `Custom (${resolvedCurrentValue})`,
                            },
                          ]
                        : providedOptions
                    return (
                      <div key={field.key}>
                        <SearchableSelect
                          id={`${selectedReport.id}-${field.key}`}
                          labelText={field.label}
                          value={optionControlDisabled ? '' : resolvedCurrentValue}
                          options={resolvedOptions}
                          placeholder={optionPlaceholder}
                          disabled={optionControlDisabled}
                          onChange={(value) => onUpdateField(field.key, value)}
                        />
                        {canExpandDestinationCountries && (
                          <Button
                            kind="ghost"
                            size="sm"
                            disabled={optionControlDisabled}
                            onClick={() =>
                              setExpandedDestinationCountryReports((current) => ({
                                ...current,
                                [selectedReport.id]: true,
                              }))
                            }
                          >
                            More...
                          </Button>
                        )}
                      </div>
                    )
                  }

                  if (field.type === 'textarea') {
                    return (
                      <TextArea
                        key={field.key}
                        id={`${selectedReport.id}-${field.key}`}
                        labelText={field.label}
                        value={resolvedCurrentValue}
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
                      value={resolvedCurrentValue}
                      placeholder={field.placeholder}
                      helperText={field.helperText}
                      disabled={
                        selectedReport.id === 'speciesGradeReport' &&
                        ((field.key === 'timberMark' &&
                          Boolean(selectedReportValues.forestFileId)) ||
                          (field.key === 'forestFileId' &&
                            Boolean(selectedReportValues.timberMark)))
                      }
                      onChange={(event) => onUpdateField(field.key, event.target.value)}
                    />
                  )
                })}
              </div>
              <div
                className="legacy-search-actions report-config-actions"
                role="group"
                aria-label="Report actions"
              >
                <Button kind="tertiary" onClick={onResetFields}>
                  Reset Fields
                </Button>
                {selectedReport.id === 'biweeklyListing' && currentAdvertisingPeriod && (
                  <Button kind="tertiary" onClick={onUseCurrentAdvertisingPeriod}>
                    Use current advertising period
                  </Button>
                )}
                <Button
                  kind="primary"
                  onClick={() => void onOpenReportRequest()}
                  disabled={isGenerating || reportGenerationDisabled}
                >
                  {isGenerating ? 'Generating Report...' : 'Generate Report'}
                </Button>
              </div>
              {launchErrorMessage && (
                <AppNotification
                  kind="error"
                  title="Report launch error"
                  subtitle={launchErrorMessage}
                  lowContrast
                  onCloseButtonClick={() => setLaunchErrorMessage('')}
                />
              )}
            </>
          </Tile>
        ) : (
          <EmptyState
            title="No reports available"
            description="No report actions are available for the current session."
          />
        )}
      </Column>
    </Grid>
  )
}

export default ReportsPage
