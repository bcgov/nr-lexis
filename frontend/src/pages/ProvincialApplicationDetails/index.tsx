import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Accordion,
  AccordionItem,
  Button,
  Column,
  DismissibleTag,
  Grid,
  InlineLoading,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import PageHeader from '@/components/PageHeader'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import ApplicationAccuracyConfirmation, {
  APPLICATION_ACCURACY_ACKNOWLEDGEMENT,
} from '@/components/ApplicationAccuracyConfirmation'
import ContentLoadingOverlay from '@/components/ContentLoadingOverlay'
import { useAuth } from '@/context/auth/useAuth'
import { hasProvincialSubmitterRole } from '@/context/auth/role-utils'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import { formatDocumentSource } from '@/service/document-service-utils'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  displayValue,
  matchesFilter,
  normalizeFilterText as normalizeText,
} from '@/pages/shared/detail-page-utils'
import { appendSearchParamsToPath, searchParamsWithValue } from '@/pages/shared/search-query-utils'
import {
  fetchProvincialApplicationDetail,
  fetchProvincialExemptionDetail,
  releaseApplicationEditLock,
} from '@/service/lexis-detail-service'
import {
  fetchApplicationDocuments,
  openApplicationDocument,
  removeApplicationDocument,
  type ProvincialApplicationDocumentRow,
} from '@/service/provincial-application-documents-service'
import {
  checkApplicationVolumeUsage,
  fetchApplicationEndUsesForSpeciesRegion,
  fetchApplicationPermits,
  fetchApplicationSummarySnapshot,
  fetchApplicationRemainingSpecies,
  fetchApplicationSpecies,
  saveApplicationRemark,
  updateApplicationSummary,
  type ApplicationCodeOption,
  type ApplicationPermitRow,
  type ApplicationPackageSpeciesRow,
  type ApplicationSummarySnapshot,
} from '@/service/provincial-application-items-service'
import {
  approveApplicationReview,
  sendApplicationReviewStatusEmail,
  updateApplicationReviewStatus,
  type ApplicationReviewStatusUpdateResult,
} from '@/service/application-review-search-service'
import {
  fetchApplicationClientData,
  fetchApplicationClientContacts,
  fetchApplicationClientLocations,
  type ApplicationClientData,
  type ApplicationClientContact,
  type ApplicationClientLocation,
} from '@/service/application-client-lookup-service'
import {
  fetchApplicationReviewOptions,
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'
import DetailDocumentUploadPanel from '../../components/uploads/DetailDocumentUploadPanel'
import IsoDatePicker from '../../components/IsoDatePicker'
import SearchableSelect from '../../components/SearchableSelect'
import { calculateApplicationTermDays } from '@/pages/shared/application-term-utils'
import {
  averageLogVolumeFieldError,
  isAgentApplicant,
  isSelectableClientContact,
  isSelectableClientLocation,
  productTypeRequiresGrowthType,
  productTypeRequiresLogDetails,
  resolveClientContactName,
  resolveClientLocationCode,
  toApplicationCodeOption,
  toSearchOption,
} from '@/pages/shared/application-form-utils'
import {
  atMostTwoDecimalFieldError,
  firstValidationError,
  isoDateFieldError,
  maxNumericValueFieldError,
  positiveNumericFieldError,
  requiredFieldError,
  requiredMaxLengthFieldError,
  type FieldErrors,
} from '@/pages/shared/create-form-utils'
import { triggerBrowserDownload } from '@/utils/download'
import {
  isValidEmail,
  normalizeTrimmedText as normalizeEmail,
  normalizeUpperText as normalizeReviewStatus,
} from '@/utils/text'
import { AppNotification } from '../../components/AppNotification'
import ProvincialApplicationItemsPanel from './ApplicationItemsPanel'

const EMAIL_SUPPORTED_STATUS_CODES = new Set(['REJ', 'WDN'])
const REVIEW_STATUSES_REQUIRING_REMARK = new Set(['EXP', 'REJ', 'WDN'])
const REVIEW_STATUSES_WITH_PERSISTED_REMARK = new Set(['EXP', 'REJ', 'WDN'])
const REVIEW_STATUS_REQUIRED_MESSAGE = 'Choose an application status before updating review status.'
const REVIEW_REMARK_REQUIRED_MESSAGE =
  'Review remark is required when rejecting, withdrawing, or expiring an application.'
type LookupAvailability = 'loading' | 'available' | 'unavailable'
type ApplicationDetailTabKey =
  | 'owner'
  | 'agent'
  | 'application'
  | 'items'
  | 'documents'
  | 'remarks'
  | 'offers'
  | 'review'
// Carbon indexes the conditional JSX children as well as the visible tabs.
// Keep these slots aligned with the TabList and TabPanels declarations below.
const APPLICATION_DETAIL_TAB_SLOTS: readonly ApplicationDetailTabKey[] = [
  'owner',
  'agent',
  'application',
  'items',
  'documents',
  'remarks',
  'offers',
  'review',
]
const REVIEW_EMAIL_UNSUPPORTED_MESSAGE =
  'Status email is only supported for rejected or withdrawn applications.'
const REVIEW_EMAIL_REQUIRED_MESSAGE = 'Enter one valid client email address.'
const REVIEW_EMAIL_PREVIEW_HELPER =
  "Defaults from the applicant's Oracle client-location email. Changes apply only to this notification."
const APPLICATION_STATUS_LABELS: Record<string, string> = {
  APP: 'Approved',
  EXP: 'Expired',
  NEW: 'New',
  PND: 'Pending',
  REJ: 'Rejected',
  WDN: 'Withdrawn',
}
const APPLICANT_TYPE_OPTIONS: SearchOption[] = [
  { value: 'O', label: 'Owner' },
  { value: 'A', label: 'Agent' },
]
const JURISDICTION_OPTIONS: SearchOption[] = [
  { value: 'P', label: 'Provincial' },
  { value: 'F', label: 'Federal' },
]
const OIC_INDICATOR_OPTIONS: SearchOption[] = [
  { value: 'N', label: 'No' },
  { value: 'Y', label: 'Yes' },
]

const optionLabel = (option: SearchOption): string =>
  option.label === option.value ? option.label : `${option.value} - ${option.label}`

export type ClientDataSummaryProps = {
  title: string
  clientData: ApplicationClientData | null
  isLoading: boolean
  detailFields?: Array<[string, string]>
}

function ClientDataSummary({ title, clientData, isLoading, detailFields }: ClientDataSummaryProps) {
  const clientLookupMessage = clientData?.notfound ?? ''
  const clientLookupMessageKey = `${clientData?.clientNumber ?? ''}:${clientLookupMessage}`
  const [dismissedClientLookupMessageKey, setDismissedClientLookupMessageKey] = useState<
    string | null
  >(null)

  if (!clientData) {
    return isLoading ? <InlineLoading description={`Loading ${title.toLowerCase()}...`} /> : null
  }

  return (
    <section
      className={`application-client-summary content-loading-region${isLoading ? ' is-loading' : ''}`}
      aria-label={title}
      inert={isLoading ? true : undefined}
      aria-busy={isLoading}
    >
      <ContentLoadingOverlay
        loading={isLoading}
        loadingDescription={`Refreshing ${title.toLowerCase()}...`}
      />
      <h3 className="application-client-summary__title">{title}</h3>
      <dl className="detail-field-grid">
        {[
          ...(detailFields ?? []),
          ['Company name', displayValue(clientData.companyName)],
          ['Address', displayValue(clientData.address)],
          ['City', displayValue(clientData.city)],
          ['Province', displayValue(clientData.province)],
          ['Postal code', displayValue(clientData.postalCode)],
          ['Country', displayValue(clientData.country)],
          ['Phone', displayValue(clientData.phone)],
          ['Fax', displayValue(clientData.fax)],
          ['Email', displayValue(clientData.email)],
        ].map(([label, value]) => (
          <div key={label} className="detail-field-item">
            <dt className="detail-field-label">{label}</dt>
            <dd className="detail-field-value">{value}</dd>
          </div>
        ))}
      </dl>
      {clientLookupMessage && dismissedClientLookupMessageKey !== clientLookupMessageKey && (
        <AppNotification
          kind="warning"
          title="Client lookup"
          subtitle={clientLookupMessage}
          lowContrast
          onCloseButtonClick={() => setDismissedClientLookupMessageKey(clientLookupMessageKey)}
        />
      )}
    </section>
  )
}

const optionsWithCurrentValue = (options: SearchOption[], currentValue: string): SearchOption[] => {
  const normalizedCurrentValue = currentValue.trim()
  if (
    !normalizedCurrentValue ||
    options.some((option) => option.value === normalizedCurrentValue)
  ) {
    return options
  }

  return [{ value: normalizedCurrentValue, label: normalizedCurrentValue }, ...options]
}

type ApplicationSummaryFormState = {
  applicationDate: string
  receivedDate: string
  termDays: string
  termMonths: string
  termYears: string
  applicationVolume: string
  averageLogVolume: string
  exemptionReasonCode: string
  productLocation: string
  exportScheduleId: string
  agentClientNumber: string
  agentClientLocationCode: string
  ownerClientNumber: string
  ownerClientLocationCode: string
  applicationStatusCode: string
  applicantTypeCode: string
  orgUnitNumber: string
  productTypeCode: string
  jurisdictionCode: string
  growthTypeCode: string
  agentContactName: string
  ownerContactName: string
  oicIndicator: string
  endUseCode: string
  speciesCodes: string[]
}

type ApplicationSummaryField = keyof ApplicationSummaryFormState & string

const toSummaryFormState = (detail: ProvincialApplicationDetail): ApplicationSummaryFormState => ({
  applicationDate: detail.applicationDate ?? '',
  receivedDate: detail.receivedDate ?? '',
  termDays: detail.termDays === null ? '' : String(detail.termDays),
  termMonths: '',
  termYears: '',
  applicationVolume: detail.applicationVolume === null ? '' : String(detail.applicationVolume),
  averageLogVolume: detail.averageLogVolume === null ? '' : String(detail.averageLogVolume),
  exemptionReasonCode: detail.exemptionReasonCode ?? '',
  productLocation: '',
  exportScheduleId: '',
  agentClientNumber: detail.agentClientNumber ?? '',
  agentClientLocationCode: '',
  ownerClientNumber: detail.ownerClientNumber ?? '',
  ownerClientLocationCode: '',
  applicationStatusCode: detail.applicationStatusCode ?? '',
  applicantTypeCode: detail.agentClientNumber ? 'A' : 'O',
  orgUnitNumber: detail.orgUnitNumber === null ? '' : String(detail.orgUnitNumber),
  productTypeCode: detail.productTypeCode ?? '',
  jurisdictionCode: 'P',
  growthTypeCode: '',
  agentContactName: '',
  ownerContactName: '',
  oicIndicator: 'N',
  endUseCode: '',
  speciesCodes: [],
})

const toSummarySnapshotFormState = (
  snapshot: ApplicationSummarySnapshot,
): ApplicationSummaryFormState => ({
  applicationDate: snapshot.applicationDate,
  receivedDate: snapshot.receivedDate,
  termDays: snapshot.termDays,
  termMonths: '',
  termYears: '',
  applicationVolume: snapshot.applicationVolume,
  averageLogVolume: snapshot.averageLogVolume,
  exemptionReasonCode: snapshot.exemptionReasonCode,
  productLocation: snapshot.productLocation,
  exportScheduleId: snapshot.exportScheduleId,
  agentClientNumber: snapshot.agentClientNumber,
  agentClientLocationCode: snapshot.agentClientLocationCode,
  ownerClientNumber: snapshot.ownerClientNumber,
  ownerClientLocationCode: snapshot.ownerClientLocationCode,
  applicationStatusCode: snapshot.applicationStatusCode,
  applicantTypeCode: snapshot.applicantTypeCode,
  orgUnitNumber: snapshot.orgUnitNumber,
  productTypeCode: snapshot.productTypeCode,
  jurisdictionCode: snapshot.jurisdictionCode,
  growthTypeCode: snapshot.growthTypeCode,
  agentContactName: snapshot.agentContactName,
  ownerContactName: snapshot.ownerContactName,
  oicIndicator: snapshot.oicIndicator,
  endUseCode: snapshot.endUseCode ?? '',
  speciesCodes: snapshot.speciesCodes ?? [],
})

const withApplicationSpecies = (
  form: ApplicationSummaryFormState,
  speciesRows: ApplicationPackageSpeciesRow[],
): ApplicationSummaryFormState => {
  const speciesCodes = Array.from(
    new Set(speciesRows.map((row) => row.species.trim()).filter(Boolean)),
  )
  const endUseCode = speciesRows.map((row) => row.endUse.trim()).find(Boolean) ?? form.endUseCode
  return { ...form, speciesCodes, endUseCode }
}

const normalizeSummaryAgentFields = (
  form: ApplicationSummaryFormState,
): ApplicationSummaryFormState =>
  isAgentApplicant(form.applicantTypeCode)
    ? form
    : {
        ...form,
        agentClientNumber: '',
        agentClientLocationCode: '',
        agentContactName: '',
      }

const APPLICATION_STATUS_EXPIRED = 'EXP'
const APPLICATION_STATUS_PERMITTED = 'PMT'
const COMPLETE_PERMIT_STATUS_TEXT = 'COMPLETE'
const APPLICATION_DOCUMENT_DELETE_ROLES = new Set([
  'ADMIN',
  'LEXIS_ADMIN',
  'APPLICATION_APPROVER',
  'LEXIS_APPLICATION_APPROVER',
])
const APPLICATION_DOCUMENT_INDUSTRY_ROLES = new Set([
  'PROVINCIAL_SUBMITTER',
  'LEXIS_PROVINCIAL_SUBMITTER',
])

const isIndustryApplicationRole = (role: string): boolean => {
  const normalizedRole = role.trim().toUpperCase()
  return (
    APPLICATION_DOCUMENT_INDUSTRY_ROLES.has(normalizedRole) ||
    normalizedRole.startsWith('PROVINCIAL_SUBMITTER_') ||
    normalizedRole.startsWith('LEXIS_PROVINCIAL_SUBMITTER_')
  )
}

const canDeleteApplicationDocuments = (
  detail: ProvincialApplicationDetail | null,
  roles: string[],
): boolean => {
  if (!detail) {
    return false
  }
  if (detail.readOnly || detail.locked) {
    return false
  }

  const status = detail.applicationStatusCode?.trim().toUpperCase() ?? ''
  const normalizedRoles = roles.map((role) => role.trim().toUpperCase())
  const approverOrAdmin = normalizedRoles.some((role) =>
    APPLICATION_DOCUMENT_DELETE_ROLES.has(role),
  )

  if (approverOrAdmin) {
    return status.length > 0 && status !== APPLICATION_STATUS_EXPIRED
  }

  const industryUser = detail.industryUser || normalizedRoles.some(isIndustryApplicationRole)
  return industryUser && [APPLICATION_STATUS_PERMITTED, APPLICATION_STATUS_EXPIRED].includes(status)
}

const isExpiredApplication = (detail: ProvincialApplicationDetail | null): boolean => {
  const statusCode = detail?.applicationStatusCode?.trim().toUpperCase() ?? ''
  const statusDescription = detail?.statusDescription?.trim().toUpperCase() ?? ''
  return statusCode === APPLICATION_STATUS_EXPIRED || statusDescription === 'EXPIRED'
}

const hasCompletePermit = (permitRows: ApplicationPermitRow[]): boolean =>
  permitRows.some((row) =>
    row.permitStatusDescription.trim().toUpperCase().includes(COMPLETE_PERMIT_STATUS_TEXT),
  )

const applicationDocumentUploadUnavailableMessage = (
  detail: ProvincialApplicationDetail | null,
  permitRows: ApplicationPermitRow[],
  permitLookupAvailability: LookupAvailability,
): string => {
  if (detail?.locked) {
    return (
      detail.lockMessage ||
      'Application document upload is unavailable while this application is locked.'
    )
  }
  if (detail?.readOnly) {
    return 'Application document upload is unavailable for read-only applications.'
  }
  if (isExpiredApplication(detail)) {
    return 'Application document upload is unavailable for expired applications.'
  }
  if (detail?.industryUser && hasCompletePermit(permitRows)) {
    return 'Application document upload is unavailable for industry users when the application has a complete permit.'
  }
  if (detail?.industryUser && permitLookupAvailability !== 'available') {
    return 'Application document upload is unavailable while permit information cannot be retrieved.'
  }
  return ''
}

const normalizeReviewEmail = (value: string | null | undefined): string => {
  const normalized = normalizeEmail(value ?? '')
  const lowered = normalized.toLowerCase()
  return lowered === 'none' || lowered === 'not on file' ? '' : normalized
}

const reviewEmailCandidate = (
  applicantTypeCode: string,
  ownerClientData: ApplicationClientData | null,
  agentClientData: ApplicationClientData | null,
): string => {
  const ownerEmail = normalizeReviewEmail(ownerClientData?.email ?? '')
  const agentEmail = normalizeReviewEmail(agentClientData?.email ?? '')

  if (isAgentApplicant(applicantTypeCode)) {
    return agentEmail
  }

  return ownerEmail
}

const latestPersistedRemark = (
  remarks: ProvincialApplicationDetail['remarks'] | undefined,
): string => {
  const latest = [...(remarks ?? [])]
    .filter((remark) => remark.remark.trim())
    .sort((left, right) => {
      const leftTime = left.date ? Date.parse(left.date) : 0
      const rightTime = right.date ? Date.parse(right.date) : 0
      if (leftTime !== rightTime) {
        return rightTime - leftTime
      }
      return (right.remarkId ?? 0) - (left.remarkId ?? 0)
    })[0]

  return latest?.remark ?? ''
}

const latestPersistedReviewRemark = (
  detail: ProvincialApplicationDetail | null | undefined,
): string => {
  const statusCode = normalizeReviewStatus(detail?.applicationStatusCode ?? '')
  if (!REVIEW_STATUSES_WITH_PERSISTED_REMARK.has(statusCode)) {
    return ''
  }

  return latestPersistedRemark(detail?.remarks)
}

const ProvincialApplicationDetailsPage = () => {
  const navigate = useNavigate()
  const { canPerform, capabilities } = useAuth()
  const { applicationNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialApplicationDetail | null>(null)
  const [industryViewableExemptionNumber, setIndustryViewableExemptionNumber] = useState<
    string | null
  >(null)
  const [documentRows, setDocumentRows] = useState<ProvincialApplicationDocumentRow[]>([])
  const [permitRows, setPermitRows] = useState<ApplicationPermitRow[]>([])
  const [documentLookupAvailability, setDocumentLookupAvailability] =
    useState<LookupAvailability>('loading')
  const [permitLookupAvailability, setPermitLookupAvailability] =
    useState<LookupAvailability>('loading')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [actionWarningMessage, setActionWarningMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [documentUploadDirty, setDocumentUploadDirty] = useState(false)
  const [documentUploadBusy, setDocumentUploadBusy] = useState(false)
  const [documentUploadResetKey, setDocumentUploadResetKey] = useState(0)
  const [applicationItemsDirty, setApplicationItemsDirty] = useState(false)
  const [applicationItemsBusy, setApplicationItemsBusy] = useState(false)
  const [applicationItemsResetKey, setApplicationItemsResetKey] = useState(0)
  const [remarkBody, setRemarkBody] = useState('')
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null)
  const [isSavingRemark, setIsSavingRemark] = useState(false)
  const [remarkValidationMessage, setRemarkValidationMessage] = useState('')
  const [summaryForm, setSummaryForm] = useState<ApplicationSummaryFormState | null>(null)
  const [summaryBaselineForm, setSummaryBaselineForm] =
    useState<ApplicationSummaryFormState | null>(null)
  const [summaryVolumeWarningAccepted, setSummaryVolumeWarningAccepted] = useState(false)
  const [isSavingSummary, setIsSavingSummary] = useState(false)
  const [summaryAccuracyConfirmationOpen, setSummaryAccuracyConfirmationOpen] = useState(false)
  const [summaryAccuracyConfirmed, setSummaryAccuracyConfirmed] = useState(false)
  const [summaryAccuracyApplicationNumber, setSummaryAccuracyApplicationNumber] = useState<
    string | null
  >(null)
  const [showSummaryValidationErrors, setShowSummaryValidationErrors] = useState(false)
  const [ownerClientLocations, setOwnerClientLocations] = useState<ApplicationClientLocation[]>([])
  const [agentClientLocations, setAgentClientLocations] = useState<ApplicationClientLocation[]>([])
  const [ownerClientContacts, setOwnerClientContacts] = useState<ApplicationClientContact[]>([])
  const [agentClientContacts, setAgentClientContacts] = useState<ApplicationClientContact[]>([])
  const [ownerClientData, setOwnerClientData] = useState<ApplicationClientData | null>(null)
  const [agentClientData, setAgentClientData] = useState<ApplicationClientData | null>(null)
  const [isLoadingOwnerClientLocations, setIsLoadingOwnerClientLocations] = useState(false)
  const [isLoadingAgentClientLocations, setIsLoadingAgentClientLocations] = useState(false)
  const [isLoadingOwnerClientContacts, setIsLoadingOwnerClientContacts] = useState(false)
  const [isLoadingAgentClientContacts, setIsLoadingAgentClientContacts] = useState(false)
  const [isLoadingOwnerClientData, setIsLoadingOwnerClientData] = useState(false)
  const [isLoadingAgentClientData, setIsLoadingAgentClientData] = useState(false)
  const [
    dismissedDocumentUploadUnavailableMessageKey,
    setDismissedDocumentUploadUnavailableMessageKey,
  ] = useState<string | null>(null)
  const [summaryExemptionReasonOptions, setSummaryExemptionReasonOptions] = useState<
    SearchOption[]
  >([])
  const [summaryApplicationStatusOptions, setSummaryApplicationStatusOptions] = useState<
    SearchOption[]
  >([])
  const [summaryProductTypeOptions, setSummaryProductTypeOptions] = useState<SearchOption[]>([])
  const [summaryGrowthTypeOptions, setSummaryGrowthTypeOptions] = useState<SearchOption[]>([])
  const [summaryRegionOptions, setSummaryRegionOptions] = useState<SearchOption[]>([])
  const [summaryScheduleOptions, setSummaryScheduleOptions] = useState<SearchOption[]>([])
  const [applicationSpeciesOptions, setApplicationSpeciesOptions] = useState<
    ApplicationCodeOption[]
  >([])
  const [applicationEndUseOptions, setApplicationEndUseOptions] = useState<ApplicationCodeOption[]>(
    [],
  )
  const [applicationSpeciesCandidate, setApplicationSpeciesCandidate] = useState('')
  const [summaryOptionsAvailability, setSummaryOptionsAvailability] = useState<
    'idle' | 'loading' | 'available' | 'unavailable'
  >('idle')
  const [reviewStatusOptions, setReviewStatusOptions] = useState<SearchOption[]>([])
  const [reviewOptionsAvailability, setReviewOptionsAvailability] = useState<
    'loading' | 'available' | 'unavailable'
  >('loading')
  const [reviewStatusCode, setReviewStatusCode] = useState('')
  const [reviewStatusRemark, setReviewStatusRemark] = useState('')
  const [reviewStatusBaselineCode, setReviewStatusBaselineCode] = useState('')
  const [reviewStatusRemarkBaseline, setReviewStatusRemarkBaseline] = useState('')
  const reviewStatusEmailCandidate = useMemo(
    () =>
      reviewEmailCandidate(summaryForm?.applicantTypeCode ?? '', ownerClientData, agentClientData),
    [agentClientData, ownerClientData, summaryForm?.applicantTypeCode],
  )
  const [reviewStatusEmailOverride, setReviewStatusEmailOverride] = useState<{
    applicationNumber: string
    value: string
  } | null>(null)
  const reviewStatusEmailAddress =
    reviewStatusEmailOverride?.applicationNumber === (applicationNumber ?? '')
      ? reviewStatusEmailOverride.value
      : reviewStatusEmailCandidate
  const seededReviewFieldsApplicationRef = useRef<string | null>(null)
  const [reviewValidationMessage, setReviewValidationMessage] = useState('')
  const [isSubmittingReviewAction, setIsSubmittingReviewAction] = useState(false)
  const [focusedPackageNumber, setFocusedPackageNumber] = useState('')
  const [focusedPackageRequestId, setFocusedPackageRequestId] = useState(0)
  const [selectedApplicationTab, setSelectedApplicationTab] =
    useState<ApplicationDetailTabKey>('owner')
  const beginDetailRequest = useLatestRequestGuard()
  const currentApplicationNumberRef = useRef(applicationNumber)
  currentApplicationNumberRef.current = applicationNumber
  const currentDetailRef = useRef<ProvincialApplicationDetail | null>(null)
  currentDetailRef.current = detail
  const packageFilter = searchParams.get('packageFilter') ?? ''
  const offerFilter = searchParams.get('offerFilter') ?? ''
  const remarkFilter = searchParams.get('remarkFilter') ?? ''
  const documentsFilter = searchParams.get('documentsFilter') ?? ''
  const requestedApplicationTab = (searchParams.get('tab') ?? '').trim().toLowerCase()
  const requestedPackageNumber = (searchParams.get('packageNumber') ?? '').trim()
  const shouldFocusScaleSection =
    requestedApplicationTab === 'items' &&
    (searchParams.get('section') ?? '').trim().toLowerCase() === 'scales'
  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
  )
  const canAccessExemptionRoutes = canPerform('/exemptionSearch') && canPerform('/exemptionDetails')
  const updateFilterParam = useCallback(
    (key: 'packageFilter' | 'offerFilter' | 'remarkFilter' | 'documentsFilter', value: string) => {
      const nextSearchParams = searchParamsWithValue(searchParams, key, value)

      if (nextSearchParams.toString() !== searchParams.toString()) {
        setSearchParams(nextSearchParams, { replace: true })
      }
    },
    [searchParams, setSearchParams],
  )
  const focusPackageInItems = useCallback((packageNumber: string) => {
    setSelectedApplicationTab('items')
    setFocusedPackageNumber(packageNumber)
    setFocusedPackageRequestId((current) => current + 1)
  }, [])

  const loadApplicationDetail = useCallback(async () => {
    const isLatestRequest = beginDetailRequest()
    setSummaryAccuracyConfirmationOpen(false)
    setSummaryAccuracyConfirmed(false)
    setSummaryAccuracyApplicationNumber(null)
    if (!applicationNumber) {
      seededReviewFieldsApplicationRef.current = null
      setErrorMessage('Application number is missing from the route.')
      setDetail(null)
      setIndustryViewableExemptionNumber(null)
      setDocumentRows([])
      setPermitRows([])
      setDocumentLookupAvailability('unavailable')
      setPermitLookupAvailability('unavailable')
      setDocumentsErrorMessage('')
      setActionErrorMessage('')
      setActionInfoMessage('')
      setLoading(false)
      setSummaryForm(null)
      setSummaryBaselineForm(null)
      setReviewStatusCode('')
      setReviewStatusRemark('')
      setReviewStatusBaselineCode('')
      setReviewStatusRemarkBaseline('')
      setShowSummaryValidationErrors(false)
      return
    }

    const retainingCurrentDetail =
      !!currentDetailRef.current &&
      String(currentDetailRef.current.applicationNumber) === applicationNumber

    setLoading(true)
    setErrorMessage('')
    setDocumentsErrorMessage('')
    setActionErrorMessage('')
    setActionInfoMessage('')
    if (!retainingCurrentDetail) {
      setIndustryViewableExemptionNumber(null)
      setDocumentRows([])
      setPermitRows([])
      setDocumentLookupAvailability('loading')
      setPermitLookupAvailability('loading')
    }

    try {
      const response = await fetchProvincialApplicationDetail(applicationNumber)
      if (!isLatestRequest()) {
        return
      }
      let editableSummaryForm = response
        ? normalizeSummaryAgentFields(toSummaryFormState(response))
        : null
      setDetail(response)
      setSummaryForm(editableSummaryForm)
      setSummaryBaselineForm(editableSummaryForm)
      setShowSummaryValidationErrors(false)
      const persistedReviewStatusCode = response?.applicationStatusCode ?? ''
      const persistedReviewStatusRemark = latestPersistedReviewRemark(response)
      setReviewStatusCode(persistedReviewStatusCode)
      setReviewStatusBaselineCode(persistedReviewStatusCode)
      setReviewStatusRemarkBaseline(persistedReviewStatusRemark)
      if (seededReviewFieldsApplicationRef.current !== applicationNumber) {
        seededReviewFieldsApplicationRef.current = response ? applicationNumber : null
        setReviewStatusRemark(persistedReviewStatusRemark)
      }
      setReviewValidationMessage('')
      setRemarkBody('')
      setEditingRemarkId(null)
      if (!response) {
        setErrorMessage(`No provincial application found for ${applicationNumber}.`)
        setDocumentRows([])
        setPermitRows([])
        setDocumentLookupAvailability('unavailable')
        setPermitLookupAvailability('unavailable')
        return
      }

      const linkedExemptionNumber = response.exemptionNumber?.trim() ?? ''
      if (response.industryUser && linkedExemptionNumber && canAccessExemptionRoutes) {
        const verifyIndustryExemptionAccess = async () => {
          try {
            const exemption = await fetchProvincialExemptionDetail(linkedExemptionNumber)
            if (
              isLatestRequest() &&
              exemption &&
              exemption.exemptionStatusCode?.trim().toUpperCase() !== 'NEW'
            ) {
              setIndustryViewableExemptionNumber(linkedExemptionNumber)
            }
          } catch {
            // Keep the exemption number as plain text when access or status cannot be verified.
          }
        }
        void verifyIndustryExemptionAccess()
      }

      try {
        const permitsResult = await fetchApplicationPermits(applicationNumber)
        if (isLatestRequest()) {
          setPermitRows(permitsResult)
          setPermitLookupAvailability('available')
        }
      } catch {
        if (isLatestRequest()) {
          if (!retainingCurrentDetail) {
            setPermitRows([])
            setPermitLookupAvailability('unavailable')
          }
          setActionErrorMessage('Unable to retrieve application permits.')
        }
      }

      try {
        const summarySnapshot = await fetchApplicationSummarySnapshot(applicationNumber)
        if (
          isLatestRequest() &&
          summarySnapshot &&
          String(summarySnapshot.applicationNumber) === applicationNumber
        ) {
          editableSummaryForm = normalizeSummaryAgentFields(
            toSummarySnapshotFormState(summarySnapshot),
          )
          setSummaryForm(editableSummaryForm)
          setSummaryBaselineForm(editableSummaryForm)
        }
      } catch {
        if (isLatestRequest()) {
          setActionErrorMessage('Unable to retrieve complete application summary fields.')
        }
      }

      try {
        const applicationSpeciesRows = await fetchApplicationSpecies(applicationNumber)
        if (isLatestRequest() && editableSummaryForm) {
          const summaryFormWithSpecies = withApplicationSpecies(
            editableSummaryForm,
            applicationSpeciesRows,
          )
          setSummaryForm(summaryFormWithSpecies)
          setSummaryBaselineForm(summaryFormWithSpecies)
        }
      } catch {
        if (isLatestRequest()) {
          setActionErrorMessage('Unable to retrieve application species fields.')
        }
      }

      try {
        const documentsResult = await fetchApplicationDocuments(applicationNumber)
        if (isLatestRequest()) {
          setDocumentRows(documentsResult.rows)
          setDocumentLookupAvailability('available')
        }
      } catch {
        if (isLatestRequest()) {
          if (!retainingCurrentDetail) {
            setDocumentRows([])
            setDocumentLookupAvailability('unavailable')
          }
          setDocumentsErrorMessage('Unable to retrieve application documents.')
        }
      }
    } catch {
      if (isLatestRequest()) {
        setErrorMessage('Unable to retrieve provincial application detail.')
        if (!retainingCurrentDetail) {
          setDetail(null)
          setIndustryViewableExemptionNumber(null)
          setSummaryForm(null)
          setSummaryBaselineForm(null)
          setShowSummaryValidationErrors(false)
          setDocumentRows([])
          setPermitRows([])
          setDocumentLookupAvailability('unavailable')
          setPermitLookupAvailability('unavailable')
          setDocumentsErrorMessage('')
        }
      }
    } finally {
      if (isLatestRequest()) {
        setLoading(false)
      }
    }
  }, [applicationNumber, beginDetailRequest, canAccessExemptionRoutes])

  useEffect(() => {
    void loadApplicationDetail()
  }, [loadApplicationDetail])

  useEffect(() => {
    return () => {
      if (applicationNumber) {
        void releaseApplicationEditLock(applicationNumber)
      }
    }
  }, [applicationNumber])

  const filteredPackages = useMemo(() => {
    const rows = detail?.packages ?? []
    if (!packageFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(packageFilter)
    return rows.filter((item) =>
      normalizeText(
        `${item.packageNumber} ${item.volume.toLocaleString()} ${item.pieceCount.toLocaleString()}`,
      ).includes(normalizedFilter),
    )
  }, [detail?.packages, packageFilter])

  const filteredOffers = useMemo(() => {
    const rows = detail?.offers ?? []
    if (!offerFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(offerFilter)
    return rows.filter((item) =>
      normalizeText(
        `${item.offerNumber} ${item.companyName ?? ''} ${item.receivedDate ?? ''} ${
          item.validOffer ? 'valid' : 'invalid'
        } ${item.withdrawalDate ?? ''}`,
      ).includes(normalizedFilter),
    )
  }, [detail?.offers, offerFilter])

  const filteredRemarks = useMemo(() => {
    const rows = detail?.remarks ?? []
    if (!remarkFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(remarkFilter)
    return rows.filter((item) =>
      normalizeText(`${item.date ?? ''} ${item.user ?? ''} ${item.title} ${item.remark}`).includes(
        normalizedFilter,
      ),
    )
  }, [detail?.remarks, remarkFilter])

  const filteredDocumentRows = useMemo(() => {
    return documentRows.filter((row) =>
      matchesFilter([row.name, row.description, row.type, row.source, row.id], documentsFilter),
    )
  }, [documentRows, documentsFilter])

  const canUploadApplicationDocuments = canPerform('/fileApplicationUpload')
  const canDeleteDocuments = canDeleteApplicationDocuments(detail, capabilities?.roles ?? [])
  const documentUploadUnavailableMessage = applicationDocumentUploadUnavailableMessage(
    detail,
    permitRows,
    permitLookupAvailability,
  )
  const documentUploadUnavailableMessageKey = `${detail?.applicationNumber ?? ''}:${documentUploadUnavailableMessage}`
  const showDocumentUploadUnavailableMessage = Boolean(
    documentUploadUnavailableMessage &&
    dismissedDocumentUploadUnavailableMessageKey !== documentUploadUnavailableMessageKey,
  )
  const canAddApplicationDocuments =
    canUploadApplicationDocuments && !documentUploadUnavailableMessage
  const hasApplicationDocuments =
    documentLookupAvailability === 'available' && documentRows.length > 0
  const canViewRemarks = canPerform('/applicationRemarks')
  const canUseApplicationMutations =
    canPerform('createApplication') && !detail?.locked && !detail?.readOnly
  const canEditPackages = canUseApplicationMutations && !!detail?.canEditPackages
  const canAddPackages = canUseApplicationMutations && !!detail?.canAddPackages
  const canAddScales = canUseApplicationMutations && !!detail?.canAddScales
  const canEditSummary = canUseApplicationMutations && !!detail?.canEditApplicationDetails
  const needsApplicationOptions =
    canEditSummary || canEditPackages || canAddPackages || canAddScales
  const canUpdatePackageNumber = canEditPackages && !!detail?.canUpdatePackageNumber
  const canManageRemarks = canViewRemarks && !detail?.readOnly && !detail?.locked
  const isProvincialSubmitter = hasProvincialSubmitterRole(capabilities?.roles)
  const requiresApplicationAccuracyAcknowledgement =
    detail?.industryUser === true || isProvincialSubmitter
  const offerPackageNumbers = useMemo(
    () =>
      (detail?.packages ?? [])
        .map((item) => item.packageNumber.trim())
        .filter((packageNumber) => packageNumber.length > 0),
    [detail?.packages],
  )
  const canCreateApplicationOffer = Boolean(
    detail &&
    canPerform('/offersSearch') &&
    canPerform('createOffer') &&
    detail.canCreateOffers &&
    !detail.industryUser &&
    !isProvincialSubmitter &&
    offerPackageNumbers.length > 0,
  )
  const canChangeApplicantType = canPerform('/changeApplicantType')
  const canReviewApplication = canPerform('/applicationsReview')
  const canViewReview = canViewRemarks && canReviewApplication
  const normalizedReviewStatusCode = useMemo(
    () => normalizeReviewStatus(reviewStatusCode),
    [reviewStatusCode],
  )
  const canSendReviewStatusEmail = EMAIL_SUPPORTED_STATUS_CODES.has(normalizedReviewStatusCode)
  const isReviewStatusInvalid = reviewValidationMessage === REVIEW_STATUS_REQUIRED_MESSAGE
  const isReviewRemarkInvalid = reviewValidationMessage === REVIEW_REMARK_REQUIRED_MESSAGE
  const showReviewValidationNotification =
    !!reviewValidationMessage && !isReviewStatusInvalid && !isReviewRemarkInvalid
  const hasSummaryForm = summaryForm !== null
  const summaryOwnerClientNumber = summaryForm?.ownerClientNumber.trim() ?? ''
  const isSummaryAgentApplicant = isAgentApplicant(summaryForm?.applicantTypeCode ?? '')
  const applicationDetailTabs: ApplicationDetailTabKey[] = [
    'owner',
    ...(isSummaryAgentApplicant ? (['agent'] as const) : []),
    'application',
    'items',
    'documents',
    ...(canViewRemarks ? (['remarks'] as const) : []),
    'offers',
    ...(canViewReview ? (['review'] as const) : []),
  ]
  const selectedApplicationTabIndex = Math.max(
    0,
    APPLICATION_DETAIL_TAB_SLOTS.indexOf(selectedApplicationTab),
  )
  useEffect(() => {
    if (requestedApplicationTab === 'items') {
      focusPackageInItems(requestedPackageNumber)
    }
  }, [focusPackageInItems, requestedApplicationTab, requestedPackageNumber])
  const summaryAgentClientNumber = isSummaryAgentApplicant
    ? (summaryForm?.agentClientNumber.trim() ?? '')
    : ''
  const summaryOwnerClientLocationCode = summaryForm?.ownerClientLocationCode.trim() ?? ''
  const summaryAgentClientLocationCode = isSummaryAgentApplicant
    ? (summaryForm?.agentClientLocationCode.trim() ?? '')
    : ''
  const hasSelectableOwnerClientLocations = ownerClientLocations.some(isSelectableClientLocation)
  const hasSelectableAgentClientLocations = agentClientLocations.some(isSelectableClientLocation)
  const hasSelectableOwnerClientContacts = ownerClientContacts.some(isSelectableClientContact)
  const hasSelectableAgentClientContacts = agentClientContacts.some(isSelectableClientContact)
  const ownerClientLocationPlaceholder = !summaryOwnerClientNumber
    ? 'Enter owner client number first'
    : isLoadingOwnerClientLocations
      ? 'Loading locations'
      : hasSelectableOwnerClientLocations
        ? 'Select owner client location'
        : 'No locations on file'
  const agentClientLocationPlaceholder = !summaryAgentClientNumber
    ? 'Enter agent client number first'
    : isLoadingAgentClientLocations
      ? 'Loading locations'
      : hasSelectableAgentClientLocations
        ? 'Select agent client location'
        : 'No locations on file'
  const ownerContactPlaceholder = !summaryOwnerClientLocationCode
    ? 'Select owner location first'
    : isLoadingOwnerClientContacts
      ? 'Loading contacts'
      : hasSelectableOwnerClientContacts
        ? 'Select owner contact'
        : 'No contacts on file'
  const agentContactPlaceholder = !summaryAgentClientLocationCode
    ? 'Select agent location first'
    : isLoadingAgentClientContacts
      ? 'Loading contacts'
      : hasSelectableAgentClientContacts
        ? 'Select agent contact'
        : 'No contacts on file'
  const exemptionReasonOptions = optionsWithCurrentValue(
    summaryExemptionReasonOptions,
    summaryForm?.exemptionReasonCode ?? '',
  )
  const productTypeOptions = optionsWithCurrentValue(
    summaryProductTypeOptions,
    summaryForm?.productTypeCode ?? '',
  )
  const growthTypeOptions = optionsWithCurrentValue(
    summaryGrowthTypeOptions,
    summaryForm?.growthTypeCode ?? '',
  )
  const packageProductTypeOptions = useMemo(
    () => productTypeOptions.map(toApplicationCodeOption),
    [productTypeOptions],
  )
  const packageGrowthTypeOptions = useMemo(
    () => growthTypeOptions.map(toApplicationCodeOption),
    [growthTypeOptions],
  )
  const regionOptions = optionsWithCurrentValue(
    summaryRegionOptions,
    summaryForm?.orgUnitNumber ?? '',
  )
  const missingSummaryOptionLabels = [
    summaryExemptionReasonOptions.length === 0 ? 'exemption reason' : null,
    summaryProductTypeOptions.length === 0 ? 'product type' : null,
    summaryRegionOptions.length === 0 ? 'region' : null,
    productTypeRequiresGrowthType(summaryForm?.productTypeCode ?? '') &&
    summaryGrowthTypeOptions.length === 0
      ? 'growth type'
      : null,
  ].filter((label): label is string => label !== null)
  const requiredSummaryOptionsMissing =
    canEditSummary &&
    summaryOptionsAvailability === 'available' &&
    missingSummaryOptionLabels.length > 0
  const packageReferenceOptionsAvailability =
    summaryOptionsAvailability === 'idle'
      ? 'loading'
      : summaryOptionsAvailability !== 'available'
        ? summaryOptionsAvailability
        : summaryProductTypeOptions.length === 0 || summaryGrowthTypeOptions.length === 0
          ? 'unavailable'
          : 'available'
  const requiredReviewOptionsMissing =
    reviewOptionsAvailability === 'available' && reviewStatusOptions.length === 0
  const resolveApplicationStatusDescription = useCallback(
    (statusCode: string) => {
      const normalizedStatusCode = normalizeReviewStatus(statusCode)
      if (!normalizedStatusCode) {
        return null
      }

      const statusOption = [...summaryApplicationStatusOptions, ...reviewStatusOptions].find(
        (option) => normalizeReviewStatus(option.value) === normalizedStatusCode,
      )
      return (
        statusOption?.label ??
        APPLICATION_STATUS_LABELS[normalizedStatusCode] ??
        normalizedStatusCode
      )
    },
    [reviewStatusOptions, summaryApplicationStatusOptions],
  )
  const applyReviewStatusResult = useCallback(
    (result: ApplicationReviewStatusUpdateResult, fallbackRemark = '') => {
      const statusCode = result.statusCode ? normalizeReviewStatus(result.statusCode) : ''
      if (!statusCode) {
        return
      }

      const statusDescription = resolveApplicationStatusDescription(statusCode)
      const remark = result.remark ?? fallbackRemark
      const insertedRemark =
        remark.trim() && result.remarkId
          ? {
              remarkId: result.remarkId,
              title: remark,
              remark,
              user: result.remarkUser ?? null,
              date: result.remarkDate ? result.remarkDate.slice(0, 10) : null,
            }
          : null

      setDetail((current) => {
        if (!current) {
          return current
        }

        const remarks = insertedRemark
          ? [
              insertedRemark,
              ...current.remarks.filter((item) => item.remarkId !== insertedRemark.remarkId),
            ]
          : current.remarks

        return {
          ...current,
          applicationStatusCode: statusCode,
          statusDescription,
          remarks,
        }
      })
      setSummaryForm((current) =>
        current ? { ...current, applicationStatusCode: statusCode } : current,
      )
      setSummaryBaselineForm((current) =>
        current ? { ...current, applicationStatusCode: statusCode } : current,
      )
      setReviewStatusCode(statusCode)
      setReviewStatusRemark(remark)
      setReviewStatusBaselineCode(statusCode)
      setReviewStatusRemarkBaseline(remark)
    },
    [resolveApplicationStatusDescription],
  )
  const summarySpeciesCodes = useMemo(
    () => summaryForm?.speciesCodes ?? [],
    [summaryForm?.speciesCodes],
  )
  const summarySpeciesKey = summarySpeciesCodes.join(',')
  const calculatedSummaryTermDays = useMemo(() => {
    if (!summaryForm) {
      return ''
    }

    return calculateApplicationTermDays(
      summaryForm.termDays,
      summaryForm.termMonths,
      summaryForm.termYears,
    )
  }, [summaryForm])
  const summaryFieldErrors = useMemo<FieldErrors<ApplicationSummaryField>>(() => {
    if (!summaryForm) {
      return {}
    }

    return {
      ownerClientNumber:
        requiredFieldError(summaryForm.ownerClientNumber, 'Owner client number') ?? undefined,
      ownerClientLocationCode:
        requiredMaxLengthFieldError(
          summaryForm.ownerClientLocationCode,
          2,
          'Owner client location code',
        ) ?? undefined,
      ownerContactName:
        requiredFieldError(summaryForm.ownerContactName, 'Owner contact name') ?? undefined,
      agentClientNumber: isAgentApplicant(summaryForm.applicantTypeCode)
        ? (requiredFieldError(summaryForm.agentClientNumber, 'Agent client number') ?? undefined)
        : undefined,
      agentClientLocationCode: isAgentApplicant(summaryForm.applicantTypeCode)
        ? (requiredMaxLengthFieldError(
            summaryForm.agentClientLocationCode,
            2,
            'Agent client location code',
          ) ?? undefined)
        : undefined,
      agentContactName: isAgentApplicant(summaryForm.applicantTypeCode)
        ? (requiredFieldError(summaryForm.agentContactName, 'Agent contact name') ?? undefined)
        : undefined,
      applicantTypeCode: firstValidationError(
        () => requiredFieldError(summaryForm.applicantTypeCode, 'Applicant type'),
        () =>
          summaryForm.applicantTypeCode === 'O' || summaryForm.applicantTypeCode === 'A'
            ? null
            : 'Applicant type must be Owner or Agent.',
      ),
      productTypeCode: firstValidationError(
        () => requiredFieldError(summaryForm.productTypeCode, 'Product type'),
        () =>
          summaryProductTypeOptions.some((option) => option.value === summaryForm.productTypeCode)
            ? null
            : 'Select a valid product type.',
      ),
      growthTypeCode: productTypeRequiresGrowthType(summaryForm.productTypeCode)
        ? firstValidationError(
            () => requiredFieldError(summaryForm.growthTypeCode, 'Growth type'),
            () =>
              summaryGrowthTypeOptions.some((option) => option.value === summaryForm.growthTypeCode)
                ? null
                : 'Select a valid growth type.',
          )
        : undefined,
      exemptionReasonCode: firstValidationError(
        () =>
          requiredMaxLengthFieldError(
            summaryForm.exemptionReasonCode,
            1,
            'Exemption reason code',
            'Exemption reason',
          ),
        () =>
          summaryExemptionReasonOptions.some(
            (option) => option.value === summaryForm.exemptionReasonCode,
          )
            ? null
            : 'Select a valid exemption reason.',
      ),
      orgUnitNumber: firstValidationError(
        () => requiredFieldError(summaryForm.orgUnitNumber, 'Region'),
        () =>
          summaryRegionOptions.some((option) => option.value === summaryForm.orgUnitNumber)
            ? null
            : 'Select a valid region.',
      ),
      applicationDate: firstValidationError(
        () => requiredFieldError(summaryForm.applicationDate, 'Application date'),
        () => isoDateFieldError(summaryForm.applicationDate),
      ),
      termDays: firstValidationError(
        () => requiredFieldError(calculatedSummaryTermDays, 'Application term'),
        () =>
          /^\d*$/.test(summaryForm.termDays.trim())
            ? null
            : 'Application term days must be zero or a positive whole number.',
      ),
      termMonths: /^\d*$/.test(summaryForm.termMonths.trim())
        ? undefined
        : 'Application term months must be zero or a positive whole number.',
      termYears: /^\d*$/.test(summaryForm.termYears.trim())
        ? undefined
        : 'Application term years must be zero or a positive whole number.',
      receivedDate: firstValidationError(
        () => requiredFieldError(summaryForm.receivedDate, 'Received date'),
        () => isoDateFieldError(summaryForm.receivedDate),
      ),
      exportScheduleId:
        !summaryForm.exportScheduleId ||
        summaryScheduleOptions.some((option) => option.value === summaryForm.exportScheduleId)
          ? undefined
          : 'Select a valid listing date.',
      productLocation: productTypeRequiresLogDetails(summaryForm.productTypeCode)
        ? (requiredFieldError(summaryForm.productLocation, 'Location of logs') ?? undefined)
        : undefined,
      applicationVolume: firstValidationError(
        () => requiredFieldError(summaryForm.applicationVolume, 'Application volume'),
        () => positiveNumericFieldError(summaryForm.applicationVolume),
        () =>
          maxNumericValueFieldError(
            summaryForm.applicationVolume,
            9999999.99,
            'Application volume',
          ),
        () => atMostTwoDecimalFieldError(summaryForm.applicationVolume, 'Application volume'),
      ),
      averageLogVolume: productTypeRequiresLogDetails(summaryForm.productTypeCode)
        ? averageLogVolumeFieldError(summaryForm.averageLogVolume)
        : undefined,
      oicIndicator: firstValidationError(
        () => requiredFieldError(summaryForm.oicIndicator, 'Order in Council indicator'),
        () =>
          summaryForm.oicIndicator === 'Y' || summaryForm.oicIndicator === 'N'
            ? null
            : 'Order in Council indicator must be Yes or No.',
      ),
    }
  }, [
    calculatedSummaryTermDays,
    summaryExemptionReasonOptions,
    summaryForm,
    summaryGrowthTypeOptions,
    summaryProductTypeOptions,
    summaryRegionOptions,
    summaryScheduleOptions,
  ])
  const hasSummaryValidationError = Object.values(summaryFieldErrors).some((error) => !!error)
  const visibleSummaryFieldError = (field: ApplicationSummaryField): string | undefined =>
    showSummaryValidationErrors ? summaryFieldErrors[field] : undefined
  const availableApplicationSpeciesOptions = useMemo(
    () => applicationSpeciesOptions.filter((option) => !summarySpeciesCodes.includes(option.code)),
    [applicationSpeciesOptions, summarySpeciesCodes],
  )
  const applicationSpeciesSelectOptions = availableApplicationSpeciesOptions.map(toSearchOption)
  const applicationEndUseSelectOptions = applicationEndUseOptions.map(toSearchOption)
  const speciesPlaceholder =
    applicationSpeciesSelectOptions.length > 0 ? 'Select species' : 'No remaining species'
  const endUsePlaceholder =
    summarySpeciesCodes.length === 0
      ? 'Add species first'
      : applicationEndUseSelectOptions.length > 0
        ? 'Select end use'
        : 'No end uses on file'

  useEffect(() => {
    if (!hasSummaryForm || !summaryOwnerClientNumber || !summaryOwnerClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientData(null)
        setIsLoadingOwnerClientData(false)
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingOwnerClientData(true)
      }
    })

    void fetchApplicationClientData(summaryOwnerClientNumber, summaryOwnerClientLocationCode)
      .then((clientData) => {
        if (isActive) {
          setOwnerClientData(clientData)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingOwnerClientData(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [hasSummaryForm, summaryOwnerClientLocationCode, summaryOwnerClientNumber])

  useEffect(() => {
    if (!hasSummaryForm || !summaryAgentClientNumber || !summaryAgentClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientData(null)
        setIsLoadingAgentClientData(false)
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingAgentClientData(true)
      }
    })

    void fetchApplicationClientData(summaryAgentClientNumber, summaryAgentClientLocationCode)
      .then((clientData) => {
        if (isActive) {
          setAgentClientData(clientData)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingAgentClientData(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [hasSummaryForm, summaryAgentClientLocationCode, summaryAgentClientNumber])

  useEffect(() => {
    if (!canEditSummary || !hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientLocations([])
        setIsLoadingOwnerClientLocations(false)
      })
      return () => {
        isActive = false
      }
    }

    if (!summaryOwnerClientNumber) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientLocations([])
        setIsLoadingOwnerClientLocations(false)
        setSummaryForm((current) =>
          current?.ownerClientLocationCode ? { ...current, ownerClientLocationCode: '' } : current,
        )
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingOwnerClientLocations(true)
      }
    })

    void fetchApplicationClientLocations(summaryOwnerClientNumber, 'owner')
      .then((locations) => {
        if (!isActive) {
          return
        }

        setOwnerClientLocations(locations)
        setSummaryForm((current) => {
          if (!current || current.ownerClientNumber.trim() !== summaryOwnerClientNumber) {
            return current
          }

          const nextOwnerClientLocationCode = resolveClientLocationCode(
            locations,
            current.ownerClientLocationCode,
          )
          return current.ownerClientLocationCode === nextOwnerClientLocationCode
            ? current
            : { ...current, ownerClientLocationCode: nextOwnerClientLocationCode }
        })
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingOwnerClientLocations(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [canEditSummary, hasSummaryForm, summaryOwnerClientNumber])

  useEffect(() => {
    if (!canEditSummary || !hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientLocations([])
        setIsLoadingAgentClientLocations(false)
      })
      return () => {
        isActive = false
      }
    }

    if (!summaryAgentClientNumber) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientLocations([])
        setIsLoadingAgentClientLocations(false)
        setSummaryForm((current) =>
          current?.agentClientLocationCode ? { ...current, agentClientLocationCode: '' } : current,
        )
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingAgentClientLocations(true)
      }
    })

    void fetchApplicationClientLocations(summaryAgentClientNumber, 'agent')
      .then((locations) => {
        if (!isActive) {
          return
        }

        setAgentClientLocations(locations)
        setSummaryForm((current) => {
          if (!current || current.agentClientNumber.trim() !== summaryAgentClientNumber) {
            return current
          }

          const nextAgentClientLocationCode = resolveClientLocationCode(
            locations,
            current.agentClientLocationCode,
          )
          return current.agentClientLocationCode === nextAgentClientLocationCode
            ? current
            : { ...current, agentClientLocationCode: nextAgentClientLocationCode }
        })
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingAgentClientLocations(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [canEditSummary, hasSummaryForm, summaryAgentClientNumber])

  useEffect(() => {
    if (!canEditSummary || !hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientContacts([])
        setIsLoadingOwnerClientContacts(false)
      })
      return () => {
        isActive = false
      }
    }

    if (!summaryOwnerClientNumber || !summaryOwnerClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientContacts([])
        setIsLoadingOwnerClientContacts(false)
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingOwnerClientContacts(true)
      }
    })

    void fetchApplicationClientContacts(
      summaryOwnerClientNumber,
      summaryOwnerClientLocationCode,
      'owner',
      applicationNumber ?? '',
    )
      .then((contacts) => {
        if (!isActive) {
          return
        }

        setOwnerClientContacts(contacts)
        setSummaryForm((current) => {
          if (
            !current ||
            current.ownerClientNumber.trim() !== summaryOwnerClientNumber ||
            current.ownerClientLocationCode.trim() !== summaryOwnerClientLocationCode
          ) {
            return current
          }

          const nextOwnerContactName = resolveClientContactName(contacts, current.ownerContactName)
          return current.ownerContactName === nextOwnerContactName
            ? current
            : { ...current, ownerContactName: nextOwnerContactName }
        })
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingOwnerClientContacts(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [
    applicationNumber,
    canEditSummary,
    hasSummaryForm,
    summaryOwnerClientLocationCode,
    summaryOwnerClientNumber,
  ])

  useEffect(() => {
    if (!canEditSummary || !hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientContacts([])
        setIsLoadingAgentClientContacts(false)
      })
      return () => {
        isActive = false
      }
    }

    if (!summaryAgentClientNumber || !summaryAgentClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientContacts([])
        setIsLoadingAgentClientContacts(false)
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingAgentClientContacts(true)
      }
    })

    void fetchApplicationClientContacts(
      summaryAgentClientNumber,
      summaryAgentClientLocationCode,
      'agent',
      applicationNumber ?? '',
    )
      .then((contacts) => {
        if (!isActive) {
          return
        }

        setAgentClientContacts(contacts)
        setSummaryForm((current) => {
          if (
            !current ||
            current.agentClientNumber.trim() !== summaryAgentClientNumber ||
            current.agentClientLocationCode.trim() !== summaryAgentClientLocationCode
          ) {
            return current
          }

          const nextAgentContactName = resolveClientContactName(contacts, current.agentContactName)
          return current.agentContactName === nextAgentContactName
            ? current
            : { ...current, agentContactName: nextAgentContactName }
        })
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingAgentClientContacts(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [
    applicationNumber,
    canEditSummary,
    hasSummaryForm,
    summaryAgentClientLocationCode,
    summaryAgentClientNumber,
  ])

  useEffect(() => {
    if (!needsApplicationOptions || !hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setSummaryOptionsAvailability('idle')
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setSummaryOptionsAvailability('loading')
      }
    })

    void fetchProvincialApplicationOptions()
      .then((options) => {
        if (!isActive) {
          return
        }

        setSummaryExemptionReasonOptions(options.exemptionReasons)
        setSummaryApplicationStatusOptions(options.applicationStatuses)
        setSummaryProductTypeOptions(options.productTypes)
        setSummaryGrowthTypeOptions(options.growthTypes)
        setSummaryRegionOptions(options.regions)
        setSummaryScheduleOptions(options.currentSchedules)
        setSummaryOptionsAvailability('available')
      })
      .catch(() => {
        if (!isActive) {
          return
        }

        setSummaryExemptionReasonOptions([])
        setSummaryApplicationStatusOptions([])
        setSummaryProductTypeOptions([])
        setSummaryGrowthTypeOptions([])
        setSummaryRegionOptions([])
        setSummaryScheduleOptions([])
        setSummaryOptionsAvailability('unavailable')
      })

    return () => {
      isActive = false
    }
  }, [hasSummaryForm, needsApplicationOptions])

  useEffect(() => {
    if (!canEditSummary || !summaryForm?.orgUnitNumber || !summaryForm.productTypeCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setApplicationSpeciesOptions([])
        setApplicationSpeciesCandidate('')
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void fetchApplicationRemainingSpecies(
      summaryForm.orgUnitNumber,
      summaryForm.productTypeCode,
      summarySpeciesCodes,
    )
      .then((options) => {
        if (!isActive) {
          return
        }
        setApplicationSpeciesOptions(options)
        setApplicationSpeciesCandidate((current) =>
          current && options.some((option) => option.code === current)
            ? current
            : (options[0]?.code ?? ''),
        )
      })
      .catch(() => {
        if (!isActive) {
          return
        }
        setApplicationSpeciesOptions([])
        setApplicationSpeciesCandidate('')
      })

    return () => {
      isActive = false
    }
  }, [
    canEditSummary,
    summaryForm?.orgUnitNumber,
    summaryForm?.productTypeCode,
    summarySpeciesCodes,
  ])

  useEffect(() => {
    if (!canEditSummary || !summaryForm?.orgUnitNumber || summarySpeciesCodes.length === 0) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setApplicationEndUseOptions([])
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void fetchApplicationEndUsesForSpeciesRegion(summaryForm.orgUnitNumber, summarySpeciesCodes)
      .then((options) => {
        if (!isActive) {
          return
        }
        setApplicationEndUseOptions(options)
        setSummaryForm((current) => {
          if (!current || current.speciesCodes.join(',') !== summarySpeciesKey) {
            return current
          }
          if (current.endUseCode && options.some((option) => option.code === current.endUseCode)) {
            return current
          }
          return { ...current, endUseCode: options[0]?.code ?? current.endUseCode }
        })
      })
      .catch(() => {
        if (!isActive) {
          return
        }
        setApplicationEndUseOptions([])
      })

    return () => {
      isActive = false
    }
  }, [canEditSummary, summaryForm?.orgUnitNumber, summarySpeciesCodes, summarySpeciesKey])

  useEffect(() => {
    if (!canReviewApplication) {
      return
    }

    const loadReviewOptions = async () => {
      try {
        const options = await fetchApplicationReviewOptions()
        setReviewStatusOptions(options.reviewStatuses)
        setReviewOptionsAvailability('available')
      } catch {
        setReviewStatusOptions([])
        setReviewOptionsAvailability('unavailable')
      }
    }

    void loadReviewOptions()
  }, [canReviewApplication])

  const onCreateOffer = useCallback(() => {
    if (!detail || !canCreateApplicationOffer) {
      return
    }

    const params = new URLSearchParams()
    params.set('applicationNumber', String(detail.applicationNumber))
    params.set('packageNumber', offerPackageNumbers[0])
    params.set('packageNumbers', offerPackageNumbers.join(','))

    navigate(`/provincial/offers/create?${params.toString()}`)
  }, [canCreateApplicationOffer, detail, navigate, offerPackageNumbers])

  const refreshApplicationDocuments = useCallback(async () => {
    if (!applicationNumber) {
      return
    }

    setDocumentLookupAvailability('loading')
    try {
      const documentsResult = await fetchApplicationDocuments(applicationNumber)
      setDocumentRows(documentsResult.rows)
      setDocumentLookupAvailability('available')
      setDocumentsErrorMessage('')
    } catch (error) {
      setDocumentRows([])
      setDocumentLookupAvailability('unavailable')
      setDocumentsErrorMessage('Unable to retrieve application documents.')
      throw error
    }
  }, [applicationNumber])

  const onOpenDocument = useCallback(
    async (row: ProvincialApplicationDocumentRow) => {
      if (!applicationNumber) {
        return
      }

      setActionErrorMessage('')
      setActionInfoMessage('')

      try {
        const result = await openApplicationDocument(row.id, row.name, applicationNumber)
        triggerBrowserDownload(result.blob, result.filename || row.name)
      } catch {
        setActionErrorMessage('Unable to open the selected document.')
      }
    },
    [applicationNumber],
  )

  const onRemoveDocument = useCallback(
    async (row: ProvincialApplicationDocumentRow) => {
      if (!applicationNumber) {
        return
      }

      const isLatestRequest = beginDetailRequest()
      setIsRemovingDocumentId(row.id)
      setActionErrorMessage('')
      setActionInfoMessage('')

      try {
        const removeResult = await removeApplicationDocument(row.id, applicationNumber)
        if (!isLatestRequest()) {
          return
        }
        if (!removeResult.success) {
          setActionErrorMessage('Document removal failed. Refresh and try again.')
          return
        }

        const documentsResult = await fetchApplicationDocuments(applicationNumber)
        if (isLatestRequest()) {
          setDocumentRows(documentsResult.rows)
          setDocumentLookupAvailability('available')
        }
      } catch {
        if (isLatestRequest()) {
          setDocumentLookupAvailability('unavailable')
          setDocumentsErrorMessage('Unable to retrieve application documents.')
          setActionErrorMessage('Unable to remove the selected document.')
        }
      } finally {
        if (isLatestRequest()) {
          setIsRemovingDocumentId(null)
        }
      }
    },
    [applicationNumber, beginDetailRequest],
  )

  const onSaveRemark = useCallback(
    async (refreshAfterSave = true): Promise<boolean> => {
      if (!applicationNumber || !detail || isSavingRemark) {
        return false
      }

      const normalizedRemark = remarkBody.trim()
      if (!normalizedRemark) {
        setRemarkValidationMessage('Remark is required.')
        return false
      }

      setRemarkValidationMessage('')
      setActionErrorMessage('')
      setActionInfoMessage('')
      setIsSavingRemark(true)
      try {
        const result = await saveApplicationRemark({
          applicationNumber: String(detail.applicationNumber),
          remarkBody: normalizedRemark,
          remarkId: editingRemarkId ?? undefined,
        })
        if (!result.success) {
          setActionErrorMessage('Unable to save application remark.')
          return false
        }

        const savedRemarkId = Number(result.remarkId)
        const savedRemark = {
          remarkId: Number.isFinite(savedRemarkId) ? savedRemarkId : null,
          title: result.title || normalizedRemark,
          remark: result.remark || normalizedRemark,
          user: result.user || null,
          date: null,
        }
        setDetail((current) =>
          current
            ? {
                ...current,
                remarks: [
                  savedRemark,
                  ...current.remarks.filter(
                    (remark) => !savedRemark.remarkId || remark.remarkId !== savedRemark.remarkId,
                  ),
                ],
              }
            : current,
        )
        setRemarkBody('')
        setEditingRemarkId(null)
        if (refreshAfterSave) {
          const preservedSummaryForm = summaryForm
          const preservedSummaryBaselineForm = summaryBaselineForm
          const preservedReviewStatusCode = reviewStatusCode
          const preservedReviewStatusRemark = reviewStatusRemark
          const preservedReviewStatusBaselineCode = reviewStatusBaselineCode
          const preservedReviewStatusRemarkBaseline = reviewStatusRemarkBaseline
          await loadApplicationDetail()
          setSummaryForm(preservedSummaryForm)
          setSummaryBaselineForm(preservedSummaryBaselineForm)
          setReviewStatusCode(preservedReviewStatusCode)
          setReviewStatusRemark(preservedReviewStatusRemark)
          setReviewStatusBaselineCode(preservedReviewStatusBaselineCode)
          setReviewStatusRemarkBaseline(preservedReviewStatusRemarkBaseline)
        }
        setActionInfoMessage(
          editingRemarkId ? 'Application remark updated.' : 'Application remark saved.',
        )
        return true
      } catch {
        setActionErrorMessage('Unable to save application remark.')
        return false
      } finally {
        setIsSavingRemark(false)
      }
    },
    [
      applicationNumber,
      detail,
      editingRemarkId,
      isSavingRemark,
      loadApplicationDetail,
      remarkBody,
      reviewStatusCode,
      reviewStatusRemark,
      reviewStatusBaselineCode,
      reviewStatusRemarkBaseline,
      summaryBaselineForm,
      summaryForm,
    ],
  )

  const onSummaryFormChange = useCallback(
    (key: keyof ApplicationSummaryFormState, value: string) => {
      setSummaryForm((current) => {
        if (!current) {
          return current
        }

        const next = { ...current, [key]: value }
        return key === 'applicantTypeCode' ? normalizeSummaryAgentFields(next) : next
      })
      setSummaryVolumeWarningAccepted(false)
      setActionWarningMessage('')
    },
    [],
  )

  const onAddApplicationSpecies = useCallback(() => {
    const nextSpecies = applicationSpeciesCandidate.trim()
    if (!nextSpecies) {
      return
    }

    setSummaryForm((current) => {
      if (!current || current.speciesCodes.includes(nextSpecies)) {
        return current
      }
      return { ...current, speciesCodes: [...current.speciesCodes, nextSpecies] }
    })
    setSummaryVolumeWarningAccepted(false)
    setActionWarningMessage('')
  }, [applicationSpeciesCandidate])

  const onRemoveApplicationSpecies = useCallback((speciesCode: string) => {
    setSummaryForm((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        speciesCodes: current.speciesCodes.filter((code) => code !== speciesCode),
      }
    })
    setSummaryVolumeWarningAccepted(false)
    setActionWarningMessage('')
  }, [])

  const onSaveSummary = useCallback(
    async (refreshAfterSave = true, accuracyAcknowledged = false): Promise<boolean> => {
      if (requiresApplicationAccuracyAcknowledgement && !accuracyAcknowledged) {
        return false
      }
      if (
        !applicationNumber ||
        !detail ||
        !summaryForm ||
        isSavingSummary ||
        summaryOptionsAvailability !== 'available' ||
        requiredSummaryOptionsMissing
      ) {
        return false
      }
      if (!canEditSummary) {
        setActionErrorMessage(
          'Application details can only be edited while the application is New or Approved.',
        )
        return false
      }

      setActionErrorMessage('')
      setActionInfoMessage('')
      setActionWarningMessage('')
      if (hasSummaryValidationError) {
        setShowSummaryValidationErrors(true)
        setActionErrorMessage(
          Object.values(summaryFieldErrors).find((error): error is string => !!error) ??
            'Please fix validation errors before saving the application summary.',
        )
        return false
      }

      setIsSavingSummary(true)
      try {
        if (!summaryVolumeWarningAccepted) {
          const volumeUsage = await checkApplicationVolumeUsage(String(detail.applicationNumber))
          if (!volumeUsage.volumeUsed) {
            setSummaryVolumeWarningAccepted(true)
            setActionWarningMessage(
              'The sum of package volumes is less than the total application volume. Review package volumes or save again to continue.',
            )
            return false
          }
        }

        const summaryRequestForm = normalizeSummaryAgentFields(summaryForm)
        const result = await updateApplicationSummary({
          applicationNumber: String(detail.applicationNumber),
          applicationDate: summaryRequestForm.applicationDate,
          receivedDate: summaryRequestForm.receivedDate,
          termDays: calculatedSummaryTermDays,
          applicationVolume: summaryRequestForm.applicationVolume,
          averageLogVolume: summaryRequestForm.averageLogVolume,
          exemptionReasonCode: summaryRequestForm.exemptionReasonCode,
          productLocation: summaryRequestForm.productLocation,
          exportScheduleId: summaryRequestForm.exportScheduleId,
          agentClientNumber: summaryRequestForm.agentClientNumber,
          agentClientLocationCode: summaryRequestForm.agentClientLocationCode,
          ownerClientNumber: summaryRequestForm.ownerClientNumber,
          ownerClientLocationCode: summaryRequestForm.ownerClientLocationCode,
          applicantTypeCode: canChangeApplicantType
            ? summaryRequestForm.applicantTypeCode
            : undefined,
          orgUnitNumber: summaryRequestForm.orgUnitNumber,
          productTypeCode: summaryRequestForm.productTypeCode,
          growthTypeCode: summaryRequestForm.growthTypeCode,
          agentContactName: summaryRequestForm.agentContactName,
          ownerContactName: summaryRequestForm.ownerContactName,
          oicIndicator: summaryRequestForm.oicIndicator,
          endUseCode: summaryRequestForm.endUseCode,
          speciesCodes: summaryRequestForm.speciesCodes,
        })
        if (!result.valid) {
          setActionErrorMessage(
            result.errors.length > 0
              ? result.errors.join(' ')
              : result.message || 'Unable to save application summary.',
          )
          return false
        }

        setSummaryForm(summaryRequestForm)
        setSummaryBaselineForm(summaryRequestForm)
        if (refreshAfterSave) {
          const preservedRemarkBody = remarkBody
          const preservedEditingRemarkId = editingRemarkId
          const preservedReviewStatusCode = reviewStatusCode
          const preservedReviewStatusRemark = reviewStatusRemark
          const preservedReviewStatusBaselineCode = reviewStatusBaselineCode
          const preservedReviewStatusRemarkBaseline = reviewStatusRemarkBaseline
          await loadApplicationDetail()
          setRemarkBody(preservedRemarkBody)
          setEditingRemarkId(preservedEditingRemarkId)
          setReviewStatusCode(preservedReviewStatusCode)
          setReviewStatusRemark(preservedReviewStatusRemark)
          setReviewStatusBaselineCode(preservedReviewStatusBaselineCode)
          setReviewStatusRemarkBaseline(preservedReviewStatusRemarkBaseline)
        }
        setShowSummaryValidationErrors(false)
        setSummaryVolumeWarningAccepted(false)
        setActionInfoMessage(result.message || 'Application summary saved.')
        return true
      } catch {
        setActionErrorMessage('Unable to save application summary.')
        return false
      } finally {
        setIsSavingSummary(false)
      }
    },
    [
      applicationNumber,
      calculatedSummaryTermDays,
      canChangeApplicantType,
      canEditSummary,
      detail,
      editingRemarkId,
      hasSummaryValidationError,
      isSavingSummary,
      loadApplicationDetail,
      remarkBody,
      requiredSummaryOptionsMissing,
      requiresApplicationAccuracyAcknowledgement,
      reviewStatusCode,
      reviewStatusRemark,
      reviewStatusBaselineCode,
      reviewStatusRemarkBaseline,
      summaryFieldErrors,
      summaryForm,
      summaryOptionsAvailability,
      summaryVolumeWarningAccepted,
    ],
  )

  const closeSummaryAccuracyConfirmation = useCallback(() => {
    setSummaryAccuracyConfirmationOpen(false)
    setSummaryAccuracyConfirmed(false)
    setSummaryAccuracyApplicationNumber(null)
  }, [])

  const onRequestSaveSummary = useCallback(() => {
    if (!requiresApplicationAccuracyAcknowledgement) {
      void onSaveSummary()
      return
    }
    setSummaryAccuracyConfirmed(false)
    setSummaryAccuracyApplicationNumber(applicationNumber ?? null)
    setSummaryAccuracyConfirmationOpen(true)
  }, [applicationNumber, onSaveSummary, requiresApplicationAccuracyAcknowledgement])

  const onConfirmSummaryAccuracy = useCallback(async () => {
    if (!summaryAccuracyConfirmed || isSavingSummary) return
    await onSaveSummary(true, true)
  }, [isSavingSummary, onSaveSummary, summaryAccuracyConfirmed])

  const buildReviewStatusPayload = useCallback(
    (requireEmail: boolean) => {
      const statusCode = normalizedReviewStatusCode
      const normalizedClientEmailAddress = normalizeReviewEmail(reviewStatusEmailAddress)
      const clientEmailAddress = isValidEmail(normalizedClientEmailAddress)
        ? normalizedClientEmailAddress
        : ''
      const remark = reviewStatusRemark.trim()
      if (
        !statusCode ||
        !reviewStatusOptions.some((option) => normalizeReviewStatus(option.value) === statusCode)
      ) {
        return {
          valid: false,
          message: REVIEW_STATUS_REQUIRED_MESSAGE,
          payload: null,
        }
      }

      if (REVIEW_STATUSES_REQUIRING_REMARK.has(statusCode) && !remark) {
        return {
          valid: false,
          message: REVIEW_REMARK_REQUIRED_MESSAGE,
          payload: null,
        }
      }

      if (requireEmail) {
        if (!canSendReviewStatusEmail) {
          return {
            valid: false,
            message: REVIEW_EMAIL_UNSUPPORTED_MESSAGE,
            payload: null,
          }
        }

        if (!clientEmailAddress || !isValidEmail(clientEmailAddress)) {
          return {
            valid: false,
            message: REVIEW_EMAIL_REQUIRED_MESSAGE,
            payload: null,
          }
        }
      }

      return {
        valid: true,
        message: '',
        payload: {
          statusCode,
          remark,
          clientEmailAddress,
        },
      }
    },
    [
      canSendReviewStatusEmail,
      normalizedReviewStatusCode,
      reviewStatusEmailAddress,
      reviewStatusRemark,
      reviewStatusOptions,
    ],
  )

  const onApproveApplication = useCallback(async (): Promise<boolean> => {
    if (!detail || !canReviewApplication || isSubmittingReviewAction) {
      return false
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    setReviewValidationMessage('')
    setIsSubmittingReviewAction(true)
    try {
      const result = await approveApplicationReview(String(detail.applicationNumber))
      if (!result.valid || !result.updated) {
        setActionErrorMessage(result.message || 'Unable to approve application.')
        return false
      }

      applyReviewStatusResult(result, reviewStatusRemark)
      setActionInfoMessage(result.message || 'Application approved.')
      return true
    } catch {
      setActionErrorMessage('Unable to approve application.')
      return false
    } finally {
      setIsSubmittingReviewAction(false)
    }
  }, [
    applyReviewStatusResult,
    canReviewApplication,
    detail,
    isSubmittingReviewAction,
    reviewStatusRemark,
  ])

  const onUpdateReviewStatus = useCallback(
    async (sendEmail: boolean): Promise<boolean> => {
      if (
        !detail ||
        !canReviewApplication ||
        isSubmittingReviewAction ||
        reviewOptionsAvailability !== 'available' ||
        reviewStatusOptions.length === 0
      ) {
        return false
      }

      const payloadResult = buildReviewStatusPayload(sendEmail)
      if (!payloadResult.valid || !payloadResult.payload) {
        setReviewValidationMessage(payloadResult.message)
        return false
      }

      setActionErrorMessage('')
      setActionInfoMessage('')
      setReviewValidationMessage('')
      setIsSubmittingReviewAction(true)
      try {
        const updateResult = await updateApplicationReviewStatus(
          String(detail.applicationNumber),
          payloadResult.payload,
        )
        if (!updateResult.valid || !updateResult.updated) {
          setActionErrorMessage(updateResult.message || 'Unable to update application status.')
          return false
        }

        if (sendEmail) {
          const emailResult = await sendApplicationReviewStatusEmail(
            String(detail.applicationNumber),
            payloadResult.payload,
          )
          if (!emailResult.success) {
            applyReviewStatusResult(updateResult, payloadResult.payload.remark)
            setActionErrorMessage(
              emailResult.message ===
                'Application status email is not configured yet. No email was sent.'
                ? 'Application status email is not configured yet. The application status was updated, but no email was sent.'
                : emailResult.message || 'Application status updated; email could not be queued.',
            )
            return false
          }
        }

        applyReviewStatusResult(updateResult, payloadResult.payload.remark)
        setActionInfoMessage(
          sendEmail
            ? 'Application status updated and email queued.'
            : updateResult.message || 'Application status updated.',
        )
        return true
      } catch {
        setActionErrorMessage('Unable to update application status.')
        return false
      } finally {
        setIsSubmittingReviewAction(false)
      }
    },
    [
      applyReviewStatusResult,
      buildReviewStatusPayload,
      canReviewApplication,
      detail,
      isSubmittingReviewAction,
      reviewOptionsAvailability,
      reviewStatusOptions.length,
    ],
  )

  const refreshApplicationDetailPreservingDrafts = useCallback(async (): Promise<void> => {
    const targetApplicationNumber = applicationNumber
    if (
      !targetApplicationNumber ||
      currentApplicationNumberRef.current !== targetApplicationNumber
    ) {
      return
    }

    const preservedSummaryForm = summaryForm
    const preservedSummaryBaselineForm = summaryBaselineForm
    const preservedSummaryVolumeWarningAccepted = summaryVolumeWarningAccepted
    const preservedShowSummaryValidationErrors = showSummaryValidationErrors
    const preservedApplicationSpeciesCandidate = applicationSpeciesCandidate
    const preservedRemarkBody = remarkBody
    const preservedEditingRemarkId = editingRemarkId
    const preservedRemarkValidationMessage = remarkValidationMessage
    const preservedReviewStatusCode = reviewStatusCode
    const preservedReviewStatusRemark = reviewStatusRemark
    const preservedReviewStatusBaselineCode = reviewStatusBaselineCode
    const preservedReviewStatusRemarkBaseline = reviewStatusRemarkBaseline
    const preservedReviewValidationMessage = reviewValidationMessage

    await loadApplicationDetail()
    if (currentApplicationNumberRef.current !== targetApplicationNumber) return

    setSummaryForm(preservedSummaryForm)
    setSummaryBaselineForm(preservedSummaryBaselineForm)
    setSummaryVolumeWarningAccepted(preservedSummaryVolumeWarningAccepted)
    setShowSummaryValidationErrors(preservedShowSummaryValidationErrors)
    setApplicationSpeciesCandidate(preservedApplicationSpeciesCandidate)
    setRemarkBody(preservedRemarkBody)
    setEditingRemarkId(preservedEditingRemarkId)
    setRemarkValidationMessage(preservedRemarkValidationMessage)
    setReviewStatusCode(preservedReviewStatusCode)
    setReviewStatusRemark(preservedReviewStatusRemark)
    setReviewStatusBaselineCode(preservedReviewStatusBaselineCode)
    setReviewStatusRemarkBaseline(preservedReviewStatusRemarkBaseline)
    setReviewValidationMessage(preservedReviewValidationMessage)
  }, [
    applicationNumber,
    applicationSpeciesCandidate,
    editingRemarkId,
    loadApplicationDetail,
    remarkBody,
    remarkValidationMessage,
    reviewStatusBaselineCode,
    reviewStatusCode,
    reviewStatusRemark,
    reviewStatusRemarkBaseline,
    reviewValidationMessage,
    showSummaryValidationErrors,
    summaryBaselineForm,
    summaryForm,
    summaryVolumeWarningAccepted,
  ])

  const summaryDirty =
    canEditSummary &&
    !!summaryForm &&
    !!summaryBaselineForm &&
    !formValuesEqual(summaryForm, summaryBaselineForm)
  const remarkBaselineBody = editingRemarkId
    ? (detail?.remarks.find((remark) => String(remark.remarkId) === editingRemarkId)?.remark ?? '')
    : ''
  const remarkDirty = canManageRemarks && remarkBody !== remarkBaselineBody
  const reviewDirty =
    canReviewApplication &&
    (normalizedReviewStatusCode !== normalizeReviewStatus(reviewStatusBaselineCode) ||
      reviewStatusRemark !== reviewStatusRemarkBaseline)
  const isApplicationDirty =
    summaryDirty || remarkDirty || reviewDirty || applicationItemsDirty || documentUploadDirty

  const onSaveUnsavedApplicationChanges = useCallback(async (): Promise<boolean> => {
    if (documentUploadDirty) {
      setActionErrorMessage(
        'Queued document uploads must be submitted or reset before leaving this application.',
      )
      return false
    }
    if (applicationItemsDirty) {
      setSelectedApplicationTab('items')
      setActionErrorMessage(
        'Save or reset the package, species, or scale draft in the Items tab before leaving this application.',
      )
      return false
    }
    if (summaryDirty && !(await onSaveSummary(false, true))) return false
    if (remarkDirty && !(await onSaveRemark(false))) return false
    if (reviewDirty) {
      const reviewSaved = await (normalizedReviewStatusCode === 'APP'
        ? onApproveApplication()
        : onUpdateReviewStatus(false))
      if (!reviewSaved) return false
    }
    return true
  }, [
    normalizedReviewStatusCode,
    applicationItemsDirty,
    documentUploadDirty,
    onApproveApplication,
    onSaveRemark,
    onSaveSummary,
    onUpdateReviewStatus,
    remarkDirty,
    reviewDirty,
    summaryDirty,
  ])

  const onDiscardApplicationChanges = useCallback(() => {
    setSummaryForm(
      summaryBaselineForm ??
        (detail ? normalizeSummaryAgentFields(toSummaryFormState(detail)) : null),
    )
    setSummaryVolumeWarningAccepted(false)
    closeSummaryAccuracyConfirmation()
    setShowSummaryValidationErrors(false)
    setApplicationSpeciesCandidate('')
    setRemarkBody('')
    setEditingRemarkId(null)
    setRemarkValidationMessage('')
    setReviewStatusCode(reviewStatusBaselineCode)
    setReviewStatusRemark(reviewStatusRemarkBaseline)
    setReviewValidationMessage('')
    setActionErrorMessage('')
    setActionWarningMessage('')
    setDocumentUploadDirty(false)
    setDocumentUploadBusy(false)
    setDocumentUploadResetKey((current) => current + 1)
    setApplicationItemsDirty(false)
    setApplicationItemsBusy(false)
    setApplicationItemsResetKey((current) => current + 1)
  }, [
    closeSummaryAccuracyConfirmation,
    detail,
    reviewStatusBaselineCode,
    reviewStatusRemarkBaseline,
    summaryBaselineForm,
  ])

  const ownerApplicantTypeCode = summaryForm?.applicantTypeCode ?? ''
  const linkedExemptionNumber = detail?.exemptionNumber?.trim() ?? ''
  const canOpenLinkedExemption =
    Boolean(linkedExemptionNumber) &&
    canAccessExemptionRoutes &&
    (!detail?.industryUser || industryViewableExemptionNumber === linkedExemptionNumber)
  const ownerApplicantTypeOption = optionsWithCurrentValue(
    APPLICANT_TYPE_OPTIONS,
    ownerApplicantTypeCode,
  ).find((option) => option.value === ownerApplicantTypeCode)
  const ownerApplicantTypeLabel = ownerApplicantTypeOption
    ? optionLabel(ownerApplicantTypeOption)
    : ownerApplicantTypeCode
  const summaryJurisdictionCode = summaryForm?.jurisdictionCode ?? ''
  const summaryJurisdictionOption = optionsWithCurrentValue(
    JURISDICTION_OPTIONS,
    summaryJurisdictionCode,
  ).find((option) => option.value === summaryJurisdictionCode)
  const summaryJurisdictionLabel = summaryJurisdictionOption
    ? optionLabel(summaryJurisdictionOption)
    : summaryJurisdictionCode
  const ownerClientDetailFields: Array<[string, string]> = [
    ['Client number', summaryForm?.ownerClientNumber ?? String(detail?.ownerClientNumber ?? '')],
    ['Applicant type', ownerApplicantTypeLabel],
    ['Client location', summaryForm?.ownerClientLocationCode ?? ''],
    ['Contact name', summaryForm?.ownerContactName ?? ''],
    ['I am an agent', summaryForm?.applicantTypeCode === 'A' ? 'Yes' : 'No'],
  ]
  const ownerClientSummaryContent =
    ownerClientData || isLoadingOwnerClientData ? (
      <ClientDataSummary
        title="Owner client details"
        clientData={ownerClientData}
        isLoading={isLoadingOwnerClientData}
        detailFields={ownerClientDetailFields}
      />
    ) : null
  const agentClientDetailFields: Array<[string, string]> = [
    ['Agent number', summaryForm?.agentClientNumber ?? String(detail?.agentClientNumber ?? '')],
    ['Applicant type', 'Agent'],
    ['Contact location', summaryForm?.agentClientLocationCode ?? ''],
    ['Contact name', summaryForm?.agentContactName ?? ''],
  ]
  const agentClientSummaryContent =
    agentClientData || isLoadingAgentClientData ? (
      <ClientDataSummary
        title="Agent client details"
        clientData={agentClientData}
        isLoading={isLoadingAgentClientData}
        detailFields={agentClientDetailFields}
      />
    ) : null

  const applicationPermitsContent = detail ? (
    <Tile id="application-permits" className="application-detail-section">
      <h2 className="detail-tile-title">Permits</h2>
      {permitLookupAvailability === 'unavailable' ? (
        <EmptyState
          title="Permits unavailable"
          description="Permit information could not be retrieved for this application."
          headingLevel={3}
          role="alert"
        />
      ) : permitLookupAvailability === 'loading' ? (
        <InlineLoading description="Loading application permits..." />
      ) : permitRows.length > 0 ? (
        <TableFrame ariaLabel="Application permits">
          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Permit</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Open</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {permitRows.map((item) => (
                <TableRow key={item.permitNumber}>
                  <TableCell>{item.permitNumber}</TableCell>
                  <TableCell>
                    <StatusTag status={item.permitStatusDescription} fallbackLabel="Unknown" />
                  </TableCell>
                  <TableCell>
                    <Button
                      kind="ghost"
                      size="sm"
                      disabled={!canPerform('/permitDetails')}
                      onClick={() =>
                        navigate(withCurrentSearch(`/provincial/permit/${item.permitNumber}`))
                      }
                    >
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      ) : (
        <EmptyState
          title="No permits found"
          description="No permits are linked to this provincial application."
          headingLevel={3}
        />
      )}
    </Tile>
  ) : null

  const applicationOffersContent = detail ? (
    <Tile id="application-offers" className="application-detail-section">
      <div className="detail-section-card__header">
        <h2 className="detail-tile-title">Offers</h2>
        {canCreateApplicationOffer && (
          <Button kind="primary" size="sm" onClick={onCreateOffer}>
            Create offer
          </Button>
        )}
      </div>
      {detail.offers.length > 0 ? (
        <>
          <TextInput
            id="applicationDetailOfferFilter"
            labelText="Filter offers"
            value={offerFilter}
            onChange={(event) => updateFilterParam('offerFilter', event.target.value)}
            placeholder="Filter by company, offer number, received date, validity, or withdrawal date"
          />
          <TableFrame ariaLabel="Application offers">
            <Table useZebraStyles>
              <TableHead>
                <TableRow>
                  <TableHeader>Offer</TableHeader>
                  <TableHeader>Company</TableHeader>
                  <TableHeader>Date Received</TableHeader>
                  <TableHeader>Valid</TableHeader>
                  <TableHeader>Withdrawal Date</TableHeader>
                  <TableHeader>Open</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredOffers.map((item) => (
                  <TableRow key={item.offerNumber}>
                    <TableCell>{item.offerNumber}</TableCell>
                    <TableCell>{item.companyName ?? '-'}</TableCell>
                    <TableCell>{item.receivedDate ?? '-'}</TableCell>
                    <TableCell>{item.validOffer ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{item.withdrawalDate ?? '-'}</TableCell>
                    <TableCell>
                      <Button
                        kind="ghost"
                        size="sm"
                        disabled={!canPerform('/offersSearch') || !canPerform('/offerDetails')}
                        onClick={() =>
                          navigate(withCurrentSearch(`/provincial/offers/${item.offerNumber}`))
                        }
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredOffers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>No offer rows matched the current filter.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableFrame>
        </>
      ) : (
        <EmptyState
          title="No offers found"
          description="No purchase offers are linked to this provincial application."
          headingLevel={3}
        />
      )}
    </Tile>
  ) : null

  const applicationReviewContent = detail ? (
    canReviewApplication ? (
      <Tile
        id="application-review"
        className="application-detail-section application-detail-review"
      >
        <h2 className="detail-tile-title">Application review</h2>
        <div className="legacy-search-grid">
          <SearchableSelect
            id="applicationDetailReviewStatus"
            labelText="Application status"
            value={reviewStatusCode}
            placeholder="Select status"
            options={reviewStatusOptions}
            disabled={reviewOptionsAvailability !== 'available' || reviewStatusOptions.length === 0}
            invalid={isReviewStatusInvalid}
            invalidText={reviewValidationMessage}
            onChange={(value) => {
              setReviewStatusCode(value)
              setReviewValidationMessage('')
            }}
          />
          <TextInput
            id="applicationDetailReviewEmail"
            labelText="Client email address"
            helperText={REVIEW_EMAIL_PREVIEW_HELPER}
            value={reviewStatusEmailAddress}
            invalid={reviewValidationMessage === REVIEW_EMAIL_REQUIRED_MESSAGE}
            invalidText={reviewValidationMessage}
            onChange={(event) => {
              setReviewStatusEmailOverride({
                applicationNumber: applicationNumber ?? '',
                value: event.target.value,
              })
              setReviewValidationMessage('')
            }}
          />
        </div>
        <div className="legacy-search-grid">
          <TextArea
            id="applicationDetailReviewRemark"
            labelText="Review remark"
            maxCount={250}
            invalid={isReviewRemarkInvalid}
            invalidText={reviewValidationMessage}
            value={reviewStatusRemark}
            disabled={reviewOptionsAvailability !== 'available' || reviewStatusOptions.length === 0}
            onChange={(event) => {
              setReviewStatusRemark(event.target.value.slice(0, 250))
              setReviewValidationMessage('')
            }}
          />
        </div>
        {showReviewValidationNotification && (
          <AppNotification
            kind="error"
            title="Review validation"
            subtitle={reviewValidationMessage}
            lowContrast
            onCloseButtonClick={() => setReviewValidationMessage('')}
          />
        )}
        <div className="legacy-search-actions">
          <Button
            kind="primary"
            size="sm"
            disabled={isSubmittingReviewAction}
            onClick={() => void onApproveApplication()}
          >
            Approve Application
          </Button>
          <Button
            kind="secondary"
            size="sm"
            disabled={
              isSubmittingReviewAction ||
              reviewOptionsAvailability !== 'available' ||
              reviewStatusOptions.length === 0
            }
            onClick={() => void onUpdateReviewStatus(false)}
          >
            Update Review Status
          </Button>
          <Button
            kind="tertiary"
            size="sm"
            disabled={
              isSubmittingReviewAction ||
              !canSendReviewStatusEmail ||
              reviewOptionsAvailability !== 'available' ||
              reviewStatusOptions.length === 0
            }
            onClick={() => void onUpdateReviewStatus(true)}
          >
            Update Status and Send Email
          </Button>
        </div>
      </Tile>
    ) : (
      <Tile
        id="application-review"
        className="application-detail-section application-detail-review"
      >
        <h2 className="detail-tile-title">Application review</h2>
        <EmptyState
          title="Review unavailable"
          description="Review actions are not available for this application."
          headingLevel={3}
        />
      </Tile>
    )
  ) : null

  const detailMatchesRoute =
    !!detail && !!applicationNumber && String(detail.applicationNumber) === applicationNumber
  const isRefreshingDetail = loading && detailMatchesRoute

  return (
    <Grid
      fullWidth
      className={`default-grid detail-page-grid provincial-application-detail content-loading-region${
        isRefreshingDetail ? ' is-loading' : ''
      }`}
      inert={isRefreshingDetail ? true : undefined}
      aria-busy={isRefreshingDetail}
    >
      <ContentLoadingOverlay
        loading={isRefreshingDetail}
        loadingDescription="Refreshing provincial application detail..."
      />
      <Column sm={4} md={8} lg={16}>
        <DetailBreadcrumb label="Provincial application search" to="/provincial/application" />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <PageHeader
          title={`Application ${
            detailMatchesRoute ? (detail?.applicationNumber ?? '') : (applicationNumber ?? '')
          }`.trim()}
          subtitle="Check and manage this provincial application"
          status={
            detail && detailMatchesRoute ? (
              <StatusTag status={detail.statusDescription ?? detail.applicationStatusCode ?? ''} />
            ) : undefined
          }
        />
      </Column>

      {loading && !detailMatchesRoute && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading provincial application detail..." />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <AppNotification
          kind="error"
          title="Detail unavailable"
          subtitle={errorMessage}
          lowContrast
          onCloseButtonClick={() => setErrorMessage('')}
        />
      )}

      {detail && detailMatchesRoute && (
        <>
          {!!documentsErrorMessage && (
            <AppNotification
              kind="warning"
              title="Documents unavailable"
              subtitle={documentsErrorMessage}
              lowContrast
              onCloseButtonClick={() => setDocumentsErrorMessage('')}
            />
          )}
          {summaryOptionsAvailability === 'unavailable' && (
            <AuthoritativeOptionsUnavailableNotification title="Application options unavailable" />
          )}
          {selectedApplicationTab === 'application' && requiredSummaryOptionsMissing && (
            <AppNotification
              kind="warning"
              title="Application summary options unavailable"
              subtitle={`Missing required options: ${missingSummaryOptionLabels.join(', ')}. Summary changes cannot be saved.`}
              lowContrast
            />
          )}
          {canReviewApplication && reviewOptionsAvailability === 'unavailable' && (
            <AuthoritativeOptionsUnavailableNotification title="Review options unavailable" />
          )}
          {canReviewApplication && requiredReviewOptionsMissing && (
            <AppNotification
              kind="warning"
              title="Review statuses not configured"
              subtitle="No authoritative review statuses are configured. Review status updates are disabled."
              lowContrast
            />
          )}
          {!!actionErrorMessage && (
            <AppNotification
              kind="error"
              title="Action failed"
              subtitle={actionErrorMessage}
              lowContrast
              onCloseButtonClick={() => setActionErrorMessage('')}
            />
          )}
          {!!actionWarningMessage && (
            <AppNotification
              kind="warning"
              title="Review package volumes"
              subtitle={actionWarningMessage}
              lowContrast
              onCloseButtonClick={() => setActionWarningMessage('')}
            />
          )}
          {!!actionInfoMessage && (
            <AppNotification
              kind="info"
              title="Action completed"
              subtitle={actionInfoMessage}
              lowContrast
              autoDismissMs={8000}
              onCloseButtonClick={() => setActionInfoMessage('')}
            />
          )}
          {!!detail.locked && !!detail.lockMessage && (
            <AppNotification
              kind="warning"
              title="Application locked"
              subtitle={detail.lockMessage}
              lowContrast
            />
          )}

          <Column sm={4} md={8} lg={16} className="application-detail-tabs-column">
            <Tabs
              selectedIndex={selectedApplicationTabIndex}
              onChange={({ selectedIndex }) => {
                const selectedTab = APPLICATION_DETAIL_TAB_SLOTS[selectedIndex]
                setSelectedApplicationTab(
                  selectedTab && applicationDetailTabs.includes(selectedTab)
                    ? selectedTab
                    : 'owner',
                )
              }}
            >
              <TabList
                aria-label="Application detail sections"
                contained
                size="md"
                className="application-tabs__list application-detail-tab-list"
              >
                <Tab>Owner</Tab>
                {isSummaryAgentApplicant && <Tab>Agent</Tab>}
                <Tab>Application</Tab>
                <Tab>Items</Tab>
                <Tab>Documents</Tab>
                {canViewRemarks && <Tab>Remarks</Tab>}
                <Tab>Offers</Tab>
                {canViewReview && <Tab>Review</Tab>}
              </TabList>
              <TabPanels>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile
                        id="application-owner-details"
                        className="application-detail-section application-detail-clients"
                      >
                        <h2 className="detail-tile-title">Owner</h2>
                        {ownerClientSummaryContent ?? (
                          <EmptyState
                            title="Owner details unavailable"
                            description="No owner client lookup details are available for this application."
                            headingLevel={3}
                          />
                        )}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                {isSummaryAgentApplicant && (
                  <TabPanel className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <Tile
                          id="application-agent-details"
                          className="application-detail-section application-detail-clients"
                        >
                          <h2 className="detail-tile-title">Agent</h2>
                          {agentClientSummaryContent ?? (
                            <EmptyState
                              title="No agent assigned"
                              description="No agent is assigned to this application."
                              headingLevel={3}
                            />
                          )}
                        </Tile>
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile
                        id="application-summary"
                        className="application-detail-section application-detail-summary"
                      >
                        <h2 className="detail-tile-title">Application summary</h2>
                        <dl className="detail-field-grid">
                          <div className="detail-field-item">
                            <dt className="detail-field-label">Application number</dt>
                            <dd className="detail-field-value">
                              {displayValue(detail.applicationNumber)}
                            </dd>
                          </div>
                          <div className="detail-field-item">
                            <dt className="detail-field-label">Exemption number</dt>
                            <dd className="detail-field-value">
                              {canOpenLinkedExemption ? (
                                <Link
                                  className="cds--link"
                                  to={withCurrentSearch(
                                    `/provincial/exemption/${linkedExemptionNumber}`,
                                  )}
                                >
                                  {linkedExemptionNumber}
                                </Link>
                              ) : (
                                displayValue(detail.exemptionNumber)
                              )}
                            </dd>
                          </div>
                          {[
                            [
                              'Status',
                              displayValue(
                                detail.statusDescription ?? detail.applicationStatusCode,
                              ),
                            ],
                            ['Product type', displayValue(detail.productTypeCode)],
                            ['Owner client number', displayValue(detail.ownerClientNumber)],
                            ['Agent client number', displayValue(detail.agentClientNumber)],
                            ['Org Unit', displayValue(detail.orgUnitName ?? detail.orgUnitNumber)],
                            ['Listing date', displayValue(detail.listingDate)],
                          ].map(([label, value]) => (
                            <div key={label} className="detail-field-item">
                              <dt className="detail-field-label">{label}</dt>
                              <dd className="detail-field-value">{value}</dd>
                            </div>
                          ))}
                        </dl>
                        {canEditSummary && summaryForm ? (
                          <>
                            <div className="legacy-search-grid">
                              <SearchableSelect
                                id="applicationSummaryExemptionReason"
                                labelText="Exemption reason"
                                value={summaryForm.exemptionReasonCode}
                                invalid={Boolean(visibleSummaryFieldError('exemptionReasonCode'))}
                                invalidText={visibleSummaryFieldError('exemptionReasonCode')}
                                disabled={
                                  summaryOptionsAvailability !== 'available' ||
                                  summaryExemptionReasonOptions.length === 0
                                }
                                placeholder="Select exemption reason"
                                options={optionsWithCurrentValue(
                                  exemptionReasonOptions,
                                  summaryForm.exemptionReasonCode,
                                )}
                                onChange={(value) =>
                                  onSummaryFormChange('exemptionReasonCode', value.toUpperCase())
                                }
                              />
                              <IsoDatePicker
                                id="applicationSummaryApplicationDate"
                                labelText="Application date"
                                value={summaryForm.applicationDate}
                                invalid={Boolean(visibleSummaryFieldError('applicationDate'))}
                                invalidText={visibleSummaryFieldError('applicationDate')}
                                onChange={(value) => onSummaryFormChange('applicationDate', value)}
                              />
                              <IsoDatePicker
                                id="applicationSummaryReceivedDate"
                                labelText="Received date"
                                value={summaryForm.receivedDate}
                                invalid={Boolean(visibleSummaryFieldError('receivedDate'))}
                                invalidText={visibleSummaryFieldError('receivedDate')}
                                onChange={(value) => onSummaryFormChange('receivedDate', value)}
                              />
                              <TextInput
                                id="applicationSummaryTermDays"
                                labelText="Term (days)"
                                type="number"
                                min={1}
                                value={summaryForm.termDays}
                                invalid={Boolean(visibleSummaryFieldError('termDays'))}
                                invalidText={visibleSummaryFieldError('termDays')}
                                onChange={(event) =>
                                  onSummaryFormChange('termDays', event.target.value)
                                }
                              />
                              <TextInput
                                id="applicationSummaryTermMonths"
                                labelText="Term (months)"
                                type="number"
                                min={0}
                                value={summaryForm.termMonths}
                                invalid={Boolean(visibleSummaryFieldError('termMonths'))}
                                invalidText={visibleSummaryFieldError('termMonths')}
                                onChange={(event) =>
                                  onSummaryFormChange('termMonths', event.target.value)
                                }
                              />
                              <TextInput
                                id="applicationSummaryTermYears"
                                labelText="Term (years)"
                                type="number"
                                min={0}
                                value={summaryForm.termYears}
                                invalid={Boolean(visibleSummaryFieldError('termYears'))}
                                invalidText={visibleSummaryFieldError('termYears')}
                                onChange={(event) =>
                                  onSummaryFormChange('termYears', event.target.value)
                                }
                              />
                              <TextInput
                                id="applicationSummaryVolume"
                                labelText="Application volume (m³)"
                                type="number"
                                min={0}
                                step="0.1"
                                value={summaryForm.applicationVolume}
                                invalid={Boolean(visibleSummaryFieldError('applicationVolume'))}
                                invalidText={visibleSummaryFieldError('applicationVolume')}
                                onChange={(event) =>
                                  onSummaryFormChange('applicationVolume', event.target.value)
                                }
                              />
                              {productTypeRequiresLogDetails(summaryForm.productTypeCode) && (
                                <TextInput
                                  id="applicationSummaryAverageLogVolume"
                                  labelText="Average log volume"
                                  type="number"
                                  min={0}
                                  max={99.9}
                                  step="0.1"
                                  value={summaryForm.averageLogVolume}
                                  invalid={Boolean(visibleSummaryFieldError('averageLogVolume'))}
                                  invalidText={visibleSummaryFieldError('averageLogVolume')}
                                  onChange={(event) =>
                                    onSummaryFormChange('averageLogVolume', event.target.value)
                                  }
                                />
                              )}
                              <TextInput
                                id="applicationSummaryOwnerClientNumber"
                                labelText="Owner client number"
                                value={summaryForm.ownerClientNumber}
                                invalid={Boolean(visibleSummaryFieldError('ownerClientNumber'))}
                                invalidText={visibleSummaryFieldError('ownerClientNumber')}
                                onChange={(event) =>
                                  onSummaryFormChange('ownerClientNumber', event.target.value)
                                }
                              />
                              <SearchableSelect
                                id="applicationSummaryOwnerClientLocationCode"
                                labelText="Owner client location"
                                value={summaryForm.ownerClientLocationCode}
                                invalid={Boolean(
                                  visibleSummaryFieldError('ownerClientLocationCode'),
                                )}
                                invalidText={visibleSummaryFieldError('ownerClientLocationCode')}
                                disabled={
                                  !summaryForm.ownerClientNumber.trim() ||
                                  isLoadingOwnerClientLocations
                                }
                                placeholder={ownerClientLocationPlaceholder}
                                options={ownerClientLocations
                                  .filter(isSelectableClientLocation)
                                  .map((location) => ({
                                    value: location.locationCode,
                                    label: location.locationName,
                                  }))}
                                onChange={(value) =>
                                  onSummaryFormChange('ownerClientLocationCode', value)
                                }
                              />
                              {hasSelectableOwnerClientContacts || isLoadingOwnerClientContacts ? (
                                <SearchableSelect
                                  id="applicationSummaryOwnerContactName"
                                  labelText="Owner contact name"
                                  value={summaryForm.ownerContactName}
                                  invalid={Boolean(visibleSummaryFieldError('ownerContactName'))}
                                  invalidText={visibleSummaryFieldError('ownerContactName')}
                                  disabled={
                                    !summaryForm.ownerClientLocationCode.trim() ||
                                    isLoadingOwnerClientContacts
                                  }
                                  placeholder={ownerContactPlaceholder}
                                  options={ownerClientContacts
                                    .filter(isSelectableClientContact)
                                    .map((contact) => ({
                                      value: contact.contactName,
                                      label: contact.contactName,
                                    }))}
                                  onChange={(value) =>
                                    onSummaryFormChange('ownerContactName', value)
                                  }
                                />
                              ) : (
                                <TextInput
                                  id="applicationSummaryOwnerContactName"
                                  labelText="Owner contact name"
                                  value={summaryForm.ownerContactName}
                                  invalid={Boolean(visibleSummaryFieldError('ownerContactName'))}
                                  invalidText={visibleSummaryFieldError('ownerContactName')}
                                  disabled={!summaryForm.ownerClientLocationCode.trim()}
                                  placeholder="Enter owner contact name"
                                  onChange={(event) =>
                                    onSummaryFormChange('ownerContactName', event.target.value)
                                  }
                                />
                              )}
                              {canChangeApplicantType ? (
                                <SearchableSelect
                                  id="applicationSummaryApplicantTypeCode"
                                  labelText="Applicant type"
                                  value={summaryForm.applicantTypeCode}
                                  placeholder="Select applicant type"
                                  options={optionsWithCurrentValue(
                                    APPLICANT_TYPE_OPTIONS,
                                    summaryForm.applicantTypeCode,
                                  ).map((option) => ({
                                    value: option.value,
                                    label: optionLabel(option),
                                  }))}
                                  invalid={Boolean(visibleSummaryFieldError('applicantTypeCode'))}
                                  invalidText={visibleSummaryFieldError('applicantTypeCode')}
                                  onChange={(value) =>
                                    onSummaryFormChange('applicantTypeCode', value.toUpperCase())
                                  }
                                />
                              ) : (
                                <TextInput
                                  id="applicationSummaryApplicantTypeCode"
                                  labelText="Applicant type"
                                  value={ownerApplicantTypeLabel}
                                  readOnly
                                />
                              )}
                              {isSummaryAgentApplicant && (
                                <>
                                  <TextInput
                                    id="applicationSummaryAgentClientNumber"
                                    labelText="Agent client number"
                                    value={summaryForm.agentClientNumber}
                                    invalid={Boolean(visibleSummaryFieldError('agentClientNumber'))}
                                    invalidText={visibleSummaryFieldError('agentClientNumber')}
                                    onChange={(event) =>
                                      onSummaryFormChange('agentClientNumber', event.target.value)
                                    }
                                  />
                                  <SearchableSelect
                                    id="applicationSummaryAgentClientLocationCode"
                                    labelText="Agent client location"
                                    value={summaryForm.agentClientLocationCode}
                                    invalid={Boolean(
                                      visibleSummaryFieldError('agentClientLocationCode'),
                                    )}
                                    invalidText={visibleSummaryFieldError(
                                      'agentClientLocationCode',
                                    )}
                                    disabled={
                                      !summaryForm.agentClientNumber.trim() ||
                                      isLoadingAgentClientLocations
                                    }
                                    placeholder={agentClientLocationPlaceholder}
                                    options={agentClientLocations
                                      .filter(isSelectableClientLocation)
                                      .map((location) => ({
                                        value: location.locationCode,
                                        label: location.locationName,
                                      }))}
                                    onChange={(value) =>
                                      onSummaryFormChange('agentClientLocationCode', value)
                                    }
                                  />
                                  {hasSelectableAgentClientContacts ||
                                  isLoadingAgentClientContacts ? (
                                    <SearchableSelect
                                      id="applicationSummaryAgentContactName"
                                      labelText="Agent contact name"
                                      value={summaryForm.agentContactName}
                                      invalid={Boolean(
                                        visibleSummaryFieldError('agentContactName'),
                                      )}
                                      invalidText={visibleSummaryFieldError('agentContactName')}
                                      disabled={
                                        !summaryForm.agentClientLocationCode.trim() ||
                                        isLoadingAgentClientContacts
                                      }
                                      placeholder={agentContactPlaceholder}
                                      options={agentClientContacts
                                        .filter(isSelectableClientContact)
                                        .map((contact) => ({
                                          value: contact.contactName,
                                          label: contact.contactName,
                                        }))}
                                      onChange={(value) =>
                                        onSummaryFormChange('agentContactName', value)
                                      }
                                    />
                                  ) : (
                                    <TextInput
                                      id="applicationSummaryAgentContactName"
                                      labelText="Agent contact name"
                                      value={summaryForm.agentContactName}
                                      invalid={Boolean(
                                        visibleSummaryFieldError('agentContactName'),
                                      )}
                                      invalidText={visibleSummaryFieldError('agentContactName')}
                                      disabled={!summaryForm.agentClientLocationCode.trim()}
                                      placeholder="Enter agent contact name"
                                      onChange={(event) =>
                                        onSummaryFormChange('agentContactName', event.target.value)
                                      }
                                    />
                                  )}
                                </>
                              )}
                              <SearchableSelect
                                id="applicationSummaryRegion"
                                labelText="Region"
                                value={summaryForm.orgUnitNumber}
                                invalid={Boolean(visibleSummaryFieldError('orgUnitNumber'))}
                                invalidText={visibleSummaryFieldError('orgUnitNumber')}
                                disabled={
                                  summaryOptionsAvailability !== 'available' ||
                                  summaryRegionOptions.length === 0
                                }
                                placeholder="Select region"
                                options={optionsWithCurrentValue(
                                  regionOptions,
                                  summaryForm.orgUnitNumber,
                                )}
                                onChange={(value) => onSummaryFormChange('orgUnitNumber', value)}
                              />
                              <SearchableSelect
                                id="applicationSummaryProductType"
                                labelText="Product type"
                                value={summaryForm.productTypeCode}
                                invalid={Boolean(visibleSummaryFieldError('productTypeCode'))}
                                invalidText={visibleSummaryFieldError('productTypeCode')}
                                disabled={
                                  summaryOptionsAvailability !== 'available' ||
                                  summaryProductTypeOptions.length === 0
                                }
                                placeholder="Select product type"
                                options={optionsWithCurrentValue(
                                  productTypeOptions,
                                  summaryForm.productTypeCode,
                                )}
                                onChange={(value) =>
                                  onSummaryFormChange('productTypeCode', value.toUpperCase())
                                }
                              />
                              {productTypeRequiresGrowthType(summaryForm.productTypeCode) && (
                                <SearchableSelect
                                  id="applicationSummaryGrowthType"
                                  labelText="Growth type"
                                  value={summaryForm.growthTypeCode}
                                  invalid={Boolean(visibleSummaryFieldError('growthTypeCode'))}
                                  invalidText={visibleSummaryFieldError('growthTypeCode')}
                                  disabled={
                                    summaryOptionsAvailability !== 'available' ||
                                    summaryGrowthTypeOptions.length === 0
                                  }
                                  placeholder="Select growth type"
                                  options={optionsWithCurrentValue(
                                    growthTypeOptions,
                                    summaryForm.growthTypeCode,
                                  )}
                                  onChange={(value) =>
                                    onSummaryFormChange('growthTypeCode', value.toUpperCase())
                                  }
                                />
                              )}
                              <TextInput
                                id="applicationSummaryStatus"
                                labelText="Application status"
                                value={
                                  resolveApplicationStatusDescription(
                                    summaryForm.applicationStatusCode,
                                  ) ?? summaryForm.applicationStatusCode
                                }
                                readOnly
                              />
                              <TextInput
                                id="applicationSummaryJurisdiction"
                                labelText="Jurisdiction"
                                value={summaryJurisdictionLabel}
                                readOnly
                              />
                              <SearchableSelect
                                id="applicationSummarySchedule"
                                labelText="Listing date"
                                value={summaryForm.exportScheduleId}
                                disabled={
                                  summaryOptionsAvailability !== 'available' ||
                                  summaryScheduleOptions.length === 0
                                }
                                placeholder="Search listing date"
                                options={optionsWithCurrentValue(
                                  summaryScheduleOptions,
                                  summaryForm.exportScheduleId,
                                )}
                                onChange={(value) => onSummaryFormChange('exportScheduleId', value)}
                              />
                              <SearchableSelect
                                id="applicationSummaryOicIndicator"
                                labelText="Order in Council indicator"
                                value={summaryForm.oicIndicator}
                                placeholder="Select Order in Council indicator"
                                options={optionsWithCurrentValue(
                                  OIC_INDICATOR_OPTIONS,
                                  summaryForm.oicIndicator,
                                ).map((option) => ({
                                  value: option.value,
                                  label: optionLabel(option),
                                }))}
                                invalid={Boolean(visibleSummaryFieldError('oicIndicator'))}
                                invalidText={visibleSummaryFieldError('oicIndicator')}
                                onChange={(value) =>
                                  onSummaryFormChange('oicIndicator', value.toUpperCase())
                                }
                              />
                            </div>
                            {productTypeRequiresLogDetails(summaryForm.productTypeCode) && (
                              <div className="legacy-search-grid">
                                <TextArea
                                  id="applicationSummaryProductLocation"
                                  labelText="Location of logs"
                                  value={summaryForm.productLocation}
                                  invalid={Boolean(visibleSummaryFieldError('productLocation'))}
                                  invalidText={visibleSummaryFieldError('productLocation')}
                                  onChange={(event) =>
                                    onSummaryFormChange('productLocation', event.target.value)
                                  }
                                />
                              </div>
                            )}
                            <div className="legacy-search-grid">
                              <div className="legacy-field-stack">
                                <SearchableSelect
                                  id="applicationSummarySpeciesCandidate"
                                  labelText="Application species"
                                  value={applicationSpeciesCandidate}
                                  disabled={applicationSpeciesSelectOptions.length === 0}
                                  placeholder={speciesPlaceholder}
                                  options={applicationSpeciesSelectOptions}
                                  onChange={setApplicationSpeciesCandidate}
                                />
                                <div className="application-species-actions">
                                  <Button
                                    type="button"
                                    kind="secondary"
                                    size="sm"
                                    disabled={
                                      !applicationSpeciesCandidate ||
                                      !availableApplicationSpeciesOptions.some(
                                        (option) => option.code === applicationSpeciesCandidate,
                                      )
                                    }
                                    onClick={onAddApplicationSpecies}
                                  >
                                    Add application species
                                  </Button>
                                  <ul
                                    className="application-species-list"
                                    aria-label="Selected application species"
                                  >
                                    {(summaryForm.speciesCodes ?? []).map((speciesCode) => (
                                      <li key={speciesCode}>
                                        <DismissibleTag
                                          type="blue"
                                          text={speciesCode}
                                          title={`Remove ${speciesCode} from application`}
                                          dismissTooltipLabel={`Remove ${speciesCode} from application`}
                                          onClose={() => onRemoveApplicationSpecies(speciesCode)}
                                        />
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                              <SearchableSelect
                                id="applicationSummaryEndUse"
                                labelText="Application end use"
                                value={summaryForm.endUseCode}
                                disabled={
                                  (summaryForm.speciesCodes ?? []).length === 0 ||
                                  applicationEndUseSelectOptions.length === 0
                                }
                                placeholder={endUsePlaceholder}
                                options={applicationEndUseSelectOptions}
                                onChange={(value) => onSummaryFormChange('endUseCode', value)}
                              />
                            </div>
                            <div className="legacy-search-actions">
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={
                                  isSavingSummary ||
                                  summaryOptionsAvailability !== 'available' ||
                                  requiredSummaryOptionsMissing
                                }
                                onClick={onRequestSaveSummary}
                              >
                                {isSavingSummary ? 'Saving...' : 'Save Summary'}
                              </Button>
                              <Button
                                kind="secondary"
                                size="sm"
                                disabled={isSavingSummary}
                                onClick={() => {
                                  setSummaryForm(summaryBaselineForm ?? toSummaryFormState(detail))
                                  setShowSummaryValidationErrors(false)
                                  closeSummaryAccuracyConfirmation()
                                }}
                              >
                                Reset Summary
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <dl className="detail-field-grid">
                              {[
                                ['Exemption reason', displayValue(detail.exemptionReasonCode)],
                                ['Application date', displayValue(detail.applicationDate)],
                                ['Received date', displayValue(detail.receivedDate)],
                                ['Term (days)', displayValue(detail.termDays)],
                                ['Application volume (m³)', displayValue(detail.applicationVolume)],
                                ...(productTypeRequiresLogDetails(
                                  summaryForm?.productTypeCode ?? '',
                                )
                                  ? [['Average log volume', displayValue(detail.averageLogVolume)]]
                                  : []),
                                [
                                  'Applicant type',
                                  displayValue(summaryForm ? ownerApplicantTypeLabel : null),
                                ],
                                [
                                  'Owner client location',
                                  displayValue(summaryForm?.ownerClientLocationCode),
                                ],
                                ['Owner contact name', displayValue(summaryForm?.ownerContactName)],
                                [
                                  'Agent client location',
                                  displayValue(summaryForm?.agentClientLocationCode),
                                ],
                                ['Agent contact name', displayValue(summaryForm?.agentContactName)],
                                ...(productTypeRequiresGrowthType(
                                  summaryForm?.productTypeCode ?? '',
                                )
                                  ? [['Growth type', displayValue(summaryForm?.growthTypeCode)]]
                                  : []),
                                ...(productTypeRequiresLogDetails(
                                  summaryForm?.productTypeCode ?? '',
                                )
                                  ? [
                                      [
                                        'Location of logs',
                                        displayValue(summaryForm?.productLocation),
                                      ],
                                    ]
                                  : []),
                                [
                                  'Application species',
                                  displayValue(summaryForm?.speciesCodes.join(', ')),
                                ],
                                ['Application end use', displayValue(summaryForm?.endUseCode)],
                              ].map(([label, value]) => (
                                <div key={label} className="detail-field-item">
                                  <dt className="detail-field-label">{label}</dt>
                                  <dd className="detail-field-value">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </>
                        )}
                      </Tile>
                    </Column>

                    <Column sm={4} md={8} lg={16}>
                      {applicationPermitsContent}
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile
                        id="application-packages"
                        className="application-detail-section application-detail-packages"
                      >
                        <h2 className="detail-tile-title">Packages</h2>
                        {detail.packages.length === 0 && (
                          <EmptyState
                            title="No packages found"
                            description="This provincial application does not include any packages."
                            headingLevel={3}
                          />
                        )}
                        {detail.packages.length > 0 && (
                          <>
                            <TextInput
                              id="applicationDetailPackageFilter"
                              labelText="Filter packages"
                              value={packageFilter}
                              onChange={(event) =>
                                updateFilterParam('packageFilter', event.target.value)
                              }
                              placeholder="Filter by package, pieces, or volume"
                            />
                            <TableFrame ariaLabel="Application packages">
                              <Table useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Package number</TableHeader>
                                    <TableHeader>Volume (m³)</TableHeader>
                                    <TableHeader>Pieces</TableHeader>
                                    <TableHeader>Action</TableHeader>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {filteredPackages.map((item) => (
                                    <TableRow key={item.packageNumber}>
                                      <TableCell>{item.packageNumber}</TableCell>
                                      <TableCell>{item.volume.toLocaleString()}</TableCell>
                                      <TableCell>{item.pieceCount.toLocaleString()}</TableCell>
                                      <TableCell>
                                        <Button
                                          kind="ghost"
                                          size="sm"
                                          aria-label={`${
                                            canEditPackages || canAddPackages || canAddScales
                                              ? 'Edit'
                                              : 'View'
                                          } package ${item.packageNumber} items`}
                                          onClick={() => focusPackageInItems(item.packageNumber)}
                                        >
                                          {canEditPackages || canAddPackages || canAddScales
                                            ? 'Edit Items'
                                            : 'View Items'}
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  {filteredPackages.length === 0 && (
                                    <TableRow>
                                      <TableCell colSpan={4}>
                                        No package rows matched the current filter.
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </TableFrame>
                          </>
                        )}
                      </Tile>
                    </Column>
                    <Column sm={4} md={8} lg={16}>
                      <ProvincialApplicationItemsPanel
                        key={`${applicationNumber}-${applicationItemsResetKey}`}
                        detail={detail}
                        canEditPackages={canEditPackages}
                        canAddPackages={canAddPackages}
                        canAddScales={canAddScales}
                        canUpdatePackageNumber={canUpdatePackageNumber}
                        authoritativeOptionsAvailability={packageReferenceOptionsAvailability}
                        productTypeOptions={packageProductTypeOptions}
                        growthTypeOptions={packageGrowthTypeOptions}
                        onDetailChanged={refreshApplicationDetailPreservingDrafts}
                        onDirtyChange={setApplicationItemsDirty}
                        onBusyChange={setApplicationItemsBusy}
                        focusedPackageNumber={focusedPackageNumber}
                        focusedPackageRequestId={focusedPackageRequestId}
                        focusScalesRequestId={shouldFocusScaleSection ? focusedPackageRequestId : 0}
                      />
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile
                        id="application-documents"
                        className="application-detail-section application-detail-documents"
                      >
                        <h2 className="detail-tile-title">Documents</h2>
                        {!!showDocumentUploadUnavailableMessage &&
                          canUploadApplicationDocuments && (
                            <AppNotification
                              kind="info"
                              title="Upload unavailable"
                              subtitle={documentUploadUnavailableMessage}
                              lowContrast
                              onCloseButtonClick={() =>
                                setDismissedDocumentUploadUnavailableMessageKey(
                                  documentUploadUnavailableMessageKey,
                                )
                              }
                            />
                          )}
                        {documentLookupAvailability === 'unavailable' && (
                          <EmptyState
                            title="Documents unavailable"
                            description="Document information could not be retrieved for this application."
                            headingLevel={3}
                            role="alert"
                          />
                        )}
                        {documentLookupAvailability === 'loading' && (
                          <InlineLoading description="Loading application documents..." />
                        )}
                        {documentLookupAvailability === 'available' && !hasApplicationDocuments && (
                          <EmptyState
                            title="No documents found"
                            description="No documents are on file for this application yet."
                            headingLevel={3}
                          />
                        )}
                        {hasApplicationDocuments && (
                          <section
                            className="application-documents-list"
                            aria-label="Application documents"
                          >
                            <TextInput
                              id="applicationDetailDocumentsFilter"
                              labelText="Filter document rows"
                              value={documentsFilter}
                              onChange={(event) =>
                                updateFilterParam('documentsFilter', event.target.value)
                              }
                              placeholder="Filter by file name, description, type, source, or id"
                            />
                            <TableFrame ariaLabel="Application document rows">
                              <Table useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>File Name</TableHeader>
                                    <TableHeader>Description</TableHeader>
                                    <TableHeader>Type</TableHeader>
                                    <TableHeader>Source</TableHeader>
                                    <TableHeader>Actions</TableHeader>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {filteredDocumentRows.map((row) => (
                                    <TableRow key={row.id}>
                                      <TableCell>{row.name || '-'}</TableCell>
                                      <TableCell>{row.description || '-'}</TableCell>
                                      <TableCell>{row.type || '-'}</TableCell>
                                      <TableCell>{formatDocumentSource(row.source)}</TableCell>
                                      <TableCell>
                                        <div className="legacy-search-actions">
                                          <Button
                                            kind="ghost"
                                            size="sm"
                                            onClick={() => void onOpenDocument(row)}
                                          >
                                            Open
                                          </Button>
                                          <Button
                                            kind="danger--ghost"
                                            size="sm"
                                            disabled={
                                              !canDeleteDocuments ||
                                              row.deletable === false ||
                                              isRemovingDocumentId === row.id
                                            }
                                            title={
                                              row.deletable === false
                                                ? `Delete this document from its ${row.source || 'source'} details page.`
                                                : undefined
                                            }
                                            onClick={() => void onRemoveDocument(row)}
                                          >
                                            {isRemovingDocumentId === row.id
                                              ? 'Deleting...'
                                              : 'Delete'}
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  {filteredDocumentRows.length === 0 && (
                                    <TableRow>
                                      <TableCell colSpan={5}>
                                        No document rows matched the current filter.
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </TableFrame>
                          </section>
                        )}
                        {canAddApplicationDocuments && (
                          <Accordion className="application-documents-upload-accordion">
                            <AccordionItem
                              title="Upload new documents"
                              open={
                                !hasApplicationDocuments ||
                                documentUploadDirty ||
                                documentUploadBusy
                              }
                            >
                              <DetailDocumentUploadPanel
                                key={`application-document-upload-${applicationNumber}-${documentUploadResetKey}`}
                                workflowType="application"
                                targetNumber={String(detail.applicationNumber ?? '')}
                                inputId="applicationDocumentUpload"
                                disabled={!detail.applicationNumber}
                                onDirtyChange={setDocumentUploadDirty}
                                onBusyChange={setDocumentUploadBusy}
                                onUploadComplete={refreshApplicationDocuments}
                              />
                            </AccordionItem>
                          </Accordion>
                        )}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                {canViewRemarks && (
                  <TabPanel className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <Tile
                          id="application-remarks"
                          className="application-detail-section application-detail-remarks"
                        >
                          <h2 className="detail-tile-title">Remarks</h2>
                          {canManageRemarks && (
                            <div className="legacy-search-actions">
                              <TextArea
                                id="applicationRemarkBody"
                                labelText={
                                  editingRemarkId ? `Edit Remark ${editingRemarkId}` : 'New Remark'
                                }
                                value={remarkBody}
                                invalid={!!remarkValidationMessage}
                                invalidText={remarkValidationMessage}
                                onChange={(event) => {
                                  setRemarkBody(event.target.value)
                                  if (remarkValidationMessage) {
                                    setRemarkValidationMessage('')
                                  }
                                }}
                              />
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={isSavingRemark}
                                onClick={() => void onSaveRemark()}
                              >
                                {isSavingRemark
                                  ? 'Saving...'
                                  : editingRemarkId
                                    ? 'Update Remark'
                                    : 'Save Remark'}
                              </Button>
                              {editingRemarkId && (
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  disabled={isSavingRemark}
                                  onClick={() => {
                                    setEditingRemarkId(null)
                                    setRemarkBody('')
                                    setRemarkValidationMessage('')
                                  }}
                                >
                                  Cancel Edit
                                </Button>
                              )}
                            </div>
                          )}
                          {(detail.remarks?.length ?? 0) === 0 ? (
                            <EmptyState
                              title="No remarks found"
                              description="No remarks have been added to this provincial application."
                              headingLevel={3}
                            />
                          ) : (
                            <>
                              <TextInput
                                id="applicationDetailRemarkFilter"
                                labelText="Filter remarks"
                                value={remarkFilter}
                                onChange={(event) =>
                                  updateFilterParam('remarkFilter', event.target.value)
                                }
                                placeholder="Filter by title or remark text"
                              />
                              <TableFrame ariaLabel="Application remarks">
                                <Table useZebraStyles>
                                  <TableHead>
                                    <TableRow>
                                      <TableHeader>Date</TableHeader>
                                      <TableHeader>User</TableHeader>
                                      <TableHeader>Title</TableHeader>
                                      <TableHeader>Remark</TableHeader>
                                      {canManageRemarks && <TableHeader>Actions</TableHeader>}
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {filteredRemarks.map((item) => (
                                      <TableRow
                                        key={`${item.remarkId ?? item.title}-${item.remark}`}
                                      >
                                        <TableCell>{displayValue(item.date)}</TableCell>
                                        <TableCell>{displayValue(item.user)}</TableCell>
                                        <TableCell>{item.title}</TableCell>
                                        <TableCell>{item.remark}</TableCell>
                                        {canManageRemarks && (
                                          <TableCell>
                                            <Button
                                              kind="ghost"
                                              size="sm"
                                              disabled={!item.remarkId}
                                              onClick={() => {
                                                setEditingRemarkId(
                                                  item.remarkId ? String(item.remarkId) : null,
                                                )
                                                setRemarkBody(item.remark)
                                                setRemarkValidationMessage('')
                                              }}
                                            >
                                              Edit
                                            </Button>
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    ))}
                                    {filteredRemarks.length === 0 && (
                                      <TableRow>
                                        <TableCell colSpan={canManageRemarks ? 5 : 4}>
                                          No remarks matched the current filter.
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </TableFrame>
                            </>
                          )}
                        </Tile>
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      {applicationOffersContent}
                    </Column>
                  </Grid>
                </TabPanel>
                {canViewReview && (
                  <TabPanel className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        {applicationReviewContent}
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
              </TabPanels>
            </Tabs>
          </Column>
        </>
      )}
      {summaryAccuracyConfirmationOpen &&
        summaryAccuracyApplicationNumber === applicationNumber && (
          <ApplicationAccuracyConfirmation
            open
            confirmed={summaryAccuracyConfirmed}
            busy={isSavingSummary}
            confirmLabel="Save summary"
            pendingLabel="Saving summary…"
            onConfirmedChange={setSummaryAccuracyConfirmed}
            onConfirm={onConfirmSummaryAccuracy}
            onClose={closeSummaryAccuracyConfirmation}
          />
        )}
      <UnsavedChangesGuard
        isDirty={isApplicationDirty}
        isBusy={
          isSavingSummary ||
          isSavingRemark ||
          isSubmittingReviewAction ||
          applicationItemsBusy ||
          isRemovingDocumentId !== null ||
          documentUploadBusy
        }
        onSave={onSaveUnsavedApplicationChanges}
        onDiscard={onDiscardApplicationChanges}
        subject="this application"
        saveAcknowledgement={
          requiresApplicationAccuracyAcknowledgement && summaryDirty
            ? APPLICATION_ACCURACY_ACKNOWLEDGEMENT
            : undefined
        }
        saveUnavailableReason={
          summaryDirty &&
          (summaryOptionsAvailability !== 'available' || requiredSummaryOptionsMissing)
            ? 'Authoritative application options must load before summary changes can be saved.'
            : reviewDirty &&
                (reviewOptionsAvailability !== 'available' || reviewStatusOptions.length === 0)
              ? 'Authoritative review options must load before review changes can be saved.'
              : documentUploadDirty
                ? 'Finish or reset the queued document uploads before leaving, or discard all changes.'
                : applicationItemsDirty
                  ? 'Use the Items tab to save or reset package, species, and scale drafts before leaving, or discard all changes.'
                  : undefined
        }
      />
    </Grid>
  )
}

export default ProvincialApplicationDetailsPage
