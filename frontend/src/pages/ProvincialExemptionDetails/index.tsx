import {
  RecordField,
  RecordFieldCell,
  RecordFieldGrid,
  RecordFieldRow,
} from '@/pages/shared/RecordFieldGrid'
import {
  isValidElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Add,
  Certificate,
  Currency,
  DocumentAttachment,
  Edit,
  Enterprise,
  Result,
  Rule,
  TrashCan,
  type CarbonIconType,
} from '@carbon/icons-react'
import { DocumentSecurity_02 } from '@carbon/pictograms-react'
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Loading,
  RadioButton,
  RadioButtonGroup,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ContentLoadingOverlay from '@/components/ContentLoadingOverlay'
import ConfirmationModal from '@/components/ConfirmationModal'
import Modal from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import DetailCardTitle from '@/components/DetailCardTitle'
import DetailLoadError from '@/components/DetailLoadError'
import DetailSidePanel from '@/components/DetailSidePanel'
import { useDiscardPrompt } from '@/components/DiscardChangesModal'
import DisabledButtonTooltip from '@/components/DisabledButtonTooltip'
import ExemptionApprovalModal, {
  type ExemptionApprovalOutcome,
} from '@/components/ExemptionApprovalModal'
import { exemptionApprovalResults } from '@/components/exemption-approval-results'
import PageHeader from '@/components/PageHeader'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { useAuth } from '@/context/auth/useAuth'
import { allowedRegions, withinRegions } from '@/context/auth/region-utils'
import { useAllowedRegionOptions } from '@/context/auth/useAllowedRegionOptions'
import { hasProvincialSubmitterRole, hasRole } from '@/context/auth/role-utils'
import { ActionResultNotification } from '../../components/ActionResultNotification'
import { AppNotification } from '../../components/AppNotification'
import RecordDocumentsSection, {
  DOCUMENT_DELETED_RESULT,
  documentsSavedResult,
} from '@/components/documents/RecordDocumentsSection'
import { useDocumentOpener } from '@/components/documents/useDocumentOpener'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import type { DetailField } from '../shared/DetailSections'
import { displayValue } from '@/pages/shared/detail-page-utils'
import { appendSearchParamsToPath } from '@/pages/shared/search-query-utils'
import {
  locationPath,
  landingPageReturnTo,
  readDetailReturnTo,
  withDetailReturnTo,
} from '@/pages/shared/detail-navigation'
import { useEditSections } from '@/pages/shared/useEditSections'
import { useFieldErrors, type FieldErrors } from '@/pages/shared/useFieldErrors'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { useReloadPreservedTab } from '@/pages/shared/useReloadPreservedTab'
import {
  fetchProvincialApplicationDetail,
  fetchProvincialExemptionDetail,
} from '@/service/lexis-detail-service'
import {
  fetchExemptionClientData,
  fetchExemptionClientLocations,
  type ApplicationClientData,
  type ApplicationClientLocation,
} from '@/service/application-client-lookup-service'
import {
  fetchExemptionDocuments,
  openExemptionDocument,
  removeExemptionDocument,
  type ProvincialExemptionDocumentRow,
} from '@/service/provincial-exemption-documents-service'
import { createPermitFromExemption } from '@/service/provincial-permit-documents-invoices-service'
import { withoutActionError, type ActionResult } from '@/utils/action-result'
import { getResponseStatus, isClientErrorResponse } from '@/utils/http-error'
import { sanitizeNotificationText } from '@/utils/notification-messages'
import { firstStringField, isRecord } from '@/utils/record'
import { displayValueText } from '@/utils/text'
import { displayVolume, formatVolumeInput } from '@/utils/volume'
import { triggerBrowserDownload } from '@/utils/download'
import IsoDatePicker from '../../components/IsoDatePicker'
import SearchableSelect from '../../components/SearchableSelect'
import RegionMultiSelect from '@/components/RegionMultiSelect'
import PendingIcon from '@/components/PendingIcon'
import { clientLocationLabel, isAgentApplicant } from '@/pages/shared/application-form-utils'
import {
  isoDateFieldError,
  normalizeProvincialApplicationNumber,
  provincialApplicationNumberFieldError,
} from '@/pages/shared/create-form-utils'
import {
  mapSelectedOptionsById,
  mapValueLabelOptionsToIdTextOptions,
  type IdTextOption,
} from '@/pages/shared/search-query-utils'
import {
  fetchProvincialExemptionOptions,
  type SearchOption,
} from '@/service/search-options-service'
import {
  addApplicationToExemption,
  approveExemptions,
  fetchExemptionApplications,
  fetchExemptionEditContext,
  fetchExemptionPermits,
  removeApplicationFromExemption,
  updateExemption,
  type ExemptionApplicationRow,
  type ExemptionEditContext,
  type ExemptionPermitRow,
} from '@/service/provincial-exemption-detail-service'
import { ReportRequestError, runReport } from '@/service/report-service'
import { requiredLabel } from '@/utils/required-label'
import { fieldErrorText } from '@/utils/field-error'
import './ProvincialExemptionDetails.scss'
import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'

type ExemptionActionResult = ActionResult & {
  source?: 'documents' | 'summary' | 'applications' | 'fees' | 'approval'
}

type ExemptionDetailTabKey =
  | 'owner'
  | 'agent'
  | 'summary'
  | 'applications'
  | 'permits'
  | 'fees'
  | 'documents'

const EXEMPTION_DETAIL_TAB_SLOTS: readonly ExemptionDetailTabKey[] = [
  'owner',
  'agent',
  'summary',
  'applications',
  'documents',
  'permits',
  'fees',
]

const EXEMPTION_DETAIL_TAB_LABELS: Record<ExemptionDetailTabKey, string> = {
  owner: 'Applicant',
  // Keep the old tab key for saved deep links; agent details now live in Applicant.
  agent: 'Agent',
  summary: 'Exemption details',
  applications: 'Applications',
  documents: 'Documents',
  permits: 'Permits',
  fees: 'Fees',
}

// Figma's Carbon icons for the exemption detail tabs.
const EXEMPTION_DETAIL_TAB_ICONS: Record<ExemptionDetailTabKey, CarbonIconType | undefined> = {
  owner: Enterprise,
  agent: undefined,
  summary: Rule,
  applications: Result,
  documents: DocumentAttachment,
  permits: Certificate,
  fees: Currency,
}

const ContiguousTabPanels = ({
  children,
  order,
}: {
  children: ReactNode
  order: readonly ExemptionDetailTabKey[]
}) => {
  const panels = (Array.isArray(children) ? children.flat() : [children]).filter(isValidElement)
  const panelsByTab = new Map(
    panels.filter((panel) => panel.key !== null).map((panel) => [String(panel.key), panel]),
  )
  return <TabPanels>{order.map((tab) => panelsByTab.get(tab))}</TabPanels>
}

type ExemptionEditForm = {
  exemptionNumber: string
  exemptionTypeCode: string
  exemptionStatusCode: string
  approvalDate: string
  expiryDate: string
  approvedVolume: string
  otherConditions: string
  enableRateOverride: boolean
  feeRate: string
  regionNumbers: string[]
}

type ExemptionEditField = keyof ExemptionEditForm

// Exemption details and Fees are edited one at a time, each with its own Save and Cancel.
type ExemptionEditSection = 'summary' | 'fees'

// The Fees section edits these fields; Exemption details edits the rest.
const sectionEditValues = (form: ExemptionEditForm, section: ExemptionEditSection) => {
  const { enableRateOverride, feeRate, ...summary } = form
  return section === 'fees' ? { enableRateOverride, feeRate } : summary
}

const ASCII_PATTERN = /^[\u0000-\u007f]*$/

const EMPTY_EDIT_CONTEXT: ExemptionEditContext = {
  rateOverrideEnabled: false,
  fixedFeeRate: '',
  regionNumbers: [],
  locked: false,
  lockMessage: '',
}

const toEditForm = (
  detail: ProvincialExemptionDetail,
  context: ExemptionEditContext,
): ExemptionEditForm => ({
  exemptionNumber: detail.exemptionNumber,
  exemptionTypeCode: detail.exemptionTypeCode ?? '',
  exemptionStatusCode: detail.exemptionStatusCode ?? '',
  approvalDate: detail.approvalDate ?? '',
  expiryDate: detail.expiryDate ?? '',
  approvedVolume: formatVolumeInput(detail.approvedVolume),
  otherConditions: detail.otherConditions ?? '',
  enableRateOverride: context.rateOverrideEnabled,
  feeRate: context.fixedFeeRate,
  regionNumbers: context.regionNumbers,
})

const exemptionTypeValue = (detail: ProvincialExemptionDetail) =>
  displayValue(detail.exemptionTypeDescription ?? detail.exemptionTypeCode)

const approvalDateValue = (detail: ProvincialExemptionDetail) =>
  detail.approvalDate ? detail.approvalDate : 'Not approved'

const feeRateFieldError = (value: string): string => {
  const normalized = value.trim()
  if (!normalized) return 'Fee rate is required.'
  const rate = Number(normalized)
  return !Number.isFinite(rate) ||
    rate <= 0 ||
    rate > 999.99 ||
    !/^\d{1,7}(\.\d{1,2})?$/.test(normalized)
    ? 'Fee rate must be greater than 0, at most 999.99, and have at most two decimal places.'
    : ''
}

const normalizeServerMessage = (message: string): string =>
  message
    .replace(/<\/?br\s*\/?\s*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const APPROVAL_FAILED_MESSAGE = 'The exemption could not be approved.'

// The create page hands over the number it saved so this page confirms that save once.
type ExemptionCreationNavigationState = Record<string, unknown> & {
  exemptionCreationNotice?: { exemptionNumber: string; applicationNumbers?: unknown }
}

const EXEMPTION_SAVED_RESULT: ActionResult = {
  kind: 'success',
  title: 'The exemption was saved.',
  message: '',
}

const listedNumbers = (numbers: string[]): string =>
  numbers.length > 1 ? `${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}` : numbers[0]

/** Figma: an exemption created from applications names them in its confirmation. */
const exemptionCreatedResult = (
  exemptionNumber: string,
  applicationNumbers: string[],
): ActionResult =>
  applicationNumbers.length > 0
    ? {
        kind: 'success',
        title: `Exemption ${exemptionNumber} created.`,
        message: `Details were filled in from ${
          applicationNumbers.length === 1 ? 'application' : 'applications'
        } ${listedNumbers(applicationNumbers)}.`,
      }
    : EXEMPTION_SAVED_RESULT

const responseServerMessage = (error: unknown): string => {
  const data = isRecord(error) && isRecord(error.response) ? error.response.data : undefined
  return isRecord(data) ? firstStringField(data, ['detail', 'message']) : ''
}

const approvalRequestFailureMessage = (error: unknown): string => {
  const status = getResponseStatus(error)
  if (status === 409 || status === 428) {
    return 'This exemption changed after you opened it. Reload the page to see its current status before approving it.'
  }
  return (
    sanitizeNotificationText(
      normalizeServerMessage(responseServerMessage(error)),
      APPROVAL_FAILED_MESSAGE,
    ) || APPROVAL_FAILED_MESSAGE
  )
}

type AddApplicationFailure =
  | 'notFound'
  | 'notApproved'
  | 'differentClient'
  | 'alreadyAssigned'
  | 'alreadyOnThisExemption'
  | 'advertised'
  | 'forbidden'
  | 'unconfirmed'
  | 'other'

// The add-application route is shared with the legacy RPC route, so its messages are mapped here.
const addApplicationFailureKind = (message: string): AddApplicationFailure => {
  if (/does not exist/i.test(message)) return 'notFound'
  if (/status of approved/i.test(message)) return 'notApproved'
  if (/client details do not match/i.test(message)) return 'differentClient'
  if (/already assigned to (?:an )?exemption/i.test(message)) return 'alreadyAssigned'
  if (/listing date has not passed|valid offers?\b/i.test(message)) return 'advertised'
  return 'other'
}

const addApplicationFailureMessage = (
  kind: AddApplicationFailure,
  applicationNumber: string,
  clientNumber: string,
  assignedExemptionNumber: string,
  serverMessage = '',
): string => {
  switch (kind) {
    case 'notFound':
      return `No application found with number ${applicationNumber}. Check the number and try again.`
    case 'notApproved':
      return `Application ${applicationNumber} is not approved. Only approved applications can be added.`
    case 'differentClient':
      if (!clientNumber) break
      return `Application ${applicationNumber} belongs to a different client. This exemption only includes applications from client ${clientNumber}.`
    case 'alreadyAssigned':
      if (!assignedExemptionNumber) break
      return `Application ${applicationNumber} is already on exemption ${assignedExemptionNumber}.`
    case 'alreadyOnThisExemption':
      return `Application ${applicationNumber} is already on this exemption.`
    case 'advertised':
      return `Application ${applicationNumber} can't be added while it's being advertised or has a valid offer.`
    case 'forbidden':
      // Regional access applies to the application as well as the exemption.
      return `You do not have permission to add application ${applicationNumber} to this exemption.`
    case 'unconfirmed':
      return `Adding application ${applicationNumber} could not be confirmed. Check the Applications list before trying again.`
    case 'other': {
      const reason = sanitizeNotificationText(normalizeServerMessage(serverMessage), '')
      if (reason) return `Application ${applicationNumber} can't be added. ${reason}`
    }
  }
  return clientNumber
    ? `Application ${applicationNumber} can't be added. Check that it's approved, belongs to client ${clientNumber} and isn't on another exemption.`
    : `Application ${applicationNumber} can't be added. Check that it's approved and isn't on another exemption.`
}

// The link response does not name the exemption an application is already on.
const findAssignedExemptionNumber = async (applicationNumber: string): Promise<string> => {
  try {
    return (
      (await fetchProvincialApplicationDetail(applicationNumber))?.exemptionNumber?.trim() ?? ''
    )
  } catch (error) {
    console.error(error)
    return ''
  }
}

const formatExemptionVolume = displayVolume

const applicantTypeLabel = (value: string): string => {
  switch (value.trim().toUpperCase()) {
    case 'A':
      return 'Agent'
    case 'M':
      return 'Ministerial'
    case 'O':
      return 'Owner'
    default:
      return value
  }
}

type ExemptionClient = {
  title: string
  clientNumber: string
  applicantType: string
  locationCode: string
  contactName: string
  companyName: string
  locations: ApplicationClientLocation[]
  clientData: ApplicationClientData | null
  isLoading: boolean
}

const exemptionClientFields = ({
  clientNumber,
  applicantType,
  locationCode,
  contactName,
  companyName,
  locations,
  clientData,
  isLoading,
}: ExemptionClient): DetailField[] => {
  const locationName =
    locations.find((location) => location.locationCode === locationCode)?.locationName ?? ''
  const loadingValue = (value: string | null | undefined) =>
    isLoading ? 'Loading…' : displayValue(value)

  const company = companyName || clientData?.companyName || ''
  const acronym = clientData?.clientAcronym?.trim()
  const identity = [company && `${company}${acronym ? ` (${acronym})` : ''}`, clientNumber]
    .filter(Boolean)
    .join(' · ')
  return [
    { label: 'Contact name', value: loadingValue(contactName) },
    { label: 'Applicant type', value: loadingValue(applicantTypeLabel(applicantType)) },
    { label: 'Client', value: loadingValue(identity), span: 'wide' as const },
    {
      label: 'Client location',
      value: loadingValue(
        clientLocationLabel(locationCode, locationName, clientData?.locationName ?? ''),
      ),
      span: 'wide' as const,
    },
    { label: 'Address', value: loadingValue(clientData?.address), span: 'wide' as const },
    { label: 'City', value: loadingValue(clientData?.city) },
    { label: 'Province', value: loadingValue(clientData?.province) },
    { label: 'Country', value: loadingValue(clientData?.country) },
    { label: 'Postal code', value: loadingValue(clientData?.postalCode) },
    { label: 'Phone number', value: loadingValue(clientData?.phone) },
    { label: 'Fax number', value: loadingValue(clientData?.fax) },
    { label: 'Email address', value: loadingValue(clientData?.email) },
  ]
}

// The agent is a section of the applicant card, as on the application page, not a second card.
const ExemptionClientFields = (client: ExemptionClient) => {
  const fields = exemptionClientFields(client)
  return (
    <RecordFieldGrid>
      <RecordFieldRow>
        {fields.slice(0, 2).map((field: DetailField) => (
          <RecordField
            key={field.label}
            label={field.label}
            value={field.value}
            span={field.span}
          />
        ))}
      </RecordFieldRow>
      <RecordFieldRow>
        {fields.slice(2, 4).map((field: DetailField) => (
          <RecordField
            key={field.label}
            label={field.label}
            value={field.value}
            span={field.span}
          />
        ))}
      </RecordFieldRow>
      <RecordFieldRow>
        {fields.slice(4, 9).map((field: DetailField) => (
          <RecordField
            key={field.label}
            label={field.label}
            value={field.value}
            span={field.span}
          />
        ))}
      </RecordFieldRow>
      <RecordFieldRow>
        {fields.slice(9).map((field: DetailField) => (
          <RecordField
            key={field.label}
            label={field.label}
            value={field.value}
            span={field.span}
          />
        ))}
      </RecordFieldRow>
    </RecordFieldGrid>
  )
}

const ExemptionClientTile = ({
  agent,
  ...client
}: ExemptionClient & { agent?: ExemptionClient }) => (
  <Tile className="detail-section-card exemption-client-card">
    <DetailCardTitle icon={Enterprise}>{client.title}</DetailCardTitle>
    <ExemptionClientFields {...client} />
    {agent && (
      <section className="detail-subsection" aria-label={agent.title}>
        <h3 className="detail-section-subtitle">{agent.title}</h3>
        <ExemptionClientFields {...agent} />
      </section>
    )}
  </Tile>
)

const ProvincialExemptionDetailsPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { capabilities, canPerform, defaultRoute } = useAuth()
  const { exemptionNumber } = useParams()
  const [searchParams] = useSearchParams()
  const detailReturnTo = useMemo(() => {
    const contextualReturnTo = readDetailReturnTo(location.state)
    if (contextualReturnTo) {
      return contextualReturnTo
    }

    return canPerform('/exemptionSearch')
      ? { label: 'Exemption search', to: '/provincial/exemption' }
      : landingPageReturnTo(defaultRoute)
  }, [canPerform, defaultRoute, location.state])
  const [detail, setDetail] = useState<ProvincialExemptionDetail | null>(null)
  const detailRef = useRef<ProvincialExemptionDetail | null>(null)
  const [ownerClientData, setOwnerClientData] = useState<ApplicationClientData | null>(null)
  const [agentClientData, setAgentClientData] = useState<ApplicationClientData | null>(null)
  const [ownerClientLocations, setOwnerClientLocations] = useState<ApplicationClientLocation[]>([])
  const [agentClientLocations, setAgentClientLocations] = useState<ApplicationClientLocation[]>([])
  const [clientContextLoading, setClientContextLoading] = useState(false)
  const [clientContextErrorMessage, setClientContextErrorMessage] = useState('')
  const [documentRows, setDocumentRows] = useState<ProvincialExemptionDocumentRow[]>([])
  const [applications, setApplications] = useState<ExemptionApplicationRow[]>([])
  const [exemptionHolder, setExemptionHolder] = useState('')
  const [permitRows, setPermitRows] = useState<ExemptionPermitRow[]>([])
  const [permitsLoaded, setPermitsLoaded] = useState(false)
  const [containsUnmanu, setContainsUnmanu] = useState<boolean | null>(null)
  const [editContext, setEditContext] = useState<ExemptionEditContext>(EMPTY_EDIT_CONTEXT)
  const [editContextLoaded, setEditContextLoaded] = useState(false)
  const [editContextRefreshing, setEditContextRefreshing] = useState(false)
  const [editForm, setEditForm] = useState<ExemptionEditForm | null>(null)
  const { fieldErrors, clearFieldError, resetFieldErrors, showFieldErrors } =
    useFieldErrors<ExemptionEditField>()
  const [saveAttempted, setSaveAttempted] = useState(false)
  const previousEditFormRef = useRef(editForm)
  useEffect(() => {
    // A field's error clears once the user changes that field.
    const previous = previousEditFormRef.current
    previousEditFormRef.current = editForm
    if (!previous || !editForm) return
    for (const field of Object.keys(editForm) as ExemptionEditField[]) {
      if (!formValuesEqual(previous[field], editForm[field])) clearFieldError(field)
    }
  }, [clearFieldError, editForm])
  const [allRegionOptions, setAllRegionOptions] = useState<IdTextOption[]>([])
  const regionOptions = useAllowedRegionOptions(
    allRegionOptions,
    ['saveExemption', 'approveExemption'],
    'id',
  )
  const [exemptionTypeOptions, setExemptionTypeOptions] = useState<SearchOption[]>([])
  const [exemptionStatusOptions, setExemptionStatusOptions] = useState<SearchOption[]>([])
  const [optionsAvailability, setOptionsAvailability] = useState<
    'loading' | 'available' | 'unavailable'
  >('loading')
  const [editingSection, setEditingSection] = useState<ExemptionEditSection | null>(null)
  const editing = editingSection !== null
  const [saving, setSaving] = useState(false)
  const [renamedExemptionNumber, setRenamedExemptionNumber] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [approvalConfirmationOpen, setApprovalConfirmationOpen] = useState(false)
  const [approvalConfirmationTarget, setApprovalConfirmationTarget] = useState<string | null>(null)
  const approvalTargetRef = useRef<string | null>(null)
  const [approvalDialogBusy, setApprovalDialogBusy] = useState(false)
  const [permitCreationConfirmationOpen, setPermitCreationConfirmationOpen] = useState(false)
  const [creatingPermit, setCreatingPermit] = useState(false)
  const [permitCreationDestination, setPermitCreationDestination] = useState<string | null>(null)
  const [createdMinisterialPermit, setCreatedMinisterialPermit] = useState(false)
  const [permitCreationRequiresReload, setPermitCreationRequiresReload] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [applicationNumberToAdd, setApplicationNumberToAdd] = useState('')
  // The number checked by the last Save click; its error shows until the number changes.
  const [checkedApplicationNumber, setCheckedApplicationNumber] = useState<string | null>(null)
  const [addApplicationError, setAddApplicationError] = useState('')
  const [isAddingApplication, setIsAddingApplication] = useState(false)
  const addApplicationButtonRef = useRef<HTMLButtonElement>(null)
  const addApplicationInputRef = useRef<HTMLInputElement>(null)
  const tabsColumnRef = useRef<HTMLDivElement>(null)
  const [applicationMutationNumber, setApplicationMutationNumber] = useState<string | null>(null)
  const [applicationPendingRemoval, setApplicationPendingRemoval] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [applicationsErrorMessage, setApplicationsErrorMessage] = useState('')
  const [permitsErrorMessage, setPermitsErrorMessage] = useState('')
  const [actionResult, setActionResult] = useState<ExemptionActionResult | null>(null)
  const documentActionResult = actionResult?.source === 'documents' ? actionResult : null
  const pageActionResult =
    actionResult?.source && actionResult.source !== 'approval' ? null : actionResult
  const approvalResultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (actionResult?.source !== 'approval') return
    const frame = requestAnimationFrame(() => approvalResultRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [actionResult])
  const navigationState = location.state as ExemptionCreationNavigationState | null
  const createdExemptionNumber = navigationState?.exemptionCreationNotice?.exemptionNumber ?? ''
  // Read by the first load, which otherwise clears page results before showing the record.
  const createdExemptionNumberRef = useRef(createdExemptionNumber)
  const createdFromApplicationNumbersRef = useRef<string[]>(
    (() => {
      const numbers = navigationState?.exemptionCreationNotice?.applicationNumbers
      return Array.isArray(numbers)
        ? numbers.filter((number): number is string => typeof number === 'string' && !!number)
        : []
    })(),
  )
  const actionErrorMessage = actionResult?.kind === 'error' ? actionResult.message : ''
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [isAddingDocuments, setIsAddingDocuments] = useState(false)
  const [documentUploadDirty, setDocumentUploadDirty] = useState(false)
  const [documentUploadBusy, setDocumentUploadBusy] = useState(false)
  const [documentUploadResetKey, setDocumentUploadResetKey] = useState(0)
  const [selectedExemptionTab, selectExemptionTab] = useReloadPreservedTab({
    tabs: EXEMPTION_DETAIL_TAB_SLOTS,
    defaultTab: 'owner',
  })
  const beginDetailRequest = useLatestRequestGuard()
  const currentDetail = detail && String(detail.exemptionNumber) === exemptionNumber ? detail : null
  // Pages opened from this one name it by its title in their back link or breadcrumb.
  const exemptionPageTitle =
    `Exemption ${currentDetail?.exemptionNumber ?? exemptionNumber ?? ''}`.trim()
  const clientContextApplication = applications[0] ?? null
  const clientContextHasAgent = isAgentApplicant(clientContextApplication?.applicantTypeCode ?? '')
  const linkedApplicationNumber = clientContextApplication?.applicationNumber.trim() ?? ''
  const exemptionOwnerClientNumber = clientContextApplication?.ownerClientNumber.trim() ?? ''
  const exemptionClientNumber = detail?.ownerClientNumber?.trim() || exemptionOwnerClientNumber
  const exemptionAgentClientNumber = clientContextApplication?.agentClientNumber.trim() ?? ''
  const ownerClientLocationCode = clientContextApplication?.ownerClientLocationCode.trim() ?? ''
  const agentClientLocationCode = clientContextApplication?.agentClientLocationCode.trim() ?? ''
  const isRefreshingDetail = loading && !!currentDetail
  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
  )

  useEffect(() => {
    if (creatingPermit || !permitCreationDestination) return

    const destination = withCurrentSearch(permitCreationDestination)
    navigate(destination, {
      state: {
        ...withDetailReturnTo(
          location.state,
          {
            label: exemptionPageTitle,
            to: locationPath(location),
          },
          detailReturnTo,
        ),
        permitCreated: createdMinisterialPermit,
      },
    })
  }, [
    creatingPermit,
    createdMinisterialPermit,
    detailReturnTo,
    exemptionPageTitle,
    location,
    navigate,
    permitCreationDestination,
    withCurrentSearch,
  ])

  useEffect(() => {
    detailRef.current = detail
  }, [detail])

  useEffect(() => {
    if (saving || !renamedExemptionNumber || renamedExemptionNumber === exemptionNumber) return

    navigate(
      withCurrentSearch(`/provincial/exemption/${encodeURIComponent(renamedExemptionNumber)}`),
      {
        replace: true,
        state: location.state,
      },
    )
  }, [exemptionNumber, location.state, navigate, renamedExemptionNumber, saving, withCurrentSearch])

  useEffect(() => {
    if (!createdExemptionNumber) return

    // Drop the one-time notice from history so a reload or Back does not confirm the save again.
    const nextNavigationState = { ...(navigationState ?? {}) }
    delete nextNavigationState.exemptionCreationNotice
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      {
        replace: true,
        state: Object.keys(nextNavigationState).length > 0 ? nextNavigationState : null,
      },
    )
  }, [
    createdExemptionNumber,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    navigationState,
  ])

  useEffect(() => {
    let isActive = true

    const clearClientContext = () => {
      setOwnerClientData(null)
      setAgentClientData(null)
      setOwnerClientLocations([])
      setAgentClientLocations([])
      setClientContextErrorMessage('')
      setClientContextLoading(false)
    }

    if (!clientContextApplication || !linkedApplicationNumber) {
      void Promise.resolve().then(() => {
        if (isActive) {
          clearClientContext()
        }
      })
      return () => {
        isActive = false
      }
    }

    const loadClientContext = async () => {
      setClientContextLoading(true)
      setClientContextErrorMessage('')

      try {
        const [nextOwnerData, nextAgentData, nextOwnerLocations, nextAgentLocations] =
          await Promise.all([
            exemptionOwnerClientNumber && ownerClientLocationCode
              ? fetchExemptionClientData(exemptionOwnerClientNumber, ownerClientLocationCode)
              : Promise.resolve(null),
            clientContextHasAgent && exemptionAgentClientNumber && agentClientLocationCode
              ? fetchExemptionClientData(exemptionAgentClientNumber, agentClientLocationCode)
              : Promise.resolve(null),
            exemptionOwnerClientNumber
              ? fetchExemptionClientLocations(exemptionOwnerClientNumber)
              : Promise.resolve([]),
            clientContextHasAgent && exemptionAgentClientNumber
              ? fetchExemptionClientLocations(exemptionAgentClientNumber)
              : Promise.resolve([]),
          ])

        if (!isActive) return
        setOwnerClientData(nextOwnerData)
        setAgentClientData(nextAgentData)
        setOwnerClientLocations(nextOwnerLocations)
        setAgentClientLocations(nextAgentLocations)
      } catch (error) {
        if (!isActive) return
        console.error(error)
        setOwnerClientData(null)
        setAgentClientData(null)
        setOwnerClientLocations([])
        setAgentClientLocations([])
        setClientContextErrorMessage(
          'Applicant and agent details could not be retrieved from the linked application.',
        )
      } finally {
        if (isActive) {
          setClientContextLoading(false)
        }
      }
    }

    void loadClientContext()

    return () => {
      isActive = false
    }
  }, [
    agentClientLocationCode,
    clientContextApplication,
    clientContextHasAgent,
    exemptionAgentClientNumber,
    exemptionOwnerClientNumber,
    linkedApplicationNumber,
    ownerClientLocationCode,
  ])

  useEffect(() => {
    const load = async () => {
      const isLatestRequest = beginDetailRequest()
      setPermitsLoaded(false)
      setRenamedExemptionNumber(null)
      const isRefreshingCurrentExemption =
        detailRef.current !== null && String(detailRef.current.exemptionNumber) === exemptionNumber
      if (!isRefreshingCurrentExemption) {
        approvalTargetRef.current = null
        setApprovalConfirmationOpen(false)
        setApprovalConfirmationTarget(null)
        setPermitCreationConfirmationOpen(false)
        setCreatingPermit(false)
        setPermitCreationDestination(null)
        setCreatedMinisterialPermit(false)
        setPermitCreationRequiresReload(false)
        setApplicationNumberToAdd('')
        setAddApplicationError('')
        setIsAddingApplication(false)
        setApplicationMutationNumber(null)
      }
      if (!exemptionNumber) {
        setErrorMessage('Exemption number is missing from the route.')
        setDetail(null)
        setDocumentRows([])
        setApplications([])
        setExemptionHolder('')
        setPermitRows([])
        setContainsUnmanu(null)
        setEditContext(EMPTY_EDIT_CONTEXT)
        setEditContextLoaded(false)
        setEditContextRefreshing(false)
        setEditForm(null)
        setIsAddingDocuments(false)
        setDocumentsErrorMessage('')
        setApplicationsErrorMessage('')
        setPermitsErrorMessage('')
        setActionResult(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      setDocumentsErrorMessage('')
      setApplicationsErrorMessage('')
      setPermitsErrorMessage('')
      const showCreationNotice = createdExemptionNumberRef.current === exemptionNumber
      if (!showCreationNotice) createdExemptionNumberRef.current = ''
      setActionResult(
        showCreationNotice
          ? exemptionCreatedResult(exemptionNumber, createdFromApplicationNumbersRef.current)
          : null,
      )
      if (!isRefreshingCurrentExemption) {
        setEditingSection(null)
        setIsAddingDocuments(false)
        setApplications([])
        setExemptionHolder('')
        setPermitRows([])
        setContainsUnmanu(null)
        setEditContext(EMPTY_EDIT_CONTEXT)
        setEditContextLoaded(false)
        setEditContextRefreshing(false)
        setEditForm(null)
      }

      try {
        const response = await fetchProvincialExemptionDetail(exemptionNumber)
        if (!isLatestRequest()) {
          return
        }
        setDetail(response)
        if (!response) {
          setErrorMessage(`No provincial exemption found for ${exemptionNumber}.`)
          setDocumentRows([])
          setApplications([])
          setExemptionHolder('')
          setPermitRows([])
          setContainsUnmanu(null)
          setEditContext(EMPTY_EDIT_CONTEXT)
          setEditContextLoaded(false)
          setEditForm(null)
          setApplicationsErrorMessage('')
          setPermitsErrorMessage('')
          return
        }

        const [documentsResult, applicationsResult, editContextResult, permitsResult] =
          await Promise.allSettled([
            fetchExemptionDocuments(exemptionNumber),
            fetchExemptionApplications(exemptionNumber),
            fetchExemptionEditContext(exemptionNumber),
            fetchExemptionPermits(exemptionNumber),
          ])
        if (!isLatestRequest()) {
          return
        }

        if (documentsResult.status === 'fulfilled') {
          setDocumentRows(documentsResult.value.rows)
        } else {
          console.error(documentsResult.reason)
          setDocumentRows([])
          setDocumentsErrorMessage('Unable to retrieve exemption documents.')
        }

        if (applicationsResult.status === 'fulfilled') {
          setApplications(applicationsResult.value.applications)
          setExemptionHolder(applicationsResult.value.ownerNumber)
          setContainsUnmanu(applicationsResult.value.containsUnmanu)
          setApplicationsErrorMessage('')
        } else {
          console.error(applicationsResult.reason)
          setApplications([])
          setExemptionHolder('')
          setContainsUnmanu(null)
          setApplicationsErrorMessage(
            'Unable to retrieve applications associated with this exemption.',
          )
        }

        if (editContextResult.status === 'fulfilled') {
          setEditContext(editContextResult.value)
          setEditContextLoaded(true)
          setEditForm(toEditForm(response, editContextResult.value))
        } else {
          console.error(editContextResult.reason)
          setEditContext(EMPTY_EDIT_CONTEXT)
          setEditContextLoaded(false)
          setEditForm(null)
        }

        if (permitsResult.status === 'fulfilled') {
          setPermitRows(permitsResult.value)
          setPermitsLoaded(true)
          setPermitsErrorMessage('')
        } else {
          console.error(permitsResult.reason)
          setPermitRows([])
          setPermitsErrorMessage('Unable to retrieve permits associated with this exemption.')
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve provincial exemption detail.')
          if (!isRefreshingCurrentExemption) {
            setDocumentRows([])
            setApplications([])
            setExemptionHolder('')
            setPermitRows([])
            setContainsUnmanu(null)
            setEditContext(EMPTY_EDIT_CONTEXT)
            setEditContextLoaded(false)
            setEditForm(null)
            setDocumentsErrorMessage('')
            setApplicationsErrorMessage('')
            setPermitsErrorMessage('')
          }
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    }

    void load()
  }, [exemptionNumber, beginDetailRequest])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const options = await fetchProvincialExemptionOptions()
        setExemptionTypeOptions(options.exemptionTypes)
        setExemptionStatusOptions(options.exemptionStatuses)
        setAllRegionOptions(mapValueLabelOptionsToIdTextOptions(options.regions))
        setOptionsAvailability('available')
      } catch {
        setOptionsAvailability('unavailable')
      }
    }

    void loadOptions()
  }, [])

  const visiblePermitRows = useMemo(
    () => permitRows.filter((row) => row.canViewPermit),
    [permitRows],
  )

  const requestedApplicationVolume = useMemo(
    () =>
      applications.reduce((total, application) => {
        const requestedVolume = Number(application.requestedVolume)
        return Number.isFinite(requestedVolume) ? total + requestedVolume : total
      }, 0),
    [applications],
  )

  const currentTypeCode = (
    editForm?.exemptionTypeCode ||
    currentDetail?.exemptionTypeCode ||
    ''
  ).toUpperCase()
  const persistedTypeCode = (currentDetail?.exemptionTypeCode ?? '').toUpperCase()
  const persistedStatusCode = (currentDetail?.exemptionStatusCode ?? '').toUpperCase()
  const roles = capabilities?.roles ?? []
  const isApplicationApprover = hasRole(roles, 'APPLICATION_APPROVER') || hasRole(roles, 'ADMIN')
  const isProvincialSubmitter = hasProvincialSubmitterRole(roles)
  const exemptionEditLocked = editContext.locked
  const exemptionEditLockMessage = exemptionEditLocked
    ? editContext.lockMessage || 'This exemption is currently locked for editing by another user.'
    : ''
  // Regional users change or approve an exemption only when they hold all of its regions, and
  // create permits from it when they hold one of them (the permit's own region is checked too).
  // Its regions include those of its linked applications, which are usually a Ministerial
  // exemption's only ones; the stored regionNumbers stay for the Blanket OIC region field.
  const exemptionOrgUnits = editContext.accessRegionNumbers ?? editContext.regionNumbers
  // Linking applications and deleting documents are Application Approver capabilities, limited to
  // the Approver grants' regions even when another role holds saveExemption province-wide. Among
  // staff roles only Approvers and Administrators hold /createExemption, so its regions are theirs.
  const withinApproverRegions = withinRegions(
    allowedRegions(capabilities, '/createExemption'),
    exemptionOrgUnits,
  )
  const canPerformInAnyExemptionRegion = (action: string) =>
    // A null record region passes only for province-wide users.
    canPerform(action, null) || exemptionOrgUnits.some((orgUnit) => canPerform(action, orgUnit))
  const hasExemptionEditRole = canPerform('saveExemption') && persistedStatusCode !== 'EXP'
  const hasExemptionEditPermission =
    hasExemptionEditRole && canPerform('saveExemption', exemptionOrgUnits)
  const canSaveExemption = hasExemptionEditPermission && editContextLoaded && !exemptionEditLocked
  const isExemptionFormDirty = useMemo(
    () =>
      !!editingSection &&
      !!currentDetail &&
      !!editForm &&
      !formValuesEqual(
        sectionEditValues(editForm, editingSection),
        sectionEditValues(toEditForm(currentDetail, editContext), editingSection),
      ),
    [currentDetail, editContext, editForm, editingSection],
  )
  const applicationRelationshipDraftDirty =
    isApplicationApprover && applicationNumberToAdd.trim().length > 0
  const isExemptionDirty =
    isExemptionFormDirty || applicationRelationshipDraftDirty || documentUploadDirty
  const isExemptionBusy =
    saving ||
    approving ||
    approvalDialogBusy ||
    creatingPermit ||
    applicationMutationNumber !== null ||
    isRemovingDocumentId !== null ||
    documentUploadBusy
  const onDiscardExemptionChanges = useCallback(() => {
    if (detail) {
      setEditForm(toEditForm(detail, editContext))
    }
    setEditingSection(null)
    setIsAddingApplication(false)
    setIsAddingDocuments(false)
    setActionResult(withoutActionError)
    setDocumentUploadDirty(false)
    setDocumentUploadBusy(false)
    setDocumentUploadResetKey((current) => current + 1)
    setApplicationNumberToAdd('')
    setAddApplicationError('')
    resetFieldErrors()
  }, [detail, editContext, resetFieldErrors])

  const sections = useEditSections<ExemptionEditSection>({
    isDirty: isExemptionFormDirty,
    onDiscard: () => {
      if (currentDetail) setEditForm(toEditForm(currentDetail, editContext))
      resetFieldErrors()
    },
    state: [editingSection, setEditingSection],
    leaveGuard: {
      isDirty: isExemptionDirty,
      isBusy: isExemptionBusy,
      onDiscard: () => {
        if (
          isAddingApplication ||
          applicationRelationshipDraftDirty ||
          isAddingDocuments ||
          documentUploadDirty
        )
          onDiscardExemptionChanges()
      },
    },
  })
  const {
    confirmDiscard: confirmApplicationDraftDiscard,
    discardModal: applicationDraftDiscardModal,
  } = useDiscardPrompt(applicationRelationshipDraftDirty)
  const { confirmDiscard: confirmPermitCreationDiscard, discardModal: permitCreationDiscardModal } =
    useDiscardPrompt(isExemptionDirty)
  // The regions come from the edit context, so its failure is reported by role alone.
  const editContextUnavailableMessage =
    hasExemptionEditRole && !editContextLoaded && !editContextRefreshing && !isRefreshingDetail
      ? 'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.'
      : ''
  // INTENTIONAL_LEGACY_DIVERGENCE(EXEMPTION_APPROVAL_MINISTERIAL_ONLY)
  // Figma's approval flows are for Ministerial exemptions only.
  const canApproveExemption =
    canPerform('approveExemption', exemptionOrgUnits) &&
    persistedTypeCode === 'M' &&
    persistedStatusCode === 'NEW' &&
    !editing &&
    !isExemptionDirty &&
    !isAddingApplication &&
    !isAddingDocuments &&
    !saving &&
    !applicationMutationNumber &&
    !documentUploadBusy &&
    !isRemovingDocumentId &&
    !exemptionEditLocked
  const canStartApplicationBackedPermitCreation =
    canPerformInAnyExemptionRegion('createPermit') &&
    (isApplicationApprover || isProvincialSubmitter) &&
    (persistedTypeCode === 'M' || persistedTypeCode === 'O') &&
    persistedStatusCode === 'ACT' &&
    editContextLoaded &&
    !exemptionEditLocked &&
    !permitCreationRequiresReload
  const canCreateApplicationBackedPermit =
    canStartApplicationBackedPermitCreation && !editing && !isExemptionDirty
  const canStartBlanketOicPermitCreation =
    canPerformInAnyExemptionRegion('createPermit') &&
    canPerformInAnyExemptionRegion('savePermit') &&
    (isApplicationApprover || isProvincialSubmitter) &&
    persistedTypeCode === 'B' &&
    persistedStatusCode === 'ACT' &&
    editContextLoaded &&
    !exemptionEditLocked &&
    !permitCreationRequiresReload
  const showPermitCreationConfirmation =
    permitCreationConfirmationOpen &&
    (canCreateApplicationBackedPermit || canStartBlanketOicPermitCreation)

  const permitCreationActionBusy =
    creatingPermit ||
    saving ||
    applicationMutationNumber !== null ||
    isRemovingDocumentId !== null ||
    documentUploadBusy
  // Only users who can remove linked applications get the Actions column.
  const canManageApplicationLinks =
    isApplicationApprover &&
    withinApproverRegions &&
    hasExemptionEditPermission &&
    persistedTypeCode !== 'B' &&
    persistedStatusCode !== 'CAN'
  const canLinkApplications =
    canManageApplicationLinks &&
    canSaveExemption &&
    !applicationsErrorMessage &&
    !editing &&
    !isExemptionFormDirty &&
    !documentUploadDirty
  const applicationNumberToAddError =
    checkedApplicationNumber === applicationNumberToAdd
      ? (fieldErrorText(
          provincialApplicationNumberFieldError(applicationNumberToAdd, 'Application number', true),
        ) ?? '')
      : ''
  const cancelledBlanketOic = persistedTypeCode === 'B' && persistedStatusCode === 'CAN'
  const cancelledExemption = persistedStatusCode === 'CAN'
  const approvalDateRequired =
    !cancelledExemption && (currentTypeCode === 'O' || currentTypeCode === 'B')
  const expiryDateRequired = !cancelledExemption
  const canEditExemptionFields = canSaveExemption && !cancelledBlanketOic && !cancelledExemption
  const canEditSummaryFields = editingSection === 'summary' && canEditExemptionFields
  const isExemptionNumberChanged =
    canEditSummaryFields &&
    currentTypeCode === 'O' &&
    editForm?.exemptionNumber.trim() !== currentDetail?.exemptionNumber
  const canEditStatus = editingSection === 'summary' && canSaveExemption
  const canEditExemptionType =
    optionsAvailability === 'available' &&
    exemptionTypeOptions.length > 0 &&
    persistedTypeCode !== 'B' &&
    persistedTypeCode !== 'O'
  const canEditApprovalDate =
    canEditSummaryFields &&
    (currentTypeCode === 'O' ||
      (currentTypeCode === 'B' && !['ACT', 'CAN', 'EXP'].includes(persistedStatusCode)))
  const canEditExpiryDate =
    canEditSummaryFields &&
    (currentTypeCode === 'B'
      ? ['NEW', 'ACT'].includes(persistedStatusCode)
      : persistedStatusCode === 'NEW')
  const canEditApprovedVolume = canEditSummaryFields && persistedStatusCode !== 'ACT'
  const showApplications = currentTypeCode !== 'B'
  // Legacy exemption details omit client tabs for OIC and Blanket OIC records.
  const showClientTabs = currentTypeCode !== 'O' && currentTypeCode !== 'B'
  const showOwner = showClientTabs && Boolean(linkedApplicationNumber && exemptionOwnerClientNumber)
  const showAgent =
    showClientTabs &&
    clientContextHasAgent &&
    Boolean(linkedApplicationNumber && exemptionAgentClientNumber)
  const ownerClient: ExemptionClient = {
    title: 'Applicant details',
    clientNumber: exemptionOwnerClientNumber,
    applicantType: clientContextApplication?.applicantTypeCode ?? '',
    locationCode: ownerClientLocationCode,
    contactName: clientContextApplication?.ownerContactName ?? '',
    companyName: clientContextApplication?.ownerCompanyName ?? '',
    locations: ownerClientLocations,
    clientData: ownerClientData,
    isLoading: clientContextLoading,
  }
  const agentClient: ExemptionClient | undefined = showAgent
    ? {
        title: 'Agent client details',
        clientNumber: exemptionAgentClientNumber,
        applicantType: clientContextApplication?.applicantTypeCode ?? '',
        locationCode: agentClientLocationCode,
        contactName: clientContextApplication?.agentContactName ?? '',
        companyName: clientContextApplication?.agentCompanyName ?? '',
        locations: agentClientLocations,
        clientData: agentClientData,
        isLoading: clientContextLoading,
      }
    : undefined
  const feeManagementAvailable =
    currentTypeCode === 'B' ||
    currentTypeCode === 'O' ||
    containsUnmanu === true ||
    editContext.rateOverrideEnabled
  const showFees = feeManagementAvailable || Boolean(applicationsErrorMessage)
  const exemptionDetailTabs: ExemptionDetailTabKey[] = [
    ...(showOwner || showAgent ? (['owner'] as const) : []),
    'summary',
    ...(showApplications ? (['applications'] as const) : []),
    'documents',
    'permits',
    ...(showFees ? (['fees'] as const) : []),
  ]
  const activeExemptionTab = exemptionDetailTabs.includes(selectedExemptionTab)
    ? selectedExemptionTab
    : selectedExemptionTab === 'agent' && exemptionDetailTabs.includes('owner')
      ? 'owner'
      : 'summary'
  const selectedExemptionTabIndex = Math.max(0, exemptionDetailTabs.indexOf(activeExemptionTab))
  const canManageFeeRate = !applicationsErrorMessage && feeManagementAvailable && editContextLoaded
  const canEditFeeOverride =
    canManageFeeRate &&
    canEditExemptionFields &&
    (currentTypeCode !== 'M' || persistedStatusCode === 'NEW')
  const selectedRegions = useMemo(
    () =>
      mapSelectedOptionsById(editForm?.regionNumbers ?? [], regionOptions, (id) => `Region ${id}`),
    [editForm?.regionNumbers, regionOptions],
  )
  const exemptionRegionNames = exemptionOrgUnits
    .map(
      (regionNumber) =>
        allRegionOptions.find((region) => region.id === regionNumber)?.text ??
        `Region ${regionNumber}`,
    )
    .join(', ')
  const editableTypeOptions = useMemo(() => {
    if (persistedTypeCode === 'B' || persistedTypeCode === 'O') {
      return exemptionTypeOptions.filter((option) => option.value === persistedTypeCode)
    }
    return exemptionTypeOptions.filter((option) => option.value !== 'B')
  }, [exemptionTypeOptions, persistedTypeCode])
  const editableStatusOptions = useMemo(
    () =>
      exemptionStatusOptions.filter((option) => {
        if (persistedStatusCode === 'CAN' && option.value !== 'CAN' && option.value !== 'NEW') {
          return false
        }
        if (option.value === 'EXP' && persistedStatusCode !== 'EXP') return false
        if (option.value === 'ACT' && persistedStatusCode !== 'ACT') return false
        if ((currentTypeCode === 'B' || currentTypeCode === 'O') && option.value === 'NEW') {
          return persistedStatusCode === 'NEW' || persistedStatusCode === 'CAN'
        }
        return true
      }),
    [currentTypeCode, exemptionStatusOptions, persistedStatusCode],
  )
  const requiredExemptionOptionsMissing =
    optionsAvailability === 'available' &&
    (exemptionTypeOptions.length === 0 ||
      exemptionStatusOptions.length === 0 ||
      (currentTypeCode === 'B' && regionOptions.length === 0))

  // Each section saves only its own fields, so only those fields can block its Save.
  const sectionFieldErrors = useMemo((): FieldErrors<ExemptionEditField> => {
    if (!editForm) return {}
    if (editingSection === 'fees') {
      return editForm.enableRateOverride ? { feeRate: feeRateFieldError(editForm.feeRate) } : {}
    }
    const errors: FieldErrors<ExemptionEditField> = {}
    if (!exemptionTypeOptions.some((option) => option.value === editForm.exemptionTypeCode)) {
      errors.exemptionTypeCode = 'Select a valid exemption type.'
    }
    if (!exemptionStatusOptions.some((option) => option.value === editForm.exemptionStatusCode)) {
      errors.exemptionStatusCode = 'Select a valid exemption status.'
    } else if (
      persistedStatusCode === 'CAN' &&
      editForm.exemptionStatusCode.trim().toUpperCase() !== 'NEW'
    ) {
      errors.exemptionStatusCode = 'Select New to reopen this cancelled exemption.'
    }
    // Legacy reopening changes only status; the backend preserves the locked summary fields.
    if (persistedStatusCode === 'CAN') return errors
    if (currentTypeCode === 'O') {
      const number = editForm.exemptionNumber.trim()
      if (!number) {
        errors.exemptionNumber = 'Exemption number is required.'
      } else if (number.length > 8) {
        errors.exemptionNumber = 'Exemption number must be 8 characters or fewer.'
      } else if (!ASCII_PATTERN.test(number)) {
        errors.exemptionNumber =
          'Exemption number contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.'
      }
    }
    if ((currentTypeCode === 'O' || currentTypeCode === 'B') && !editForm.approvalDate.trim()) {
      errors.approvalDate = 'Approval date is required.'
    } else if (isoDateFieldError(editForm.approvalDate)) {
      errors.approvalDate = 'Approval date must be YYYY-MM-DD.'
    }
    if (isoDateFieldError(editForm.expiryDate)) {
      errors.expiryDate = 'Expiry date must be YYYY-MM-DD.'
    } else if (!editForm.expiryDate.trim()) {
      errors.expiryDate = 'Expiry date is required.'
    } else if (
      !errors.approvalDate &&
      editForm.approvalDate &&
      editForm.expiryDate <= editForm.approvalDate
    ) {
      errors.expiryDate = 'Expiry date must be after the approval date.'
    }
    const approvedVolume = Number(editForm.approvedVolume)
    if (
      !Number.isFinite(approvedVolume) ||
      approvedVolume <= 0 ||
      approvedVolume > 9_999_999.99 ||
      !/^\d{1,7}(\.\d{1,2})?$/.test(editForm.approvedVolume.trim())
    ) {
      errors.approvedVolume =
        'Approval volume must be greater than 0, at most 9,999,999.99, and have at most two decimal places.'
    }
    if (editForm.otherConditions.length > 250) {
      errors.otherConditions = 'Conditions must contain at most 250 characters.'
    } else if (!ASCII_PATTERN.test(editForm.otherConditions.trim())) {
      errors.otherConditions =
        'Conditions contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.'
    }
    if (currentTypeCode === 'B' && editForm.regionNumbers.length === 0) {
      errors.regionNumbers = 'Select at least one region for a Blanket Order in Council exemption.'
    } else if (
      currentTypeCode === 'B' &&
      editForm.regionNumbers.some(
        (regionNumber) => !regionOptions.some((option) => option.id === regionNumber),
      )
    ) {
      errors.regionNumbers = 'Select valid regions for a Blanket Order in Council exemption.'
    }
    return errors
  }, [
    currentTypeCode,
    editForm,
    editingSection,
    exemptionStatusOptions,
    exemptionTypeOptions,
    persistedStatusCode,
    regionOptions,
  ])
  // Problems no field can fix stop a Save before its fields are checked.
  const saveBlocker = !editForm
    ? 'Exemption values are unavailable.'
    : optionsAvailability !== 'available' || requiredExemptionOptionsMissing
      ? 'Authoritative exemption options must load before these changes can be saved.'
      : !isExemptionNumberChanged
        ? ''
        : documentUploadDirty
          ? 'Submit or reset queued document uploads before changing the exemption number.'
          : applicationRelationshipDraftDirty
            ? 'Add or clear the typed application number before changing the exemption number.'
            : documentUploadBusy ||
                applicationMutationNumber !== null ||
                isRemovingDocumentId !== null
              ? 'Wait for the current document or application change to finish before changing the exemption number.'
              : ''
  const feeRateValidationMessage = fieldErrorText(fieldErrors.feeRate) ?? ''
  const formValidationMessage = saveAttempted ? saveBlocker : ''

  const submitterAttachmentBlocked =
    isProvincialSubmitter &&
    !isApplicationApprover &&
    (persistedStatusCode === 'NEW' || currentDetail?.blanketOic === true)
  const canUploadExemptionDocuments =
    canPerform('/fileExemptionUpload', exemptionOrgUnits) &&
    !exemptionEditLocked &&
    !submitterAttachmentBlocked
  const canDeleteExemptionDocuments =
    isApplicationApprover &&
    withinApproverRegions &&
    persistedStatusCode.length > 0 &&
    persistedStatusCode !== 'EXP' &&
    editContextLoaded &&
    !exemptionEditLocked

  const refreshPermitData = useCallback(async (currentExemptionNumber: string) => {
    setPermitsLoaded(false)
    try {
      setPermitRows(await fetchExemptionPermits(currentExemptionNumber))
      setPermitsLoaded(true)
      setPermitsErrorMessage('')
    } catch (error) {
      console.error(error)
      setPermitRows([])
      setPermitsErrorMessage('Unable to retrieve permits associated with this exemption.')
    }
  }, [])

  const refreshEditableData = useCallback(
    async (preserveCurrentStateOnFailure = false) => {
      if (!exemptionNumber) return
      setEditContextRefreshing(true)
      setEditContextLoaded(false)
      try {
        const [nextDetail, nextApplications, nextContext] = await Promise.all([
          fetchProvincialExemptionDetail(exemptionNumber),
          fetchExemptionApplications(exemptionNumber),
          fetchExemptionEditContext(exemptionNumber),
        ])
        if (!nextDetail) {
          throw new Error('Exemption detail was not found after mutation.')
        }
        setDetail(nextDetail)
        setApplications(nextApplications.applications)
        setExemptionHolder(nextApplications.ownerNumber)
        setContainsUnmanu(nextApplications.containsUnmanu)
        setApplicationsErrorMessage('')
        setEditContext(nextContext)
        setEditContextLoaded(true)
        setEditForm(toEditForm(nextDetail, nextContext))
        await refreshPermitData(nextDetail.exemptionNumber)
      } catch (error) {
        if (!preserveCurrentStateOnFailure) {
          setApplications([])
          setExemptionHolder('')
          setContainsUnmanu(null)
          setApplicationsErrorMessage(
            'Unable to refresh applications associated with this exemption.',
          )
          setEditContext(EMPTY_EDIT_CONTEXT)
          setEditForm(null)
          setEditingSection(null)
        }
        throw error
      } finally {
        setEditContextRefreshing(false)
      }
    },
    [exemptionNumber, refreshPermitData],
  )

  const onSaveExemption = useCallback(async (): Promise<boolean> => {
    if (!detail || !editContextLoaded || saving) return false
    setSaveAttempted(true)
    if (saveBlocker || !editForm) {
      resetFieldErrors()
      return false
    }
    if (!canSaveExemption) return false
    if (!isExemptionFormDirty) {
      resetFieldErrors()
      setSaveAttempted(false)
      setActionResult(null)
      sections.finishEditing()
      return true
    }
    if (!showFieldErrors(sectionFieldErrors, () => tabsColumnRef.current)) return false
    const resultSource = editingSection === 'fees' ? 'fees' : 'summary'
    setSaving(true)
    setActionResult(null)
    // A Fees save changes only the fee fields; every other value is sent as loaded.
    const submittedForm: ExemptionEditForm =
      editingSection === 'fees'
        ? {
            ...toEditForm(detail, editContext),
            enableRateOverride: editForm.enableRateOverride,
            feeRate: editForm.feeRate,
          }
        : editForm
    try {
      const nextExemptionNumber =
        currentTypeCode === 'O' && canEditSummaryFields
          ? submittedForm.exemptionNumber.trim()
          : detail.exemptionNumber
      const result = await updateExemption({
        exemptionNumber: nextExemptionNumber,
        previousExemptionNumber: detail.exemptionNumber,
        approvedVolume: submittedForm.approvedVolume,
        approvalDate: submittedForm.approvalDate,
        expiryDate: submittedForm.expiryDate,
        otherConditions: submittedForm.otherConditions,
        exemptionTypeCode: submittedForm.exemptionTypeCode,
        exemptionStatusCode: submittedForm.exemptionStatusCode,
        manageFeeRate: canManageFeeRate,
        enableRateOverride: submittedForm.enableRateOverride,
        feeRate: submittedForm.feeRate,
        regionNumbers: submittedForm.regionNumbers,
      })
      if (!result.success) {
        setActionResult({
          source: resultSource,
          kind: 'error',
          message: result.errors.join(' ') || result.message,
        })
        return false
      }
      const committedDetail: ProvincialExemptionDetail = {
        ...detail,
        exemptionNumber: result.exemptionNumber.trim() || nextExemptionNumber,
        exemptionTypeCode: submittedForm.exemptionTypeCode,
        exemptionStatusCode: submittedForm.exemptionStatusCode,
        approvalDate: submittedForm.approvalDate || null,
        expiryDate: submittedForm.expiryDate || null,
        approvedVolume: Number(submittedForm.approvedVolume),
        otherConditions: submittedForm.otherConditions || null,
        blanketOic: submittedForm.exemptionTypeCode.trim().toUpperCase() === 'B',
      }
      const committedContext: ExemptionEditContext = {
        ...editContext,
        rateOverrideEnabled: submittedForm.enableRateOverride,
        fixedFeeRate: submittedForm.enableRateOverride ? submittedForm.feeRate : '',
        regionNumbers: submittedForm.regionNumbers,
      }
      setEditingSection(null)
      if (committedDetail.exemptionNumber !== detail.exemptionNumber) {
        // The old identifier no longer exists. Let the new route reload all linked data.
        setRenamedExemptionNumber(committedDetail.exemptionNumber)
        setActionResult({
          source: resultSource,
          kind: 'success',
          title: resultSource === 'fees' ? 'Fees saved.' : 'Exemption details saved.',
          message: '',
        })
        return true
      }
      setDetail(committedDetail)
      setEditContext(committedContext)
      setEditForm(toEditForm(committedDetail, committedContext))
      try {
        await refreshEditableData()
        setActionResult({
          source: resultSource,
          kind: 'success',
          title: resultSource === 'fees' ? 'Fees saved.' : 'Exemption details saved.',
          message: '',
        })
      } catch (refreshError) {
        console.error(refreshError)
        setApplicationsErrorMessage(
          'Application links changed, but the current links could not be refreshed. Reload the page.',
        )
        setActionResult({
          source: resultSource,
          kind: 'warning',
          message: `${result.message || 'The exemption was saved.'} Current data could not be refreshed; reload before making another change.`,
        })
        return true
      }
      return true
    } catch (error) {
      console.error(error)
      setActionResult({
        source: resultSource,
        kind: 'error',
        message: 'Unable to save the exemption.',
      })
      return false
    } finally {
      setSaving(false)
    }
  }, [
    canSaveExemption,
    isExemptionFormDirty,
    sections,
    detail,
    editContextLoaded,
    editForm,
    saveBlocker,
    sectionFieldErrors,
    resetFieldErrors,
    showFieldErrors,
    refreshEditableData,
    saving,
    canManageFeeRate,
    editContext,
    canEditSummaryFields,
    currentTypeCode,
    editingSection,
  ])

  const startEditingSection = (section: ExemptionEditSection) =>
    sections.startEditing(section, () => {
      if (currentDetail) setEditForm(toEditForm(currentDetail, editContext))
      resetFieldErrors()
      setSaveAttempted(false)
    })

  const closeApprovalConfirmation = useCallback((targetNumber: string) => {
    if (approvalTargetRef.current !== targetNumber) return
    approvalTargetRef.current = null
    setApprovalConfirmationOpen(false)
    setApprovalConfirmationTarget(null)
  }, [])

  const onApproveExemption = useCallback(async (): Promise<ExemptionApprovalOutcome> => {
    if (
      !currentDetail ||
      approvalConfirmationTarget !== currentDetail.exemptionNumber ||
      approvalTargetRef.current !== currentDetail.exemptionNumber ||
      approving
    ) {
      return {
        approvedNumbers: [],
        message: 'This exemption is no longer available for approval. Reload the page.',
        warning: true,
      }
    }
    setApproving(true)
    setActionResult(null)
    try {
      // Without an explicit version the request carries the version of the exemption on screen,
      // so approving a view that another user has since changed is rejected as stale.
      const approval = await approveExemptions([currentDetail.exemptionNumber])
      if (!approval.success || !approval.valid) {
        return {
          approvedNumbers: [],
          message:
            normalizeServerMessage(approval.errorMessage) ||
            approval.errors.join(' ') ||
            APPROVAL_FAILED_MESSAGE,
          warning: true,
        }
      }
      const serverNote = normalizeServerMessage(approval.errorMessage)
      const approvedOutcome = (note = ''): ExemptionApprovalOutcome => {
        const notes = [serverNote, note].filter(Boolean)
        return {
          approvedNumbers: [currentDetail.exemptionNumber],
          message: serverNote || 'Exemption approved.',
          warning: notes.length > 0,
          notes,
        }
      }
      if (approvalTargetRef.current !== currentDetail.exemptionNumber) {
        return approvedOutcome('The page changed; reopen this exemption to see its latest status.')
      }
      try {
        await refreshEditableData(true)
      } catch (refreshError) {
        console.error(refreshError)
        return approvedOutcome('Refresh the page to see the latest status.')
      }
      return approvedOutcome()
    } catch (error) {
      console.error(error)
      if (isClientErrorResponse(error)) {
        return { approvedNumbers: [], message: approvalRequestFailureMessage(error), warning: true }
      }
      // After a 5xx or lost response the approval may still have been saved, so show the
      // current status.
      if (approvalTargetRef.current === currentDetail.exemptionNumber) {
        try {
          await refreshEditableData(true)
        } catch (refreshError) {
          console.error(refreshError)
        }
      }
      return {
        approvedNumbers: [],
        message:
          'The approval status could not be confirmed. Check the exemption’s current status before retrying.',
        warning: true,
        unconfirmed: true,
      }
    } finally {
      setApproving(false)
    }
  }, [approvalConfirmationTarget, approving, currentDetail, refreshEditableData])

  const closePermitCreationConfirmation = useCallback(() => {
    if (creatingPermit) return
    setPermitCreationConfirmationOpen(false)
  }, [creatingPermit])

  const continuePermitCreation = useCallback(
    (permitDetail: ProvincialExemptionDetail | null = currentDetail) => {
      if (!permitDetail) return
      const permitTypeCode = (permitDetail.exemptionTypeCode ?? '').trim().toUpperCase()
      const permitStatusCode = (permitDetail.exemptionStatusCode ?? '').trim().toUpperCase()

      if (
        canStartBlanketOicPermitCreation &&
        permitTypeCode === 'B' &&
        permitStatusCode === 'ACT'
      ) {
        setActionResult(null)
        setPermitCreationConfirmationOpen(true)
        return
      }
      if (
        canStartApplicationBackedPermitCreation &&
        (permitTypeCode === 'M' || permitTypeCode === 'O') &&
        permitStatusCode === 'ACT'
      ) {
        setActionResult(null)
        setPermitCreationConfirmationOpen(true)
      }
    },
    [canStartApplicationBackedPermitCreation, canStartBlanketOicPermitCreation, currentDetail],
  )

  const onRequestPermitCreation = useCallback(() => {
    if (
      permitCreationActionBusy ||
      (!canStartApplicationBackedPermitCreation && !canStartBlanketOicPermitCreation)
    ) {
      return
    }
    setActionResult(null)
    if (isExemptionDirty) {
      confirmPermitCreationDiscard(() => {
        onDiscardExemptionChanges()
        continuePermitCreation()
      })
      return
    }
    setEditingSection(null)
    continuePermitCreation()
  }, [
    canStartApplicationBackedPermitCreation,
    canStartBlanketOicPermitCreation,
    confirmPermitCreationDiscard,
    continuePermitCreation,
    isExemptionDirty,
    onDiscardExemptionChanges,
    permitCreationActionBusy,
  ])

  const onCreatePermitFromExemption = useCallback(async () => {
    if (!detail || !canCreateApplicationBackedPermit || creatingPermit) return

    let newPermitPath: string | null = null
    setCreatingPermit(true)
    setActionResult(null)
    try {
      const result = await createPermitFromExemption(detail.exemptionNumber)
      if (!result.success) {
        setActionResult({
          kind: 'error',
          message: result.errors.join(' ') || result.message || 'Unable to create the permit.',
        })
        return
      }

      const permitNumber = result.permitNumber.trim()
      if (!/^[1-9]\d*$/.test(permitNumber)) {
        setPermitCreationRequiresReload(true)
        setActionResult({
          kind: 'error',
          message:
            'The permit response did not include a valid permit number. Reload before trying again.',
        })
        return
      }

      newPermitPath = `/provincial/permit/${encodeURIComponent(permitNumber)}`
    } catch (error) {
      console.error(error)
      setPermitCreationRequiresReload(true)
      setActionResult({
        kind: 'error',
        message:
          'The permit request outcome could not be confirmed. Reload this exemption and check the Permits tab before trying again.',
      })
    } finally {
      setCreatingPermit(false)
    }

    if (newPermitPath) {
      setPermitCreationConfirmationOpen(false)
      setCreatedMinisterialPermit((detail.exemptionTypeCode ?? '').trim().toUpperCase() === 'M')
      setPermitCreationDestination(newPermitPath)
    }
  }, [canCreateApplicationBackedPermit, creatingPermit, detail])

  const onGenerateApprovedReport = useCallback(async () => {
    if (!detail || generatingReport) return
    setGeneratingReport(true)
    setActionResult(null)
    try {
      const result = await runReport({
        reportId: 'approvedExemptionReport',
        values: { exemptionNumber: detail.exemptionNumber },
      })
      if (result.blob) {
        triggerBrowserDownload(result.blob, result.filename)
      }
    } catch (error) {
      console.error(error)
      setActionResult({
        kind: 'error',
        message:
          error instanceof ReportRequestError
            ? error.message
            : 'Unable to generate the approved exemption report.',
      })
    } finally {
      setGeneratingReport(false)
    }
  }, [detail, generatingReport])

  const onAddApplication = useCallback(async () => {
    if (!detail || applicationMutationNumber) return
    setCheckedApplicationNumber(applicationNumberToAdd)
    if (provincialApplicationNumberFieldError(applicationNumberToAdd, 'Application number', true)) {
      addApplicationInputRef.current?.focus()
      return
    }
    const enteredNumber = applicationNumberToAdd.trim()
    const number = normalizeProvincialApplicationNumber(enteredNumber)
    const showFailure = async (kind: AddApplicationFailure, serverMessage = '') => {
      let assignedExemptionNumber = ''
      // The server checks the approved status first, and an application on an exemption is
      // Exempted rather than approved, so a "not approved" answer may mean it is already used.
      if (kind === 'alreadyAssigned' || kind === 'notApproved') {
        assignedExemptionNumber = applications.some(
          (row) => row.applicationNumber.trim() === number,
        )
          ? detail.exemptionNumber
          : await findAssignedExemptionNumber(number)
        if (assignedExemptionNumber.toUpperCase() === detail.exemptionNumber.toUpperCase()) {
          kind = 'alreadyOnThisExemption'
        } else if (assignedExemptionNumber) {
          kind = 'alreadyAssigned'
        }
      }
      setAddApplicationError(
        fieldErrorText(
          addApplicationFailureMessage(
            kind,
            enteredNumber,
            exemptionClientNumber,
            assignedExemptionNumber,
            serverMessage,
          ),
        ),
      )
    }
    setApplicationMutationNumber(enteredNumber)
    setAddApplicationError('')
    setActionResult(null)
    try {
      const result = await addApplicationToExemption(detail.exemptionNumber, number)
      if (!result.success) {
        const serverMessage = result.errors.join(' ')
        await showFailure(addApplicationFailureKind(serverMessage), serverMessage)
        return
      }
      setApplicationNumberToAdd('')
      setIsAddingApplication(false)
      try {
        await refreshEditableData(true)
        setActionResult({
          source: 'applications',
          kind: 'success',
          title: 'Application added',
          message: '',
        })
      } catch (refreshError) {
        console.error(refreshError)
        setActionResult({
          source: 'applications',
          kind: 'warning',
          title: 'Application added',
          message: `Application ${number} was linked, but the page could not refresh. Reload before changing application links again.`,
        })
      }
    } catch (error) {
      console.error(error)
      if (!isClientErrorResponse(error)) {
        // Without a client error the link may have been saved, so show the current list.
        try {
          await refreshEditableData(true)
        } catch (refreshError) {
          console.error(refreshError)
        }
        await showFailure('unconfirmed')
        return
      }
      const status = getResponseStatus(error)
      await showFailure(
        status === 404 ? 'notFound' : status === 403 ? 'forbidden' : 'other',
        responseServerMessage(error),
      )
    } finally {
      setApplicationMutationNumber(null)
    }
  }, [
    applicationMutationNumber,
    applicationNumberToAdd,
    applications,
    detail,
    exemptionClientNumber,
    refreshEditableData,
  ])

  const closeAddApplication = () => {
    setApplicationNumberToAdd('')
    setAddApplicationError('')
    setIsAddingApplication(false)
  }

  useEffect(() => {
    // Carbon's invalid text isn't announced, so focus the field it describes.
    if (addApplicationError && !applicationMutationNumber) addApplicationInputRef.current?.focus()
  }, [addApplicationError, applicationMutationNumber])

  const onRemoveApplication = useCallback(
    async (applicationNumber: string) => {
      if (!detail || applicationMutationNumber) {
        throw new Error('Application links are not available for removal right now.')
      }
      setApplicationMutationNumber(applicationNumber)
      setActionResult(null)
      try {
        const result = await removeApplicationFromExemption(
          detail.exemptionNumber,
          applicationNumber,
        )
        if (!result.success) {
          throw new Error(result.errors.join(' ') || 'Unable to unlink the application.')
        }
        try {
          await refreshEditableData(true)
          setActionResult({
            source: 'applications',
            kind: 'success',
            title: 'Application removed',
            message: '',
          })
        } catch (refreshError) {
          console.error(refreshError)
          setApplicationsErrorMessage(
            'Application links changed, but the current links could not be refreshed. Reload the page.',
          )
          setActionResult({
            source: 'applications',
            kind: 'warning',
            title: 'Application removed',
            message: `Application ${applicationNumber} was removed, but the page could not refresh. Reload before changing application links again.`,
          })
        }
      } catch (error) {
        console.error(error)
        throw error instanceof Error
          ? error
          : new Error(`Unable to remove application ${applicationNumber}.`)
      } finally {
        setApplicationMutationNumber(null)
      }
    },
    [applicationMutationNumber, detail, refreshEditableData],
  )

  const refreshExemptionDocuments = useCallback(async () => {
    if (!exemptionNumber) {
      return
    }

    const documentsResult = await fetchExemptionDocuments(exemptionNumber)
    setDocumentRows(documentsResult.rows)
    setDocumentsErrorMessage('')
  }, [exemptionNumber])

  const onCancelDocumentEditing = useCallback(() => {
    setDocumentUploadDirty(false)
    setDocumentUploadBusy(false)
    setDocumentUploadResetKey((current) => current + 1)
    setActionResult(withoutActionError)
    setIsAddingDocuments(false)
  }, [])

  const fetchExemptionDocument = useCallback(
    (row: ProvincialExemptionDocumentRow) =>
      openExemptionDocument(row.id, row.name, exemptionNumber ?? ''),
    [exemptionNumber],
  )
  const clearActionResult = useCallback(() => setActionResult(null), [])
  const showDocumentOpenError = useCallback(
    (message: string) => setActionResult({ kind: 'error', message, source: 'documents' }),
    [],
  )
  const onOpenDocument = useDocumentOpener({
    recordKey: exemptionNumber,
    fetchDocument: fetchExemptionDocument,
    onStart: clearActionResult,
    onError: showDocumentOpenError,
  })

  const onRemoveDocument = useCallback(
    async (row: ProvincialExemptionDocumentRow) => {
      if (!exemptionNumber) {
        throw new Error('Exemption number is unavailable.')
      }

      const isLatestRequest = beginDetailRequest()
      setIsRemovingDocumentId(row.id)
      setActionResult(null)

      try {
        const removeResult = await removeExemptionDocument(row.id, exemptionNumber)
        if (!isLatestRequest()) {
          return
        }
        if (!removeResult.success) {
          throw new Error('Document removal failed. Refresh and try again.')
        }

        try {
          const documentsResult = await fetchExemptionDocuments(exemptionNumber)
          if (isLatestRequest()) {
            setDocumentRows(documentsResult.rows)
            setDocumentsErrorMessage('')
            setActionResult({ ...DOCUMENT_DELETED_RESULT, source: 'documents' })
          }
        } catch (refreshError) {
          if (isLatestRequest()) {
            console.error(refreshError)
            setDocumentsErrorMessage(
              'The document was deleted, but exemption documents could not be refreshed. Reload the page.',
            )
            setActionResult({
              kind: 'warning',
              message: `${row.name || 'Document'} was deleted. Reload before changing documents again.`,
            })
          }
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
        }
        throw error instanceof Error ? error : new Error('Unable to remove the selected document.')
      } finally {
        if (isLatestRequest()) {
          setIsRemovingDocumentId(null)
        }
      }
    },
    [beginDetailRequest, exemptionNumber],
  )

  const applyForPermitButton =
    canStartApplicationBackedPermitCreation || canStartBlanketOicPermitCreation ? (
      <Button
        kind="tertiary"
        size="md"
        renderIcon={Add}
        disabled={permitCreationActionBusy}
        onClick={onRequestPermitCreation}
      >
        {creatingPermit ? 'Creating permit…' : 'Apply for new permit'}
      </Button>
    ) : undefined
  const emptyBlanketOicPermits =
    currentDetail?.blanketOic && permitsLoaded && permitRows.length === 0
  const PermitsContainer = emptyBlanketOicPermits ? 'section' : Tile

  const sectionResult = (source: ExemptionActionResult['source']) =>
    actionResult && actionResult.source === source ? (
      <ActionResultNotification result={actionResult} onClose={() => setActionResult(null)} />
    ) : null

  return (
    <Grid fullWidth className="default-grid detail-page-grid provincial-exemption-detail">
      <Column sm={4} md={8} lg={16}>
        <DetailBreadcrumb
          label="Exemption search"
          to="/provincial/exemption"
          returnTo={detailReturnTo}
        />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <PageHeader
          title={exemptionPageTitle}
          subtitle={`Author: ${displayValueText(currentDetail?.author)}`}
          status={
            currentDetail ? (
              <StatusTag
                status={
                  currentDetail.exemptionStatusDescription ??
                  currentDetail.exemptionStatusCode ??
                  ''
                }
                fallbackLabel="Not provided"
              />
            ) : undefined
          }
          actionsLabel="Exemption actions"
          actions={
            !loading &&
            currentDetail &&
            (canApproveExemption ||
              (persistedStatusCode === 'ACT' && canPerform('/approvedExemptionReport'))) ? (
              <>
                {canApproveExemption && (
                  <Button
                    kind="primary"
                    size="md"
                    disabled={approving}
                    onClick={() => {
                      setActionResult(null)
                      approvalTargetRef.current = currentDetail.exemptionNumber
                      setApprovalConfirmationTarget(currentDetail.exemptionNumber)
                      setApprovalConfirmationOpen(true)
                    }}
                  >
                    {approving ? 'Approving…' : 'Approve exemption'}
                  </Button>
                )}
                {persistedStatusCode === 'ACT' && canPerform('/approvedExemptionReport') && (
                  <Button
                    kind="tertiary"
                    size="md"
                    disabled={generatingReport}
                    renderIcon={generatingReport ? PendingIcon : undefined}
                    onClick={() => void onGenerateApprovedReport()}
                  >
                    {generatingReport ? 'Generating…' : 'Print approved exemption'}
                  </Button>
                )}
              </>
            ) : undefined
          }
        />
      </Column>

      {loading && !currentDetail && (
        <Column
          sm={4}
          md={8}
          lg={16}
          className="detail-page-loading"
          role="status"
          aria-live="polite"
        >
          <Loading description="Loading provincial exemption detail…" withOverlay={false} />
        </Column>
      )}

      {!loading && !!errorMessage && <DetailLoadError message={errorMessage} />}

      {detail && currentDetail && (
        <>
          {!!exemptionEditLockMessage && (
            <InlineNotification
              className="detail-context-notification"
              kind="warning"
              title="Editing unavailable"
              subtitle={exemptionEditLockMessage}
              lowContrast
              hideCloseButton
            />
          )}
          {!!editContextUnavailableMessage && (
            <InlineNotification
              className="detail-context-notification"
              kind="warning"
              title="Editing unavailable"
              subtitle={editContextUnavailableMessage}
              lowContrast
              hideCloseButton
            />
          )}
          {optionsAvailability === 'unavailable' && <AuthoritativeOptionsUnavailableNotification />}
          {requiredExemptionOptionsMissing && (
            <InlineNotification
              className="detail-context-notification"
              kind="warning"
              title="Required exemption options not configured"
              subtitle="A required exemption type, status, or Blanket OIC region list is empty. Exemption saves are disabled."
              lowContrast
              hideCloseButton
            />
          )}
          {!!pageActionResult &&
            // An open confirmation shows its own failure instead of the page.
            (pageActionResult.kind !== 'error' ||
              (!approvalConfirmationOpen && !showPermitCreationConfirmation)) && (
              <div ref={approvalResultRef} tabIndex={-1} className="exemption-page-result">
                <ActionResultNotification
                  result={pageActionResult}
                  onClose={() => setActionResult(null)}
                />
              </div>
            )}
          {editing && !!formValidationMessage && (
            <InlineNotification
              className="detail-context-notification"
              kind="warning"
              title="Review exemption values"
              subtitle={formValidationMessage}
              lowContrast
              hideCloseButton
            />
          )}

          <Column
            ref={tabsColumnRef}
            sm={4}
            md={8}
            lg={16}
            className={`application-detail-tabs-column content-loading-region${
              isRefreshingDetail ? ' is-loading' : ''
            }`}
            inert={isRefreshingDetail || (saving && isExemptionNumberChanged) ? true : undefined}
            aria-busy={isRefreshingDetail || (saving && isExemptionNumberChanged)}
          >
            <ContentLoadingOverlay
              loading={isRefreshingDetail}
              loadingDescription="Refreshing provincial exemption detail…"
            />
            <Tabs
              selectedIndex={selectedExemptionTabIndex}
              onChange={({ selectedIndex }) => {
                sections.confirmLeave(() =>
                  selectExemptionTab(exemptionDetailTabs[selectedIndex] ?? 'summary'),
                )
              }}
            >
              <TabList
                aria-label="Exemption detail sections"
                contained
                className="application-tabs__list application-detail-tab-list"
              >
                {exemptionDetailTabs.map((tab) => (
                  <Tab key={tab} renderIcon={EXEMPTION_DETAIL_TAB_ICONS[tab]}>
                    {EXEMPTION_DETAIL_TAB_LABELS[tab]}
                  </Tab>
                ))}
              </TabList>
              <ContiguousTabPanels order={exemptionDetailTabs}>
                {(showOwner || showAgent) && (
                  <TabPanel key="owner" className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        {clientContextErrorMessage ? (
                          <EmptyState
                            title="Client details unavailable"
                            description={clientContextErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : showOwner ? (
                          <ExemptionClientTile {...ownerClient} agent={agentClient} />
                        ) : (
                          agentClient && <ExemptionClientTile {...agentClient} />
                        )}
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
                <TabPanel key="summary" className="application-detail-tab-panel">
                  <Grid
                    ref={sections.sectionRef('summary')}
                    fullWidth
                    className="application-detail-tab-grid"
                  >
                    {editingSection === 'summary' && editForm ? (
                      <>
                        <Column sm={4} md={8} lg={16}>
                          <Tile>
                            <DetailCardTitle icon={Rule}>Exemption details</DetailCardTitle>
                            {sectionResult('summary')}
                            <RequiredFieldsLegend className="application-detail-required" />
                            <RecordFieldGrid editing>
                              <RecordFieldRow>
                                <RecordFieldCell>
                                  <SearchableSelect
                                    id="exemptionDetailStatus"
                                    labelText={requiredLabel('Status')}
                                    required
                                    value={editForm.exemptionStatusCode}
                                    options={editableStatusOptions}
                                    disabled={
                                      optionsAvailability !== 'available' ||
                                      exemptionStatusOptions.length === 0 ||
                                      !canEditStatus
                                    }
                                    invalid={!!fieldErrors.exemptionStatusCode}
                                    invalidText={fieldErrorText(fieldErrors.exemptionStatusCode)}
                                    onChange={(value) =>
                                      setEditForm((current) =>
                                        current
                                          ? { ...current, exemptionStatusCode: value }
                                          : current,
                                      )
                                    }
                                  />
                                </RecordFieldCell>
                              </RecordFieldRow>
                              <RecordFieldRow>
                                {canEditExemptionType ? (
                                  <RecordFieldCell>
                                    <SearchableSelect
                                      id="exemptionDetailType"
                                      labelText={requiredLabel('Exemption type')}
                                      required
                                      value={editForm.exemptionTypeCode}
                                      options={editableTypeOptions}
                                      invalid={!!fieldErrors.exemptionTypeCode}
                                      invalidText={fieldErrorText(fieldErrors.exemptionTypeCode)}
                                      onChange={(value) =>
                                        setEditForm((current) =>
                                          current
                                            ? { ...current, exemptionTypeCode: value }
                                            : current,
                                        )
                                      }
                                    />
                                  </RecordFieldCell>
                                ) : (
                                  <RecordField
                                    label="Exemption type"
                                    value={exemptionTypeValue(detail)}
                                  />
                                )}
                                <RecordField
                                  label="Exemption holder"
                                  value={
                                    detail.blanketOic
                                      ? 'Blanket OIC'
                                      : exemptionHolder.trim() ||
                                        detail.ownerClientNumber?.trim() ||
                                        exemptionOwnerClientNumber
                                  }
                                />
                                {currentTypeCode === 'O' && (
                                  <RecordFieldCell>
                                    <TextInput
                                      id="exemptionDetailNumber"
                                      labelText={requiredLabel('Exemption number')}
                                      required
                                      maxLength={8}
                                      value={editForm.exemptionNumber}
                                      disabled={!canEditSummaryFields}
                                      invalid={!!fieldErrors.exemptionNumber}
                                      invalidText={fieldErrorText(fieldErrors.exemptionNumber)}
                                      onChange={(event) =>
                                        setEditForm((current) =>
                                          current
                                            ? {
                                                ...current,
                                                exemptionNumber: event.target.value.toUpperCase(),
                                              }
                                            : current,
                                        )
                                      }
                                    />
                                  </RecordFieldCell>
                                )}
                              </RecordFieldRow>
                              <RecordFieldRow>
                                {canEditApprovalDate ? (
                                  <RecordFieldCell>
                                    <IsoDatePicker
                                      id="exemptionDetailApprovalDate"
                                      labelText={requiredLabel(
                                        'Approval date',
                                        approvalDateRequired,
                                      )}
                                      required={approvalDateRequired}
                                      value={editForm.approvalDate}
                                      invalid={!!fieldErrors.approvalDate}
                                      invalidText={fieldErrorText(fieldErrors.approvalDate)}
                                      onChange={(value) =>
                                        setEditForm((current) =>
                                          current ? { ...current, approvalDate: value } : current,
                                        )
                                      }
                                    />
                                  </RecordFieldCell>
                                ) : (
                                  <RecordField
                                    label="Approval date"
                                    value={approvalDateValue(detail)}
                                  />
                                )}
                                <RecordFieldCell>
                                  <IsoDatePicker
                                    id="exemptionDetailExpiryDate"
                                    labelText={requiredLabel('Expiry date', expiryDateRequired)}
                                    required={expiryDateRequired}
                                    value={editForm.expiryDate}
                                    invalid={!!fieldErrors.expiryDate}
                                    invalidText={fieldErrorText(fieldErrors.expiryDate)}
                                    disabled={!canEditExpiryDate}
                                    onChange={(value) =>
                                      setEditForm((current) =>
                                        current ? { ...current, expiryDate: value } : current,
                                      )
                                    }
                                  />
                                </RecordFieldCell>
                              </RecordFieldRow>
                              <RecordFieldRow>
                                <RecordFieldCell>
                                  <TextInput
                                    id="exemptionDetailApprovedVolume"
                                    labelText={requiredLabel('Approval volume (m³)')}
                                    aria-required="true"
                                    value={editForm.approvedVolume}
                                    disabled={!canEditApprovedVolume}
                                    invalid={!!fieldErrors.approvedVolume}
                                    invalidText={fieldErrorText(fieldErrors.approvedVolume)}
                                    onChange={(event) =>
                                      setEditForm((current) =>
                                        current
                                          ? { ...current, approvedVolume: event.target.value }
                                          : current,
                                      )
                                    }
                                  />
                                </RecordFieldCell>
                              </RecordFieldRow>
                              <RecordFieldRow>
                                {currentTypeCode === 'B' && (
                                  <RecordFieldCell span="wide">
                                    <RegionMultiSelect
                                      id="exemptionDetailRegions"
                                      titleText={requiredLabel('Region')}
                                      required
                                      items={regionOptions}
                                      selectedItems={selectedRegions}
                                      disabled={
                                        optionsAvailability !== 'available' ||
                                        !canEditSummaryFields ||
                                        regionOptions.length === 0
                                      }
                                      invalid={!!fieldErrors.regionNumbers}
                                      invalidText={fieldErrorText(fieldErrors.regionNumbers)}
                                      onChange={(selectedItems) =>
                                        setEditForm((current) =>
                                          current
                                            ? {
                                                ...current,
                                                regionNumbers: selectedItems.map((item) => item.id),
                                              }
                                            : current,
                                        )
                                      }
                                    />
                                  </RecordFieldCell>
                                )}
                              </RecordFieldRow>
                              <RecordFieldRow>
                                <RecordFieldCell span="full">
                                  <TextArea
                                    id="exemptionDetailOtherConditions"
                                    labelText="Conditions"
                                    enableCounter
                                    maxCount={250}
                                    maxLength={250}
                                    value={editForm.otherConditions}
                                    disabled={!canEditSummaryFields}
                                    invalid={!!fieldErrors.otherConditions}
                                    invalidText={fieldErrorText(fieldErrors.otherConditions)}
                                    onChange={(event) =>
                                      setEditForm((current) =>
                                        current
                                          ? { ...current, otherConditions: event.target.value }
                                          : current,
                                      )
                                    }
                                  />
                                </RecordFieldCell>
                              </RecordFieldRow>
                            </RecordFieldGrid>
                            <div className="legacy-search-actions">
                              <Button
                                kind="tertiary"
                                size="md"
                                disabled={saving}
                                onClick={sections.cancelEditing}
                              >
                                Cancel
                              </Button>
                              <Button
                                kind="primary"
                                size="md"
                                disabled={saving}
                                renderIcon={saving ? PendingIcon : undefined}
                                onClick={() => void onSaveExemption()}
                              >
                                {saving ? 'Saving…' : 'Save changes'}
                              </Button>
                            </div>
                          </Tile>
                        </Column>
                      </>
                    ) : (
                      <Column sm={4} md={8} lg={16}>
                        <Tile className="detail-section-card exemption-summary-card">
                          <div className="detail-section-card__header">
                            <DetailCardTitle icon={Rule}>Exemption details</DetailCardTitle>
                            {canSaveExemption && !editing && (
                              <Button
                                ref={sections.editButtonRef('summary')}
                                kind="tertiary"
                                size="md"
                                renderIcon={Edit}
                                onClick={() => startEditingSection('summary')}
                              >
                                Edit exemption details
                              </Button>
                            )}
                          </div>
                          {sectionResult('summary')}
                          <RecordFieldGrid>
                            <RecordFieldRow>
                              {[
                                {
                                  label: 'Status',
                                  value: displayValue(
                                    detail.exemptionStatusDescription ?? detail.exemptionStatusCode,
                                  ),
                                },
                              ].map((field: DetailField) => (
                                <RecordField
                                  key={field.label}
                                  label={field.label}
                                  value={field.value}
                                  span={field.span}
                                />
                              ))}
                            </RecordFieldRow>
                            <RecordFieldRow>
                              {[
                                {
                                  label: 'Exemption type',
                                  value: exemptionTypeValue(detail),
                                },
                                {
                                  label: 'Exemption holder',
                                  value: detail.blanketOic
                                    ? 'Blanket OIC'
                                    : displayValue(
                                        exemptionHolder.trim() ||
                                          detail.ownerClientNumber?.trim() ||
                                          exemptionOwnerClientNumber,
                                      ),
                                },
                              ].map((field: DetailField) => (
                                <RecordField
                                  key={field.label}
                                  label={field.label}
                                  value={field.value}
                                  span={field.span}
                                />
                              ))}
                            </RecordFieldRow>
                            <RecordFieldRow>
                              {[
                                {
                                  label: 'Approval date',
                                  value: approvalDateValue(detail),
                                },
                                {
                                  label: 'Expiry date',
                                  value: displayValue(detail.expiryDate),
                                },
                              ].map((field: DetailField) => (
                                <RecordField
                                  key={field.label}
                                  label={field.label}
                                  value={field.value}
                                  span={field.span}
                                />
                              ))}
                            </RecordFieldRow>
                            <RecordFieldRow>
                              {[
                                {
                                  label: 'Approval volume (m³)',
                                  value: formatExemptionVolume(detail.approvedVolume),
                                },
                              ].map((field: DetailField) => (
                                <RecordField
                                  key={field.label}
                                  label={field.label}
                                  value={field.value}
                                  span={field.span}
                                />
                              ))}
                            </RecordFieldRow>
                            {!!exemptionRegionNames && (
                              <RecordFieldRow>
                                {[
                                  {
                                    label: 'Region',
                                    value: exemptionRegionNames,
                                    span: 'wide' as const,
                                  },
                                ].map((field: DetailField) => (
                                  <RecordField
                                    key={field.label}
                                    label={field.label}
                                    value={field.value}
                                    span={field.span}
                                  />
                                ))}
                              </RecordFieldRow>
                            )}
                            {!!detail.otherConditions && (
                              <RecordFieldRow>
                                {[
                                  {
                                    label: 'Conditions',
                                    value: detail.otherConditions,
                                    span: 'full' as const,
                                  },
                                ].map((field: DetailField) => (
                                  <RecordField
                                    key={field.label}
                                    label={field.label}
                                    value={field.value}
                                    span={field.span}
                                  />
                                ))}
                              </RecordFieldRow>
                            )}
                          </RecordFieldGrid>
                        </Tile>
                      </Column>
                    )}
                  </Grid>
                </TabPanel>
                {showApplications && (
                  <TabPanel key="applications" className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <div className="detail-section-card__header">
                            <DetailCardTitle icon={Result}>Applications</DetailCardTitle>
                            {canLinkApplications && (
                              <Button
                                kind="tertiary"
                                size="md"
                                renderIcon={Add}
                                ref={addApplicationButtonRef}
                                onClick={() => {
                                  setAddApplicationError('')
                                  setCheckedApplicationNumber(null)
                                  setIsAddingApplication(true)
                                }}
                              >
                                Add application
                              </Button>
                            )}
                          </div>
                          {sectionResult('applications')}
                          {!applicationsErrorMessage && (
                            <p>
                              Total requested volume (m³):{' '}
                              {formatExemptionVolume(requestedApplicationVolume)}
                            </p>
                          )}
                          {canLinkApplications && (
                            <DetailSidePanel
                              open={isAddingApplication}
                              title="Add application"
                              contentSelector=".application-detail-tabs-column"
                              initialFocusSelector="#exemptionApplicationNumberToAdd"
                              launcherRef={addApplicationButtonRef}
                              fallbackFocusSelector=".application-detail-tab-list"
                              busy={Boolean(applicationMutationNumber)}
                              actions={[
                                {
                                  label: 'Cancel',
                                  kind: 'tertiary',
                                  disabled: Boolean(applicationMutationNumber),
                                  onClick: () =>
                                    confirmApplicationDraftDiscard(closeAddApplication),
                                },
                                {
                                  label: applicationMutationNumber ? 'Saving…' : 'Save application',
                                  kind: 'primary',
                                  disabled: Boolean(applicationMutationNumber),
                                  onClick: () => void onAddApplication(),
                                },
                              ]}
                              onClose={() => confirmApplicationDraftDiscard(closeAddApplication)}
                            >
                              <TextInput
                                ref={addApplicationInputRef}
                                id="exemptionApplicationNumberToAdd"
                                labelText={requiredLabel('Application number')}
                                aria-required="true"
                                value={applicationNumberToAdd}
                                helperText={
                                  exemptionClientNumber
                                    ? `Approved applications for client ${exemptionClientNumber} only.`
                                    : 'Approved applications only.'
                                }
                                invalid={Boolean(
                                  applicationNumberToAddError || addApplicationError,
                                )}
                                invalidText={applicationNumberToAddError || addApplicationError}
                                // Carbon links its error with aria-errormessage only, which many
                                // screen readers skip, so also describe the field with it.
                                {...(applicationNumberToAddError || addApplicationError
                                  ? {
                                      'aria-describedby':
                                        'exemptionApplicationNumberToAdd-error-msg',
                                    }
                                  : {})}
                                disabled={Boolean(applicationMutationNumber)}
                                onChange={(event) => {
                                  setApplicationNumberToAdd(event.target.value)
                                  setAddApplicationError('')
                                }}
                              />
                            </DetailSidePanel>
                          )}
                          {applicationsErrorMessage ? (
                            <EmptyState
                              title="Applications unavailable"
                              description={applicationsErrorMessage}
                              headingLevel={3}
                              role="alert"
                            />
                          ) : applications.length > 0 ? (
                            <TableFrame ariaLabel="Associated exemption applications">
                              <Table size="md" useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Application</TableHeader>
                                    <TableHeader>Application volume (m³)</TableHeader>
                                    {canManageApplicationLinks && (
                                      <TableHeader>Actions</TableHeader>
                                    )}
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {applications.map((application) => {
                                    const federal = application.jurisdiction.toUpperCase() === 'F'
                                    const canOpen = federal
                                      ? canPerform('/federalApplicationDetails') &&
                                        canPerform('viewFederalApplication')
                                      : canPerform('/applicationDetails')
                                    const path = federal
                                      ? `/federal/application/${application.applicationNumber}`
                                      : `/provincial/application/${application.applicationNumber}`
                                    return (
                                      <TableRow key={application.applicationNumber}>
                                        <TableCell>
                                          {canOpen ? (
                                            <Link
                                              to={withCurrentSearch(path)}
                                              state={withDetailReturnTo(
                                                location.state,
                                                {
                                                  label: exemptionPageTitle,
                                                  to: locationPath(location),
                                                },
                                                detailReturnTo,
                                              )}
                                            >
                                              {application.applicationNumber}
                                            </Link>
                                          ) : (
                                            application.applicationNumber
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {formatExemptionVolume(application.requestedVolume)}
                                        </TableCell>
                                        {canManageApplicationLinks && (
                                          <TableCell>
                                            <div className="legacy-search-actions">
                                              {canLinkApplications && (
                                                <DisabledButtonTooltip
                                                  disabled={
                                                    application.locked ||
                                                    Boolean(applicationMutationNumber)
                                                  }
                                                  description={
                                                    application.locked
                                                      ? 'This application is locked and cannot be removed.'
                                                      : 'Wait for the current application link update to finish.'
                                                  }
                                                >
                                                  <Button
                                                    kind="danger--ghost"
                                                    size="md"
                                                    disabled={
                                                      application.locked ||
                                                      Boolean(applicationMutationNumber)
                                                    }
                                                    renderIcon={TrashCan}
                                                    onClick={() => {
                                                      setActionResult(null)
                                                      setApplicationPendingRemoval(
                                                        application.applicationNumber,
                                                      )
                                                    }}
                                                  >
                                                    {applicationMutationNumber ===
                                                    application.applicationNumber
                                                      ? 'Removing…'
                                                      : application.locked
                                                        ? 'Locked'
                                                        : 'Remove'}
                                                  </Button>
                                                </DisabledButtonTooltip>
                                              )}
                                            </div>
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            </TableFrame>
                          ) : (
                            <EmptyState
                              title="No applications found"
                              description="No applications are associated with this exemption."
                              headingLevel={3}
                            />
                          )}
                        </Tile>
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
                <TabPanel
                  key="permits"
                  className={`application-detail-tab-panel${emptyBlanketOicPermits ? ' application-detail-tab-panel--empty' : ''}`}
                >
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <PermitsContainer>
                        {!emptyBlanketOicPermits && (
                          <div className="detail-section-card__header">
                            <DetailCardTitle icon={Certificate}>Permits</DetailCardTitle>
                            {(visiblePermitRows.length > 0 || Boolean(permitsErrorMessage)) &&
                              applyForPermitButton}
                          </div>
                        )}
                        {editing && !emptyBlanketOicPermits && (
                          <p className="detail-read-only-note">
                            Permit records are read-only. Use the Exemption details or Fees tab to
                            edit exemption values.
                          </p>
                        )}
                        {!detail.blanketOic && (
                          <RecordFieldGrid aria-label="Exemption permit volume totals">
                            <RecordFieldRow>
                              <RecordField
                                label="Approved volume (m³)"
                                value={formatExemptionVolume(detail.approvedVolume)}
                              />
                              {/* INTENTIONAL_LEGACY_DIVERGENCE(EXEMPTION_PERMIT_TOTALS): Every permit's volume contributes to the balance, including pending permits. */}
                              <RecordField
                                label="Scale volume assigned to permits (m³)"
                                value={formatExemptionVolume(detail.usedVolume)}
                              />
                              <RecordField
                                label="Balance remaining (m³)"
                                value={formatExemptionVolume(detail.remainingVolume)}
                              />
                            </RecordFieldRow>
                          </RecordFieldGrid>
                        )}
                        {permitsErrorMessage ? (
                          <EmptyState
                            title="Permits unavailable"
                            description={permitsErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : visiblePermitRows.length > 0 ? (
                          <TableFrame ariaLabel="Related exemption permits">
                            <Table size="md" useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>Permit</TableHeader>
                                  <TableHeader>Volume (m³)</TableHeader>
                                  <TableHeader>Status</TableHeader>
                                  <TableHeader>Issue date</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {visiblePermitRows.map((row) => {
                                  const label =
                                    row.permitStatus.trim().toUpperCase() === 'ACTIVE'
                                      ? `${row.permitNumber} (Pending)`
                                      : row.permitNumber
                                  return (
                                    <TableRow key={row.permitNumber}>
                                      <TableCell>
                                        {canPerform('/permitSearch') &&
                                        canPerform('/permitDetails') ? (
                                          <Link
                                            className="cds--link"
                                            to={withCurrentSearch(
                                              `/provincial/permit/${row.permitNumber}`,
                                            )}
                                            state={withDetailReturnTo(
                                              location.state,
                                              {
                                                label: exemptionPageTitle,
                                                to: locationPath(location),
                                              },
                                              detailReturnTo,
                                            )}
                                          >
                                            {label}
                                          </Link>
                                        ) : (
                                          label
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        {formatExemptionVolume(row.permitVolume)}
                                      </TableCell>
                                      <TableCell>
                                        <StatusTag
                                          status={row.permitStatus}
                                          fallbackLabel="Not provided"
                                        />
                                      </TableCell>
                                      <TableCell>{displayValue(row.permitIssueDate)}</TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <EmptyState
                            title={
                              permitRows.length > 0
                                ? 'No permits available'
                                : 'No permits for this exemption'
                            }
                            description={
                              permitRows.length > 0
                                ? 'No associated permits are available to your account.'
                                : persistedStatusCode === 'NEW'
                                  ? 'Permits can be requested once the exemption is approved.'
                                  : 'Permits requested against this exemption will appear here.'
                            }
                            icon={<DocumentSecurity_02 width={48} height={48} />}
                            action={applyForPermitButton}
                            headingLevel={3}
                            variant={emptyBlanketOicPermits ? 'tab' : undefined}
                          />
                        )}
                      </PermitsContainer>
                    </Column>
                  </Grid>
                </TabPanel>
                {showFees && (
                  <TabPanel key="fees" className="application-detail-tab-panel">
                    <Grid
                      ref={sections.sectionRef('fees')}
                      fullWidth
                      className="application-detail-tab-grid"
                    >
                      <Column sm={4} md={8} lg={16}>
                        {applicationsErrorMessage || !editContextLoaded ? (
                          <Tile>
                            <DetailCardTitle icon={Currency}>Fees</DetailCardTitle>
                            {applicationsErrorMessage ? (
                              <EmptyState
                                title="Fee eligibility unavailable"
                                description="Associated applications could not be loaded, so fee eligibility cannot be determined."
                                headingLevel={3}
                              />
                            ) : (
                              <EmptyState
                                title="Fee rate unavailable"
                                description="Fee rate settings could not be loaded."
                                headingLevel={3}
                              />
                            )}
                          </Tile>
                        ) : editingSection === 'fees' && editForm ? (
                          <Tile>
                            <DetailCardTitle icon={Currency}>Fees</DetailCardTitle>
                            {sectionResult('fees')}
                            <RequiredFieldsLegend className="application-detail-required" />
                            <RecordFieldGrid editing>
                              <RecordFieldRow>
                                <RecordFieldCell>
                                  <RadioButtonGroup
                                    legendText="Override fee rate?"
                                    name="exemptionFeeRateOverride"
                                    valueSelected={editForm.enableRateOverride ? 'yes' : 'no'}
                                    orientation="horizontal"
                                    disabled={saving}
                                    onChange={(value) => {
                                      const enabled = String(value) === 'yes'
                                      setEditForm((current) =>
                                        current
                                          ? {
                                              ...current,
                                              enableRateOverride: enabled,
                                              feeRate: enabled ? current.feeRate : '',
                                            }
                                          : current,
                                      )
                                    }}
                                  >
                                    <RadioButton
                                      id="exemptionFeeRateOverride-no"
                                      labelText="No"
                                      value="no"
                                    />
                                    <RadioButton
                                      id="exemptionFeeRateOverride-yes"
                                      labelText="Yes"
                                      value="yes"
                                    />
                                  </RadioButtonGroup>
                                </RecordFieldCell>
                              </RecordFieldRow>
                              <RecordFieldRow>
                                {editForm.enableRateOverride && (
                                  <RecordFieldCell>
                                    <TextInput
                                      id="exemptionFeeRate"
                                      labelText={requiredLabel('Fee rate ($/m³)')}
                                      aria-required="true"
                                      value={editForm.feeRate}
                                      invalid={Boolean(feeRateValidationMessage)}
                                      invalidText={feeRateValidationMessage}
                                      disabled={saving}
                                      onChange={(event) =>
                                        setEditForm((current) =>
                                          current
                                            ? { ...current, feeRate: event.target.value }
                                            : current,
                                        )
                                      }
                                    />
                                  </RecordFieldCell>
                                )}
                              </RecordFieldRow>
                            </RecordFieldGrid>
                            <div className="legacy-search-actions">
                              <Button
                                kind="tertiary"
                                size="md"
                                disabled={saving}
                                onClick={sections.cancelEditing}
                              >
                                Cancel
                              </Button>
                              <Button
                                kind="primary"
                                size="md"
                                disabled={saving}
                                renderIcon={saving ? PendingIcon : undefined}
                                onClick={() => void onSaveExemption()}
                              >
                                {saving ? 'Saving…' : 'Save changes'}
                              </Button>
                            </div>
                          </Tile>
                        ) : (
                          <Tile>
                            <div className="detail-section-card__header">
                              <DetailCardTitle icon={Currency}>Fees</DetailCardTitle>
                              {canEditFeeOverride && !editing && (
                                <Button
                                  ref={sections.editButtonRef('fees')}
                                  kind="tertiary"
                                  size="md"
                                  renderIcon={Edit}
                                  onClick={() => startEditingSection('fees')}
                                >
                                  Edit fee override
                                </Button>
                              )}
                            </div>
                            {sectionResult('fees')}
                            <RecordFieldGrid>
                              <RecordFieldRow>
                                <RecordField
                                  label="Override fee rate?"
                                  value={editContext.rateOverrideEnabled ? 'Yes' : 'No'}
                                />
                              </RecordFieldRow>
                              <RecordFieldRow hidden={!editContext.rateOverrideEnabled}>
                                <RecordField
                                  label="Fee rate ($/m³)"
                                  value={editContext.fixedFeeRate}
                                />
                              </RecordFieldRow>
                            </RecordFieldGrid>
                          </Tile>
                        )}
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
                <TabPanel
                  key="documents"
                  className={`application-detail-tab-panel detail-documents-tab-panel${
                    !documentsErrorMessage && documentRows.length === 0
                      ? ' application-detail-tab-panel--empty'
                      : ''
                  }`}
                >
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      {/* Figma shows the documents table on the page, with no card or title. */}
                      <RecordDocumentsSection
                        id="exemption-documents"
                        recordType="exemption"
                        rows={documentRows}
                        errorMessage={documentsErrorMessage}
                        result={documentActionResult}
                        onDismissResult={clearActionResult}
                        upload={{
                          enabled: canUploadExemptionDocuments,
                          open: isAddingDocuments,
                          resetKey: documentUploadResetKey,
                          targetNumber: detail.exemptionNumber,
                          inputId: 'exemptionDocumentUpload',
                          contentSelector: '.application-detail-tabs-column',
                          busy: documentUploadBusy,
                          onOpen: () => setIsAddingDocuments(true),
                          onClose: onCancelDocumentEditing,
                          onDirtyChange: setDocumentUploadDirty,
                          onBusyChange: setDocumentUploadBusy,
                          onUploadComplete: refreshExemptionDocuments,
                          onSaved: (savedCount) =>
                            setActionResult({
                              ...documentsSavedResult(savedCount),
                              source: 'documents',
                            }),
                        }}
                        onOpen={(row, preview) => void onOpenDocument(row, preview)}
                        canDelete={canDeleteExemptionDocuments}
                        removingId={isRemovingDocumentId}
                        onDeleteStart={clearActionResult}
                        onDelete={onRemoveDocument}
                      />
                    </Column>
                  </Grid>
                </TabPanel>
              </ContiguousTabPanels>
            </Tabs>
          </Column>
        </>
      )}
      {applicationPendingRemoval && (
        <ConfirmationModal
          open
          danger
          title="Are you sure you want to remove this application?"
          description={
            <>
              <strong>{applicationPendingRemoval}</strong> will be removed from exemption{' '}
              {currentDetail?.exemptionNumber ?? exemptionNumber ?? ''}.
            </>
          }
          confirmLabel="Remove"
          pendingLabel="Removing…"
          errorTitle="Failed to remove application"
          onClose={() => setApplicationPendingRemoval(null)}
          onConfirm={() => onRemoveApplication(applicationPendingRemoval)}
        />
      )}
      {approvalConfirmationOpen &&
        approvalConfirmationTarget === currentDetail?.exemptionNumber && (
          <ExemptionApprovalModal
            exemptionNumbers={[currentDetail.exemptionNumber]}
            onApprove={onApproveExemption}
            onComplete={(report) => {
              if (approvalTargetRef.current === currentDetail.exemptionNumber) {
                // One exemption always produces one result.
                const result = exemptionApprovalResults(report)[0]
                setActionResult(result ? { ...result, source: 'approval' } : null)
              }
            }}
            onClose={() => closeApprovalConfirmation(currentDetail.exemptionNumber)}
            onBusyChange={setApprovalDialogBusy}
          />
        )}
      {showPermitCreationConfirmation && currentDetail && (
        <Modal
          open
          passiveModal
          size="sm"
          modalHeading="Apply for new permit"
          className="permit-creation-confirmation-modal"
          aria-describedby="permit-creation-confirmation-description"
          onRequestClose={closePermitCreationConfirmation}
        >
          <p id="permit-creation-confirmation-description">
            {currentDetail.blanketOic ? (
              <>
                You're about to start a new permit for Blanket OIC Exemption{' '}
                {currentDetail.exemptionNumber}. The permit is created when you save it, and cannot
                be deleted afterwards.
              </>
            ) : (
              <>
                A new permit will be created for Exemption {currentDetail.exemptionNumber}. Once
                created, a permit cannot be deleted.
              </>
            )}
          </p>
          {(currentDetail.exemptionTypeCode ?? '').trim().toUpperCase() === 'O' && (
            <p>Eligible application scales from this exemption will be added automatically.</p>
          )}
          {actionErrorMessage && (
            <AppNotification
              kind="error"
              title="Action failed"
              subtitle={actionErrorMessage}
              onCloseButtonClick={() => setActionResult(null)}
            />
          )}
          <div className="permit-creation-confirmation-modal__actions">
            <Button
              kind="tertiary"
              size="md"
              disabled={creatingPermit}
              onClick={closePermitCreationConfirmation}
            >
              Cancel
            </Button>
            <Button
              kind="primary"
              size="md"
              disabled={creatingPermit}
              renderIcon={creatingPermit ? PendingIcon : undefined}
              onClick={() => {
                if (currentDetail.blanketOic) {
                  setPermitCreationConfirmationOpen(false)
                  setPermitCreationDestination(
                    `/provincial/exemption/${encodeURIComponent(currentDetail.exemptionNumber)}/permit/new`,
                  )
                } else {
                  void onCreatePermitFromExemption()
                }
              }}
            >
              {creatingPermit
                ? 'Creating…'
                : currentDetail.blanketOic
                  ? 'Continue'
                  : 'Create permit'}
            </Button>
          </div>
        </Modal>
      )}
      {sections.discardModal}
      {applicationDraftDiscardModal}
      {permitCreationDiscardModal}
      <UnsavedChangesGuard
        isDirty={isExemptionDirty}
        isBusy={isExemptionBusy}
        onDiscard={onDiscardExemptionChanges}
        subject="this exemption"
      />
    </Grid>
  )
}

export default ProvincialExemptionDetailsPage
