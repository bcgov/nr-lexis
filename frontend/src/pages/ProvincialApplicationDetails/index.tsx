import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from 'react'
import {
  Button,
  Checkbox,
  Column,
  FilterableMultiSelect,
  Grid,
  InlineLoading,
  InlineNotification,
  Loading,
  RadioButton,
  RadioButtonGroup,
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
  TableSelectRow,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import {
  Add,
  Box,
  Chat,
  ContainerRegistry,
  DataDefinition,
  DocumentAttachment,
  Edit,
  Enterprise,
  Stamp,
  Task,
} from '@carbon/icons-react'
import { AddDocument } from '@carbon/pictograms-react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import DetailCardTitle from '@/components/DetailCardTitle'
import DetailLoadError from '@/components/DetailLoadError'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import ApplicationAccuracyConfirmation, {
  APPLICATION_ACCURACY_ACKNOWLEDGEMENT,
} from '@/components/ApplicationAccuracyConfirmation'
import ContentLoadingOverlay from '@/components/ContentLoadingOverlay'
import ConfirmationModal from '@/components/ConfirmationModal'
import { useAuth } from '@/context/auth/useAuth'
import { allowedRegions, withinRegions } from '@/context/auth/region-utils'
import { useAllowedRegionOptions } from '@/context/auth/useAllowedRegionOptions'
import { hasProvincialSubmitterRole } from '@/context/auth/role-utils'
import {
  applicationListDateOptions,
  NO_LIST_DATE_VALUE,
} from '@/pages/shared/application-list-date-options'
import {
  formatBusinessDateTimeLabel,
  formatBusinessIsoDate,
  formatIsoDateLabel,
} from '@/utils/date'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { displayValue } from '@/pages/shared/detail-page-utils'
import { landingPageReturnTo, readDetailReturnTo } from '@/pages/shared/detail-navigation'
import {
  fetchProvincialApplicationDetail,
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
  fetchApplicationClientLocations,
  type ApplicationClientData,
  type ApplicationClientLocation,
} from '@/service/application-client-lookup-service'
import {
  fetchApplicationReviewOptions,
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'
import RecordDocumentsSection, {
  DOCUMENT_DELETED_RESULT,
  documentsSavedResult,
} from '@/components/documents/RecordDocumentsSection'
import { useDocumentOpener } from '@/components/documents/useDocumentOpener'
import DetailSidePanel from '@/components/DetailSidePanel'
import IsoDatePicker from '../../components/IsoDatePicker'
import SearchableSelect from '../../components/SearchableSelect'
import ForestClientComboBox from '@/components/ForestClientComboBox'
import { nonNegativeWholeNumberFieldError } from '@/pages/shared/application-term-utils'
import {
  CLIENT_LOOKUP_UNAVAILABLE_MESSAGE,
  averageLogVolumeFieldError,
  clientLookupNumbersMatch,
  clientLocationLabel,
  isAgentApplicant,
  isSelectableClientLocation,
  productTypeRequiresGrowthType,
  productTypeRequiresLogDetails,
  resolveClientLocationCode,
  toApplicationCodeOption,
  toSearchOption,
} from '@/pages/shared/application-form-utils'
import {
  atMostTwoDecimalFieldError,
  firstValidationError,
  greaterThanFieldError,
  isoDateFieldError,
  maxLengthFieldError,
  maxNumericValueFieldError,
  positiveNumericFieldError,
  requiredFieldError,
  requiredMaxLengthFieldError,
  type FieldErrors,
} from '@/pages/shared/create-form-utils'
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'
import { useReloadPreservedTab } from '@/pages/shared/useReloadPreservedTab'
import { withoutActionError, type ActionResult } from '@/utils/action-result'
import { requiredLabel } from '@/utils/required-label'
import {
  displayTableValue,
  displayValueText,
  isValidEmail,
  normalizeTrimmedText as normalizeEmail,
  normalizeUpperText as normalizeReviewStatus,
} from '@/utils/text'
import { ActionResultNotification } from '../../components/ActionResultNotification'
import { AppNotification } from '../../components/AppNotification'
import ProvincialApplicationItemsPanel from './ApplicationItemsPanel'
import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'
import { displayVolume, formatVolume, formatVolumeInput } from '@/utils/volume'

const APPLICATION_WRITE_ACTIONS = [
  'createApplication',
  '/editCompletedApplications',
  '/applicationsReview',
]

const EMAIL_SUPPORTED_STATUS_CODES = new Set(['REJ', 'WDN'])
// Figma shows a client as "NAME (ACRONYM) · number"; the number stands alone until the name loads.
const clientDisplayName = (
  clientData: ApplicationClientData | null,
  clientNumber: string,
): string => {
  const name = clientData?.companyName.trim() ?? ''
  const acronym = clientData?.clientAcronym.trim() ?? ''
  const number = clientNumber.trim()
  const label = name && acronym ? `${name} (${acronym})` : name
  return label && number ? `${label} · ${number}` : label || number
}

// Figma confirms every Applicant, Application and Scale save, including the first, with this title.
const APPLICATION_SAVED_TITLE = 'The application was saved.'

const REVIEW_STATUS_SUCCESS_TITLES: Record<string, string> = {
  REJ: 'Application rejected.',
  WDN: 'Application withdrawn.',
}
const REVIEW_STATUS_ACTION_LABELS: Record<string, string> = {
  APP: 'Approve application',
  REJ: 'Reject application',
  WDN: 'Withdraw application',
}
const REVIEW_STATUSES_REQUIRING_REMARK = new Set(['EXP', 'REJ', 'WDN'])
const REVIEW_STATUSES_WITH_PERSISTED_REMARK = new Set(['EXP', 'REJ', 'WDN'])
const REVIEW_STATUS_REQUIRED_MESSAGE = 'Choose an application status before updating review status.'
const REVIEW_REMARK_REQUIRED_MESSAGE =
  'Status change remark is required when rejecting, withdrawing, or expiring an application.'
const APPROVAL_REMARK_REQUIRED_MESSAGE = 'Remark is required.'
type LookupAvailability = 'loading' | 'available' | 'unavailable'
type ApplicationActionResult = ActionResult & {
  /** Keeps the creation notice through this application's own reloads. */
  createdFor?: string
  /** Section results render beside their controls instead of the page header. */
  source?: 'items' | 'documents' | 'remarks' | 'review'
  /** Prompts a second save; any change to the summary draft makes it stale. */
  volumeWarning?: boolean
}

const withoutVolumeWarning = (
  current: ApplicationActionResult | null,
): ApplicationActionResult | null => (current?.volumeWarning ? null : current)

/** Opening or leaving an editor drops prompts about the old draft but keeps committed results. */
const withoutDraftResult = (
  current: ApplicationActionResult | null,
): ApplicationActionResult | null => withoutVolumeWarning(withoutActionError(current))
type ApplicationDetailTabKey =
  | 'owner'
  | 'application'
  | 'items'
  | 'documents'
  | 'remarks'
  | 'offers'
  | 'review'
type ApplicationCreationNavigationState = Record<string, unknown> & {
  applicationCreationNotice?: {
    applicationNumber: string
  }
}
// Carbon indexes the conditional JSX children as well as the visible tabs.
// Keep these slots aligned with the TabList and TabPanels declarations below.
const APPLICATION_DETAIL_TAB_SLOTS: readonly ApplicationDetailTabKey[] = [
  'owner',
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
const REVIEW_EMAIL_PREVIEW_HELPER = "Editing this address won't change the client's record."
const APPROVABLE_SOURCE_STATUS_CODES = new Set(['NEW', 'PND'])
const REVIEWABLE_SOURCE_STATUS_CODES = new Set(['NEW', 'PND', 'APP'])
const productTypeSupportsPackages = (productTypeCode?: string | null): boolean =>
  ['H', 'T'].includes((productTypeCode ?? '').trim().toUpperCase())
const APPLICATION_STATUS_LABELS: Record<string, string> = {
  APP: 'Approved',
  EXP: 'Expired',
  NEW: 'New',
  PND: 'Pending',
  REJ: 'Rejected',
  WDN: 'Withdrawn',
}
const optionDescription = (options: SearchOption[], value: string | null | undefined): string => {
  const normalizedValue = value?.trim() ?? ''
  return options.find((option) => option.value === normalizedValue)?.label ?? normalizedValue
}

const applicantTypeLabel = (value: string | null | undefined): string => {
  switch (value?.trim().toUpperCase()) {
    case 'A':
      return 'Agent'
    case 'M':
      return 'Ministerial'
    case 'O':
      return 'Owner'
    default:
      return value?.trim() ?? ''
  }
}

type ClientDataSummaryProps = {
  title: string
  showTitle?: boolean
  clientData: ApplicationClientData | null
  isLoading: boolean
  detailFields?: Array<[string, ReactNode]>
}

function ClientDataSummary({
  title,
  showTitle = true,
  clientData,
  isLoading,
  detailFields,
}: ClientDataSummaryProps) {
  const clientLookupMessage = clientData?.notfound ?? ''
  const clientLookupMessageKey = `${clientData?.clientNumber ?? ''}:${clientLookupMessage}`
  const [dismissedClientLookupMessageKey, setDismissedClientLookupMessageKey] = useState<
    string | null
  >(null)
  const persistedDetailFields = detailFields ?? []

  if (!clientData && persistedDetailFields.length === 0) {
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
      {showTitle && <h3 className="application-client-summary__title">{title}</h3>}
      {/* Figma rows: contact, client identity, address, then phone, fax and email. */}
      <div className="application-client-summary__groups">
        {[
          persistedDetailFields.slice(0, 1),
          persistedDetailFields.slice(1),
          clientData
            ? ([
                ['Address', displayValue(clientData.address)],
                ['City', displayValue(clientData.city)],
                ['Province', displayValue(clientData.province)],
                ['Country', displayValue(clientData.country)],
                ['Postal code', displayValue(clientData.postalCode)],
              ] as Array<[string, string]>)
            : [],
          clientData
            ? ([
                ['Phone number', displayValue(clientData.phone)],
                ['Fax number', displayValue(clientData.fax)],
                ['Email address', displayValue(clientData.email)],
              ] as Array<[string, string]>)
            : [],
        ]
          .filter((group) => group.length > 0)
          .map((group) => (
            <dl key={group[0][0]} className="detail-field-grid">
              {group.map(([label, value]) => (
                <div key={label} className="detail-field-item">
                  <dt className="detail-field-label">{label}</dt>
                  <dd className="detail-field-value">{value}</dd>
                </div>
              ))}
            </dl>
          ))}
      </div>
      {!clientData && !isLoading && (
        <InlineNotification
          className="detail-context-notification"
          kind="warning"
          title="Client details unavailable"
          subtitle="The saved application values are shown above. Additional client details could not be loaded."
          lowContrast
          hideCloseButton
        />
      )}
      {clientLookupMessage && dismissedClientLookupMessageKey !== clientLookupMessageKey && (
        <InlineNotification
          className="detail-context-notification"
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

const optionsWithCurrentValue = (
  options: SearchOption[],
  currentValue: string,
  currentLabel?: string | null,
): SearchOption[] => {
  const normalizedCurrentValue = currentValue.trim()
  if (
    !normalizedCurrentValue ||
    options.some((option) => option.value === normalizedCurrentValue)
  ) {
    return options
  }

  return [
    {
      value: normalizedCurrentValue,
      label: currentLabel?.trim() || normalizedCurrentValue,
    },
    ...options,
  ]
}

const isActiveOrUnchangedOption = (
  options: SearchOption[],
  currentValue: string,
  baselineValue?: string,
): boolean =>
  (baselineValue !== undefined && currentValue === baselineValue) ||
  options.some((option) => option.value === currentValue)

type ApplicationSummaryFormState = {
  applicationDate: string
  receivedDate: string
  termDays: string
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
type SummarySaveSource = 'summary' | 'summary-items' | 'owner' | 'agent' | 'items'
const SUMMARY_SAVE_FIELDS: Record<
  Exclude<SummarySaveSource, 'summary-items'>,
  ApplicationSummaryField[]
> = {
  summary: [
    'orgUnitNumber',
    'exemptionReasonCode',
    'applicationDate',
    'exportScheduleId',
    'termDays',
  ],
  owner: ['ownerClientNumber', 'ownerClientLocationCode', 'ownerContactName', 'applicantTypeCode'],
  agent: ['agentClientNumber', 'agentClientLocationCode', 'agentContactName'],
  items: [
    'productTypeCode',
    'productLocation',
    'growthTypeCode',
    'averageLogVolume',
    'applicationVolume',
    'speciesCodes',
    'endUseCode',
  ],
}
type ApplicationClientLookupFailure =
  | 'owner-data'
  | 'agent-data'
  | 'owner-locations'
  | 'agent-locations'

const MAX_APPLICATION_TERM_DAYS = 99_999
const APPLICATION_CONTACT_NAME_MAX_LENGTH = 120
const APPLICATION_PRODUCT_LOCATION_MAX_LENGTH = 250
const APPLICATION_REMARK_MAX_LENGTH = 250
const APPLICATION_CLIENT_NUMBER_PATTERN = /^\d{1,8}$/
const ASCII_PATTERN = /^[\u0000-\u007f]*$/

const applicationClientNumberFieldError = (value: string, label: string): string | undefined =>
  firstValidationError(
    () => requiredFieldError(value, label),
    () =>
      APPLICATION_CLIENT_NUMBER_PATTERN.test(value.trim())
        ? null
        : `${label} must be 1 to 8 digits.`,
  )

const applicationTextStorageFieldError = (
  value: string,
  maximumLength: number,
  label: string,
  required = false,
): string | undefined =>
  firstValidationError(
    () => (required ? requiredFieldError(value, label) : null),
    () =>
      ASCII_PATTERN.test(value.trim())
        ? null
        : `${label} contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.`,
    () => maxLengthFieldError(value, maximumLength, label),
  )

const toSummaryFormState = (detail: ProvincialApplicationDetail): ApplicationSummaryFormState => ({
  applicationDate: detail.applicationDate ?? '',
  receivedDate: detail.receivedDate ?? '',
  termDays: detail.termDays === null ? '' : String(detail.termDays),
  applicationVolume: formatVolumeInput(detail.applicationVolume),
  averageLogVolume: formatVolumeInput(detail.averageLogVolume),
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
  applicationVolume: formatVolumeInput(snapshot.applicationVolume),
  averageLogVolume: formatVolumeInput(snapshot.averageLogVolume),
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

const APPLICATION_STATUS_APPROVED = 'APP'
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
    return status.length > 0
  }

  const industryUser = detail.industryUser || normalizedRoles.some(isIndustryApplicationRole)
  return industryUser && [APPLICATION_STATUS_PERMITTED, APPLICATION_STATUS_EXPIRED].includes(status)
}

const hasCompletePermit = (permitRows: ApplicationPermitRow[]): boolean =>
  permitRows.some((row) =>
    row.permitStatusDescription.trim().toUpperCase().includes(COMPLETE_PERMIT_STATUS_TEXT),
  )

const isExpiredApplication = (detail: ProvincialApplicationDetail | null): boolean =>
  detail?.applicationStatusCode?.trim().toUpperCase() === APPLICATION_STATUS_EXPIRED

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

// Remark numbers come from a sequence, so the highest is the newest.
const newestRemarksFirst = (
  remarks: ProvincialApplicationDetail['remarks'] | undefined,
): ProvincialApplicationDetail['remarks'] =>
  [...(remarks ?? [])].sort((left, right) => (right.remarkId ?? 0) - (left.remarkId ?? 0))

const latestPersistedRemark = (
  remarks: ProvincialApplicationDetail['remarks'] | undefined,
): string => newestRemarksFirst(remarks).find((remark) => remark.remark.trim())?.remark ?? ''

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
  const location = useLocation()
  const { canPerform, capabilities, defaultRoute } = useAuth()
  const { applicationNumber } = useParams()
  const [searchParams] = useSearchParams()
  const navigationState = location.state as ApplicationCreationNavigationState | null
  const fallbackReturnTo = canPerform('/applicationSearch')
    ? { label: 'Application search', to: '/provincial/application' }
    : landingPageReturnTo(defaultRoute)
  const detailReturnTo = readDetailReturnTo(navigationState) ?? fallbackReturnTo
  const createdApplicationNumber =
    navigationState?.applicationCreationNotice?.applicationNumber.trim()
  const [detail, setDetail] = useState<ProvincialApplicationDetail | null>(null)
  const [documentRows, setDocumentRows] = useState<ProvincialApplicationDocumentRow[]>([])
  const [permitRows, setPermitRows] = useState<ApplicationPermitRow[]>([])
  const [documentLookupAvailability, setDocumentLookupAvailability] =
    useState<LookupAvailability>('loading')
  const [permitLookupAvailability, setPermitLookupAvailability] =
    useState<LookupAvailability>('loading')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [partialLoadMessage, setPartialLoadMessage] = useState('')
  const [clientLookupFailures, setClientLookupFailures] = useState<
    ReadonlySet<ApplicationClientLookupFailure>
  >(() => new Set())
  const updateClientLookupFailure = useCallback(
    (lookup: ApplicationClientLookupFailure, failed: boolean) => {
      setClientLookupFailures((current) => {
        if (current.has(lookup) === failed) {
          return current
        }

        const next = new Set(current)
        if (failed) {
          next.add(lookup)
        } else {
          next.delete(lookup)
        }
        return next
      })
    },
    [],
  )
  const [actionResult, setActionResult] = useState<ApplicationActionResult | null>(() =>
    createdApplicationNumber
      ? {
          kind: 'success',
          title: APPLICATION_SAVED_TITLE,
          message: '',
          createdFor: createdApplicationNumber,
        }
      : null,
  )
  // Item results share this page's single result but render beside the item controls.
  const setItemsActionResult = useCallback((update: SetStateAction<ActionResult | null>) => {
    setActionResult((current) => {
      if (typeof update !== 'function') {
        return update && { ...update, source: 'items' }
      }
      const itemsResult = current?.source === 'items' ? current : null
      const next = update(itemsResult)
      if (next === itemsResult) {
        return current
      }
      return next && { ...next, source: 'items' }
    })
  }, [])
  const itemsActionResult = actionResult?.source === 'items' ? actionResult : null
  const documentActionResult = actionResult?.source === 'documents' ? actionResult : null
  const remarkActionResult = actionResult?.source === 'remarks' ? actionResult : null
  const reviewActionResult = actionResult?.source === 'review' ? actionResult : null
  const pageActionResult = actionResult?.source ? null : actionResult
  const actionErrorMessage = pageActionResult?.kind === 'error' ? pageActionResult.message : ''
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [documentUploadDirty, setDocumentUploadDirty] = useState(false)
  const [documentUploadBusy, setDocumentUploadBusy] = useState(false)
  const [documentUploadResetKey, setDocumentUploadResetKey] = useState(0)
  const documentRequestSequenceRef = useRef(0)
  const [applicationItemsDirty, setApplicationItemsDirty] = useState(false)
  const [applicationItemsBusy, setApplicationItemsBusy] = useState(false)
  const [applicationItemsEditing, setApplicationItemsEditing] = useState(false)
  const [applicationItemsResetKey, setApplicationItemsResetKey] = useState(0)
  const [remarkBody, setRemarkBody] = useState('')
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null)
  const [isSavingRemark, setIsSavingRemark] = useState(false)
  const [remarkValidationMessage, setRemarkValidationMessage] = useState('')
  const remarkLauncherRef = useRef<HTMLButtonElement | null>(null)
  const remarkBodyRef = useRef<HTMLTextAreaElement | null>(null)
  const [remarkDiscardConfirmationOpen, setRemarkDiscardConfirmationOpen] = useState(false)
  const [summaryForm, setSummaryForm] = useState<ApplicationSummaryFormState | null>(null)
  const [summaryBaselineForm, setSummaryBaselineForm] =
    useState<ApplicationSummaryFormState | null>(null)
  const [summaryVolumeWarningAccepted, setSummaryVolumeWarningAccepted] = useState(false)
  const [isSavingSummary, setIsSavingSummary] = useState(false)
  const [isEditingSummary, setIsEditingSummary] = useState(false)
  const [isEditingOwnerDetails, setIsEditingOwnerDetails] = useState(false)
  const [isEditingApplicationItems, setIsEditingApplicationItems] = useState(false)
  const [isEditingDocuments, setIsEditingDocuments] = useState(false)
  const [isEditingRemarks, setIsEditingRemarks] = useState(false)
  const [isEditingReview, setIsEditingReview] = useState(false)
  const [pendingSummarySaveSource, setPendingSummarySaveSource] =
    useState<SummarySaveSource>('summary')
  const [summaryAccuracyConfirmationOpen, setSummaryAccuracyConfirmationOpen] = useState(false)
  const [summaryAccuracyConfirmed, setSummaryAccuracyConfirmed] = useState(false)
  const [summaryAccuracyApplicationNumber, setSummaryAccuracyApplicationNumber] = useState<
    string | null
  >(null)
  const [showSummaryValidationErrors, setShowSummaryValidationErrors] = useState(false)
  const [ownerClientLocations, setOwnerClientLocations] = useState<ApplicationClientLocation[]>([])
  const [agentClientLocations, setAgentClientLocations] = useState<ApplicationClientLocation[]>([])
  const [ownerClientData, setOwnerClientData] = useState<ApplicationClientData | null>(null)
  const [agentClientData, setAgentClientData] = useState<ApplicationClientData | null>(null)
  const [isLoadingOwnerClientLocations, setIsLoadingOwnerClientLocations] = useState(false)
  const [isLoadingAgentClientLocations, setIsLoadingAgentClientLocations] = useState(false)
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
  const [allSummaryRegionOptions, setAllSummaryRegionOptions] = useState<SearchOption[]>([])
  const summaryRegionOptions = useAllowedRegionOptions(
    allSummaryRegionOptions,
    APPLICATION_WRITE_ACTIONS,
    'value',
  )
  const [summaryScheduleOptions, setSummaryScheduleOptions] = useState<SearchOption[]>([])
  const [applicationSpeciesOptions, setApplicationSpeciesOptions] = useState<
    ApplicationCodeOption[]
  >([])
  const [applicationEndUseOptions, setApplicationEndUseOptions] = useState<ApplicationCodeOption[]>(
    [],
  )
  const [summaryOptionsAvailability, setSummaryOptionsAvailability] = useState<
    'idle' | 'loading' | 'available' | 'unavailable'
  >('idle')
  const [reviewStatusOptions, setReviewStatusOptions] = useState<SearchOption[]>([])
  const [reviewOptionsAvailability, setReviewOptionsAvailability] = useState<
    'loading' | 'available' | 'unavailable'
  >('loading')
  const [reviewStatusCode, setReviewStatusCode] = useState('')
  const [reviewStatusRemark, setReviewStatusRemark] = useState('')
  const [isRetryingApprovalRemark, setIsRetryingApprovalRemark] = useState(false)
  const [sendReviewEmail, setSendReviewEmail] = useState(false)
  // Sent status emails are not recorded, so only an email sent from this page can be shown.
  const [sentReviewEmail, setSentReviewEmail] = useState<{
    applicationNumber: string
    address: string
  } | null>(null)
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
  const requestedApplicationTab = (searchParams.get('tab') ?? '').trim().toLowerCase()
  const requestedPackageNumber = searchParams.get('packageNumber') ?? ''
  const shouldFocusScaleSection =
    requestedApplicationTab === 'items' &&
    (searchParams.get('section') ?? '').trim().toLowerCase() === 'scales'
  const [focusedPackageNumber, setFocusedPackageNumber] = useState(() =>
    requestedApplicationTab === 'items' ? requestedPackageNumber : '',
  )
  const [focusedPackageRequestId, setFocusedPackageRequestId] = useState(() =>
    requestedApplicationTab === 'items' ? 1 : 0,
  )
  const [selectedPackageNumber, setSelectedPackageNumber] = useState('')
  const [selectedApplicationTab, selectApplicationTab] = useReloadPreservedTab({
    tabs: APPLICATION_DETAIL_TAB_SLOTS,
    defaultTab: 'owner',
    initialTab: requestedApplicationTab === 'items' ? 'items' : undefined,
  })
  const beginDetailRequest = useLatestRequestGuard()
  const currentApplicationNumberRef = useRef(applicationNumber)
  currentApplicationNumberRef.current = applicationNumber
  const currentDetailRef = useRef<ProvincialApplicationDetail | null>(null)
  currentDetailRef.current = detail
  const currentSummaryFormRef = useRef<ApplicationSummaryFormState | null>(null)
  currentSummaryFormRef.current = summaryForm
  const focusPackageInItems = useCallback(
    (packageNumber: string) => {
      selectApplicationTab('items')
      setFocusedPackageNumber(packageNumber)
      setFocusedPackageRequestId((current) => current + 1)
    },
    [selectApplicationTab],
  )

  useEffect(() => {
    if (!createdApplicationNumber) {
      return
    }

    const nextNavigationState = { ...(navigationState ?? {}) }
    delete nextNavigationState.applicationCreationNotice
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      {
        replace: true,
        state: Object.keys(nextNavigationState).length > 0 ? nextNavigationState : null,
      },
    )
  }, [
    createdApplicationNumber,
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
    navigationState,
  ])

  const loadApplicationDetail = useCallback(
    async ({ preserveRemarkDraft = false, preserveSummaryDraft = false } = {}) => {
      const isLatestRequest = beginDetailRequest()
      const detailDocumentRequestSequence = ++documentRequestSequenceRef.current
      setSummaryAccuracyConfirmationOpen(false)
      setSummaryAccuracyConfirmed(false)
      setSummaryAccuracyApplicationNumber(null)
      setPendingSummarySaveSource('summary')
      if (!applicationNumber) {
        seededReviewFieldsApplicationRef.current = null
        setErrorMessage('Application number is missing from the route.')
        setDetail(null)
        setDocumentRows([])
        setPermitRows([])
        setDocumentLookupAvailability('unavailable')
        setPermitLookupAvailability('unavailable')
        setDocumentsErrorMessage('')
        setPartialLoadMessage('')
        setActionResult(null)
        setLoading(false)
        setSummaryForm(null)
        setSummaryBaselineForm(null)
        setIsEditingSummary(false)
        setIsEditingOwnerDetails(false)
        setIsEditingApplicationItems(false)
        setApplicationItemsEditing(false)
        setIsEditingDocuments(false)
        setIsEditingRemarks(false)
        setIsEditingReview(false)
        setIsRetryingApprovalRemark(false)
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
      setPartialLoadMessage('')
      setActionResult((current) => (current?.createdFor === applicationNumber ? current : null))
      setPermitLookupAvailability('loading')
      if (!retainingCurrentDetail) {
        setIsEditingSummary(false)
        setIsEditingOwnerDetails(false)
        setIsEditingApplicationItems(false)
        setApplicationItemsEditing(false)
        setIsEditingDocuments(false)
        setIsEditingRemarks(false)
        setIsEditingReview(false)
        setIsRetryingApprovalRemark(false)
        setReviewStatusEmailOverride(null)
        setDocumentRows([])
        setPermitRows([])
        setDocumentLookupAvailability('loading')
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
        if (!preserveSummaryDraft) {
          setSummaryForm(editableSummaryForm)
          setSummaryBaselineForm(editableSummaryForm)
          setShowSummaryValidationErrors(false)
        }
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
        if (!preserveRemarkDraft) {
          setRemarkBody('')
          setEditingRemarkId(null)
        }
        if (!response) {
          setErrorMessage(`No provincial application found for ${applicationNumber}.`)
          setDocumentRows([])
          setPermitRows([])
          setDocumentLookupAvailability('unavailable')
          setPermitLookupAvailability('unavailable')
          return
        }

        const [summarySnapshotResult, applicationSpeciesResult] = await Promise.allSettled([
          fetchApplicationSummarySnapshot(applicationNumber),
          fetchApplicationSpecies(applicationNumber),
        ])
        if (!isLatestRequest()) {
          return
        }

        if (
          summarySnapshotResult.status === 'fulfilled' &&
          summarySnapshotResult.value &&
          String(summarySnapshotResult.value.applicationNumber) === applicationNumber
        ) {
          editableSummaryForm = normalizeSummaryAgentFields(
            toSummarySnapshotFormState(summarySnapshotResult.value),
          )
        } else if (summarySnapshotResult.status === 'rejected') {
          setPartialLoadMessage('Unable to retrieve complete application summary fields.')
        }

        if (applicationSpeciesResult.status === 'fulfilled' && editableSummaryForm) {
          editableSummaryForm = withApplicationSpecies(
            editableSummaryForm,
            applicationSpeciesResult.value,
          )
        } else if (applicationSpeciesResult.status === 'rejected') {
          setPartialLoadMessage('Unable to retrieve species and end-use fields.')
        }

        if (editableSummaryForm && !preserveSummaryDraft) {
          setSummaryForm(editableSummaryForm)
          setSummaryBaselineForm(editableSummaryForm)
        }

        // The core application and its editable summary are now stable. Permit and document reads
        // remain serial to avoid multiplying Oracle demand, but no longer keep the whole page inert.
        setLoading(false)
        const loadSecondarySections = async () => {
          try {
            const permitsResult = await fetchApplicationPermits(applicationNumber)
            if (!isLatestRequest()) {
              return
            }
            setPermitRows(permitsResult)
            setPermitLookupAvailability('available')
          } catch {
            if (!isLatestRequest()) {
              return
            }
            if (!retainingCurrentDetail) {
              setPermitRows([])
            }
            setPermitLookupAvailability('unavailable')
            setPartialLoadMessage('Unable to retrieve application permits.')
          }

          if (detailDocumentRequestSequence !== documentRequestSequenceRef.current) {
            return
          }
          try {
            const documentsResult = await fetchApplicationDocuments(applicationNumber)
            if (
              !isLatestRequest() ||
              detailDocumentRequestSequence !== documentRequestSequenceRef.current
            ) {
              return
            }
            setDocumentRows(documentsResult.rows)
            setDocumentLookupAvailability('available')
          } catch {
            if (
              !isLatestRequest() ||
              detailDocumentRequestSequence !== documentRequestSequenceRef.current
            ) {
              return
            }
            if (!retainingCurrentDetail) {
              setDocumentRows([])
              setDocumentLookupAvailability('unavailable')
            }
            setDocumentsErrorMessage('Unable to retrieve application documents.')
          }
        }
        void loadSecondarySections()
      } catch {
        if (isLatestRequest()) {
          setErrorMessage('Unable to retrieve provincial application detail.')
          if (!retainingCurrentDetail) {
            setDetail(null)
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
    },
    [applicationNumber, beginDetailRequest],
  )

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

  const applicationTotalPieces = (detail?.packages ?? []).reduce(
    (total, item) => total + item.pieceCount,
    0,
  )

  // Writes also need the application's region when the user's grant is regional.
  const applicationOrgUnit = detail?.orgUnitNumber ?? null
  const canUploadApplicationDocuments = canPerform('/fileApplicationUpload', applicationOrgUnit)
  // Document deletion stays role-based, limited to the application's region for regional grants;
  // it does not depend on holding the upload action.
  const canDeleteDocuments =
    canDeleteApplicationDocuments(detail, capabilities?.roles ?? []) &&
    withinRegions(allowedRegions(capabilities, '/fileApplicationUpload'), applicationOrgUnit)
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
  const isApplicationExpired = isExpiredApplication(detail)
  const applicationProductSupportsPackages = productTypeSupportsPackages(detail?.productTypeCode)
  const canUseApplicationMutations =
    canPerform('createApplication', applicationOrgUnit) &&
    !detail?.locked &&
    !detail?.readOnly &&
    !isApplicationExpired
  const canEditPackages =
    applicationProductSupportsPackages && canUseApplicationMutations && !!detail?.canEditPackages
  const canAddPackages =
    applicationProductSupportsPackages && canUseApplicationMutations && !!detail?.canAddPackages
  const canAddScales =
    applicationProductSupportsPackages && canUseApplicationMutations && !!detail?.canAddScales
  const canEditSummary = canUseApplicationMutations && !!detail?.canEditApplicationDetails
  const needsApplicationOptions =
    Boolean(summaryForm) || canEditSummary || canEditPackages || canAddPackages || canAddScales
  const canUpdatePackageNumber = canEditPackages && !!detail?.canUpdatePackageNumber
  const canManageRemarks = canViewRemarks && canEditSummary
  const remarkBaselineBody = editingRemarkId
    ? (detail?.remarks.find((remark) => String(remark.remarkId) === editingRemarkId)?.remark ?? '')
    : ''
  const remarkDirty = canManageRemarks && isEditingRemarks && remarkBody !== remarkBaselineBody
  const isProvincialSubmitter = hasProvincialSubmitterRole(capabilities?.roles)
  const requiresApplicationAccuracyAcknowledgement =
    detail?.industryUser === true || isProvincialSubmitter
  const canChangeApplicantType = canPerform('/changeApplicantType', applicationOrgUnit)
  const canReviewApplication = canPerform('/applicationsReview', applicationOrgUnit)
  // Clients cannot change the list date once the application is approved.
  const listDateLocked =
    !canReviewApplication &&
    detail?.applicationStatusCode?.trim().toUpperCase() === APPLICATION_STATUS_APPROVED
  const canEditApplicationReview =
    canReviewApplication &&
    !isApplicationExpired &&
    REVIEWABLE_SOURCE_STATUS_CODES.has(normalizeReviewStatus(detail?.applicationStatusCode ?? ''))
  const canApproveApplicationReview =
    canEditApplicationReview &&
    APPROVABLE_SOURCE_STATUS_CODES.has(normalizeReviewStatus(detail?.applicationStatusCode ?? ''))
  // The reviewed Figma opens the review form on Approved when approval is available.
  const reviewFormDefaultStatusCode = canApproveApplicationReview ? 'APP' : ''
  const canViewReview = canViewRemarks && canReviewApplication
  const normalizedReviewStatusCode = useMemo(
    () => normalizeReviewStatus(reviewStatusCode),
    [reviewStatusCode],
  )
  const canSendReviewStatusEmail = EMAIL_SUPPORTED_STATUS_CODES.has(normalizedReviewStatusCode)
  const isReviewStatusInvalid = reviewValidationMessage === REVIEW_STATUS_REQUIRED_MESSAGE
  const isReviewRemarkInvalid =
    reviewValidationMessage === REVIEW_REMARK_REQUIRED_MESSAGE ||
    reviewValidationMessage === APPROVAL_REMARK_REQUIRED_MESSAGE
  const showReviewValidationNotification =
    !!reviewValidationMessage && !isReviewStatusInvalid && !isReviewRemarkInvalid
  const hasSummaryForm = summaryForm !== null
  const summaryOwnerClientNumber = summaryForm?.ownerClientNumber.trim() ?? ''
  const isSummaryAgentApplicant = isAgentApplicant(summaryForm?.applicantTypeCode ?? '')
  const applicationDetailTabs: ApplicationDetailTabKey[] = [
    'owner',
    'application',
    'items',
    'documents',
    ...(canViewRemarks ? (['remarks'] as const) : []),
    'offers',
    ...(canViewReview ? (['review'] as const) : []),
  ]
  const activeApplicationTab = applicationDetailTabs.includes(selectedApplicationTab)
    ? selectedApplicationTab
    : 'owner'
  const selectedApplicationTabIndex = Math.max(
    0,
    APPLICATION_DETAIL_TAB_SLOTS.indexOf(activeApplicationTab),
  )
  const summaryAgentClientNumber = isSummaryAgentApplicant
    ? (summaryForm?.agentClientNumber.trim() ?? '')
    : ''
  const debouncedSummaryOwnerClientNumber = useDebouncedValue(summaryOwnerClientNumber)
  const debouncedSummaryAgentClientNumber = useDebouncedValue(summaryAgentClientNumber)
  const baselineSummaryOwnerClientNumber =
    summaryBaselineForm?.ownerClientNumber.trim() ?? summaryOwnerClientNumber
  const baselineSummaryAgentClientNumber =
    summaryBaselineForm?.agentClientNumber.trim() ?? summaryAgentClientNumber
  const summaryOwnerClientNumberForLookup =
    summaryOwnerClientNumber === baselineSummaryOwnerClientNumber
      ? summaryOwnerClientNumber
      : debouncedSummaryOwnerClientNumber
  const summaryAgentClientNumberForLookup =
    summaryAgentClientNumber === baselineSummaryAgentClientNumber
      ? summaryAgentClientNumber
      : debouncedSummaryAgentClientNumber
  const summaryOwnerClientLocationCode = summaryForm?.ownerClientLocationCode.trim() ?? ''
  const summaryAgentClientLocationCode = isSummaryAgentApplicant
    ? (summaryForm?.agentClientLocationCode.trim() ?? '')
    : ''
  const hasSelectableOwnerClientLocations = ownerClientLocations.some(isSelectableClientLocation)
  const hasSelectableAgentClientLocations = agentClientLocations.some(isSelectableClientLocation)
  const isOwnerClientLookupPending = isLoadingOwnerClientLocations || isLoadingOwnerClientData
  const isAgentClientLookupPending = isLoadingAgentClientLocations || isLoadingAgentClientData
  const isSummaryClientLookupPendingForSource = useCallback(
    (source: SummarySaveSource): boolean => {
      if (source === 'owner') return isOwnerClientLookupPending
      if (source === 'agent') {
        return isAgentClientLookupPending || isOwnerClientLookupPending
      }
      return false
    },
    [isAgentClientLookupPending, isOwnerClientLookupPending],
  )
  const ownerClientLocationPlaceholder = !summaryOwnerClientNumber
    ? 'Enter applicant client number first'
    : isLoadingOwnerClientLocations
      ? 'Loading locations'
      : hasSelectableOwnerClientLocations
        ? 'Select applicant client location'
        : 'No locations on file'
  const agentClientLocationPlaceholder = !summaryAgentClientNumber
    ? 'Enter agent client number first'
    : isLoadingAgentClientLocations
      ? 'Loading locations'
      : hasSelectableAgentClientLocations
        ? 'Select agent client location'
        : 'No locations on file'
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
    summaryForm?.orgUnitNumber === summaryBaselineForm?.orgUnitNumber
      ? detail?.orgUnitName
      : undefined,
  )
  // Keep the saved list date selectable while editing, as legacy checkListDate() did.
  const scheduleOptions = optionsWithCurrentValue(
    summaryScheduleOptions,
    summaryBaselineForm?.exportScheduleId ?? '',
    detail?.listingDate,
  )
  const summaryFieldsChangedFor = (fields: ApplicationSummaryField[]): boolean =>
    !!summaryForm &&
    !!summaryBaselineForm &&
    fields.some((field) => !formValuesEqual(summaryForm[field], summaryBaselineForm[field]))
  const summaryScaleFieldsChanged = summaryFieldsChangedFor(SUMMARY_SAVE_FIELDS.items)
  // A product-only change keeps the Scale save rules, so a submitter's list date does not block it.
  const applicationSummarySaveSource: SummarySaveSource = !summaryScaleFieldsChanged
    ? 'summary'
    : summaryFieldsChangedFor(SUMMARY_SAVE_FIELDS.summary)
      ? 'summary-items'
      : 'items'
  const missingSummaryOptionLabelsForSource = useCallback(
    (source: SummarySaveSource): string[] => {
      return [
        ...(source === 'summary' || source === 'summary-items'
          ? [
              summaryRegionOptions.length === 0 ? 'region' : null,
              summaryExemptionReasonOptions.length === 0 ? 'exemption reason' : null,
            ]
          : []),
        ...(source === 'items' || source === 'summary-items'
          ? [summaryProductTypeOptions.length === 0 ? 'product type' : null]
          : []),
        ...((source === 'items' || source === 'summary-items') &&
        productTypeRequiresGrowthType(summaryForm?.productTypeCode ?? '')
          ? [summaryGrowthTypeOptions.length === 0 ? 'age class' : null]
          : []),
      ].filter((label): label is string => label !== null)
    },
    [
      summaryExemptionReasonOptions.length,
      summaryForm?.productTypeCode,
      summaryGrowthTypeOptions.length,
      summaryProductTypeOptions.length,
      summaryRegionOptions.length,
    ],
  )
  const summaryOptionsUnavailableForSource = useCallback(
    (source: SummarySaveSource): boolean =>
      (source === 'summary' || source === 'summary-items' || source === 'items') &&
      (summaryOptionsAvailability !== 'available' ||
        missingSummaryOptionLabelsForSource(source).length > 0),
    [missingSummaryOptionLabelsForSource, summaryOptionsAvailability],
  )
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
              timestamp: result.remarkDate ?? null,
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
  const summaryFieldErrors = useMemo<FieldErrors<ApplicationSummaryField>>(() => {
    if (!summaryForm) {
      return {}
    }

    return {
      ownerClientNumber: applicationClientNumberFieldError(
        summaryForm.ownerClientNumber,
        'Applicant client number',
      ),
      ownerClientLocationCode:
        requiredMaxLengthFieldError(
          summaryForm.ownerClientLocationCode,
          2,
          'Applicant client location code',
        ) ?? undefined,
      ownerContactName: applicationTextStorageFieldError(
        summaryForm.ownerContactName,
        APPLICATION_CONTACT_NAME_MAX_LENGTH,
        'Applicant contact name',
        true,
      ),
      agentClientNumber: isAgentApplicant(summaryForm.applicantTypeCode)
        ? applicationClientNumberFieldError(summaryForm.agentClientNumber, 'Agent client number')
        : undefined,
      agentClientLocationCode: isAgentApplicant(summaryForm.applicantTypeCode)
        ? (requiredMaxLengthFieldError(
            summaryForm.agentClientLocationCode,
            2,
            'Agent client location code',
          ) ?? undefined)
        : undefined,
      agentContactName: isAgentApplicant(summaryForm.applicantTypeCode)
        ? applicationTextStorageFieldError(
            summaryForm.agentContactName,
            APPLICATION_CONTACT_NAME_MAX_LENGTH,
            'Agent contact name',
            true,
          )
        : undefined,
      applicantTypeCode: firstValidationError(
        () => requiredFieldError(summaryForm.applicantTypeCode, 'Applicant type'),
        () =>
          ['O', 'M', 'A'].includes(summaryForm.applicantTypeCode)
            ? null
            : 'Applicant type must be Owner, Ministerial, or Agent.',
      ),
      productTypeCode: firstValidationError(
        () => requiredFieldError(summaryForm.productTypeCode, 'Product type'),
        () =>
          summaryProductTypeOptions.some((option) => option.value === summaryForm.productTypeCode)
            ? null
            : 'Select a valid product type.',
        () =>
          summaryForm.productTypeCode === 'S' &&
          detail?.productTypeCode !== 'S' &&
          (detail?.packages.length ?? 0) > 0
            ? 'Product type cannot be changed to Standing Timber while packages exist. Remove the packages first.'
            : null,
      ),
      growthTypeCode: productTypeRequiresGrowthType(summaryForm.productTypeCode)
        ? firstValidationError(
            () => requiredFieldError(summaryForm.growthTypeCode, 'Age class'),
            () =>
              summaryGrowthTypeOptions.some((option) => option.value === summaryForm.growthTypeCode)
                ? null
                : 'Select a valid age class.',
          )
        : undefined,
      speciesCodes:
        summaryForm.speciesCodes.length === 0 ? 'At least one species is required.' : undefined,
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
          isActiveOrUnchangedOption(
            summaryRegionOptions,
            summaryForm.orgUnitNumber,
            summaryBaselineForm?.orgUnitNumber,
          )
            ? null
            : 'Select a valid region.',
      ),
      applicationDate: firstValidationError(
        () => requiredFieldError(summaryForm.applicationDate, 'Application date'),
        () => isoDateFieldError(summaryForm.applicationDate),
      ),
      termDays: firstValidationError(
        () => requiredFieldError(summaryForm.termDays, 'Exemption term days'),
        () => nonNegativeWholeNumberFieldError(summaryForm.termDays, 'Exemption term days'),
        () => greaterThanFieldError(summaryForm.termDays, 'Exemption term days', 0),
        () =>
          maxNumericValueFieldError(
            summaryForm.termDays,
            MAX_APPLICATION_TERM_DAYS,
            'Exemption term days',
          ),
      ),
      exportScheduleId:
        (!summaryForm.exportScheduleId && canReviewApplication) ||
        (Boolean(summaryForm.exportScheduleId) &&
          isActiveOrUnchangedOption(
            summaryScheduleOptions,
            summaryForm.exportScheduleId,
            summaryBaselineForm?.exportScheduleId,
          ))
          ? undefined
          : 'Select a valid list date.',
      productLocation: productTypeRequiresLogDetails(summaryForm.productTypeCode)
        ? applicationTextStorageFieldError(
            summaryForm.productLocation,
            APPLICATION_PRODUCT_LOCATION_MAX_LENGTH,
            'Location of logs',
            true,
          )
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
    }
  }, [
    canReviewApplication,
    detail,
    summaryExemptionReasonOptions,
    summaryForm,
    summaryGrowthTypeOptions,
    summaryProductTypeOptions,
    summaryRegionOptions,
    summaryScheduleOptions,
    summaryBaselineForm,
  ])
  const summaryValidationErrorsForSource = useCallback(
    (source: SummarySaveSource): string[] => {
      const fields =
        source === 'agent'
          ? [...SUMMARY_SAVE_FIELDS.owner, ...SUMMARY_SAVE_FIELDS.agent]
          : source === 'summary-items'
            ? [...SUMMARY_SAVE_FIELDS.summary, ...SUMMARY_SAVE_FIELDS.items]
            : SUMMARY_SAVE_FIELDS[source]
      return fields
        .map((field) => summaryFieldErrors[field])
        .filter((error): error is string => !!error)
    },
    [summaryFieldErrors],
  )
  // A product-only change saves as items, so summary field errors no longer apply.
  const visibleSummaryFieldError = (field: ApplicationSummaryField): string | undefined =>
    showSummaryValidationErrors &&
    !(applicationSummarySaveSource === 'items' && SUMMARY_SAVE_FIELDS.summary.includes(field))
      ? summaryFieldErrors[field]
      : undefined
  const summarySpeciesCodesError = visibleSummaryFieldError('speciesCodes')
  const applicationSpeciesMultiSelectOptions = useMemo(() => {
    const options = applicationSpeciesOptions.map((option) => ({
      id: option.code,
      text: `${option.code} - ${option.description}`,
    }))
    for (const code of summarySpeciesCodes) {
      if (!options.some((option) => option.id === code)) {
        options.push({ id: code, text: code })
      }
    }
    return options
  }, [applicationSpeciesOptions, summarySpeciesCodes])
  const selectedApplicationSpeciesOptions = applicationSpeciesMultiSelectOptions.filter((option) =>
    summarySpeciesCodes.includes(option.id),
  )
  const applicationEndUseSelectOptions = applicationEndUseOptions.map(toSearchOption)
  const endUsePlaceholder =
    summarySpeciesCodes.length === 0
      ? 'Add species first'
      : applicationEndUseSelectOptions.length > 0
        ? 'Select end use'
        : 'No end uses on file'

  useEffect(() => {
    if (!hasSummaryForm || !summaryOwnerClientNumberForLookup || !summaryOwnerClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientData(null)
        setIsLoadingOwnerClientData(false)
        updateClientLookupFailure('owner-data', false)
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

    void fetchApplicationClientData(
      summaryOwnerClientNumberForLookup,
      summaryOwnerClientLocationCode,
      { applicationNumber: applicationNumber ?? '' },
    )
      .then((clientData) => {
        const currentForm = currentSummaryFormRef.current
        if (
          !isActive ||
          !clientLookupNumbersMatch(
            currentForm?.ownerClientNumber ?? '',
            summaryOwnerClientNumberForLookup,
          ) ||
          (currentForm?.ownerClientLocationCode ?? '').trim() !== summaryOwnerClientLocationCode
        ) {
          return
        }

        setOwnerClientData(clientData)
        updateClientLookupFailure('owner-data', false)
        if (!clientData || (!isEditingOwnerDetails && !isEditingSummary)) {
          return
        }

        setSummaryForm((current) => {
          if (
            !current ||
            !clientLookupNumbersMatch(
              current.ownerClientNumber,
              summaryOwnerClientNumberForLookup,
            ) ||
            current.ownerClientLocationCode.trim() !== summaryOwnerClientLocationCode
          ) {
            return current
          }

          const confirmedOwnerClientNumber = clientData.clientNumber.trim()
          return confirmedOwnerClientNumber &&
            current.ownerClientNumber !== confirmedOwnerClientNumber
            ? { ...current, ownerClientNumber: confirmedOwnerClientNumber }
            : current
        })
      })
      .catch(() => {
        const currentForm = currentSummaryFormRef.current
        if (
          isActive &&
          clientLookupNumbersMatch(
            currentForm?.ownerClientNumber ?? '',
            summaryOwnerClientNumberForLookup,
          ) &&
          (currentForm?.ownerClientLocationCode ?? '').trim() === summaryOwnerClientLocationCode
        ) {
          setOwnerClientData(null)
          updateClientLookupFailure('owner-data', true)
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
  }, [
    applicationNumber,
    hasSummaryForm,
    isEditingOwnerDetails,
    isEditingSummary,
    summaryOwnerClientLocationCode,
    summaryOwnerClientNumberForLookup,
    updateClientLookupFailure,
  ])

  useEffect(() => {
    if (!hasSummaryForm || !summaryAgentClientNumberForLookup || !summaryAgentClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientData(null)
        setIsLoadingAgentClientData(false)
        updateClientLookupFailure('agent-data', false)
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

    void fetchApplicationClientData(
      summaryAgentClientNumberForLookup,
      summaryAgentClientLocationCode,
      { applicationNumber: applicationNumber ?? '' },
    )
      .then((clientData) => {
        const currentForm = currentSummaryFormRef.current
        if (
          !isActive ||
          !clientLookupNumbersMatch(
            currentForm?.agentClientNumber ?? '',
            summaryAgentClientNumberForLookup,
          ) ||
          (currentForm?.agentClientLocationCode ?? '').trim() !== summaryAgentClientLocationCode
        ) {
          return
        }

        setAgentClientData(clientData)
        updateClientLookupFailure('agent-data', false)
        if (!clientData || (!isEditingOwnerDetails && !isEditingSummary)) {
          return
        }

        setSummaryForm((current) => {
          if (
            !current ||
            !clientLookupNumbersMatch(
              current.agentClientNumber,
              summaryAgentClientNumberForLookup,
            ) ||
            current.agentClientLocationCode.trim() !== summaryAgentClientLocationCode
          ) {
            return current
          }

          const confirmedAgentClientNumber = clientData.clientNumber.trim()
          return confirmedAgentClientNumber &&
            current.agentClientNumber !== confirmedAgentClientNumber
            ? { ...current, agentClientNumber: confirmedAgentClientNumber }
            : current
        })
      })
      .catch(() => {
        const currentForm = currentSummaryFormRef.current
        if (
          isActive &&
          clientLookupNumbersMatch(
            currentForm?.agentClientNumber ?? '',
            summaryAgentClientNumberForLookup,
          ) &&
          (currentForm?.agentClientLocationCode ?? '').trim() === summaryAgentClientLocationCode
        ) {
          setAgentClientData(null)
          updateClientLookupFailure('agent-data', true)
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
  }, [
    applicationNumber,
    hasSummaryForm,
    isEditingOwnerDetails,
    isEditingSummary,
    summaryAgentClientLocationCode,
    summaryAgentClientNumberForLookup,
    updateClientLookupFailure,
  ])

  useEffect(() => {
    if (!hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientLocations([])
        setIsLoadingOwnerClientLocations(false)
        updateClientLookupFailure('owner-locations', false)
      })
      return () => {
        isActive = false
      }
    }

    if (!summaryOwnerClientNumberForLookup) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientLocations([])
        setIsLoadingOwnerClientLocations(false)
        updateClientLookupFailure('owner-locations', false)
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

    void fetchApplicationClientLocations(
      summaryOwnerClientNumberForLookup,
      'owner',
      applicationNumber ?? '',
    )
      .then((locations) => {
        if (
          !isActive ||
          !clientLookupNumbersMatch(
            currentSummaryFormRef.current?.ownerClientNumber ?? '',
            summaryOwnerClientNumberForLookup,
          )
        ) {
          return
        }

        setOwnerClientLocations(locations)
        updateClientLookupFailure('owner-locations', false)
        if (!canEditSummary) {
          return
        }
        setSummaryForm((current) => {
          if (
            !current ||
            !clientLookupNumbersMatch(current.ownerClientNumber, summaryOwnerClientNumberForLookup)
          ) {
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
      .catch(() => {
        if (
          isActive &&
          clientLookupNumbersMatch(
            currentSummaryFormRef.current?.ownerClientNumber ?? '',
            summaryOwnerClientNumberForLookup,
          )
        ) {
          setOwnerClientLocations([])
          updateClientLookupFailure('owner-locations', true)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingOwnerClientLocations(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [
    applicationNumber,
    canEditSummary,
    hasSummaryForm,
    summaryOwnerClientNumberForLookup,
    updateClientLookupFailure,
  ])

  useEffect(() => {
    if (!hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientLocations([])
        setIsLoadingAgentClientLocations(false)
        updateClientLookupFailure('agent-locations', false)
      })
      return () => {
        isActive = false
      }
    }

    if (!summaryAgentClientNumberForLookup) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientLocations([])
        setIsLoadingAgentClientLocations(false)
        updateClientLookupFailure('agent-locations', false)
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

    void fetchApplicationClientLocations(
      summaryAgentClientNumberForLookup,
      'agent',
      applicationNumber ?? '',
    )
      .then((locations) => {
        if (
          !isActive ||
          !clientLookupNumbersMatch(
            currentSummaryFormRef.current?.agentClientNumber ?? '',
            summaryAgentClientNumberForLookup,
          )
        ) {
          return
        }

        setAgentClientLocations(locations)
        updateClientLookupFailure('agent-locations', false)
        if (!canEditSummary) {
          return
        }
        setSummaryForm((current) => {
          if (
            !current ||
            !clientLookupNumbersMatch(current.agentClientNumber, summaryAgentClientNumberForLookup)
          ) {
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
      .catch(() => {
        if (
          isActive &&
          clientLookupNumbersMatch(
            currentSummaryFormRef.current?.agentClientNumber ?? '',
            summaryAgentClientNumberForLookup,
          )
        ) {
          setAgentClientLocations([])
          updateClientLookupFailure('agent-locations', true)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingAgentClientLocations(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [
    applicationNumber,
    canEditSummary,
    hasSummaryForm,
    summaryAgentClientNumberForLookup,
    updateClientLookupFailure,
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
        setAllSummaryRegionOptions(options.regions)
        setSummaryScheduleOptions(
          applicationListDateOptions(
            options.nextSchedules ?? options.currentSchedules,
            options.currentSchedules,
            canReviewApplication,
            formatBusinessIsoDate(),
          ),
        )
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
        setAllSummaryRegionOptions([])
        setSummaryScheduleOptions([])
        setSummaryOptionsAvailability('unavailable')
      })

    return () => {
      isActive = false
    }
  }, [canReviewApplication, hasSummaryForm, needsApplicationOptions])

  useEffect(() => {
    if (!canEditSummary || !summaryForm?.orgUnitNumber || !summaryForm.productTypeCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setApplicationSpeciesOptions([])
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
        setApplicationSpeciesOptions((current) => [
          ...options,
          ...current.filter(
            (option) =>
              summarySpeciesCodes.includes(option.code) &&
              !options.some((remaining) => remaining.code === option.code),
          ),
        ])
      })
      .catch(() => {
        if (!isActive) {
          return
        }
        setApplicationSpeciesOptions([])
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
    if (!hasSummaryForm || !summaryForm?.orgUnitNumber || summarySpeciesCodes.length === 0) {
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
        if (!canEditSummary) {
          return
        }
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
  }, [
    canEditSummary,
    hasSummaryForm,
    summaryForm?.orgUnitNumber,
    summarySpeciesCodes,
    summarySpeciesKey,
  ])

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

  const refreshApplicationDocuments = useCallback(async () => {
    if (!applicationNumber) {
      return
    }

    const documentRequestSequence = ++documentRequestSequenceRef.current
    setDocumentLookupAvailability('loading')
    try {
      const documentsResult = await fetchApplicationDocuments(applicationNumber)
      if (documentRequestSequence !== documentRequestSequenceRef.current) {
        return
      }
      setDocumentRows(documentsResult.rows)
      setDocumentLookupAvailability('available')
      setDocumentsErrorMessage('')
    } catch (error) {
      if (documentRequestSequence !== documentRequestSequenceRef.current) {
        return
      }
      setDocumentRows([])
      setDocumentLookupAvailability('unavailable')
      setDocumentsErrorMessage('Unable to retrieve application documents.')
      throw error
    }
  }, [applicationNumber])

  const fetchApplicationDocument = useCallback(
    (row: ProvincialApplicationDocumentRow) =>
      openApplicationDocument(row.id, row.name, applicationNumber ?? ''),
    [applicationNumber],
  )
  const clearActionResult = useCallback(() => setActionResult(null), [])
  const showDocumentOpenError = useCallback(
    (message: string) => setActionResult({ kind: 'error', message, source: 'documents' }),
    [],
  )
  const onOpenDocument = useDocumentOpener({
    recordKey: applicationNumber,
    fetchDocument: fetchApplicationDocument,
    onStart: clearActionResult,
    onError: showDocumentOpenError,
  })

  const onRemoveDocument = useCallback(
    async (row: ProvincialApplicationDocumentRow) => {
      if (!applicationNumber) {
        throw new Error('Application number is unavailable.')
      }

      const documentRequestSequence = ++documentRequestSequenceRef.current
      const isCurrentApplication = () => currentApplicationNumberRef.current === applicationNumber
      const isCurrentDocumentRequest = () =>
        isCurrentApplication() && documentRequestSequence === documentRequestSequenceRef.current
      setIsRemovingDocumentId(row.id)
      setActionResult(null)

      try {
        const removeResult = await removeApplicationDocument(row.id, applicationNumber)
        if (!isCurrentDocumentRequest()) {
          return
        }
        if (!removeResult.success) {
          throw new Error('Document removal failed. Refresh and try again.')
        }

        try {
          const documentsResult = await fetchApplicationDocuments(applicationNumber)
          if (isCurrentDocumentRequest()) {
            setDocumentRows(documentsResult.rows)
            setDocumentLookupAvailability('available')
            setDocumentsErrorMessage('')
            setActionResult({ ...DOCUMENT_DELETED_RESULT, source: 'documents' })
          }
        } catch (refreshError) {
          if (isCurrentDocumentRequest()) {
            console.error(refreshError)
            setDocumentLookupAvailability('unavailable')
            setDocumentsErrorMessage(
              'The document was deleted, but application documents could not be refreshed. Reload the page.',
            )
            setActionResult({
              kind: 'warning',
              message: `${row.name || 'Document'} was deleted. Reload before changing documents again.`,
            })
          }
        }
      } catch (error) {
        if (isCurrentApplication()) {
          console.error(error)
        }
        throw error instanceof Error ? error : new Error('Unable to remove the selected document.')
      } finally {
        if (isCurrentApplication()) {
          setIsRemovingDocumentId(null)
        }
      }
    },
    [applicationNumber],
  )

  const onCancelDocumentEditing = useCallback(() => {
    setDocumentUploadDirty(false)
    setDocumentUploadBusy(false)
    setDocumentUploadResetKey((current) => current + 1)
    setIsEditingDocuments(false)
  }, [])

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
      setActionResult(null)
      setIsSavingRemark(true)
      try {
        const result = await saveApplicationRemark({
          applicationNumber: String(detail.applicationNumber),
          remarkBody: normalizedRemark,
          remarkId: editingRemarkId ?? undefined,
        })
        if (!result.success) {
          setActionResult({
            kind: 'error',
            message: result.message || 'Unable to save application remark.',
          })
          return false
        }

        const parsedRemarkId = Number(result.remarkId)
        const savedRemarkId = Number.isFinite(parsedRemarkId) ? parsedRemarkId : null
        setDetail((current) => {
          if (!current) {
            return current
          }
          const existingRemark = savedRemarkId
            ? current.remarks.find((remark) => remark.remarkId === savedRemarkId)
            : undefined
          const savedRemark = {
            remarkId: savedRemarkId,
            title: result.title || normalizedRemark,
            remark: result.remark || normalizedRemark,
            user: result.user || null,
            // Edits keep their stored entry time; a new remark gets one from the detail reload.
            date: existingRemark?.date ?? null,
            timestamp: existingRemark?.timestamp ?? null,
          }
          return {
            ...current,
            remarks: [
              savedRemark,
              ...current.remarks.filter(
                (remark) => !savedRemarkId || remark.remarkId !== savedRemarkId,
              ),
            ],
          }
        })
        if (refreshAfterSave) {
          const preservedSummaryForm = summaryForm
          const preservedSummaryBaselineForm = summaryBaselineForm
          const preservedReviewStatusCode = reviewStatusCode
          const preservedReviewStatusRemark = reviewStatusRemark
          const preservedReviewStatusBaselineCode = reviewStatusBaselineCode
          const preservedReviewStatusRemarkBaseline = reviewStatusRemarkBaseline
          // Keep the saving dialog's text and edit heading until the refresh finishes.
          await loadApplicationDetail({ preserveRemarkDraft: true })
          setSummaryForm(preservedSummaryForm)
          setSummaryBaselineForm(preservedSummaryBaselineForm)
          setReviewStatusCode(preservedReviewStatusCode)
          setReviewStatusRemark(preservedReviewStatusRemark)
          setReviewStatusBaselineCode(preservedReviewStatusBaselineCode)
          setReviewStatusRemarkBaseline(preservedReviewStatusRemarkBaseline)
        }
        // The refresh makes the page inert; return focus only after it finishes.
        setIsEditingRemarks(false)
        setRemarkBody('')
        setEditingRemarkId(null)
        setActionResult({ kind: 'success', title: 'Remark saved.', message: '', source: 'remarks' })
        return true
      } catch {
        setActionResult({ kind: 'error', message: 'Unable to save application remark.' })
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
      if (key === 'ownerClientNumber') {
        setOwnerClientLocations([])
        setOwnerClientData(null)
      } else if (key === 'ownerClientLocationCode') {
        setOwnerClientData(null)
      } else if (key === 'agentClientNumber') {
        setAgentClientLocations([])
        setAgentClientData(null)
      } else if (key === 'agentClientLocationCode') {
        setAgentClientData(null)
      }

      setSummaryForm((current) => {
        if (!current) {
          return current
        }

        if (key === 'ownerClientNumber') {
          return {
            ...current,
            ownerClientNumber: value,
            ownerClientLocationCode: '',
          }
        }
        if (key === 'agentClientNumber') {
          return {
            ...current,
            agentClientNumber: value,
            agentClientLocationCode: '',
          }
        }
        if (key === 'productTypeCode') {
          return {
            ...current,
            productTypeCode: value,
            growthTypeCode: productTypeRequiresGrowthType(value) ? current.growthTypeCode : '',
            endUseCode: productTypeRequiresGrowthType(value) ? current.endUseCode : '',
          }
        }

        const next = { ...current, [key]: value }
        return key === 'applicantTypeCode' ? normalizeSummaryAgentFields(next) : next
      })
      setSummaryVolumeWarningAccepted(false)
      setActionResult(withoutVolumeWarning)
    },
    [],
  )

  const onOwnerApplicantTypeChange = useCallback((applicantTypeCode: string) => {
    setSummaryForm((current) => {
      if (!current) {
        return current
      }

      const next = {
        ...current,
        applicantTypeCode,
        agentClientNumber:
          applicantTypeCode === 'A'
            ? current.agentClientNumber || current.ownerClientNumber
            : current.agentClientNumber,
      }
      return normalizeSummaryAgentFields(next)
    })
    setSummaryVolumeWarningAccepted(false)
    setActionResult(withoutVolumeWarning)
  }, [])

  const onCancelOwnerDetails = useCallback(() => {
    setSummaryForm((current) => {
      if (!current || !summaryBaselineForm) {
        return current
      }

      return {
        ...current,
        ownerClientNumber: summaryBaselineForm.ownerClientNumber,
        ownerClientLocationCode: summaryBaselineForm.ownerClientLocationCode,
        ownerContactName: summaryBaselineForm.ownerContactName,
        applicantTypeCode: summaryBaselineForm.applicantTypeCode,
        agentClientNumber: summaryBaselineForm.agentClientNumber,
        agentClientLocationCode: summaryBaselineForm.agentClientLocationCode,
        agentContactName: summaryBaselineForm.agentContactName,
      }
    })
    setIsEditingOwnerDetails(false)
    setShowSummaryValidationErrors(false)
    setSummaryVolumeWarningAccepted(false)
    setActionResult(withoutDraftResult)
    setSummaryAccuracyConfirmationOpen(false)
    setSummaryAccuracyConfirmed(false)
    setSummaryAccuracyApplicationNumber(null)
    setPendingSummarySaveSource('summary')
  }, [summaryBaselineForm])

  const onCancelSummaryDetails = useCallback(() => {
    setSummaryForm((current) => {
      if (!current || !summaryBaselineForm) {
        return current
      }

      return {
        ...current,
        applicationDate: summaryBaselineForm.applicationDate,
        receivedDate: summaryBaselineForm.receivedDate,
        termDays: summaryBaselineForm.termDays,
        exemptionReasonCode: summaryBaselineForm.exemptionReasonCode,
        exportScheduleId: summaryBaselineForm.exportScheduleId,
        applicationStatusCode: summaryBaselineForm.applicationStatusCode,
        orgUnitNumber: summaryBaselineForm.orgUnitNumber,
        jurisdictionCode: summaryBaselineForm.jurisdictionCode,
        productTypeCode: summaryBaselineForm.productTypeCode,
        ...(SUMMARY_SAVE_FIELDS.items.some(
          (field) => !formValuesEqual(current[field], summaryBaselineForm[field]),
        ) && {
          productLocation: summaryBaselineForm.productLocation,
          growthTypeCode: summaryBaselineForm.growthTypeCode,
          averageLogVolume: summaryBaselineForm.averageLogVolume,
          applicationVolume: summaryBaselineForm.applicationVolume,
          speciesCodes: summaryBaselineForm.speciesCodes,
          endUseCode: summaryBaselineForm.endUseCode,
        }),
      }
    })
    setIsEditingSummary(false)
    setShowSummaryValidationErrors(false)
    setSummaryVolumeWarningAccepted(false)
    setActionResult(withoutDraftResult)
    setSummaryAccuracyConfirmationOpen(false)
    setSummaryAccuracyConfirmed(false)
    setSummaryAccuracyApplicationNumber(null)
    setPendingSummarySaveSource('summary')
  }, [summaryBaselineForm])

  const onCancelApplicationItemDetails = useCallback(() => {
    setSummaryForm((current) => {
      if (!current || !summaryBaselineForm) {
        return current
      }

      return {
        ...current,
        applicationVolume: summaryBaselineForm.applicationVolume,
        averageLogVolume: summaryBaselineForm.averageLogVolume,
        productLocation: summaryBaselineForm.productLocation,
        productTypeCode: summaryBaselineForm.productTypeCode,
        growthTypeCode: summaryBaselineForm.growthTypeCode,
        endUseCode: summaryBaselineForm.endUseCode,
        speciesCodes: summaryBaselineForm.speciesCodes,
      }
    })
    setIsEditingApplicationItems(false)
    setShowSummaryValidationErrors(false)
    setSummaryVolumeWarningAccepted(false)
    setActionResult(withoutDraftResult)
    setSummaryAccuracyConfirmationOpen(false)
    setSummaryAccuracyConfirmed(false)
    setSummaryAccuracyApplicationNumber(null)
    setPendingSummarySaveSource('summary')
  }, [summaryBaselineForm])

  const discardRemarkEditing = useCallback(() => {
    setRemarkBody('')
    setEditingRemarkId(null)
    setRemarkValidationMessage('')
    setIsEditingRemarks(false)
  }, [])
  const onCancelRemarkEditing = useCallback(() => {
    if (isSavingRemark) return
    if (remarkDirty) {
      setRemarkDiscardConfirmationOpen(true)
    } else {
      discardRemarkEditing()
    }
  }, [discardRemarkEditing, isSavingRemark, remarkDirty])

  const onSaveSummary = useCallback(
    async (
      source: SummarySaveSource,
      refreshAfterSave = true,
      accuracyAcknowledged = false,
    ): Promise<boolean> => {
      if (requiresApplicationAccuracyAcknowledgement && !accuracyAcknowledged) {
        return false
      }
      if (
        !applicationNumber ||
        !detail ||
        !summaryForm ||
        isSavingSummary ||
        summaryOptionsUnavailableForSource(source) ||
        isSummaryClientLookupPendingForSource(source)
      ) {
        return false
      }
      if (!canEditSummary) {
        setActionResult({
          kind: 'error',
          message:
            'Application details can only be edited while the application is New or Approved.',
        })
        return false
      }
      if (
        (source === 'items' || source === 'summary-items') &&
        (applicationItemsEditing || applicationItemsDirty || applicationItemsBusy)
      ) {
        setActionResult({
          kind: 'error',
          message:
            'Save or reset the package, species, or scale draft before saving application item details.',
        })
        return false
      }

      const sourceValidationErrors = summaryValidationErrorsForSource(source)
      if (sourceValidationErrors.length > 0) {
        setShowSummaryValidationErrors(true)
        setActionResult({
          kind: 'error',
          message:
            sourceValidationErrors[0] ??
            'Please fix validation errors before saving these application details.',
        })
        return false
      }

      setActionResult(null)
      setIsSavingSummary(true)
      try {
        let summaryRequestForm = normalizeSummaryAgentFields(summaryForm)
        const confirmClientNumber = async (
          clientNumber: string,
          clientLocationCode: string,
        ): Promise<string> => {
          const normalizedClientNumber = clientNumber.trim()
          if (!/^\d{1,7}$/.test(normalizedClientNumber) || !clientLocationCode.trim()) {
            return normalizedClientNumber
          }

          const clientData = await fetchApplicationClientData(
            normalizedClientNumber,
            clientLocationCode,
            { applicationNumber },
          )
          return clientData?.clientNumber.trim() || normalizedClientNumber
        }
        const originalOwnerClientNumber = summaryRequestForm.ownerClientNumber
        const originalOwnerClientLocationCode = summaryRequestForm.ownerClientLocationCode
        const originalAgentClientNumber = summaryRequestForm.agentClientNumber
        const originalAgentClientLocationCode = summaryRequestForm.agentClientLocationCode
        const confirmOwnerClientNumber = source === 'owner' || source === 'agent'
        const confirmAgentClientNumber =
          source === 'agent' && isAgentApplicant(summaryRequestForm.applicantTypeCode)
        const [ownerClientNumber, agentClientNumber] = await Promise.all([
          confirmOwnerClientNumber
            ? confirmClientNumber(originalOwnerClientNumber, originalOwnerClientLocationCode)
            : Promise.resolve(originalOwnerClientNumber),
          confirmAgentClientNumber
            ? confirmClientNumber(originalAgentClientNumber, originalAgentClientLocationCode)
            : Promise.resolve(originalAgentClientNumber),
        ])
        summaryRequestForm = { ...summaryRequestForm, ownerClientNumber, agentClientNumber }
        setSummaryForm((current) => {
          if (
            !current ||
            current.ownerClientNumber !== originalOwnerClientNumber ||
            current.ownerClientLocationCode !== originalOwnerClientLocationCode ||
            current.agentClientNumber !== originalAgentClientNumber ||
            current.agentClientLocationCode !== originalAgentClientLocationCode
          ) {
            return current
          }

          return { ...current, ownerClientNumber, agentClientNumber }
        })

        if (
          (source === 'items' || source === 'summary-items') &&
          ['H', 'T'].includes(summaryRequestForm.productTypeCode.trim().toUpperCase()) &&
          !summaryVolumeWarningAccepted
        ) {
          const volumeUsage = await checkApplicationVolumeUsage(String(detail.applicationNumber))
          if (!volumeUsage.volumeUsed) {
            setSummaryVolumeWarningAccepted(true)
            setActionResult({
              kind: 'warning',
              title: 'Review package volumes',
              message:
                'The sum of package volumes is less than the total application volume. Review package volumes or save again to continue.',
              volumeWarning: true,
            })
            return false
          }
        }

        // INTENTIONAL_LEGACY_DIVERGENCE(BCEID_APPLICATION_EDIT_CONTRACT):
        // Save only the application fields rendered for every authorized editor; do not make
        // BCeID edits depend on staff-only review status or remark controls.
        const result = await updateApplicationSummary({
          applicationNumber: String(detail.applicationNumber),
          saveSource: source === 'agent' ? 'owner-agent' : source,
          ...(confirmOwnerClientNumber && {
            ownerClientNumber: summaryRequestForm.ownerClientNumber,
            ownerClientLocationCode: summaryRequestForm.ownerClientLocationCode,
            ownerContactName: summaryRequestForm.ownerContactName,
            applicantTypeCode: canChangeApplicantType
              ? summaryRequestForm.applicantTypeCode
              : undefined,
          }),
          ...(source === 'agent' && {
            agentClientNumber: summaryRequestForm.agentClientNumber,
            agentClientLocationCode: summaryRequestForm.agentClientLocationCode,
            agentContactName: summaryRequestForm.agentContactName,
          }),
          ...((source === 'summary' || source === 'summary-items') && {
            applicationDate: summaryRequestForm.applicationDate,
            termDays: summaryRequestForm.termDays.trim(),
            exemptionReasonCode: summaryRequestForm.exemptionReasonCode,
            exportScheduleId: summaryRequestForm.exportScheduleId,
            orgUnitNumber: summaryRequestForm.orgUnitNumber,
          }),
          ...((source === 'items' || source === 'summary-items') && {
            applicationVolume: summaryRequestForm.applicationVolume,
            averageLogVolume: summaryRequestForm.averageLogVolume,
            productLocation: summaryRequestForm.productLocation,
            productTypeCode: summaryRequestForm.productTypeCode,
            growthTypeCode: summaryRequestForm.growthTypeCode,
            endUseCode: summaryRequestForm.endUseCode,
            speciesCodes: summaryRequestForm.speciesCodes,
          }),
        })
        if (!result.valid) {
          setActionResult({
            kind: 'error',
            message:
              result.errors.length > 0
                ? result.errors.join(' ')
                : result.message || 'Unable to save application summary.',
          })
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
        setActionResult({ kind: 'success', title: APPLICATION_SAVED_TITLE, message: '' })
        return true
      } catch {
        setActionResult({ kind: 'error', message: 'Unable to save application summary.' })
        return false
      } finally {
        setIsSavingSummary(false)
      }
    },
    [
      applicationNumber,
      applicationItemsBusy,
      applicationItemsDirty,
      applicationItemsEditing,
      canChangeApplicantType,
      canEditSummary,
      detail,
      editingRemarkId,
      isSavingSummary,
      isSummaryClientLookupPendingForSource,
      loadApplicationDetail,
      remarkBody,
      requiresApplicationAccuracyAcknowledgement,
      reviewStatusCode,
      reviewStatusRemark,
      reviewStatusBaselineCode,
      reviewStatusRemarkBaseline,
      summaryForm,
      summaryOptionsUnavailableForSource,
      summaryValidationErrorsForSource,
      summaryVolumeWarningAccepted,
    ],
  )

  const closeSummaryAccuracyConfirmation = useCallback(() => {
    setSummaryAccuracyConfirmationOpen(false)
    setSummaryAccuracyConfirmed(false)
    setSummaryAccuracyApplicationNumber(null)
    setPendingSummarySaveSource('summary')
  }, [])

  const completeSummarySave = useCallback(
    async (source: SummarySaveSource, accuracyAcknowledged = false): Promise<boolean> => {
      const saved = await onSaveSummary(source, true, accuracyAcknowledged)
      if (saved && (source === 'summary' || source === 'summary-items')) {
        setIsEditingSummary(false)
      }
      if (saved && source === 'owner') {
        setIsEditingOwnerDetails(false)
        setActionResult({ kind: 'success', title: APPLICATION_SAVED_TITLE, message: '' })
      }
      if (saved && source === 'agent') {
        setIsEditingOwnerDetails(false)
        setActionResult({ kind: 'success', title: APPLICATION_SAVED_TITLE, message: '' })
      }
      // Item saves also come from the Application editor when only the product type changed.
      if (saved && source === 'items' && isEditingApplicationItems) {
        setIsEditingApplicationItems(false)
        setActionResult({ kind: 'success', title: APPLICATION_SAVED_TITLE, message: '' })
      } else if (saved && source === 'items') {
        setIsEditingSummary(false)
      }
      return saved
    },
    [isEditingApplicationItems, onSaveSummary],
  )

  const onCancelReviewEditing = useCallback(() => {
    setReviewStatusCode(reviewStatusBaselineCode)
    setReviewStatusRemark(reviewStatusRemarkBaseline)
    setReviewStatusEmailOverride(null)
    setSendReviewEmail(false)
    setReviewValidationMessage('')
    setIsEditingReview(false)
    setIsRetryingApprovalRemark(false)
  }, [reviewStatusBaselineCode, reviewStatusRemarkBaseline])

  const onRequestSaveSummary = useCallback(
    (source: SummarySaveSource) => {
      if (!requiresApplicationAccuracyAcknowledgement) {
        void completeSummarySave(source)
        return
      }
      setActionResult(null)
      setPendingSummarySaveSource(source)
      setSummaryAccuracyConfirmed(false)
      setSummaryAccuracyApplicationNumber(applicationNumber ?? null)
      setSummaryAccuracyConfirmationOpen(true)
    },
    [applicationNumber, completeSummarySave, requiresApplicationAccuracyAcknowledgement],
  )

  const onConfirmSummaryAccuracy = useCallback(async () => {
    if (!summaryAccuracyConfirmed || isSavingSummary) return
    const saved = await completeSummarySave(pendingSummarySaveSource, true)
    if (!saved) {
      throw new Error('Application changes were not saved.')
    }
  }, [completeSummarySave, isSavingSummary, pendingSummarySaveSource, summaryAccuracyConfirmed])

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

  const onApproveApplication = useCallback(async (): Promise<'saved' | 'partial' | 'failed'> => {
    if (
      !detail ||
      isSubmittingReviewAction ||
      (isRetryingApprovalRemark ? !canManageRemarks : !canApproveApplicationReview)
    ) {
      return 'failed'
    }

    setActionResult(null)
    const approvalRemark = reviewStatusRemark.trim()
    if (isRetryingApprovalRemark && !approvalRemark) {
      setReviewValidationMessage(APPROVAL_REMARK_REQUIRED_MESSAGE)
      return 'failed'
    }
    setReviewValidationMessage('')
    setIsSubmittingReviewAction(true)
    try {
      if (!isRetryingApprovalRemark) {
        const result = await approveApplicationReview(String(detail.applicationNumber))
        if (!result.valid || !result.updated) {
          setActionResult({
            kind: 'error',
            message: result.message || 'Unable to approve application.',
          })
          return 'failed'
        }
        applyReviewStatusResult(result, '')
      }

      if (approvalRemark && canManageRemarks) {
        const retainFailedRemark = (reason?: string) => {
          // Review owns this draft; the separate Remarks editor may already have unsaved work.
          setReviewStatusRemark(approvalRemark)
          setIsRetryingApprovalRemark(true)
          setReviewStatusEmailOverride(null)
          setIsEditingReview(true)
          selectApplicationTab('review')
          setReviewValidationMessage(
            `Application approved, but the remark was not saved. Retry saving the remark.${reason ? ` ${reason}` : ''}`,
          )
        }
        try {
          const remarkResult = await saveApplicationRemark({
            applicationNumber: String(detail.applicationNumber),
            remarkBody: approvalRemark,
          })
          if (!remarkResult.success) {
            retainFailedRemark(remarkResult.message)
            return 'partial'
          }
        } catch {
          retainFailedRemark()
          return 'partial'
        }
        setIsRetryingApprovalRemark(false)
        try {
          // Approval updates the status in both summary states; keep unrelated edits and
          // their saved baseline while refreshing the newly persisted review remark.
          await loadApplicationDetail({ preserveRemarkDraft: true, preserveSummaryDraft: true })
        } catch {
          setActionResult({
            kind: 'error',
            message: 'Application approved and remark saved, but the page could not refresh.',
          })
          return 'saved'
        }
      }
      setIsRetryingApprovalRemark(false)
      setActionResult({
        kind: 'success',
        title: isRetryingApprovalRemark ? 'Remark saved.' : 'Application approved.',
        message: '',
        source: 'review',
      })
      return 'saved'
    } catch {
      setActionResult({ kind: 'error', message: 'Unable to approve application.' })
      return 'failed'
    } finally {
      setIsSubmittingReviewAction(false)
    }
  }, [
    applyReviewStatusResult,
    canApproveApplicationReview,
    canManageRemarks,
    detail,
    isRetryingApprovalRemark,
    isSubmittingReviewAction,
    loadApplicationDetail,
    reviewStatusRemark,
    selectApplicationTab,
  ])

  const onUpdateReviewStatus = useCallback(
    async (sendEmail: boolean): Promise<'saved' | 'partial' | 'failed'> => {
      if (
        !detail ||
        !canEditApplicationReview ||
        isSubmittingReviewAction ||
        reviewOptionsAvailability !== 'available' ||
        reviewStatusOptions.length === 0
      ) {
        return 'failed'
      }

      const payloadResult = buildReviewStatusPayload(sendEmail)
      if (!payloadResult.valid || !payloadResult.payload) {
        setReviewValidationMessage(payloadResult.message)
        return 'failed'
      }

      setActionResult(null)
      setReviewValidationMessage('')
      setIsSubmittingReviewAction(true)
      try {
        const updateResult = await updateApplicationReviewStatus(
          String(detail.applicationNumber),
          payloadResult.payload,
        )
        if (!updateResult.valid || !updateResult.updated) {
          setActionResult({
            kind: 'error',
            message: updateResult.message || 'Unable to update application status.',
          })
          return 'failed'
        }

        // The status and remark are committed before the separate email request.
        applyReviewStatusResult(updateResult, payloadResult.payload.remark)
        setIsEditingReview(false)
        setReviewStatusEmailOverride(null)
        setSentReviewEmail(null)
        const { statusCode, clientEmailAddress } = payloadResult.payload
        const savedStatusTitle =
          REVIEW_STATUS_SUCCESS_TITLES[statusCode] ?? 'Application status updated.'
        if (sendEmail) {
          try {
            const emailResult = await sendApplicationReviewStatusEmail(
              String(detail.applicationNumber),
              payloadResult.payload,
            )
            if (!emailResult.success) {
              setActionResult({
                kind: 'warning',
                title: savedStatusTitle,
                source: 'review',
                message:
                  emailResult.message ===
                  'Application status email is not configured yet. No email was sent.'
                    ? 'Application status email is not configured yet. The application status was updated, but no email was sent.'
                    : `The application status was updated, but the email could not be sent.${emailResult.message ? ` ${emailResult.message}` : ''}`,
              })
              return 'partial'
            }
          } catch {
            setActionResult({
              kind: 'warning',
              title: savedStatusTitle,
              source: 'review',
              message:
                'The application status was updated, but the email result could not be confirmed. Check delivery before sending another email.',
            })
            return 'partial'
          }
        }

        setSentReviewEmail(
          sendEmail
            ? { applicationNumber: String(detail.applicationNumber), address: clientEmailAddress }
            : null,
        )
        setActionResult({
          kind: 'success',
          title: savedStatusTitle,
          source: 'review',
          message: sendEmail
            ? `Email sent to ${clientEmailAddress}.`
            : EMAIL_SUPPORTED_STATUS_CODES.has(statusCode)
              ? 'No email was sent to the client.'
              : '',
        })
        return 'saved'
      } catch {
        setActionResult({ kind: 'error', message: 'Unable to update application status.' })
        return 'failed'
      } finally {
        setIsSubmittingReviewAction(false)
      }
    },
    [
      applyReviewStatusResult,
      buildReviewStatusPayload,
      canEditApplicationReview,
      detail,
      isSubmittingReviewAction,
      reviewOptionsAvailability,
      reviewStatusOptions.length,
    ],
  )

  const onApproveApplicationFromEdit = useCallback(async () => {
    if ((await onApproveApplication()) === 'saved') {
      setReviewStatusEmailOverride(null)
      setIsEditingReview(false)
    }
  }, [onApproveApplication])

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
    (isEditingSummary || isEditingOwnerDetails || isEditingApplicationItems) &&
    !!summaryForm &&
    !!summaryBaselineForm &&
    !formValuesEqual(summaryForm, summaryBaselineForm)
  const activeSummarySaveSource: SummarySaveSource = isEditingApplicationItems
    ? 'items'
    : isEditingOwnerDetails
      ? isSummaryAgentApplicant
        ? 'agent'
        : 'owner'
      : applicationSummarySaveSource
  const activeMissingSummaryOptionLabels =
    missingSummaryOptionLabelsForSource(activeSummarySaveSource)
  const activeRequiredSummaryOptionsMissing =
    summaryOptionsAvailability === 'available' && activeMissingSummaryOptionLabels.length > 0
  const reviewDirty =
    isRetryingApprovalRemark ||
    (canEditApplicationReview &&
      isEditingReview &&
      // The review form opens on its default status; only a different choice is a change.
      (normalizedReviewStatusCode !== reviewFormDefaultStatusCode ||
        reviewStatusRemark !== reviewStatusRemarkBaseline ||
        reviewStatusEmailAddress !== reviewStatusEmailCandidate ||
        (canSendReviewStatusEmail && sendReviewEmail)))
  const isApplicationDirty =
    summaryDirty || remarkDirty || reviewDirty || applicationItemsDirty || documentUploadDirty

  const onSaveUnsavedApplicationChanges = useCallback(async (): Promise<boolean> => {
    if (documentUploadDirty) {
      setActionResult({
        kind: 'error',
        message:
          'Queued document uploads must be submitted or reset before leaving this application.',
      })
      return false
    }
    if (applicationItemsDirty) {
      selectApplicationTab('items')
      setActionResult({
        kind: 'error',
        message:
          'Save or cancel the package or scale draft in the Scale tab before leaving this application.',
      })
      return false
    }
    if (summaryDirty && !(await onSaveSummary(activeSummarySaveSource, false, true))) return false
    if (remarkDirty && !(await onSaveRemark(false))) return false
    if (reviewDirty) {
      const reviewSaved = await (normalizedReviewStatusCode === 'APP'
        ? onApproveApplication()
        : onUpdateReviewStatus(sendReviewEmail && canSendReviewStatusEmail))
      if (reviewSaved !== 'saved') return false
    }
    return true
  }, [
    normalizedReviewStatusCode,
    canSendReviewStatusEmail,
    activeSummarySaveSource,
    applicationItemsDirty,
    documentUploadDirty,
    onApproveApplication,
    onSaveRemark,
    onSaveSummary,
    onUpdateReviewStatus,
    remarkDirty,
    reviewDirty,
    sendReviewEmail,
    selectApplicationTab,
    summaryDirty,
  ])

  const onDiscardApplicationChanges = useCallback(() => {
    setSummaryForm(
      summaryBaselineForm ??
        (detail ? normalizeSummaryAgentFields(toSummaryFormState(detail)) : null),
    )
    setSummaryVolumeWarningAccepted(false)
    setIsEditingSummary(false)
    setIsEditingOwnerDetails(false)
    setIsEditingApplicationItems(false)
    setApplicationItemsEditing(false)
    setIsEditingDocuments(false)
    setIsEditingRemarks(false)
    setIsEditingReview(false)
    setIsRetryingApprovalRemark(false)
    closeSummaryAccuracyConfirmation()
    setShowSummaryValidationErrors(false)
    setRemarkBody('')
    setEditingRemarkId(null)
    setRemarkValidationMessage('')
    setReviewStatusCode(reviewStatusBaselineCode)
    setReviewStatusRemark(reviewStatusRemarkBaseline)
    setReviewStatusEmailOverride(null)
    setSendReviewEmail(false)
    setReviewValidationMessage('')
    setActionResult(withoutDraftResult)
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
  const ownerApplicantTypeLabel = applicantTypeLabel(ownerApplicantTypeCode)
  // Without an applicant type control, clearing "I'm an agent" keeps a saved Ministerial type.
  const ownerNonAgentApplicantTypeCode =
    summaryBaselineForm?.applicantTypeCode.trim().toUpperCase() === 'M' ? 'M' : 'O'
  // Figma heads the owner's details "Owner". A Ministerial applicant keeps its type visible
  // there, and an agent applicant's agent gets its own section below.
  const ownerSectionTitle =
    ownerApplicantTypeCode.trim().toUpperCase() === 'M' ? ownerApplicantTypeLabel : 'Owner'
  const ownerClientLocationCode = summaryForm?.ownerClientLocationCode?.trim() ?? ''
  const ownerClientLocationName = ownerClientLocations.find(
    (location) => location.locationCode === ownerClientLocationCode,
  )?.locationName
  const ownerClientLocationDisplay = clientLocationLabel(
    ownerClientLocationCode,
    ownerClientLocationName ?? '',
    ownerClientData?.locationName ?? '',
  )
  const agentClientLocationCode = summaryForm?.agentClientLocationCode?.trim() ?? ''
  const agentClientLocationName = agentClientLocations.find(
    (location) => location.locationCode === agentClientLocationCode,
  )?.locationName
  const agentClientLocationDisplay = clientLocationLabel(
    agentClientLocationCode,
    agentClientLocationName ?? '',
    agentClientData?.locationName ?? '',
  )
  const summaryExemptionReasonDescription = optionDescription(
    exemptionReasonOptions,
    summaryForm?.exemptionReasonCode,
  )
  const summaryProductTypeDescription = optionDescription(
    productTypeOptions,
    summaryForm?.productTypeCode ?? detail?.productTypeCode,
  )
  const summaryProductTypeCode = summaryForm?.productTypeCode ?? detail?.productTypeCode ?? ''
  const summaryProductTypeHasGrowthDetails = productTypeRequiresGrowthType(summaryProductTypeCode)
  const summaryProductTypeHasLogDetails = productTypeRequiresLogDetails(summaryProductTypeCode)
  const summaryRegionDescription =
    optionDescription(regionOptions, summaryForm?.orgUnitNumber) ||
    detail?.orgUnitName ||
    String(detail?.orgUnitNumber ?? '')
  // Read-only Scale details show saved values while the Application editor holds a product change.
  const savedScaleForm = summaryBaselineForm ?? summaryForm
  const savedProductTypeCode = savedScaleForm?.productTypeCode ?? detail?.productTypeCode ?? ''
  const savedProductTypeHasGrowthDetails = productTypeRequiresGrowthType(savedProductTypeCode)
  const savedProductTypeHasLogDetails = productTypeRequiresLogDetails(savedProductTypeCode)
  const savedGrowthTypeDescription = optionDescription(
    optionsWithCurrentValue(summaryGrowthTypeOptions, savedScaleForm?.growthTypeCode ?? ''),
    savedScaleForm?.growthTypeCode,
  )
  const savedEndUseCode = savedScaleForm?.endUseCode.trim() ?? ''
  const savedEndUseDescription =
    applicationEndUseOptions.find((option) => option.code === savedEndUseCode)?.description ??
    savedEndUseCode
  const ownerClientDetailFields: Array<[string, ReactNode]> = [
    ['Contact name', displayValue(summaryForm?.ownerContactName)],
    [
      'Client',
      displayValue(
        clientDisplayName(
          ownerClientData,
          summaryForm?.ownerClientNumber ?? String(detail?.ownerClientNumber ?? ''),
        ),
      ),
    ],
    ['Client location', displayValue(ownerClientLocationDisplay)],
  ]
  const ownerClientSummaryContent = (
    <ClientDataSummary
      title="Applicant client details"
      showTitle={false}
      clientData={ownerClientData}
      isLoading={isLoadingOwnerClientData}
      detailFields={ownerClientDetailFields}
    />
  )
  const agentClientDetailFields: Array<[string, ReactNode]> = [
    ['Contact name', displayValue(summaryForm?.agentContactName)],
    [
      'Agent client',
      displayValue(
        clientDisplayName(
          agentClientData,
          summaryForm?.agentClientNumber ?? String(detail?.agentClientNumber ?? ''),
        ),
      ),
    ],
    ['Agent location', displayValue(agentClientLocationDisplay)],
  ]
  const agentClientSummaryContent = summaryAgentClientNumber ? (
    <ClientDataSummary
      title="Agent details"
      showTitle={false}
      clientData={agentClientData}
      isLoading={isLoadingAgentClientData}
      detailFields={agentClientDetailFields}
    />
  ) : (
    <EmptyState
      title="No agent assigned"
      description="No agent is assigned to this application."
      headingLevel={3}
    />
  )

  const applicationOffersContent = detail ? (
    <section
      id="application-offers"
      className="application-detail-section detail-offers-section"
      aria-label="Offers"
    >
      {detail.offers.length > 0 ? (
        <TableFrame ariaLabel="Application offers">
          <Table size="md" useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Company name</TableHeader>
                <TableHeader>Date and time received</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.offers.map((item) => (
                <TableRow key={item.offerNumber}>
                  <TableCell>{displayTableValue(item.companyName)}</TableCell>
                  <TableCell>
                    {item.receivedTimestamp
                      ? formatBusinessDateTimeLabel(item.receivedTimestamp)
                      : displayValue(formatIsoDateLabel(item.receivedDate))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      ) : (
        <EmptyState
          title="No offers found"
          description="No offers are linked to this application."
          headingLevel={2}
        />
      )}
    </section>
  ) : null

  // Figma places each tab's add action in its empty state, and above the list once rows exist.
  const showsEmptyApplicationDocuments =
    documentLookupAvailability === 'available' && !hasApplicationDocuments
  const applicationScaleForm = summaryForm && (
    <div className="legacy-search-grid application-scale-form">
      {summaryProductTypeHasLogDetails && (
        <TextArea
          className="application-scale-form__location"
          id="applicationSummaryProductLocation"
          labelText={requiredLabel('Location of logs')}
          aria-required="true"
          enableCounter
          maxCount={APPLICATION_PRODUCT_LOCATION_MAX_LENGTH}
          maxLength={APPLICATION_PRODUCT_LOCATION_MAX_LENGTH}
          value={summaryForm.productLocation}
          invalid={Boolean(visibleSummaryFieldError('productLocation'))}
          invalidText={visibleSummaryFieldError('productLocation')}
          onChange={(event) => onSummaryFormChange('productLocation', event.target.value)}
        />
      )}
      {summaryProductTypeHasGrowthDetails && (
        <SearchableSelect
          id="applicationSummaryGrowthType"
          labelText={requiredLabel('Age class')}
          required
          value={summaryForm.growthTypeCode}
          invalid={Boolean(visibleSummaryFieldError('growthTypeCode'))}
          invalidText={visibleSummaryFieldError('growthTypeCode')}
          disabled={
            summaryOptionsAvailability !== 'available' || summaryGrowthTypeOptions.length === 0
          }
          placeholder="Select age class"
          options={optionsWithCurrentValue(growthTypeOptions, summaryForm.growthTypeCode)}
          onChange={(value) => onSummaryFormChange('growthTypeCode', value.toUpperCase())}
        />
      )}
      {summaryProductTypeHasLogDetails && (
        <TextInput
          id="applicationSummaryAverageLogVolume"
          labelText={requiredLabel('Average log volume (m³)')}
          aria-required="true"
          type="number"
          min={0}
          max={99.9}
          step="0.1"
          value={summaryForm.averageLogVolume}
          invalid={Boolean(visibleSummaryFieldError('averageLogVolume'))}
          invalidText={visibleSummaryFieldError('averageLogVolume')}
          onChange={(event) => onSummaryFormChange('averageLogVolume', event.target.value)}
        />
      )}
      <TextInput
        id="applicationSummaryVolume"
        labelText={requiredLabel('Application volume (m³)')}
        aria-required="true"
        type="number"
        min={0}
        step="0.01"
        value={summaryForm.applicationVolume}
        invalid={Boolean(visibleSummaryFieldError('applicationVolume'))}
        invalidText={visibleSummaryFieldError('applicationVolume')}
        onChange={(event) => onSummaryFormChange('applicationVolume', event.target.value)}
      />
      <FilterableMultiSelect
        id="applicationSummarySpecies"
        titleText={requiredLabel('Species list')}
        items={applicationSpeciesMultiSelectOptions}
        itemToString={(item) => item?.text ?? ''}
        selectedItems={selectedApplicationSpeciesOptions}
        placeholder="Select species"
        inputProps={{ 'aria-required': true }}
        disabled={applicationSpeciesMultiSelectOptions.length === 0}
        invalid={Boolean(summarySpeciesCodesError)}
        invalidText={summarySpeciesCodesError}
        onChange={({ selectedItems }) => {
          setSummaryForm((current) =>
            current
              ? {
                  ...current,
                  speciesCodes: selectedItems.map((item) => item.id),
                }
              : current,
          )
          setSummaryVolumeWarningAccepted(false)
          setActionResult(withoutVolumeWarning)
        }}
      />
      {summarySpeciesCodesError && applicationSpeciesMultiSelectOptions.length === 0 && (
        <p className="legacy-search-error" role="alert">
          {summarySpeciesCodesError}
        </p>
      )}
      {summaryProductTypeHasGrowthDetails && (
        <SearchableSelect
          id="applicationSummaryEndUse"
          labelText={requiredLabel('End use')}
          required
          value={summaryForm.endUseCode}
          disabled={
            summaryForm.speciesCodes.length === 0 || applicationEndUseSelectOptions.length === 0
          }
          placeholder={endUsePlaceholder}
          options={applicationEndUseSelectOptions}
          onChange={(value) => onSummaryFormChange('endUseCode', value)}
        />
      )}
      {productTypeSupportsPackages(summaryProductTypeCode) && (
        <dl className="detail-field-item">
          <dt className="detail-field-label">Total pieces</dt>
          <dd className="detail-field-value">{applicationTotalPieces.toLocaleString()}</dd>
        </dl>
      )}
    </div>
  )

  const hasApplicationRemarks = (detail?.remarks?.length ?? 0) > 0
  const addApplicationRemarkButton = canManageRemarks ? (
    <Button
      kind="tertiary"
      size="md"
      className="detail-remarks-add-button"
      renderIcon={Add}
      disabled={isEditingRemarks || isSavingRemark}
      onClick={(event) => {
        remarkLauncherRef.current = event.currentTarget
        setRemarkBody('')
        setEditingRemarkId(null)
        setRemarkValidationMessage('')
        setIsEditingRemarks(true)
      }}
    >
      Add remark
    </Button>
  ) : null

  const openReviewEditor = () => {
    setReviewValidationMessage('')
    setReviewStatusCode(reviewFormDefaultStatusCode)
    setReviewStatusRemark('')
    setSendReviewEmail(false)
    setIsEditingReview(true)
  }
  const isReviewNotStarted =
    normalizeReviewStatus(detail?.applicationStatusCode ?? '') === 'NEW' &&
    !reviewStatusRemarkBaseline
  const updateReviewStatusButton = (
    <Button
      kind="tertiary"
      size="md"
      className="detail-review-update-button"
      renderIcon={Edit}
      onClick={openReviewEditor}
    >
      Update status
    </Button>
  )

  const applicationReviewContent = detail ? (
    canReviewApplication ? (
      <Tile
        id="application-review"
        className={`application-detail-section application-detail-review${
          isReviewNotStarted && !isEditingReview ? ' application-detail-review--empty' : ''
        }`}
        role="region"
        aria-label="Application review"
      >
        {(!isReviewNotStarted || isEditingReview) && (
          <div className="detail-section-card__header">
            <DetailCardTitle icon={Stamp}>Application review</DetailCardTitle>
            {canEditApplicationReview &&
              !isEditingReview &&
              !isReviewNotStarted &&
              updateReviewStatusButton}
          </div>
        )}
        {reviewActionResult && (
          <ActionResultNotification
            result={reviewActionResult}
            onClose={() => setActionResult(null)}
          />
        )}
        {isEditingReview ? (
          <div className="application-detail-review__form">
            <RequiredFieldsLegend className="application-detail-required" />
            <RadioButtonGroup
              legendText={requiredLabel('Application status')}
              required
              name="applicationDetailReviewStatus"
              valueSelected={reviewStatusCode}
              disabled={
                isRetryingApprovalRemark ||
                isSubmittingReviewAction ||
                reviewOptionsAvailability !== 'available'
              }
              onChange={(value) => {
                const nextStatus = String(value)
                setReviewStatusCode(nextStatus)
                if (nextStatus === 'APP' && !canManageRemarks) {
                  setReviewStatusRemark('')
                }
                setReviewValidationMessage('')
              }}
            >
              {[
                ...(canApproveApplicationReview || isRetryingApprovalRemark
                  ? [{ value: 'APP', label: 'Approved' }]
                  : []),
                ...reviewStatusOptions
                  .map((option) => ({ ...option, value: normalizeReviewStatus(option.value) }))
                  .filter((option) => ['REJ', 'WDN'].includes(option.value)),
              ].map((option) => (
                <RadioButton
                  key={option.value}
                  id={`applicationDetailReviewStatus-${option.value}`}
                  value={option.value}
                  labelText={option.label}
                />
              ))}
            </RadioButtonGroup>
            {isReviewStatusInvalid && <p role="alert">{reviewValidationMessage}</p>}
            {(normalizedReviewStatusCode !== 'APP' || canManageRemarks) && (
              <TextArea
                id="applicationDetailReviewRemark"
                labelText={requiredLabel(
                  'Remarks',
                  isRetryingApprovalRemark ||
                    REVIEW_STATUSES_REQUIRING_REMARK.has(normalizedReviewStatusCode),
                )}
                aria-required={
                  isRetryingApprovalRemark ||
                  REVIEW_STATUSES_REQUIRING_REMARK.has(normalizedReviewStatusCode) ||
                  undefined
                }
                helperText="Saved to the Remarks tab."
                rows={5}
                enableCounter
                maxCount={APPLICATION_REMARK_MAX_LENGTH}
                maxLength={APPLICATION_REMARK_MAX_LENGTH}
                invalid={isReviewRemarkInvalid}
                invalidText={reviewValidationMessage}
                value={reviewStatusRemark}
                disabled={
                  isSubmittingReviewAction ||
                  (!isRetryingApprovalRemark && reviewOptionsAvailability !== 'available')
                }
                onChange={(event) => {
                  setReviewStatusRemark(event.target.value)
                  setReviewValidationMessage('')
                }}
              />
            )}
            {canSendReviewStatusEmail && (
              <>
                <Checkbox
                  id="applicationDetailReviewSendEmail"
                  labelText="Send email notification to the client, including the remark"
                  checked={sendReviewEmail}
                  onChange={(_, { checked }) => setSendReviewEmail(checked)}
                />
                {sendReviewEmail && (
                  <TextInput
                    id="applicationDetailReviewEmail"
                    labelText={requiredLabel('Client email address')}
                    required
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
                )}
              </>
            )}
            {showReviewValidationNotification && (
              <InlineNotification
                className="detail-context-notification"
                kind="error"
                title={isRetryingApprovalRemark ? 'Remark not saved' : 'Review validation'}
                subtitle={reviewValidationMessage}
                lowContrast
                onCloseButtonClick={() => setReviewValidationMessage('')}
              />
            )}
            <div className="legacy-search-actions">
              <Button
                kind="tertiary"
                size="md"
                disabled={isSubmittingReviewAction}
                onClick={onCancelReviewEditing}
              >
                Cancel
              </Button>
              <Button
                kind="primary"
                size="md"
                disabled={
                  isSubmittingReviewAction ||
                  (isRetryingApprovalRemark
                    ? !canManageRemarks
                    : reviewOptionsAvailability !== 'available' ||
                      (normalizedReviewStatusCode === 'APP'
                        ? !canApproveApplicationReview
                        : reviewStatusOptions.length === 0))
                }
                onClick={() => {
                  if (normalizedReviewStatusCode === 'APP') {
                    void onApproveApplicationFromEdit()
                  } else {
                    void onUpdateReviewStatus(sendReviewEmail && canSendReviewStatusEmail)
                  }
                }}
              >
                {isRetryingApprovalRemark
                  ? 'Save remark'
                  : `${REVIEW_STATUS_ACTION_LABELS[normalizedReviewStatusCode] ?? 'Update status'}${
                      canSendReviewStatusEmail && sendReviewEmail ? ' and send email' : ''
                    }`}
              </Button>
            </div>
          </div>
        ) : isReviewNotStarted ? (
          <EmptyState
            title="Not reviewed yet"
            description="When you've finished checking this application, update its status."
            icon={<AddDocument width={48} height={48} />}
            action={canEditApplicationReview ? updateReviewStatusButton : undefined}
            headingLevel={3}
          />
        ) : (
          <dl className="detail-field-grid">
            {[
              [
                'Application status',
                displayValue(
                  resolveApplicationStatusDescription(reviewStatusCode) ??
                    detail.statusDescription ??
                    reviewStatusCode,
                ),
              ],
              ...(reviewStatusRemarkBaseline.trim()
                ? [['Remarks', reviewStatusRemarkBaseline]]
                : []),
              ...(sentReviewEmail?.applicationNumber === String(detail.applicationNumber)
                ? [['Client email address', sentReviewEmail.address]]
                : []),
            ].map(([label, value]) => (
              <div key={String(label)} className="detail-field-item">
                <dt className="detail-field-label">{label}</dt>
                <dd className="detail-field-value">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Tile>
    ) : (
      <Tile
        id="application-review"
        className="application-detail-section application-detail-review"
        role="region"
        aria-label="Application review"
      >
        <DetailCardTitle icon={Stamp}>Application review</DetailCardTitle>
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
        loadingDescription="Refreshing provincial application detail…"
      />
      <Column sm={4} md={8} lg={16}>
        <DetailBreadcrumb
          label={fallbackReturnTo.label}
          to={fallbackReturnTo.to}
          returnTo={detailReturnTo}
        />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <PageHeader
          title={`Application ${
            detailMatchesRoute ? (detail?.applicationNumber ?? '') : (applicationNumber ?? '')
          }`.trim()}
          subtitle={
            detail && detailMatchesRoute
              ? `Author: ${displayValueText(detail.author)}`
              : 'Check and manage this provincial application'
          }
          status={
            detail && detailMatchesRoute ? (
              <StatusTag status={detail.statusDescription ?? detail.applicationStatusCode ?? ''} />
            ) : undefined
          }
        />
      </Column>

      {loading && !detailMatchesRoute && (
        <Column
          sm={4}
          md={8}
          lg={16}
          className="detail-page-loading"
          role="status"
          aria-live="polite"
        >
          <Loading description="Loading provincial application detail…" withOverlay={false} />
        </Column>
      )}

      {!loading && !!errorMessage && <DetailLoadError message={errorMessage} />}

      {!!pageActionResult &&
        // The remark editor and accuracy confirmation show their own failures.
        !(
          summaryAccuracyConfirmationOpen &&
          (!!actionErrorMessage || pageActionResult.volumeWarning)
        ) &&
        !(isEditingRemarks && !!actionErrorMessage) && (
          <ActionResultNotification
            result={pageActionResult}
            onClose={() => setActionResult(null)}
          />
        )}

      {!!partialLoadMessage && (
        <AppNotification
          kind="error"
          title="Application data unavailable"
          subtitle={partialLoadMessage}
          lowContrast
          onCloseButtonClick={() => setPartialLoadMessage('')}
        />
      )}

      {detail && detailMatchesRoute && (
        <>
          {summaryOptionsAvailability === 'unavailable' && (
            <AuthoritativeOptionsUnavailableNotification title="Application options unavailable" />
          )}
          {((selectedApplicationTab === 'application' && isEditingSummary) ||
            (selectedApplicationTab === 'owner' && isEditingOwnerDetails) ||
            (selectedApplicationTab === 'items' && isEditingApplicationItems)) &&
            activeRequiredSummaryOptionsMissing && (
              <InlineNotification
                className="detail-context-notification"
                kind="warning"
                title="Application summary options unavailable"
                subtitle={`Missing required options: ${activeMissingSummaryOptionLabels.join(', ')}. Summary changes cannot be saved.`}
                lowContrast
                hideCloseButton
              />
            )}
          {canReviewApplication &&
            isEditingReview &&
            reviewOptionsAvailability === 'unavailable' && (
              <AuthoritativeOptionsUnavailableNotification title="Review options unavailable" />
            )}
          {canReviewApplication && isEditingReview && requiredReviewOptionsMissing && (
            <InlineNotification
              className="detail-context-notification"
              kind="warning"
              title="Review statuses not configured"
              subtitle="No authoritative review statuses are configured. Review status updates are disabled."
              lowContrast
              hideCloseButton
            />
          )}
          {clientLookupFailures.size > 0 && (
            <AppNotification
              kind="error"
              title="Client details unavailable"
              subtitle={CLIENT_LOOKUP_UNAVAILABLE_MESSAGE}
              lowContrast
              onCloseButtonClick={() => setClientLookupFailures(new Set())}
            />
          )}
          {!!detail.locked && !!detail.lockMessage && (
            <InlineNotification
              className="detail-context-notification"
              kind="warning"
              title="Application locked"
              subtitle={detail.lockMessage}
              lowContrast
              hideCloseButton
            />
          )}

          <Column sm={4} md={8} lg={16} className="application-detail-tabs-column">
            <Tabs
              selectedIndex={selectedApplicationTabIndex}
              onChange={({ selectedIndex }) => {
                const selectedTab = APPLICATION_DETAIL_TAB_SLOTS[selectedIndex]
                selectApplicationTab(
                  selectedTab && applicationDetailTabs.includes(selectedTab)
                    ? selectedTab
                    : 'owner',
                )
              }}
            >
              <TabList
                aria-label="Application detail sections"
                contained
                className="application-tabs__list application-detail-tab-list"
              >
                <Tab renderIcon={Enterprise}>Applicant</Tab>
                <Tab renderIcon={Task}>Application</Tab>
                <Tab renderIcon={Box}>Scale</Tab>
                <Tab renderIcon={DocumentAttachment}>Documents</Tab>
                {canViewRemarks && <Tab renderIcon={Chat}>Remarks</Tab>}
                <Tab renderIcon={DataDefinition}>Offers</Tab>
                {canViewReview && <Tab renderIcon={Stamp}>Review</Tab>}
              </TabList>
              <TabPanels>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile
                        id="application-owner-details"
                        className="application-detail-section application-detail-clients"
                      >
                        <div className="detail-section-card__header">
                          <DetailCardTitle icon={Enterprise}>Applicant details</DetailCardTitle>
                          {canEditSummary &&
                            summaryForm &&
                            !isEditingSummary &&
                            !isEditingOwnerDetails &&
                            !isEditingApplicationItems && (
                              <Button
                                kind="tertiary"
                                size="md"
                                renderIcon={Edit}
                                onClick={() => {
                                  setActionResult(withoutDraftResult)
                                  setIsEditingOwnerDetails(true)
                                }}
                              >
                                Edit applicant details
                              </Button>
                            )}
                        </div>
                        {isEditingOwnerDetails && summaryForm ? (
                          <>
                            <RequiredFieldsLegend className="application-detail-required" />
                            <h3 className="detail-section-subtitle">{ownerSectionTitle}</h3>
                            <div className="legacy-search-grid application-client-edit-grid application-client-edit-grid--fixed-client">
                              <TextInput
                                id="applicationOwnerContactNameEdit"
                                labelText={requiredLabel('Contact name')}
                                aria-required="true"
                                value={summaryForm.ownerContactName}
                                invalid={Boolean(visibleSummaryFieldError('ownerContactName'))}
                                invalidText={visibleSummaryFieldError('ownerContactName')}
                                disabled={isSavingSummary}
                                placeholder="Enter contact name"
                                onChange={(event) =>
                                  onSummaryFormChange('ownerContactName', event.target.value)
                                }
                              />
                              {/* Figma: the saved application's client is shown, not changed. */}
                              <dl className="detail-field-item">
                                <dt className="detail-field-label">Client</dt>
                                <dd className="detail-field-value">
                                  {displayValue(
                                    clientDisplayName(
                                      ownerClientData,
                                      summaryForm.ownerClientNumber,
                                    ),
                                  )}
                                </dd>
                                {visibleSummaryFieldError('ownerClientNumber') && (
                                  <dd className="legacy-search-error" role="alert">
                                    {visibleSummaryFieldError('ownerClientNumber')}
                                  </dd>
                                )}
                              </dl>
                              <SearchableSelect
                                id="applicationOwnerClientLocationEdit"
                                labelText={requiredLabel('Client location')}
                                required
                                value={summaryForm.ownerClientLocationCode}
                                invalid={Boolean(
                                  visibleSummaryFieldError('ownerClientLocationCode'),
                                )}
                                invalidText={visibleSummaryFieldError('ownerClientLocationCode')}
                                disabled={
                                  isSavingSummary ||
                                  !summaryForm.ownerClientNumber.trim() ||
                                  isLoadingOwnerClientLocations
                                }
                                placeholder={ownerClientLocationPlaceholder}
                                options={ownerClientLocations
                                  .filter(isSelectableClientLocation)
                                  .map((clientLocation) => ({
                                    value: clientLocation.locationCode,
                                    label: clientLocationLabel(
                                      clientLocation.locationCode,
                                      clientLocation.locationName,
                                    ),
                                  }))}
                                onChange={(value) =>
                                  onSummaryFormChange('ownerClientLocationCode', value)
                                }
                              />
                            </div>
                            <ClientDataSummary
                              title="Applicant client details"
                              showTitle={false}
                              clientData={ownerClientData}
                              isLoading={isLoadingOwnerClientData}
                            />
                            <hr className="application-applicant-divider" />
                            <Checkbox
                              id="applicationOwnerAgentUsedEdit"
                              labelText="I'm an agent"
                              checked={summaryForm.applicantTypeCode === 'A'}
                              disabled={isSavingSummary || !canChangeApplicantType}
                              onChange={(_, { checked }) =>
                                onOwnerApplicantTypeChange(
                                  checked ? 'A' : ownerNonAgentApplicantTypeCode,
                                )
                              }
                            />
                            {isSummaryAgentApplicant && (
                              <section aria-label="Agent information">
                                <h3 className="detail-section-subtitle">Agent information</h3>
                                <div className="legacy-search-grid application-client-edit-grid">
                                  <TextInput
                                    id="applicationAgentContactNameEdit"
                                    labelText={requiredLabel('Contact name')}
                                    aria-required="true"
                                    value={summaryForm.agentContactName}
                                    invalid={Boolean(visibleSummaryFieldError('agentContactName'))}
                                    invalidText={visibleSummaryFieldError('agentContactName')}
                                    disabled={isSavingSummary}
                                    placeholder="Enter contact name"
                                    onChange={(event) =>
                                      onSummaryFormChange('agentContactName', event.target.value)
                                    }
                                  />
                                  <ForestClientComboBox
                                    id="applicationAgentClientNumberEdit"
                                    labelText={requiredLabel('Agent client')}
                                    value={summaryForm.agentClientNumber}
                                    selectedClientName={clientDisplayName(agentClientData, '')}
                                    counterpartyClientNumber={summaryForm.ownerClientNumber}
                                    required
                                    invalid={Boolean(visibleSummaryFieldError('agentClientNumber'))}
                                    invalidText={visibleSummaryFieldError('agentClientNumber')}
                                    disabled={isSavingSummary}
                                    onChange={(agentClientNumber) =>
                                      onSummaryFormChange('agentClientNumber', agentClientNumber)
                                    }
                                  />
                                  <SearchableSelect
                                    id="applicationAgentClientLocationEdit"
                                    labelText={requiredLabel('Agent location')}
                                    required
                                    value={summaryForm.agentClientLocationCode}
                                    invalid={Boolean(
                                      visibleSummaryFieldError('agentClientLocationCode'),
                                    )}
                                    invalidText={visibleSummaryFieldError(
                                      'agentClientLocationCode',
                                    )}
                                    disabled={
                                      isSavingSummary ||
                                      !summaryForm.agentClientNumber.trim() ||
                                      isLoadingAgentClientLocations
                                    }
                                    placeholder={agentClientLocationPlaceholder}
                                    options={agentClientLocations
                                      .filter(isSelectableClientLocation)
                                      .map((clientLocation) => ({
                                        value: clientLocation.locationCode,
                                        label: clientLocationLabel(
                                          clientLocation.locationCode,
                                          clientLocation.locationName,
                                        ),
                                      }))}
                                    onChange={(value) =>
                                      onSummaryFormChange('agentClientLocationCode', value)
                                    }
                                  />
                                </div>
                                <ClientDataSummary
                                  title="Agent information"
                                  showTitle={false}
                                  clientData={agentClientData}
                                  isLoading={isLoadingAgentClientData}
                                />
                              </section>
                            )}
                            <div className="legacy-search-actions">
                              <Button
                                kind="tertiary"
                                size="md"
                                disabled={isSavingSummary}
                                onClick={onCancelOwnerDetails}
                              >
                                Cancel
                              </Button>
                              <Button
                                kind="primary"
                                size="md"
                                disabled={
                                  isSavingSummary ||
                                  summaryOptionsUnavailableForSource(
                                    isSummaryAgentApplicant ? 'agent' : 'owner',
                                  ) ||
                                  isSummaryClientLookupPendingForSource(
                                    isSummaryAgentApplicant ? 'agent' : 'owner',
                                  )
                                }
                                renderIcon={isSavingSummary ? PendingIcon : undefined}
                                onClick={() =>
                                  onRequestSaveSummary(isSummaryAgentApplicant ? 'agent' : 'owner')
                                }
                              >
                                {isSavingSummary ? 'Saving…' : 'Save changes'}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <section aria-label={ownerSectionTitle}>
                              <h3 className="detail-section-subtitle">{ownerSectionTitle}</h3>
                              {ownerClientSummaryContent}
                            </section>
                            {isSummaryAgentApplicant && (
                              <>
                                <hr className="application-applicant-divider" />
                                <section aria-label="Agent information">
                                  <h3 className="detail-section-subtitle">Agent information</h3>
                                  {agentClientSummaryContent}
                                </section>
                              </>
                            )}
                          </>
                        )}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile
                        id="application-summary"
                        className="application-detail-section application-detail-summary"
                      >
                        <div className="detail-section-card__header">
                          <DetailCardTitle icon={Task}>Application details</DetailCardTitle>
                          {canEditSummary &&
                            summaryForm &&
                            !isEditingSummary &&
                            !isEditingOwnerDetails &&
                            !isEditingApplicationItems && (
                              <Button
                                kind="tertiary"
                                size="md"
                                renderIcon={Edit}
                                onClick={() => {
                                  setActionResult(withoutDraftResult)
                                  setIsEditingSummary(true)
                                }}
                              >
                                Edit application details
                              </Button>
                            )}
                        </div>
                        {isEditingSummary && canEditSummary && summaryForm ? (
                          <>
                            <RequiredFieldsLegend className="application-detail-required" />
                            <div className="legacy-search-grid">
                              <SearchableSelect
                                id="applicationSummaryRegion"
                                labelText={requiredLabel('Region')}
                                required
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
                                labelText={requiredLabel('Product type')}
                                required
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
                              <SearchableSelect
                                id="applicationSummaryExemptionReason"
                                labelText={requiredLabel('Exemption reason')}
                                required
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
                                labelText={requiredLabel('Application date')}
                                required
                                value={summaryForm.applicationDate}
                                invalid={Boolean(visibleSummaryFieldError('applicationDate'))}
                                invalidText={visibleSummaryFieldError('applicationDate')}
                                onChange={(value) => onSummaryFormChange('applicationDate', value)}
                              />
                              <div className="application-list-date-field">
                                <RadioButtonGroup
                                  legendText={requiredLabel('List date')}
                                  name="applicationSummarySchedule"
                                  valueSelected={
                                    summaryForm.exportScheduleId ||
                                    (canReviewApplication ? NO_LIST_DATE_VALUE : '')
                                  }
                                  required
                                  orientation="horizontal"
                                  disabled={
                                    summaryOptionsAvailability !== 'available' ||
                                    summaryScheduleOptions.length === 0
                                  }
                                  readOnly={listDateLocked}
                                  helperText={
                                    listDateLocked
                                      ? 'List date cannot be changed after the application is approved.'
                                      : undefined
                                  }
                                  onChange={(value) =>
                                    onSummaryFormChange(
                                      'exportScheduleId',
                                      value === NO_LIST_DATE_VALUE ? '' : String(value),
                                    )
                                  }
                                >
                                  {scheduleOptions.map((option) => (
                                    <RadioButton
                                      key={option.value}
                                      id={`applicationSummarySchedule-${option.value}`}
                                      value={option.value}
                                      labelText={formatIsoDateLabel(option.label)}
                                    />
                                  ))}
                                </RadioButtonGroup>
                                {visibleSummaryFieldError('exportScheduleId') && (
                                  <p role="alert">{visibleSummaryFieldError('exportScheduleId')}</p>
                                )}
                              </div>
                              <TextInput
                                id="applicationSummaryTermDays"
                                labelText={requiredLabel('Exemption term (days)')}
                                aria-required="true"
                                type="number"
                                min={1}
                                max={MAX_APPLICATION_TERM_DAYS}
                                value={summaryForm.termDays}
                                invalid={Boolean(visibleSummaryFieldError('termDays'))}
                                invalidText={visibleSummaryFieldError('termDays')}
                                onChange={(event) =>
                                  onSummaryFormChange('termDays', event.target.value)
                                }
                              />
                            </div>
                            {summaryScaleFieldsChanged && (
                              <section
                                className="application-product-scale-details"
                                aria-label="Scale details for changed product type"
                              >
                                <h3 className="detail-section-subtitle">Scale details</h3>
                                <p>
                                  Review the scale details for the selected product type before
                                  saving.
                                </p>
                                {applicationScaleForm}
                              </section>
                            )}
                            <div className="legacy-search-actions">
                              <Button
                                kind="tertiary"
                                size="md"
                                disabled={isSavingSummary}
                                onClick={onCancelSummaryDetails}
                              >
                                Cancel
                              </Button>
                              <Button
                                kind="primary"
                                size="md"
                                disabled={
                                  isSavingSummary ||
                                  summaryOptionsUnavailableForSource(
                                    applicationSummarySaveSource,
                                  ) ||
                                  isSummaryClientLookupPendingForSource('summary')
                                }
                                renderIcon={isSavingSummary ? PendingIcon : undefined}
                                onClick={() => onRequestSaveSummary(applicationSummarySaveSource)}
                              >
                                {isSavingSummary ? 'Saving…' : 'Save changes'}
                              </Button>
                            </div>
                          </>
                        ) : (
                          // Figma groups the saved Application details into these rows.
                          [
                            [
                              ['Region', displayValue(summaryRegionDescription)],
                              ['Product type', displayValue(summaryProductTypeDescription)],
                              ['Exemption reason', displayValue(summaryExemptionReasonDescription)],
                            ],
                            [
                              [
                                'Application date',
                                displayValue(formatIsoDateLabel(detail.applicationDate)),
                              ],
                              ['List date', displayValue(formatIsoDateLabel(detail.listingDate))],
                            ],
                            [['Exemption term (days)', displayValue(detail.termDays)]],
                          ].map((row) => (
                            <dl
                              key={String(row[0][0])}
                              className="detail-field-grid application-summary-fields"
                            >
                              {row.map(([label, value]) => (
                                <div key={String(label)} className="detail-field-item">
                                  <dt className="detail-field-label">{label}</dt>
                                  <dd className="detail-field-value">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          ))
                        )}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile
                        id="application-item-details"
                        className="application-detail-section application-detail-summary"
                      >
                        <div className="detail-section-card__header">
                          <DetailCardTitle icon={ContainerRegistry}>Scale details</DetailCardTitle>
                          {canEditSummary &&
                            summaryForm &&
                            !isEditingSummary &&
                            !isEditingOwnerDetails &&
                            !applicationItemsEditing &&
                            !applicationItemsDirty &&
                            !applicationItemsBusy &&
                            !isEditingApplicationItems && (
                              <Button
                                kind="tertiary"
                                size="md"
                                renderIcon={Edit}
                                onClick={() => {
                                  setActionResult(withoutDraftResult)
                                  setIsEditingApplicationItems(true)
                                }}
                              >
                                Edit scale details
                              </Button>
                            )}
                        </div>
                        {isEditingApplicationItems && canEditSummary && summaryForm ? (
                          <>
                            <RequiredFieldsLegend className="application-detail-required" />
                            {applicationScaleForm}
                            <div className="legacy-search-actions">
                              <Button
                                kind="tertiary"
                                size="md"
                                disabled={isSavingSummary}
                                onClick={onCancelApplicationItemDetails}
                              >
                                Cancel
                              </Button>
                              <Button
                                kind="primary"
                                size="md"
                                disabled={
                                  isSavingSummary ||
                                  summaryOptionsUnavailableForSource('items') ||
                                  isSummaryClientLookupPendingForSource('items') ||
                                  applicationItemsEditing ||
                                  applicationItemsDirty ||
                                  applicationItemsBusy
                                }
                                renderIcon={isSavingSummary ? PendingIcon : undefined}
                                onClick={() => onRequestSaveSummary('items')}
                              >
                                {isSavingSummary ? 'Saving…' : 'Save changes'}
                              </Button>
                            </div>
                          </>
                        ) : (
                          [
                            savedProductTypeHasLogDetails
                              ? [
                                  [
                                    'Location of logs',
                                    displayValue(savedScaleForm?.productLocation),
                                  ],
                                ]
                              : [],
                            savedProductTypeHasGrowthDetails
                              ? [['Age class', displayValue(savedGrowthTypeDescription)]]
                              : [],
                            [
                              ...(savedProductTypeHasLogDetails
                                ? [
                                    [
                                      'Average log volume (m³)',
                                      displayVolume(savedScaleForm?.averageLogVolume),
                                    ],
                                  ]
                                : []),
                              [
                                'Application volume (m³)',
                                displayVolume(savedScaleForm?.applicationVolume),
                              ],
                            ],
                            [
                              [
                                'Species list',
                                displayValue(savedScaleForm?.speciesCodes.join(', ')),
                              ],
                              ...(savedProductTypeHasGrowthDetails
                                ? [['End use', displayValue(savedEndUseDescription)]]
                                : []),
                            ],
                            applicationProductSupportsPackages
                              ? [['Total pieces', applicationTotalPieces.toLocaleString()]]
                              : [],
                          ]
                            .filter((row) => row.length > 0)
                            .map((row) => (
                              <dl
                                key={String(row[0][0])}
                                className="detail-field-grid application-scale-fields"
                              >
                                {row.map(([label, value]) => (
                                  <div key={String(label)} className="detail-field-item">
                                    <dt className="detail-field-label">{label}</dt>
                                    <dd className="detail-field-value">{value}</dd>
                                  </div>
                                ))}
                              </dl>
                            ))
                        )}
                      </Tile>
                    </Column>
                    {applicationProductSupportsPackages && detail.packages.length > 1 && (
                      <Column sm={4} md={8} lg={16}>
                        <Tile
                          id="application-packages"
                          className="application-detail-section application-detail-packages"
                        >
                          <DetailCardTitle icon={Box}>Packages</DetailCardTitle>
                          <TableFrame ariaLabel="Application packages">
                            <Table size="md" useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader aria-label="Package selection" />
                                  <TableHeader>Package number</TableHeader>
                                  <TableHeader>Volume (m³)</TableHeader>
                                  <TableHeader>Pieces</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {detail.packages.map((item) => (
                                  <TableRow key={item.packageNumber}>
                                    <TableSelectRow
                                      radio
                                      id={`application-package-select-${item.packageNumber}`}
                                      name="application-package-selection"
                                      ariaLabel={`Select package ${item.packageNumber}`}
                                      checked={selectedPackageNumber === item.packageNumber}
                                      onSelect={() => focusPackageInItems(item.packageNumber)}
                                    />
                                    <TableCell>{item.packageNumber}</TableCell>
                                    <TableCell>{formatVolume(item.volume)}</TableCell>
                                    <TableCell>{item.pieceCount.toLocaleString()}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        </Tile>
                      </Column>
                    )}
                    <Column sm={4} md={8} lg={16}>
                      <ProvincialApplicationItemsPanel
                        key={`${applicationNumber}-${applicationItemsResetKey}`}
                        detail={detail}
                        canEditPackages={canEditPackages}
                        canAddPackages={canAddPackages}
                        canAddScales={canAddScales}
                        canUpdatePackageNumber={canUpdatePackageNumber}
                        hideMutationActions={
                          isApplicationExpired || !applicationProductSupportsPackages
                        }
                        authoritativeOptionsAvailability={packageReferenceOptionsAvailability}
                        productTypeOptions={packageProductTypeOptions}
                        growthTypeOptions={packageGrowthTypeOptions}
                        applicationGrowthTypeCode={
                          summaryBaselineForm?.oicIndicator === 'N' &&
                          summaryBaselineForm.productTypeCode === detail.productTypeCode
                            ? summaryBaselineForm.growthTypeCode
                            : undefined
                        }
                        applicationEndUseCode={summaryBaselineForm?.endUseCode}
                        applicationSpeciesCodes={summaryBaselineForm?.speciesCodes}
                        editingBlocked={isEditingApplicationItems}
                        onDetailChanged={refreshApplicationDetailPreservingDrafts}
                        actionResult={itemsActionResult}
                        onActionResult={setItemsActionResult}
                        onDirtyChange={setApplicationItemsDirty}
                        onBusyChange={setApplicationItemsBusy}
                        onEditingChange={setApplicationItemsEditing}
                        onSelectedPackageChange={setSelectedPackageNumber}
                        focusedPackageNumber={focusedPackageNumber}
                        focusedPackageRequestId={focusedPackageRequestId}
                        focusScalesRequestId={shouldFocusScaleSection ? focusedPackageRequestId : 0}
                      />
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel
                  className={`application-detail-tab-panel detail-documents-tab-panel${
                    showsEmptyApplicationDocuments ? ' application-detail-tab-panel--empty' : ''
                  }`}
                >
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      {/* Figma shows the documents table on the page, with no card or title. */}
                      <RecordDocumentsSection
                        id="application-documents"
                        recordType="application"
                        rows={documentRows}
                        loading={documentLookupAvailability === 'loading'}
                        errorMessage={
                          documentLookupAvailability === 'unavailable'
                            ? documentsErrorMessage ||
                              'Document information could not be retrieved for this application.'
                            : ''
                        }
                        result={documentActionResult}
                        onDismissResult={clearActionResult}
                        notices={
                          selectedApplicationTab === 'documents' &&
                          showDocumentUploadUnavailableMessage &&
                          canUploadApplicationDocuments && (
                            <InlineNotification
                              className="detail-context-notification"
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
                          )
                        }
                        upload={{
                          enabled: canAddApplicationDocuments,
                          open: isEditingDocuments,
                          resetKey: documentUploadResetKey,
                          targetNumber: String(detail.applicationNumber ?? ''),
                          inputId: 'applicationDocumentUpload',
                          contentSelector: '.provincial-application-detail',
                          busy: documentUploadBusy,
                          onOpen: () => setIsEditingDocuments(true),
                          onClose: onCancelDocumentEditing,
                          onDirtyChange: setDocumentUploadDirty,
                          onBusyChange: setDocumentUploadBusy,
                          onUploadComplete: refreshApplicationDocuments,
                          onSaved: (savedCount) =>
                            setActionResult({
                              ...documentsSavedResult(savedCount),
                              source: 'documents',
                            }),
                        }}
                        onOpen={(row, preview) => void onOpenDocument(row, preview)}
                        canDelete={canDeleteDocuments}
                        removingId={isRemovingDocumentId}
                        onDeleteStart={clearActionResult}
                        onDelete={onRemoveDocument}
                      />
                    </Column>
                  </Grid>
                </TabPanel>
                {canViewRemarks && (
                  <TabPanel
                    className={`application-detail-tab-panel${
                      !hasApplicationRemarks ? ' application-detail-tab-panel--empty' : ''
                    }`}
                  >
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <section
                          id="application-remarks"
                          className="application-detail-section application-detail-remarks detail-remarks-section"
                          aria-label="Remarks"
                          inert={remarkDiscardConfirmationOpen ? true : undefined}
                          onKeyDownCapture={(event) => {
                            if (
                              isEditingRemarks &&
                              event.key === 'Escape' &&
                              !event.defaultPrevented
                            ) {
                              // Do not let the same Escape reach the newly opened discard dialog.
                              event.preventDefault()
                              event.stopPropagation()
                              onCancelRemarkEditing()
                            }
                          }}
                        >
                          {remarkActionResult && (
                            <ActionResultNotification
                              result={remarkActionResult}
                              onClose={() => setActionResult(null)}
                            />
                          )}
                          {hasApplicationRemarks && (
                            <div className="detail-section-card__header detail-section-card__header--actions-only">
                              {addApplicationRemarkButton}
                            </div>
                          )}
                          {!hasApplicationRemarks ? (
                            <EmptyState
                              title="No remarks for this application"
                              description="Only staff can see remarks. Remarks added on the Review tab also appear here."
                              icon={<AddDocument width={48} height={48} />}
                              action={addApplicationRemarkButton}
                              headingLevel={2}
                            />
                          ) : (
                            <>
                              <TableFrame ariaLabel="Application remarks">
                                <Table size="md" useZebraStyles>
                                  <TableHead>
                                    <TableRow>
                                      <TableHeader>Date and time</TableHeader>
                                      <TableHeader>User</TableHeader>
                                      <TableHeader>Remark</TableHeader>
                                      {canManageRemarks && <TableHeader>Actions</TableHeader>}
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {newestRemarksFirst(detail.remarks).map((item) => (
                                      <TableRow
                                        key={item.remarkId ?? `${item.title}-${item.remark}`}
                                      >
                                        <TableCell>
                                          {item.timestamp
                                            ? formatBusinessDateTimeLabel(item.timestamp)
                                            : displayValue(formatIsoDateLabel(item.date))}
                                        </TableCell>
                                        <TableCell>{displayValue(item.user)}</TableCell>
                                        <TableCell>{item.remark}</TableCell>
                                        {canManageRemarks && (
                                          <TableCell>
                                            <Button
                                              kind="ghost"
                                              size="md"
                                              renderIcon={Edit}
                                              disabled={
                                                !item.remarkId || isEditingRemarks || isSavingRemark
                                              }
                                              onClick={(event) => {
                                                remarkLauncherRef.current = event.currentTarget
                                                setEditingRemarkId(
                                                  item.remarkId ? String(item.remarkId) : null,
                                                )
                                                setRemarkBody(item.remark)
                                                setRemarkValidationMessage('')
                                                setIsEditingRemarks(true)
                                              }}
                                            >
                                              Edit
                                            </Button>
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </TableFrame>
                            </>
                          )}
                          {canManageRemarks && (
                            <DetailSidePanel
                              open={isEditingRemarks}
                              title={editingRemarkId ? 'Edit remark' : 'Add remark'}
                              contentSelector=".provincial-application-detail"
                              initialFocusSelector="#applicationRemarkBody"
                              launcherRef={remarkLauncherRef}
                              fallbackFocusSelector="#application-remarks .detail-remarks-add-button"
                              busy={isSavingRemark}
                              onClose={onCancelRemarkEditing}
                              actions={[
                                {
                                  label: 'Cancel',
                                  kind: 'tertiary',
                                  disabled: isSavingRemark,
                                  onClick: onCancelRemarkEditing,
                                },
                                {
                                  label: isSavingRemark
                                    ? 'Saving…'
                                    : editingRemarkId
                                      ? 'Update remark'
                                      : 'Save remark',
                                  kind: 'primary',
                                  disabled: isSavingRemark,
                                  renderIcon: isSavingRemark ? PendingIcon : undefined,
                                  onClick: () => void onSaveRemark(),
                                },
                              ]}
                            >
                              <RequiredFieldsLegend />
                              <TextArea
                                ref={remarkBodyRef}
                                id="applicationRemarkBody"
                                labelText={requiredLabel('Remark')}
                                aria-required="true"
                                rows={6}
                                enableCounter
                                maxCount={APPLICATION_REMARK_MAX_LENGTH}
                                maxLength={APPLICATION_REMARK_MAX_LENGTH}
                                value={remarkBody}
                                disabled={isSavingRemark}
                                invalid={!!remarkValidationMessage}
                                invalidText={remarkValidationMessage}
                                onChange={(event) => {
                                  setRemarkBody(event.target.value)
                                  if (remarkValidationMessage) {
                                    setRemarkValidationMessage('')
                                  }
                                }}
                              />
                              {actionErrorMessage && (
                                <AppNotification
                                  kind="error"
                                  title="Action failed"
                                  subtitle={actionErrorMessage}
                                  onCloseButtonClick={() =>
                                    setActionResult({ kind: 'error', message: '' })
                                  }
                                />
                              )}
                            </DetailSidePanel>
                          )}
                        </section>
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
                <TabPanel
                  className={`application-detail-tab-panel${
                    detail.offers.length === 0 ? ' application-detail-tab-panel--empty' : ''
                  }`}
                >
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      {applicationOffersContent}
                    </Column>
                  </Grid>
                </TabPanel>
                {canViewReview && (
                  <TabPanel
                    className={`application-detail-tab-panel${
                      isReviewNotStarted && !isEditingReview
                        ? ' application-detail-tab-panel--empty'
                        : ''
                    }`}
                  >
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
            confirmLabel="Save changes"
            pendingLabel={'Saving changes…'}
            onConfirmedChange={setSummaryAccuracyConfirmed}
            onConfirm={onConfirmSummaryAccuracy}
            onClose={closeSummaryAccuracyConfirmation}
            errorMessage={actionErrorMessage}
            warningMessage={pageActionResult?.volumeWarning ? pageActionResult.message : undefined}
            onError={() => undefined}
          />
        )}
      {remarkDiscardConfirmationOpen && (
        <ConfirmationModal
          open
          title="Discard changes?"
          description="Your changes will be lost."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          danger
          launcherButtonRef={remarkBodyRef}
          onConfirm={discardRemarkEditing}
          onClose={() => setRemarkDiscardConfirmationOpen(false)}
        />
      )}
      <UnsavedChangesGuard
        isDirty={isApplicationDirty}
        isBusy={
          isSavingSummary ||
          (summaryDirty && isSummaryClientLookupPendingForSource(activeSummarySaveSource)) ||
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
          summaryDirty && summaryOptionsUnavailableForSource(activeSummarySaveSource)
            ? 'Authoritative application options must load before summary changes can be saved.'
            : summaryDirty && isSummaryClientLookupPendingForSource(activeSummarySaveSource)
              ? 'Client details must finish loading before summary changes can be saved.'
              : reviewDirty &&
                  (reviewOptionsAvailability !== 'available' || reviewStatusOptions.length === 0)
                ? 'Authoritative review options must load before review changes can be saved.'
                : documentUploadDirty
                  ? 'Finish or reset the queued document uploads before leaving, or discard all changes.'
                  : applicationItemsDirty
                    ? 'Use the Scale tab to save or cancel package and scale drafts before leaving, or discard all changes.'
                    : undefined
        }
      />
    </Grid>
  )
}

export default ProvincialApplicationDetailsPage
