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
  Download,
  Edit,
  Enterprise,
  Launch,
  Result,
  Rule,
  TrashCan,
  type CarbonIconType,
} from '@carbon/icons-react'
import { AddDocument } from '@carbon/pictograms-react'
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
  Tag,
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
import DetailLoadError from '@/components/DetailLoadError'
import DetailSidePanel from '@/components/DetailSidePanel'
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
import DetailDocumentUploadPanel from '../../components/uploads/DetailDocumentUploadPanel'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import {
  DOCUMENTS_EMPTY_DESCRIPTION,
  formatDocumentSource,
  savedDocumentsTitle,
} from '@/service/document-service-utils'
import { DetailFieldGrid, DetailFieldTile, type DetailField } from '../shared/DetailSections'
import { displayValue } from '@/pages/shared/detail-page-utils'
import { appendSearchParamsToPath } from '@/pages/shared/search-query-utils'
import {
  locationPath,
  readDetailReturnTo,
  withDetailReturnTo,
} from '@/pages/shared/detail-navigation'
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
import { displayTableValue } from '@/utils/text'
import { triggerBrowserDownload } from '@/utils/download'
import { openDocumentPreview } from '@/utils/document-preview'
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
  fetchExemptionBlanketOicTotals,
  fetchExemptionEditContext,
  fetchExemptionPermits,
  removeApplicationFromExemption,
  updateExemption,
  type ExemptionApplicationRow,
  type ExemptionBlanketOicTotals,
  type ExemptionEditContext,
  type ExemptionPermitRow,
} from '@/service/provincial-exemption-detail-service'
import { ReportRequestError, runReport } from '@/service/report-service'
import { requiredLabel } from '@/utils/required-label'

type ExemptionActionResult = ActionResult & { source?: 'documents' }

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

// Exemption details and Fees are edited one at a time, each with its own Save and Cancel.
type ExemptionEditSection = 'summary' | 'fees'

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
  approvedVolume: detail.approvedVolume == null ? '' : String(detail.approvedVolume),
  otherConditions: detail.otherConditions ?? '',
  enableRateOverride: context.rateOverrideEnabled,
  feeRate: context.fixedFeeRate,
  regionNumbers: context.regionNumbers,
})

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
  exemptionCreationNotice?: { exemptionNumber: string }
}

const EXEMPTION_SAVED_RESULT: ActionResult = {
  kind: 'success',
  title: 'The exemption was saved.',
  message: '',
}

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

const formatExemptionVolume = (value: number | string | null | undefined): string => {
  if (value == null || (typeof value === 'string' && !value.trim())) {
    return displayValue(value)
  }
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue.toFixed(1) : displayValue(value)
}

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
  showAgentIndicator?: boolean
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
  showAgentIndicator = false,
}: ExemptionClient): DetailField[] => {
  const locationName =
    locations.find((location) => location.locationCode === locationCode)?.locationName ?? ''
  const loadingValue = (value: string | null | undefined) =>
    isLoading ? 'Loading…' : displayValue(value)

  return [
    { label: 'Client number', value: displayValue(clientNumber) },
    { label: 'Applicant type', value: loadingValue(applicantTypeLabel(applicantType)) },
    {
      label: 'Client location',
      value: loadingValue(clientLocationLabel(locationCode, locationName)),
    },
    { label: 'Contact name', value: loadingValue(contactName) },
    ...(showAgentIndicator
      ? [
          {
            label: 'I am an agent',
            value: loadingValue(isAgentApplicant(applicantType) ? 'Yes' : 'No'),
          },
        ]
      : []),
    {
      label: 'Company name',
      value: loadingValue(companyName || clientData?.companyName),
    },
    { label: 'Address', value: loadingValue(clientData?.address) },
    { label: 'City', value: loadingValue(clientData?.city) },
    { label: 'Province', value: loadingValue(clientData?.province) },
    { label: 'Postal code', value: loadingValue(clientData?.postalCode) },
    { label: 'Country', value: loadingValue(clientData?.country) },
    { label: 'Phone', value: loadingValue(clientData?.phone) },
    { label: 'Fax', value: loadingValue(clientData?.fax) },
    { label: 'Email', value: loadingValue(clientData?.email) },
  ]
}

// The agent is a section of the applicant card, as on the application page, not a second card.
const ExemptionClientTile = ({
  agent,
  ...client
}: ExemptionClient & { agent?: ExemptionClient }) => (
  <DetailFieldTile
    title={client.title}
    icon={<Enterprise size={24} aria-hidden="true" />}
    fields={exemptionClientFields(client)}
  >
    {agent && (
      <section className="detail-subsection" aria-label={agent.title}>
        <h3 className="detail-tile-title">{agent.title}</h3>
        <DetailFieldGrid fields={exemptionClientFields(agent)} />
      </section>
    )}
  </DetailFieldTile>
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

    const canSearchExemptions = canPerform('/exemptionSearch')
    return {
      label: canSearchExemptions ? 'Provincial exemption search' : 'Your landing page',
      to: canSearchExemptions ? '/provincial/exemption' : defaultRoute,
    }
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
  const [blanketOicTotals, setBlanketOicTotals] = useState<ExemptionBlanketOicTotals | null>(null)
  const [containsUnmanu, setContainsUnmanu] = useState<boolean | null>(null)
  const [editContext, setEditContext] = useState<ExemptionEditContext>(EMPTY_EDIT_CONTEXT)
  const [editContextLoaded, setEditContextLoaded] = useState(false)
  const [editContextRefreshing, setEditContextRefreshing] = useState(false)
  const [editForm, setEditForm] = useState<ExemptionEditForm | null>(null)
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
  const [permitCreationUnsavedChangesOpen, setPermitCreationUnsavedChangesOpen] = useState(false)
  const [savingPermitCreationChanges, setSavingPermitCreationChanges] = useState(false)
  const [permitCreationSaveFailed, setPermitCreationSaveFailed] = useState(false)
  const [permitCreationSavedRequiresReload, setPermitCreationSavedRequiresReload] = useState(false)
  const [creatingPermit, setCreatingPermit] = useState(false)
  const [permitCreationDestination, setPermitCreationDestination] = useState<string | null>(null)
  const [createdMinisterialPermit, setCreatedMinisterialPermit] = useState(false)
  const [permitCreationRequiresReload, setPermitCreationRequiresReload] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [applicationNumberToAdd, setApplicationNumberToAdd] = useState('')
  const [addApplicationError, setAddApplicationError] = useState('')
  const [isAddingApplication, setIsAddingApplication] = useState(false)
  const addApplicationButtonRef = useRef<HTMLButtonElement>(null)
  const documentUploadLauncherRef = useRef<HTMLButtonElement>(null)
  const addApplicationInputRef = useRef<HTMLInputElement>(null)
  const [applicationMutationNumber, setApplicationMutationNumber] = useState<string | null>(null)
  const [applicationPendingRemoval, setApplicationPendingRemoval] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [applicationsErrorMessage, setApplicationsErrorMessage] = useState('')
  const [permitsErrorMessage, setPermitsErrorMessage] = useState('')
  const [blanketOicTotalsErrorMessage, setBlanketOicTotalsErrorMessage] = useState('')
  const [actionResult, setActionResult] = useState<ExemptionActionResult | null>(null)
  const documentActionResult = actionResult?.source === 'documents' ? actionResult : null
  const pageActionResult = actionResult?.source === 'documents' ? null : actionResult
  const navigationState = location.state as ExemptionCreationNavigationState | null
  const createdExemptionNumber = navigationState?.exemptionCreationNotice?.exemptionNumber ?? ''
  // Read by the first load, which otherwise clears page results before showing the record.
  const createdExemptionNumberRef = useRef(createdExemptionNumber)
  const actionErrorMessage = actionResult?.kind === 'error' ? actionResult.message : ''
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [documentPendingDeletion, setDocumentPendingDeletion] =
    useState<ProvincialExemptionDocumentRow | null>(null)
  const [isAddingDocuments, setIsAddingDocuments] = useState(false)
  const [documentUploadDirty, setDocumentUploadDirty] = useState(false)
  const [documentUploadBusy, setDocumentUploadBusy] = useState(false)
  const [documentUploadResetKey, setDocumentUploadResetKey] = useState(0)
  const [selectedExemptionTab, selectExemptionTab] = useReloadPreservedTab({
    tabs: EXEMPTION_DETAIL_TAB_SLOTS,
    defaultTab: 'owner',
  })
  const beginDetailRequest = useLatestRequestGuard()
  const beginDocumentOpenRequest = useLatestRequestGuard()
  const pendingDocumentPreviewsRef = useRef(new Set<Window>())
  const currentDetail = detail && String(detail.exemptionNumber) === exemptionNumber ? detail : null
  const clientContextApplication = applications[0] ?? null
  const clientContextHasAgent = isAgentApplicant(clientContextApplication?.applicantTypeCode ?? '')
  const linkedApplicationNumber = clientContextApplication?.applicationNumber.trim() ?? ''
  const exemptionOwnerClientNumber = clientContextApplication?.ownerClientNumber.trim() ?? ''
  const exemptionClientNumber = detail?.ownerClientNumber?.trim() || exemptionOwnerClientNumber
  const exemptionAgentClientNumber = clientContextApplication?.agentClientNumber.trim() ?? ''
  const ownerClientLocationCode = clientContextApplication?.ownerClientLocationCode.trim() ?? ''
  const agentClientLocationCode = clientContextApplication?.agentClientLocationCode.trim() ?? ''
  const isRefreshingDetail = loading && !!currentDetail
  useEffect(() => {
    beginDocumentOpenRequest()
    const pendingPreviews = pendingDocumentPreviewsRef.current
    return () => {
      pendingPreviews.forEach((preview) => preview.close())
      pendingPreviews.clear()
    }
  }, [beginDocumentOpenRequest, exemptionNumber])
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
            label: 'Provincial exemption detail',
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
      setRenamedExemptionNumber(null)
      const isRefreshingCurrentExemption =
        detailRef.current !== null && String(detailRef.current.exemptionNumber) === exemptionNumber
      if (!isRefreshingCurrentExemption) {
        approvalTargetRef.current = null
        setApprovalConfirmationOpen(false)
        setApprovalConfirmationTarget(null)
        setPermitCreationConfirmationOpen(false)
        setPermitCreationUnsavedChangesOpen(false)
        setSavingPermitCreationChanges(false)
        setPermitCreationSaveFailed(false)
        setPermitCreationSavedRequiresReload(false)
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
        setBlanketOicTotals(null)
        setContainsUnmanu(null)
        setEditContext(EMPTY_EDIT_CONTEXT)
        setEditContextLoaded(false)
        setEditContextRefreshing(false)
        setEditForm(null)
        setIsAddingDocuments(false)
        setDocumentsErrorMessage('')
        setApplicationsErrorMessage('')
        setPermitsErrorMessage('')
        setBlanketOicTotalsErrorMessage('')
        setActionResult(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      setDocumentsErrorMessage('')
      setApplicationsErrorMessage('')
      setPermitsErrorMessage('')
      setBlanketOicTotalsErrorMessage('')
      const showCreationNotice = createdExemptionNumberRef.current === exemptionNumber
      if (!showCreationNotice) createdExemptionNumberRef.current = ''
      setActionResult(showCreationNotice ? EXEMPTION_SAVED_RESULT : null)
      if (!isRefreshingCurrentExemption) {
        setEditingSection(null)
        setIsAddingDocuments(false)
        setApplications([])
        setExemptionHolder('')
        setPermitRows([])
        setBlanketOicTotals(null)
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
          setBlanketOicTotals(null)
          setContainsUnmanu(null)
          setEditContext(EMPTY_EDIT_CONTEXT)
          setEditContextLoaded(false)
          setEditForm(null)
          setApplicationsErrorMessage('')
          setPermitsErrorMessage('')
          setBlanketOicTotalsErrorMessage('')
          return
        }

        const [
          documentsResult,
          applicationsResult,
          editContextResult,
          permitsResult,
          blanketOicTotalsResult,
        ] = await Promise.allSettled([
          fetchExemptionDocuments(exemptionNumber),
          fetchExemptionApplications(exemptionNumber),
          fetchExemptionEditContext(exemptionNumber),
          fetchExemptionPermits(exemptionNumber),
          response.blanketOic
            ? fetchExemptionBlanketOicTotals(exemptionNumber)
            : Promise.resolve(null),
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
          setPermitsErrorMessage('')
        } else {
          console.error(permitsResult.reason)
          setPermitRows([])
          setPermitsErrorMessage('Unable to retrieve permits associated with this exemption.')
        }

        if (blanketOicTotalsResult.status === 'fulfilled') {
          setBlanketOicTotals(blanketOicTotalsResult.value)
          setBlanketOicTotalsErrorMessage('')
        } else {
          console.error(blanketOicTotalsResult.reason)
          setBlanketOicTotals(null)
          setBlanketOicTotalsErrorMessage('Unable to retrieve Blanket OIC permit volume totals.')
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
            setBlanketOicTotals(null)
            setContainsUnmanu(null)
            setEditContext(EMPTY_EDIT_CONTEXT)
            setEditContextLoaded(false)
            setEditForm(null)
            setDocumentsErrorMessage('')
            setApplicationsErrorMessage('')
            setPermitsErrorMessage('')
            setBlanketOicTotalsErrorMessage('')
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
      editing &&
      !!currentDetail &&
      !!editForm &&
      !formValuesEqual(editForm, toEditForm(currentDetail, editContext)),
    [currentDetail, editContext, editForm, editing],
  )
  const applicationRelationshipDraftDirty =
    isApplicationApprover && applicationNumberToAdd.trim().length > 0
  const isExemptionDirty =
    isExemptionFormDirty || applicationRelationshipDraftDirty || documentUploadDirty
  // The regions come from the edit context, so its failure is reported by role alone.
  const editContextUnavailableMessage =
    hasExemptionEditRole && !editContextLoaded && !editContextRefreshing && !isRefreshingDetail
      ? 'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.'
      : ''
  const canApproveExemption =
    canPerform('approveExemption', exemptionOrgUnits) &&
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
    savingPermitCreationChanges ||
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
    provincialApplicationNumberFieldError(applicationNumberToAdd) ?? ''
  const addApplicationDisabled =
    Boolean(applicationMutationNumber) ||
    !applicationNumberToAdd.trim() ||
    Boolean(applicationNumberToAddError)
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
    title: 'Applicant client details',
    clientNumber: exemptionOwnerClientNumber,
    applicantType: clientContextApplication?.applicantTypeCode ?? '',
    locationCode: ownerClientLocationCode,
    contactName: clientContextApplication?.ownerContactName ?? '',
    companyName: clientContextApplication?.ownerCompanyName ?? '',
    locations: ownerClientLocations,
    clientData: ownerClientData,
    isLoading: clientContextLoading,
    showAgentIndicator: true,
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

  const feeRateValidationMessage = editForm?.enableRateOverride
    ? feeRateFieldError(editForm.feeRate)
    : ''
  const summaryValidationMessage = useMemo(() => {
    if (!editForm) return 'Exemption values are unavailable.'
    if (!exemptionTypeOptions.some((option) => option.value === editForm.exemptionTypeCode)) {
      return 'Select a valid exemption type.'
    }
    if (!exemptionStatusOptions.some((option) => option.value === editForm.exemptionStatusCode)) {
      return 'Select a valid exemption status.'
    }
    if (persistedStatusCode === 'CAN') {
      // Legacy reopening changes only status; the backend preserves the locked summary fields.
      return editForm.exemptionStatusCode.trim().toUpperCase() === 'NEW'
        ? ''
        : 'Select New to reopen this cancelled exemption.'
    }
    if (currentTypeCode === 'O') {
      if (!editForm.exemptionNumber.trim()) return 'Exemption number is required.'
      if (editForm.exemptionNumber.trim().length > 8) {
        return 'Exemption number must be 8 characters or fewer.'
      }
      if (!ASCII_PATTERN.test(editForm.exemptionNumber.trim())) {
        return 'Exemption number contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.'
      }
      if (isExemptionNumberChanged) {
        if (documentUploadDirty) {
          return 'Submit or reset queued document uploads before changing the exemption number.'
        }
        if (applicationRelationshipDraftDirty) {
          return 'Add or clear the typed application number before changing the exemption number.'
        }
        if (
          documentUploadBusy ||
          applicationMutationNumber !== null ||
          isRemovingDocumentId !== null
        ) {
          return 'Wait for the current document or application change to finish before changing the exemption number.'
        }
      }
    }
    if ((currentTypeCode === 'O' || currentTypeCode === 'B') && !editForm.approvalDate.trim()) {
      return 'Approval date is required.'
    }
    if (isoDateFieldError(editForm.approvalDate)) {
      return 'Approval date must be YYYY-MM-DD.'
    }
    if (isoDateFieldError(editForm.expiryDate)) {
      return 'Expiry date must be YYYY-MM-DD.'
    }
    const approvedVolume = Number(editForm.approvedVolume)
    if (
      !Number.isFinite(approvedVolume) ||
      approvedVolume <= 0 ||
      approvedVolume > 9_999_999.99 ||
      !/^\d{1,7}(\.\d{1,2})?$/.test(editForm.approvedVolume.trim())
    ) {
      return 'Approved volume must be greater than 0, at most 9,999,999.99, and have at most two decimal places.'
    }
    if (!editForm.expiryDate.trim()) return 'Expiry date is required.'
    if (editForm.approvalDate && editForm.expiryDate <= editForm.approvalDate) {
      return 'Expiry date must be after the approval date.'
    }
    if (editForm.otherConditions.length > 250) {
      return 'Conditions must contain at most 250 characters.'
    }
    if (!ASCII_PATTERN.test(editForm.otherConditions.trim())) {
      return 'Conditions contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.'
    }
    if (currentTypeCode === 'B' && editForm.regionNumbers.length === 0) {
      return 'Select at least one region for a Blanket Order in Council exemption.'
    }
    if (
      currentTypeCode === 'B' &&
      editForm.regionNumbers.some(
        (regionNumber) => !regionOptions.some((option) => option.id === regionNumber),
      )
    ) {
      return 'Select valid regions for a Blanket Order in Council exemption.'
    }
    return ''
  }, [
    currentTypeCode,
    editForm,
    exemptionStatusOptions,
    exemptionTypeOptions,
    persistedStatusCode,
    regionOptions,
    isExemptionNumberChanged,
    documentUploadDirty,
    applicationRelationshipDraftDirty,
    documentUploadBusy,
    applicationMutationNumber,
    isRemovingDocumentId,
  ])
  // Each section saves only its own fields, so only those fields can block its Save.
  const formValidationMessage =
    editingSection === 'fees' ? feeRateValidationMessage : summaryValidationMessage

  const unsavedExemptionSaveUnavailableReason =
    (optionsAvailability !== 'available' || requiredExemptionOptionsMissing) && isExemptionFormDirty
      ? 'Authoritative exemption options must load before these changes can be saved.'
      : documentUploadDirty
        ? 'Finish or reset the queued document uploads before leaving, or discard all changes.'
        : applicationRelationshipDraftDirty
          ? 'Add or clear the typed application number before leaving, or discard all changes.'
          : undefined

  // INTENTIONAL_LEGACY_DIVERGENCE(SUBMITTER_EXEMPTION_ATTACHMENTS): as on the server, submitters
  // cannot attach documents to new or Blanket OIC exemptions.
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
  const addExemptionDocumentsButton =
    canUploadExemptionDocuments && !isAddingDocuments ? (
      <Button
        kind="tertiary"
        size="md"
        className="detail-documents-add-button"
        renderIcon={Add}
        ref={documentUploadLauncherRef}
        disabled={documentUploadBusy}
        onClick={() => setIsAddingDocuments(true)}
      >
        Add documents
      </Button>
    ) : null

  const refreshPermitData = useCallback(
    async (currentExemptionNumber: string, blanketOic: boolean) => {
      const [permitsResult, blanketOicTotalsResult] = await Promise.allSettled([
        fetchExemptionPermits(currentExemptionNumber),
        blanketOic ? fetchExemptionBlanketOicTotals(currentExemptionNumber) : Promise.resolve(null),
      ])

      if (permitsResult.status === 'fulfilled') {
        setPermitRows(permitsResult.value)
        setPermitsErrorMessage('')
      } else {
        console.error(permitsResult.reason)
        setPermitRows([])
        setPermitsErrorMessage('Unable to retrieve permits associated with this exemption.')
      }

      if (blanketOicTotalsResult.status === 'fulfilled') {
        setBlanketOicTotals(blanketOicTotalsResult.value)
        setBlanketOicTotalsErrorMessage('')
      } else {
        console.error(blanketOicTotalsResult.reason)
        setBlanketOicTotals(null)
        setBlanketOicTotalsErrorMessage('Unable to retrieve Blanket OIC permit volume totals.')
      }
    },
    [],
  )

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
        await refreshPermitData(nextDetail.exemptionNumber, nextDetail.blanketOic)
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

  const onSaveExemption = useCallback(
    async (
      followRenamedRecord = true,
      onSaved?: (savedDetail: ProvincialExemptionDetail) => void,
    ): Promise<boolean> => {
      if (
        !detail ||
        !editContextLoaded ||
        !editForm ||
        formValidationMessage ||
        saving ||
        requiredExemptionOptionsMissing ||
        optionsAvailability !== 'available'
      )
        return false
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
          setActionResult({ kind: 'error', message: result.errors.join(' ') || result.message })
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
          if (followRenamedRecord) setRenamedExemptionNumber(committedDetail.exemptionNumber)
          setActionResult({ kind: 'success', message: result.message })
          return true
        }
        setDetail(committedDetail)
        setEditContext(committedContext)
        setEditForm(toEditForm(committedDetail, committedContext))
        try {
          await refreshEditableData()
          setActionResult({ kind: 'success', message: result.message })
        } catch (refreshError) {
          console.error(refreshError)
          setApplicationsErrorMessage(
            'Application links changed, but the current links could not be refreshed. Reload the page.',
          )
          setActionResult({
            kind: 'warning',
            message: `${result.message || 'The exemption was saved.'} Current data could not be refreshed; reload before making another change.`,
          })
          return true
        }
        onSaved?.(committedDetail)
        return true
      } catch (error) {
        console.error(error)
        setActionResult({ kind: 'error', message: 'Unable to save the exemption.' })
        return false
      } finally {
        setSaving(false)
      }
    },
    [
      detail,
      editContextLoaded,
      editForm,
      formValidationMessage,
      refreshEditableData,
      saving,
      canManageFeeRate,
      editContext,
      optionsAvailability,
      requiredExemptionOptionsMissing,
      canEditSummaryFields,
      currentTypeCode,
      editingSection,
    ],
  )

  const onDiscardExemptionChanges = useCallback(() => {
    if (detail) {
      setEditForm(toEditForm(detail, editContext))
    }
    setEditingSection(null)
    setIsAddingDocuments(false)
    setActionResult(withoutActionError)
    setDocumentUploadDirty(false)
    setDocumentUploadBusy(false)
    setDocumentUploadResetKey((current) => current + 1)
    setApplicationNumberToAdd('')
    setAddApplicationError('')
  }, [detail, editContext])

  const startEditingSection = useCallback(
    (section: ExemptionEditSection) => {
      if (currentDetail) setEditForm(toEditForm(currentDetail, editContext))
      setEditingSection(section)
    },
    [currentDetail, editContext],
  )

  const onSaveUnsavedExemptionChanges = useCallback(
    async (
      followRenamedRecord = false,
      onSaved?: (savedDetail: ProvincialExemptionDetail) => void,
    ): Promise<boolean> => {
      if (documentUploadDirty) {
        setActionResult({
          kind: 'error',
          message:
            'Queued document uploads must be submitted or reset before leaving this exemption.',
        })
        return false
      }
      if (applicationRelationshipDraftDirty) {
        selectExemptionTab('applications')
        setActionResult({
          kind: 'error',
          message: 'Add the typed application number or clear it before leaving.',
        })
        return false
      }
      return isExemptionFormDirty ? onSaveExemption(followRenamedRecord, onSaved) : true
    },
    [
      applicationRelationshipDraftDirty,
      documentUploadDirty,
      isExemptionFormDirty,
      onSaveExemption,
      selectExemptionTab,
    ],
  )

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

  const closePermitCreationUnsavedChanges = useCallback(() => {
    if (savingPermitCreationChanges) return
    setPermitCreationUnsavedChangesOpen(false)
    setPermitCreationSaveFailed(false)
    setPermitCreationSavedRequiresReload(false)
  }, [savingPermitCreationChanges])

  const onRequestPermitCreation = useCallback(() => {
    if (
      permitCreationActionBusy ||
      (!canStartApplicationBackedPermitCreation && !canStartBlanketOicPermitCreation)
    ) {
      return
    }
    setPermitCreationSaveFailed(false)
    setPermitCreationSavedRequiresReload(false)
    setActionResult(null)
    if (isExemptionDirty) {
      setPermitCreationUnsavedChangesOpen(true)
      return
    }
    setEditingSection(null)
    continuePermitCreation()
  }, [
    canStartApplicationBackedPermitCreation,
    canStartBlanketOicPermitCreation,
    continuePermitCreation,
    isExemptionDirty,
    permitCreationActionBusy,
  ])

  const onDiscardChangesBeforePermitCreation = useCallback(() => {
    if (savingPermitCreationChanges || permitCreationActionBusy) return
    onDiscardExemptionChanges()
    setPermitCreationUnsavedChangesOpen(false)
    setPermitCreationSaveFailed(false)
    setPermitCreationSavedRequiresReload(false)
    continuePermitCreation()
  }, [
    continuePermitCreation,
    onDiscardExemptionChanges,
    permitCreationActionBusy,
    savingPermitCreationChanges,
  ])

  const onSaveChangesBeforePermitCreation = useCallback(async () => {
    if (savingPermitCreationChanges || permitCreationActionBusy) return
    const renamedExemption = isExemptionNumberChanged
    let savedDetail: ProvincialExemptionDetail | null = null
    setSavingPermitCreationChanges(true)
    setPermitCreationSaveFailed(false)
    setPermitCreationSavedRequiresReload(false)
    try {
      const saved = await onSaveUnsavedExemptionChanges(true, (nextDetail) => {
        savedDetail = nextDetail
      })
      if (!saved) {
        setPermitCreationSaveFailed(true)
        return
      }
      if (renamedExemption) {
        setPermitCreationUnsavedChangesOpen(false)
        return
      }
      if (!savedDetail) {
        setPermitCreationSavedRequiresReload(true)
        return
      }
      setPermitCreationUnsavedChangesOpen(false)
      continuePermitCreation(savedDetail)
    } catch {
      setPermitCreationSaveFailed(true)
    } finally {
      setSavingPermitCreationChanges(false)
    }
  }, [
    continuePermitCreation,
    isExemptionNumberChanged,
    onSaveUnsavedExemptionChanges,
    permitCreationActionBusy,
    savingPermitCreationChanges,
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
          'The permit request outcome could not be confirmed. Reload this exemption and check Related permits before trying again.',
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
    if (
      !detail ||
      !applicationNumberToAdd.trim() ||
      applicationNumberToAddError ||
      applicationMutationNumber
    )
      return
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
        addApplicationFailureMessage(
          kind,
          enteredNumber,
          exemptionClientNumber,
          assignedExemptionNumber,
          serverMessage,
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
          kind: 'success',
          message: `Application ${number} linked to the exemption.`,
        })
      } catch (refreshError) {
        console.error(refreshError)
        setActionResult({
          kind: 'warning',
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
    applicationNumberToAddError,
    applications,
    detail,
    exemptionClientNumber,
    refreshEditableData,
  ])

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
            kind: 'success',
            message: `Application ${applicationNumber} removed from the exemption.`,
          })
        } catch (refreshError) {
          console.error(refreshError)
          setApplicationsErrorMessage(
            'Application links changed, but the current links could not be refreshed. Reload the page.',
          )
          setActionResult({
            kind: 'warning',
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
    requestAnimationFrame(() => documentUploadLauncherRef.current?.focus())
  }, [])

  const onOpenDocument = useCallback(
    async (row: ProvincialExemptionDocumentRow, preview: boolean) => {
      if (!exemptionNumber) {
        return
      }
      const isLatestRequest = beginDocumentOpenRequest()
      let previewTarget: Window | null = null
      const closePendingPreview = () => {
        if (previewTarget && pendingDocumentPreviewsRef.current.delete(previewTarget)) {
          previewTarget.close()
        }
      }
      setActionResult(null)
      try {
        if (preview) {
          // Reserve a tab during the click so the asynchronous document fetch can still preview it.
          previewTarget = window.open('about:blank', '_blank')
          if (previewTarget) {
            pendingDocumentPreviewsRef.current.add(previewTarget)
            previewTarget.opener = null
          }
        }
        const result = await openExemptionDocument(row.id, row.name, exemptionNumber)
        if (!isLatestRequest()) {
          closePendingPreview()
          return
        }
        if (preview) {
          openDocumentPreview(result.blob, result.filename || row.name, previewTarget)
        } else {
          triggerBrowserDownload(result.blob, result.filename || row.name)
        }
      } catch (error) {
        closePendingPreview()
        if (!isLatestRequest()) return
        console.error(error)
        setActionResult({
          kind: 'error',
          message: preview
            ? 'Unable to open the selected document.'
            : 'Unable to download the selected document.',
        })
      } finally {
        if (previewTarget) pendingDocumentPreviewsRef.current.delete(previewTarget)
      }
    },
    [beginDocumentOpenRequest, exemptionNumber],
  )

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
            setActionResult({
              kind: 'success',
              title: 'Document deleted.',
              message: '',
              source: 'documents',
            })
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

  return (
    <Grid fullWidth className="default-grid detail-page-grid">
      <Column sm={4} md={8} lg={16}>
        <DetailBreadcrumb
          label="Provincial exemption search"
          to="/provincial/exemption"
          returnTo={detailReturnTo}
        />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <PageHeader
          title={`Exemption ${currentDetail?.exemptionNumber ?? exemptionNumber ?? ''}`.trim()}
          subtitle={`Author: ${displayValue(currentDetail?.author)}`}
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
                    size="sm"
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
                    size="sm"
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
              <ActionResultNotification
                result={pageActionResult}
                onClose={() => setActionResult(null)}
              />
            )}
          {editing &&
            !!formValidationMessage &&
            // The Fees section shows its fee rate error on the field itself.
            editingSection !== 'fees' && (
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
                selectExemptionTab(exemptionDetailTabs[selectedIndex] ?? 'summary')
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
                  <Grid fullWidth className="application-detail-tab-grid">
                    {editingSection === 'summary' && editForm ? (
                      <>
                        <Column sm={4} md={4} lg={8}>
                          <Tile>
                            <h2 className="detail-tile-title">
                              <Rule size={24} aria-hidden="true" />
                              Exemption details
                            </h2>
                            <div className="legacy-search-grid">
                              {currentTypeCode === 'O' && (
                                <TextInput
                                  id="exemptionDetailNumber"
                                  labelText={requiredLabel('Exemption number')}
                                  required
                                  maxLength={8}
                                  value={editForm.exemptionNumber}
                                  disabled={!canEditSummaryFields}
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
                              )}
                              <SearchableSelect
                                id="exemptionDetailType"
                                labelText={requiredLabel('Exemption type')}
                                required
                                value={editForm.exemptionTypeCode}
                                options={editableTypeOptions}
                                disabled={
                                  optionsAvailability !== 'available' ||
                                  exemptionTypeOptions.length === 0 ||
                                  persistedTypeCode === 'B' ||
                                  persistedTypeCode === 'O'
                                }
                                onChange={(value) =>
                                  setEditForm((current) =>
                                    current ? { ...current, exemptionTypeCode: value } : current,
                                  )
                                }
                              />
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
                                onChange={(value) =>
                                  setEditForm((current) =>
                                    current ? { ...current, exemptionStatusCode: value } : current,
                                  )
                                }
                              />
                              <IsoDatePicker
                                id="exemptionDetailApprovalDate"
                                labelText={requiredLabel('Approval date', approvalDateRequired)}
                                required={approvalDateRequired}
                                value={editForm.approvalDate}
                                invalid={
                                  (approvalDateRequired && !editForm.approvalDate.trim()) ||
                                  !!isoDateFieldError(editForm.approvalDate)
                                }
                                invalidText={
                                  !editForm.approvalDate.trim()
                                    ? 'Approval date is required.'
                                    : 'Approval date must be YYYY-MM-DD.'
                                }
                                disabled={!canEditApprovalDate}
                                onChange={(value) =>
                                  setEditForm((current) =>
                                    current ? { ...current, approvalDate: value } : current,
                                  )
                                }
                              />
                              <IsoDatePicker
                                id="exemptionDetailExpiryDate"
                                labelText={requiredLabel('Expiry date', expiryDateRequired)}
                                required={expiryDateRequired}
                                value={editForm.expiryDate}
                                invalid={
                                  (expiryDateRequired && !editForm.expiryDate.trim()) ||
                                  !!isoDateFieldError(editForm.expiryDate)
                                }
                                invalidText={
                                  !editForm.expiryDate.trim()
                                    ? 'Expiry date is required.'
                                    : 'Expiry date must be YYYY-MM-DD.'
                                }
                                disabled={!canEditExpiryDate}
                                onChange={(value) =>
                                  setEditForm((current) =>
                                    current ? { ...current, expiryDate: value } : current,
                                  )
                                }
                              />
                              <TextInput
                                id="exemptionDetailApprovedVolume"
                                labelText={requiredLabel('Approved volume (m³)')}
                                aria-required="true"
                                value={editForm.approvedVolume}
                                disabled={!canEditApprovedVolume}
                                onChange={(event) =>
                                  setEditForm((current) =>
                                    current
                                      ? { ...current, approvedVolume: event.target.value }
                                      : current,
                                  )
                                }
                              />
                            </div>
                            {currentTypeCode === 'B' && (
                              <RegionMultiSelect
                                id="exemptionDetailRegions"
                                titleText={requiredLabel('Regions')}
                                required
                                items={regionOptions}
                                selectedItems={selectedRegions}
                                disabled={
                                  optionsAvailability !== 'available' ||
                                  !canEditSummaryFields ||
                                  regionOptions.length === 0
                                }
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
                            )}
                          </Tile>
                        </Column>
                        <Column sm={4} md={4} lg={8}>
                          <Tile>
                            <h2 className="detail-tile-title">Conditions</h2>
                            <TextArea
                              id="exemptionDetailOtherConditions"
                              labelText="Conditions"
                              enableCounter
                              maxCount={250}
                              maxLength={250}
                              value={editForm.otherConditions}
                              disabled={!canEditSummaryFields}
                              onChange={(event) =>
                                setEditForm((current) =>
                                  current
                                    ? { ...current, otherConditions: event.target.value }
                                    : current,
                                )
                              }
                            />
                          </Tile>
                        </Column>
                        <Column sm={4} md={8} lg={16}>
                          <div className="legacy-search-actions">
                            <Button
                              kind="tertiary"
                              size="sm"
                              disabled={saving}
                              onClick={() => {
                                setEditForm(toEditForm(currentDetail, editContext))
                                setEditingSection(null)
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              kind="primary"
                              size="sm"
                              disabled={
                                saving ||
                                Boolean(formValidationMessage) ||
                                requiredExemptionOptionsMissing ||
                                optionsAvailability !== 'available'
                              }
                              renderIcon={saving ? PendingIcon : undefined}
                              onClick={() => void onSaveExemption()}
                            >
                              {saving ? 'Saving…' : 'Save changes'}
                            </Button>
                          </div>
                        </Column>
                      </>
                    ) : (
                      <>
                        <Column sm={4} md={8} lg={16}>
                          <DetailFieldTile
                            title="Exemption details"
                            icon={<Rule size={24} aria-hidden="true" />}
                            headerAction={
                              canSaveExemption && !editing ? (
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  renderIcon={Edit}
                                  onClick={() => startEditingSection('summary')}
                                >
                                  Edit exemption details
                                </Button>
                              ) : undefined
                            }
                            fields={[
                              {
                                label: 'Exemption number',
                                value: displayValue(detail.exemptionNumber),
                              },
                              {
                                label: 'Type',
                                value: displayValue(
                                  detail.exemptionTypeDescription ?? detail.exemptionTypeCode,
                                ),
                              },
                              {
                                label: 'Status',
                                value: displayValue(
                                  detail.exemptionStatusDescription ?? detail.exemptionStatusCode,
                                ),
                              },
                              { label: 'Author', value: displayValue(detail.author) },
                              {
                                label: 'Exemption holder',
                                value: displayValue(
                                  exemptionHolder.trim() ||
                                    detail.ownerClientNumber?.trim() ||
                                    exemptionOwnerClientNumber,
                                ),
                              },
                              ...(showAgent
                                ? [
                                    {
                                      label: 'Agent client number',
                                      value: displayValue(detail.agentClientNumber),
                                    },
                                  ]
                                : []),
                              {
                                label: 'Approval date',
                                value: detail.approvalDate
                                  ? displayValue(detail.approvalDate)
                                  : 'Not approved',
                              },
                              { label: 'Expiry date', value: displayValue(detail.expiryDate) },
                              { label: 'Region', value: displayValue(exemptionRegionNames) },
                              {
                                label: 'Approved volume (m³)',
                                value: formatExemptionVolume(detail.approvedVolume),
                              },
                              {
                                label: 'Used volume (m³)',
                                value: formatExemptionVolume(detail.usedVolume),
                              },
                              {
                                label: 'Remaining volume (m³)',
                                value: formatExemptionVolume(detail.remainingVolume),
                              },
                              {
                                label: 'Blanket Order in Council',
                                value: (
                                  <Tag type={detail.blanketOic ? 'green' : 'gray'}>
                                    {detail.blanketOic ? 'Yes' : 'No'}
                                  </Tag>
                                ),
                              },
                            ]}
                          />
                        </Column>

                        <Column sm={4} md={8} lg={16}>
                          <DetailFieldTile
                            title="Conditions"
                            fields={[
                              {
                                label: 'Conditions',
                                value: displayValue(detail.otherConditions),
                              },
                            ]}
                          />
                        </Column>
                      </>
                    )}
                  </Grid>
                </TabPanel>
                {showApplications && (
                  <TabPanel key="applications" className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <div className="detail-section-card__header">
                            <h2 className="detail-tile-title">
                              <Result size={24} aria-hidden="true" />
                              Applications
                            </h2>
                            {canLinkApplications && (
                              <Button
                                kind="tertiary"
                                size="sm"
                                ref={addApplicationButtonRef}
                                onClick={() => {
                                  setAddApplicationError('')
                                  setIsAddingApplication(true)
                                }}
                              >
                                Add application
                              </Button>
                            )}
                          </div>
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
                                  onClick: () => {
                                    setApplicationNumberToAdd('')
                                    setAddApplicationError('')
                                    setIsAddingApplication(false)
                                  },
                                },
                                {
                                  label: applicationMutationNumber ? 'Saving…' : 'Save application',
                                  kind: 'primary',
                                  disabled: addApplicationDisabled,
                                  onClick: () => void onAddApplication(),
                                },
                              ]}
                              onClose={() => {
                                setApplicationNumberToAdd('')
                                setAddApplicationError('')
                                setIsAddingApplication(false)
                              }}
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
                                    <TableHeader>Application number</TableHeader>
                                    <TableHeader>Requested volume (m³)</TableHeader>
                                    <TableHeader>Scale volume (m³)</TableHeader>
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
                                                  label: 'Provincial exemption detail',
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
                                        <TableCell>{application.requestedVolume || '-'}</TableCell>
                                        <TableCell>{application.scaleVolume || '-'}</TableCell>
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
                                                    size="sm"
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
                <TabPanel key="permits" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">
                          <Certificate size={24} aria-hidden="true" />
                          Related permits
                        </h2>
                        {editing && (
                          <p className="detail-read-only-note">
                            Permit records are read-only. Use the Exemption details or Fees tab to
                            edit exemption values.
                          </p>
                        )}
                        {(canStartApplicationBackedPermitCreation ||
                          canStartBlanketOicPermitCreation) && (
                          <div className="legacy-search-actions">
                            <Button
                              kind="tertiary"
                              size="sm"
                              disabled={permitCreationActionBusy}
                              onClick={onRequestPermitCreation}
                            >
                              {creatingPermit ? 'Creating permit…' : 'Apply for new permit'}
                            </Button>
                          </div>
                        )}
                        {detail.blanketOic && blanketOicTotalsErrorMessage && (
                          <InlineNotification
                            className="detail-context-notification"
                            kind="warning"
                            title="Blanket OIC totals unavailable"
                            subtitle={blanketOicTotalsErrorMessage}
                            lowContrast
                            hideCloseButton
                          />
                        )}
                        {detail.blanketOic && blanketOicTotals && (
                          <dl
                            className="detail-field-grid"
                            aria-label="Blanket OIC permit volume totals"
                          >
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Requested permit volume (m³)</dt>
                              <dd className="detail-field-value">
                                {displayValue(blanketOicTotals.requestedVolume)}
                              </dd>
                            </div>
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Completed permit volume (m³)</dt>
                              <dd className="detail-field-value">
                                {displayValue(blanketOicTotals.completedVolume)}
                              </dd>
                            </div>
                          </dl>
                        )}
                        {!detail.blanketOic && (
                          <dl
                            className="detail-field-grid"
                            aria-label="Exemption permit volume totals"
                          >
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Requested volume (m³)</dt>
                              <dd className="detail-field-value">
                                {formatExemptionVolume(requestedApplicationVolume)}
                              </dd>
                            </div>
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Approved volume (m³)</dt>
                              <dd className="detail-field-value">
                                {formatExemptionVolume(detail.approvedVolume)}
                              </dd>
                            </div>
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Sum of application scales (m³)</dt>
                              <dd className="detail-field-value">
                                {formatExemptionVolume(detail.usedVolume)}
                              </dd>
                            </div>
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Balance remaining (m³)</dt>
                              <dd className="detail-field-value">
                                {formatExemptionVolume(detail.remainingVolume)}
                              </dd>
                            </div>
                          </dl>
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
                                  <TableHeader>Issued date</TableHeader>
                                  <TableHeader>Actions</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {visiblePermitRows.map((row) => (
                                  <TableRow key={row.permitNumber}>
                                    <TableCell>
                                      {row.permitStatus.trim().toUpperCase() === 'ACTIVE'
                                        ? `${row.permitNumber} (Pending)`
                                        : row.permitNumber}
                                    </TableCell>
                                    <TableCell>{displayValue(row.permitVolume)}</TableCell>
                                    <TableCell>
                                      <StatusTag
                                        status={row.permitStatus}
                                        fallbackLabel="Not provided"
                                      />
                                    </TableCell>
                                    <TableCell>{displayValue(row.permitIssueDate)}</TableCell>
                                    <TableCell>
                                      <DisabledButtonTooltip
                                        disabled={
                                          !canPerform('/permitSearch') ||
                                          !canPerform('/permitDetails')
                                        }
                                        description="You do not have permission to open this permit."
                                      >
                                        <Button
                                          kind="ghost"
                                          size="sm"
                                          disabled={
                                            !canPerform('/permitSearch') ||
                                            !canPerform('/permitDetails')
                                          }
                                          onClick={() =>
                                            navigate(
                                              withCurrentSearch(
                                                `/provincial/permit/${row.permitNumber}`,
                                              ),
                                              {
                                                state: withDetailReturnTo(
                                                  location.state,
                                                  {
                                                    label: 'Provincial exemption detail',
                                                    to: locationPath(location),
                                                  },
                                                  detailReturnTo,
                                                ),
                                              },
                                            )
                                          }
                                        >
                                          Open
                                        </Button>
                                      </DisabledButtonTooltip>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <EmptyState
                            title={
                              permitRows.length > 0 ? 'No permits available' : 'No permits found'
                            }
                            description={
                              permitRows.length > 0
                                ? 'No associated permits are available to your account.'
                                : 'No permits are associated with this exemption.'
                            }
                            headingLevel={3}
                          />
                        )}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                {showFees && (
                  <TabPanel key="fees" className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        {applicationsErrorMessage || !editContextLoaded ? (
                          <Tile>
                            <h2 className="detail-tile-title">
                              <Currency size={24} aria-hidden="true" />
                              Fees
                            </h2>
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
                            <h2 className="detail-tile-title">
                              <Currency size={24} aria-hidden="true" />
                              Fees
                            </h2>
                            <div className="legacy-search-grid">
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
                              {editForm.enableRateOverride && (
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
                              )}
                            </div>
                            <div className="legacy-search-actions">
                              <Button
                                kind="tertiary"
                                size="sm"
                                disabled={saving}
                                onClick={() => {
                                  setEditForm(toEditForm(currentDetail, editContext))
                                  setEditingSection(null)
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={
                                  saving ||
                                  Boolean(formValidationMessage) ||
                                  requiredExemptionOptionsMissing ||
                                  optionsAvailability !== 'available'
                                }
                                renderIcon={saving ? PendingIcon : undefined}
                                onClick={() => void onSaveExemption()}
                              >
                                {saving ? 'Saving…' : 'Save changes'}
                              </Button>
                            </div>
                          </Tile>
                        ) : (
                          <DetailFieldTile
                            title="Fees"
                            icon={<Currency size={24} aria-hidden="true" />}
                            headerAction={
                              canEditFeeOverride && !editing ? (
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  renderIcon={Edit}
                                  onClick={() => startEditingSection('fees')}
                                >
                                  Edit fee override
                                </Button>
                              ) : undefined
                            }
                            fields={[
                              {
                                label: 'Override fee rate?',
                                value: editContext.rateOverrideEnabled ? 'Yes' : 'No',
                              },
                              ...(editContext.rateOverrideEnabled
                                ? [
                                    {
                                      label: 'Fee rate ($/m³)',
                                      value: displayValue(editContext.fixedFeeRate),
                                    },
                                  ]
                                : []),
                            ]}
                          />
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
                      <section
                        id="exemption-documents"
                        className="application-detail-section detail-documents-section"
                        aria-label="Documents"
                      >
                        {documentActionResult && (
                          <ActionResultNotification
                            result={documentActionResult}
                            onClose={() => setActionResult(null)}
                          />
                        )}
                        <div className="detail-section-card__header detail-section-card__header--actions-only">
                          {documentRows.length > 0 && addExemptionDocumentsButton}
                          {isAddingDocuments && canUploadExemptionDocuments && (
                            <DetailDocumentUploadPanel
                              key={`exemption-document-upload-${exemptionNumber}-${documentUploadResetKey}`}
                              workflowType="exemption"
                              targetNumber={detail.exemptionNumber}
                              inputId="exemptionDocumentUpload"
                              disabled={!detail.exemptionNumber}
                              presentation="side-panel"
                              drawer={{
                                contentSelector: '.application-detail-tabs-column',
                                fallbackFocusSelector: '#exemption-documents button',
                                launcherRef: documentUploadLauncherRef,
                              }}
                              initiallyOpen
                              onClose={onCancelDocumentEditing}
                              onDirtyChange={setDocumentUploadDirty}
                              onBusyChange={setDocumentUploadBusy}
                              onUploadComplete={refreshExemptionDocuments}
                              onUploadSuccess={(_, savedCount) =>
                                setActionResult({
                                  kind: 'success',
                                  title: savedDocumentsTitle(savedCount),
                                  message: '',
                                  source: 'documents',
                                })
                              }
                            />
                          )}
                        </div>
                        {documentsErrorMessage ? (
                          <EmptyState
                            title="Documents unavailable"
                            description={documentsErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : documentRows.length > 0 ? (
                          <TableFrame ariaLabel="Exemption document rows">
                            <Table size="md" useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>File name</TableHeader>
                                  <TableHeader>Description</TableHeader>
                                  <TableHeader>Type</TableHeader>
                                  <TableHeader>Actions</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {documentRows.map((row) => (
                                  <TableRow key={row.id}>
                                    <TableCell>{row.name || '-'}</TableCell>
                                    <TableCell>{displayTableValue(row.description)}</TableCell>
                                    <TableCell>{formatDocumentSource(row.source)}</TableCell>
                                    <TableCell>
                                      <div className="legacy-search-actions">
                                        <Button
                                          kind="ghost"
                                          size="sm"
                                          renderIcon={Launch}
                                          onClick={() => void onOpenDocument(row, true)}
                                        >
                                          Open
                                        </Button>
                                        <Button
                                          kind="ghost"
                                          size="sm"
                                          renderIcon={Download}
                                          onClick={() => void onOpenDocument(row, false)}
                                        >
                                          Download
                                        </Button>
                                        {canDeleteExemptionDocuments && (
                                          <Button
                                            kind="danger--ghost"
                                            size="sm"
                                            disabled={
                                              !canDeleteExemptionDocuments ||
                                              row.deletable === false ||
                                              isRemovingDocumentId === row.id
                                            }
                                            title={
                                              row.deletable === false
                                                ? `Delete this document from its ${row.source || 'source'} details page.`
                                                : undefined
                                            }
                                            renderIcon={TrashCan}
                                            onClick={() => {
                                              setActionResult(null)
                                              setDocumentPendingDeletion(row)
                                            }}
                                          >
                                            {isRemovingDocumentId === row.id
                                              ? 'Deleting…'
                                              : 'Delete'}
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <EmptyState
                            title="No documents for this exemption"
                            description={DOCUMENTS_EMPTY_DESCRIPTION}
                            icon={<AddDocument width={48} height={48} />}
                            action={addExemptionDocumentsButton}
                            headingLevel={3}
                          />
                        )}
                      </section>
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
          title="Remove associated application?"
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
      {documentPendingDeletion && (
        <ConfirmationModal
          open
          danger
          title="Are you sure you want to delete this document?"
          description={
            <>
              <strong>{documentPendingDeletion.name || 'This document'}</strong> will be deleted.
              This action cannot be undone.
            </>
          }
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          errorTitle="Failed to delete document"
          onClose={() => setDocumentPendingDeletion(null)}
          onConfirm={() => onRemoveDocument(documentPendingDeletion)}
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
                setActionResult(exemptionApprovalResults(report)[0] ?? null)
              }
            }}
            onClose={() => closeApprovalConfirmation(currentDetail.exemptionNumber)}
            onBusyChange={setApprovalDialogBusy}
          />
        )}
      {permitCreationUnsavedChangesOpen && (
        <Modal
          open
          passiveModal
          size="sm"
          modalHeading={permitCreationSavedRequiresReload ? 'Reload required' : 'Unsaved changes'}
          aria-label={permitCreationSavedRequiresReload ? 'Reload required' : 'Unsaved changes'}
          aria-describedby="permit-creation-unsaved-changes-description"
          className="lexis-unsaved-changes-modal"
          preventCloseOnClickOutside
          onRequestClose={closePermitCreationUnsavedChanges}
        >
          <div className="lexis-unsaved-changes-modal__body">
            <p
              id="permit-creation-unsaved-changes-description"
              className="lexis-unsaved-changes-modal__description"
            >
              {permitCreationSavedRequiresReload
                ? 'The exemption was saved, but its current data could not be refreshed. Reload the page before creating a permit.'
                : unsavedExemptionSaveUnavailableReason
                  ? `You have unsaved changes to this exemption. ${unsavedExemptionSaveUnavailableReason}`
                  : 'You have unsaved changes to this exemption. Save them before creating a permit, discard them and continue, or cancel.'}
            </p>
            {permitCreationSaveFailed && (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="Could not finish saving changes"
                subtitle="Review the page messages, then correct any remaining problem and try again or cancel."
              />
            )}
          </div>
          <div className="lexis-unsaved-changes-modal__actions">
            <Button
              kind="tertiary"
              disabled={savingPermitCreationChanges}
              onClick={closePermitCreationUnsavedChanges}
            >
              {permitCreationSavedRequiresReload ? 'Close' : 'Cancel'}
            </Button>
            {!permitCreationSavedRequiresReload && (
              <Button
                kind="danger--tertiary"
                disabled={permitCreationActionBusy}
                onClick={onDiscardChangesBeforePermitCreation}
              >
                Discard changes
              </Button>
            )}
            {!permitCreationSavedRequiresReload && !unsavedExemptionSaveUnavailableReason && (
              <Button
                kind="primary"
                disabled={permitCreationActionBusy}
                renderIcon={savingPermitCreationChanges ? PendingIcon : undefined}
                onClick={() => void onSaveChangesBeforePermitCreation()}
              >
                {savingPermitCreationChanges ? 'Saving…' : 'Save changes'}
              </Button>
            )}
          </div>
        </Modal>
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
              disabled={creatingPermit}
              onClick={closePermitCreationConfirmation}
            >
              Cancel
            </Button>
            <Button
              kind="primary"
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
      <UnsavedChangesGuard
        isDirty={isExemptionDirty}
        isBusy={
          saving ||
          approving ||
          approvalDialogBusy ||
          creatingPermit ||
          applicationMutationNumber !== null ||
          isRemovingDocumentId !== null ||
          documentUploadBusy
        }
        onSave={onSaveUnsavedExemptionChanges}
        onDiscard={onDiscardExemptionChanges}
        subject="this exemption"
        saveUnavailableReason={unsavedExemptionSaveUnavailableReason}
      />
    </Grid>
  )
}

export default ProvincialExemptionDetailsPage
