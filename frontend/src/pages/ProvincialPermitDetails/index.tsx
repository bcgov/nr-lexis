import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineLoading,
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
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import { hasProvincialSubmitterRole, hasRole } from '@/context/auth/role-utils'
import ConfirmationModal from '@/components/ConfirmationModal'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import EmptyState from '@/components/EmptyState'
import IsoDatePicker from '@/components/IsoDatePicker'
import PageHeader from '@/components/PageHeader'
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
import { fetchProvincialPermitDetail } from '@/service/lexis-detail-service'
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
  fetchProvincialPermitDetailTabs,
  removeApplicationFromPermit,
  updateBlanketOicPackage,
  updatePermitScaleAttachment,
  type BlanketOicPackageMutationRequest,
  type ProvincialPermitDetailTabsData,
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
const EDITABLE_PERMIT_STATUS_CODES = new Set(['ACT', 'COM', 'CAN'])
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
const PERMIT_DETAIL_TAB_INDEX = {
  permit: 0,
  owner: 1,
  agent: 2,
  shipping: 3,
  items: 4,
  fees: 5,
  gbms: 6,
  documents: 7,
  invoices: 8,
} as const

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
): Promise<ApplicationClientData | null> => {
  if (!clientNumber || !clientLocationCode) {
    return Promise.resolve(null)
  }

  return fetchApplicationClientData(clientNumber, clientLocationCode)
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
        value: isLoading ? 'Loading...' : displayValue(clientData?.companyName),
      },
      { label: 'Address', value: isLoading ? 'Loading...' : displayValue(clientData?.address) },
      { label: 'City', value: isLoading ? 'Loading...' : displayValue(clientData?.city) },
      { label: 'Province', value: isLoading ? 'Loading...' : displayValue(clientData?.province) },
      {
        label: 'Postal code',
        value: isLoading ? 'Loading...' : displayValue(clientData?.postalCode),
      },
      { label: 'Country', value: isLoading ? 'Loading...' : displayValue(clientData?.country) },
      { label: 'Phone', value: isLoading ? 'Loading...' : displayValue(clientData?.phone) },
      { label: 'Fax', value: isLoading ? 'Loading...' : displayValue(clientData?.fax) },
      { label: 'Email', value: isLoading ? 'Loading...' : displayValue(clientData?.email) },
    ]}
  />
)

type PermitDetailFormField =
  | 'permitNumber'
  | 'permitStatus'
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
  permitIssueDate: detailValue(permitDetail.issueDate),
  permitExpiryDate: detailValue(permitDetail.expiryDate),
  permitRequestDate: detailValue(permitDetail.receivedDate),
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
    exemptionNumber: form.exemptionNumber.trim() || null,
    issueDate: form.permitIssueDate.trim() || null,
    expiryDate: form.permitExpiryDate.trim() || null,
    receivedDate: form.permitRequestDate.trim() || null,
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
  if (!permitStatus && !hasReceiptNumber) {
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
  }
}

const permitMutationMessage = (result: PermitDetailMutationResult, fallback: string): string =>
  [result.message || fallback, ...result.warnings].filter(Boolean).join(' ')

const ProvincialPermitDetailsPage = () => {
  const { capabilities, canPerform } = useAuth()
  const { permitNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialPermitDetail | null>(null)
  const [tabsData, setTabsData] = useState<ProvincialPermitDetailTabsData | null>(null)
  const [ownerClientData, setOwnerClientData] = useState<ApplicationClientData | null>(null)
  const [agentClientData, setAgentClientData] = useState<ApplicationClientData | null>(null)
  const [isClientDataLoading, setIsClientDataLoading] = useState(false)
  const [documentRows, setDocumentRows] = useState<PermitDocumentRow[]>([])
  const [invoiceRows, setInvoiceRows] = useState<PermitInvoiceRow[]>([])
  const [permitForm, setPermitForm] = useState<PermitDetailForm | null>(null)
  const [feeOverrideContext, setFeeOverrideContext] = useState<PermitFeeOverrideContext | null>(
    null,
  )
  const [editContextLoaded, setEditContextLoaded] = useState(false)
  const [feeOverrideForm, setFeeOverrideForm] = useState<PermitFeeOverrideForm | null>(null)
  const [isEditingPermit, setIsEditingPermit] = useState(false)
  const [isEditingShipping, setIsEditingShipping] = useState(false)
  const [isEditingFeeOverride, setIsEditingFeeOverride] = useState(false)
  const [isSavingPermit, setIsSavingPermit] = useState(false)
  const [isSavingShipping, setIsSavingShipping] = useState(false)
  const [isSavingFeeOverride, setIsSavingFeeOverride] = useState(false)
  const [isOpeningPermitReport, setIsOpeningPermitReport] = useState(false)
  const [isSendingPermitEmail, setIsSendingPermitEmail] = useState(false)
  const [permitApprovalEmailOpen, setPermitApprovalEmailOpen] = useState(false)
  const [permitApprovalEmailAddress, setPermitApprovalEmailAddress] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [permitTablesErrorMessage, setPermitTablesErrorMessage] = useState('')
  const [documentsInvoicesErrorMessage, setDocumentsInvoicesErrorMessage] = useState('')
  const [documentsInvoicesErrorDismissed, setDocumentsInvoicesErrorDismissed] = useState(false)
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [isUpdatingScaleId, setIsUpdatingScaleId] = useState<string | null>(null)
  const [isDeletingBoicScaleId, setIsDeletingBoicScaleId] = useState<string | null>(null)
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
  const [isLoadingAvailableApplications, setIsLoadingAvailableApplications] = useState(false)
  const [isSavingPermitApplication, setIsSavingPermitApplication] = useState(false)
  const [isRemovingPermitApplication, setIsRemovingPermitApplication] = useState<string | null>(
    null,
  )
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
  const [documentUploadResetKey, setDocumentUploadResetKey] = useState(0)
  const [selectedPermitTabIndex, setSelectedPermitTabIndex] = useState<number>(
    PERMIT_DETAIL_TAB_INDEX.permit,
  )
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
  const beginPermitMutationRequest = useLatestRequestGuard()
  const beginBoicPackageEditRequest = useLatestRequestGuard()
  const beginAvailablePermitApplicationsRequest = useLatestRequestGuard()
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
  const gbmsFilter = searchParams.get('gbmsFilter') ?? ''
  const documentsFilter = searchParams.get('documentsFilter') ?? ''
  const invoicesFilter = searchParams.get('invoicesFilter') ?? ''
  const updateFilterParam = useCallback(
    (
      key: 'itemsFilter' | 'feesFilter' | 'gbmsFilter' | 'documentsFilter' | 'invoicesFilter',
      value: string,
    ) => {
      const nextSearchParams = searchParamsWithValue(searchParams, key, value)

      if (nextSearchParams.toString() !== searchParams.toString()) {
        setSearchParams(nextSearchParams, { replace: true })
      }
    },
    [searchParams, setSearchParams],
  )

  const resetPermitRouteDrafts = useCallback(() => {
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
    setDocumentUploadResetKey((current) => current + 1)
    setAvailablePermitApplications([])
    setPermitApplicationToAdd('')
    setIsLoadingAvailableApplications(false)
    setPermitApprovalEmailOpen(false)
    setPermitApprovalEmailAddress('')
  }, [beginAvailablePermitApplicationsRequest, beginBoicPackageEditRequest])

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
        setIsEditingFeeOverride(false)
        setIsEditingPermit(false)
        setIsEditingShipping(false)
        setTabsData(null)
        setPermitTablesErrorMessage('')
        setDocumentRows([])
        setInvoiceRows([])
        setDocumentsInvoicesErrorMessage('')
        setDocumentsInvoicesErrorDismissed(false)
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      setPermitTablesErrorMessage('')
      setDocumentsInvoicesErrorMessage('')
      setDocumentsInvoicesErrorDismissed(false)
      setTabsData(null)
      setFeeOverrideContext(null)
      setFeeOverrideForm(null)
      setEditContextLoaded(false)
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
          setTabsData(null)
          setPermitTablesErrorMessage('')
          setDocumentRows([])
          setInvoiceRows([])
          return
        }

        try {
          const feeContext = await fetchPermitFeeOverrideContext(permitNumber)
          if (isLatestRequest()) {
            setFeeOverrideContext(feeContext)
            setFeeOverrideForm(feeContext)
            setEditContextLoaded(true)
          }
        } catch (error) {
          if (isLatestRequest()) {
            console.error(error)
            setFeeOverrideContext(null)
            setFeeOverrideForm(null)
            setEditContextLoaded(false)
            setIsEditingFeeOverride(false)
            setIsEditingPermit(false)
            setIsEditingShipping(false)
          }
        }

        try {
          const tabsResult = await fetchProvincialPermitDetailTabs({
            permitNumber,
            receiptNumber: response.receiptNumber,
            blanketOic: response.blanketOic,
          })
          if (isLatestRequest()) {
            setTabsData(tabsResult)
            setPermitTablesErrorMessage('')
          }
        } catch (error) {
          if (isLatestRequest()) {
            console.error(error)
            setTabsData(EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS)
            setPermitTablesErrorMessage('Unable to retrieve permit table details.')
          }
        }

        try {
          const documentsResult = await fetchPermitDocuments(permitNumber)
          const invoicesResult = await fetchPermitInvoices(permitNumber)
          if (isLatestRequest()) {
            setDocumentRows(documentsResult.rows)
            setInvoiceRows(invoicesResult.rows)
          }
        } catch (error) {
          if (isLatestRequest()) {
            console.error(error)
            setDocumentRows([])
            setInvoiceRows([])
            setDocumentsInvoicesErrorMessage(
              'Unable to retrieve permit documents or invoice details.',
            )
            setDocumentsInvoicesErrorDismissed(false)
          }
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve provincial permit detail.')
          setDetail(null)
          setPermitForm(null)
          setFeeOverrideContext(null)
          setFeeOverrideForm(null)
          setEditContextLoaded(false)
          setIsEditingFeeOverride(false)
          setIsEditingPermit(false)
          setIsEditingShipping(false)
          setTabsData(null)
          setPermitTablesErrorMessage('')
          setDocumentRows([])
          setInvoiceRows([])
          setDocumentsInvoicesErrorMessage('')
          setDocumentsInvoicesErrorDismissed(false)
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    }

    void load()
  }, [permitNumber, beginDetailRequest, resetPermitRouteDrafts])

  useEffect(() => {
    return () => {
      if (permitNumber) {
        void releasePermitEditLock(permitNumber)
      }
    }
  }, [permitNumber])

  useEffect(() => {
    let isCancelled = false

    const loadClientData = async () => {
      setOwnerClientData(null)
      setAgentClientData(null)

      if (!detail) {
        setIsClientDataLoading(false)
        return
      }

      const ownerClientNumber = detail.ownerClientNumber
      const ownerClientLocationCode = detail.ownerClientLocationCode
      const agentClientNumber = detail.applicantClientNumber
      const agentClientLocationCode = detail.agentClientLocationCode
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
          fetchPermitClientData(ownerClientNumber, ownerClientLocationCode),
          fetchPermitClientData(agentClientNumber, agentClientLocationCode),
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
  }, [detail])

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

  const filteredGbmsEvents = useMemo(() => {
    if (!tabsData) {
      return []
    }

    return tabsData.gbmsEvents.filter((row) =>
      matchesFilter(
        [row.id, row.eventDate, row.eventType, row.status, row.reference, row.notes],
        gbmsFilter,
      ),
    )
  }, [gbmsFilter, tabsData])

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
    hasPermitMutationPermission && !editContextLoaded
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
    canPerform('/filePermitUpload') && editContextLoaded && !permitEditLocked && !permitExpired
  const canUploadInvoiceDocuments =
    canPerform('/fileInvoiceUpload') &&
    editContextLoaded &&
    !permitEditLocked &&
    permitStatusCode === 'ACT'
  const canSavePermit =
    canPerform('savePermit') && editContextLoaded && !permitEditLocked && !permitExpired
  const canEditShipping = canSavePermit && permitStatusCode !== 'CAN'
  const invoiceMaterialLocked = permitStatusCode === 'COM' || permitStatusCode === 'PPD'
  const canEnterPaymentReceipt = permitStatusCode === 'PPD' && !detail?.receiptNumber?.trim()
  const canSendPermitApproval =
    canSavePermit && (permitStatusCode === 'COM' || permitStatusCode === 'PPD')
  const canRequestPermitReview =
    hasProvincialSubmitterRole(capabilities.roles) &&
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
    editContextLoaded &&
    !permitEditLocked &&
    !!permitStatusCode &&
    ((adminUser && permitStatusCode !== 'EXP') ||
      (hasDocumentActorRole && !readOnlyUser && permitStatusCode === 'ACT'))
  const canDeleteInvoiceDocuments =
    editContextLoaded &&
    !permitEditLocked &&
    hasDocumentActorRole &&
    (adminUser || !readOnlyUser) &&
    permitStatusCode === 'ACT'
  const scaleAttachmentLockedStatuses = new Set(['COM', 'PPD', 'EXP', 'CAN'])
  const feeOverrideLockedStatuses = new Set(['COM', 'PPD', 'EXP', 'CAN'])
  const canOpenPermitReport = canPerform('/permitReport') && permitStatusCode === 'COM'
  const permitTablesAvailable = tabsData !== null && !permitTablesErrorMessage
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
    !!tabsData &&
    (detail?.blanketOic ? !!detail.oicApplicationNumber : tabsData.applications.length > 0) &&
    tabsData.packages.length > 0 &&
    tabsData.items.length > 0
  const totalFeeVolume = (tabsData?.fees ?? []).reduce((total, row) => total + row.volume, 0)
  const calculatedPermitFee = (tabsData?.fees ?? []).reduce((total, row) => total + row.amount, 0)
  const permitFeesMasked = (tabsData?.fees ?? []).some((row) => row.amountDisplay.trim() === '$')
  const reloadPermitTabs = useCallback(async () => {
    const resolvedPermitNumber = detail?.permitNumber
      ? String(detail.permitNumber)
      : (permitNumber ?? '')
    if (!resolvedPermitNumber || !detail) {
      return
    }

    const tabsResult = await fetchProvincialPermitDetailTabs({
      permitNumber: resolvedPermitNumber,
      receiptNumber: detail.receiptNumber,
      blanketOic: detail.blanketOic,
    })
    setTabsData(tabsResult)
    setPermitTablesErrorMessage('')
  }, [detail, permitNumber])

  const reloadAvailablePermitApplications = useCallback(async () => {
    const isLatestRequest = beginAvailablePermitApplicationsRequest()
    if (!canEditPermitApplications || !detail?.exemptionNumber) {
      if (isLatestRequest()) {
        setAvailablePermitApplications([])
        setPermitApplicationToAdd('')
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
    } catch (error) {
      if (!isLatestRequest()) return
      console.error(error)
      setAvailablePermitApplications([])
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

  useEffect(() => {
    void reloadAvailablePermitApplications()
  }, [reloadAvailablePermitApplications])
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
      permitRequestDate: isoDateFieldError(permitForm.permitRequestDate) ?? undefined,
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
    setPermitForm((current) => (current ? { ...current, [field]: value } : current))
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

      if (hasPermitValidationError || (includeShipping && hasShippingValidationError)) {
        setShowPermitValidationErrors(true)
        setActionErrorMessage(
          Object.values(permitFieldErrors).find((error): error is string => !!error) ??
            'Please fix validation errors before saving the permit.',
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
      setIsSavingPermit(true)
      try {
        const result = await updatePermitDetail(request)
        if (!isLatestRequest()) {
          return false
        }
        if (!result.success) {
          setActionErrorMessage(result.errors[0] || result.message || 'Unable to save permit.')
          return false
        }

        const detailWithPermitChanges = withUpdatedPermitDetail(
          detail,
          request,
          editablePermitStatusOptions,
          editablePermitRegionOptions,
        )
        const updatedDetail = withPermitMutationResult(
          includeShipping
            ? withUpdatedPermitShipping(detailWithPermitChanges, request)
            : detailWithPermitChanges,
          result,
        )
        setDetail((current) => {
          if (!current) return current
          const currentWithPermitChanges = withUpdatedPermitDetail(
            current,
            request,
            editablePermitStatusOptions,
            editablePermitRegionOptions,
          )
          return withPermitMutationResult(
            includeShipping
              ? withUpdatedPermitShipping(currentWithPermitChanges, request)
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
    const parsedFee = Number(normalizedFee)
    if (
      feeOverrideForm.overrideEnabled &&
      (!normalizedFee || !Number.isFinite(parsedFee) || parsedFee <= 0)
    ) {
      setActionErrorMessage('Override fee must be a dollar amount greater than zero.')
      return false
    }

    const request: PermitDetailMutationRequest = {
      ...buildPermitDetailForm(detail),
      overrideInd: String(feeOverrideForm.overrideEnabled),
      overrideFee: feeOverrideForm.overrideEnabled ? normalizedFee : '',
      overrideComment: feeOverrideForm.overrideEnabled
        ? feeOverrideForm.overrideComment.trim()
        : '',
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
      const result = await updatePermitDetail(request)
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
        overrideComment: feeOverrideForm.overrideEnabled
          ? feeOverrideForm.overrideComment.trim()
          : '',
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

        await reloadPermitTabs()
        setActionInfoMessage(result.message || 'Permit item rows were updated.')
      } catch (error) {
        console.error(error)
        setActionErrorMessage('Unable to update permit item rows.')
      } finally {
        setIsUpdatingScaleId(null)
      }
    },
    [canEditNormalPermitScaleRows, detail?.permitNumber, permitNumber, reloadPermitTabs],
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
        return
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
          setActionErrorMessage(
            result.errors[0] || result.message || 'Unable to remove application from the permit.',
          )
          return
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
        setActionErrorMessage('Unable to remove application from the permit.')
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
      try {
        const result = await deleteBlanketOicPackage(resolvedPermitNumber, packageNumberToDelete)
        if (!result.success) {
          setActionErrorMessage(
            result.errors[0] || result.message || 'Unable to delete the Blanket OIC package.',
          )
          return
        }
        if (editingBoicPackageNumber === packageNumberToDelete) {
          resetBlanketOicPackageForm()
        }
        await reloadPermitTabs()
        setActionInfoMessage(result.message || 'Blanket OIC package was deleted.')
      } catch (error) {
        console.error(error)
        setActionErrorMessage('Unable to delete the Blanket OIC package.')
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
        await reloadPermitTabs()
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
    reloadPermitTabs,
    selectedBlanketOicPackageNumber,
  ])

  const onDeleteBlanketOicScale = useCallback(
    async (scaleId: string) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (!canEditBlanketOicScaleRows || !resolvedPermitNumber || !scaleId) {
        return
      }

      setActionErrorMessage('')
      setActionInfoMessage('')
      setIsDeletingBoicScaleId(scaleId)
      try {
        const result = await deleteBlanketOicScale({
          scaleId,
          permitNumber: resolvedPermitNumber,
        })
        if (!result.success) {
          setActionErrorMessage(
            result.errors[0] || result.message || 'Unable to remove Blanket OIC scale detail.',
          )
          return
        }

        await reloadPermitTabs()
        setActionInfoMessage(result.message || 'Blanket OIC scale detail was removed.')
      } catch (error) {
        console.error(error)
        setActionErrorMessage('Unable to remove Blanket OIC scale detail.')
      } finally {
        setIsDeletingBoicScaleId(null)
      }
    },
    [canEditBlanketOicScaleRows, detail?.permitNumber, permitNumber, reloadPermitTabs],
  )

  const refreshPermitDocuments = useCallback(async () => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!resolvedPermitNumber) {
      return
    }

    const documentsResult = await fetchPermitDocuments(resolvedPermitNumber)
    const invoicesResult = await fetchPermitInvoices(resolvedPermitNumber)
    setDocumentRows(documentsResult.rows)
    setInvoiceRows(invoicesResult.rows)
    setDocumentsInvoicesErrorMessage('')
  }, [detail?.permitNumber, permitNumber])

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
      triggerBrowserDownload(result.blob, result.filename)
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
          setActionInfoMessage(result.message || 'Permit email queued successfully.')
          if (type === 'request' && result.permitRequestDate) {
            setDetail((current) =>
              current ? { ...current, receivedDate: result.permitRequestDate } : current,
            )
            setPermitForm((current) =>
              current ? { ...current, permitRequestDate: result.permitRequestDate } : current,
            )
          }
          return true
        } else {
          setActionErrorMessage(result.message || 'Permit email could not be queued.')
          return false
        }
      } catch (error) {
        console.error(error)
        setActionErrorMessage('Unable to queue permit email.')
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
        return
      }

      const invoiceDocument = isInvoiceDocumentRow(row)
      if (
        row.deletable === false ||
        !canDeletePermitDocuments ||
        (invoiceDocument && !canDeleteInvoiceDocuments)
      ) {
        return
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
          setActionErrorMessage('Unable to remove selected document.')
          return
        }

        const documentsResult = await fetchPermitDocuments(resolvedPermitNumber)
        const invoicesResult = await fetchPermitInvoices(resolvedPermitNumber)
        if (isLatestRequest()) {
          setDocumentRows(documentsResult.rows)
          setInvoiceRows(invoicesResult.rows)
          setDocumentsInvoicesErrorMessage('')
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setActionErrorMessage('Unable to remove selected document.')
        }
      } finally {
        if (isLatestRequest()) {
          setIsRemovingDocumentId(null)
        }
      }
    },
    [
      beginDocumentRefreshRequest,
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
    setDocumentUploadResetKey((current) => current + 1)
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
    />
  )

  return (
    <Grid fullWidth className="default-grid detail-page-grid">
      <Column sm={4} md={8} lg={16}>
        <DetailBreadcrumb label="Provincial permit search" to="/provincial/permit" />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <div className="application-detail-title-row">
          <PageHeader
            title={`Permit ${detail?.permitNumber ?? permitNumber ?? ''}`.trim()}
            subtitle="Check and manage this provincial permit"
            status={
              detail ? (
                <StatusTag
                  status={detail.permitStatusDescription ?? detail.permitStatusCode ?? ''}
                  fallbackLabel="Not provided"
                />
              ) : undefined
            }
            actions={
              canRequestPermitReview || canSendPermitApproval || canOpenPermitReport ? (
                <>
                  {canRequestPermitReview && (
                    <Button
                      kind="secondary"
                      size="sm"
                      disabled={isSendingPermitEmail || !permitReviewReady}
                      title={
                        permitReviewReady
                          ? undefined
                          : 'An active permit requires an application, package, and scale detail before review can be requested.'
                      }
                      onClick={() => void onSendPermitEmail('request')}
                    >
                      Email review request
                    </Button>
                  )}
                  {canSendPermitApproval && (
                    <Button
                      kind="secondary"
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
                      onClick={() => void onOpenPermitReport()}
                    >
                      {isOpeningPermitReport ? 'Opening...' : 'Print permit'}
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />
          {detail && (
            <dl className="application-detail-header-metrics" aria-label="Permit highlights">
              <div>
                <dt>Application</dt>
                <dd>{displayValue(detail.applicationNumber)}</dd>
              </div>
              <div>
                <dt>Exemption</dt>
                <dd>{displayValue(detail.exemptionNumber)}</dd>
              </div>
              <div>
                <dt>Documents</dt>
                <dd>
                  {documentsInvoicesErrorMessage
                    ? 'Unavailable'
                    : documentRows.length.toLocaleString()}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading provincial permit detail..." />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <AppNotification
            kind="error"
            title="Detail unavailable"
            subtitle={errorMessage}
            lowContrast
            onCloseButtonClick={() => setErrorMessage('')}
          />
        </Column>
      )}

      {!loading && !!documentsInvoicesErrorMessage && !documentsInvoicesErrorDismissed && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <AppNotification
            kind="warning"
            title="Documents/invoices unavailable"
            subtitle={documentsInvoicesErrorMessage}
            lowContrast
            onCloseButtonClick={() => setDocumentsInvoicesErrorDismissed(true)}
          />
        </Column>
      )}

      {!loading && detail && (
        <>
          {!!permitTablesErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="warning"
                title="Permit tables unavailable"
                subtitle={permitTablesErrorMessage}
                lowContrast
              />
            </Column>
          )}
          {!!permitEditLockMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="warning"
                title="Editing unavailable"
                subtitle={permitEditLockMessage}
                lowContrast
              />
            </Column>
          )}
          {!!permitEditContextUnavailableMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="warning"
                title="Editing unavailable"
                subtitle={permitEditContextUnavailableMessage}
                lowContrast
              />
            </Column>
          )}
          {!!shippingReferencesErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="warning"
                title="Shipping options unavailable"
                subtitle={shippingReferencesErrorMessage}
                lowContrast
              />
            </Column>
          )}
          {!!permitOptionsErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="warning"
                title="Permit options unavailable"
                subtitle={permitOptionsErrorMessage}
                lowContrast
              />
            </Column>
          )}
          {requiredPermitOptionsMissing && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="warning"
                title="Required permit options not configured"
                subtitle="A required permit status or Blanket OIC region list is empty. Permit saves are disabled."
                lowContrast
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
              onChange={({ selectedIndex }) => setSelectedPermitTabIndex(selectedIndex)}
            >
              <TabList
                aria-label="Permit detail sections"
                contained
                size="md"
                className="application-tabs__list application-detail-tab-list"
              >
                <Tab>Permit</Tab>
                <Tab>Owner</Tab>
                <Tab>Agent</Tab>
                <Tab>Shipping</Tab>
                <Tab>Items</Tab>
                <Tab>Fees</Tab>
                <Tab>GBMS</Tab>
                <Tab>Documents</Tab>
                <Tab>Invoices</Tab>
              </TabList>
              <TabPanels>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      {isEditingPermit && permitForm ? (
                        <Tile>
                          <h2 className="detail-tile-title">Permit summary</h2>
                          <div className="legacy-search-grid">
                            {renderPermitTextInput('permitNumber', 'Permit number', true)}
                            <TextInput
                              id="permit-applicationNumber"
                              labelText="Application number"
                              value={displayValue(detail.applicationNumber)}
                              disabled
                            />
                            <TextInput
                              id="permit-packageNumber"
                              labelText="Package number"
                              value={displayValue(detail.packageNumber)}
                              disabled
                            />
                            {renderPermitTextInput(
                              'exemptionNumber',
                              'Exemption number',
                              invoiceMaterialLocked,
                            )}
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
                              disabled={isPermitOptionsLoading || permitStatusOptions.length === 0}
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
                            <TextInput
                              id="permit-applicationDate"
                              labelText="Submit date"
                              value={displayValue(detail.applicationDate)}
                              disabled
                            />
                            {renderPermitTextInput(
                              'permitIssueDate',
                              'Issue date',
                              invoiceMaterialLocked,
                            )}
                            {renderPermitTextInput('permitExpiryDate', 'Expiry date', false)}
                            {renderPermitTextInput('permitRequestDate', 'Received date', false)}
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
                            { label: 'Permit number', value: displayValue(detail.permitNumber) },
                            {
                              label: 'Application number',
                              value: displayValue(detail.applicationNumber),
                            },
                            { label: 'Package number', value: displayValue(detail.packageNumber) },
                            {
                              label: 'Exemption number',
                              value: displayValue(detail.exemptionNumber),
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
                            { label: 'Submit date', value: displayValue(detail.applicationDate) },
                            { label: 'Issue date', value: displayValue(detail.issueDate) },
                            { label: 'Expiry date', value: displayValue(detail.expiryDate) },
                            { label: 'Received date', value: displayValue(detail.receivedDate) },
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
                            {renderPermitTextInput(
                              'permitTotalVolume',
                              'Permit volume (m³)',
                              invoiceMaterialLocked,
                            )}
                            {renderPermitTextInput(
                              'permitNumberOfPieces',
                              'Number of pieces',
                              invoiceMaterialLocked,
                            )}
                            {renderPermitTextInput(
                              'permitReceiptNo',
                              'Receipt number',
                              invoiceMaterialLocked && !canEnterPaymentReceipt,
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
                            {renderPermitTextArea('permitRemarks', 'Remarks', false)}
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
                            { label: 'Receipt number', value: displayValue(detail.receiptNumber) },
                            { label: 'Invoice number', value: displayValue(detail.invoiceNumber) },
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
                          {!permitTablesErrorMessage &&
                            (associatedPermitApplications.length > 0 ? (
                              <TableFrame ariaLabel="Associated permit applications">
                                <Table useZebraStyles>
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
                                        <TableCell>{applicationNumber}</TableCell>
                                        {canEditPermitApplications && (
                                          <TableCell>
                                            <Button
                                              kind="ghost"
                                              size="sm"
                                              disabled={
                                                isRemovingPermitApplication === applicationNumber
                                              }
                                              onClick={() =>
                                                void onRemovePermitApplication(applicationNumber)
                                              }
                                            >
                                              {isRemovingPermitApplication === applicationNumber
                                                ? 'Removing...'
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
                            ))}
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
                                      : 'Select application'
                                  }
                                  disabled={
                                    isSavingPermitApplication ||
                                    isLoadingAvailableApplications ||
                                    availablePermitApplicationOptions.length === 0
                                  }
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
                                  onClick={() => void onAddPermitApplication()}
                                >
                                  {isSavingPermitApplication ? 'Adding...' : 'Add application'}
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
                                onClick={() => void onSavePermit()}
                              >
                                {isSavingPermit ? 'Saving...' : 'Save permit'}
                              </Button>
                              <Button
                                kind="secondary"
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
                              kind="secondary"
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
                <TabPanel className="application-detail-tab-panel">
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
                <TabPanel className="application-detail-tab-panel">
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
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      {isEditingShipping && permitForm ? (
                        <Tile>
                          <h2 className="detail-tile-title">Shipping</h2>
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
                            { label: 'Transport name', value: displayValue(detail.transportName) },
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
                                onClick={() => void onSaveShipping()}
                              >
                                {isSavingShipping ? 'Saving...' : 'Save shipping'}
                              </Button>
                              <Button
                                kind="secondary"
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
                              kind="secondary"
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
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Permit items</h2>
                        <fieldset className="legacy-form-fieldset">
                          <legend>
                            {detail.blanketOic ? 'Blanket OIC package details' : 'Package details'}
                          </legend>
                          {!permitTablesErrorMessage &&
                            ((tabsData?.packages ?? []).length > 0 ? (
                              <TableFrame ariaLabel="Permit packages">
                                <Table useZebraStyles>
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
                                                  (item) =>
                                                    item.packageNumber === row.packageNumber,
                                                )
                                              }
                                              onClick={() =>
                                                setBoicPackageNumberPendingDeletion(
                                                  row.packageNumber,
                                                )
                                              }
                                            >
                                              {isDeletingBoicPackageNumber === row.packageNumber
                                                ? 'Deleting...'
                                                : 'Delete'}
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
                                title="No package details"
                                description="No package detail rows are available for this permit."
                                headingLevel={3}
                              />
                            ))}
                          {canEditBlanketOicPackages && (
                            <div className="application-detail-edit-section">
                              <h3>
                                {editingBoicPackageNumber
                                  ? `Edit ${editingBoicPackageNumber}`
                                  : 'Create Blanket OIC package'}
                              </h3>
                              {isLoadingBoicPackage && (
                                <InlineLoading description="Loading package..." />
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
                                  onClick={() => void onSaveBlanketOicPackage()}
                                >
                                  {isSavingBoicPackage
                                    ? 'Saving...'
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
                        <fieldset className="legacy-form-fieldset">
                          <legend>Summary of scale</legend>
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
                                  onClick={() => void onAddBlanketOicScale()}
                                >
                                  {isSavingBoicScale ? 'Adding scale...' : 'Add scale'}
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
                                <Table useZebraStyles>
                                  <TableHead>
                                    <TableRow>
                                      {canDisplayNormalPermitScaleMembership && (
                                        <TableHeader>Include in permit</TableHeader>
                                      )}
                                      <TableHeader>Item</TableHeader>
                                      <TableHeader>Timber mark</TableHeader>
                                      <TableHeader>Species</TableHeader>
                                      <TableHeader>Grade</TableHeader>
                                      <TableHeader>Pieces</TableHeader>
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
                                        <TableCell>{row.species || '-'}</TableCell>
                                        <TableCell>{row.grade || '-'}</TableCell>
                                        <TableCell>{row.pieces.toLocaleString()}</TableCell>
                                        <TableCell>{row.volume.toLocaleString()}</TableCell>
                                        {canEditBlanketOicScaleRows && (
                                          <TableCell>
                                            {row.includedInPermit ? (
                                              <Button
                                                kind="ghost"
                                                size="sm"
                                                disabled={isDeletingBoicScaleId === row.id}
                                                onClick={() => void onDeleteBlanketOicScale(row.id)}
                                              >
                                                {isDeletingBoicScaleId === row.id
                                                  ? 'Removing...'
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
                <TabPanel className="application-detail-tab-panel">
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
                              value={
                                permitTablesErrorMessage
                                  ? 'Unavailable'
                                  : totalFeeVolume.toLocaleString()
                              }
                              disabled
                            />
                            <TextInput
                              id="permitCalculatedFee"
                              labelText="Calculated fee (CAD)"
                              value={
                                permitTablesErrorMessage
                                  ? 'Unavailable'
                                  : permitFeesMasked
                                    ? '$'
                                    : `$${formatAmount(calculatedPermitFee)}`
                              }
                              disabled
                            />
                            <TextInput
                              id="permitEffectiveFee"
                              labelText="Effective fee (CAD)"
                              value={
                                permitTablesErrorMessage
                                  ? 'Unavailable'
                                  : feeOverrideContext?.overrideEnabled
                                    ? `$${formatAmount(Number(feeOverrideContext.overrideFee))}`
                                    : permitFeesMasked
                                      ? '$'
                                      : `$${formatAmount(calculatedPermitFee)}`
                              }
                              disabled
                            />
                          </div>

                          {!feeOverrideContext || !feeOverrideForm ? (
                            <p>
                              Fee override details are unavailable. No override changes can be
                              saved.
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
                                  onClick={() => void onSaveFeeOverride()}
                                >
                                  {isSavingFeeOverride ? 'Saving...' : 'Save fee override'}
                                </Button>
                                <Button
                                  kind="secondary"
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
                                    kind="secondary"
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
                        {!permitTablesErrorMessage &&
                          (filteredFees.length > 0 ? (
                            <TableFrame ariaLabel="Permit fee rows">
                              <Table useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Package</TableHeader>
                                    <TableHeader>Timber Mark</TableHeader>
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
                          ))}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">
                          General Billing Management System events
                        </h2>
                        <TextInput
                          id="permitGbmsFilter"
                          labelText="Filter General Billing Management System rows"
                          value={gbmsFilter}
                          onChange={(event) => updateFilterParam('gbmsFilter', event.target.value)}
                          placeholder="Filter by type, status, date, reference, or notes"
                        />
                        {!permitTablesErrorMessage &&
                          (filteredGbmsEvents.length > 0 ? (
                            <TableFrame ariaLabel="Permit billing events">
                              <Table useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Date</TableHeader>
                                    <TableHeader>Type</TableHeader>
                                    <TableHeader>Status</TableHeader>
                                    <TableHeader>Reference</TableHeader>
                                    <TableHeader>Notes</TableHeader>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {filteredGbmsEvents.map((row) => (
                                    <TableRow key={row.id}>
                                      <TableCell>{row.eventDate || '-'}</TableCell>
                                      <TableCell>{row.eventType || '-'}</TableCell>
                                      <TableCell>
                                        {row.status ? <StatusTag status={row.status} /> : '-'}
                                      </TableCell>
                                      <TableCell>{row.reference || '-'}</TableCell>
                                      <TableCell>{row.notes || '-'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableFrame>
                          ) : (
                            <EmptyState
                              title={
                                (tabsData?.gbmsEvents ?? []).length === 0
                                  ? 'No billing events available'
                                  : 'No matching billing events'
                              }
                              description={
                                (tabsData?.gbmsEvents ?? []).length === 0
                                  ? 'No billing system rows are available for this permit.'
                                  : 'No billing system rows matched the current filter.'
                              }
                              headingLevel={3}
                            />
                          ))}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Permit documents</h2>
                        {canUploadPermitDocuments && (
                          <DetailDocumentUploadPanel
                            key={`permit-document-upload-${permitNumber}-${documentUploadResetKey}`}
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
                        {documentsInvoicesErrorMessage ? (
                          <EmptyState
                            title="Permit documents unavailable"
                            description={documentsInvoicesErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : filteredDocumentRows.length > 0 ? (
                          <TableFrame ariaLabel="Permit document rows">
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
                                            onClick={() => void onRemoveDocument(row)}
                                          >
                                            {isRemovingDocumentId === row.id
                                              ? 'Deleting...'
                                              : 'Delete'}
                                          </Button>
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
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Invoices</h2>
                        {canUploadInvoiceDocuments && (
                          <DetailDocumentUploadPanel
                            key={`invoice-document-upload-${permitNumber}-${documentUploadResetKey}`}
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
                        {documentsInvoicesErrorMessage ? (
                          <EmptyState
                            title="Invoices unavailable"
                            description={documentsInvoicesErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : filteredInvoiceRows.length > 0 ? (
                          <TableFrame ariaLabel="Permit invoice rows">
                            <Table useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>Invoice number</TableHeader>
                                  <TableHeader>Export value (CAD)</TableHeader>
                                  <TableHeader>Conversion Rate</TableHeader>
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
              </TabPanels>
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
          onConfirm={async () => {
            const sent = await onSendPermitEmail('approval', permitApprovalEmailAddress)
            if (!sent) {
              throw new Error('Permit approval email was not queued.')
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
