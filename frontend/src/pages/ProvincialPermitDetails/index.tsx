import {
  isValidElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Edit, TrashCan } from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
  Loading,
  Select,
  SelectItem,
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
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import { hasProvincialSubmitterRole, hasRole } from '@/context/auth/role-utils'
import ConfirmationModal from '@/components/ConfirmationModal'
import ContentLoadingOverlay from '@/components/ContentLoadingOverlay'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import DetailLoadError from '@/components/DetailLoadError'
import EmptyState from '@/components/EmptyState'
import IsoDatePicker from '@/components/IsoDatePicker'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { AppNotification } from '../../components/AppNotification'
import DetailDocumentUploadPanel from '../../components/uploads/DetailDocumentUploadPanel'
import SearchableSelect from '../../components/SearchableSelect'
import type { ProvincialPermitDetail } from '@/interfaces/LexisDetails'
import { formatDocumentSource } from '@/service/document-service-utils'
import { DetailFieldTile } from '../shared/DetailSections'
import { displayValue, matchesFilter } from '@/pages/shared/detail-page-utils'
import { searchParamsWithValue } from '@/pages/shared/search-query-utils'
import {
  locationPath,
  readDetailReturnTo,
  withDetailReturnTo,
} from '@/pages/shared/detail-navigation'
import {
  atMostTwoDecimalFieldError,
  firstValidationError,
  getVisibleFieldError,
  integerFieldError,
  isoDateFieldError,
  maxLengthFieldError,
  maxNumericValueFieldError,
  numericFieldError,
  positiveNumericFieldError,
  requiredFieldError,
  requiredMaxLengthFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { useReloadPreservedTab } from '@/pages/shared/useReloadPreservedTab'
import {
  fetchProvincialPermitDetail,
  fetchProvincialPermitExemptionContext,
} from '@/service/lexis-detail-service'
import {
  fetchApplicationClientData,
  type ApplicationClientData,
} from '@/service/application-client-lookup-service'
import {
  fetchPermitFeeOverrideContext,
  fetchPermitApprovalEmailDefault,
  fetchPermitDocuments,
  fetchPermitInvoices,
  openPermitDocument,
  releasePermitEditLock,
  removePermitApplicationDocument,
  removePermitDocument,
  removePermitInvoiceDocument,
  sendPermitApprovalEmail,
  sendPermitReviewRequestEmail,
  updatePermitDetail,
  updatePermitShipping,
  type PermitDocumentRow,
  type PermitDetailMutationRequest,
  type PermitDetailMutationResult,
  type PermitFeeOverrideContext,
  type PermitInvoiceRow,
} from '@/service/provincial-permit-documents-invoices-service'
import {
  EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS,
  addApplicationsToPermit,
  addBlanketOicPackage,
  addBlanketOicScale,
  deleteBlanketOicPackage,
  deleteBlanketOicScale,
  fetchBlanketOicPackageEditContext,
  fetchAvailablePermitApplications,
  fetchProvincialPermitGbmsEvents,
  fetchProvincialPermitDetailCoreTabs,
  fetchProvincialPermitFees,
  removeApplicationFromPermit,
  updateBlanketOicPackage,
  updatePermitScaleAttachment,
  type BlanketOicPackageMutationRequest,
  type ProvincialPermitDetailTabsData,
  type ProvincialPermitDetailTabsRequest,
  type ProvincialPermitItemRow,
} from '@/service/provincial-permit-detail-tabs-service'
import { ReportRequestError, runReport } from '@/service/report-service'
import {
  fetchProvincialPermitOptions,
  SEARCH_OPTIONS_UNAVAILABLE_MESSAGE,
  type SearchOption,
} from '@/service/search-options-service'
import {
  fetchShippingReferenceOptions,
  formatShippingReferenceOption,
  shippingReferenceLabel,
  type ShippingReferenceOptions,
} from '@/service/shipping-reference-service'
import { triggerBrowserDownload } from '@/utils/download'
import { formatPermitNumber } from '@/utils/permit'
import { isValidEmail, normalizeTrimmedText } from '@/utils/text'

const formatAmount = (value: number): string => {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const isInvoiceDocumentRow = (row: PermitDocumentRow): boolean => {
  if (row.source?.trim().toLowerCase() === 'invoice') {
    return true
  }
  const normalizedTypeCode = row.typeCode.trim().toUpperCase()
  if (normalizedTypeCode === 'INV' || normalizedTypeCode === 'V') {
    return true
  }

  return row.type.trim().toUpperCase().includes('INVOICE')
}

const isApplicationDocumentRow = (row: PermitDocumentRow): boolean => {
  if (row.source?.trim().toLowerCase() === 'application') {
    return true
  }
  return row.typeCode.trim().toUpperCase() === 'INS'
}

type BlanketOicScaleForm = {
  packageNumber: string
  timberMark: string
  speciesCode: string
  gradeCode: string
  scalePieces: string
  scaleVolume: string
}

type BlanketOicPackageForm = {
  packageNumber: string
  volume: string
  averageLength: string
  averageDiameter: string
  status: string
  comments: string
  reprocessed: string
  ageClass: string
  productType: string
  endUseCode: string
  speciesCodes: string
}

type PermitFeeOverrideForm = PermitFeeOverrideContext

const MAX_OIC_REQUEST_PIECES = 9_999_999_999
const MAX_OIC_REQUEST_VOLUME_LENGTH = 9
const MAX_PERMIT_OVERRIDE_FEE = 9_999_999.99
const MAX_PERMIT_OVERRIDE_COMMENT_LENGTH = 254
const ASCII_PATTERN = /^[\u0000-\u007f]*$/
// Legacy allows an approver to move a permit to EXP; once expired, the record is read-only.
const EDITABLE_PERMIT_STATUS_CODES = new Set(['ACT', 'COM', 'CAN', 'EXP'])
const SERVER_ASSIGNED_PAYMENT_PENDING_STATUS = 'PPD'
const SHIPPING_PERMIT_FIELDS = new Set<PermitDetailFormField>([
  'destinationCompanyName',
  'destinationCountry',
  'transportType',
  'transportName',
  'estimatedShippingDate',
  'portOfExport',
  'otherPortOfExport',
])
const PERMIT_DETAIL_TABS = [
  { id: 'permit', label: 'Permit' },
  { id: 'owner', label: 'Owner' },
  { id: 'agent', label: 'Agent' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'items', label: 'Items' },
  { id: 'documents', label: 'Documents' },
  { id: 'fees', label: 'Fees' },
  { id: 'gbms', label: 'GBMS' },
  // INTENTIONAL_LEGACY_DIVERGENCE(PERMIT_INVOICE_VISIBILITY):
  // Modern permit detail surfaces invoice rows and invoice document actions together.
  { id: 'invoices', label: 'Invoices' },
] as const

type PermitDetailTabId = (typeof PERMIT_DETAIL_TABS)[number]['id']
type DeferredPermitTabId = Extract<PermitDetailTabId, 'fees' | 'documents' | 'invoices'>
const PERMIT_DETAIL_TAB_IDS: readonly PermitDetailTabId[] = PERMIT_DETAIL_TABS.map(({ id }) => id)

const ContiguousTabPanels = ({
  children,
  order,
}: {
  children: ReactNode
  order: readonly PermitDetailTabId[]
}) => {
  const panels = (Array.isArray(children) ? children.flat() : [children]).filter(isValidElement)
  const panelsByTab = new Map(
    panels.filter((panel) => panel.key !== null).map((panel) => [String(panel.key), panel]),
  )
  return <TabPanels>{order.map((tab) => panelsByTab.get(tab))}</TabPanels>
}

const EMPTY_DEFERRED_PERMIT_TAB_STATE: Record<DeferredPermitTabId, boolean> = {
  fees: false,
  documents: false,
  invoices: false,
}

const EMPTY_BLANKET_OIC_SCALE_FORM: BlanketOicScaleForm = {
  packageNumber: '',
  timberMark: '',
  speciesCode: '',
  gradeCode: '',
  scalePieces: '',
  scaleVolume: '',
}

const EMPTY_BLANKET_OIC_PACKAGE_FORM: BlanketOicPackageForm = {
  packageNumber: '',
  volume: '0.0',
  averageLength: '',
  averageDiameter: '',
  status: 'ACT',
  comments: '',
  reprocessed: 'N',
  ageClass: 'O',
  productType: 'H',
  endUseCode: '',
  speciesCodes: '',
}

const fetchPermitClientData = (
  clientNumber: string | null,
  clientLocationCode: string | null,
  permitNumber: string,
): Promise<ApplicationClientData | null> => {
  if (!clientNumber || !clientLocationCode) {
    return Promise.resolve(null)
  }

  return fetchApplicationClientData(clientNumber, clientLocationCode, { permitNumber })
}

type PermitClientTileProps = {
  title: string
  clientNumber: string | null
  locationCode: string | null
  clientData: ApplicationClientData | null
  isLoading: boolean
}

const PermitClientTile = ({
  title,
  clientNumber,
  locationCode,
  clientData,
  isLoading,
}: PermitClientTileProps) => (
  <DetailFieldTile
    title={title}
    fields={[
      { label: 'Client number', value: displayValue(clientNumber) },
      { label: 'Location', value: displayValue(locationCode) },
      {
        label: 'Company name',
        value: isLoading ? 'Loading…' : displayValue(clientData?.companyName),
      },
      { label: 'Address', value: isLoading ? 'Loading…' : displayValue(clientData?.address) },
      { label: 'City', value: isLoading ? 'Loading…' : displayValue(clientData?.city) },
      { label: 'Province', value: isLoading ? 'Loading…' : displayValue(clientData?.province) },
      {
        label: 'Postal code',
        value: isLoading ? 'Loading…' : displayValue(clientData?.postalCode),
      },
      { label: 'Country', value: isLoading ? 'Loading…' : displayValue(clientData?.country) },
      { label: 'Phone', value: isLoading ? 'Loading…' : displayValue(clientData?.phone) },
      { label: 'Fax', value: isLoading ? 'Loading…' : displayValue(clientData?.fax) },
      { label: 'Email', value: isLoading ? 'Loading…' : displayValue(clientData?.email) },
    ]}
  />
)

type PermitDetailFormField =
  | 'permitNumber'
  | 'permitStatus'
  | 'permitSubmitDate'
  | 'permitIssueDate'
  | 'permitExpiryDate'
  | 'permitRequestDate'
  | 'exemptionNumber'
  | 'permitReceiptNo'
  | 'permitRemarks'
  | 'permitTotalVolume'
  | 'permitNumberOfPieces'
  | 'oicPermitTotalPieces'
  | 'oicPermitTotalVolume'
  | 'orgUnitNumber'
  | 'ownerClientNumber'
  | 'ownerClientLocation'
  | 'agentClientNumber'
  | 'agentClientLocation'
  | 'destinationCompanyName'
  | 'destinationCountry'
  | 'transportType'
  | 'transportName'
  | 'estimatedShippingDate'
  | 'portOfExport'
  | 'otherPortOfExport'

type PermitDetailForm = Record<PermitDetailFormField, string>

const permitFormSectionChanged = (
  form: PermitDetailForm,
  baseline: PermitDetailForm,
  shippingFields: boolean,
): boolean =>
  (Object.keys(form) as PermitDetailFormField[]).some(
    (field) =>
      SHIPPING_PERMIT_FIELDS.has(field) === shippingFields && form[field] !== baseline[field],
  )

const mergePermitFormSection = (
  current: PermitDetailForm | null,
  saved: PermitDetailForm,
  shippingFields: boolean,
): PermitDetailForm => {
  if (!current) return saved
  return (Object.keys(saved) as PermitDetailFormField[]).reduce(
    (merged, field) => ({
      ...merged,
      [field]: SHIPPING_PERMIT_FIELDS.has(field) === shippingFields ? saved[field] : current[field],
    }),
    { ...current },
  )
}

const detailValue = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value)

const numericDetailValue = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value)

const oicRequestVolumePrecisionError = (value: string): string | null => {
  if (!value.trim()) {
    return null
  }
  return /^\d+(\.\d{1,2})?$/.test(value.trim())
    ? null
    : 'Permit Request Volume must have no more than 2 decimal places.'
}

const requiredExactLengthFieldError = (
  value: string,
  requiredLength: number,
  label: string,
): string | null => {
  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return `${label} is required.`
  }
  return normalizedValue.length === requiredLength
    ? null
    : `${label} must be exactly ${requiredLength} ${requiredLength === 1 ? 'character' : 'characters'}.`
}

const optionalNumberValue = (value: string): number | null => {
  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return null
  }

  const parsedValue = Number(normalizedValue)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

const optionalIntegerValue = (value: string): number | null => {
  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return null
  }

  const parsedValue = Number(normalizedValue)
  return Number.isInteger(parsedValue) ? parsedValue : null
}

const buildPermitDetailForm = (permitDetail: ProvincialPermitDetail): PermitDetailForm => ({
  permitNumber: detailValue(permitDetail.permitNumber),
  permitStatus: detailValue(permitDetail.permitStatusCode),
  permitSubmitDate: detailValue(permitDetail.applicationDate),
  permitIssueDate: detailValue(permitDetail.issueDate),
  permitExpiryDate: detailValue(permitDetail.expiryDate),
  permitRequestDate: detailValue(
    permitDetail.blanketOic ? permitDetail.receivedDate : permitDetail.applicationDate,
  ),
  exemptionNumber: detailValue(permitDetail.exemptionNumber),
  permitReceiptNo: detailValue(permitDetail.receiptNumber),
  permitRemarks: detailValue(permitDetail.remarks),
  permitTotalVolume: numericDetailValue(permitDetail.permitVolume),
  permitNumberOfPieces: numericDetailValue(permitDetail.numberOfPieces),
  oicPermitTotalPieces: numericDetailValue(permitDetail.oicRequestPieces),
  oicPermitTotalVolume: numericDetailValue(permitDetail.oicRequestVolume),
  orgUnitNumber: detailValue(permitDetail.orgUnitNumber),
  ownerClientNumber: detailValue(permitDetail.ownerClientNumber),
  ownerClientLocation: detailValue(permitDetail.ownerClientLocationCode),
  agentClientNumber: detailValue(permitDetail.applicantClientNumber),
  agentClientLocation: detailValue(permitDetail.agentClientLocationCode),
  destinationCompanyName: detailValue(permitDetail.destinationCompanyName),
  destinationCountry: detailValue(permitDetail.destinationCountryCode),
  transportType: detailValue(permitDetail.transportTypeCode),
  transportName: detailValue(permitDetail.transportName),
  estimatedShippingDate: detailValue(permitDetail.estimatedShippingDate),
  portOfExport: detailValue(permitDetail.portOfExportCode),
  otherPortOfExport: detailValue(permitDetail.otherPortOfExport),
})

const permitMutationRequest = (
  form: PermitDetailMutationRequest,
  blanketOic: boolean,
): PermitDetailMutationRequest =>
  blanketOic
    ? form
    : {
        ...form,
        // Legacy only exposes and accepts these request limits for Blanket OIC permits.
        oicPermitTotalPieces: '',
        oicPermitTotalVolume: '',
      }

const hasPermitExemptionContext = (permitDetail: ProvincialPermitDetail): boolean =>
  permitDetail.approvedExemptionVolume !== null &&
  permitDetail.exemptionVolumeRemaining !== null &&
  permitDetail.exemptionTypeDescription !== null

const withUpdatedPermitDetail = (
  currentDetail: ProvincialPermitDetail,
  form: PermitDetailForm,
  statusOptions: SearchOption[],
  regionOptions: SearchOption[],
): ProvincialPermitDetail => {
  const permitStatusCode = form.permitStatus.trim()
  const selectedStatusLabel = statusOptions.find(
    (option) => option.value.toUpperCase() === permitStatusCode.toUpperCase(),
  )?.label
  const orgUnitNumber = optionalIntegerValue(form.orgUnitNumber)
  const regionChanged = orgUnitNumber !== currentDetail.orgUnitNumber
  const selectedRegionLabel = regionOptions.find(
    (option) => option.value === form.orgUnitNumber.trim(),
  )?.label

  return {
    ...currentDetail,
    permitNumber: optionalIntegerValue(form.permitNumber),
    permitStatusCode: permitStatusCode || null,
    permitStatusDescription:
      permitStatusCode === detailValue(currentDetail.permitStatusCode)
        ? currentDetail.permitStatusDescription
        : selectedStatusLabel || permitStatusCode || null,
    applicationDate: form.permitSubmitDate.trim() || null,
    exemptionNumber: form.exemptionNumber.trim() || null,
    issueDate: form.permitIssueDate.trim() || null,
    expiryDate: form.permitExpiryDate.trim() || null,
    receivedDate: currentDetail.blanketOic
      ? currentDetail.receivedDate
      : form.permitSubmitDate.trim() || null,
    permitVolume: optionalNumberValue(form.permitTotalVolume),
    numberOfPieces: optionalIntegerValue(form.permitNumberOfPieces),
    oicRequestPieces: optionalIntegerValue(form.oicPermitTotalPieces),
    oicRequestVolume: optionalNumberValue(form.oicPermitTotalVolume),
    receiptNumber: form.permitReceiptNo.trim() || null,
    remarks: form.permitRemarks.trim() || null,
    orgUnitNumber,
    region: regionChanged ? selectedRegionLabel || currentDetail.region : currentDetail.region,
    ownerClientNumber: form.ownerClientNumber.trim() || null,
    ownerClientLocationCode: form.ownerClientLocation.trim() || null,
    applicantClientNumber: form.agentClientNumber.trim() || null,
    agentClientLocationCode: form.agentClientLocation.trim() || null,
  }
}

const withUpdatedPermitShipping = (
  currentDetail: ProvincialPermitDetail,
  form: PermitDetailForm,
): ProvincialPermitDetail => ({
  ...currentDetail,
  destinationCompanyName: form.destinationCompanyName.trim() || null,
  destinationCountryCode: form.destinationCountry.trim() || null,
  transportTypeCode: form.transportType.trim() || null,
  transportName: form.transportName.trim() || null,
  portOfExportCode: form.portOfExport.trim() || null,
  otherPortOfExport:
    form.portOfExport.trim().toUpperCase() === 'OT' ? form.otherPortOfExport.trim() || null : null,
  estimatedShippingDate: form.estimatedShippingDate.trim() || null,
})

const withPermitMutationResult = (
  currentDetail: ProvincialPermitDetail,
  result: PermitDetailMutationResult,
): ProvincialPermitDetail => {
  const permitStatus = result.permitStatus?.trim()
  const hasReceiptNumber = result.permitReceiptNo !== undefined
  const hasPermitVolume = result.permitVolume !== undefined
  const hasPermitNumberOfPieces = result.permitNumberOfPieces !== undefined
  if (!permitStatus && !hasReceiptNumber && !hasPermitVolume && !hasPermitNumberOfPieces) {
    return currentDetail
  }

  return {
    ...currentDetail,
    permitStatusCode: permitStatus || currentDetail.permitStatusCode,
    permitStatusDescription:
      !permitStatus || permitStatus === detailValue(currentDetail.permitStatusCode)
        ? currentDetail.permitStatusDescription
        : permitStatus,
    receiptNumber: hasReceiptNumber
      ? result.permitReceiptNo?.trim() || null
      : currentDetail.receiptNumber,
    permitVolume: hasPermitVolume ? (result.permitVolume ?? null) : currentDetail.permitVolume,
    numberOfPieces: hasPermitNumberOfPieces
      ? (result.permitNumberOfPieces ?? null)
      : currentDetail.numberOfPieces,
  }
}

const permitMutationMessage = (result: PermitDetailMutationResult, fallback: string): string =>
  [result.message || fallback, ...result.warnings].filter(Boolean).join(' ')

const ProvincialPermitDetailsPage = () => {
  const { capabilities, canPerform, defaultRoute } = useAuth()
  const location = useLocation()
  const { permitNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const detailReturnTo = readDetailReturnTo(location.state) ?? {
    label: canPerform('/permitSearch') ? 'Provincial permit search' : 'Your landing page',
    to: canPerform('/permitSearch') ? '/provincial/permit' : defaultRoute,
  }
  const [selectedPermitTabId, selectPermitTab] = useReloadPreservedTab({
    tabs: PERMIT_DETAIL_TAB_IDS,
    defaultTab: 'permit',
  })
  const [detail, setDetail] = useState<ProvincialPermitDetail | null>(null)
  const [tabsData, setTabsData] = useState<ProvincialPermitDetailTabsData | null>(null)
  const [ownerClientData, setOwnerClientData] = useState<ApplicationClientData | null>(null)
  const [agentClientData, setAgentClientData] = useState<ApplicationClientData | null>(null)
  const [isClientDataLoading, setIsClientDataLoading] = useState(false)
  const [clientDataRequested, setClientDataRequested] = useState(false)
  const [documentRows, setDocumentRows] = useState<PermitDocumentRow[]>([])
  const [invoiceRows, setInvoiceRows] = useState<PermitInvoiceRow[]>([])
  const [permitForm, setPermitForm] = useState<PermitDetailForm | null>(null)
  const [feeOverrideContext, setFeeOverrideContext] = useState<PermitFeeOverrideContext | null>(
    null,
  )
  const [editContextLoaded, setEditContextLoaded] = useState(false)
  const [editContextLoadFailed, setEditContextLoadFailed] = useState(false)
  const [feeOverrideForm, setFeeOverrideForm] = useState<PermitFeeOverrideForm | null>(null)
  const [isEditingPermit, setIsEditingPermit] = useState(false)
  const [isEditingShipping, setIsEditingShipping] = useState(false)
  const [isEditingFeeOverride, setIsEditingFeeOverride] = useState(false)
  const [isEditingPermitDocuments, setIsEditingPermitDocuments] = useState(false)
  const [isEditingInvoiceDocuments, setIsEditingInvoiceDocuments] = useState(false)
  const [isSavingPermit, setIsSavingPermit] = useState(false)
  const [isSavingShipping, setIsSavingShipping] = useState(false)
  const [isSavingFeeOverride, setIsSavingFeeOverride] = useState(false)
  const [isOpeningPermitReport, setIsOpeningPermitReport] = useState(false)
  const [isSendingPermitEmail, setIsSendingPermitEmail] = useState(false)
  const [permitApprovalEmailOpen, setPermitApprovalEmailOpen] = useState(false)
  const [permitApprovalEmailAddress, setPermitApprovalEmailAddress] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [permitExemptionContextReady, setPermitExemptionContextReady] = useState(false)
  const [isPermitTablesLoading, setIsPermitTablesLoading] = useState(false)
  const [permitTablesErrorMessage, setPermitTablesErrorMessage] = useState('')
  const [gbmsErrorMessage, setGbmsErrorMessage] = useState('')
  const [permitFeesErrorMessage, setPermitFeesErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [invoicesErrorMessage, setInvoicesErrorMessage] = useState('')
  const [deferredPermitTabLoaded, setDeferredPermitTabLoaded] = useState(
    EMPTY_DEFERRED_PERMIT_TAB_STATE,
  )
  const [deferredPermitTabLoading, setDeferredPermitTabLoading] = useState(
    EMPTY_DEFERRED_PERMIT_TAB_STATE,
  )
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [documentPendingDeletion, setDocumentPendingDeletion] = useState<PermitDocumentRow | null>(
    null,
  )
  const [isUpdatingScaleId, setIsUpdatingScaleId] = useState<string | null>(null)
  const [isDeletingBoicScaleId, setIsDeletingBoicScaleId] = useState<string | null>(null)
  const [boicScalePendingRemoval, setBoicScalePendingRemoval] =
    useState<ProvincialPermitItemRow | null>(null)
  const [isSavingBoicScale, setIsSavingBoicScale] = useState(false)
  const [boicPackageForm, setBoicPackageForm] = useState<BlanketOicPackageForm>(
    EMPTY_BLANKET_OIC_PACKAGE_FORM,
  )
  const [boicPackageBaselineForm, setBoicPackageBaselineForm] = useState<BlanketOicPackageForm>(
    EMPTY_BLANKET_OIC_PACKAGE_FORM,
  )
  const [editingBoicPackageNumber, setEditingBoicPackageNumber] = useState<string | null>(null)
  const [isLoadingBoicPackage, setIsLoadingBoicPackage] = useState(false)
  const [isSavingBoicPackage, setIsSavingBoicPackage] = useState(false)
  const [isDeletingBoicPackageNumber, setIsDeletingBoicPackageNumber] = useState<string | null>(
    null,
  )
  const [boicPackageNumberPendingDeletion, setBoicPackageNumberPendingDeletion] = useState<
    string | null
  >(null)
  const [availablePermitApplications, setAvailablePermitApplications] = useState<string[]>([])
  const [permitApplicationToAdd, setPermitApplicationToAdd] = useState('')
  const [hasLoadedAvailablePermitApplications, setHasLoadedAvailablePermitApplications] =
    useState(false)
  const [isLoadingAvailableApplications, setIsLoadingAvailableApplications] = useState(false)
  const [isSavingPermitApplication, setIsSavingPermitApplication] = useState(false)
  const [isRemovingPermitApplication, setIsRemovingPermitApplication] = useState<string | null>(
    null,
  )
  const [permitApplicationPendingRemoval, setPermitApplicationPendingRemoval] = useState<
    string | null
  >(null)
  const [boicScaleForm, setBoicScaleForm] = useState<BlanketOicScaleForm>(
    EMPTY_BLANKET_OIC_SCALE_FORM,
  )
  const [boicScaleBaselineForm, setBoicScaleBaselineForm] = useState<BlanketOicScaleForm>(
    EMPTY_BLANKET_OIC_SCALE_FORM,
  )
  const [permitDocumentUploadDirty, setPermitDocumentUploadDirty] = useState(false)
  const [permitDocumentUploadBusy, setPermitDocumentUploadBusy] = useState(false)
  const [invoiceDocumentUploadDirty, setInvoiceDocumentUploadDirty] = useState(false)
  const [invoiceDocumentUploadBusy, setInvoiceDocumentUploadBusy] = useState(false)
  const [permitDocumentUploadResetKey, setPermitDocumentUploadResetKey] = useState(0)
  const [invoiceDocumentUploadResetKey, setInvoiceDocumentUploadResetKey] = useState(0)
  const [touchedPermitFields, setTouchedPermitFields] = useState<
    TouchedFields<PermitDetailFormField>
  >({})
  const [showPermitValidationErrors, setShowPermitValidationErrors] = useState(false)
  const [shippingReferences, setShippingReferences] = useState<ShippingReferenceOptions | null>(
    null,
  )
  const [isShippingReferencesLoading, setIsShippingReferencesLoading] = useState(true)
  const [shippingReferencesErrorMessage, setShippingReferencesErrorMessage] = useState('')
  const [permitStatusOptions, setPermitStatusOptions] = useState<SearchOption[]>([])
  const [permitRegionOptions, setPermitRegionOptions] = useState<SearchOption[]>([])
  const [isPermitOptionsLoading, setIsPermitOptionsLoading] = useState(true)
  const [permitOptionsUnavailable, setPermitOptionsUnavailable] = useState(false)
  const [permitOptionsErrorMessage, setPermitOptionsErrorMessage] = useState('')
  const beginDetailRequest = useLatestRequestGuard()
  const beginDocumentRefreshRequest = useLatestRequestGuard()
  const beginPermitFeesRequest = useLatestRequestGuard()
  const beginPermitDocumentsRequest = useLatestRequestGuard()
  const beginPermitInvoicesRequest = useLatestRequestGuard()
  const beginPermitGbmsRequest = useLatestRequestGuard()
  const beginPermitMutationRequest = useLatestRequestGuard()
  const beginBoicPackageEditRequest = useLatestRequestGuard()
  const beginAvailablePermitApplicationsRequest = useLatestRequestGuard()
  const deferredPermitTabLoadsRef = useRef(new Set<DeferredPermitTabId>())
  const loadedDeferredPermitTabsRef = useRef(new Set<DeferredPermitTabId>())
  const permitMutationInFlightRef = useRef(false)
  const tryBeginPermitMutation = useCallback(() => {
    if (permitMutationInFlightRef.current) return null
    permitMutationInFlightRef.current = true
    return beginPermitMutationRequest()
  }, [beginPermitMutationRequest])
  const endPermitMutation = useCallback(() => {
    permitMutationInFlightRef.current = false
  }, [])
  const itemsFilter = searchParams.get('itemsFilter') ?? ''
  const feesFilter = searchParams.get('feesFilter') ?? ''
  const documentsFilter = searchParams.get('documentsFilter') ?? ''
  const invoicesFilter = searchParams.get('invoicesFilter') ?? ''
  const updateFilterParam = useCallback(
    (key: 'itemsFilter' | 'feesFilter' | 'documentsFilter' | 'invoicesFilter', value: string) => {
      const nextSearchParams = searchParamsWithValue(searchParams, key, value)

      if (nextSearchParams.toString() !== searchParams.toString()) {
        setSearchParams(nextSearchParams, { replace: true })
      }
    },
    [searchParams, setSearchParams],
  )

  const resetPermitRouteDrafts = useCallback(() => {
    beginPermitFeesRequest()
    beginPermitDocumentsRequest()
    beginPermitInvoicesRequest()
    beginPermitGbmsRequest()
    deferredPermitTabLoadsRef.current.clear()
    loadedDeferredPermitTabsRef.current.clear()
    setDeferredPermitTabLoaded(EMPTY_DEFERRED_PERMIT_TAB_STATE)
    setDeferredPermitTabLoading(EMPTY_DEFERRED_PERMIT_TAB_STATE)
    setIsPermitTablesLoading(false)
    setGbmsErrorMessage('')
    void beginBoicPackageEditRequest()
    void beginAvailablePermitApplicationsRequest()
    setBoicPackageForm(EMPTY_BLANKET_OIC_PACKAGE_FORM)
    setBoicPackageBaselineForm(EMPTY_BLANKET_OIC_PACKAGE_FORM)
    setEditingBoicPackageNumber(null)
    setIsLoadingBoicPackage(false)
    setIsSavingBoicPackage(false)
    setIsDeletingBoicPackageNumber(null)
    setBoicPackageNumberPendingDeletion(null)
    setBoicScaleForm(EMPTY_BLANKET_OIC_SCALE_FORM)
    setBoicScaleBaselineForm(EMPTY_BLANKET_OIC_SCALE_FORM)
    setIsSavingBoicScale(false)
    setIsDeletingBoicScaleId(null)
    setPermitDocumentUploadDirty(false)
    setPermitDocumentUploadBusy(false)
    setInvoiceDocumentUploadDirty(false)
    setInvoiceDocumentUploadBusy(false)
    setPermitDocumentUploadResetKey((current) => current + 1)
    setInvoiceDocumentUploadResetKey((current) => current + 1)
    setIsEditingPermitDocuments(false)
    setIsEditingInvoiceDocuments(false)
    setDocumentRows([])
    setInvoiceRows([])
    setClientDataRequested(false)
    setAvailablePermitApplications([])
    setPermitApplicationToAdd('')
    setHasLoadedAvailablePermitApplications(false)
    setIsLoadingAvailableApplications(false)
    setPermitApprovalEmailOpen(false)
    setPermitApprovalEmailAddress('')
  }, [
    beginAvailablePermitApplicationsRequest,
    beginBoicPackageEditRequest,
    beginPermitDocumentsRequest,
    beginPermitFeesRequest,
    beginPermitGbmsRequest,
    beginPermitInvoicesRequest,
  ])

  const loadPermitGbmsEvents = useCallback(
    (request: ProvincialPermitDetailTabsRequest) => {
      const isLatestRequest = beginPermitGbmsRequest()
      void fetchProvincialPermitGbmsEvents(request)
        .then((gbmsEvents) => {
          if (!isLatestRequest()) {
            return
          }
          setTabsData((current) => (current ? { ...current, gbmsEvents } : current))
          setGbmsErrorMessage('')
        })
        .catch((error: unknown) => {
          if (!isLatestRequest()) {
            return
          }
          console.error(error)
          setTabsData((current) => (current ? { ...current, gbmsEvents: [] } : current))
          setGbmsErrorMessage('GBMS invoice history could not be loaded. Please try again later.')
        })
    },
    [beginPermitGbmsRequest],
  )

  useEffect(() => {
    let active = true
    void fetchShippingReferenceOptions()
      .then((options) => {
        if (active) {
          setShippingReferences(options)
        }
      })
      .catch((error: unknown) => {
        console.error(error)
        if (active) {
          setShippingReferences(null)
          setShippingReferencesErrorMessage(
            'Shipping reference options could not be loaded. Shipping changes are unavailable.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsShippingReferencesLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void fetchProvincialPermitOptions()
      .then((options) => {
        if (!active) {
          return
        }
        setPermitStatusOptions(options.permitStatuses)
        setPermitRegionOptions(options.regions)
        setPermitOptionsUnavailable(false)
        setPermitOptionsErrorMessage('')
      })
      .catch(() => {
        if (active) {
          setPermitStatusOptions([])
          setPermitRegionOptions([])
          setPermitOptionsUnavailable(true)
          setPermitOptionsErrorMessage(SEARCH_OPTIONS_UNAVAILABLE_MESSAGE)
        }
      })
      .finally(() => {
        if (active) {
          setIsPermitOptionsLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      const isLatestRequest = beginDetailRequest()
      resetPermitRouteDrafts()
      if (!permitNumber) {
        setErrorMessage('Permit number is missing from the route.')
        setDetail(null)
        setPermitForm(null)
        setFeeOverrideContext(null)
        setFeeOverrideForm(null)
        setEditContextLoaded(false)
        setEditContextLoadFailed(false)
        setPermitExemptionContextReady(false)
        setIsEditingFeeOverride(false)
        setIsEditingPermit(false)
        setIsEditingShipping(false)
        setTabsData(null)
        setPermitTablesErrorMessage('')
        setDocumentRows([])
        setInvoiceRows([])
        setDocumentsErrorMessage('')
        setInvoicesErrorMessage('')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      setPermitTablesErrorMessage('')
      setPermitFeesErrorMessage('')
      setIsPermitTablesLoading(false)
      setPermitExemptionContextReady(false)
      setDocumentsErrorMessage('')
      setInvoicesErrorMessage('')
      setTabsData(null)
      setFeeOverrideContext(null)
      setFeeOverrideForm(null)
      setEditContextLoaded(false)
      setEditContextLoadFailed(false)
      setIsEditingFeeOverride(false)

      try {
        const response = await fetchProvincialPermitDetail(permitNumber)
        if (!isLatestRequest()) {
          return
        }
        setDetail(response)
        setPermitForm(response ? buildPermitDetailForm(response) : null)
        setIsEditingPermit(false)
        setIsEditingShipping(false)

        if (!response) {
          setErrorMessage(`No provincial permit found for ${permitNumber}.`)
          setPermitForm(null)
          setFeeOverrideContext(null)
          setFeeOverrideForm(null)
          setEditContextLoaded(false)
          setEditContextLoadFailed(false)
          setTabsData(null)
          setPermitTablesErrorMessage('')
          setDocumentRows([])
          setInvoiceRows([])
          return
        }

        void fetchPermitFeeOverrideContext(permitNumber)
          .then((feeContext) => {
            if (!isLatestRequest()) {
              return
            }
            setFeeOverrideContext(feeContext)
            setFeeOverrideForm(feeContext)
            setEditContextLoaded(true)
            setEditContextLoadFailed(false)
          })
          .catch((error) => {
            if (!isLatestRequest()) {
              return
            }
            console.error(error)
            setFeeOverrideContext(null)
            setFeeOverrideForm(null)
            setEditContextLoaded(false)
            setEditContextLoadFailed(true)
            setIsEditingFeeOverride(false)
            setIsEditingPermit(false)
            setIsEditingShipping(false)
          })

        const loadPermitTables = (permitDetail: ProvincialPermitDetail) => {
          void fetchProvincialPermitDetailCoreTabs({
            permitNumber,
            receiptNumber: permitDetail.receiptNumber,
            blanketOic: permitDetail.blanketOic,
          })
            .then((tabsResult) => {
              if (!isLatestRequest()) {
                return
              }
              setTabsData(tabsResult)
              setPermitTablesErrorMessage('')
              loadPermitGbmsEvents({
                permitNumber,
                receiptNumber: permitDetail.receiptNumber,
                blanketOic: permitDetail.blanketOic,
              })
            })
            .catch((error) => {
              if (!isLatestRequest()) {
                return
              }
              console.error(error)
              setTabsData(EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS)
              setPermitTablesErrorMessage('Unable to retrieve permit table details.')
            })
            .finally(() => {
              if (isLatestRequest()) {
                setIsPermitTablesLoading(false)
              }
            })
        }

        setIsPermitTablesLoading(true)
        if (!response.exemptionNumber || hasPermitExemptionContext(response)) {
          setPermitExemptionContextReady(true)
          loadPermitTables(response)
          return
        }

        void fetchProvincialPermitExemptionContext(response.exemptionNumber)
          .then((exemptionContext) => {
            if (!isLatestRequest()) {
              return
            }
            const permitDetail = { ...response, ...exemptionContext }
            setDetail(permitDetail)
            setPermitExemptionContextReady(true)
            loadPermitTables(permitDetail)
          })
          .catch((error) => {
            if (!isLatestRequest()) {
              return
            }
            console.error(error)
            setTabsData(EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS)
            setPermitTablesErrorMessage(
              'Unable to retrieve the exemption context required for this permit.',
            )
            setIsPermitTablesLoading(false)
          })
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve provincial permit detail.')
          setDetail(null)
          setPermitForm(null)
          setFeeOverrideContext(null)
          setFeeOverrideForm(null)
          setEditContextLoaded(false)
          setEditContextLoadFailed(false)
          setIsPermitTablesLoading(false)
          setIsEditingFeeOverride(false)
          setIsEditingPermit(false)
          setIsEditingShipping(false)
          setTabsData(null)
          setPermitTablesErrorMessage('')
          setDocumentRows([])
          setInvoiceRows([])
          setDocumentsErrorMessage('')
          setInvoicesErrorMessage('')
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    }

    void load()
  }, [permitNumber, beginDetailRequest, loadPermitGbmsEvents, resetPermitRouteDrafts])

  useEffect(() => {
    return () => {
      if (permitNumber) {
        void releasePermitEditLock(permitNumber)
      }
    }
  }, [permitNumber])

  const hasPermitAgent = Boolean(detail?.applicantClientNumber?.trim())
  const hasGbmsHistory = (tabsData?.gbmsEvents.length ?? 0) > 0 || Boolean(gbmsErrorMessage)
  const permitDetailTabs = PERMIT_DETAIL_TABS.filter(
    ({ id }) => (id !== 'agent' || hasPermitAgent) && (id !== 'gbms' || hasGbmsHistory),
  )
  const activePermitTabId = permitDetailTabs.some(({ id }) => id === selectedPermitTabId)
    ? selectedPermitTabId
    : 'permit'
  const shouldLoadClientData =
    clientDataRequested || activePermitTabId === 'owner' || activePermitTabId === 'agent'

  useEffect(() => {
    let isCancelled = false

    const loadClientData = async () => {
      setOwnerClientData(null)
      setAgentClientData(null)

      if (!detail || !shouldLoadClientData) {
        setIsClientDataLoading(false)
        return
      }

      const ownerClientNumber = detail.ownerClientNumber
      const ownerClientLocationCode = detail.ownerClientLocationCode
      const agentClientNumber = detail.applicantClientNumber
      const agentClientLocationCode = detail.agentClientLocationCode
      const resolvedPermitNumber = String(detail.permitNumber ?? permitNumber ?? '').trim()
      const hasClientLookup =
        (!!ownerClientNumber && !!ownerClientLocationCode) ||
        (!!agentClientNumber && !!agentClientLocationCode)

      if (!hasClientLookup) {
        setIsClientDataLoading(false)
        return
      }

      setIsClientDataLoading(true)
      try {
        const [ownerResult, agentResult] = await Promise.all([
          fetchPermitClientData(ownerClientNumber, ownerClientLocationCode, resolvedPermitNumber),
          fetchPermitClientData(agentClientNumber, agentClientLocationCode, resolvedPermitNumber),
        ])
        if (!isCancelled) {
          setOwnerClientData(ownerResult)
          setAgentClientData(agentResult)
        }
      } catch (error) {
        if (!isCancelled) {
          console.warn('Unable to load permit owner or agent client data.', error)
        }
      } finally {
        if (!isCancelled) {
          setIsClientDataLoading(false)
        }
      }
    }

    void loadClientData()

    return () => {
      isCancelled = true
    }
  }, [detail, permitNumber, shouldLoadClientData])

  const loadDeferredPermitTab = useCallback(
    async (
      tab: DeferredPermitTabId,
      options: { force?: boolean; packageNumbers?: string[] } = {},
    ) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (
        !resolvedPermitNumber ||
        deferredPermitTabLoadsRef.current.has(tab) ||
        (!options.force && loadedDeferredPermitTabsRef.current.has(tab)) ||
        (tab === 'fees' && !options.force && (!tabsData || !!permitTablesErrorMessage))
      ) {
        return
      }

      const isLatestRequest =
        tab === 'fees'
          ? beginPermitFeesRequest()
          : tab === 'documents'
            ? beginPermitDocumentsRequest()
            : beginPermitInvoicesRequest()
      deferredPermitTabLoadsRef.current.add(tab)
      setDeferredPermitTabLoading((current) => ({ ...current, [tab]: true }))

      try {
        if (tab === 'fees') {
          const fees = await fetchProvincialPermitFees({
            permitNumber: resolvedPermitNumber,
            blanketOic: detail?.blanketOic,
            packageNumbers:
              options.packageNumbers ?? tabsData?.packages.map((row) => row.packageNumber),
          })
          if (!isLatestRequest()) return
          setTabsData((current) => (current ? { ...current, fees } : current))
          setPermitFeesErrorMessage('')
        } else if (tab === 'documents') {
          const documentsResult = await fetchPermitDocuments(resolvedPermitNumber)
          if (!isLatestRequest()) return
          setDocumentRows(documentsResult.rows)
          setDocumentsErrorMessage('')
        } else {
          const invoicesResult = await fetchPermitInvoices(resolvedPermitNumber)
          if (!isLatestRequest()) return
          setInvoiceRows(invoicesResult.rows)
          setInvoicesErrorMessage('')
        }

        loadedDeferredPermitTabsRef.current.add(tab)
        setDeferredPermitTabLoaded((current) => ({ ...current, [tab]: true }))
      } catch (error) {
        if (!isLatestRequest()) return
        console.error(error)
        if (tab === 'fees') {
          setPermitFeesErrorMessage('Unable to retrieve permit fee details.')
        } else {
          if (tab === 'documents') {
            setDocumentRows([])
          } else {
            setInvoiceRows([])
          }
          if (tab === 'documents') {
            setDocumentsErrorMessage('Unable to retrieve permit documents.')
          } else {
            setInvoicesErrorMessage('Unable to retrieve permit invoice details.')
          }
        }
      } finally {
        if (isLatestRequest()) {
          deferredPermitTabLoadsRef.current.delete(tab)
          setDeferredPermitTabLoading((current) => ({ ...current, [tab]: false }))
        }
      }
    },
    [
      beginPermitDocumentsRequest,
      beginPermitFeesRequest,
      beginPermitInvoicesRequest,
      detail?.blanketOic,
      detail?.permitNumber,
      permitNumber,
      permitTablesErrorMessage,
      tabsData,
    ],
  )

  useEffect(() => {
    if (
      activePermitTabId === 'fees' ||
      activePermitTabId === 'documents' ||
      activePermitTabId === 'invoices'
    ) {
      void loadDeferredPermitTab(activePermitTabId)
    }
  }, [activePermitTabId, loadDeferredPermitTab])

  const filteredItems = useMemo(() => {
    if (!tabsData) {
      return []
    }

    return tabsData.items.filter((row) =>
      matchesFilter(
        [row.id, row.timberMark, row.species, row.grade, row.pieces, row.volume],
        itemsFilter,
      ),
    )
  }, [itemsFilter, tabsData])

  const blanketOicPackageOptions = useMemo(
    () =>
      (tabsData?.packages ?? [])
        .map((row) => row.packageNumber)
        .filter(Boolean)
        .map((packageNumber) => ({ value: packageNumber, label: packageNumber })),
    [tabsData],
  )
  const selectedBlanketOicPackageNumber =
    boicScaleForm.packageNumber || blanketOicPackageOptions[0]?.value || ''
  const resolvedBlanketOicScaleForm = {
    ...boicScaleForm,
    packageNumber: selectedBlanketOicPackageNumber,
  }
  const resolvedBlanketOicScaleBaselineForm = {
    ...boicScaleBaselineForm,
    packageNumber: boicScaleBaselineForm.packageNumber || blanketOicPackageOptions[0]?.value || '',
  }
  const availablePermitApplicationOptions = useMemo(
    () =>
      availablePermitApplications.map((applicationNumber) => ({
        value: applicationNumber,
        label: applicationNumber,
      })),
    [availablePermitApplications],
  )
  const selectedPermitApplicationToAdd =
    permitApplicationToAdd || availablePermitApplicationOptions[0]?.value || ''
  const associatedPermitApplications =
    tabsData?.applications ?? EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS.applications
  const permitApplicationNumberSummary =
    associatedPermitApplications.length > 0
      ? associatedPermitApplications.join(', ')
      : detail?.applicationNumber
  const associatedPermitPackageNumbers = Array.from(
    new Set((tabsData?.packages ?? []).map((row) => row.packageNumber).filter(Boolean)),
  )
  const permitPackageNumberSummary =
    associatedPermitPackageNumbers.length > 0
      ? associatedPermitPackageNumbers.join(', ')
      : detail?.packageNumber

  const filteredFees = useMemo(() => {
    if (!tabsData) {
      return []
    }

    return tabsData.fees.filter((row) =>
      matchesFilter(
        [
          row.id,
          row.packageNumber,
          row.timberMark,
          row.species,
          row.grade,
          row.amv,
          row.volume,
          row.ewb,
          row.filPercent,
          row.mfPercent,
          row.amount,
          row.amountDisplay,
        ],
        feesFilter,
      ),
    )
  }, [feesFilter, tabsData])
  const showMinistryFeeColumn = filteredFees.some((row) => row.ministryUser)

  const gbmsHistory = tabsData?.gbmsEvents ?? []

  const selectedPermitTabIndex = permitDetailTabs.findIndex(({ id }) => id === activePermitTabId)

  const filteredDocumentRows = useMemo(() => {
    return documentRows.filter((row) =>
      matchesFilter(
        [row.id, row.name, row.description, row.type, row.typeCode, row.source],
        documentsFilter,
      ),
    )
  }, [documentRows, documentsFilter])

  const filteredInvoiceRows = useMemo(() => {
    return invoiceRows.filter((row) =>
      matchesFilter(
        [
          row.invoiceNumber,
          row.exportValueCad,
          row.conversionRate,
          row.feeInLieu,
          row.invoiceFound ? 'found' : 'missing',
        ],
        invoicesFilter,
      ),
    )
  }, [invoiceRows, invoicesFilter])

  const hasPermitMutationPermission =
    canPerform('/filePermitUpload') ||
    canPerform('/fileInvoiceUpload') ||
    canPerform('savePermit') ||
    hasProvincialSubmitterRole(capabilities.roles) ||
    hasRole(capabilities.roles, 'ADMIN') ||
    hasRole(capabilities.roles, 'APPLICATION_APPROVER')
  const permitEditLocked = editContextLoaded && feeOverrideContext?.locked === true
  const permitEditLockMessage = permitEditLocked
    ? feeOverrideContext.lockMessage ||
      'This permit is currently locked for editing by another user.'
    : ''
  const permitEditContextUnavailableMessage =
    hasPermitMutationPermission && editContextLoadFailed
      ? 'Permit edit settings could not be loaded. Editing is unavailable until the data can be retrieved.'
      : ''
  const permitStatusCode = detail?.permitStatusCode?.trim().toUpperCase()
  const requiredPermitOptionsMissing =
    !isPermitOptionsLoading &&
    !permitOptionsUnavailable &&
    (permitStatusOptions.length === 0 ||
      (detail?.blanketOic === true && permitRegionOptions.length === 0))
  const editablePermitStatusOptions = useMemo(() => {
    const currentStatusCode = permitStatusCode ?? ''
    const options = permitStatusOptions.filter((option) => {
      const statusCode = option.value.trim().toUpperCase()
      return (
        EDITABLE_PERMIT_STATUS_CODES.has(statusCode) ||
        (statusCode === SERVER_ASSIGNED_PAYMENT_PENDING_STATUS &&
          currentStatusCode === SERVER_ASSIGNED_PAYMENT_PENDING_STATUS)
      )
    })
    if (
      currentStatusCode &&
      currentStatusCode !== 'EXP' &&
      !options.some((option) => option.value.trim().toUpperCase() === currentStatusCode)
    ) {
      options.push({
        value: currentStatusCode,
        label: detail?.permitStatusDescription?.trim() || currentStatusCode,
      })
    }
    return options
  }, [detail?.permitStatusDescription, permitStatusCode, permitStatusOptions])
  const editablePermitRegionOptions = useMemo(() => {
    const currentOrgUnitNumber = detailValue(detail?.orgUnitNumber).trim()
    if (
      !currentOrgUnitNumber ||
      permitRegionOptions.some((option) => option.value === currentOrgUnitNumber)
    ) {
      return permitRegionOptions
    }
    return [
      ...permitRegionOptions,
      {
        value: currentOrgUnitNumber,
        label: detail?.region?.trim() || currentOrgUnitNumber,
      },
    ]
  }, [detail?.orgUnitNumber, detail?.region, permitRegionOptions])
  const permitExpired = permitStatusCode === 'EXP'
  const canUploadPermitDocuments =
    permitExemptionContextReady &&
    canPerform('/filePermitUpload') &&
    editContextLoaded &&
    !permitEditLocked
  const canUploadInvoiceDocuments =
    permitExemptionContextReady &&
    canPerform('/fileInvoiceUpload') &&
    editContextLoaded &&
    !permitEditLocked &&
    permitStatusCode === 'ACT'
  const canSavePermit =
    permitExemptionContextReady &&
    canPerform('savePermit') &&
    editContextLoaded &&
    !permitEditLocked &&
    !permitExpired
  const canReviewPermits = canPerform('/permitsReview')
  const canCorrectPermitSubmitDate = canSavePermit && canReviewPermits && permitStatusCode === 'ACT'
  const canEditShipping = canSavePermit && permitStatusCode !== 'CAN'
  const invoiceMaterialLocked = permitStatusCode === 'COM' || permitStatusCode === 'PPD'
  const canEnterPaymentReceipt = permitStatusCode === 'PPD' && !detail?.receiptNumber?.trim()
  const canSendPermitApproval =
    canSavePermit && canReviewPermits && (permitStatusCode === 'COM' || permitStatusCode === 'PPD')
  const canRequestPermitReview =
    hasProvincialSubmitterRole(capabilities.roles) &&
    permitExemptionContextReady &&
    editContextLoaded &&
    !permitEditLocked &&
    !permitExpired
  const readOnlyUser = hasRole(capabilities.roles, 'READ_ONLY')
  const adminUser = hasRole(capabilities.roles, 'ADMIN')
  const hasDocumentActorRole =
    adminUser ||
    hasRole(capabilities.roles, 'APPLICATION_APPROVER') ||
    hasProvincialSubmitterRole(capabilities.roles)
  const canDeletePermitDocuments =
    permitExemptionContextReady &&
    editContextLoaded &&
    !permitEditLocked &&
    !!permitStatusCode &&
    (adminUser ||
      (hasDocumentActorRole &&
        !readOnlyUser &&
        (permitStatusCode === 'ACT' || permitStatusCode === 'EXP')))
  const canDeleteInvoiceDocuments =
    permitExemptionContextReady &&
    editContextLoaded &&
    !permitEditLocked &&
    hasDocumentActorRole &&
    (adminUser || !readOnlyUser) &&
    permitStatusCode === 'ACT'
  const canEditPermitDocuments = canUploadPermitDocuments || canDeletePermitDocuments
  const canEditInvoiceDocuments = canUploadInvoiceDocuments
  const scaleAttachmentLockedStatuses = new Set(['COM', 'PPD', 'EXP', 'CAN'])
  const feeOverrideLockedStatuses = new Set(['COM', 'PPD', 'EXP', 'CAN'])
  const canOpenPermitReport = canPerform('/permitReport') && permitStatusCode === 'COM'
  const permitTablesAvailable =
    !isPermitTablesLoading && tabsData !== null && !permitTablesErrorMessage
  const canEditPermitApplications =
    permitTablesAvailable &&
    canSavePermit &&
    !!detail?.permitNumber &&
    !detail?.blanketOic &&
    !scaleAttachmentLockedStatuses.has(permitStatusCode ?? '')
  const canEditNormalPermitScaleRows =
    permitTablesAvailable &&
    canSavePermit &&
    !detail?.blanketOic &&
    !scaleAttachmentLockedStatuses.has(permitStatusCode ?? '')
  const canDisplayNormalPermitScaleMembership = !detail?.blanketOic
  const canEditBlanketOicScaleRows =
    permitTablesAvailable &&
    canSavePermit &&
    !!detail?.blanketOic &&
    !scaleAttachmentLockedStatuses.has(permitStatusCode ?? '')
  const canEditBlanketOicPackages =
    permitTablesAvailable &&
    editContextLoaded &&
    !permitEditLocked &&
    !!detail?.blanketOic &&
    !scaleAttachmentLockedStatuses.has(permitStatusCode ?? '') &&
    (hasRole(capabilities.roles, 'ADMIN') || hasRole(capabilities.roles, 'APPLICATION_APPROVER'))
  // INTENTIONAL_LEGACY_DIVERGENCE(PACKAGE_FIRST_ITEMS_WORKFLOW): Blanket OIC Summary of Scale
  // entry remains hidden until its prerequisite package exists.
  const blanketOicPackageCreationRequired =
    permitTablesAvailable && !!detail?.blanketOic && (tabsData?.packages ?? []).length === 0
  const canEditFeeOverride =
    permitTablesAvailable &&
    canSavePermit &&
    canPerform('/permitsReview') &&
    !feeOverrideLockedStatuses.has(permitStatusCode ?? '')
  const permitBaselineForm = useMemo(
    () => (detail ? buildPermitDetailForm(detail) : null),
    [detail],
  )
  const permitDetailDirty =
    isEditingPermit &&
    !!permitForm &&
    !!permitBaselineForm &&
    permitFormSectionChanged(permitForm, permitBaselineForm, false)
  const permitShippingDirty =
    isEditingShipping &&
    !!permitForm &&
    !!permitBaselineForm &&
    permitFormSectionChanged(permitForm, permitBaselineForm, true)
  const permitStatusTransitionDraft =
    !!permitForm &&
    !!permitBaselineForm &&
    !['COM', 'PPD'].includes(permitBaselineForm.permitStatus.trim().toUpperCase()) &&
    ['COM', 'PPD'].includes(permitForm.permitStatus.trim().toUpperCase())
  const permitInvoicePolicyDirty =
    isEditingPermit &&
    !!permitForm &&
    !!permitBaselineForm &&
    (
      [
        'permitSubmitDate',
        'exemptionNumber',
        'orgUnitNumber',
        'ownerClientNumber',
        'ownerClientLocation',
        'agentClientNumber',
        'agentClientLocation',
      ] as PermitDetailFormField[]
    ).some((field) => permitForm[field] !== permitBaselineForm[field])
  const permitFeeOverrideDirty =
    isEditingFeeOverride &&
    !!feeOverrideForm &&
    !!feeOverrideContext &&
    !formValuesEqual(feeOverrideForm, feeOverrideContext)
  const blanketOicPackageDirty =
    canEditBlanketOicPackages && !formValuesEqual(boicPackageForm, boicPackageBaselineForm)
  const blanketOicScaleDirty =
    canEditBlanketOicScaleRows &&
    !formValuesEqual(resolvedBlanketOicScaleForm, resolvedBlanketOicScaleBaselineForm)
  const permitReviewReady =
    canRequestPermitReview &&
    permitStatusCode === 'ACT' &&
    !isPermitTablesLoading &&
    !!tabsData &&
    (detail?.blanketOic ? !!detail.oicApplicationNumber : tabsData.applications.length > 0) &&
    tabsData.packages.length > 0 &&
    tabsData.items.length > 0
  const totalFeeVolume = (tabsData?.fees ?? []).reduce((total, row) => total + row.volume, 0)
  const calculatedPermitFee = (tabsData?.fees ?? []).reduce((total, row) => total + row.amount, 0)
  const permitFeesMasked = (tabsData?.fees ?? []).some((row) => row.amountDisplay.trim() === '$')
  const feeSummaryStatus =
    permitTablesErrorMessage || permitFeesErrorMessage
      ? 'Unavailable'
      : deferredPermitTabLoading.fees
        ? 'Loading…'
        : deferredPermitTabLoaded.fees
          ? null
          : '—'
  const reloadPermitTabs = useCallback(async () => {
    const resolvedPermitNumber = detail?.permitNumber
      ? String(detail.permitNumber)
      : (permitNumber ?? '')
    if (!resolvedPermitNumber || !detail) {
      return
    }

    beginPermitGbmsRequest()
    setIsPermitTablesLoading(true)
    try {
      const tabsResult = await fetchProvincialPermitDetailCoreTabs({
        permitNumber: resolvedPermitNumber,
        receiptNumber: detail.receiptNumber,
        blanketOic: detail.blanketOic,
      })
      setTabsData(tabsResult)
      setPermitTablesErrorMessage('')
      loadPermitGbmsEvents({
        permitNumber: resolvedPermitNumber,
        receiptNumber: detail.receiptNumber,
        blanketOic: detail.blanketOic,
      })
      if (loadedDeferredPermitTabsRef.current.has('fees')) {
        await loadDeferredPermitTab('fees', {
          force: true,
          packageNumbers: tabsResult.packages.map((row) => row.packageNumber),
        })
      }
    } finally {
      setIsPermitTablesLoading(false)
    }
  }, [beginPermitGbmsRequest, detail, loadDeferredPermitTab, loadPermitGbmsEvents, permitNumber])

  const reloadPermitScaleState = useCallback(async () => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!resolvedPermitNumber) {
      return
    }

    const [, refreshedDetail] = await Promise.all([
      reloadPermitTabs(),
      fetchProvincialPermitDetail(resolvedPermitNumber),
    ])
    if (!refreshedDetail) {
      throw new Error(`No provincial permit found for ${resolvedPermitNumber}.`)
    }

    setDetail((current) =>
      current
        ? {
            ...current,
            permitVolume: refreshedDetail.permitVolume,
            numberOfPieces: refreshedDetail.numberOfPieces,
          }
        : refreshedDetail,
    )
    setPermitForm((current) =>
      current
        ? {
            ...current,
            permitTotalVolume: numericDetailValue(refreshedDetail.permitVolume),
            permitNumberOfPieces: numericDetailValue(refreshedDetail.numberOfPieces),
          }
        : buildPermitDetailForm(refreshedDetail),
    )
  }, [detail?.permitNumber, permitNumber, reloadPermitTabs])

  const reloadAvailablePermitApplications = useCallback(async () => {
    const isLatestRequest = beginAvailablePermitApplicationsRequest()
    if (!canEditPermitApplications || !detail?.exemptionNumber) {
      if (isLatestRequest()) {
        setAvailablePermitApplications([])
        setPermitApplicationToAdd('')
        setHasLoadedAvailablePermitApplications(false)
        setIsLoadingAvailableApplications(false)
      }
      return
    }

    setIsLoadingAvailableApplications(true)
    try {
      const result = await fetchAvailablePermitApplications(
        detail.exemptionNumber,
        associatedPermitApplications,
      )
      if (!isLatestRequest()) return
      setAvailablePermitApplications(result.applicationList)
      setPermitApplicationToAdd((current) =>
        result.applicationList.includes(current) ? current : '',
      )
      setHasLoadedAvailablePermitApplications(true)
    } catch (error) {
      if (!isLatestRequest()) return
      console.error(error)
      setAvailablePermitApplications([])
      setHasLoadedAvailablePermitApplications(false)
    } finally {
      if (isLatestRequest()) {
        setIsLoadingAvailableApplications(false)
      }
    }
  }, [
    associatedPermitApplications,
    beginAvailablePermitApplicationsRequest,
    canEditPermitApplications,
    detail?.exemptionNumber,
  ])

  const loadAvailablePermitApplicationsOnFocus = useCallback(() => {
    if (hasLoadedAvailablePermitApplications || isLoadingAvailableApplications) {
      return
    }
    void reloadAvailablePermitApplications()
  }, [
    hasLoadedAvailablePermitApplications,
    isLoadingAvailableApplications,
    reloadAvailablePermitApplications,
  ])
  const permitFieldErrors = useMemo<FieldErrors<PermitDetailFormField>>(() => {
    if (!permitForm) {
      return {}
    }

    return {
      permitNumber: requiredFieldError(permitForm.permitNumber, 'Permit number') ?? undefined,
      permitStatus: requiredFieldError(permitForm.permitStatus, 'Permit status') ?? undefined,
      orgUnitNumber: detail?.blanketOic
        ? firstValidationError(
            () => requiredFieldError(permitForm.orgUnitNumber, 'Region'),
            () => integerFieldError(permitForm.orgUnitNumber, 'Region'),
            () => positiveNumericFieldError(permitForm.orgUnitNumber),
          )
        : undefined,
      permitIssueDate: isoDateFieldError(permitForm.permitIssueDate) ?? undefined,
      permitExpiryDate: isoDateFieldError(permitForm.permitExpiryDate) ?? undefined,
      permitSubmitDate: isoDateFieldError(permitForm.permitSubmitDate) ?? undefined,
      permitRequestDate: undefined,
      permitReceiptNo:
        firstValidationError(
          () =>
            ASCII_PATTERN.test(permitForm.permitReceiptNo.trim())
              ? null
              : 'Receipt number must contain ASCII characters only.',
          () => maxLengthFieldError(permitForm.permitReceiptNo, 50, 'Receipt number'),
        ) ?? undefined,
      permitRemarks:
        firstValidationError(
          () =>
            ASCII_PATTERN.test(permitForm.permitRemarks.trim())
              ? null
              : 'Permit remarks must contain ASCII characters only.',
          () => maxLengthFieldError(permitForm.permitRemarks, 254, 'Permit remarks'),
        ) ?? undefined,
      estimatedShippingDate: firstValidationError(
        () => requiredFieldError(permitForm.estimatedShippingDate, 'Estimated shipping date'),
        () => isoDateFieldError(permitForm.estimatedShippingDate),
      ),
      destinationCompanyName:
        requiredMaxLengthFieldError(permitForm.destinationCompanyName, 52, 'Destination company') ??
        undefined,
      destinationCountry:
        requiredExactLengthFieldError(permitForm.destinationCountry, 2, 'Destination country') ??
        undefined,
      transportType:
        requiredExactLengthFieldError(permitForm.transportType, 1, 'Transport type') ?? undefined,
      transportName:
        requiredMaxLengthFieldError(permitForm.transportName, 26, 'Transport name') ?? undefined,
      portOfExport:
        requiredExactLengthFieldError(permitForm.portOfExport, 2, 'Port of export') ?? undefined,
      otherPortOfExport:
        permitForm.portOfExport.trim().toUpperCase() === 'OT'
          ? (requiredMaxLengthFieldError(
              permitForm.otherPortOfExport,
              34,
              'Other port of export',
            ) ?? undefined)
          : undefined,
      permitTotalVolume:
        numericFieldError(permitForm.permitTotalVolume, 'Permit volume') ?? undefined,
      permitNumberOfPieces: permitForm.permitNumberOfPieces.trim()
        ? (integerFieldError(permitForm.permitNumberOfPieces, 'Number of pieces') ?? undefined)
        : undefined,
      oicPermitTotalPieces:
        detail?.blanketOic && !invoiceMaterialLocked
          ? firstValidationError(
              () => requiredFieldError(permitForm.oicPermitTotalPieces, 'Permit Request Pieces'),
              () => integerFieldError(permitForm.oicPermitTotalPieces, 'Permit Request Pieces'),
              () => positiveNumericFieldError(permitForm.oicPermitTotalPieces),
              () =>
                maxNumericValueFieldError(
                  permitForm.oicPermitTotalPieces,
                  MAX_OIC_REQUEST_PIECES,
                  'Permit Request Pieces',
                ),
            )
          : undefined,
      oicPermitTotalVolume:
        detail?.blanketOic && !invoiceMaterialLocked
          ? firstValidationError(
              () => requiredFieldError(permitForm.oicPermitTotalVolume, 'Permit Request Volume'),
              () => numericFieldError(permitForm.oicPermitTotalVolume, 'Permit Request Volume'),
              () => positiveNumericFieldError(permitForm.oicPermitTotalVolume),
              () => oicRequestVolumePrecisionError(permitForm.oicPermitTotalVolume),
              () =>
                maxLengthFieldError(
                  permitForm.oicPermitTotalVolume,
                  MAX_OIC_REQUEST_VOLUME_LENGTH,
                  'Permit Request Volume',
                ),
            )
          : undefined,
    }
  }, [detail?.blanketOic, invoiceMaterialLocked, permitForm])
  const hasPermitValidationError = Object.entries(permitFieldErrors).some(
    ([field, error]) => !!error && !SHIPPING_PERMIT_FIELDS.has(field as PermitDetailFormField),
  )
  const hasShippingValidationError = Object.entries(permitFieldErrors).some(
    ([field, error]) => !!error && SHIPPING_PERMIT_FIELDS.has(field as PermitDetailFormField),
  )
  const markPermitFieldTouched = (field: PermitDetailFormField): void => {
    setTouchedPermitFields((current) => ({ ...current, [field]: true }))
  }

  const permitFieldError = (field: PermitDetailFormField): string | undefined =>
    getVisibleFieldError(field, permitFieldErrors, touchedPermitFields, showPermitValidationErrors)

  const setPermitFormField = (field: PermitDetailFormField, value: string): void => {
    setPermitForm((current) => {
      if (!current) return current
      if (field === 'permitSubmitDate' && !detail?.blanketOic) {
        return { ...current, permitSubmitDate: value, permitRequestDate: value }
      }
      return { ...current, [field]: value }
    })
  }

  const resetPermitFormSection = (shippingFields: boolean): void => {
    if (detail) {
      setPermitForm((current) =>
        mergePermitFormSection(current, buildPermitDetailForm(detail), shippingFields),
      )
    }
    setTouchedPermitFields({})
    setShowPermitValidationErrors(false)
  }

  const savePermitMutation = useCallback(
    async (includeShipping = false, deferStatusTransition = false): Promise<boolean> => {
      const targetPermitStatus = permitForm?.permitStatus ?? ''
      const baseRequest: PermitDetailMutationRequest | null =
        detail && permitForm
          ? includeShipping
            ? permitForm
            : mergePermitFormSection(buildPermitDetailForm(detail), permitForm, false)
          : null
      const request =
        baseRequest && deferStatusTransition
          ? { ...baseRequest, permitStatus: detailValue(detail?.permitStatusCode) }
          : baseRequest
      if (
        !detail ||
        !request ||
        !canSavePermit ||
        isSavingPermit ||
        isPermitOptionsLoading ||
        permitOptionsUnavailable ||
        requiredPermitOptionsMissing
      ) {
        return false
      }
      let confirmedRequest: PermitDetailMutationRequest = request

      const isLatestRequest = tryBeginPermitMutation()
      if (!isLatestRequest) {
        setActionErrorMessage('Wait for the current permit change to finish before saving again.')
        return false
      }
      setActionErrorMessage('')
      setActionInfoMessage('')
      setIsSavingPermit(true)
      try {
        const resolvedPermitNumber = String(detail.permitNumber ?? permitNumber ?? '').trim()
        const confirmClientNumber = async (
          clientNumber: string,
          clientLocationCode: string,
        ): Promise<string> => {
          const normalizedClientNumber = clientNumber.trim()
          if (
            !/^\d{1,7}$/.test(normalizedClientNumber) ||
            !clientLocationCode.trim() ||
            !resolvedPermitNumber
          ) {
            return normalizedClientNumber
          }

          const clientData = await fetchApplicationClientData(
            normalizedClientNumber,
            clientLocationCode,
            { permitNumber: resolvedPermitNumber },
          )
          return clientData?.clientNumber.trim() || normalizedClientNumber
        }
        const originalOwnerClientNumber = confirmedRequest.ownerClientNumber
        const originalOwnerClientLocation = confirmedRequest.ownerClientLocation
        const originalAgentClientNumber = confirmedRequest.agentClientNumber
        const originalAgentClientLocation = confirmedRequest.agentClientLocation
        const [ownerClientNumber, agentClientNumber] = await Promise.all([
          confirmClientNumber(originalOwnerClientNumber, originalOwnerClientLocation),
          confirmClientNumber(originalAgentClientNumber, originalAgentClientLocation),
        ])
        confirmedRequest = { ...confirmedRequest, ownerClientNumber, agentClientNumber }
        setPermitForm((current) => {
          if (
            !current ||
            current.ownerClientNumber !== originalOwnerClientNumber ||
            current.ownerClientLocation !== originalOwnerClientLocation ||
            current.agentClientNumber !== originalAgentClientNumber ||
            current.agentClientLocation !== originalAgentClientLocation
          ) {
            return current
          }

          return current.ownerClientNumber === ownerClientNumber &&
            current.agentClientNumber === agentClientNumber
            ? current
            : { ...current, ownerClientNumber, agentClientNumber }
        })

        if (hasPermitValidationError || (includeShipping && hasShippingValidationError)) {
          setShowPermitValidationErrors(true)
          setActionErrorMessage(
            Object.values(permitFieldErrors).find((error): error is string => !!error) ??
              'Please fix validation errors before saving the permit.',
          )
          return false
        }

        const result = await updatePermitDetail(
          permitMutationRequest(confirmedRequest, detail.blanketOic),
        )
        if (!isLatestRequest()) {
          return false
        }
        if (!result.success) {
          setActionErrorMessage(result.errors[0] || result.message || 'Unable to save permit.')
          return false
        }

        const detailWithPermitChanges = withUpdatedPermitDetail(
          detail,
          confirmedRequest,
          editablePermitStatusOptions,
          editablePermitRegionOptions,
        )
        const updatedDetail = withPermitMutationResult(
          includeShipping
            ? withUpdatedPermitShipping(detailWithPermitChanges, confirmedRequest)
            : detailWithPermitChanges,
          result,
        )
        setDetail((current) => {
          if (!current) return current
          const currentWithPermitChanges = withUpdatedPermitDetail(
            current,
            confirmedRequest,
            editablePermitStatusOptions,
            editablePermitRegionOptions,
          )
          return withPermitMutationResult(
            includeShipping
              ? withUpdatedPermitShipping(currentWithPermitChanges, confirmedRequest)
              : currentWithPermitChanges,
            result,
          )
        })
        setPermitForm((current) => {
          const savedForm = includeShipping
            ? buildPermitDetailForm(updatedDetail)
            : mergePermitFormSection(current, buildPermitDetailForm(updatedDetail), false)
          return deferStatusTransition
            ? { ...savedForm, permitStatus: targetPermitStatus }
            : savedForm
        })
        setIsEditingPermit(deferStatusTransition)
        if (includeShipping && !deferStatusTransition) {
          setIsEditingShipping(false)
        }
        setTouchedPermitFields({})
        setShowPermitValidationErrors(false)
        setActionInfoMessage(
          permitMutationMessage(
            result,
            deferStatusTransition
              ? 'Permit fields were saved before the status transition.'
              : includeShipping
                ? 'Permit and shipping saved successfully.'
                : 'Permit saved successfully.',
          ),
        )
        return true
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setActionErrorMessage('Unable to save permit.')
        }
        return false
      } finally {
        endPermitMutation()
        setIsSavingPermit(false)
      }
    },
    [
      canSavePermit,
      detail,
      endPermitMutation,
      editablePermitRegionOptions,
      editablePermitStatusOptions,
      hasPermitValidationError,
      hasShippingValidationError,
      isSavingPermit,
      isPermitOptionsLoading,
      permitOptionsUnavailable,
      requiredPermitOptionsMissing,
      permitFieldErrors,
      permitForm,
      permitNumber,
      tryBeginPermitMutation,
    ],
  )

  const onSaveShipping = useCallback(async (): Promise<boolean> => {
    const request: PermitDetailMutationRequest | null =
      detail && permitForm
        ? mergePermitFormSection(buildPermitDetailForm(detail), permitForm, true)
        : null
    if (!detail || !request || !canEditShipping || !shippingReferences || isSavingShipping) {
      if (canEditShipping && !shippingReferences) {
        setActionErrorMessage(
          'Shipping reference options are unavailable. Reload the page before saving shipping.',
        )
      }
      return false
    }

    if (hasShippingValidationError) {
      setShowPermitValidationErrors(true)
      setActionErrorMessage(
        Object.values(permitFieldErrors).find((error): error is string => !!error) ??
          'Please fix validation errors before saving shipping.',
      )
      return false
    }

    const isLatestRequest = tryBeginPermitMutation()
    if (!isLatestRequest) {
      setActionErrorMessage('Wait for the current permit change to finish before saving again.')
      return false
    }
    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingShipping(true)
    try {
      const result = await updatePermitShipping(request)
      if (!isLatestRequest()) {
        return false
      }
      if (!result.success) {
        setActionErrorMessage(result.errors[0] || result.message || 'Unable to save shipping.')
        return false
      }

      const updatedDetail = withPermitMutationResult(
        withUpdatedPermitShipping(detail, request),
        result,
      )
      setDetail((current) =>
        current
          ? withPermitMutationResult(withUpdatedPermitShipping(current, request), result)
          : current,
      )
      setPermitForm((current) =>
        mergePermitFormSection(current, buildPermitDetailForm(updatedDetail), true),
      )
      setIsEditingShipping(false)
      setTouchedPermitFields({})
      setShowPermitValidationErrors(false)
      setActionInfoMessage(permitMutationMessage(result, 'Shipping saved successfully.'))
      return true
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setActionErrorMessage('Unable to save shipping.')
      }
      return false
    } finally {
      endPermitMutation()
      setIsSavingShipping(false)
    }
  }, [
    canEditShipping,
    detail,
    endPermitMutation,
    hasShippingValidationError,
    isSavingShipping,
    permitFieldErrors,
    permitForm,
    shippingReferences,
    tryBeginPermitMutation,
  ])

  const onSavePermit = useCallback(async (): Promise<boolean> => {
    if (isPermitOptionsLoading || permitOptionsUnavailable || requiredPermitOptionsMissing) {
      setActionErrorMessage(
        permitOptionsUnavailable
          ? SEARCH_OPTIONS_UNAVAILABLE_MESSAGE
          : 'Required permit status or region options are not configured.',
      )
      return false
    }
    const shippingSaved = permitShippingDirty ? await onSaveShipping() : true
    if (!shippingSaved) return false

    const includeShipping = permitShippingDirty
    if (permitStatusTransitionDraft && permitInvoicePolicyDirty) {
      if (!(await savePermitMutation(includeShipping, true))) return false
    }
    return savePermitMutation(includeShipping)
  }, [
    onSaveShipping,
    isPermitOptionsLoading,
    permitOptionsUnavailable,
    requiredPermitOptionsMissing,
    permitInvoicePolicyDirty,
    permitShippingDirty,
    permitStatusTransitionDraft,
    savePermitMutation,
  ])

  const onSaveFeeOverride = useCallback(async (): Promise<boolean> => {
    if (!canEditFeeOverride || !detail || !feeOverrideForm || isSavingFeeOverride) {
      return false
    }

    const normalizedFee = feeOverrideForm.overrideFee.trim()
    const normalizedComment = feeOverrideForm.overrideComment.trim()
    const validationError = firstValidationError(
      () =>
        feeOverrideForm.overrideEnabled ? requiredFieldError(normalizedFee, 'Override fee') : null,
      () =>
        feeOverrideForm.overrideEnabled ? numericFieldError(normalizedFee, 'Override fee') : null,
      () => (feeOverrideForm.overrideEnabled ? positiveNumericFieldError(normalizedFee) : null),
      () =>
        feeOverrideForm.overrideEnabled
          ? maxNumericValueFieldError(normalizedFee, MAX_PERMIT_OVERRIDE_FEE, 'Override fee')
          : null,
      () =>
        feeOverrideForm.overrideEnabled
          ? atMostTwoDecimalFieldError(normalizedFee, 'Override fee')
          : null,
      () =>
        feeOverrideForm.overrideEnabled && !ASCII_PATTERN.test(normalizedComment)
          ? 'Override comment must contain ASCII characters only.'
          : null,
      () =>
        feeOverrideForm.overrideEnabled
          ? maxLengthFieldError(
              normalizedComment,
              MAX_PERMIT_OVERRIDE_COMMENT_LENGTH,
              'Override comment',
            )
          : null,
    )
    if (validationError) {
      setActionErrorMessage(validationError)
      return false
    }

    const request: PermitDetailMutationRequest = {
      ...buildPermitDetailForm(detail),
      overrideInd: String(feeOverrideForm.overrideEnabled),
      overrideFee: feeOverrideForm.overrideEnabled ? normalizedFee : '',
      overrideComment: feeOverrideForm.overrideEnabled ? normalizedComment : '',
    }
    const isLatestRequest = tryBeginPermitMutation()
    if (!isLatestRequest) {
      setActionErrorMessage('Wait for the current permit change to finish before saving again.')
      return false
    }
    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingFeeOverride(true)
    try {
      const result = await updatePermitDetail(permitMutationRequest(request, detail.blanketOic))
      if (!isLatestRequest()) {
        return false
      }
      if (!result.success) {
        setActionErrorMessage(
          result.errors[0] || result.message || 'Unable to save the permit fee override.',
        )
        return false
      }

      const savedContext: PermitFeeOverrideContext = {
        overrideEnabled: feeOverrideForm.overrideEnabled,
        overrideFee: feeOverrideForm.overrideEnabled ? normalizedFee : '',
        overrideComment: feeOverrideForm.overrideEnabled ? normalizedComment : '',
        locked: false,
        lockMessage: '',
      }
      setFeeOverrideContext(savedContext)
      setFeeOverrideForm(savedContext)
      setIsEditingFeeOverride(false)
      setActionInfoMessage(result.message || 'Permit fee override saved successfully.')
      return true
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setActionErrorMessage('Unable to save the permit fee override.')
      }
      return false
    } finally {
      endPermitMutation()
      setIsSavingFeeOverride(false)
    }
  }, [
    canEditFeeOverride,
    detail,
    endPermitMutation,
    feeOverrideForm,
    isSavingFeeOverride,
    tryBeginPermitMutation,
  ])

  const onToggleScaleAttachment = useCallback(
    async (scaleId: string, attachInd: boolean) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (!canEditNormalPermitScaleRows || !resolvedPermitNumber || !scaleId) {
        return
      }

      setActionErrorMessage('')
      setActionInfoMessage('')
      setIsUpdatingScaleId(scaleId)
      try {
        const result = await updatePermitScaleAttachment({
          scaleId,
          permitNumber: resolvedPermitNumber,
          attachInd,
        })
        if (!result.success) {
          setActionErrorMessage(
            result.errors[0] || result.message || 'Unable to update permit item rows.',
          )
          return
        }

        await reloadPermitScaleState()
        setActionInfoMessage(result.message || 'Permit item rows were updated.')
      } catch (error) {
        console.error(error)
        setActionErrorMessage('Unable to update permit item rows.')
      } finally {
        setIsUpdatingScaleId(null)
      }
    },
    [canEditNormalPermitScaleRows, detail?.permitNumber, permitNumber, reloadPermitScaleState],
  )

  const onAddPermitApplication = useCallback(async () => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!canEditPermitApplications || !resolvedPermitNumber || !selectedPermitApplicationToAdd) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingPermitApplication(true)
    try {
      const result = await addApplicationsToPermit({
        permitNumber: resolvedPermitNumber,
        selectedApplications: [selectedPermitApplicationToAdd],
      })
      if (!result.success) {
        setActionErrorMessage(
          result.errors[0] || result.message || 'Unable to add application to the permit.',
        )
        return
      }

      const addedApplicationNumber = selectedPermitApplicationToAdd
      setPermitApplicationToAdd('')
      setAvailablePermitApplications((current) =>
        current.filter((applicationNumber) => applicationNumber !== addedApplicationNumber),
      )
      setTabsData((current) =>
        current && !current.applications.includes(addedApplicationNumber)
          ? { ...current, applications: [...current.applications, addedApplicationNumber] }
          : current,
      )
      try {
        await reloadPermitTabs()
        setActionInfoMessage(result.message || 'Application was added to the permit.')
      } catch (refreshError) {
        console.error(refreshError)
        setPermitTablesErrorMessage(
          'The application was added, but permit tables could not be refreshed. Reload the page.',
        )
        setActionInfoMessage(
          `${result.message || 'Application was added to the permit.'} Reload before changing application links again.`,
        )
      }
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to add application to the permit.')
    } finally {
      setIsSavingPermitApplication(false)
    }
  }, [
    canEditPermitApplications,
    detail?.permitNumber,
    permitNumber,
    reloadPermitTabs,
    selectedPermitApplicationToAdd,
  ])

  const onRemovePermitApplication = useCallback(
    async (applicationNumber: string) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (!canEditPermitApplications || !resolvedPermitNumber || !applicationNumber) {
        throw new Error('This application cannot be removed from the current permit.')
      }

      setActionErrorMessage('')
      setActionInfoMessage('')
      setIsRemovingPermitApplication(applicationNumber)
      try {
        const result = await removeApplicationFromPermit({
          permitNumber: resolvedPermitNumber,
          applicationNumber,
        })
        if (!result.success) {
          throw new Error(
            result.errors[0] || result.message || 'Unable to remove application from the permit.',
          )
        }

        setTabsData((current) =>
          current
            ? {
                ...current,
                applications: current.applications.filter(
                  (currentApplicationNumber) => currentApplicationNumber !== applicationNumber,
                ),
              }
            : current,
        )
        setHasLoadedAvailablePermitApplications(false)
        try {
          await reloadPermitTabs()
          setActionInfoMessage(result.message || 'Application was removed from the permit.')
        } catch (refreshError) {
          console.error(refreshError)
          setPermitTablesErrorMessage(
            'The application was removed, but permit tables could not be refreshed. Reload the page.',
          )
          setActionInfoMessage(
            `${result.message || 'Application was removed from the permit.'} Reload before changing application links again.`,
          )
        }
      } catch (error) {
        console.error(error)
        throw error instanceof Error
          ? error
          : new Error('Unable to remove application from the permit.')
      } finally {
        setIsRemovingPermitApplication(null)
      }
    },
    [canEditPermitApplications, detail?.permitNumber, permitNumber, reloadPermitTabs],
  )

  const setBlanketOicPackageFormField = (
    field: keyof BlanketOicPackageForm,
    value: string,
  ): void => {
    setBoicPackageForm((current) => ({ ...current, [field]: value }))
  }

  const resetBlanketOicPackageForm = useCallback(() => {
    setEditingBoicPackageNumber(null)
    setBoicPackageForm(EMPTY_BLANKET_OIC_PACKAGE_FORM)
    setBoicPackageBaselineForm(EMPTY_BLANKET_OIC_PACKAGE_FORM)
  }, [])

  const onEditBlanketOicPackage = useCallback(
    async (packageNumberToEdit: string) => {
      if (!canEditBlanketOicPackages || !packageNumberToEdit) {
        return
      }
      setActionErrorMessage('')
      resetBlanketOicPackageForm()
      const isLatestRequest = beginBoicPackageEditRequest()
      setIsLoadingBoicPackage(true)
      try {
        const context = await fetchBlanketOicPackageEditContext(packageNumberToEdit)
        if (!isLatestRequest()) return
        setEditingBoicPackageNumber(packageNumberToEdit)
        const loadedPackageForm: BlanketOicPackageForm = {
          packageNumber: context.packageNumber,
          volume: context.volume,
          averageLength: context.averageLength,
          averageDiameter: context.averageDiameter,
          status: context.status || 'ACT',
          comments: context.comments,
          reprocessed: context.reprocessed || 'N',
          ageClass: context.ageClass || 'O',
          productType: context.productType || 'H',
          endUseCode: context.endUseCode,
          speciesCodes: context.speciesCodes.join(', '),
        }
        setBoicPackageForm(loadedPackageForm)
        setBoicPackageBaselineForm(loadedPackageForm)
      } catch (error) {
        if (!isLatestRequest()) return
        console.error(error)
        resetBlanketOicPackageForm()
        setActionErrorMessage('Unable to load the Blanket OIC package for editing.')
      } finally {
        if (isLatestRequest()) {
          setIsLoadingBoicPackage(false)
        }
      }
    },
    [beginBoicPackageEditRequest, canEditBlanketOicPackages, resetBlanketOicPackageForm],
  )

  const onSaveBlanketOicPackage = useCallback(async (): Promise<boolean> => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!canEditBlanketOicPackages || !resolvedPermitNumber || isSavingBoicPackage) {
      return false
    }
    const speciesCodes = boicPackageForm.speciesCodes
      .split(/[,\s]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean)
    if (
      !boicPackageForm.packageNumber.trim() ||
      !boicPackageForm.volume.trim() ||
      !boicPackageForm.averageLength.trim() ||
      !boicPackageForm.averageDiameter.trim() ||
      !boicPackageForm.status.trim() ||
      !boicPackageForm.ageClass.trim() ||
      !boicPackageForm.productType.trim() ||
      !boicPackageForm.endUseCode.trim() ||
      speciesCodes.length === 0
    ) {
      setActionErrorMessage(
        'Enter package number, species, end use, age class, product type, volume, length, diameter, and status.',
      )
      return false
    }

    const request: BlanketOicPackageMutationRequest = {
      permitNumber: resolvedPermitNumber,
      packageNumber: editingBoicPackageNumber ?? boicPackageForm.packageNumber.trim().toUpperCase(),
      newPackageNumber: editingBoicPackageNumber
        ? boicPackageForm.packageNumber.trim().toUpperCase()
        : undefined,
      volume: boicPackageForm.volume.trim(),
      averageLength: boicPackageForm.averageLength.trim(),
      averageDiameter: boicPackageForm.averageDiameter.trim(),
      status: boicPackageForm.status.trim().toUpperCase(),
      comments: boicPackageForm.comments,
      reprocessed: boicPackageForm.reprocessed.trim().toUpperCase(),
      ageClass: boicPackageForm.ageClass.trim().toUpperCase(),
      productType: boicPackageForm.productType.trim().toUpperCase(),
      endUseCode: boicPackageForm.endUseCode.trim().toUpperCase(),
      speciesCodes,
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingBoicPackage(true)
    try {
      const result = editingBoicPackageNumber
        ? await updateBlanketOicPackage(request)
        : await addBlanketOicPackage(request)
      if (!result.success) {
        setActionErrorMessage(
          result.errors[0] || result.message || 'Unable to save the Blanket OIC package.',
        )
        return false
      }
      if (result.applicationNumber) {
        setDetail((current) =>
          current
            ? { ...current, oicApplicationNumber: Number(result.applicationNumber) }
            : current,
        )
      }
      resetBlanketOicPackageForm()
      try {
        await reloadPermitTabs()
        setActionInfoMessage(result.message || 'Blanket OIC package was saved.')
      } catch (refreshError) {
        console.error(refreshError)
        setPermitTablesErrorMessage(
          'The Blanket OIC package was saved, but permit tables could not be refreshed.',
        )
        setActionInfoMessage(
          `${result.message || 'Blanket OIC package was saved.'} Reload before making another package change.`,
        )
      }
      return true
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to save the Blanket OIC package.')
      return false
    } finally {
      setIsSavingBoicPackage(false)
    }
  }, [
    boicPackageForm,
    canEditBlanketOicPackages,
    detail?.permitNumber,
    editingBoicPackageNumber,
    isSavingBoicPackage,
    permitNumber,
    reloadPermitTabs,
    resetBlanketOicPackageForm,
  ])

  const onDeleteBlanketOicPackage = useCallback(
    async (packageNumberToDelete: string) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (
        !canEditBlanketOicPackages ||
        !resolvedPermitNumber ||
        !packageNumberToDelete ||
        isDeletingBoicPackageNumber !== null
      ) {
        return
      }
      setActionErrorMessage('')
      setActionInfoMessage('')
      setIsDeletingBoicPackageNumber(packageNumberToDelete)
      let failureMessage = ''
      try {
        const result = await deleteBlanketOicPackage(resolvedPermitNumber, packageNumberToDelete)
        if (!result.success) {
          failureMessage =
            result.errors[0] || result.message || 'Unable to delete the Blanket OIC package.'
          throw new Error(failureMessage)
        }
        if (editingBoicPackageNumber === packageNumberToDelete) {
          resetBlanketOicPackageForm()
        }
        await reloadPermitTabs()
        setActionInfoMessage(result.message || 'Blanket OIC package was deleted.')
      } catch (error) {
        if (!failureMessage) {
          console.error(error)
          failureMessage = 'Unable to delete the Blanket OIC package.'
        }
        throw new Error(failureMessage)
      } finally {
        setIsDeletingBoicPackageNumber(null)
      }
    },
    [
      canEditBlanketOicPackages,
      detail?.permitNumber,
      editingBoicPackageNumber,
      isDeletingBoicPackageNumber,
      permitNumber,
      reloadPermitTabs,
      resetBlanketOicPackageForm,
    ],
  )

  const setBlanketOicScaleFormField = (field: keyof BlanketOicScaleForm, value: string): void => {
    setBoicScaleForm((current) => ({ ...current, [field]: value }))
  }

  const onAddBlanketOicScale = useCallback(async (): Promise<boolean> => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!canEditBlanketOicScaleRows || !resolvedPermitNumber || isSavingBoicScale) {
      return false
    }

    const request = {
      permitNumber: resolvedPermitNumber,
      packageNumber: selectedBlanketOicPackageNumber.trim(),
      timberMark: boicScaleForm.timberMark.trim(),
      scaleVolume: boicScaleForm.scaleVolume.trim(),
      scalePieces: boicScaleForm.scalePieces.trim(),
      speciesCode: boicScaleForm.speciesCode.trim(),
      gradeCode: boicScaleForm.gradeCode.trim(),
    }

    if (!detail?.oicApplicationNumber) {
      setActionErrorMessage('The permit does not have an OIC application number.')
      return false
    }
    if (
      !request.packageNumber ||
      !request.timberMark ||
      !request.scaleVolume ||
      !request.scalePieces ||
      !request.speciesCode ||
      !request.gradeCode
    ) {
      setActionErrorMessage('Enter package, timber mark, species, grade, pieces, and volume.')
      return false
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingBoicScale(true)
    try {
      const result = await addBlanketOicScale(request)
      if (!result.success) {
        setActionErrorMessage(
          result.errors[0] || result.message || 'Unable to add Blanket OIC scale detail.',
        )
        return false
      }

      const savedScaleBaseline = {
        ...EMPTY_BLANKET_OIC_SCALE_FORM,
        packageNumber: boicScaleForm.packageNumber || selectedBlanketOicPackageNumber,
      }
      setBoicScaleForm(savedScaleBaseline)
      setBoicScaleBaselineForm(savedScaleBaseline)
      try {
        await reloadPermitScaleState()
        setActionInfoMessage(result.message || 'Blanket OIC scale detail was added.')
      } catch (refreshError) {
        console.error(refreshError)
        setPermitTablesErrorMessage(
          'The Blanket OIC scale detail was added, but permit tables could not be refreshed.',
        )
        setActionInfoMessage(
          `${result.message || 'Blanket OIC scale detail was added.'} Reload before adding another scale row.`,
        )
      }
      return true
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to add Blanket OIC scale detail.')
      return false
    } finally {
      setIsSavingBoicScale(false)
    }
  }, [
    boicScaleForm,
    canEditBlanketOicScaleRows,
    detail?.oicApplicationNumber,
    detail?.permitNumber,
    isSavingBoicScale,
    permitNumber,
    reloadPermitScaleState,
    selectedBlanketOicPackageNumber,
  ])

  const onDeleteBlanketOicScale = useCallback(
    async (row: ProvincialPermitItemRow) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (!canEditBlanketOicScaleRows || !resolvedPermitNumber || !row.id) {
        throw new Error('This Blanket OIC scale is no longer available for removal.')
      }

      setActionErrorMessage('')
      setActionInfoMessage('')
      setIsDeletingBoicScaleId(row.id)
      try {
        const result = await deleteBlanketOicScale({
          scaleId: row.id,
          permitNumber: resolvedPermitNumber,
        })
        if (!result.success) {
          throw new Error(
            result.errors[0] || result.message || 'Unable to remove Blanket OIC scale detail.',
          )
        }

        try {
          await reloadPermitScaleState()
          setActionInfoMessage(result.message || 'Blanket OIC scale detail was removed.')
        } catch (refreshError) {
          console.error(refreshError)
          setPermitTablesErrorMessage(
            'The Blanket OIC scale was removed, but permit tables could not be refreshed. Reload the page.',
          )
          setActionInfoMessage(
            `${result.message || 'Blanket OIC scale detail was removed.'} Reload before changing scale rows again.`,
          )
        }
      } catch (error) {
        console.error(error)
        throw error instanceof Error
          ? error
          : new Error('Unable to remove Blanket OIC scale detail.')
      } finally {
        setIsDeletingBoicScaleId(null)
      }
    },
    [canEditBlanketOicScaleRows, detail?.permitNumber, permitNumber, reloadPermitScaleState],
  )

  const refreshPermitDocuments = useCallback(async () => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!resolvedPermitNumber) {
      return
    }

    beginPermitDocumentsRequest()
    beginPermitInvoicesRequest()
    deferredPermitTabLoadsRef.current.delete('documents')
    deferredPermitTabLoadsRef.current.delete('invoices')
    setDeferredPermitTabLoading((current) => ({
      ...current,
      documents: false,
      invoices: false,
    }))
    const [documentsResult, invoicesResult] = await Promise.all([
      fetchPermitDocuments(resolvedPermitNumber),
      fetchPermitInvoices(resolvedPermitNumber),
    ])
    setDocumentRows(documentsResult.rows)
    setInvoiceRows(invoicesResult.rows)
    loadedDeferredPermitTabsRef.current.add('documents')
    loadedDeferredPermitTabsRef.current.add('invoices')
    setDeferredPermitTabLoaded((current) => ({
      ...current,
      documents: true,
      invoices: true,
    }))
    setDocumentsErrorMessage('')
    setInvoicesErrorMessage('')
  }, [beginPermitDocumentsRequest, beginPermitInvoicesRequest, detail?.permitNumber, permitNumber])

  const onCancelPermitDocumentEditing = useCallback(() => {
    setPermitDocumentUploadDirty(false)
    setPermitDocumentUploadBusy(false)
    setPermitDocumentUploadResetKey((current) => current + 1)
    setActionErrorMessage('')
    setIsEditingPermitDocuments(false)
  }, [])

  const onCancelInvoiceDocumentEditing = useCallback(() => {
    setInvoiceDocumentUploadDirty(false)
    setInvoiceDocumentUploadBusy(false)
    setInvoiceDocumentUploadResetKey((current) => current + 1)
    setActionErrorMessage('')
    setIsEditingInvoiceDocuments(false)
  }, [])

  const onOpenDocument = useCallback(
    async (row: PermitDocumentRow) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (!resolvedPermitNumber) {
        return
      }
      setActionErrorMessage('')
      setActionInfoMessage('')
      try {
        const result = await openPermitDocument(row.id, row.name, resolvedPermitNumber)
        triggerBrowserDownload(result.blob, result.filename)
      } catch (error) {
        console.error(error)
        setActionErrorMessage('Unable to open permit document.')
      }
    },
    [detail?.permitNumber, permitNumber],
  )

  const onOpenPermitReport = useCallback(async () => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!resolvedPermitNumber || !canOpenPermitReport) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsOpeningPermitReport(true)
    try {
      const result = await runReport({
        reportId: 'permitReport',
        actionMapping: 'generate',
        values: { permitNumber: resolvedPermitNumber },
      })
      if (result.blob) {
        triggerBrowserDownload(result.blob, result.filename)
      }
    } catch (error) {
      console.error(error)
      setActionErrorMessage(
        error instanceof ReportRequestError ? error.message : 'Unable to generate permit report.',
      )
    } finally {
      setIsOpeningPermitReport(false)
    }
  }, [canOpenPermitReport, detail?.permitNumber, permitNumber])

  const onSendPermitEmail = useCallback(
    async (type: 'request' | 'approval', approvalEmailAddress = ''): Promise<boolean> => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (
        !resolvedPermitNumber ||
        (type === 'request' ? !permitReviewReady : !canSendPermitApproval)
      ) {
        return false
      }
      const clientEmail = normalizeTrimmedText(approvalEmailAddress)
      if (type === 'approval' && !isValidEmail(clientEmail)) {
        setActionErrorMessage('Enter one valid applicant email address.')
        return false
      }
      setActionErrorMessage('')
      setActionInfoMessage('')
      setIsSendingPermitEmail(true)
      try {
        const result =
          type === 'request'
            ? await sendPermitReviewRequestEmail(resolvedPermitNumber)
            : await sendPermitApprovalEmail(resolvedPermitNumber, clientEmail)
        if (result.success) {
          setActionInfoMessage(result.message || 'Permit email sent.')
          if (type === 'request' && result.permitRequestDate) {
            setDetail((current) =>
              current
                ? {
                    ...current,
                    applicationDate: result.permitRequestDate,
                    receivedDate: result.permitRequestDate,
                  }
                : current,
            )
            setPermitForm((current) =>
              current
                ? {
                    ...current,
                    permitSubmitDate: result.permitRequestDate,
                    permitRequestDate: result.permitRequestDate,
                  }
                : current,
            )
          }
          return true
        } else {
          setActionErrorMessage(result.message || 'Permit email could not be sent.')
          return false
        }
      } catch (error) {
        console.error(error)
        setActionErrorMessage('Unable to send permit email.')
        return false
      } finally {
        setIsSendingPermitEmail(false)
      }
    },
    [canSendPermitApproval, detail?.permitNumber, permitReviewReady, permitNumber],
  )

  const onOpenPermitApprovalEmail = useCallback(async () => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!resolvedPermitNumber || !canSendPermitApproval || isSendingPermitEmail) {
      return
    }
    setActionErrorMessage('')
    setIsSendingPermitEmail(true)
    try {
      const defaultEmail = await fetchPermitApprovalEmailDefault(resolvedPermitNumber)
      setPermitApprovalEmailAddress(defaultEmail.trim())
      setPermitApprovalEmailOpen(true)
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to resolve the permit applicant notification email.')
    } finally {
      setIsSendingPermitEmail(false)
    }
  }, [canSendPermitApproval, detail?.permitNumber, isSendingPermitEmail, permitNumber])

  const onRemoveDocument = useCallback(
    async (row: PermitDocumentRow) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (!resolvedPermitNumber) {
        throw new Error('Permit number is unavailable.')
      }

      const invoiceDocument = isInvoiceDocumentRow(row)
      if (
        row.deletable === false ||
        !canDeletePermitDocuments ||
        (invoiceDocument && !canDeleteInvoiceDocuments)
      ) {
        throw new Error('This document cannot be deleted from the current permit.')
      }

      const isLatestRequest = beginDocumentRefreshRequest()
      setActionErrorMessage('')
      setActionInfoMessage('')
      setIsRemovingDocumentId(row.id)
      try {
        const removeResult = invoiceDocument
          ? await removePermitInvoiceDocument(row.id, resolvedPermitNumber)
          : isApplicationDocumentRow(row)
            ? await removePermitApplicationDocument(row.id, resolvedPermitNumber)
            : await removePermitDocument(row.id, resolvedPermitNumber)

        if (!isLatestRequest()) {
          return
        }
        if (!removeResult.success) {
          throw new Error('Document removal failed. Refresh and try again.')
        }

        try {
          beginPermitDocumentsRequest()
          beginPermitInvoicesRequest()
          deferredPermitTabLoadsRef.current.delete('documents')
          deferredPermitTabLoadsRef.current.delete('invoices')
          setDeferredPermitTabLoading((current) => ({
            ...current,
            documents: false,
            invoices: false,
          }))
          const [documentsResult, invoicesResult] = await Promise.all([
            fetchPermitDocuments(resolvedPermitNumber),
            fetchPermitInvoices(resolvedPermitNumber),
          ])
          if (isLatestRequest()) {
            setDocumentRows(documentsResult.rows)
            setInvoiceRows(invoicesResult.rows)
            loadedDeferredPermitTabsRef.current.add('documents')
            loadedDeferredPermitTabsRef.current.add('invoices')
            setDeferredPermitTabLoaded((current) => ({
              ...current,
              documents: true,
              invoices: true,
            }))
            setDocumentsErrorMessage('')
            setInvoicesErrorMessage('')
            setActionInfoMessage(`${row.name || 'Document'} was deleted.`)
          }
        } catch (refreshError) {
          if (isLatestRequest()) {
            console.error(refreshError)
            setDocumentsErrorMessage(
              'The document was deleted, but permit documents could not be refreshed. Reload the page.',
            )
            setActionInfoMessage(
              `${row.name || 'Document'} was deleted. Reload before changing documents again.`,
            )
          }
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
        }
        throw error instanceof Error ? error : new Error('Unable to remove selected document.')
      } finally {
        if (isLatestRequest()) {
          setIsRemovingDocumentId(null)
        }
      }
    },
    [
      beginDocumentRefreshRequest,
      beginPermitDocumentsRequest,
      beginPermitInvoicesRequest,
      canDeleteInvoiceDocuments,
      canDeletePermitDocuments,
      detail?.permitNumber,
      permitNumber,
      setDocumentRows,
      setInvoiceRows,
    ],
  )

  const isPermitDirty =
    permitDetailDirty ||
    permitShippingDirty ||
    permitFeeOverrideDirty ||
    blanketOicPackageDirty ||
    blanketOicScaleDirty ||
    permitDocumentUploadDirty ||
    invoiceDocumentUploadDirty

  const onSaveUnsavedPermitChanges = useCallback(async (): Promise<boolean> => {
    if (permitDocumentUploadDirty || invoiceDocumentUploadDirty) {
      setActionErrorMessage(
        'Queued document uploads must be submitted or reset before leaving this permit.',
      )
      return false
    }
    if (blanketOicPackageDirty && blanketOicScaleDirty) {
      setActionErrorMessage(
        'Save the Blanket OIC package before adding a scale row so the scale uses the final package number.',
      )
      return false
    }
    if (permitFeeOverrideDirty && !(await onSaveFeeOverride())) return false
    if (blanketOicPackageDirty && !(await onSaveBlanketOicPackage())) return false
    if (blanketOicScaleDirty && !(await onAddBlanketOicScale())) return false
    // Persist lifecycle-dependent drafts before a status transition can make them read-only.
    // The permit orchestrator saves shipping first and, when required by the backend contract,
    // saves policy fields before applying the final invoiced status.
    if (permitDetailDirty && !(await onSavePermit())) return false
    if (!permitDetailDirty && permitShippingDirty && !(await onSaveShipping())) return false
    return true
  }, [
    blanketOicPackageDirty,
    blanketOicScaleDirty,
    invoiceDocumentUploadDirty,
    onAddBlanketOicScale,
    onSaveBlanketOicPackage,
    onSaveFeeOverride,
    onSavePermit,
    onSaveShipping,
    permitDetailDirty,
    permitDocumentUploadDirty,
    permitFeeOverrideDirty,
    permitShippingDirty,
  ])

  const onDiscardPermitChanges = useCallback(() => {
    if (detail) {
      setPermitForm(buildPermitDetailForm(detail))
    }
    setIsEditingPermit(false)
    setIsEditingShipping(false)
    setTouchedPermitFields({})
    setShowPermitValidationErrors(false)
    setFeeOverrideForm(feeOverrideContext)
    setIsEditingFeeOverride(false)
    resetBlanketOicPackageForm()
    setBoicScaleForm(boicScaleBaselineForm)
    setPermitDocumentUploadDirty(false)
    setPermitDocumentUploadBusy(false)
    setInvoiceDocumentUploadDirty(false)
    setInvoiceDocumentUploadBusy(false)
    setPermitDocumentUploadResetKey((current) => current + 1)
    setInvoiceDocumentUploadResetKey((current) => current + 1)
    setIsEditingPermitDocuments(false)
    setIsEditingInvoiceDocuments(false)
    setActionErrorMessage('')
  }, [boicScaleBaselineForm, detail, feeOverrideContext, resetBlanketOicPackageForm])

  const renderPermitTextInput = (
    field: PermitDetailFormField,
    labelText: string,
    isDisabled: boolean,
    maxLength?: number,
  ) => (
    <TextInput
      id={`permit-${field}`}
      labelText={labelText}
      value={permitForm?.[field] ?? ''}
      invalid={!!permitFieldError(field)}
      invalidText={permitFieldError(field)}
      onBlur={() => markPermitFieldTouched(field)}
      onChange={(event) => setPermitFormField(field, event.target.value)}
      disabled={isDisabled}
      maxLength={maxLength}
    />
  )

  const renderPermitTextArea = (
    field: PermitDetailFormField,
    labelText: string,
    isDisabled: boolean,
    maxCount?: number,
  ) => (
    <TextArea
      id={`permit-${field}`}
      labelText={labelText}
      value={permitForm?.[field] ?? ''}
      invalid={!!permitFieldError(field)}
      invalidText={permitFieldError(field)}
      onBlur={() => markPermitFieldTouched(field)}
      onChange={(event) => setPermitFormField(field, event.target.value)}
      disabled={isDisabled}
      rows={3}
      maxCount={maxCount}
    />
  )

  const detailMatchesRoute =
    !!detail && !!permitNumber && String(detail.permitNumber) === permitNumber
  const isRefreshingDetail = loading && detailMatchesRoute
  const permitDisplayNumber = formatPermitNumber(
    detailMatchesRoute ? detail?.permitNumber : permitNumber,
    detailMatchesRoute ? (detail?.permitStatusCode ?? detail?.permitStatusDescription) : null,
  )

  return (
    <Grid
      fullWidth
      className={`default-grid detail-page-grid content-loading-region${
        isRefreshingDetail ? ' is-loading' : ''
      }`}
      inert={isRefreshingDetail ? true : undefined}
      aria-busy={isRefreshingDetail}
    >
      <ContentLoadingOverlay
        loading={isRefreshingDetail}
        loadingDescription="Refreshing provincial permit detail…"
      />
      <Column sm={4} md={8} lg={16}>
        <DetailBreadcrumb
          label="Provincial permit search"
          to="/provincial/permit"
          returnTo={detailReturnTo}
        />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <PageHeader
          title={`Permit ${permitDisplayNumber}`.trim()}
          subtitle="Check and manage this provincial permit"
          status={
            detail && detailMatchesRoute ? (
              <StatusTag
                status={detail.permitStatusDescription ?? detail.permitStatusCode ?? ''}
                fallbackLabel="Not provided"
              />
            ) : undefined
          }
          actions={
            detailMatchesRoute &&
            (canRequestPermitReview || canSendPermitApproval || canOpenPermitReport) ? (
              <>
                {canRequestPermitReview && (
                  <Button
                    kind="tertiary"
                    size="sm"
                    disabled={isSendingPermitEmail || !permitReviewReady}
                    title={
                      permitReviewReady
                        ? undefined
                        : isPermitTablesLoading
                          ? 'Checking permit review readiness…'
                          : 'An active permit requires an application, package, and scale detail before review can be requested.'
                    }
                    onClick={() => void onSendPermitEmail('request')}
                  >
                    Email review request
                  </Button>
                )}
                {/* INTENTIONAL_LEGACY_DIVERGENCE(PERMIT_APPROVAL_EMAIL_RESEND):
                    Modern permit detail supports previewing and resending the approval email. */}
                {canSendPermitApproval && (
                  <Button
                    kind="tertiary"
                    size="sm"
                    disabled={isSendingPermitEmail}
                    onClick={() => void onOpenPermitApprovalEmail()}
                  >
                    Email approval
                  </Button>
                )}
                {canOpenPermitReport && (
                  <Button
                    kind="primary"
                    size="sm"
                    disabled={isOpeningPermitReport}
                    renderIcon={isOpeningPermitReport ? PendingIcon : undefined}
                    onClick={() => void onOpenPermitReport()}
                  >
                    {isOpeningPermitReport ? 'Opening…' : 'Print permit'}
                  </Button>
                )}
              </>
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
          <Loading description="Loading provincial permit detail…" withOverlay={false} />
        </Column>
      )}

      {!loading && !!errorMessage && <DetailLoadError message={errorMessage} />}

      {detail && detailMatchesRoute && (
        <>
          {!!permitEditLockMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                className="detail-context-notification"
                kind="warning"
                title="Editing unavailable"
                subtitle={permitEditLockMessage}
                lowContrast
                hideCloseButton
              />
            </Column>
          )}
          {!!permitEditContextUnavailableMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                className="detail-context-notification"
                kind="warning"
                title="Editing unavailable"
                subtitle={permitEditContextUnavailableMessage}
                lowContrast
                hideCloseButton
              />
            </Column>
          )}
          {!!permitOptionsErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                className="detail-context-notification"
                kind="warning"
                title="Permit options unavailable"
                subtitle={permitOptionsErrorMessage}
                lowContrast
                hideCloseButton
              />
            </Column>
          )}
          {requiredPermitOptionsMissing && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                className="detail-context-notification"
                kind="warning"
                title="Required permit options not configured"
                subtitle="A required permit status or Blanket OIC region list is empty. Permit saves are disabled."
                lowContrast
                hideCloseButton
              />
            </Column>
          )}
          {!!actionInfoMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="info"
                title="Action info"
                subtitle={actionInfoMessage}
                lowContrast
                autoDismissMs={6000}
                onCloseButtonClick={() => setActionInfoMessage('')}
              />
            </Column>
          )}

          {!!actionErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="error"
                title="Action failed"
                subtitle={actionErrorMessage}
                lowContrast
                onCloseButtonClick={() => setActionErrorMessage('')}
              />
            </Column>
          )}

          <Column sm={4} md={8} lg={16} className="application-detail-tabs-column">
            <Tabs
              selectedIndex={selectedPermitTabIndex}
              onChange={({ selectedIndex }) => {
                const selectedTab = permitDetailTabs[selectedIndex]
                if (selectedTab) {
                  selectPermitTab(selectedTab.id)
                  if (selectedTab.id === 'owner' || selectedTab.id === 'agent') {
                    setClientDataRequested(true)
                  }
                  if (
                    selectedTab.id === 'fees' ||
                    selectedTab.id === 'documents' ||
                    selectedTab.id === 'invoices'
                  ) {
                    void loadDeferredPermitTab(selectedTab.id)
                  }
                }
              }}
            >
              <TabList
                aria-label="Permit detail sections"
                contained
                className="application-tabs__list application-detail-tab-list"
              >
                {permitDetailTabs.map(({ id, label }) => (
                  <Tab key={id}>{label}</Tab>
                ))}
              </TabList>
              <ContiguousTabPanels order={permitDetailTabs.map(({ id }) => id)}>
                <TabPanel key="permit" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      {isEditingPermit && permitForm ? (
                        <Tile>
                          <h2 className="detail-tile-title">Permit summary</h2>
                          <div className="legacy-search-grid">
                            {renderPermitTextInput('permitNumber', 'Permit number', true)}
                            <TextInput
                              id="permit-applicationNumber"
                              labelText="Application number(s)"
                              value={displayValue(permitApplicationNumberSummary)}
                              disabled
                            />
                            <TextInput
                              id="permit-packageNumber"
                              labelText="Package number(s)"
                              value={displayValue(permitPackageNumberSummary)}
                              disabled
                            />
                            {renderPermitTextInput('exemptionNumber', 'Exemption number', true)}
                            <Select
                              id="permit-permitStatus"
                              labelText="Permit status"
                              value={permitForm.permitStatus}
                              invalid={!!permitFieldError('permitStatus')}
                              invalidText={permitFieldError('permitStatus')}
                              onBlur={() => markPermitFieldTouched('permitStatus')}
                              onChange={(event) =>
                                setPermitFormField('permitStatus', event.target.value)
                              }
                              disabled={
                                !canReviewPermits ||
                                isPermitOptionsLoading ||
                                permitStatusOptions.length === 0
                              }
                            >
                              <SelectItem value="" text="Select a permit status" />
                              {editablePermitStatusOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                  text={`${option.label} (${option.value})`}
                                />
                              ))}
                            </Select>
                            {renderPermitTextInput(
                              'permitSubmitDate',
                              'Submit date',
                              !canCorrectPermitSubmitDate,
                            )}
                            {renderPermitTextInput(
                              'permitIssueDate',
                              'Issue date',
                              !canReviewPermits || invoiceMaterialLocked,
                            )}
                            {renderPermitTextInput(
                              'permitExpiryDate',
                              'Expiry date',
                              !canReviewPermits,
                            )}
                            {renderPermitTextInput('permitRequestDate', 'Received date', true)}
                            {detail.blanketOic ? (
                              <Select
                                id="permit-orgUnitNumber"
                                labelText="Region"
                                value={permitForm.orgUnitNumber}
                                invalid={!!permitFieldError('orgUnitNumber')}
                                invalidText={permitFieldError('orgUnitNumber')}
                                onBlur={() => markPermitFieldTouched('orgUnitNumber')}
                                onChange={(event) =>
                                  setPermitFormField('orgUnitNumber', event.target.value)
                                }
                                disabled={
                                  invoiceMaterialLocked ||
                                  isPermitOptionsLoading ||
                                  permitRegionOptions.length === 0
                                }
                              >
                                <SelectItem value="" text="Select a region" />
                                {editablePermitRegionOptions.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                    text={`${option.label} (${option.value})`}
                                  />
                                ))}
                              </Select>
                            ) : (
                              <TextInput
                                id="permit-orgUnitNumber"
                                labelText="Region"
                                value={displayValue(detail.region ?? detail.orgUnitNumber)}
                                disabled
                              />
                            )}
                          </div>
                        </Tile>
                      ) : (
                        <DetailFieldTile
                          title="Permit summary"
                          fields={[
                            {
                              label: 'Permit number',
                              value: formatPermitNumber(
                                detail.permitNumber,
                                detail.permitStatusCode ?? detail.permitStatusDescription,
                              ),
                            },
                            {
                              label: 'Application number(s)',
                              value: displayValue(permitApplicationNumberSummary),
                            },
                            {
                              label: 'Package number(s)',
                              value: displayValue(permitPackageNumberSummary),
                            },
                            {
                              label: 'Exemption number',
                              value: detail.exemptionNumber ? (
                                <Link
                                  to={`/provincial/exemption/${encodeURIComponent(detail.exemptionNumber)}`}
                                  state={withDetailReturnTo(
                                    location.state,
                                    {
                                      label: 'Provincial permit detail',
                                      to: locationPath(location),
                                    },
                                    detailReturnTo,
                                  )}
                                >
                                  {detail.exemptionNumber}
                                </Link>
                              ) : (
                                displayValue(detail.exemptionNumber)
                              ),
                            },
                            {
                              label: 'Exemption type',
                              value: displayValue(detail.exemptionTypeDescription),
                            },
                            {
                              label: 'Status',
                              value: (
                                <StatusTag
                                  status={
                                    detail.permitStatusDescription ?? detail.permitStatusCode ?? ''
                                  }
                                  fallbackLabel="Not provided"
                                />
                              ),
                            },
                            { label: 'Author', value: displayValue(detail.author) },
                            { label: 'Submit date', value: displayValue(detail.applicationDate) },
                            { label: 'Issue date', value: displayValue(detail.issueDate) },
                            { label: 'Expiry date', value: displayValue(detail.expiryDate) },
                            {
                              label: 'Received date',
                              value: displayValue(
                                detail.blanketOic ? detail.receivedDate : detail.applicationDate,
                              ),
                            },
                            { label: 'Region', value: displayValue(detail.region) },
                          ]}
                        />
                      )}
                    </Column>

                    <Column sm={4} md={8} lg={16}>
                      {isEditingPermit && permitForm ? (
                        <Tile>
                          <h2 className="detail-tile-title">Financial and volume</h2>
                          <div className="legacy-search-grid">
                            <TextInput
                              id="permit-approvedExemptionVolume"
                              labelText="Total exemption volume (m³)"
                              value={displayValue(detail.approvedExemptionVolume)}
                              disabled
                            />
                            <TextInput
                              id="permit-exemptionVolumeRemaining"
                              labelText="Total volume remaining (m³)"
                              value={displayValue(detail.exemptionVolumeRemaining)}
                              disabled
                            />
                            {detail.blanketOic &&
                              renderPermitTextInput(
                                'oicPermitTotalPieces',
                                'Permit Request Pieces',
                                invoiceMaterialLocked,
                              )}
                            {detail.blanketOic &&
                              renderPermitTextInput(
                                'oicPermitTotalVolume',
                                'Permit Request Volume (m³)',
                                invoiceMaterialLocked,
                              )}
                            {renderPermitTextInput('permitTotalVolume', 'Permit volume (m³)', true)}
                            {renderPermitTextInput(
                              'permitNumberOfPieces',
                              'Number of pieces',
                              true,
                            )}
                            {renderPermitTextInput(
                              'permitReceiptNo',
                              'Receipt number',
                              invoiceMaterialLocked && !canEnterPaymentReceipt,
                              50,
                            )}
                            <TextInput
                              id="permit-invoiceNumber"
                              labelText="Invoice number"
                              value={displayValue(detail.invoiceNumber)}
                              disabled
                            />
                            <TextInput
                              id="permit-federalPermitNumber"
                              labelText="Federal permit number"
                              value={displayValue(detail.federalPermitNumber)}
                              disabled
                            />
                            {renderPermitTextInput(
                              'agentClientNumber',
                              'Agent client number',
                              invoiceMaterialLocked,
                            )}
                            {renderPermitTextInput(
                              'agentClientLocation',
                              'Agent location',
                              invoiceMaterialLocked,
                            )}
                            {renderPermitTextInput(
                              'ownerClientNumber',
                              'Owner client number',
                              invoiceMaterialLocked,
                            )}
                            {renderPermitTextInput(
                              'ownerClientLocation',
                              'Owner location',
                              invoiceMaterialLocked,
                            )}
                          </div>
                          <div className="legacy-search-grid">
                            {renderPermitTextArea('permitRemarks', 'Remarks', false, 254)}
                          </div>
                        </Tile>
                      ) : (
                        <DetailFieldTile
                          title="Financial and volume"
                          fields={[
                            {
                              label: 'Total exemption volume (m³)',
                              value: displayValue(detail.approvedExemptionVolume),
                            },
                            {
                              label: 'Total volume remaining (m³)',
                              value: displayValue(detail.exemptionVolumeRemaining),
                            },
                            ...(detail.blanketOic
                              ? [
                                  {
                                    label: 'Permit Request Pieces',
                                    value: displayValue(detail.oicRequestPieces),
                                  },
                                  {
                                    label: 'Permit Request Volume (m³)',
                                    value: displayValue(detail.oicRequestVolume),
                                  },
                                ]
                              : []),
                            {
                              label: 'Permit volume (m³)',
                              value: displayValue(detail.permitVolume),
                            },
                            {
                              label: 'Number of pieces',
                              value: displayValue(detail.numberOfPieces),
                            },
                            {
                              label: 'Receipt number',
                              value: displayValue(detail.receiptNumber),
                            },
                            {
                              label: 'Invoice number',
                              value: displayValue(detail.invoiceNumber),
                            },
                            {
                              label: 'Federal permit number',
                              value: displayValue(detail.federalPermitNumber),
                            },
                            {
                              label: 'Agent client number',
                              value: displayValue(detail.applicantClientNumber),
                            },
                            {
                              label: 'Agent location',
                              value: displayValue(detail.agentClientLocationCode),
                            },
                            {
                              label: 'Owner client number',
                              value: displayValue(detail.ownerClientNumber),
                            },
                            {
                              label: 'Owner location',
                              value: displayValue(detail.ownerClientLocationCode),
                            },
                            { label: 'Remarks', value: displayValue(detail.remarks) },
                          ]}
                        />
                      )}
                    </Column>
                    {!detail.blanketOic && (
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <h2 className="detail-tile-title">Associated applications</h2>
                          {isPermitTablesLoading ? (
                            <InlineLoading description="Loading associated permit applications…" />
                          ) : permitTablesErrorMessage ? (
                            <EmptyState
                              title="Associated applications unavailable"
                              description={permitTablesErrorMessage}
                              headingLevel={3}
                              role="alert"
                            />
                          ) : associatedPermitApplications.length > 0 ? (
                            <TableFrame ariaLabel="Associated permit applications">
                              <Table size="md" useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Application number</TableHeader>
                                    {canEditPermitApplications && (
                                      <TableHeader>Actions</TableHeader>
                                    )}
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {associatedPermitApplications.map((applicationNumber) => (
                                    <TableRow key={applicationNumber}>
                                      <TableCell>
                                        <Link
                                          to={`/provincial/application/${encodeURIComponent(applicationNumber)}`}
                                          state={withDetailReturnTo(
                                            location.state,
                                            {
                                              label: 'Provincial permit detail',
                                              to: locationPath(location),
                                            },
                                            detailReturnTo,
                                          )}
                                        >
                                          {applicationNumber}
                                        </Link>
                                      </TableCell>
                                      {canEditPermitApplications && (
                                        <TableCell>
                                          <Button
                                            kind="ghost"
                                            size="sm"
                                            disabled={
                                              isRemovingPermitApplication === applicationNumber
                                            }
                                            renderIcon={TrashCan}
                                            onClick={() =>
                                              setPermitApplicationPendingRemoval(applicationNumber)
                                            }
                                          >
                                            {isRemovingPermitApplication === applicationNumber
                                              ? 'Removing…'
                                              : 'Remove'}
                                          </Button>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableFrame>
                          ) : (
                            <EmptyState
                              title="No associated applications"
                              description="No applications are associated with this permit."
                              headingLevel={3}
                            />
                          )}
                          {canEditPermitApplications && (
                            <>
                              <div className="legacy-search-grid">
                                <SearchableSelect
                                  id="permitApplicationToAdd"
                                  labelText="Available application"
                                  value={selectedPermitApplicationToAdd}
                                  options={availablePermitApplicationOptions}
                                  placeholder={
                                    isLoadingAvailableApplications
                                      ? 'Loading applications'
                                      : hasLoadedAvailablePermitApplications
                                        ? availablePermitApplicationOptions.length > 0
                                          ? 'Select application'
                                          : 'No applications available'
                                        : 'Select to load applications'
                                  }
                                  disabled={
                                    isSavingPermitApplication || isLoadingAvailableApplications
                                  }
                                  onFocus={loadAvailablePermitApplicationsOnFocus}
                                  onChange={setPermitApplicationToAdd}
                                />
                              </div>
                              <div className="legacy-search-actions">
                                <Button
                                  kind="primary"
                                  size="sm"
                                  disabled={
                                    isSavingPermitApplication ||
                                    isLoadingAvailableApplications ||
                                    !selectedPermitApplicationToAdd
                                  }
                                  renderIcon={isSavingPermitApplication ? PendingIcon : undefined}
                                  onClick={() => void onAddPermitApplication()}
                                >
                                  {isSavingPermitApplication ? 'Adding…' : 'Add application'}
                                </Button>
                              </div>
                            </>
                          )}
                        </Tile>
                      </Column>
                    )}
                    {canSavePermit && (
                      <Column sm={4} md={8} lg={16}>
                        <div className="legacy-search-actions">
                          {isEditingPermit ? (
                            <>
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={
                                  isSavingPermit ||
                                  isPermitOptionsLoading ||
                                  permitOptionsUnavailable ||
                                  requiredPermitOptionsMissing
                                }
                                renderIcon={isSavingPermit ? PendingIcon : undefined}
                                onClick={() => void onSavePermit()}
                              >
                                {isSavingPermit ? 'Saving…' : 'Save permit'}
                              </Button>
                              <Button
                                kind="tertiary"
                                size="sm"
                                disabled={isSavingPermit}
                                onClick={() => {
                                  resetPermitFormSection(false)
                                  setIsEditingPermit(false)
                                }}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              kind="tertiary"
                              size="sm"
                              onClick={() => {
                                resetPermitFormSection(false)
                                setIsEditingPermit(true)
                              }}
                            >
                              Edit permit
                            </Button>
                          )}
                        </div>
                      </Column>
                    )}
                  </Grid>
                </TabPanel>
                <TabPanel key="owner" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <PermitClientTile
                        title="Owner"
                        clientNumber={detail.ownerClientNumber}
                        locationCode={detail.ownerClientLocationCode}
                        clientData={ownerClientData}
                        isLoading={isClientDataLoading}
                      />
                    </Column>
                  </Grid>
                </TabPanel>
                {hasPermitAgent && (
                  <TabPanel key="agent" className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <PermitClientTile
                          title="Agent"
                          clientNumber={detail.applicantClientNumber}
                          locationCode={detail.agentClientLocationCode}
                          clientData={agentClientData}
                          isLoading={isClientDataLoading}
                        />
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
                <TabPanel key="shipping" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      {isEditingShipping && permitForm ? (
                        <Tile>
                          <h2 className="detail-tile-title">Shipping</h2>
                          {shippingReferencesErrorMessage && (
                            <InlineNotification
                              className="detail-context-notification"
                              kind="warning"
                              lowContrast
                              hideCloseButton
                              title="Shipping options unavailable"
                              subtitle={shippingReferencesErrorMessage}
                            />
                          )}
                          <div className="legacy-search-grid">
                            {renderPermitTextInput(
                              'destinationCompanyName',
                              'Destination company',
                              false,
                              52,
                            )}
                            <Select
                              id="permit-destinationCountry"
                              labelText="Destination country"
                              value={permitForm.destinationCountry}
                              invalid={!!permitFieldError('destinationCountry')}
                              invalidText={permitFieldError('destinationCountry')}
                              onBlur={() => markPermitFieldTouched('destinationCountry')}
                              onChange={(event) =>
                                setPermitFormField('destinationCountry', event.target.value)
                              }
                              disabled={
                                invoiceMaterialLocked ||
                                isShippingReferencesLoading ||
                                !shippingReferences
                              }
                            >
                              <SelectItem value="" text="Select a destination country" />
                              {(shippingReferences?.countries ?? []).map((option) => (
                                <SelectItem
                                  key={option.code}
                                  value={option.code}
                                  text={formatShippingReferenceOption(option)}
                                />
                              ))}
                            </Select>
                            <Select
                              id="permit-transportType"
                              labelText="Transport type"
                              value={permitForm.transportType}
                              invalid={!!permitFieldError('transportType')}
                              invalidText={permitFieldError('transportType')}
                              onBlur={() => markPermitFieldTouched('transportType')}
                              onChange={(event) =>
                                setPermitFormField('transportType', event.target.value)
                              }
                              disabled={isShippingReferencesLoading || !shippingReferences}
                            >
                              <SelectItem value="" text="Select a transport type" />
                              {(shippingReferences?.transportTypes ?? []).map((option) => (
                                <SelectItem
                                  key={option.code}
                                  value={option.code}
                                  text={formatShippingReferenceOption(option)}
                                />
                              ))}
                            </Select>
                            {renderPermitTextInput('transportName', 'Transport name', false, 26)}
                            <Select
                              id="permit-portOfExport"
                              labelText="Port of export"
                              value={permitForm.portOfExport}
                              invalid={!!permitFieldError('portOfExport')}
                              invalidText={permitFieldError('portOfExport')}
                              onBlur={() => markPermitFieldTouched('portOfExport')}
                              onChange={(event) => {
                                const portCode = event.target.value
                                setPermitForm((current) =>
                                  current
                                    ? {
                                        ...current,
                                        portOfExport: portCode,
                                        otherPortOfExport:
                                          portCode.toUpperCase() === 'OT'
                                            ? current.otherPortOfExport
                                            : '',
                                      }
                                    : current,
                                )
                              }}
                              disabled={isShippingReferencesLoading || !shippingReferences}
                            >
                              <SelectItem value="" text="Select a port of export" />
                              {(shippingReferences?.ports ?? []).map((option) => (
                                <SelectItem
                                  key={option.code}
                                  value={option.code}
                                  text={formatShippingReferenceOption(option)}
                                />
                              ))}
                            </Select>
                            {permitForm.portOfExport.trim().toUpperCase() === 'OT' &&
                              renderPermitTextInput(
                                'otherPortOfExport',
                                'Other port of export',
                                false,
                                34,
                              )}
                            <IsoDatePicker
                              id="permit-estimatedShippingDate"
                              labelText="Estimated shipping date"
                              value={permitForm.estimatedShippingDate}
                              invalid={!!permitFieldError('estimatedShippingDate')}
                              invalidText={permitFieldError('estimatedShippingDate')}
                              onBlur={() => markPermitFieldTouched('estimatedShippingDate')}
                              onChange={(value) =>
                                setPermitFormField('estimatedShippingDate', value)
                              }
                            />
                          </div>
                        </Tile>
                      ) : (
                        <>
                          {shippingReferencesErrorMessage && (
                            <InlineNotification
                              className="detail-context-notification"
                              kind="warning"
                              lowContrast
                              hideCloseButton
                              title="Shipping options unavailable"
                              subtitle={shippingReferencesErrorMessage}
                            />
                          )}
                          <DetailFieldTile
                            title="Shipping"
                            fields={[
                              {
                                label: 'Destination company',
                                value: displayValue(detail.destinationCompanyName),
                              },
                              {
                                label: 'Destination country',
                                value: displayValue(
                                  shippingReferenceLabel(
                                    shippingReferences?.countries,
                                    detail.destinationCountryCode,
                                  ),
                                ),
                              },
                              {
                                label: 'Transport type',
                                value: displayValue(
                                  shippingReferenceLabel(
                                    shippingReferences?.transportTypes,
                                    detail.transportTypeCode,
                                  ),
                                ),
                              },
                              {
                                label: 'Transport name',
                                value: displayValue(detail.transportName),
                              },
                              {
                                label: 'Port of export',
                                value: displayValue(
                                  shippingReferenceLabel(
                                    shippingReferences?.ports,
                                    detail.portOfExportCode,
                                  ),
                                ),
                              },
                              ...(detail.portOfExportCode?.trim().toUpperCase() === 'OT'
                                ? [
                                    {
                                      label: 'Other port of export',
                                      value: displayValue(detail.otherPortOfExport),
                                    },
                                  ]
                                : []),
                              {
                                label: 'Estimated shipping date',
                                value: displayValue(detail.estimatedShippingDate),
                              },
                            ]}
                          />
                        </>
                      )}
                    </Column>
                    {canEditShipping && (
                      <Column sm={4} md={8} lg={16}>
                        <div className="legacy-search-actions">
                          {isEditingShipping ? (
                            <>
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={
                                  isSavingShipping ||
                                  isShippingReferencesLoading ||
                                  !shippingReferences ||
                                  hasShippingValidationError
                                }
                                renderIcon={isSavingShipping ? PendingIcon : undefined}
                                onClick={() => void onSaveShipping()}
                              >
                                {isSavingShipping ? 'Saving…' : 'Save shipping'}
                              </Button>
                              <Button
                                kind="tertiary"
                                size="sm"
                                disabled={isSavingShipping}
                                onClick={() => {
                                  resetPermitFormSection(true)
                                  setIsEditingShipping(false)
                                }}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              kind="tertiary"
                              size="sm"
                              disabled={isShippingReferencesLoading || !shippingReferences}
                              onClick={() => {
                                resetPermitFormSection(true)
                                setIsEditingShipping(true)
                              }}
                            >
                              Edit shipping
                            </Button>
                          )}
                        </div>
                      </Column>
                    )}
                  </Grid>
                </TabPanel>
                <TabPanel key="items" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Permit items</h2>
                        <fieldset className="legacy-form-fieldset">
                          <legend>
                            {detail.blanketOic ? 'Blanket OIC package details' : 'Package details'}
                          </legend>
                          {isPermitTablesLoading ? (
                            <InlineLoading description="Loading permit items…" />
                          ) : permitTablesErrorMessage ? (
                            <EmptyState
                              title="Permit items unavailable"
                              description={permitTablesErrorMessage}
                              headingLevel={3}
                              role="alert"
                            />
                          ) : (tabsData?.packages ?? []).length > 0 ? (
                            <TableFrame ariaLabel="Permit packages">
                              <Table size="md" useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Package number</TableHeader>
                                    <TableHeader>Region</TableHeader>
                                    <TableHeader>Species and end use sort</TableHeader>
                                    <TableHeader>Age class</TableHeader>
                                    <TableHeader>Package volume (m³)</TableHeader>
                                    <TableHeader>Average length</TableHeader>
                                    <TableHeader>Average top diameter</TableHeader>
                                    <TableHeader>Product type</TableHeader>
                                    {detail.blanketOic && (
                                      <>
                                        <TableHeader>Current package volume (m³)</TableHeader>
                                        <TableHeader>Status</TableHeader>
                                        <TableHeader>Reprocessed</TableHeader>
                                        <TableHeader>Comments</TableHeader>
                                      </>
                                    )}
                                    {canEditBlanketOicPackages && (
                                      <TableHeader>Actions</TableHeader>
                                    )}
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {(tabsData?.packages ?? []).map((row) => (
                                    <TableRow key={row.packageNumber}>
                                      <TableCell>{row.packageNumber || '-'}</TableCell>
                                      <TableCell>{row.region || '-'}</TableCell>
                                      <TableCell style={{ whiteSpace: 'pre-line' }}>
                                        {row.speciesEndUseSort || '-'}
                                      </TableCell>
                                      <TableCell>{row.ageClass || '-'}</TableCell>
                                      <TableCell>{row.packageVolume || '-'}</TableCell>
                                      <TableCell>{row.averageLength || '-'}</TableCell>
                                      <TableCell>{row.averageTopDiameter || '-'}</TableCell>
                                      <TableCell>{row.productType || '-'}</TableCell>
                                      {detail.blanketOic && (
                                        <>
                                          <TableCell>{row.currentPackageVolume || '-'}</TableCell>
                                          <TableCell>
                                            {row.status ? <StatusTag status={row.status} /> : '-'}
                                          </TableCell>
                                          <TableCell>{row.reprocessed || '-'}</TableCell>
                                          <TableCell>{row.comments || '-'}</TableCell>
                                        </>
                                      )}
                                      {canEditBlanketOicPackages && (
                                        <TableCell>
                                          <Button
                                            type="button"
                                            kind="ghost"
                                            size="sm"
                                            disabled={
                                              isLoadingBoicPackage ||
                                              isSavingBoicPackage ||
                                              isDeletingBoicPackageNumber !== null
                                            }
                                            onClick={() =>
                                              void onEditBlanketOicPackage(row.packageNumber)
                                            }
                                          >
                                            Edit
                                          </Button>
                                          <Button
                                            type="button"
                                            kind="danger--ghost"
                                            size="sm"
                                            disabled={
                                              isSavingBoicPackage ||
                                              isDeletingBoicPackageNumber !== null ||
                                              (tabsData?.items ?? []).some(
                                                (item) => item.packageNumber === row.packageNumber,
                                              )
                                            }
                                            onClick={() =>
                                              setBoicPackageNumberPendingDeletion(row.packageNumber)
                                            }
                                          >
                                            {isDeletingBoicPackageNumber === row.packageNumber
                                              ? 'Deleting…'
                                              : 'Delete'}
                                          </Button>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableFrame>
                          ) : detail.blanketOic ? (
                            <p className="detail-empty-message">
                              {canEditBlanketOicPackages
                                ? 'Create a package before adding Summary of Scale entries.'
                                : 'No package has been created for this Blanket OIC permit.'}
                            </p>
                          ) : (
                            <EmptyState
                              title="No package details"
                              description="No package detail rows are available for this permit."
                              headingLevel={3}
                            />
                          )}
                          {canEditBlanketOicPackages && (
                            <div className="application-detail-edit-section">
                              <h3>
                                {editingBoicPackageNumber
                                  ? `Edit ${editingBoicPackageNumber}`
                                  : 'Create Blanket OIC package'}
                              </h3>
                              {isLoadingBoicPackage && (
                                <InlineLoading description="Loading package…" />
                              )}
                              <div className="legacy-search-grid">
                                <TextInput
                                  id="boicPackageNumber"
                                  labelText="Package number"
                                  maxLength={20}
                                  value={boicPackageForm.packageNumber}
                                  disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                  onChange={(event) =>
                                    setBlanketOicPackageFormField(
                                      'packageNumber',
                                      event.target.value.toUpperCase(),
                                    )
                                  }
                                />
                                <TextInput
                                  id="boicPackageSpeciesCodes"
                                  labelText="Species codes (comma separated)"
                                  value={boicPackageForm.speciesCodes}
                                  disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                  onChange={(event) =>
                                    setBlanketOicPackageFormField(
                                      'speciesCodes',
                                      event.target.value.toUpperCase(),
                                    )
                                  }
                                />
                                <TextInput
                                  id="boicPackageEndUseCode"
                                  labelText="End use code"
                                  value={boicPackageForm.endUseCode}
                                  disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                  onChange={(event) =>
                                    setBlanketOicPackageFormField(
                                      'endUseCode',
                                      event.target.value.toUpperCase(),
                                    )
                                  }
                                />
                                <TextInput
                                  id="boicPackageAgeClass"
                                  labelText="Age class code"
                                  value={boicPackageForm.ageClass}
                                  disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                  onChange={(event) =>
                                    setBlanketOicPackageFormField(
                                      'ageClass',
                                      event.target.value.toUpperCase(),
                                    )
                                  }
                                />
                                <TextInput
                                  id="boicPackageProductType"
                                  labelText="Product type code"
                                  value={boicPackageForm.productType}
                                  disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                  onChange={(event) =>
                                    setBlanketOicPackageFormField(
                                      'productType',
                                      event.target.value.toUpperCase(),
                                    )
                                  }
                                />
                                <TextInput
                                  id="boicPackageVolume"
                                  labelText="Package volume (m³)"
                                  value={boicPackageForm.volume}
                                  disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                  onChange={(event) =>
                                    setBlanketOicPackageFormField('volume', event.target.value)
                                  }
                                />
                                <TextInput
                                  id="boicPackageAverageLength"
                                  labelText="Average length"
                                  value={boicPackageForm.averageLength}
                                  disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                  onChange={(event) =>
                                    setBlanketOicPackageFormField(
                                      'averageLength',
                                      event.target.value,
                                    )
                                  }
                                />
                                <TextInput
                                  id="boicPackageAverageDiameter"
                                  labelText="Average top diameter"
                                  value={boicPackageForm.averageDiameter}
                                  disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                  onChange={(event) =>
                                    setBlanketOicPackageFormField(
                                      'averageDiameter',
                                      event.target.value,
                                    )
                                  }
                                />
                                <TextInput
                                  id="boicPackageStatus"
                                  labelText="Status code"
                                  value={boicPackageForm.status}
                                  disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                  onChange={(event) =>
                                    setBlanketOicPackageFormField(
                                      'status',
                                      event.target.value.toUpperCase(),
                                    )
                                  }
                                />
                                <TextInput
                                  id="boicPackageReprocessed"
                                  labelText="Reprocessed indicator"
                                  value={boicPackageForm.reprocessed}
                                  disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                  onChange={(event) =>
                                    setBlanketOicPackageFormField(
                                      'reprocessed',
                                      event.target.value.toUpperCase(),
                                    )
                                  }
                                />
                              </div>
                              <TextArea
                                id="boicPackageComments"
                                labelText="Comments"
                                value={boicPackageForm.comments}
                                disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                onChange={(event) =>
                                  setBlanketOicPackageFormField('comments', event.target.value)
                                }
                              />
                              <div className="application-detail-actions">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isLoadingBoicPackage || isSavingBoicPackage}
                                  renderIcon={isSavingBoicPackage ? PendingIcon : undefined}
                                  onClick={() => void onSaveBlanketOicPackage()}
                                >
                                  {isSavingBoicPackage
                                    ? 'Saving…'
                                    : editingBoicPackageNumber
                                      ? 'Save package'
                                      : 'Create package'}
                                </Button>
                                {editingBoicPackageNumber && (
                                  <Button
                                    type="button"
                                    kind="ghost"
                                    size="sm"
                                    disabled={isSavingBoicPackage}
                                    onClick={resetBlanketOicPackageForm}
                                  >
                                    Cancel edit
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </fieldset>
                        <fieldset
                          className="legacy-form-fieldset"
                          hidden={blanketOicPackageCreationRequired}
                        >
                          <legend>Summary of Scale</legend>
                          {canEditBlanketOicScaleRows && (
                            <>
                              <div className="legacy-search-grid">
                                <SearchableSelect
                                  id="boicScalePackageNumber"
                                  labelText="Package number"
                                  value={selectedBlanketOicPackageNumber}
                                  options={blanketOicPackageOptions}
                                  placeholder="Select package"
                                  disabled={
                                    isSavingBoicScale || blanketOicPackageOptions.length === 0
                                  }
                                  onChange={(value) =>
                                    setBlanketOicScaleFormField('packageNumber', value)
                                  }
                                />
                                <TextInput
                                  id="boicScaleTimberMark"
                                  labelText="Timber mark"
                                  value={boicScaleForm.timberMark}
                                  onChange={(event) =>
                                    setBlanketOicScaleFormField('timberMark', event.target.value)
                                  }
                                  disabled={isSavingBoicScale}
                                />
                                <TextInput
                                  id="boicScaleSpeciesCode"
                                  labelText="Species code"
                                  value={boicScaleForm.speciesCode}
                                  onChange={(event) =>
                                    setBlanketOicScaleFormField('speciesCode', event.target.value)
                                  }
                                  disabled={isSavingBoicScale}
                                />
                                <TextInput
                                  id="boicScaleGradeCode"
                                  labelText="Grade code"
                                  value={boicScaleForm.gradeCode}
                                  onChange={(event) =>
                                    setBlanketOicScaleFormField('gradeCode', event.target.value)
                                  }
                                  disabled={isSavingBoicScale}
                                />
                                <TextInput
                                  id="boicScalePieces"
                                  labelText="Pieces"
                                  value={boicScaleForm.scalePieces}
                                  onChange={(event) =>
                                    setBlanketOicScaleFormField('scalePieces', event.target.value)
                                  }
                                  disabled={isSavingBoicScale}
                                />
                                <TextInput
                                  id="boicScaleVolume"
                                  labelText="Volume (m³)"
                                  value={boicScaleForm.scaleVolume}
                                  onChange={(event) =>
                                    setBlanketOicScaleFormField('scaleVolume', event.target.value)
                                  }
                                  disabled={isSavingBoicScale}
                                />
                              </div>
                              <div className="legacy-search-actions">
                                <Button
                                  kind="primary"
                                  size="sm"
                                  disabled={
                                    isSavingBoicScale ||
                                    !detail.oicApplicationNumber ||
                                    blanketOicPackageOptions.length === 0
                                  }
                                  renderIcon={isSavingBoicScale ? PendingIcon : undefined}
                                  onClick={() => void onAddBlanketOicScale()}
                                >
                                  {isSavingBoicScale ? 'Adding scale…' : 'Add scale'}
                                </Button>
                              </div>
                            </>
                          )}
                          <TextInput
                            id="permitItemsFilter"
                            labelText="Filter item rows"
                            value={itemsFilter}
                            onChange={(event) =>
                              updateFilterParam('itemsFilter', event.target.value)
                            }
                            placeholder="Filter by mark, species, grade, pieces, or volume"
                          />
                          {!permitTablesErrorMessage &&
                            (filteredItems.length > 0 ? (
                              <TableFrame ariaLabel="Permit item rows">
                                <Table size="md" useZebraStyles>
                                  <TableHead>
                                    <TableRow>
                                      {canDisplayNormalPermitScaleMembership && (
                                        <TableHeader>Include in permit</TableHeader>
                                      )}
                                      <TableHeader>Item</TableHeader>
                                      <TableHeader>Timber mark</TableHeader>
                                      <TableHeader>Scale type</TableHeader>
                                      <TableHeader>Permit</TableHeader>
                                      <TableHeader>Pieces</TableHeader>
                                      <TableHeader>Species</TableHeader>
                                      <TableHeader>Grade</TableHeader>
                                      <TableHeader>Volume (m³)</TableHeader>
                                      {canEditBlanketOicScaleRows && (
                                        <TableHeader>Actions</TableHeader>
                                      )}
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {filteredItems.map((row) => (
                                      <TableRow key={row.id}>
                                        {canDisplayNormalPermitScaleMembership && (
                                          <TableCell>
                                            <Checkbox
                                              id={`permit-scale-${row.id}`}
                                              labelText={`Include scale ${row.id} in permit`}
                                              hideLabel
                                              checked={row.includedInPermit}
                                              disabled={
                                                !canEditNormalPermitScaleRows ||
                                                isUpdatingScaleId === row.id
                                              }
                                              onChange={(_, { checked }) =>
                                                void onToggleScaleAttachment(
                                                  row.id,
                                                  Boolean(checked),
                                                )
                                              }
                                            />
                                          </TableCell>
                                        )}
                                        <TableCell>{row.id}</TableCell>
                                        <TableCell>{row.timberMark || '-'}</TableCell>
                                        <TableCell>{row.scaleType || '-'}</TableCell>
                                        <TableCell>{row.permitNumber || '-'}</TableCell>
                                        <TableCell>{row.pieces.toLocaleString()}</TableCell>
                                        <TableCell>{row.species || '-'}</TableCell>
                                        <TableCell>{row.grade || '-'}</TableCell>
                                        <TableCell>{row.volume.toLocaleString()}</TableCell>
                                        {canEditBlanketOicScaleRows && (
                                          <TableCell>
                                            {row.includedInPermit ? (
                                              <Button
                                                kind="danger--ghost"
                                                size="sm"
                                                disabled={isDeletingBoicScaleId === row.id}
                                                renderIcon={TrashCan}
                                                onClick={() => setBoicScalePendingRemoval(row)}
                                              >
                                                {isDeletingBoicScaleId === row.id
                                                  ? 'Removing…'
                                                  : 'Remove'}
                                              </Button>
                                            ) : (
                                              '-'
                                            )}
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </TableFrame>
                            ) : (
                              <EmptyState
                                title={
                                  (tabsData?.items ?? []).length === 0
                                    ? 'No permit items available'
                                    : 'No matching permit items'
                                }
                                description={
                                  (tabsData?.items ?? []).length === 0
                                    ? 'No permit item rows are available for this permit.'
                                    : 'No permit item rows matched the current filter.'
                                }
                                headingLevel={3}
                              />
                            ))}
                        </fieldset>
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel key="fees" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Fee calculation details</h2>
                        <fieldset className="legacy-form-fieldset">
                          <legend>Permit fee summary</legend>
                          <div className="legacy-search-grid">
                            <TextInput
                              id="permitFeeTotalVolume"
                              labelText="Total volume (m³)"
                              value={feeSummaryStatus ?? totalFeeVolume.toLocaleString()}
                              disabled
                            />
                            <TextInput
                              id="permitCalculatedFee"
                              labelText="Calculated fee (CAD)"
                              value={
                                feeSummaryStatus ??
                                (permitFeesMasked ? '$' : `$${formatAmount(calculatedPermitFee)}`)
                              }
                              disabled
                            />
                            <TextInput
                              id="permitEffectiveFee"
                              labelText="Effective fee (CAD)"
                              value={
                                feeSummaryStatus ??
                                (feeOverrideContext?.overrideEnabled
                                  ? `$${formatAmount(Number(feeOverrideContext.overrideFee))}`
                                  : permitFeesMasked
                                    ? '$'
                                    : `$${formatAmount(calculatedPermitFee)}`)
                              }
                              disabled
                            />
                          </div>

                          {!feeOverrideContext || !feeOverrideForm ? (
                            <p>
                              {editContextLoadFailed
                                ? 'Fee override details are unavailable. No override changes can be saved.'
                                : 'Loading fee override details…'}
                            </p>
                          ) : isEditingFeeOverride ? (
                            <>
                              <Checkbox
                                id="permitOverrideEnabled"
                                labelText="Override calculated permit fee"
                                checked={feeOverrideForm.overrideEnabled}
                                disabled={isSavingFeeOverride}
                                onChange={(_, { checked }) =>
                                  setFeeOverrideForm((current) =>
                                    current
                                      ? { ...current, overrideEnabled: Boolean(checked) }
                                      : current,
                                  )
                                }
                              />
                              {feeOverrideForm.overrideEnabled && (
                                <div className="legacy-search-grid">
                                  <TextInput
                                    id="permitOverrideFee"
                                    labelText="Override fee (CAD)"
                                    value={feeOverrideForm.overrideFee}
                                    disabled={isSavingFeeOverride}
                                    onChange={(event) =>
                                      setFeeOverrideForm((current) =>
                                        current
                                          ? { ...current, overrideFee: event.target.value }
                                          : current,
                                      )
                                    }
                                  />
                                  <TextArea
                                    id="permitOverrideComment"
                                    labelText="Override comment"
                                    maxCount={MAX_PERMIT_OVERRIDE_COMMENT_LENGTH}
                                    value={feeOverrideForm.overrideComment}
                                    disabled={isSavingFeeOverride}
                                    onChange={(event) =>
                                      setFeeOverrideForm((current) =>
                                        current
                                          ? { ...current, overrideComment: event.target.value }
                                          : current,
                                      )
                                    }
                                  />
                                </div>
                              )}
                              <div className="legacy-search-actions">
                                <Button
                                  kind="primary"
                                  size="sm"
                                  disabled={isSavingFeeOverride}
                                  renderIcon={isSavingFeeOverride ? PendingIcon : undefined}
                                  onClick={() => void onSaveFeeOverride()}
                                >
                                  {isSavingFeeOverride ? 'Saving…' : 'Save fee override'}
                                </Button>
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  disabled={isSavingFeeOverride}
                                  onClick={() => {
                                    setFeeOverrideForm(feeOverrideContext)
                                    setIsEditingFeeOverride(false)
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="legacy-search-grid">
                                <TextInput
                                  id="permitOverrideStatus"
                                  labelText="Override fees?"
                                  value={feeOverrideContext.overrideEnabled ? 'Yes' : 'No'}
                                  disabled
                                />
                                <TextInput
                                  id="permitOverrideFeeDisplay"
                                  labelText="Override fee (CAD)"
                                  value={feeOverrideContext.overrideFee || '-'}
                                  disabled
                                />
                                <TextArea
                                  id="permitOverrideCommentDisplay"
                                  labelText="Override comment"
                                  value={feeOverrideContext.overrideComment || '-'}
                                  disabled
                                />
                              </div>
                              {canEditFeeOverride && (
                                <div className="legacy-search-actions">
                                  <Button
                                    kind="tertiary"
                                    size="sm"
                                    onClick={() => setIsEditingFeeOverride(true)}
                                  >
                                    Edit fee override
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </fieldset>
                        <TextInput
                          id="permitFeesFilter"
                          labelText="Filter fee rows"
                          value={feesFilter}
                          onChange={(event) => updateFilterParam('feesFilter', event.target.value)}
                          placeholder="Filter by package, timber mark, species, grade, or amount"
                        />
                        {permitFeesErrorMessage ? (
                          <EmptyState
                            title="Fee details unavailable"
                            description={permitFeesErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : deferredPermitTabLoading.fees ? (
                          <InlineLoading description="Loading permit fee details…" />
                        ) : permitTablesErrorMessage ? (
                          <EmptyState
                            title="Fee calculation unavailable"
                            description={permitTablesErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : filteredFees.length > 0 ? (
                          <TableFrame ariaLabel="Permit fee rows">
                            <Table size="md" useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>Package</TableHeader>
                                  <TableHeader>Timber mark</TableHeader>
                                  <TableHeader>Species</TableHeader>
                                  <TableHeader>Grade</TableHeader>
                                  <TableHeader>AMV ($/m³ CAD)</TableHeader>
                                  <TableHeader>Volume (m³)</TableHeader>
                                  {showMinistryFeeColumn && <TableHeader>EWB$</TableHeader>}
                                  <TableHeader>FIL%</TableHeader>
                                  <TableHeader>MF%</TableHeader>
                                  <TableHeader>Fee (CAD)</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {filteredFees.map((row) => (
                                  <TableRow key={row.id}>
                                    <TableCell>{row.packageNumber || '-'}</TableCell>
                                    <TableCell>{row.timberMark || '-'}</TableCell>
                                    <TableCell>{row.species || '-'}</TableCell>
                                    <TableCell>{row.grade || '-'}</TableCell>
                                    <TableCell>{row.amv || '-'}</TableCell>
                                    <TableCell>{row.volume.toLocaleString()}</TableCell>
                                    {showMinistryFeeColumn && (
                                      <TableCell>{row.ewb || '-'}</TableCell>
                                    )}
                                    <TableCell>{row.filPercent || '-'}</TableCell>
                                    <TableCell>{row.mfPercent || '-'}</TableCell>
                                    <TableCell>
                                      {row.amountDisplay.trim() === '$'
                                        ? '$'
                                        : `$${formatAmount(row.amount)}`}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <EmptyState
                            title={
                              (tabsData?.fees ?? []).length === 0
                                ? 'No fee details available'
                                : 'No matching fee details'
                            }
                            description={
                              (tabsData?.fees ?? []).length === 0
                                ? 'No fee rows are available for this permit.'
                                : 'No fee rows matched the current filter.'
                            }
                            headingLevel={3}
                          />
                        )}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                {hasGbmsHistory && (
                  <TabPanel key="gbms" className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <h2 className="detail-tile-title">GBMS invoice history</h2>
                          {gbmsErrorMessage ? (
                            <EmptyState
                              title="GBMS history unavailable"
                              description={gbmsErrorMessage}
                              headingLevel={3}
                              role="alert"
                            />
                          ) : (
                            <TableFrame ariaLabel="GBMS invoice history">
                              <Table size="md" useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>GBMS invoice number</TableHeader>
                                    <TableHeader>Cancelled by invoice</TableHeader>
                                    <TableHeader>Replaced by invoice</TableHeader>
                                    <TableHeader>Invoice amount</TableHeader>
                                    <TableHeader>Printed date</TableHeader>
                                    <TableHeader>Entry date</TableHeader>
                                    <TableHeader>Update date</TableHeader>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {gbmsHistory.map((row) => (
                                    <TableRow key={row.id}>
                                      <TableCell>{row.gbmsInvoiceNumber}</TableCell>
                                      <TableCell>{row.cancelledByInvoice}</TableCell>
                                      <TableCell>{row.replacedByInvoice}</TableCell>
                                      <TableCell>{row.invoiceAmount}</TableCell>
                                      <TableCell>{row.printedDate}</TableCell>
                                      <TableCell>{row.entryDate}</TableCell>
                                      <TableCell>{row.updateDate}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableFrame>
                          )}
                        </Tile>
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
                <TabPanel key="documents" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <div className="detail-section-card__header">
                          <h2 className="detail-tile-title">Permit documents</h2>
                          {canEditPermitDocuments &&
                            (isEditingPermitDocuments ? (
                              <Button
                                kind="tertiary"
                                size="sm"
                                disabled={permitDocumentUploadBusy || isRemovingDocumentId !== null}
                                onClick={onCancelPermitDocumentEditing}
                              >
                                Cancel
                              </Button>
                            ) : (
                              <Button
                                kind="tertiary"
                                size="sm"
                                renderIcon={Edit}
                                onClick={() => setIsEditingPermitDocuments(true)}
                              >
                                Edit permit documents
                              </Button>
                            ))}
                        </div>
                        {isEditingPermitDocuments && canUploadPermitDocuments && (
                          <DetailDocumentUploadPanel
                            key={`permit-document-upload-${permitNumber}-${permitDocumentUploadResetKey}`}
                            workflowType="permit"
                            targetNumber={String(detail.permitNumber ?? permitNumber ?? '')}
                            inputId="permitDocumentUpload"
                            disabled={!detail.permitNumber}
                            onDirtyChange={setPermitDocumentUploadDirty}
                            onBusyChange={setPermitDocumentUploadBusy}
                            onUploadComplete={refreshPermitDocuments}
                          />
                        )}
                        <TextInput
                          id="permitDocumentsFilter"
                          labelText="Filter document rows"
                          value={documentsFilter}
                          onChange={(event) =>
                            updateFilterParam('documentsFilter', event.target.value)
                          }
                          placeholder="Filter by file name, description, type, source, or id"
                        />
                        {deferredPermitTabLoading.documents ? (
                          <InlineLoading description="Loading permit documents…" />
                        ) : documentsErrorMessage ? (
                          <EmptyState
                            title="Permit documents unavailable"
                            description={documentsErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : filteredDocumentRows.length > 0 ? (
                          <TableFrame ariaLabel="Permit document rows">
                            <Table size="md" useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>File name</TableHeader>
                                  <TableHeader>Description</TableHeader>
                                  <TableHeader>Type</TableHeader>
                                  <TableHeader>Source</TableHeader>
                                  <TableHeader>Actions</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {filteredDocumentRows.map((row) => {
                                  const invoiceDocument = isInvoiceDocumentRow(row)
                                  const canDeleteRow =
                                    canDeletePermitDocuments &&
                                    (!invoiceDocument || canDeleteInvoiceDocuments)
                                  return (
                                    <TableRow key={row.id}>
                                      <TableCell>{row.name || '-'}</TableCell>
                                      <TableCell>{row.description || '-'}</TableCell>
                                      <TableCell>{row.type || row.typeCode || '-'}</TableCell>
                                      <TableCell>{formatDocumentSource(row.source)}</TableCell>
                                      <TableCell>
                                        <div className="legacy-search-actions">
                                          <Button
                                            kind="ghost"
                                            size="sm"
                                            disabled={!canPerform('/permitDetails')}
                                            onClick={() => void onOpenDocument(row)}
                                          >
                                            Open
                                          </Button>
                                          {isEditingPermitDocuments && (
                                            <Button
                                              kind="danger--ghost"
                                              size="sm"
                                              disabled={
                                                !canDeleteRow ||
                                                row.deletable === false ||
                                                isRemovingDocumentId === row.id
                                              }
                                              title={
                                                row.deletable === false
                                                  ? 'The document source is not safe to delete from this page.'
                                                  : undefined
                                              }
                                              renderIcon={TrashCan}
                                              onClick={() => setDocumentPendingDeletion(row)}
                                            >
                                              {isRemovingDocumentId === row.id
                                                ? 'Deleting…'
                                                : 'Delete'}
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <EmptyState
                            title={
                              documentRows.length === 0
                                ? 'No permit documents available'
                                : 'No matching permit documents'
                            }
                            description={
                              documentRows.length === 0
                                ? 'No documents are available for this permit.'
                                : 'No document rows matched the current filter.'
                            }
                            headingLevel={3}
                          />
                        )}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel key="invoices" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <div className="detail-section-card__header">
                          <h2 className="detail-tile-title">Invoices</h2>
                          {canEditInvoiceDocuments &&
                            (isEditingInvoiceDocuments ? (
                              <Button
                                kind="tertiary"
                                size="sm"
                                disabled={invoiceDocumentUploadBusy}
                                onClick={onCancelInvoiceDocumentEditing}
                              >
                                Cancel
                              </Button>
                            ) : (
                              <Button
                                kind="tertiary"
                                size="sm"
                                renderIcon={Edit}
                                onClick={() => setIsEditingInvoiceDocuments(true)}
                              >
                                Edit invoice documents
                              </Button>
                            ))}
                        </div>
                        {isEditingInvoiceDocuments && canUploadInvoiceDocuments && (
                          <DetailDocumentUploadPanel
                            key={`invoice-document-upload-${permitNumber}-${invoiceDocumentUploadResetKey}`}
                            workflowType="invoice"
                            targetNumber={String(detail.permitNumber ?? permitNumber ?? '')}
                            inputId="permitInvoiceUpload"
                            disabled={!detail.permitNumber}
                            onDirtyChange={setInvoiceDocumentUploadDirty}
                            onBusyChange={setInvoiceDocumentUploadBusy}
                            onUploadComplete={refreshPermitDocuments}
                          />
                        )}
                        <TextInput
                          id="permitInvoicesFilter"
                          labelText="Filter invoice rows"
                          value={invoicesFilter}
                          onChange={(event) =>
                            updateFilterParam('invoicesFilter', event.target.value)
                          }
                          placeholder="Filter by invoice number, value, rate, or fee-in-lieu"
                        />
                        {deferredPermitTabLoading.invoices ? (
                          <InlineLoading description="Loading permit invoices…" />
                        ) : invoicesErrorMessage ? (
                          <EmptyState
                            title="Invoices unavailable"
                            description={invoicesErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : filteredInvoiceRows.length > 0 ? (
                          <TableFrame ariaLabel="Permit invoice rows">
                            <Table size="md" useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>Invoice number</TableHeader>
                                  <TableHeader>Export value (CAD)</TableHeader>
                                  <TableHeader>Conversion rate</TableHeader>
                                  <TableHeader>Fee in lieu</TableHeader>
                                  <TableHeader>Status</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {filteredInvoiceRows.map((row) => (
                                  <TableRow key={row.id}>
                                    <TableCell>{row.invoiceNumber || '-'}</TableCell>
                                    <TableCell>{row.exportValueCad || '-'}</TableCell>
                                    <TableCell>{row.conversionRate || '-'}</TableCell>
                                    <TableCell>{row.feeInLieu || '-'}</TableCell>
                                    <TableCell>
                                      <StatusTag
                                        status={row.invoiceFound ? 'Found' : 'Missing'}
                                        variant={row.invoiceFound ? 'positive' : 'negative'}
                                      />
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <EmptyState
                            title={
                              invoiceRows.length === 0
                                ? 'No invoices available'
                                : 'No matching invoices'
                            }
                            description={
                              invoiceRows.length === 0
                                ? 'No invoices are available for this permit.'
                                : 'No invoice rows matched the current filter.'
                            }
                            headingLevel={3}
                          />
                        )}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
              </ContiguousTabPanels>
            </Tabs>
          </Column>
        </>
      )}
      {permitApprovalEmailOpen && (
        <ConfirmationModal
          open
          title={`Email permit ${detail?.permitNumber ?? permitNumber ?? ''} approval?`}
          description="Confirm the applicant email address for this notification."
          confirmLabel="Send approval"
          pendingLabel="Sending…"
          confirmDisabled={!isValidEmail(permitApprovalEmailAddress)}
          onClose={() => setPermitApprovalEmailOpen(false)}
          onError={() => undefined}
          onConfirm={async () => {
            const sent = await onSendPermitEmail('approval', permitApprovalEmailAddress)
            if (!sent) {
              throw new Error('Permit approval email was not sent.')
            }
          }}
        >
          <TextInput
            id="permit-approval-email-address"
            type="email"
            labelText="Applicant email address"
            value={permitApprovalEmailAddress}
            invalid={!isValidEmail(permitApprovalEmailAddress)}
            invalidText="Enter one valid email address."
            onChange={(event) => setPermitApprovalEmailAddress(event.target.value)}
          />
        </ConfirmationModal>
      )}
      {permitApplicationPendingRemoval && (
        <ConfirmationModal
          open
          danger
          title="Remove associated application?"
          description={
            <>
              <strong>{permitApplicationPendingRemoval}</strong> will be removed from permit{' '}
              {detail?.permitNumber ?? permitNumber ?? ''}.
            </>
          }
          confirmLabel="Remove"
          pendingLabel="Removing…"
          errorTitle="Failed to remove application"
          onClose={() => setPermitApplicationPendingRemoval(null)}
          onConfirm={() => onRemovePermitApplication(permitApplicationPendingRemoval)}
        />
      )}
      {documentPendingDeletion && (
        <ConfirmationModal
          open
          danger
          title="Delete document"
          description={
            <>
              Permanently delete <strong>{documentPendingDeletion.name || 'this document'}</strong>?
              This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          errorTitle="Failed to delete document"
          onClose={() => setDocumentPendingDeletion(null)}
          onConfirm={() => onRemoveDocument(documentPendingDeletion)}
        />
      )}
      {boicScalePendingRemoval && (
        <ConfirmationModal
          open
          danger
          title="Remove Blanket OIC scale?"
          description={
            <>
              Scale <strong>{boicScalePendingRemoval.id}</strong> (
              {boicScalePendingRemoval.timberMark || 'no timber mark'}) will be removed from permit{' '}
              {detail?.permitNumber ?? permitNumber ?? ''}.
            </>
          }
          confirmLabel="Remove"
          pendingLabel="Removing…"
          errorTitle="Failed to remove Blanket OIC scale"
          onClose={() => setBoicScalePendingRemoval(null)}
          onConfirm={() => onDeleteBlanketOicScale(boicScalePendingRemoval)}
        />
      )}
      <ConfirmationModal
        open={boicPackageNumberPendingDeletion !== null}
        danger
        title={`Delete Blanket OIC package ${boicPackageNumberPendingDeletion ?? ''}?`}
        description={`Delete Blanket OIC package ${boicPackageNumberPendingDeletion ?? ''}. This action cannot be undone.`}
        confirmLabel="Delete package"
        pendingLabel="Deleting…"
        onClose={() => setBoicPackageNumberPendingDeletion(null)}
        onConfirm={async () => {
          if (boicPackageNumberPendingDeletion) {
            await onDeleteBlanketOicPackage(boicPackageNumberPendingDeletion)
          }
        }}
      />
      <UnsavedChangesGuard
        isDirty={isPermitDirty}
        isBusy={
          isSavingPermit ||
          isSavingShipping ||
          isSavingFeeOverride ||
          isSavingBoicPackage ||
          isSavingBoicScale ||
          isUpdatingScaleId !== null ||
          isDeletingBoicScaleId !== null ||
          isDeletingBoicPackageNumber !== null ||
          isSavingPermitApplication ||
          isRemovingPermitApplication !== null ||
          isRemovingDocumentId !== null ||
          permitDocumentUploadBusy ||
          invoiceDocumentUploadBusy
        }
        onSave={onSaveUnsavedPermitChanges}
        onDiscard={onDiscardPermitChanges}
        subject="this permit"
        saveUnavailableReason={
          permitDetailDirty &&
          (isPermitOptionsLoading || permitOptionsUnavailable || requiredPermitOptionsMissing)
            ? 'Authoritative permit options must load before permit changes can be saved.'
            : permitDocumentUploadDirty || invoiceDocumentUploadDirty
              ? 'Finish or reset the queued document uploads before leaving, or discard all changes.'
              : blanketOicPackageDirty && blanketOicScaleDirty
                ? 'Save the Blanket OIC package before adding its scale row, or discard all changes.'
                : undefined
        }
      />
    </Grid>
  )
}

export default ProvincialPermitDetailsPage
