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
  Box,
  Certificate,
  Currency,
  DocumentAdd,
  DocumentAttachment,
  EarthFilled,
  Edit,
  Enterprise,
  TrashCan,
} from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
  Loading,
  RadioButton,
  RadioButtonGroup,
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
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import { hasProvincialSubmitterRole, hasRole, isPureReadOnlyRole } from '@/context/auth/role-utils'
import ConfirmationModal from '@/components/ConfirmationModal'
import ContentLoadingOverlay from '@/components/ContentLoadingOverlay'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import DetailLoadError from '@/components/DetailLoadError'
import DetailSidePanel from '@/components/DetailSidePanel'
import DisabledButtonTooltip from '@/components/DisabledButtonTooltip'
import EmptyState from '@/components/EmptyState'
import ForestClientComboBox from '@/components/ForestClientComboBox'
import IsoDatePicker from '@/components/IsoDatePicker'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import PermitCountrySelect from '@/components/PermitCountrySelect'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { AppNotification } from '../../components/AppNotification'
import DetailDocumentUploadPanel from '../../components/uploads/DetailDocumentUploadPanel'
import SearchableSelect from '../../components/SearchableSelect'
import type { ProvincialPermitDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '../shared/DetailSections'
import { displayValue } from '@/pages/shared/detail-page-utils'
import {
  locationPath,
  readDetailReturnTo,
  withDetailReturnTo,
} from '@/pages/shared/detail-navigation'
import {
  atMostOneDecimalFieldError,
  firstValidationError,
  formatRoundedNumericFieldValue,
  getVisibleFieldError,
  greaterThanFieldError,
  greaterThanOrEqualFieldError,
  integerFieldError,
  isoDateFieldError,
  lessThanOrEqualFieldError,
  maxLengthFieldError,
  maxNumericValueFieldError,
  numericFieldError,
  positiveNumericFieldError,
  requiredFieldError,
  requiredMaxLengthFieldError,
  requiredNumericFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import BlanketOicPackageCodeFields from './BlanketOicPackageCodeFields'
import BlanketOicScaleCodeFields from './BlanketOicScaleCodeFields'
import { resolveBlanketOicRegionContext } from '../ProvincialBlanketOicPermitCreate/region-context'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { useReloadPreservedTab } from '@/pages/shared/useReloadPreservedTab'
import {
  CLIENT_LOOKUP_UNAVAILABLE_MESSAGE,
  clientLocationLabel,
  clientLookupNumbersMatch,
  isSelectableClientLocation,
  resolveClientLocationCode,
} from '@/pages/shared/application-form-utils'
import { requiredLabel } from '@/utils/required-label'
import {
  fetchProvincialPermitDetail,
  fetchProvincialPermitExemptionContext,
} from '@/service/lexis-detail-service'
import {
  fetchApplicationClientData,
  fetchExemptionClientData,
  fetchExemptionClientLocations,
  type ApplicationClientData,
  type ApplicationClientLocation,
} from '@/service/application-client-lookup-service'
import { fetchExemptionRegionContext } from '@/service/provincial-exemption-detail-service'
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
  updatePermitScaleSelection,
  type BlanketOicPackageMutationRequest,
  type PermitAvailableApplicationItem,
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
import { openDocumentPreview } from '@/utils/document-preview'
import { formatPermitNumber, formatPermitStatus } from '@/utils/permit'
import { formatPackageNumberLabel, isValidEmail, normalizeTrimmedText } from '@/utils/text'

import './ProvincialPermitDetails.scss'

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

type BlanketOicPackageField = keyof BlanketOicPackageForm
type BlanketOicPackageFieldErrors = Partial<Record<BlanketOicPackageField, string>>

type PermitFeeOverrideForm = PermitFeeOverrideContext
type PermitFeeOverrideField = 'overrideFee' | 'overrideComment'
type PermitFeeOverrideFieldErrors = Partial<Record<PermitFeeOverrideField, string>>
type ActionSuccessNotification = {
  title: string
  subtitle: string
}

const MAX_OIC_REQUEST_PIECES = 9_999_999_999
const MAX_OIC_REQUEST_VOLUME_LENGTH = 9
const MAX_PERMIT_OVERRIDE_FEE = 9_999_999.99
const MAX_PERMIT_OVERRIDE_COMMENT_LENGTH = 254
const MAX_REVIEWED_PERMIT_REMARKS_LENGTH = 250
const PACKAGE_COMMENTS_MAX_LENGTH = 180
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
  { id: 'permit', label: 'Permit', icon: Certificate },
  { id: 'owner', label: 'Applicant', icon: Enterprise },
  { id: 'agent', label: 'Agent', icon: undefined },
  { id: 'shipping', label: 'Shipping', icon: EarthFilled },
  { id: 'items', label: 'Items', icon: Box },
  { id: 'documents', label: 'Documents', icon: DocumentAttachment },
  { id: 'fees', label: 'Fees', icon: Currency },
  { id: 'gbms', label: 'GBMS', icon: undefined },
  // INTENTIONAL_LEGACY_DIVERGENCE(PERMIT_INVOICE_VISIBILITY):
  // Modern permit detail exposes the invoice workflow that legacy keeps hidden.
  { id: 'invoices', label: 'Invoices', icon: undefined },
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

// INTENTIONAL_LEGACY_DIVERGENCE(BOIC_PACKAGE_STATUS_DEFAULTS): hidden fields default only on create; edits preserve saved values.
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

const parseBlanketOicSpeciesCodes = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
    ),
  )

const validateBlanketOicPackage = (form: BlanketOicPackageForm): BlanketOicPackageFieldErrors => {
  const speciesCodes = parseBlanketOicSpeciesCodes(form.speciesCodes)

  return {
    packageNumber: requiredFieldError(form.packageNumber, 'Package number') ?? undefined,
    volume: firstValidationError(
      () => requiredNumericFieldError(form.volume, 'Package volume'),
      () => greaterThanOrEqualFieldError(form.volume, 'Package volume', 0),
      () => atMostOneDecimalFieldError(form.volume, 'Package volume'),
    ),
    averageLength: firstValidationError(
      () => requiredNumericFieldError(form.averageLength, 'Average length'),
      () => greaterThanFieldError(form.averageLength, 'Average length', 0),
      () => lessThanOrEqualFieldError(form.averageLength, 'Average length', 99),
    ),
    averageDiameter: firstValidationError(
      () => requiredNumericFieldError(form.averageDiameter, 'Average top diameter'),
      () => greaterThanFieldError(form.averageDiameter, 'Average top diameter', 0),
      () => lessThanOrEqualFieldError(form.averageDiameter, 'Average top diameter', 99.99),
    ),
    ageClass: requiredFieldError(form.ageClass, 'Age class') ?? undefined,
    productType: requiredFieldError(form.productType, 'Product type') ?? undefined,
    endUseCode: requiredFieldError(form.endUseCode, 'End use') ?? undefined,
    speciesCodes: speciesCodes.length > 0 ? undefined : 'Species is required.',
    comments: firstValidationError(
      () =>
        ASCII_PATTERN.test(form.comments)
          ? null
          : 'Package comments contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      () =>
        form.comments.length <= PACKAGE_COMMENTS_MAX_LENGTH
          ? null
          : `Package comments must be ${PACKAGE_COMMENTS_MAX_LENGTH} characters or fewer.`,
    ),
  }
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
  errorMessage: string
  headerAction?: ReactNode
  reviewedLayout?: boolean
}

type PermitClientKind = 'owner' | 'agent'

const permitClientFields = (kind: PermitClientKind) =>
  kind === 'owner'
    ? {
        clientNumber: 'ownerClientNumber' as const,
        location: 'ownerClientLocation' as const,
      }
    : {
        clientNumber: 'agentClientNumber' as const,
        location: 'agentClientLocation' as const,
      }

const PermitClientTile = ({
  title,
  clientNumber,
  locationCode,
  clientData,
  isLoading,
  errorMessage,
  headerAction,
  reviewedLayout = false,
}: PermitClientTileProps) => (
  <>
    {reviewedLayout ? (
      <Tile className="detail-section-card permit-client-tile">
        <div className="detail-section-card__header">
          <h2 className="detail-tile-title">
            <Enterprise size={24} aria-hidden="true" />
            {title}
          </h2>
          {headerAction}
        </div>
        <dl className="detail-field-grid permit-client-tile__identity">
          <div className="detail-field-item">
            <dt className="detail-field-label">Client</dt>
            <dd className="detail-field-value">
              {isLoading
                ? 'Loading…'
                : displayValue([clientData?.companyName, clientNumber].filter(Boolean).join(' · '))}
            </dd>
          </div>
          <div className="detail-field-item">
            <dt className="detail-field-label">Location</dt>
            <dd className="detail-field-value">{displayValue(locationCode)}</dd>
          </div>
        </dl>
        <dl className="detail-field-grid permit-client-tile__address-fields">
          {[
            ['Address', clientData?.address],
            ['City', clientData?.city],
            ['Province', clientData?.province],
            ['Country', clientData?.country],
            ['Postal code', clientData?.postalCode],
          ].map(([label, value]) => (
            <div key={label} className="detail-field-item">
              <dt className="detail-field-label">{label}</dt>
              <dd className="detail-field-value">{isLoading ? 'Loading…' : displayValue(value)}</dd>
            </div>
          ))}
        </dl>
        <dl className="detail-field-grid permit-client-tile__contact-fields">
          {[
            ['Phone number', clientData?.phone],
            ['Fax number', clientData?.fax],
            ['Email address', clientData?.email],
          ].map(([label, value]) => (
            <div key={label} className="detail-field-item">
              <dt className="detail-field-label">{label}</dt>
              <dd className="detail-field-value">{isLoading ? 'Loading…' : displayValue(value)}</dd>
            </div>
          ))}
        </dl>
      </Tile>
    ) : (
      <DetailFieldTile
        title={title}
        headerAction={headerAction}
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
    )}
    {errorMessage ? (
      <InlineNotification
        className="detail-context-notification"
        kind="warning"
        lowContrast
        hideCloseButton
        title="Client details unavailable"
        subtitle={errorMessage}
      />
    ) : null}
  </>
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

const validatePermitFeeOverride = (
  form: PermitFeeOverrideForm,
): { fieldErrors: PermitFeeOverrideFieldErrors; roundedFee: string | null } => {
  const normalizedFee = form.overrideFee.trim()
  const normalizedComment = form.overrideComment.trim()
  const roundedFee = form.overrideEnabled ? formatRoundedNumericFieldValue(normalizedFee, 2) : null
  const roundedFeeError = (): string | null => {
    if (!form.overrideEnabled || roundedFee === null) return null

    const storedFeeValue = Number(roundedFee)
    if (storedFeeValue <= 0) return 'Override fee must round to at least 0.01.'
    return storedFeeValue <= MAX_PERMIT_OVERRIDE_FEE
      ? null
      : `Override fee must round to ${MAX_PERMIT_OVERRIDE_FEE} or less.`
  }
  const overrideFeeError = firstValidationError(
    () => (form.overrideEnabled ? requiredFieldError(normalizedFee, 'Override fee') : null),
    () => (form.overrideEnabled ? numericFieldError(normalizedFee, 'Override fee') : null),
    () => (form.overrideEnabled ? positiveNumericFieldError(normalizedFee) : null),
    roundedFeeError,
  )
  const overrideCommentError = firstValidationError(
    () =>
      form.overrideEnabled && !ASCII_PATTERN.test(normalizedComment)
        ? 'Override comment contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.'
        : null,
    () =>
      form.overrideEnabled
        ? maxLengthFieldError(
            normalizedComment,
            MAX_PERMIT_OVERRIDE_COMMENT_LENGTH,
            'Override comment',
          )
        : null,
  )

  return {
    fieldErrors: {
      ...(overrideFeeError ? { overrideFee: overrideFeeError } : {}),
      ...(overrideCommentError ? { overrideComment: overrideCommentError } : {}),
    },
    roundedFee,
  }
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

const isMinisterialPermit = (permitDetail: ProvincialPermitDetail | null): boolean =>
  permitDetail?.exemptionTypeDescription?.trim().toUpperCase().startsWith('MINISTERIAL') ?? false

const isNewlyCreatedPermitNavigation = (state: unknown): state is Record<string, unknown> => {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return false
  }
  return (state as Record<string, unknown>).permitCreated === true
}

const withoutNewlyCreatedPermitNavigation = (state: Record<string, unknown>) => {
  const remainingState = { ...state }
  delete remainingState.permitCreated
  return remainingState
}

const isNewlyCreatedBlanketOicPermitNavigation = (
  state: unknown,
): state is Record<string, unknown> & { blanketOicPermitCreated: string } =>
  typeof state === 'object' &&
  state !== null &&
  !Array.isArray(state) &&
  typeof (state as Record<string, unknown>).blanketOicPermitCreated === 'string'

const withUpdatedPermitDetail = (
  currentDetail: ProvincialPermitDetail,
  form: PermitDetailForm,
  statusOptions: SearchOption[],
  regionOptions: SearchOption[],
): ProvincialPermitDetail => {
  const permitHasEditableClientLocations =
    currentDetail.blanketOic || isMinisterialPermit(currentDetail)
  const permitStatusCode = form.permitStatus.trim()
  const selectedStatusLabel = statusOptions.find(
    (option) => option.value.toUpperCase() === permitStatusCode.toUpperCase(),
  )?.label
  const orgUnitNumber = optionalIntegerValue(form.orgUnitNumber)
  const regionChanged = orgUnitNumber !== currentDetail.orgUnitNumber
  const selectedRegionLabel = regionOptions.find(
    (option) => option.value === form.orgUnitNumber.trim(),
  )?.label
  const allowActiveDraftDateClear =
    detailValue(currentDetail.permitStatusCode).trim().toUpperCase() === 'ACT' &&
    permitStatusCode.toUpperCase() === 'ACT'
  const updatedSubmitDate = form.permitSubmitDate.trim() || currentDetail.applicationDate
  const updatedPermitDate = (submittedValue: string, currentValue: string | null): string | null =>
    submittedValue.trim() || (allowActiveDraftDateClear ? null : currentValue)

  return {
    ...currentDetail,
    permitNumber: optionalIntegerValue(form.permitNumber),
    permitStatusCode: permitStatusCode || null,
    permitStatusDescription:
      permitStatusCode === detailValue(currentDetail.permitStatusCode)
        ? currentDetail.permitStatusDescription
        : selectedStatusLabel || permitStatusCode || null,
    applicationDate: updatedSubmitDate,
    exemptionNumber: form.exemptionNumber.trim() || null,
    issueDate: updatedPermitDate(form.permitIssueDate, currentDetail.issueDate),
    expiryDate: updatedPermitDate(form.permitExpiryDate, currentDetail.expiryDate),
    receivedDate: currentDetail.blanketOic ? currentDetail.receivedDate : updatedSubmitDate,
    permitVolume: optionalNumberValue(form.permitTotalVolume),
    numberOfPieces: optionalIntegerValue(form.permitNumberOfPieces),
    oicRequestPieces: optionalIntegerValue(form.oicPermitTotalPieces),
    oicRequestVolume: optionalNumberValue(form.oicPermitTotalVolume),
    receiptNumber: form.permitReceiptNo.trim() || null,
    remarks: form.permitRemarks.trim() || null,
    orgUnitNumber,
    region: regionChanged ? selectedRegionLabel || currentDetail.region : currentDetail.region,
    ownerClientNumber: currentDetail.blanketOic
      ? form.ownerClientNumber.trim() || null
      : currentDetail.ownerClientNumber,
    ownerClientLocationCode: currentDetail.blanketOic
      ? form.ownerClientLocation.trim() || null
      : permitHasEditableClientLocations
        ? form.ownerClientLocation.trim() || null
        : currentDetail.ownerClientLocationCode,
    applicantClientNumber: currentDetail.blanketOic
      ? form.agentClientNumber.trim() || null
      : currentDetail.applicantClientNumber,
    agentClientLocationCode: currentDetail.blanketOic
      ? form.agentClientLocation.trim() || null
      : permitHasEditableClientLocations
        ? form.agentClientLocation.trim() || null
        : currentDetail.agentClientLocationCode,
  }
}

const withPersistedPermitClientValues = (
  currentDetail: ProvincialPermitDetail,
  persistedDetail: ProvincialPermitDetail,
): ProvincialPermitDetail => ({
  ...currentDetail,
  ownerClientNumber: persistedDetail.ownerClientNumber,
  ownerClientLocationCode: persistedDetail.ownerClientLocationCode,
  applicantClientNumber: persistedDetail.applicantClientNumber,
  agentClientLocationCode: persistedDetail.agentClientLocationCode,
})

const withoutPermitClientValues = (
  currentDetail: ProvincialPermitDetail,
): ProvincialPermitDetail => ({
  ...currentDetail,
  ownerClientNumber: null,
  ownerClientLocationCode: null,
  applicantClientNumber: null,
  agentClientLocationCode: null,
})

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
  const navigate = useNavigate()
  const { permitNumber } = useParams()
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
  const [ownerEditClientData, setOwnerEditClientData] = useState<ApplicationClientData | null>(null)
  const [agentEditClientData, setAgentEditClientData] = useState<ApplicationClientData | null>(null)
  const [ownerClientLocations, setOwnerClientLocations] = useState<ApplicationClientLocation[]>([])
  const [agentClientLocations, setAgentClientLocations] = useState<ApplicationClientLocation[]>([])
  const [isOwnerClientLookupLoading, setIsOwnerClientLookupLoading] = useState(false)
  const [isAgentClientLookupLoading, setIsAgentClientLookupLoading] = useState(false)
  const [ownerClientLookupError, setOwnerClientLookupError] = useState('')
  const [agentClientLookupError, setAgentClientLookupError] = useState('')
  const [agentUsed, setAgentUsed] = useState(false)
  const [isClientDataLoading, setIsClientDataLoading] = useState(false)
  const [clientDataErrorMessage, setClientDataErrorMessage] = useState('')
  const [clientDataRequested, setClientDataRequested] = useState(false)
  const [documentRows, setDocumentRows] = useState<PermitDocumentRow[]>([])
  const [invoiceRows, setInvoiceRows] = useState<PermitInvoiceRow[]>([])
  const [permitForm, setPermitForm] = useState<PermitDetailForm | null>(null)
  const [feeOverrideContext, setFeeOverrideContext] = useState<PermitFeeOverrideContext | null>(
    null,
  )
  const [editContextLoaded, setEditContextLoaded] = useState(false)
  const [editContextLoadFailed, setEditContextLoadFailed] = useState(false)
  const [permitDetailRefreshRequired, setPermitDetailRefreshRequired] = useState(false)
  const [feeOverrideForm, setFeeOverrideForm] = useState<PermitFeeOverrideForm | null>(null)
  const [feeOverrideFieldErrors, setFeeOverrideFieldErrors] =
    useState<PermitFeeOverrideFieldErrors>({})
  const [isEditingPermit, setIsEditingPermit] = useState(false)
  const [isEditingPermitClients, setIsEditingPermitClients] = useState(false)
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
  const [actionFeedback, setActionFeedback] = useState<{
    kind: 'success' | 'warning'
    message: string
  } | null>(null)
  const [actionSuccessNotification, setActionSuccessNotification] =
    useState<ActionSuccessNotification | null>(null)
  const [createdBlanketOicPermitNumber, setCreatedBlanketOicPermitNumber] = useState('')
  const [documentSuccessMessage, setDocumentSuccessMessage] = useState('')
  const clearActionNotifications = useCallback(() => {
    setActionErrorMessage('')
    setActionFeedback(null)
    setActionSuccessNotification(null)
    setDocumentSuccessMessage('')
  }, [])
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [documentPendingDeletion, setDocumentPendingDeletion] = useState<PermitDocumentRow | null>(
    null,
  )
  // INTENTIONAL_LEGACY_DIVERGENCE(MINISTERIAL_SCALE_SELECTION_EDIT): selection stays local until Save changes.
  const [ministerialScaleSelectionDraft, setMinisterialScaleSelectionDraft] = useState<Record<
    string,
    boolean
  > | null>(null)
  const [isSavingScaleSelection, setIsSavingScaleSelection] = useState(false)
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
  const [boicPackageFieldErrors, setBoicPackageFieldErrors] =
    useState<BlanketOicPackageFieldErrors>({})
  const [boicPackageErrorMessage, setBoicPackageErrorMessage] = useState('')
  const [editingBoicPackageNumber, setEditingBoicPackageNumber] = useState<string | null>(null)
  const [isCreatingBoicPackage, setIsCreatingBoicPackage] = useState(false)
  const [boicCodeOptionsReady, setBoicCodeOptionsReady] = useState(false)
  const [boicScaleCodeOptionsReady, setBoicScaleCodeOptionsReady] = useState(false)
  const [isLoadingBoicPackage, setIsLoadingBoicPackage] = useState(false)
  const [isSavingBoicPackage, setIsSavingBoicPackage] = useState(false)
  const [isDeletingBoicPackageNumber, setIsDeletingBoicPackageNumber] = useState<string | null>(
    null,
  )
  const [boicPackageNumberPendingDeletion, setBoicPackageNumberPendingDeletion] = useState<
    string | null
  >(null)
  const [availablePermitApplications, setAvailablePermitApplications] = useState<string[]>([])
  const [availablePermitApplicationItems, setAvailablePermitApplicationItems] = useState<
    PermitAvailableApplicationItem[] | null
  >(null)
  const [permitApplicationToAdd, setPermitApplicationToAdd] = useState('')
  const [ministerialPermitApplicationsToAdd, setMinisterialPermitApplicationsToAdd] = useState<
    string[]
  >([])
  const [hasLoadedAvailablePermitApplications, setHasLoadedAvailablePermitApplications] =
    useState(false)
  const [isLoadingAvailableApplications, setIsLoadingAvailableApplications] = useState(false)
  const [availablePermitApplicationsError, setAvailablePermitApplicationsError] = useState('')
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
  const [selectedBlanketOicPackageNumberState, setSelectedBlanketOicPackageNumberState] =
    useState('')
  const [selectedMinisterialPackageNumberState, setSelectedMinisterialPackageNumberState] =
    useState('')
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
  const [blanketOicRegionLookup, setBlanketOicRegionLookup] = useState<{
    key: string
    regionNumbers: string[]
    errorMessage: string
  } | null>(null)
  const blanketOicRegionLookupKey =
    detail?.blanketOic && detail.exemptionNumber
      ? JSON.stringify([permitNumber, detail.exemptionNumber])
      : null
  const [isPermitOptionsLoading, setIsPermitOptionsLoading] = useState(true)
  const [permitOptionsUnavailable, setPermitOptionsUnavailable] = useState(false)
  const [permitOptionsErrorMessage, setPermitOptionsErrorMessage] = useState('')
  const beginDetailRequest = useLatestRequestGuard()
  const beginDocumentRefreshRequest = useLatestRequestGuard()
  const beginDocumentOpenRequest = useLatestRequestGuard()
  const isCurrentDocumentRouteRef = useRef<() => boolean>(() => false)
  const pendingDocumentPreviewsRef = useRef(new Set<Window>())
  const beginPermitFeesRequest = useLatestRequestGuard()
  const beginPermitDocumentsRequest = useLatestRequestGuard()
  const beginPermitInvoicesRequest = useLatestRequestGuard()
  const beginPermitGbmsRequest = useLatestRequestGuard()
  const beginPermitMutationRequest = useLatestRequestGuard()
  const beginBoicPackageEditRequest = useLatestRequestGuard()
  const beginAvailablePermitApplicationsRequest = useLatestRequestGuard()
  const ownerClientLookupRequestRef = useRef(0)
  const agentClientLookupRequestRef = useRef(0)
  const newlyCreatedPermitRouteRef = useRef<string | null>(null)
  const deferredPermitTabLoadsRef = useRef(new Set<DeferredPermitTabId>())
  const loadedDeferredPermitTabsRef = useRef(new Set<DeferredPermitTabId>())
  const permitMutationInFlightRef = useRef(false)
  const packagePanelLauncherRef = useRef<HTMLButtonElement | null>(null)
  const permitDocumentUploadLauncherRef = useRef<HTMLButtonElement | null>(null)
  const tryBeginPermitMutation = useCallback(() => {
    if (permitMutationInFlightRef.current) return null
    permitMutationInFlightRef.current = true
    return beginPermitMutationRequest()
  }, [beginPermitMutationRequest])
  const endPermitMutation = useCallback(() => {
    permitMutationInFlightRef.current = false
  }, [])

  useEffect(() => {
    const pendingPreviews = pendingDocumentPreviewsRef.current
    return () => {
      pendingPreviews.forEach((previewTarget) => previewTarget.close())
      pendingPreviews.clear()
    }
  }, [permitNumber])

  const resetPermitRouteDrafts = useCallback(() => {
    isCurrentDocumentRouteRef.current = beginDocumentOpenRequest()
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
    setIsCreatingBoicPackage(false)
    setBoicCodeOptionsReady(false)
    setBoicScaleCodeOptionsReady(false)
    setSelectedBlanketOicPackageNumberState('')
    setSelectedMinisterialPackageNumberState('')
    setMinisterialScaleSelectionDraft(null)
    setIsSavingScaleSelection(false)
    setActionSuccessNotification(null)
    setDocumentSuccessMessage('')
    setCreatedBlanketOicPermitNumber('')
    void beginAvailablePermitApplicationsRequest()
    setBoicPackageForm(EMPTY_BLANKET_OIC_PACKAGE_FORM)
    setBoicPackageBaselineForm(EMPTY_BLANKET_OIC_PACKAGE_FORM)
    setBoicPackageFieldErrors({})
    setBoicPackageErrorMessage('')
    setEditingBoicPackageNumber(null)
    setIsLoadingBoicPackage(false)
    setIsSavingBoicPackage(false)
    setIsDeletingBoicPackageNumber(null)
    setBoicPackageNumberPendingDeletion(null)
    setBoicScaleForm(EMPTY_BLANKET_OIC_SCALE_FORM)
    setBoicScaleBaselineForm(EMPTY_BLANKET_OIC_SCALE_FORM)
    setIsSavingBoicScale(false)
    setIsDeletingBoicScaleId(null)
    setFeeOverrideFieldErrors({})
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
    setClientDataErrorMessage('')
    ownerClientLookupRequestRef.current += 1
    agentClientLookupRequestRef.current += 1
    setOwnerEditClientData(null)
    setAgentEditClientData(null)
    setOwnerClientLocations([])
    setAgentClientLocations([])
    setIsOwnerClientLookupLoading(false)
    setIsAgentClientLookupLoading(false)
    setOwnerClientLookupError('')
    setAgentClientLookupError('')
    setIsEditingPermitClients(false)
    setAgentUsed(false)
    setPermitDetailRefreshRequired(false)
    setAvailablePermitApplications([])
    setAvailablePermitApplicationItems(null)
    setPermitApplicationToAdd('')
    setMinisterialPermitApplicationsToAdd([])
    setHasLoadedAvailablePermitApplications(false)
    setIsLoadingAvailableApplications(false)
    setAvailablePermitApplicationsError('')
    setBlanketOicRegionLookup(null)
    setPermitApprovalEmailOpen(false)
    setPermitApprovalEmailAddress('')
  }, [
    beginAvailablePermitApplicationsRequest,
    beginBoicPackageEditRequest,
    beginDocumentOpenRequest,
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
    if (!blanketOicRegionLookupKey || !detail?.exemptionNumber) {
      return undefined
    }

    let active = true
    void fetchExemptionRegionContext(detail.exemptionNumber)
      .then((context) => {
        if (!active) return
        setBlanketOicRegionLookup({
          key: blanketOicRegionLookupKey,
          regionNumbers: context.regionNumbers,
          errorMessage: '',
        })
      })
      .catch((error: unknown) => {
        if (!active) return
        console.error(error)
        setBlanketOicRegionLookup({
          key: blanketOicRegionLookupKey,
          regionNumbers: [],
          errorMessage:
            'The exemption region settings could not be loaded. Reload before changing this permit region.',
        })
      })

    return () => {
      active = false
    }
  }, [blanketOicRegionLookupKey, detail?.exemptionNumber])

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
        setFeeOverrideFieldErrors({})
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
      setFeeOverrideFieldErrors({})
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
        setAgentUsed(Boolean(response?.applicantClientNumber?.trim()))
        setIsEditingPermit(false)
        setIsEditingShipping(false)

        if (!response) {
          setErrorMessage(`No provincial permit found for ${permitNumber}.`)
          setPermitForm(null)
          setFeeOverrideContext(null)
          setFeeOverrideForm(null)
          setFeeOverrideFieldErrors({})
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
            setFeeOverrideFieldErrors({})
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
            setFeeOverrideFieldErrors({})
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
          setFeeOverrideFieldErrors({})
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

  const hasPermitAgent = agentUsed
  const ministerialPermit = isMinisterialPermit(detail)
  const blanketOicPermit = detail?.blanketOic === true
  const blanketOicRegionBoundToApplication =
    blanketOicPermit && detail?.oicApplicationNumber != null
  const usesReviewedPermitFlow = blanketOicPermit || ministerialPermit
  const hasGbmsHistory = (tabsData?.gbmsEvents.length ?? 0) > 0 || Boolean(gbmsErrorMessage)
  // Legacy retains the invoice upload workflow but hides Invoices from permit navigation.
  const permitDetailTabs = PERMIT_DETAIL_TABS.filter(
    ({ id }) =>
      id !== 'invoices' &&
      (id !== 'agent' || (hasPermitAgent && !usesReviewedPermitFlow)) &&
      (id !== 'gbms' || hasGbmsHistory),
  ).map((tab) => ({
    ...tab,
    label:
      usesReviewedPermitFlow && tab.id === 'owner'
        ? 'Applicant'
        : usesReviewedPermitFlow && tab.id === 'items'
          ? 'Scale'
          : tab.label,
  }))
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
      setClientDataErrorMessage('')

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
          setClientDataErrorMessage('')
        }
      } catch (error) {
        if (!isCancelled) {
          console.warn('Unable to load permit client data.', error)
          setClientDataErrorMessage(
            'Client details could not be retrieved. The saved permit values are still shown.',
          )
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
          const feesResult = await fetchProvincialPermitFees({
            permitNumber: resolvedPermitNumber,
            blanketOic: detail?.blanketOic,
            packageNumbers:
              options.packageNumbers ?? tabsData?.packages.map((row) => row.packageNumber),
          })
          if (!isLatestRequest()) return
          setTabsData((current) => (current ? { ...current, ...feesResult } : current))
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

  const refreshLoadedPermitFees = useCallback(() => {
    if (
      !loadedDeferredPermitTabsRef.current.has('fees') &&
      !deferredPermitTabLoadsRef.current.has('fees') &&
      activePermitTabId !== 'fees'
    ) {
      return
    }

    loadedDeferredPermitTabsRef.current.delete('fees')
    deferredPermitTabLoadsRef.current.delete('fees')
    setDeferredPermitTabLoaded((current) => ({ ...current, fees: false }))
    setPermitFeesErrorMessage('')
    void loadDeferredPermitTab('fees', { force: true })
  }, [activePermitTabId, loadDeferredPermitTab])

  useEffect(() => {
    if (
      activePermitTabId === 'fees' ||
      activePermitTabId === 'documents' ||
      activePermitTabId === 'invoices'
    ) {
      void loadDeferredPermitTab(activePermitTabId)
    }
  }, [activePermitTabId, loadDeferredPermitTab])

  const blanketOicPackageOptions = useMemo(
    () =>
      (tabsData?.packages ?? [])
        .map((row) => row.packageNumber)
        .filter(Boolean)
        .map((packageNumber) => ({
          value: packageNumber,
          label: formatPackageNumberLabel(packageNumber),
        })),
    [tabsData],
  )
  const selectedBlanketOicPackageNumber = blanketOicPackageOptions.some(
    (option) => option.value === selectedBlanketOicPackageNumberState,
  )
    ? selectedBlanketOicPackageNumberState
    : (blanketOicPackageOptions[0]?.value ?? '')

  const ministerialPackageOptions = useMemo(
    () =>
      ministerialPermit
        ? (tabsData?.packages ?? [])
            .map((row) => row.packageNumber)
            .filter(Boolean)
            .map((packageNumber) => ({
              value: packageNumber,
              label: formatPackageNumberLabel(packageNumber),
            }))
        : [],
    [ministerialPermit, tabsData],
  )
  const selectedMinisterialPackageNumber = ministerialPackageOptions.some(
    (option) => option.value === selectedMinisterialPackageNumberState,
  )
    ? selectedMinisterialPackageNumberState
    : (ministerialPackageOptions[0]?.value ?? '')
  const selectedMinisterialPackage = (tabsData?.packages ?? []).find(
    (row) => row.packageNumber === selectedMinisterialPackageNumber,
  )
  const selectedMinisterialPackageFeeSummary = (tabsData?.packageFeeSummaries ?? []).find(
    (summary) => summary.packageNumber === selectedMinisterialPackageNumber,
  )
  const selectedBlanketOicPackage = (tabsData?.packages ?? []).find(
    (row) => row.packageNumber === selectedBlanketOicPackageNumber,
  )
  const selectedBlanketOicPackageFeeSummary = (tabsData?.packageFeeSummaries ?? []).find(
    (summary) => summary.packageNumber === selectedBlanketOicPackageNumber,
  )
  const selectedBlanketOicPackageHasScaleRows = (tabsData?.items ?? []).some(
    (item) => item.packageNumber === selectedBlanketOicPackageNumber,
  )

  const packageScopedItems = useMemo(() => {
    if (!tabsData) {
      return []
    }
    const selectedPackageNumber = detail?.blanketOic
      ? selectedBlanketOicPackageNumber
      : ministerialPermit
        ? selectedMinisterialPackageNumber
        : ''
    return selectedPackageNumber
      ? tabsData.items.filter((row) => row.packageNumber === selectedPackageNumber)
      : tabsData.items
  }, [
    detail?.blanketOic,
    ministerialPermit,
    selectedBlanketOicPackageNumber,
    selectedMinisterialPackageNumber,
    tabsData,
  ])

  const visiblePackages = useMemo(
    () =>
      detail?.blanketOic
        ? (tabsData?.packages ?? []).filter(
            (row) => row.packageNumber === selectedBlanketOicPackageNumber,
          )
        : ministerialPermit
          ? (tabsData?.packages ?? []).filter(
              (row) => row.packageNumber === selectedMinisterialPackageNumber,
            )
          : (tabsData?.packages ?? []),
    [
      detail?.blanketOic,
      ministerialPermit,
      selectedBlanketOicPackageNumber,
      selectedMinisterialPackageNumber,
      tabsData,
    ],
  )

  const resolvedBlanketOicScaleForm = {
    ...boicScaleForm,
    packageNumber: selectedBlanketOicPackageNumber,
  }
  const resolvedBlanketOicScaleBaselineForm = {
    ...boicScaleBaselineForm,
    packageNumber: selectedBlanketOicPackageNumber,
  }
  const availablePermitApplicationOptions = useMemo(
    () =>
      availablePermitApplications.map((applicationNumber) => ({
        value: applicationNumber,
        label: applicationNumber,
      })),
    [availablePermitApplications],
  )
  const ministerialAvailablePermitApplicationItems =
    availablePermitApplicationItems ??
    availablePermitApplications.map((applicationNumber) => ({
      applicationNumber,
      disabled: false,
      disabledReason: '',
      unassignedPieces: null,
      unassignedVolume: null,
    }))
  const selectedPermitApplicationToAdd =
    permitApplicationToAdd ||
    (ministerialPermit ? '' : (availablePermitApplicationOptions[0]?.value ?? ''))
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
      ? associatedPermitPackageNumbers.map(formatPackageNumberLabel).join(', ')
      : detail?.packageNumber
        ? formatPackageNumberLabel(detail.packageNumber)
        : detail?.packageNumber

  const permitFeeRows = tabsData?.fees ?? []
  const showMinistryFeeColumn = permitFeeRows.some((row) => row.ministryUser)
  const selectedPermitScaleTotalsByPackage = useMemo(() => {
    const totals = new Map<string, { pieces: number; volume: number }>()
    for (const row of tabsData?.items ?? []) {
      if (!row.includedInPermit || !row.packageNumber) continue
      const current = totals.get(row.packageNumber) ?? { pieces: 0, volume: 0 }
      totals.set(row.packageNumber, {
        pieces: current.pieces + row.pieces,
        volume: current.volume + row.volume,
      })
    }
    return totals
  }, [tabsData?.items])
  const ministerialScaleEmpty =
    ministerialPermit &&
    !isPermitTablesLoading &&
    !permitTablesErrorMessage &&
    (tabsData?.packages.length ?? 0) === 0 &&
    packageScopedItems.length === 0

  const gbmsHistory = tabsData?.gbmsEvents ?? []

  const selectedPermitTabIndex = permitDetailTabs.findIndex(({ id }) => id === activePermitTabId)

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
    hasPermitMutationPermission && (editContextLoadFailed || permitDetailRefreshRequired)
      ? permitDetailRefreshRequired
        ? 'The permit was saved, but its current details could not be refreshed. Reload before making another change.'
        : 'Permit edit settings could not be loaded. Editing is unavailable until the data can be retrieved.'
      : ''
  const permitStatusCode = detail?.permitStatusCode?.trim().toUpperCase()
  const invoiceMaterialLocked = permitStatusCode === 'COM' || permitStatusCode === 'PPD'
  const currentBlanketOicRegionLookup =
    blanketOicRegionLookup?.key === blanketOicRegionLookupKey ? blanketOicRegionLookup : null
  const blanketOicExemptionRegionNumbers = currentBlanketOicRegionLookup?.regionNumbers ?? null
  const blanketOicRegionContextError = currentBlanketOicRegionLookup?.errorMessage ?? ''
  const blanketOicRegionContext = useMemo(() => {
    if (!blanketOicPermit || blanketOicExemptionRegionNumbers === null) {
      return null
    }
    return resolveBlanketOicRegionContext(
      permitRegionOptions.map((option) => ({ id: option.value, text: option.label })),
      blanketOicExemptionRegionNumbers,
    )
  }, [blanketOicExemptionRegionNumbers, blanketOicPermit, permitRegionOptions])
  const blanketOicRegionOptionsLoading =
    blanketOicPermit && blanketOicExemptionRegionNumbers === null
  const blanketOicRegionError =
    blanketOicRegionContextError || blanketOicRegionContext?.errorMessage || ''
  const blanketOicRegionSelectionUnavailable =
    blanketOicRegionOptionsLoading || !!blanketOicRegionError
  const requiredPermitOptionsMissing =
    !isPermitOptionsLoading &&
    !permitOptionsUnavailable &&
    (permitStatusOptions.length === 0 ||
      (blanketOicPermit &&
        !blanketOicRegionOptionsLoading &&
        (permitRegionOptions.length === 0 || !!blanketOicRegionError)))
  const editablePermitStatusOptions = useMemo(() => {
    const currentStatusCode = permitStatusCode ?? ''
    const options = permitStatusOptions
      .filter((option) => {
        const statusCode = option.value.trim().toUpperCase()
        return (
          EDITABLE_PERMIT_STATUS_CODES.has(statusCode) ||
          (statusCode === SERVER_ASSIGNED_PAYMENT_PENDING_STATUS &&
            currentStatusCode === SERVER_ASSIGNED_PAYMENT_PENDING_STATUS)
        )
      })
      .map((option) => ({
        ...option,
        label: formatPermitStatus(option.value, option.label),
      }))
    if (
      currentStatusCode &&
      currentStatusCode !== 'EXP' &&
      !options.some((option) => option.value.trim().toUpperCase() === currentStatusCode)
    ) {
      options.push({
        value: currentStatusCode,
        label: formatPermitStatus(currentStatusCode, detail?.permitStatusDescription),
      })
    }
    return options
  }, [detail?.permitStatusDescription, permitStatusCode, permitStatusOptions])
  const editablePermitRegionOptions = useMemo(() => {
    const currentOrgUnitNumber = detailValue(detail?.orgUnitNumber).trim()
    if (blanketOicPermit) {
      if (!blanketOicRegionContext || blanketOicRegionError) {
        return []
      }
      const options = blanketOicRegionContext.options.map((option) => ({
        value: option.id,
        label: option.text,
      }))
      if (blanketOicRegionBoundToApplication) {
        return currentOrgUnitNumber
          ? [
              {
                value: currentOrgUnitNumber,
                label:
                  permitRegionOptions.find((option) => option.value === currentOrgUnitNumber)
                    ?.label ||
                  detail?.region?.trim() ||
                  currentOrgUnitNumber,
              },
            ]
          : []
      }
      if (
        !invoiceMaterialLocked ||
        !currentOrgUnitNumber ||
        options.some((option) => option.value === currentOrgUnitNumber)
      ) {
        return options
      }
      return [
        ...options,
        {
          value: currentOrgUnitNumber,
          label: detail?.region?.trim() || currentOrgUnitNumber,
        },
      ]
    }
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
  }, [
    blanketOicPermit,
    blanketOicRegionBoundToApplication,
    blanketOicRegionContext,
    blanketOicRegionError,
    detail?.orgUnitNumber,
    detail?.region,
    invoiceMaterialLocked,
    permitRegionOptions,
  ])
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
  const canMutatePermit =
    permitExemptionContextReady &&
    canPerform('savePermit') &&
    editContextLoaded &&
    !permitEditLocked &&
    !permitExpired
  const canSavePermit =
    canMutatePermit &&
    !(permitStatusCode === 'COM' && hasProvincialSubmitterRole(capabilities.roles))
  const canReviewPermits = canPerform('/permitsReview')
  const canCorrectPermitSubmitDate = canSavePermit && canReviewPermits && permitStatusCode === 'ACT'
  const canEditShipping = canMutatePermit && permitStatusCode !== 'CAN'
  const canEditPermitClients =
    canSavePermit && !invoiceMaterialLocked && (detail?.blanketOic === true || ministerialPermit)
  const ownerEditMode = isEditingPermit && canEditPermitClients && isEditingPermitClients
  const hasVerifiedOwnerClientLocation = ownerClientLocations.some(
    (clientLocation) =>
      isSelectableClientLocation(clientLocation) &&
      clientLocation.locationCode === permitForm?.ownerClientLocation.trim(),
  )
  const hasVerifiedAgentClientLocation = agentClientLocations.some(
    (clientLocation) =>
      isSelectableClientLocation(clientLocation) &&
      clientLocation.locationCode === permitForm?.agentClientLocation.trim(),
  )
  const permitClientLookupCanSave =
    !isEditingPermitClients ||
    (!!permitForm?.ownerClientNumber.trim() &&
      hasVerifiedOwnerClientLocation &&
      !isOwnerClientLookupLoading &&
      !ownerClientLookupError &&
      (!agentUsed ||
        (usesReviewedPermitFlow && !permitForm.agentClientNumber.trim()) ||
        (!!permitForm.agentClientNumber.trim() &&
          hasVerifiedAgentClientLocation &&
          !isAgentClientLookupLoading &&
          !agentClientLookupError)))
  const canEnterPaymentReceipt =
    canReviewPermits && permitStatusCode === 'PPD' && !detail?.receiptNumber?.trim()
  const canSendPermitApproval =
    canSavePermit && canReviewPermits && (permitStatusCode === 'COM' || permitStatusCode === 'PPD')
  const canRequestPermitReview =
    hasProvincialSubmitterRole(capabilities.roles) &&
    permitExemptionContextReady &&
    editContextLoaded &&
    !permitEditLocked &&
    !permitExpired
  const readOnlyUser = isPureReadOnlyRole(capabilities.roles)
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
    ministerialScaleSelectionDraft === null &&
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
    canSavePermit &&
    !!detail?.blanketOic &&
    !scaleAttachmentLockedStatuses.has(permitStatusCode ?? '')
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
  const permitAgentToggleDirty =
    isEditingPermit &&
    !usesReviewedPermitFlow &&
    !!permitBaselineForm &&
    agentUsed !== Boolean(permitBaselineForm.agentClientNumber.trim())
  const permitDetailDirty =
    isEditingPermit &&
    !!permitForm &&
    !!permitBaselineForm &&
    (permitFormSectionChanged(permitForm, permitBaselineForm, false) || permitAgentToggleDirty)
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
  const permitFormStatus = permitForm?.permitStatus.trim().toUpperCase() ?? ''
  const paymentPendingReceiptRequiresCompletion =
    permitStatusCode === SERVER_ASSIGNED_PAYMENT_PENDING_STATUS &&
    !detail?.receiptNumber?.trim() &&
    !!permitForm?.permitReceiptNo.trim() &&
    permitFormStatus === SERVER_ASSIGNED_PAYMENT_PENDING_STATUS
  const showPaymentPendingReceiptGuidance =
    isEditingPermit &&
    canSavePermit &&
    canReviewPermits &&
    permitStatusCode === SERVER_ASSIGNED_PAYMENT_PENDING_STATUS &&
    !detail?.receiptNumber?.trim() &&
    permitFormStatus !== 'COM'
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
  const ministerialScaleSelectionChanges = (tabsData?.items ?? []).filter(
    (row) =>
      ministerialScaleSelectionDraft?.[row.id] !== undefined &&
      ministerialScaleSelectionDraft[row.id] !== row.includedInPermit,
  )
  const ministerialScaleSelectionDirty = ministerialScaleSelectionChanges.length > 0
  const blanketOicPackageDirty =
    canEditBlanketOicPackages && !formValuesEqual(boicPackageForm, boicPackageBaselineForm)
  const blanketOicScaleDirty =
    canEditBlanketOicScaleRows &&
    !formValuesEqual(resolvedBlanketOicScaleForm, resolvedBlanketOicScaleBaselineForm)
  const blanketOicPackageEditorOpen = isCreatingBoicPackage || editingBoicPackageNumber !== null
  const blanketOicPackageActionsDisabled =
    blanketOicScaleDirty ||
    isSavingBoicScale ||
    isDeletingBoicScaleId !== null ||
    blanketOicPackageEditorOpen ||
    isSavingBoicPackage ||
    isDeletingBoicPackageNumber !== null
  const blanketOicScaleActionsDisabled =
    isSavingBoicScale ||
    isSavingBoicPackage ||
    isDeletingBoicScaleId !== null ||
    blanketOicPackageEditorOpen ||
    isDeletingBoicPackageNumber !== null
  const permitReviewReady =
    canRequestPermitReview &&
    permitStatusCode === 'ACT' &&
    !isPermitTablesLoading &&
    !!tabsData &&
    (detail?.blanketOic ? !!detail.oicApplicationNumber : tabsData.applications.length > 0) &&
    tabsData.packages.length > 0 &&
    tabsData.items.length > 0
  const totalFeeVolume = tabsData?.totalFeeVolume
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
  const ministerialFeeShellEmpty =
    ministerialPermit &&
    !isPermitTablesLoading &&
    feeSummaryStatus === null &&
    !!tabsData &&
    tabsData.applications.length === 0 &&
    tabsData.packages.length === 0 &&
    tabsData.items.length === 0 &&
    tabsData.fees.length === 0 &&
    !detail?.receiptNumber?.trim() &&
    !feeOverrideContext?.overrideEnabled &&
    !feeOverrideContext?.overrideFee.trim() &&
    !feeOverrideContext?.overrideComment.trim()
  const reloadPermitTabs = useCallback(async () => {
    const resolvedPermitNumber = detail?.permitNumber
      ? String(detail.permitNumber)
      : (permitNumber ?? '')
    if (!resolvedPermitNumber || !detail) {
      return
    }

    const reloadFees =
      loadedDeferredPermitTabsRef.current.has('fees') ||
      deferredPermitTabLoadsRef.current.has('fees')
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
      if (
        reloadFees ||
        loadedDeferredPermitTabsRef.current.has('fees') ||
        deferredPermitTabLoadsRef.current.has('fees')
      ) {
        deferredPermitTabLoadsRef.current.delete('fees')
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

    const exemptionNumber = detail?.exemptionNumber
    const [, refreshedDetail, refreshedExemptionContext] = await Promise.all([
      reloadPermitTabs(),
      fetchProvincialPermitDetail(resolvedPermitNumber),
      exemptionNumber
        ? fetchProvincialPermitExemptionContext(exemptionNumber)
        : Promise.resolve(null),
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
            approvedExemptionVolume:
              refreshedExemptionContext?.approvedExemptionVolume ?? current.approvedExemptionVolume,
            exemptionVolumeRemaining:
              refreshedExemptionContext?.exemptionVolumeRemaining ??
              current.exemptionVolumeRemaining,
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
  }, [detail?.exemptionNumber, detail?.permitNumber, permitNumber, reloadPermitTabs])

  const reloadAvailablePermitApplications = useCallback(async () => {
    const isLatestRequest = beginAvailablePermitApplicationsRequest()
    if (!canEditPermitApplications || !detail?.exemptionNumber) {
      if (isLatestRequest()) {
        setAvailablePermitApplications([])
        setAvailablePermitApplicationItems(null)
        setPermitApplicationToAdd('')
        setMinisterialPermitApplicationsToAdd([])
        setHasLoadedAvailablePermitApplications(false)
        setIsLoadingAvailableApplications(false)
        setAvailablePermitApplicationsError('')
      }
      return
    }

    setAvailablePermitApplicationsError('')
    setIsLoadingAvailableApplications(true)
    try {
      const result = await fetchAvailablePermitApplications(
        detail.exemptionNumber,
        associatedPermitApplications,
      )
      if (!isLatestRequest()) return
      setAvailablePermitApplications(result.applicationList)
      setAvailablePermitApplicationItems(result.applicationItems ?? null)
      setPermitApplicationToAdd((current) =>
        result.applicationList.includes(current) ? current : '',
      )
      const selectableApplicationNumbers = new Set(
        (
          result.applicationItems ??
          result.applicationList.map((applicationNumber) => ({
            applicationNumber,
            disabled: false,
          }))
        )
          .filter((item) => !item.disabled)
          .map((item) => item.applicationNumber),
      )
      setMinisterialPermitApplicationsToAdd((current) =>
        current.filter((applicationNumber) => selectableApplicationNumbers.has(applicationNumber)),
      )
      setHasLoadedAvailablePermitApplications(true)
    } catch (error) {
      if (!isLatestRequest()) return
      console.error(error)
      setAvailablePermitApplications([])
      setAvailablePermitApplicationItems(null)
      setMinisterialPermitApplicationsToAdd([])
      setHasLoadedAvailablePermitApplications(false)
      setAvailablePermitApplicationsError('Applications could not be loaded. Try again.')
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
  useEffect(() => {
    if (
      ministerialPermit &&
      activePermitTabId === 'permit' &&
      canEditPermitApplications &&
      !hasLoadedAvailablePermitApplications &&
      !isLoadingAvailableApplications &&
      !availablePermitApplicationsError
    ) {
      void reloadAvailablePermitApplications()
    }
  }, [
    activePermitTabId,
    availablePermitApplicationsError,
    canEditPermitApplications,
    hasLoadedAvailablePermitApplications,
    isLoadingAvailableApplications,
    ministerialPermit,
    reloadAvailablePermitApplications,
  ])
  const requiresOicRequestLimits = blanketOicPermit && !invoiceMaterialLocked
  const requiresPositiveOicRequestLimits =
    requiresOicRequestLimits && permitForm?.permitStatus.trim().toUpperCase() === 'COM'
  const requiresPermitCompletionDates = permitForm?.permitStatus.trim().toUpperCase() === 'COM'
  const requiresCompletionSubmitDate =
    requiresPermitCompletionDates && ['ACT', 'CAN'].includes(permitStatusCode ?? '')
  const permitFieldErrors = useMemo<FieldErrors<PermitDetailFormField>>(() => {
    if (!permitForm) {
      return {}
    }

    return {
      permitNumber: requiredFieldError(permitForm.permitNumber, 'Permit number') ?? undefined,
      permitStatus: requiredFieldError(permitForm.permitStatus, 'Permit status') ?? undefined,
      orgUnitNumber: blanketOicPermit
        ? firstValidationError(
            () => requiredFieldError(permitForm.orgUnitNumber, 'Region'),
            () => integerFieldError(permitForm.orgUnitNumber, 'Region'),
            () => positiveNumericFieldError(permitForm.orgUnitNumber),
            () =>
              !invoiceMaterialLocked &&
              !blanketOicRegionOptionsLoading &&
              !blanketOicRegionError &&
              !editablePermitRegionOptions.some(
                (option) => option.value === permitForm.orgUnitNumber.trim(),
              )
                ? 'Select a region in the exemption area.'
                : null,
          )
        : undefined,
      permitIssueDate:
        firstValidationError(
          () =>
            requiresPermitCompletionDates
              ? requiredFieldError(permitForm.permitIssueDate, 'Issued date')
              : null,
          () => isoDateFieldError(permitForm.permitIssueDate),
        ) ?? undefined,
      permitExpiryDate:
        firstValidationError(
          () =>
            requiresPermitCompletionDates
              ? requiredFieldError(permitForm.permitExpiryDate, 'Expiry date')
              : null,
          () => isoDateFieldError(permitForm.permitExpiryDate),
        ) ?? undefined,
      permitSubmitDate:
        firstValidationError(
          () =>
            requiresCompletionSubmitDate
              ? requiredFieldError(permitForm.permitSubmitDate, 'Submit date')
              : null,
          () => isoDateFieldError(permitForm.permitSubmitDate),
        ) ?? undefined,
      permitRequestDate: undefined,
      permitReceiptNo:
        firstValidationError(
          () =>
            ASCII_PATTERN.test(permitForm.permitReceiptNo.trim())
              ? null
              : 'Receipt number contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
          () => maxLengthFieldError(permitForm.permitReceiptNo, 50, 'Receipt number'),
        ) ?? undefined,
      permitRemarks:
        firstValidationError(
          () =>
            ASCII_PATTERN.test(permitForm.permitRemarks.trim())
              ? null
              : 'Permit remarks contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
          () =>
            maxLengthFieldError(
              permitForm.permitRemarks,
              usesReviewedPermitFlow ? MAX_REVIEWED_PERMIT_REMARKS_LENGTH : 254,
              'Permit remarks',
            ),
        ) ?? undefined,
      estimatedShippingDate: firstValidationError(
        () => requiredFieldError(permitForm.estimatedShippingDate, 'Estimated shipping date'),
        () => isoDateFieldError(permitForm.estimatedShippingDate),
      ),
      destinationCompanyName:
        requiredMaxLengthFieldError(permitForm.destinationCompanyName, 52, 'Purchaser') ??
        undefined,
      destinationCountry:
        requiredExactLengthFieldError(
          permitForm.destinationCountry,
          2,
          'Final destination country',
        ) ?? undefined,
      transportType:
        requiredExactLengthFieldError(permitForm.transportType, 1, 'Transport type') ?? undefined,
      transportName:
        requiredMaxLengthFieldError(permitForm.transportName, 26, 'Transport name') ?? undefined,
      portOfExport:
        requiredExactLengthFieldError(permitForm.portOfExport, 2, 'Customs port of export') ??
        undefined,
      otherPortOfExport:
        permitForm.portOfExport.trim().toUpperCase() === 'OT'
          ? (requiredMaxLengthFieldError(
              permitForm.otherPortOfExport,
              34,
              'Other port of export',
            ) ?? undefined)
          : undefined,
      permitTotalVolume:
        numericFieldError(permitForm.permitTotalVolume, 'Current permit volume') ?? undefined,
      permitNumberOfPieces: permitForm.permitNumberOfPieces.trim()
        ? (integerFieldError(permitForm.permitNumberOfPieces, 'Current permit pieces') ?? undefined)
        : undefined,
      oicPermitTotalPieces: requiresOicRequestLimits
        ? firstValidationError(
            () => requiredFieldError(permitForm.oicPermitTotalPieces, 'Permit Request Pieces'),
            () => integerFieldError(permitForm.oicPermitTotalPieces, 'Permit Request Pieces'),
            () =>
              requiresPositiveOicRequestLimits
                ? positiveNumericFieldError(permitForm.oicPermitTotalPieces)
                : null,
            () =>
              maxNumericValueFieldError(
                permitForm.oicPermitTotalPieces,
                MAX_OIC_REQUEST_PIECES,
                'Permit Request Pieces',
              ),
          )
        : undefined,
      oicPermitTotalVolume: requiresOicRequestLimits
        ? firstValidationError(
            () => requiredFieldError(permitForm.oicPermitTotalVolume, 'Permit Request Volume'),
            () => numericFieldError(permitForm.oicPermitTotalVolume, 'Permit Request Volume'),
            () =>
              requiresPositiveOicRequestLimits
                ? positiveNumericFieldError(permitForm.oicPermitTotalVolume)
                : null,
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
  }, [
    blanketOicPermit,
    blanketOicRegionError,
    blanketOicRegionOptionsLoading,
    editablePermitRegionOptions,
    invoiceMaterialLocked,
    requiresPositiveOicRequestLimits,
    usesReviewedPermitFlow,
    permitForm,
    requiresCompletionSubmitDate,
    requiresPermitCompletionDates,
    requiresOicRequestLimits,
  ])
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

  const resetPermitClientLookup = (kind: PermitClientKind): void => {
    const requestRef = kind === 'owner' ? ownerClientLookupRequestRef : agentClientLookupRequestRef
    requestRef.current += 1
    if (kind === 'owner') {
      setOwnerEditClientData(null)
      setOwnerClientLocations([])
      setIsOwnerClientLookupLoading(false)
      setOwnerClientLookupError('')
      return
    }
    setAgentEditClientData(null)
    setAgentClientLocations([])
    setIsAgentClientLookupLoading(false)
    setAgentClientLookupError('')
  }

  const loadPermitClientData = async (
    kind: PermitClientKind,
    clientNumber: string,
    locationCode: string,
  ): Promise<void> => {
    const normalizedClientNumber = clientNumber.trim()
    const normalizedLocationCode = locationCode.trim()
    const requestRef = kind === 'owner' ? ownerClientLookupRequestRef : agentClientLookupRequestRef
    const requestId = ++requestRef.current
    const { clientNumber: clientNumberField, location: locationField } = permitClientFields(kind)
    const setClientData = kind === 'owner' ? setOwnerEditClientData : setAgentEditClientData
    const setLoading =
      kind === 'owner' ? setIsOwnerClientLookupLoading : setIsAgentClientLookupLoading
    const setError = kind === 'owner' ? setOwnerClientLookupError : setAgentClientLookupError

    setError('')
    setClientData(null)
    if (!/^\d{1,8}$/.test(normalizedClientNumber) || !normalizedLocationCode) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const clientData = await fetchExemptionClientData(
        normalizedClientNumber,
        normalizedLocationCode,
      )
      if (requestRef.current !== requestId) return
      setClientData(clientData)
      const confirmedClientNumber = clientData?.clientNumber.trim() || normalizedClientNumber
      setPermitForm((current) => {
        if (
          !current ||
          !clientLookupNumbersMatch(current[clientNumberField], normalizedClientNumber) ||
          current[locationField].trim() !== normalizedLocationCode
        ) {
          return current
        }
        return current[clientNumberField] === confirmedClientNumber
          ? current
          : { ...current, [clientNumberField]: confirmedClientNumber }
      })
    } catch (error) {
      if (requestRef.current !== requestId) return
      console.error(error)
      setError(CLIENT_LOOKUP_UNAVAILABLE_MESSAGE)
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false)
      }
    }
  }

  const loadPermitClientLocations = useCallback(
    async (
      kind: PermitClientKind,
      clientNumber: string,
      currentLocationCode: string,
    ): Promise<void> => {
      const normalizedClientNumber = clientNumber.trim()
      const requestRef =
        kind === 'owner' ? ownerClientLookupRequestRef : agentClientLookupRequestRef
      const requestId = ++requestRef.current
      const { clientNumber: clientNumberField, location: locationField } = permitClientFields(kind)
      const setLocations = kind === 'owner' ? setOwnerClientLocations : setAgentClientLocations
      const setClientData = kind === 'owner' ? setOwnerEditClientData : setAgentEditClientData
      const setLoading =
        kind === 'owner' ? setIsOwnerClientLookupLoading : setIsAgentClientLookupLoading
      const setError = kind === 'owner' ? setOwnerClientLookupError : setAgentClientLookupError

      setError('')
      setClientData(null)
      setLocations([])
      if (!/^\d{1,8}$/.test(normalizedClientNumber)) {
        setLoading(false)
        setError('Enter a client number containing 1 to 8 digits.')
        setPermitForm((current) =>
          current && clientLookupNumbersMatch(current[clientNumberField], normalizedClientNumber)
            ? { ...current, [locationField]: '' }
            : current,
        )
        return
      }

      setLoading(true)
      try {
        const locations = await fetchExemptionClientLocations(normalizedClientNumber)
        if (requestRef.current !== requestId) return
        const selectedLocationCode = resolveClientLocationCode(locations, currentLocationCode)
        setLocations(locations)
        setPermitForm((current) => {
          if (
            !current ||
            !clientLookupNumbersMatch(current[clientNumberField], normalizedClientNumber)
          ) {
            return current
          }
          return current[locationField] === selectedLocationCode
            ? current
            : { ...current, [locationField]: selectedLocationCode }
        })
        if (!locations.some(isSelectableClientLocation)) {
          setError('No verified locations were found for this client.')
          return
        }
        if (selectedLocationCode) {
          const clientData = await fetchExemptionClientData(
            normalizedClientNumber,
            selectedLocationCode,
          )
          if (requestRef.current !== requestId) return
          setClientData(clientData)
          const confirmedClientNumber = clientData?.clientNumber.trim() || normalizedClientNumber
          setPermitForm((current) => {
            if (
              !current ||
              !clientLookupNumbersMatch(current[clientNumberField], normalizedClientNumber) ||
              current[locationField] !== selectedLocationCode
            ) {
              return current
            }
            return current[clientNumberField] === confirmedClientNumber
              ? current
              : { ...current, [clientNumberField]: confirmedClientNumber }
          })
        }
      } catch (error) {
        if (requestRef.current !== requestId) return
        console.error(error)
        setError(CLIENT_LOOKUP_UNAVAILABLE_MESSAGE)
      } finally {
        if (requestRef.current === requestId) {
          setLoading(false)
        }
      }
    },
    [],
  )

  const setPermitClientNumber = (kind: PermitClientKind, value: string): void => {
    const { clientNumber, location } = permitClientFields(kind)
    resetPermitClientLookup(kind)
    setPermitForm((current) =>
      current ? { ...current, [clientNumber]: value, [location]: '' } : current,
    )
  }

  const setPermitClientLocation = (kind: PermitClientKind, value: string): void => {
    const { clientNumber, location } = permitClientFields(kind)
    const clientNumberValue = permitForm?.[clientNumber] ?? ''
    setPermitForm((current) => (current ? { ...current, [location]: value } : current))
    void loadPermitClientData(kind, clientNumberValue, value)
  }

  const setPermitAgentUsed = (checked: boolean): void => {
    setAgentUsed(checked)
    if (!checked && !usesReviewedPermitFlow) {
      resetPermitClientLookup('agent')
      setPermitForm((current) =>
        current ? { ...current, agentClientNumber: '', agentClientLocation: '' } : current,
      )
    }
  }

  const resetPermitFormSection = useCallback(
    (shippingFields: boolean): void => {
      if (detail) {
        setPermitForm((current) =>
          mergePermitFormSection(current, buildPermitDetailForm(detail), shippingFields),
        )
      }
      setTouchedPermitFields({})
      setShowPermitValidationErrors(false)
    },
    [detail],
  )

  const startPermitClientEdit = (): void => {
    if (!detail) return
    resetPermitFormSection(false)
    setAgentUsed(Boolean(detail.applicantClientNumber?.trim()))
    setIsEditingPermitClients(true)
    setIsEditingPermit(true)
    void loadPermitClientLocations(
      'owner',
      detail.ownerClientNumber ?? '',
      detail.ownerClientLocationCode ?? '',
    )
    if (detail.applicantClientNumber?.trim()) {
      void loadPermitClientLocations(
        'agent',
        detail.applicantClientNumber,
        detail.agentClientLocationCode ?? '',
      )
    }
  }

  useEffect(() => {
    if (
      !isNewlyCreatedBlanketOicPermitNavigation(location.state) ||
      !detail ||
      String(detail.permitNumber) !== permitNumber
    ) {
      return
    }

    if (detail.blanketOic && location.state.blanketOicPermitCreated === permitNumber) {
      // Keep the one-time notice visible after consuming its navigation signal.
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setCreatedBlanketOicPermitNumber(permitNumber)
    }
    const remainingState: Record<string, unknown> = { ...location.state }
    delete remainingState.blanketOicPermitCreated
    navigate(locationPath(location), { replace: true, state: remainingState })
  }, [detail, location, navigate, permitNumber])

  useEffect(() => {
    const openNewlyCreatedMinisterialPermit = async (): Promise<void> => {
      const routeKey = `${location.key}:${permitNumber ?? ''}`
      if (
        !isNewlyCreatedPermitNavigation(location.state) ||
        !ministerialPermit ||
        !canSavePermit ||
        !detail ||
        newlyCreatedPermitRouteRef.current === routeKey
      ) {
        return
      }

      newlyCreatedPermitRouteRef.current = routeKey
      resetPermitFormSection(true)
      setAgentUsed(Boolean(detail.applicantClientNumber?.trim()))
      setIsEditingPermit(true)
      setIsEditingPermitClients(true)
      setIsEditingShipping(true)
      void loadPermitClientLocations(
        'owner',
        detail.ownerClientNumber ?? '',
        detail.ownerClientLocationCode ?? '',
      )
      if (detail.applicantClientNumber?.trim()) {
        void loadPermitClientLocations(
          'agent',
          detail.applicantClientNumber,
          detail.agentClientLocationCode ?? '',
        )
      }
      navigate(locationPath(location), {
        replace: true,
        state: withoutNewlyCreatedPermitNavigation(location.state),
      })
    }

    void openNewlyCreatedMinisterialPermit()
  }, [
    canSavePermit,
    detail,
    location,
    ministerialPermit,
    navigate,
    permitNumber,
    loadPermitClientLocations,
    resetPermitFormSection,
  ])

  const cancelPermitClientEdit = (): void => {
    resetPermitClientLookup('owner')
    resetPermitClientLookup('agent')
    resetPermitFormSection(false)
    setAgentUsed(Boolean(detail?.applicantClientNumber?.trim()))
    setIsEditingPermitClients(false)
    setIsEditingPermit(false)
  }

  const savePermitMutation = useCallback(
    async (includeShipping = false, deferStatusTransition = false): Promise<boolean> => {
      setActionSuccessNotification(null)
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
        blanketOicRegionSelectionUnavailable ||
        requiredPermitOptionsMissing
      ) {
        return false
      }
      if (isEditingPermitClients && !permitClientLookupCanSave) {
        setActionErrorMessage(
          'Select verified applicant and agent locations before saving the permit.',
        )
        return false
      }
      let confirmedRequest: PermitDetailMutationRequest = request

      const isLatestRequest = tryBeginPermitMutation()
      if (!isLatestRequest) {
        setActionErrorMessage('Wait for the current permit change to finish before saving again.')
        return false
      }
      setPermitDetailRefreshRequired(false)
      setActionErrorMessage('')
      setActionFeedback(null)
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

        let persistedDetail: ProvincialPermitDetail | null = null
        if (resolvedPermitNumber) {
          try {
            persistedDetail = await fetchProvincialPermitDetail(resolvedPermitNumber)
          } catch (error) {
            console.warn('Unable to refresh persisted permit client details.', error)
          }
          if (!isLatestRequest()) {
            return false
          }
        }
        const permitDetailRefreshFailed = persistedDetail == null

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
        const persistedUpdatedDetail =
          persistedDetail == null
            ? withoutPermitClientValues(updatedDetail)
            : withPersistedPermitClientValues(updatedDetail, persistedDetail)
        setAgentUsed(Boolean(persistedUpdatedDetail.applicantClientNumber?.trim()))
        setDetail((current) => {
          if (!current) return current
          const currentWithPermitChanges = withUpdatedPermitDetail(
            current,
            confirmedRequest,
            editablePermitStatusOptions,
            editablePermitRegionOptions,
          )
          const currentUpdatedDetail = withPermitMutationResult(
            includeShipping
              ? withUpdatedPermitShipping(currentWithPermitChanges, confirmedRequest)
              : currentWithPermitChanges,
            result,
          )
          return persistedDetail == null
            ? withoutPermitClientValues(currentUpdatedDetail)
            : withPersistedPermitClientValues(currentUpdatedDetail, persistedDetail)
        })
        setPermitForm((current) => {
          const savedForm = includeShipping
            ? buildPermitDetailForm(persistedUpdatedDetail)
            : mergePermitFormSection(current, buildPermitDetailForm(persistedUpdatedDetail), false)
          return deferStatusTransition
            ? { ...savedForm, permitStatus: targetPermitStatus }
            : savedForm
        })
        if (permitDetailRefreshFailed) {
          setOwnerClientData(null)
          setAgentClientData(null)
          setIsClientDataLoading(false)
          setClientDataErrorMessage('')
          setPermitDetailRefreshRequired(true)
          setEditContextLoaded(false)
          setIsEditingPermitClients(false)
          setIsEditingPermit(false)
          setIsEditingShipping(false)
          setIsEditingFeeOverride(false)
        } else {
          setIsEditingPermitClients(false)
          setIsEditingPermit(deferStatusTransition)
        }
        if (includeShipping && !deferStatusTransition) {
          setIsEditingShipping(false)
        }
        setTouchedPermitFields({})
        setShowPermitValidationErrors(false)
        const mutationMessage = permitMutationMessage(
          result,
          deferStatusTransition
            ? 'Permit fields were saved before the status transition.'
            : includeShipping
              ? 'Permit and shipping details were saved.'
              : activePermitTabId === 'owner'
                ? 'Applicant details were saved.'
                : 'Permit details were saved.',
        )
        if (permitDetailRefreshFailed) {
          setActionFeedback({
            kind: 'warning',
            message: `${mutationMessage} Current permit details could not be refreshed; reload before making another change.`,
          })
        } else {
          setActionSuccessNotification({
            title: includeShipping
              ? 'Permit and shipping details saved'
              : activePermitTabId === 'owner'
                ? 'Applicant details saved'
                : 'Permit details saved',
            subtitle: mutationMessage,
          })
        }
        refreshLoadedPermitFees()
        // The mutation committed, but callers must stop until canonical permit details reload.
        return !permitDetailRefreshFailed
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
      blanketOicRegionSelectionUnavailable,
      canSavePermit,
      detail,
      endPermitMutation,
      editablePermitRegionOptions,
      editablePermitStatusOptions,
      hasPermitValidationError,
      hasShippingValidationError,
      isEditingPermitClients,
      isSavingPermit,
      isPermitOptionsLoading,
      permitOptionsUnavailable,
      requiredPermitOptionsMissing,
      permitFieldErrors,
      permitClientLookupCanSave,
      permitForm,
      permitNumber,
      refreshLoadedPermitFees,
      activePermitTabId,
      tryBeginPermitMutation,
    ],
  )

  const onSaveShipping = useCallback(async (): Promise<boolean> => {
    setActionSuccessNotification(null)
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
    setActionFeedback(null)
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
      setActionSuccessNotification({
        title: 'Shipping details saved',
        subtitle: permitMutationMessage(result, 'Shipping details were saved.'),
      })
      refreshLoadedPermitFees()
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
    refreshLoadedPermitFees,
    shippingReferences,
    tryBeginPermitMutation,
  ])

  const onSaveScaleSelection = useCallback(async (): Promise<boolean> => {
    if (isSavingScaleSelection) return false
    if (!ministerialScaleSelectionDirty) {
      setMinisterialScaleSelectionDraft(null)
      return true
    }
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!canEditNormalPermitScaleRows || !resolvedPermitNumber) return false
    const isLatestRequest = tryBeginPermitMutation()
    if (!isLatestRequest) {
      setActionErrorMessage('Wait for the current permit change to finish before saving again.')
      return false
    }
    setIsSavingScaleSelection(true)
    setActionErrorMessage('')
    setActionSuccessNotification(null)
    let saved = false
    try {
      const result = await updatePermitScaleSelection({
        permitNumber: resolvedPermitNumber,
        includedScaleIds: ministerialScaleSelectionChanges
          .filter((row) => ministerialScaleSelectionDraft?.[row.id])
          .map((row) => row.id),
        excludedScaleIds: ministerialScaleSelectionChanges
          .filter((row) => !ministerialScaleSelectionDraft?.[row.id])
          .map((row) => row.id),
      })
      if (!isLatestRequest()) return false
      if (!result.success) {
        setActionErrorMessage(
          result.errors[0] || result.message || 'Unable to save scale selection.',
        )
        return false
      }
      saved = true
      setAvailablePermitApplications([])
      setAvailablePermitApplicationItems(null)
      setHasLoadedAvailablePermitApplications(false)
      setAvailablePermitApplicationsError('')
      await reloadPermitScaleState()
      if (!isLatestRequest()) return false
      setMinisterialScaleSelectionDraft(null)
      setActionSuccessNotification({ title: 'Scale selection saved', subtitle: result.message })
      return true
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setPermitDetailRefreshRequired(true)
        setEditContextLoaded(false)
        setActionErrorMessage(
          saved
            ? 'Scale selection was saved, but the current totals could not be refreshed. Reload before making another change.'
            : 'Unable to confirm whether scale selection was saved. Reload before making another change.',
        )
      }
      return false
    } finally {
      endPermitMutation()
      if (isLatestRequest()) setIsSavingScaleSelection(false)
    }
  }, [
    canEditNormalPermitScaleRows,
    detail?.permitNumber,
    endPermitMutation,
    isSavingScaleSelection,
    ministerialScaleSelectionChanges,
    ministerialScaleSelectionDirty,
    ministerialScaleSelectionDraft,
    permitNumber,
    reloadPermitScaleState,
    tryBeginPermitMutation,
  ])

  const onSavePermit = useCallback(async (): Promise<boolean> => {
    setActionSuccessNotification(null)
    if (paymentPendingReceiptRequiresCompletion) {
      setActionErrorMessage(
        'Select Completed on the Permit tab before saving a payment-pending receipt.',
      )
      return false
    }
    if (
      isPermitOptionsLoading ||
      permitOptionsUnavailable ||
      blanketOicRegionSelectionUnavailable ||
      requiredPermitOptionsMissing
    ) {
      setActionErrorMessage(
        permitOptionsUnavailable
          ? SEARCH_OPTIONS_UNAVAILABLE_MESSAGE
          : blanketOicRegionOptionsLoading
            ? 'Blanket OIC region options are still loading.'
            : 'Required permit status or region options are not configured.',
      )
      return false
    }
    if (ministerialScaleSelectionDirty && !(await onSaveScaleSelection())) return false
    const shippingSaved = permitShippingDirty ? await onSaveShipping() : true
    if (!shippingSaved) return false

    const includeShipping = permitShippingDirty
    if (permitStatusTransitionDraft && permitInvoicePolicyDirty) {
      if (!(await savePermitMutation(includeShipping, true))) return false
    }
    return savePermitMutation(includeShipping)
  }, [
    blanketOicRegionOptionsLoading,
    blanketOicRegionSelectionUnavailable,
    onSaveShipping,
    onSaveScaleSelection,
    ministerialScaleSelectionDirty,
    isPermitOptionsLoading,
    permitOptionsUnavailable,
    paymentPendingReceiptRequiresCompletion,
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

    setActionSuccessNotification(null)
    const normalizedFee = feeOverrideForm.overrideFee.trim()
    const normalizedComment = feeOverrideForm.overrideComment.trim()
    const { fieldErrors, roundedFee } = validatePermitFeeOverride(feeOverrideForm)
    if (fieldErrors.overrideFee || fieldErrors.overrideComment) {
      setFeeOverrideFieldErrors(fieldErrors)
      setActionErrorMessage('')
      return false
    }

    const storedFee = feeOverrideForm.overrideEnabled ? (roundedFee ?? normalizedFee) : ''

    const request: PermitDetailMutationRequest = {
      ...buildPermitDetailForm(detail),
      overrideInd: String(feeOverrideForm.overrideEnabled),
      overrideFee: storedFee,
      overrideComment: feeOverrideForm.overrideEnabled ? normalizedComment : '',
    }
    const isLatestRequest = tryBeginPermitMutation()
    if (!isLatestRequest) {
      setActionErrorMessage('Wait for the current permit change to finish before saving again.')
      return false
    }
    setActionErrorMessage('')
    setActionFeedback(null)
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
        overrideFee: storedFee,
        overrideComment: feeOverrideForm.overrideEnabled ? normalizedComment : '',
        locked: false,
        lockMessage: '',
      }
      setFeeOverrideContext(savedContext)
      setFeeOverrideForm(savedContext)
      setFeeOverrideFieldErrors({})
      setIsEditingFeeOverride(false)
      setActionSuccessNotification({
        title: 'Fee override saved',
        subtitle: result.message || 'The fee override was saved.',
      })
      refreshLoadedPermitFees()
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
    refreshLoadedPermitFees,
    tryBeginPermitMutation,
  ])

  const onToggleScaleAttachment = useCallback(
    async (scaleId: string, attachInd: boolean) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (!canEditNormalPermitScaleRows || !resolvedPermitNumber || !scaleId) {
        return
      }

      const isLatestRequest = tryBeginPermitMutation()
      if (!isLatestRequest) {
        setActionErrorMessage('Wait for the current permit change to finish before saving again.')
        return
      }

      setActionErrorMessage('')
      setActionFeedback(null)
      setActionSuccessNotification(null)
      setIsUpdatingScaleId(scaleId)
      try {
        const result = await updatePermitScaleAttachment({
          scaleId,
          permitNumber: resolvedPermitNumber,
          attachInd,
        })
        if (!isLatestRequest()) {
          return
        }
        if (!result.success) {
          setActionErrorMessage(
            result.errors[0] || result.message || 'Unable to update permit item rows.',
          )
          return
        }

        setAvailablePermitApplications([])
        setAvailablePermitApplicationItems(null)
        setHasLoadedAvailablePermitApplications(false)
        setAvailablePermitApplicationsError('')
        await reloadPermitScaleState()
        setActionFeedback({
          kind: 'success',
          message: result.message || 'Permit item rows were updated.',
        })
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setActionErrorMessage('Unable to update permit item rows.')
        }
      } finally {
        endPermitMutation()
        setIsUpdatingScaleId(null)
      }
    },
    [
      canEditNormalPermitScaleRows,
      detail?.permitNumber,
      endPermitMutation,
      permitNumber,
      reloadPermitScaleState,
      tryBeginPermitMutation,
    ],
  )

  const onAddPermitApplication = useCallback(async () => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    const selectedApplications = ministerialPermit
      ? ministerialPermitApplicationsToAdd
      : selectedPermitApplicationToAdd
        ? [selectedPermitApplicationToAdd]
        : []
    if (!canEditPermitApplications || !resolvedPermitNumber || selectedApplications.length === 0) {
      return
    }

    const isLatestRequest = tryBeginPermitMutation()
    if (!isLatestRequest) {
      setActionErrorMessage('Wait for the current permit change to finish before saving again.')
      return
    }

    setActionErrorMessage('')
    setActionFeedback(null)
    setActionSuccessNotification(null)
    setIsSavingPermitApplication(true)
    try {
      const result = await addApplicationsToPermit({
        permitNumber: resolvedPermitNumber,
        selectedApplications,
      })
      if (!isLatestRequest()) {
        return
      }
      if (!result.success) {
        setActionErrorMessage(
          result.errors[0] || result.message || 'Unable to add application to the permit.',
        )
        return
      }

      setPermitApplicationToAdd('')
      setMinisterialPermitApplicationsToAdd([])
      setAvailablePermitApplications([])
      setAvailablePermitApplicationItems(null)
      setHasLoadedAvailablePermitApplications(false)
      setAvailablePermitApplicationsError('')
      setTabsData((current) =>
        current
          ? {
              ...current,
              applications: Array.from(new Set([...current.applications, ...selectedApplications])),
            }
          : current,
      )
      try {
        await reloadPermitScaleState()
        setActionFeedback({
          kind: 'success',
          message: result.message || 'Application was added to the permit.',
        })
      } catch (refreshError) {
        console.error(refreshError)
        setPermitTablesErrorMessage(
          'The application was added, but permit tables could not be refreshed. Reload the page.',
        )
        setActionFeedback({
          kind: 'warning',
          message: `${result.message || 'Application was added to the permit.'} Reload before changing application links again.`,
        })
      }
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setActionErrorMessage('Unable to add application to the permit.')
      }
    } finally {
      endPermitMutation()
      setIsSavingPermitApplication(false)
    }
  }, [
    canEditPermitApplications,
    detail?.permitNumber,
    endPermitMutation,
    ministerialPermit,
    ministerialPermitApplicationsToAdd,
    permitNumber,
    reloadPermitScaleState,
    selectedPermitApplicationToAdd,
    tryBeginPermitMutation,
  ])

  const onRemovePermitApplication = useCallback(
    async (applicationNumber: string) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (!canEditPermitApplications || !resolvedPermitNumber || !applicationNumber) {
        throw new Error('This application cannot be removed from the current permit.')
      }

      const isLatestRequest = tryBeginPermitMutation()
      if (!isLatestRequest) {
        const message = 'Wait for the current permit change to finish before saving again.'
        setActionErrorMessage(message)
        throw new Error(message)
      }

      setActionErrorMessage('')
      setActionFeedback(null)
      setActionSuccessNotification(null)
      setIsRemovingPermitApplication(applicationNumber)
      try {
        const result = await removeApplicationFromPermit({
          permitNumber: resolvedPermitNumber,
          applicationNumber,
        })
        if (!isLatestRequest()) {
          return
        }
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
        setAvailablePermitApplicationItems(null)
        setMinisterialPermitApplicationsToAdd([])
        setHasLoadedAvailablePermitApplications(false)
        setAvailablePermitApplicationsError('')
        try {
          await reloadPermitScaleState()
          setActionFeedback({
            kind: 'success',
            message: result.message || 'Application was removed from the permit.',
          })
        } catch (refreshError) {
          console.error(refreshError)
          setPermitTablesErrorMessage(
            'The application was removed, but permit tables could not be refreshed. Reload the page.',
          )
          setActionFeedback({
            kind: 'warning',
            message: `${result.message || 'Application was removed from the permit.'} Reload before changing application links again.`,
          })
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
        }
        throw error instanceof Error
          ? error
          : new Error('Unable to remove application from the permit.')
      } finally {
        endPermitMutation()
        setIsRemovingPermitApplication(null)
      }
    },
    [
      canEditPermitApplications,
      detail?.permitNumber,
      endPermitMutation,
      permitNumber,
      reloadPermitScaleState,
      tryBeginPermitMutation,
    ],
  )

  const setBlanketOicPackageFormField = (
    field: keyof BlanketOicPackageForm,
    value: string,
  ): void => {
    setBoicPackageForm((current) => ({ ...current, [field]: value }))
    setBoicPackageFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  const resetBlanketOicPackageForm = useCallback(() => {
    beginBoicPackageEditRequest()
    setBoicPackageErrorMessage('')
    setIsLoadingBoicPackage(false)
    setBoicCodeOptionsReady(false)
    setIsCreatingBoicPackage(false)
    setEditingBoicPackageNumber(null)
    setBoicPackageForm(EMPTY_BLANKET_OIC_PACKAGE_FORM)
    setBoicPackageBaselineForm(EMPTY_BLANKET_OIC_PACKAGE_FORM)
    setBoicPackageFieldErrors({})
  }, [beginBoicPackageEditRequest])

  const startBlanketOicPackageCreate = useCallback(() => {
    if (blanketOicPackageActionsDisabled) return
    resetBlanketOicPackageForm()
    setIsCreatingBoicPackage(true)
  }, [blanketOicPackageActionsDisabled, resetBlanketOicPackageForm])

  const onEditBlanketOicPackage = useCallback(
    async (packageNumberToEdit: string) => {
      if (!canEditBlanketOicPackages || !packageNumberToEdit || blanketOicPackageActionsDisabled) {
        return
      }
      resetBlanketOicPackageForm()
      setEditingBoicPackageNumber(packageNumberToEdit)
      const isLatestRequest = beginBoicPackageEditRequest()
      setIsLoadingBoicPackage(true)
      try {
        const context = await fetchBlanketOicPackageEditContext(packageNumberToEdit)
        if (!isLatestRequest()) return
        setIsCreatingBoicPackage(false)
        setEditingBoicPackageNumber(packageNumberToEdit)
        const loadedPackageForm: BlanketOicPackageForm = {
          packageNumber: context.packageNumber,
          volume: context.volume,
          averageLength: context.averageLength,
          averageDiameter: context.averageDiameter,
          status: context.status,
          comments: context.comments,
          reprocessed: context.reprocessed,
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
        setBoicPackageErrorMessage('Unable to load the Blanket OIC package for editing.')
      } finally {
        if (isLatestRequest()) {
          setIsLoadingBoicPackage(false)
        }
      }
    },
    [
      beginBoicPackageEditRequest,
      blanketOicPackageActionsDisabled,
      canEditBlanketOicPackages,
      resetBlanketOicPackageForm,
    ],
  )

  const onSaveBlanketOicPackage = useCallback(async (): Promise<boolean> => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (
      !canEditBlanketOicPackages ||
      !resolvedPermitNumber ||
      isSavingBoicPackage ||
      isLoadingBoicPackage ||
      !boicCodeOptionsReady ||
      blanketOicScaleDirty
    ) {
      return false
    }
    setActionSuccessNotification(null)
    if (
      permitForm &&
      permitForm.orgUnitNumber.trim() !== detailValue(detail?.orgUnitNumber).trim()
    ) {
      setBoicPackageErrorMessage('Save or discard the Region change before saving a package.')
      return false
    }
    const fieldErrors = validateBlanketOicPackage(boicPackageForm)
    if (Object.values(fieldErrors).some(Boolean)) {
      setBoicPackageFieldErrors(fieldErrors)
      setBoicPackageErrorMessage(
        Object.values(fieldErrors).find((error): error is string => !!error) ??
          'Please fix validation errors before saving the Blanket OIC package.',
      )
      return false
    }
    const speciesCodes = parseBlanketOicSpeciesCodes(boicPackageForm.speciesCodes)
    const packageNumber =
      editingBoicPackageNumber ?? boicPackageForm.packageNumber.trim().toUpperCase()
    const newPackageNumber =
      editingBoicPackageNumber === null
        ? undefined
        : boicPackageForm.packageNumber === editingBoicPackageNumber
          ? editingBoicPackageNumber
          : boicPackageForm.packageNumber.trim().toUpperCase()

    const request: BlanketOicPackageMutationRequest = {
      permitNumber: resolvedPermitNumber,
      packageNumber,
      newPackageNumber,
      volume: boicPackageForm.volume.trim(),
      averageLength: boicPackageForm.averageLength.trim(),
      averageDiameter: boicPackageForm.averageDiameter.trim(),
      status: editingBoicPackageNumber ? boicPackageForm.status.trim().toUpperCase() : 'ACT',
      comments: boicPackageForm.comments,
      reprocessed: editingBoicPackageNumber
        ? boicPackageForm.reprocessed.trim().toUpperCase()
        : 'N',
      ageClass: boicPackageForm.ageClass.trim().toUpperCase(),
      productType: boicPackageForm.productType.trim().toUpperCase(),
      endUseCode: boicPackageForm.endUseCode.trim().toUpperCase(),
      speciesCodes,
    }

    setBoicPackageErrorMessage('')
    setActionFeedback(null)
    setIsSavingBoicPackage(true)
    try {
      const result = editingBoicPackageNumber
        ? await updateBlanketOicPackage(request)
        : await addBlanketOicPackage(request)
      if (!result.success) {
        setBoicPackageErrorMessage(
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
      const savedPackageNumber =
        result.packageNumber || request.newPackageNumber || request.packageNumber
      if (savedPackageNumber) {
        setSelectedBlanketOicPackageNumberState(savedPackageNumber)
      }
      resetBlanketOicPackageForm()
      try {
        await reloadPermitTabs()
        setActionFeedback({
          kind: 'success',
          message: result.message || 'Blanket OIC package was saved.',
        })
      } catch (refreshError) {
        console.error(refreshError)
        setPermitTablesErrorMessage(
          'The Blanket OIC package was saved, but permit tables could not be refreshed.',
        )
        setActionFeedback({
          kind: 'warning',
          message: `${result.message || 'Blanket OIC package was saved.'} Reload before making another package change.`,
        })
      }
      return true
    } catch (error) {
      console.error(error)
      setBoicPackageErrorMessage('Unable to save the Blanket OIC package.')
      return false
    } finally {
      setIsSavingBoicPackage(false)
    }
  }, [
    boicPackageForm,
    boicCodeOptionsReady,
    blanketOicScaleDirty,
    isLoadingBoicPackage,
    canEditBlanketOicPackages,
    detail?.orgUnitNumber,
    detail?.permitNumber,
    editingBoicPackageNumber,
    isSavingBoicPackage,
    permitForm,
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
        blanketOicPackageActionsDisabled
      ) {
        return
      }
      setActionErrorMessage('')
      setActionFeedback(null)
      setActionSuccessNotification(null)
      setBoicPackageErrorMessage('')
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
        setActionFeedback({
          kind: 'success',
          message: result.message || 'Blanket OIC package was deleted.',
        })
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
      blanketOicPackageActionsDisabled,
      detail?.permitNumber,
      editingBoicPackageNumber,
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
    if (
      !canEditBlanketOicScaleRows ||
      !resolvedPermitNumber ||
      blanketOicScaleActionsDisabled ||
      !boicScaleCodeOptionsReady
    ) {
      return false
    }
    setActionSuccessNotification(null)

    const request = {
      permitNumber: resolvedPermitNumber,
      packageNumber: selectedBlanketOicPackageNumber,
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
      !request.packageNumber.trim() ||
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
    setActionFeedback(null)
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
        setActionFeedback({
          kind: 'success',
          message: result.message || 'Blanket OIC scale detail was added.',
        })
      } catch (refreshError) {
        console.error(refreshError)
        setPermitTablesErrorMessage(
          'The Blanket OIC scale detail was added, but permit tables could not be refreshed.',
        )
        setActionFeedback({
          kind: 'warning',
          message: `${result.message || 'Blanket OIC scale detail was added.'} Reload before adding another scale row.`,
        })
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
    boicScaleCodeOptionsReady,
    canEditBlanketOicScaleRows,
    detail?.oicApplicationNumber,
    detail?.permitNumber,
    blanketOicScaleActionsDisabled,
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
      setActionFeedback(null)
      setActionSuccessNotification(null)
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
          setActionFeedback({
            kind: 'success',
            message: result.message || 'Blanket OIC scale detail was removed.',
          })
        } catch (refreshError) {
          console.error(refreshError)
          setPermitTablesErrorMessage(
            'The Blanket OIC scale was removed, but permit tables could not be refreshed. Reload the page.',
          )
          setActionFeedback({
            kind: 'warning',
            message: `${result.message || 'Blanket OIC scale detail was removed.'} Reload before changing scale rows again.`,
          })
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

    const isCurrentDocumentsRequest = beginPermitDocumentsRequest()
    const isCurrentInvoicesRequest = beginPermitInvoicesRequest()
    deferredPermitTabLoadsRef.current.delete('documents')
    deferredPermitTabLoadsRef.current.delete('invoices')
    setDeferredPermitTabLoading((current) => ({
      ...current,
      documents: false,
      invoices: false,
    }))
    const [documentsResult, invoicesResult] = await Promise.allSettled([
      fetchPermitDocuments(resolvedPermitNumber),
      fetchPermitInvoices(resolvedPermitNumber),
    ])
    if (documentsResult.status === 'fulfilled' && isCurrentDocumentsRequest()) {
      setDocumentRows(documentsResult.value.rows)
      loadedDeferredPermitTabsRef.current.add('documents')
      setDeferredPermitTabLoaded((current) => ({ ...current, documents: true }))
      setDocumentsErrorMessage('')
    } else if (documentsResult.status === 'rejected' && isCurrentDocumentsRequest()) {
      setDocumentsErrorMessage('Unable to retrieve permit documents.')
    }
    if (invoicesResult.status === 'fulfilled' && isCurrentInvoicesRequest()) {
      setInvoiceRows(invoicesResult.value.rows)
      loadedDeferredPermitTabsRef.current.add('invoices')
      setDeferredPermitTabLoaded((current) => ({ ...current, invoices: true }))
      setInvoicesErrorMessage('')
    } else if (invoicesResult.status === 'rejected' && isCurrentInvoicesRequest()) {
      setInvoicesErrorMessage('Unable to retrieve permit invoice details.')
    }
    if (documentsResult.status === 'rejected' && isCurrentDocumentsRequest()) {
      throw documentsResult.reason
    }
  }, [beginPermitDocumentsRequest, beginPermitInvoicesRequest, detail?.permitNumber, permitNumber])

  const onCancelPermitDocumentEditing = useCallback(() => {
    setPermitDocumentUploadDirty(false)
    setPermitDocumentUploadBusy(false)
    setPermitDocumentUploadResetKey((current) => current + 1)
    setActionErrorMessage('')
    setIsEditingPermitDocuments(false)
    if (usesReviewedPermitFlow) {
      // The Ministerial launcher remounts when the document editor closes.
      window.setTimeout(() => permitDocumentUploadLauncherRef.current?.focus())
    }
  }, [usesReviewedPermitFlow])

  const onCancelInvoiceDocumentEditing = useCallback(() => {
    setInvoiceDocumentUploadDirty(false)
    setInvoiceDocumentUploadBusy(false)
    setInvoiceDocumentUploadResetKey((current) => current + 1)
    setActionErrorMessage('')
    setIsEditingInvoiceDocuments(false)
  }, [])

  const onOpenDocument = useCallback(
    async (row: PermitDocumentRow, preview = false) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (!resolvedPermitNumber || !canPerform('/permitDetails')) {
        return
      }
      const isLatestRequest = isCurrentDocumentRouteRef.current
      let previewTarget: Window | null = null
      const closePendingPreview = () => {
        if (previewTarget && pendingDocumentPreviewsRef.current.delete(previewTarget)) {
          previewTarget.close()
        }
      }
      setActionErrorMessage('')
      setActionFeedback(null)
      setActionSuccessNotification(null)
      try {
        if (preview) {
          // Reserve the tab during the click so slow document reads cannot lose popup permission.
          previewTarget = window.open('about:blank', '_blank')
          if (previewTarget) {
            pendingDocumentPreviewsRef.current.add(previewTarget)
            previewTarget.opener = null
          }
        }
        const result = await openPermitDocument(row.id, row.name, resolvedPermitNumber)
        if (!isLatestRequest()) {
          closePendingPreview()
          return
        }
        if (preview) {
          openDocumentPreview(result.blob, result.filename, previewTarget)
        } else {
          triggerBrowserDownload(result.blob, result.filename)
        }
      } catch (error) {
        closePendingPreview()
        if (!isLatestRequest()) return
        console.error(error)
        setActionErrorMessage(
          preview ? 'Unable to open permit document.' : 'Unable to download permit document.',
        )
      } finally {
        if (previewTarget) pendingDocumentPreviewsRef.current.delete(previewTarget)
      }
    },
    [canPerform, detail?.permitNumber, permitNumber],
  )

  const onOpenPermitReport = useCallback(async () => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!resolvedPermitNumber || !canOpenPermitReport) {
      return
    }

    setActionErrorMessage('')
    setActionFeedback(null)
    setActionSuccessNotification(null)
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
      setActionSuccessNotification(null)
      const clientEmail = normalizeTrimmedText(approvalEmailAddress)
      if (type === 'approval' && !isValidEmail(clientEmail)) {
        setActionErrorMessage('Enter one valid applicant email address.')
        return false
      }
      setActionErrorMessage('')
      setActionFeedback(null)
      setIsSendingPermitEmail(true)
      try {
        const result =
          type === 'request'
            ? await sendPermitReviewRequestEmail(resolvedPermitNumber)
            : await sendPermitApprovalEmail(resolvedPermitNumber, clientEmail)
        if (result.success) {
          setActionFeedback({ kind: 'success', message: result.message || 'Permit email sent.' })
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
    clearActionNotifications()
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
  }, [
    clearActionNotifications,
    canSendPermitApproval,
    detail?.permitNumber,
    isSendingPermitEmail,
    permitNumber,
  ])

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
      setActionFeedback(null)
      setActionSuccessNotification(null)
      setDocumentSuccessMessage('')
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
          await refreshPermitDocuments()
          if (isLatestRequest()) {
            setDocumentSuccessMessage(`${row.name || 'Document'} was deleted.`)
          }
        } catch (refreshError) {
          if (isLatestRequest()) {
            console.error(refreshError)
            setDocumentsErrorMessage(
              'The document was deleted, but permit documents could not be refreshed. Reload the page.',
            )
            setActionFeedback({
              kind: 'warning',
              message: `${row.name || 'Document'} was deleted. Reload before changing documents again.`,
            })
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
      canDeleteInvoiceDocuments,
      canDeletePermitDocuments,
      detail?.permitNumber,
      permitNumber,
      refreshPermitDocuments,
    ],
  )

  const isPermitDirty =
    ministerialScaleSelectionDirty ||
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
    if (!permitDetailDirty && ministerialScaleSelectionDirty && !(await onSaveScaleSelection()))
      return false
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
    onSaveScaleSelection,
    ministerialScaleSelectionDirty,
    onSaveShipping,
    permitDetailDirty,
    permitDocumentUploadDirty,
    permitFeeOverrideDirty,
    permitShippingDirty,
  ])

  const onDiscardPermitChanges = useCallback(() => {
    if (detail) {
      setPermitForm(buildPermitDetailForm(detail))
      setAgentUsed(Boolean(detail.applicantClientNumber?.trim()))
    }
    setIsEditingPermitClients(false)
    setIsEditingPermit(false)
    setIsEditingShipping(false)
    setMinisterialScaleSelectionDraft(null)
    setTouchedPermitFields({})
    setShowPermitValidationErrors(false)
    setFeeOverrideForm(feeOverrideContext)
    setFeeOverrideFieldErrors({})
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
    required = false,
    helperText?: string,
  ) => (
    <TextInput
      id={`permit-${field}`}
      labelText={requiredLabel(labelText, required)}
      aria-required={required || undefined}
      helperText={helperText}
      value={permitForm?.[field] ?? ''}
      invalid={!!permitFieldError(field)}
      invalidText={permitFieldError(field)}
      onBlur={() => markPermitFieldTouched(field)}
      onChange={(event) => setPermitFormField(field, event.target.value)}
      disabled={isDisabled}
      maxLength={maxLength}
    />
  )

  const renderPermitClientEditor = (kind: PermitClientKind, isDisabled: boolean) => {
    const isOwner = kind === 'owner'
    const { clientNumber: clientNumberField, location: locationField } = permitClientFields(kind)
    const clientNumber = permitForm?.[clientNumberField] ?? ''
    const locationCode = permitForm?.[locationField] ?? ''
    const locations = isOwner ? ownerClientLocations : agentClientLocations
    const clientData = isOwner ? ownerEditClientData : agentEditClientData
    const isLoading = isOwner ? isOwnerClientLookupLoading : isAgentClientLookupLoading
    const errorMessage = isOwner ? ownerClientLookupError : agentClientLookupError
    const label = isOwner ? 'Applicant' : 'Agent'
    const reviewedClientDisplay = [clientData?.companyName, clientNumber]
      .filter(Boolean)
      .join(' · ')
    const reviewedAddressFields = [
      ['Address', clientData?.address],
      ['City', clientData?.city],
      ['Province', clientData?.province],
      ['Country', clientData?.country],
      ['Postal code', clientData?.postalCode],
    ]
    const reviewedContactFields = [
      ['Phone number', clientData?.phone],
      ['Fax number', clientData?.fax],
      ['Email address', clientData?.email],
    ]

    return (
      <>
        <div className="legacy-search-grid">
          {usesReviewedPermitFlow ? (
            <dl className="detail-field-grid permit-client-editor__identity">
              <div className="detail-field-item detail-field-item--full">
                <dt className="detail-field-label">Client</dt>
                <dd className="detail-field-value">
                  {isLoading ? 'Loading…' : displayValue(reviewedClientDisplay)}
                </dd>
              </div>
            </dl>
          ) : (
            <ForestClientComboBox
              id={`permit-${clientNumberField}`}
              labelText={requiredLabel(`${label} client number`)}
              value={clientNumber}
              selectedClientName={clientData?.companyName}
              counterpartyClientNumber={
                isOwner
                  ? (permitForm?.agentClientNumber ?? '')
                  : (permitForm?.ownerClientNumber ?? '')
              }
              required
              disabled={isDisabled}
              onChange={(selectedClientNumber) => {
                setPermitClientNumber(kind, selectedClientNumber)
                if (selectedClientNumber) {
                  void loadPermitClientLocations(kind, selectedClientNumber, '')
                }
              }}
            />
          )}
          <Select
            id={`permit-${locationField}`}
            labelText={requiredLabel(usesReviewedPermitFlow ? 'Location' : `${label} location`)}
            aria-label={`${label} location`}
            aria-required="true"
            value={locationCode}
            disabled={
              isDisabled ||
              isLoading ||
              !clientNumber.trim() ||
              !locations.some(isSelectableClientLocation)
            }
            onChange={(event) => setPermitClientLocation(kind, event.target.value)}
          >
            <SelectItem
              value=""
              text={isLoading ? 'Loading locations' : `Select ${label.toLowerCase()} location`}
            />
            {locations.filter(isSelectableClientLocation).map((clientLocation) => (
              <SelectItem
                key={clientLocation.locationCode}
                value={clientLocation.locationCode}
                text={clientLocationLabel(clientLocation.locationCode, clientLocation.locationName)}
              />
            ))}
          </Select>
        </div>
        {usesReviewedPermitFlow ? (
          <>
            <dl className="detail-field-grid permit-client-editor__address-fields">
              {reviewedAddressFields.map(([fieldLabel, value]) => (
                <div key={fieldLabel} className="detail-field-item">
                  <dt className="detail-field-label">{fieldLabel}</dt>
                  <dd className="detail-field-value">
                    {isLoading ? 'Loading…' : displayValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
            <dl className="detail-field-grid permit-client-editor__contact-fields">
              {reviewedContactFields.map(([fieldLabel, value]) => (
                <div key={fieldLabel} className="detail-field-item">
                  <dt className="detail-field-label">{fieldLabel}</dt>
                  <dd className="detail-field-value">
                    {isLoading ? 'Loading…' : displayValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
            {errorMessage && (
              <InlineNotification
                className="detail-context-notification"
                kind="warning"
                lowContrast
                hideCloseButton
                title="Client details unavailable"
                subtitle={errorMessage}
              />
            )}
          </>
        ) : (
          <PermitClientTile
            title={`${label} contact details`}
            clientNumber={clientNumber || null}
            locationCode={locationCode || null}
            clientData={clientData}
            isLoading={isLoading}
            errorMessage={errorMessage}
          />
        )}
      </>
    )
  }

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
      enableCounter={usesReviewedPermitFlow && field === 'permitRemarks'}
      maxCount={maxCount}
      maxLength={usesReviewedPermitFlow ? maxCount : undefined}
    />
  )

  const detailMatchesRoute =
    !!detail && !!permitNumber && String(detail.permitNumber) === permitNumber
  const isRefreshingDetail = loading && detailMatchesRoute
  const isLoadingPermitExemptionContext =
    detailMatchesRoute && isPermitTablesLoading && !permitExemptionContextReady
  const permitDisplayNumber = formatPermitNumber(
    detailMatchesRoute ? detail?.permitNumber : permitNumber,
    detailMatchesRoute ? (detail?.permitStatusCode ?? detail?.permitStatusDescription) : null,
  )
  const isMinisterialPermitEdit = ministerialPermit && isEditingPermit && !!permitForm
  const isReviewedPermitEdit = usesReviewedPermitFlow && isEditingPermit && !!permitForm

  const renderFederalPermitNotice = () => (
    <Tile className="detail-federal-permit-notice">
      <p>
        If this provincial permit requires a federal permit, apply through the{' '}
        <a
          href="https://www.nexcol-nceel.canada.ca/en/Home-Accueil"
          target="_blank"
          rel="noopener noreferrer"
        >
          New Export Controls Online System (New EXCOL)
        </a>
        .
      </p>
    </Tile>
  )

  const renderMinisterialPermitApplications = () => {
    const isUpdatingPermitApplications =
      isSavingPermitApplication || isRemovingPermitApplication !== null
    if (isPermitTablesLoading || isLoadingAvailableApplications) {
      return <InlineLoading description="Loading permit applications…" />
    }
    if (availablePermitApplicationsError) {
      return (
        <EmptyState
          title="Applications unavailable"
          description={availablePermitApplicationsError}
          headingLevel={3}
          role="alert"
          action={
            canEditPermitApplications ? (
              <Button
                kind="tertiary"
                size="sm"
                onClick={() => void reloadAvailablePermitApplications()}
              >
                Retry
              </Button>
            ) : undefined
          }
        />
      )
    }
    if (permitTablesErrorMessage) {
      return (
        <EmptyState
          title="Applications unavailable"
          description={permitTablesErrorMessage}
          headingLevel={3}
          role="alert"
        />
      )
    }

    return (
      <>
        <p className="ministerial-permit-details__application-help">
          Select applications, then choose Add application to include them in this permit. Save does
          not add selected applications.
        </p>
        {ministerialAvailablePermitApplicationItems.length > 0 ? (
          <TableFrame ariaLabel="Applications available for this permit">
            <Table size="md" useZebraStyles>
              <TableHead>
                <TableRow>
                  <TableHeader>Include in permit</TableHeader>
                  <TableHeader>Application number</TableHeader>
                  <TableHeader>Pieces</TableHeader>
                  <TableHeader>Volume (m³)</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {ministerialAvailablePermitApplicationItems.map((item) => {
                  const disabled =
                    item.disabled || !canEditPermitApplications || isUpdatingPermitApplications
                  const disabledDescription = item.disabled
                    ? item.disabledReason
                    : !canEditPermitApplications
                      ? 'You do not have permission to add applications to this permit.'
                      : isUpdatingPermitApplications
                        ? 'Wait for the application update to finish.'
                        : undefined
                  return (
                    <TableRow key={item.applicationNumber}>
                      <TableCell>
                        <DisabledButtonTooltip
                          disabled={disabled}
                          description={disabledDescription}
                        >
                          <Checkbox
                            id={`permit-application-${item.applicationNumber}`}
                            hideLabel
                            labelText={`Include application ${item.applicationNumber} in permit`}
                            checked={ministerialPermitApplicationsToAdd.includes(
                              item.applicationNumber,
                            )}
                            disabled={disabled}
                            onChange={(_, { checked }) =>
                              setMinisterialPermitApplicationsToAdd((current) =>
                                checked
                                  ? Array.from(new Set([...current, item.applicationNumber]))
                                  : current.filter(
                                      (applicationNumber) =>
                                        applicationNumber !== item.applicationNumber,
                                    ),
                              )
                            }
                          />
                        </DisabledButtonTooltip>
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/provincial/application/${encodeURIComponent(item.applicationNumber)}`}
                          state={withDetailReturnTo(
                            location.state,
                            {
                              label: 'Provincial permit detail',
                              to: locationPath(location),
                            },
                            detailReturnTo,
                          )}
                        >
                          {item.applicationNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{item.unassignedPieces?.toLocaleString() ?? '—'}</TableCell>
                      <TableCell>{item.unassignedVolume?.toLocaleString() ?? '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableFrame>
        ) : (
          <EmptyState
            title="No applications available"
            description="No applications are available to include in this permit."
            headingLevel={3}
          />
        )}
        {canEditPermitApplications && (
          <div className="legacy-search-actions">
            <DisabledButtonTooltip
              disabled={
                isUpdatingPermitApplications || ministerialPermitApplicationsToAdd.length === 0
              }
              description={
                isUpdatingPermitApplications
                  ? 'Wait for the application update to finish.'
                  : 'Select at least one eligible application to include.'
              }
            >
              <Button
                kind="primary"
                size="sm"
                disabled={
                  isUpdatingPermitApplications || ministerialPermitApplicationsToAdd.length === 0
                }
                renderIcon={isUpdatingPermitApplications ? PendingIcon : undefined}
                onClick={() => void onAddPermitApplication()}
              >
                {isSavingPermitApplication
                  ? 'Adding…'
                  : isRemovingPermitApplication
                    ? 'Updating…'
                    : 'Add application'}
              </Button>
            </DisabledButtonTooltip>
          </div>
        )}
        {associatedPermitApplications.length > 0 && (
          <>
            <h3 className="detail-tile-title">Included applications</h3>
            <TableFrame ariaLabel="Included permit applications">
              <Table size="md" useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Application number</TableHeader>
                    {canEditPermitApplications && <TableHeader>Actions</TableHeader>}
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
                            disabled={isUpdatingPermitApplications}
                            renderIcon={TrashCan}
                            onClick={() => {
                              clearActionNotifications()
                              setPermitApplicationPendingRemoval(applicationNumber)
                            }}
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
          </>
        )}
      </>
    )
  }

  const permitVolumeAndRemarksFields = detail
    ? [
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
          label: 'Current permit volume (m³)',
          value: displayValue(detail.permitVolume),
        },
        {
          label: 'Current permit pieces',
          value: displayValue(detail.numberOfPieces),
        },
        { label: 'Remarks', value: displayValue(detail.remarks) },
      ]
    : []

  const renderPermitVolumeAndRemarks = () => {
    if (!detail) return null
    if (usesReviewedPermitFlow && detail.blanketOic) {
      return (
        <>
          <div className="legacy-search-grid">
            {renderPermitTextInput(
              'oicPermitTotalPieces',
              'Permit Request Pieces',
              invoiceMaterialLocked,
              undefined,
              requiresOicRequestLimits,
            )}
            {renderPermitTextInput(
              'oicPermitTotalVolume',
              'Permit Request Volume (m³)',
              invoiceMaterialLocked,
              undefined,
              requiresOicRequestLimits,
            )}
          </div>
          <dl className="boic-permit-details__totals">
            {[
              ['Current permit pieces', detail.numberOfPieces],
              ['Current permit volume (m³)', detail.permitVolume],
            ].map(([label, value]) => (
              <div key={label} className="detail-field-item">
                <dt className="detail-field-label">{label}</dt>
                <dd className="detail-field-value">{displayValue(value)}</dd>
              </div>
            ))}
          </dl>
          <div className="boic-permit-details__remarks">
            {renderPermitTextArea(
              'permitRemarks',
              'Remarks',
              false,
              MAX_REVIEWED_PERMIT_REMARKS_LENGTH,
            )}
          </div>
        </>
      )
    }
    return (
      <>
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
              undefined,
              requiresOicRequestLimits,
            )}
          {detail.blanketOic &&
            renderPermitTextInput(
              'oicPermitTotalVolume',
              'Permit Request Volume (m³)',
              invoiceMaterialLocked,
              undefined,
              requiresOicRequestLimits,
            )}
          {renderPermitTextInput('permitTotalVolume', 'Current permit volume (m³)', true)}
          {renderPermitTextInput('permitNumberOfPieces', 'Current permit pieces', true)}
        </div>
        <div className="legacy-search-grid">
          {renderPermitTextArea(
            'permitRemarks',
            'Remarks',
            false,
            usesReviewedPermitFlow ? MAX_REVIEWED_PERMIT_REMARKS_LENGTH : 254,
          )}
        </div>
      </>
    )
  }

  const renderPermitFeeSummary = () => {
    if (!detail) return null
    const showReviewedPermitFeeSummary = usesReviewedPermitFlow && !isEditingPermit
    return (
      <fieldset className="legacy-form-fieldset">
        <legend className={showReviewedPermitFeeSummary ? 'cds--visually-hidden' : undefined}>
          Permit fee summary
        </legend>
        {showReviewedPermitFeeSummary ? (
          <dl className="detail-field-grid ministerial-package-summary">
            {[
              [
                'Total volume (m³)',
                feeSummaryStatus ??
                  totalFeeVolume?.toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }) ??
                  'Unavailable',
              ],
              [
                'Total fees (CAD)',
                feeSummaryStatus ??
                  (!feeOverrideContext
                    ? editContextLoadFailed
                      ? 'Unavailable'
                      : 'Loading…'
                    : feeOverrideContext.overrideEnabled
                      ? `$${formatAmount(Number(feeOverrideContext.overrideFee))}`
                      : permitFeesMasked
                        ? '$'
                        : `$${formatAmount(calculatedPermitFee)}`),
              ],
              [
                'Override fees?',
                !feeOverrideContext
                  ? editContextLoadFailed
                    ? 'Unavailable'
                    : 'Loading…'
                  : feeOverrideContext.overrideEnabled
                    ? 'Yes'
                    : 'No',
              ],
            ]
              .filter(([label]) => !isEditingFeeOverride || label !== 'Override fees?')
              .map(([label, value]) => (
                <div key={label} className="detail-field-item">
                  <dt className="detail-field-label">{label}</dt>
                  <dd className="detail-field-value">{value}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <div className="legacy-search-grid">
            {isEditingPermit && permitForm ? (
              renderPermitTextInput(
                'permitReceiptNo',
                'Receipt number',
                invoiceMaterialLocked && !canEnterPaymentReceipt,
                50,
              )
            ) : (
              <TextInput
                id="permitFeeReceiptNumber"
                labelText="Receipt number"
                value={displayValue(detail.receiptNumber)}
                disabled
              />
            )}
            <TextInput
              id="permitFeeTotalVolume"
              labelText="Total volume (m³)"
              value={
                feeSummaryStatus ??
                totalFeeVolume?.toLocaleString(undefined, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                }) ??
                'Unavailable'
              }
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
        )}
        {showPaymentPendingReceiptGuidance && (
          <p id="permit-fee-receipt-help">
            Enter a receipt number here, then select Completed on the Permit tab before saving.
          </p>
        )}
        {showReviewedPermitFeeSummary
          ? null
          : canSavePermit && (
              <div className="legacy-search-actions">
                {isEditingPermit ? (
                  <>
                    <Button
                      kind="tertiary"
                      size="sm"
                      disabled={isSavingPermit}
                      onClick={() => {
                        resetPermitFormSection(false)
                        setIsEditingPermitClients(false)
                        setIsEditingPermit(false)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      kind="primary"
                      size="sm"
                      disabled={
                        isSavingPermit ||
                        isPermitOptionsLoading ||
                        permitOptionsUnavailable ||
                        blanketOicRegionSelectionUnavailable ||
                        requiredPermitOptionsMissing ||
                        paymentPendingReceiptRequiresCompletion ||
                        !permitClientLookupCanSave
                      }
                      renderIcon={isSavingPermit ? PendingIcon : undefined}
                      onClick={() => void onSavePermit()}
                    >
                      {isSavingPermit
                        ? 'Saving…'
                        : usesReviewedPermitFlow
                          ? 'Save changes'
                          : 'Save permit'}
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
                    {usesReviewedPermitFlow ? 'Edit fee details' : 'Edit permit'}
                  </Button>
                )}
              </div>
            )}

        {(!showReviewedPermitFeeSummary || isEditingFeeOverride || !feeOverrideContext) &&
          (!feeOverrideContext || !feeOverrideForm ? (
            <p>
              {editContextLoadFailed
                ? 'Fee override details are unavailable. No override changes can be saved.'
                : 'Loading fee override details…'}
            </p>
          ) : isEditingFeeOverride ? (
            <>
              <RadioButtonGroup
                legendText="Override fees?"
                name="permit-override-enabled"
                valueSelected={feeOverrideForm.overrideEnabled ? 'true' : 'false'}
                disabled={isSavingFeeOverride}
                onChange={(value) => {
                  setFeeOverrideFieldErrors({})
                  setFeeOverrideForm((current) =>
                    current ? { ...current, overrideEnabled: value === 'true' } : current,
                  )
                }}
              >
                <RadioButton id="permitOverrideEnabledNo" labelText="No" value="false" />
                <RadioButton id="permitOverrideEnabledYes" labelText="Yes" value="true" />
              </RadioButtonGroup>
              {feeOverrideForm.overrideEnabled && (
                <div className="legacy-search-grid">
                  <TextInput
                    id="permitOverrideFee"
                    labelText={requiredLabel('Override fee (CAD)')}
                    aria-required="true"
                    value={feeOverrideForm.overrideFee}
                    invalid={!!feeOverrideFieldErrors.overrideFee}
                    invalidText={feeOverrideFieldErrors.overrideFee}
                    disabled={isSavingFeeOverride}
                    onChange={(event) => {
                      setFeeOverrideFieldErrors((current) => ({
                        ...current,
                        overrideFee: undefined,
                      }))
                      setFeeOverrideForm((current) =>
                        current ? { ...current, overrideFee: event.target.value } : current,
                      )
                    }}
                  />
                  <TextArea
                    id="permitOverrideComment"
                    labelText="Override comment"
                    maxCount={MAX_PERMIT_OVERRIDE_COMMENT_LENGTH}
                    value={feeOverrideForm.overrideComment}
                    invalid={!!feeOverrideFieldErrors.overrideComment}
                    invalidText={feeOverrideFieldErrors.overrideComment}
                    disabled={isSavingFeeOverride}
                    onChange={(event) => {
                      setFeeOverrideFieldErrors((current) => ({
                        ...current,
                        overrideComment: undefined,
                      }))
                      setFeeOverrideForm((current) =>
                        current ? { ...current, overrideComment: event.target.value } : current,
                      )
                    }}
                  />
                </div>
              )}
              <div className="legacy-search-actions">
                <Button
                  kind="tertiary"
                  size="sm"
                  disabled={isSavingFeeOverride}
                  onClick={() => {
                    setFeeOverrideForm(feeOverrideContext)
                    setFeeOverrideFieldErrors({})
                    setIsEditingFeeOverride(false)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  kind="primary"
                  size="sm"
                  disabled={isSavingFeeOverride}
                  renderIcon={isSavingFeeOverride ? PendingIcon : undefined}
                  onClick={() => void onSaveFeeOverride()}
                >
                  {isSavingFeeOverride
                    ? 'Saving…'
                    : usesReviewedPermitFlow
                      ? 'Save changes'
                      : 'Save fee override'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="legacy-search-grid">
                <RadioButtonGroup
                  legendText="Override fees?"
                  name="permit-override-enabled-view"
                  valueSelected={feeOverrideContext.overrideEnabled ? 'true' : 'false'}
                  disabled
                >
                  <RadioButton id="permitOverrideEnabledViewNo" labelText="No" value="false" />
                  <RadioButton id="permitOverrideEnabledViewYes" labelText="Yes" value="true" />
                </RadioButtonGroup>
                {feeOverrideContext.overrideEnabled && (
                  <>
                    <TextInput
                      id="permitOverrideFeeDisplay"
                      labelText="Override fee (CAD)"
                      value={feeOverrideContext.overrideFee}
                      disabled
                    />
                    <TextArea
                      id="permitOverrideCommentDisplay"
                      labelText="Override comment"
                      value={feeOverrideContext.overrideComment}
                      disabled
                    />
                  </>
                )}
              </div>
              {!usesReviewedPermitFlow && canEditFeeOverride && (
                <div className="legacy-search-actions">
                  <Button
                    kind="tertiary"
                    size="sm"
                    onClick={() => {
                      setFeeOverrideFieldErrors({})
                      setIsEditingFeeOverride(true)
                    }}
                  >
                    Edit fee override
                  </Button>
                </div>
              )}
            </>
          ))}
      </fieldset>
    )
  }

  const renderScaleSummary = () => {
    if (!detail) return null
    return (
      <fieldset
        className="legacy-form-fieldset"
        hidden={
          blanketOicPackageCreationRequired ||
          ministerialScaleEmpty ||
          (ministerialPermit && isPermitTablesLoading)
        }
      >
        <legend>Summary of scale</legend>
        {ministerialPermit &&
          canEditNormalPermitScaleRows &&
          ministerialScaleSelectionDraft === null &&
          packageScopedItems.length > 0 && (
            <div className="legacy-search-actions">
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Edit}
                onClick={() => setMinisterialScaleSelectionDraft({})}
              >
                Edit scale selection
              </Button>
            </div>
          )}
        {detail.blanketOic && selectedBlanketOicPackage && (
          <dl className="boic-permit-details__totals">
            <div className="detail-field-item">
              <dt className="detail-field-label">Current package volume (m³)</dt>
              <dd className="detail-field-value">
                {selectedBlanketOicPackage.currentPackageVolume ||
                  (
                    selectedPermitScaleTotalsByPackage.get(selectedBlanketOicPackage.packageNumber)
                      ?.volume ?? 0
                  ).toLocaleString()}
              </dd>
            </div>
            <div className="detail-field-item">
              <dt className="detail-field-label">Current package pieces</dt>
              <dd className="detail-field-value">
                {(
                  selectedPermitScaleTotalsByPackage.get(selectedBlanketOicPackage.packageNumber)
                    ?.pieces ?? 0
                ).toLocaleString()}
              </dd>
            </div>
          </dl>
        )}
        {canEditBlanketOicScaleRows && (
          <>
            <div className="legacy-search-grid">
              <TextInput
                id="boicScaleTimberMark"
                labelText={requiredLabel('Timber mark')}
                aria-required="true"
                value={boicScaleForm.timberMark}
                onChange={(event) => setBlanketOicScaleFormField('timberMark', event.target.value)}
                disabled={blanketOicScaleActionsDisabled}
              />
              <BlanketOicScaleCodeFields
                region={String(detail.orgUnitNumber ?? '')}
                value={boicScaleForm}
                onChange={setBlanketOicScaleFormField}
                disabled={blanketOicScaleActionsDisabled}
                onAvailabilityChange={setBoicScaleCodeOptionsReady}
              />
              <TextInput
                id="boicScalePieces"
                labelText={requiredLabel('Pieces')}
                aria-required="true"
                value={boicScaleForm.scalePieces}
                onChange={(event) => setBlanketOicScaleFormField('scalePieces', event.target.value)}
                disabled={blanketOicScaleActionsDisabled}
              />
              <TextInput
                id="boicScaleVolume"
                labelText={requiredLabel('Volume (m³)')}
                aria-required="true"
                value={boicScaleForm.scaleVolume}
                onChange={(event) => setBlanketOicScaleFormField('scaleVolume', event.target.value)}
                disabled={blanketOicScaleActionsDisabled}
              />
            </div>
            <div className="legacy-search-actions">
              <Button
                kind="primary"
                size="sm"
                disabled={
                  blanketOicScaleActionsDisabled ||
                  !boicScaleCodeOptionsReady ||
                  !detail.oicApplicationNumber ||
                  blanketOicPackageOptions.length === 0
                }
                renderIcon={isSavingBoicScale ? PendingIcon : undefined}
                onClick={() => void onAddBlanketOicScale()}
              >
                {isSavingBoicScale ? 'Adding scale…' : 'Add scale'}
              </Button>
              {blanketOicScaleDirty && (
                <Button
                  kind="tertiary"
                  size="sm"
                  disabled={isSavingBoicScale}
                  onClick={() => setBoicScaleForm(boicScaleBaselineForm)}
                >
                  Cancel scale
                </Button>
              )}
            </div>
          </>
        )}
        {!permitTablesErrorMessage &&
          !ministerialScaleEmpty &&
          (packageScopedItems.length > 0 ? (
            <TableFrame ariaLabel={usesReviewedPermitFlow ? 'Scale rows' : 'Permit item rows'}>
              <Table size="md" useZebraStyles>
                <TableHead>
                  <TableRow>
                    {canDisplayNormalPermitScaleMembership && (
                      <TableHeader>Include in permit</TableHeader>
                    )}
                    <TableHeader>Timber mark</TableHeader>
                    <TableHeader>Scale type</TableHeader>
                    {canDisplayNormalPermitScaleMembership && <TableHeader>Permit</TableHeader>}
                    {canDisplayNormalPermitScaleMembership && !ministerialPermit && (
                      <TableHeader>Package</TableHeader>
                    )}
                    <TableHeader>Pieces</TableHeader>
                    <TableHeader>Species</TableHeader>
                    <TableHeader>Grade</TableHeader>
                    <TableHeader>Volume (m³)</TableHeader>
                    {canEditBlanketOicScaleRows && <TableHeader>Actions</TableHeader>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {packageScopedItems.map((row) => (
                    <TableRow key={row.id}>
                      {canDisplayNormalPermitScaleMembership && (
                        <TableCell>
                          <Checkbox
                            id={`permit-scale-${row.id}`}
                            labelText={`Include scale ${row.id} in permit`}
                            hideLabel
                            checked={
                              ministerialScaleSelectionDraft?.[row.id] ?? row.includedInPermit
                            }
                            disabled={
                              !canEditNormalPermitScaleRows ||
                              isUpdatingScaleId !== null ||
                              isSavingScaleSelection ||
                              (ministerialPermit && ministerialScaleSelectionDraft === null)
                            }
                            onChange={(_, { checked }) => {
                              if (ministerialPermit) {
                                setMinisterialScaleSelectionDraft((current) =>
                                  current === null
                                    ? null
                                    : {
                                        ...current,
                                        [row.id]: Boolean(checked),
                                      },
                                )
                              } else {
                                void onToggleScaleAttachment(row.id, Boolean(checked))
                              }
                            }}
                          />
                        </TableCell>
                      )}
                      <TableCell>{row.timberMark || '-'}</TableCell>
                      <TableCell>{row.scaleType || '-'}</TableCell>
                      {canDisplayNormalPermitScaleMembership && (
                        <TableCell>{row.permitNumber || '-'}</TableCell>
                      )}
                      {canDisplayNormalPermitScaleMembership && !ministerialPermit && (
                        <TableCell>{row.packageNumber || '-'}</TableCell>
                      )}
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
                              disabled={blanketOicScaleActionsDisabled}
                              renderIcon={TrashCan}
                              onClick={() => {
                                clearActionNotifications()
                                setBoicScalePendingRemoval(row)
                              }}
                            >
                              {isDeletingBoicScaleId === row.id ? 'Removing…' : 'Remove'}
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
              title={usesReviewedPermitFlow ? 'No scale yet' : 'No permit items available'}
              description={
                ministerialPermit ? (
                  <>
                    Scale comes from the applications selected for this permit. Select an
                    application on the{' '}
                    <button
                      type="button"
                      className="cds--link"
                      onClick={() => selectPermitTab('permit')}
                    >
                      Permit tab
                    </button>
                    .
                  </>
                ) : detail.blanketOic ? (
                  'No scale entries are available for the selected package.'
                ) : (
                  'No permit item rows are available for this permit.'
                )
              }
              headingLevel={3}
            />
          ))}
        {ministerialPermit && ministerialScaleSelectionDraft !== null && (
          <div className="legacy-search-actions">
            <Button
              kind="tertiary"
              size="sm"
              disabled={isSavingScaleSelection}
              onClick={() => setMinisterialScaleSelectionDraft(null)}
            >
              Cancel
            </Button>
            <Button
              kind="primary"
              size="sm"
              disabled={isSavingScaleSelection || !canEditNormalPermitScaleRows}
              renderIcon={isSavingScaleSelection ? PendingIcon : undefined}
              onClick={() => void onSaveScaleSelection()}
            >
              {isSavingScaleSelection ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        )}
      </fieldset>
    )
  }

  const renderPackageFees = () => {
    if (!detail) return null
    const selectedPackageNumber = ministerialPermit
      ? selectedMinisterialPackageNumber
      : detail.blanketOic
        ? selectedBlanketOicPackageNumber
        : ''
    const displayedFeeRows = selectedPackageNumber
      ? permitFeeRows.filter((row) => row.packageNumber === selectedPackageNumber)
      : permitFeeRows
    const showDisplayedMinistryFeeColumn = ministerialPermit
      ? displayedFeeRows.some((row) => row.ministryUser)
      : showMinistryFeeColumn
    return (
      <>
        {(ministerialPermit || detail.blanketOic) &&
          feeSummaryStatus === null &&
          (ministerialPermit ? ministerialPackageOptions : blanketOicPackageOptions).length > 0 &&
          (ministerialPermit ? selectedMinisterialPackage : selectedBlanketOicPackage) && (
            <>
              <div className="legacy-search-grid">
                <SearchableSelect
                  id={ministerialPermit ? 'ministerialFeesPackageNumber' : 'boicFeesPackageNumber'}
                  labelText="Package number"
                  value={selectedPackageNumber}
                  options={ministerialPermit ? ministerialPackageOptions : blanketOicPackageOptions}
                  placeholder="Select package"
                  disabled={
                    ministerialPermit
                      ? ministerialScaleSelectionDraft !== null
                      : detail.blanketOic
                        ? blanketOicPackageActionsDisabled
                        : undefined
                  }
                  onChange={
                    ministerialPermit
                      ? setSelectedMinisterialPackageNumberState
                      : setSelectedBlanketOicPackageNumberState
                  }
                />
              </div>
              <dl className="detail-field-grid ministerial-package-summary">
                <div className="detail-field-item">
                  <dt className="detail-field-label">Age class</dt>
                  <dd className="detail-field-value">
                    {(ministerialPermit ? selectedMinisterialPackage : selectedBlanketOicPackage)
                      ?.ageClass || '—'}
                  </dd>
                </div>
                <div className="detail-field-item">
                  <dt className="detail-field-label">Exemption number</dt>
                  <dd className="detail-field-value">
                    {detail.exemptionNumber ? (
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
                      '—'
                    )}
                  </dd>
                </div>
                <div className="detail-field-item">
                  <dt className="detail-field-label">Package fee (CAD)</dt>
                  <dd className="detail-field-value">
                    {(ministerialPermit
                      ? selectedMinisterialPackageFeeSummary
                      : selectedBlanketOicPackageFeeSummary
                    )?.totalFeeForPackage ?? 'Unavailable'}
                  </dd>
                </div>
              </dl>
            </>
          )}
        {!ministerialPermit &&
          !detail.blanketOic &&
          !ministerialFeeShellEmpty &&
          feeSummaryStatus === null &&
          !!tabsData?.packageFeeSummaries.length && (
            <>
              <h3 className="detail-tile-title">Package fee summary</h3>
              <TableFrame ariaLabel="Permit package fee summaries">
                <Table size="md" useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Package</TableHeader>
                      <TableHeader>Age class</TableHeader>
                      <TableHeader>Exemption number</TableHeader>
                      <TableHeader>Package fee (CAD)</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tabsData.packageFeeSummaries.map((summary) => (
                      <TableRow key={summary.packageNumber}>
                        <TableCell>
                          {summary.packageNumber
                            ? formatPackageNumberLabel(summary.packageNumber)
                            : '-'}
                        </TableCell>
                        <TableCell>{summary.growthType || '-'}</TableCell>
                        <TableCell>
                          {detail.exemptionNumber ? (
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
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{summary.totalFeeForPackage}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            </>
          )}
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
        ) : displayedFeeRows.length > 0 ? (
          <TableFrame ariaLabel="Permit fee rows">
            <Table size="md" useZebraStyles>
              <TableHead>
                <TableRow>
                  {!ministerialPermit && !detail.blanketOic && <TableHeader>Package</TableHeader>}
                  <TableHeader>Timber mark</TableHeader>
                  <TableHeader>Species</TableHeader>
                  <TableHeader>Grade</TableHeader>
                  <TableHeader>
                    {usesReviewedPermitFlow ? 'AMV ($/m³)' : 'AMV ($/m³ CAD)'}
                  </TableHeader>
                  <TableHeader>Volume (m³)</TableHeader>
                  {showDisplayedMinistryFeeColumn && (
                    <TableHeader>{usesReviewedPermitFlow ? 'EWB' : 'EWB$'}</TableHeader>
                  )}
                  <TableHeader>{usesReviewedPermitFlow ? 'FIL' : 'FIL%'}</TableHeader>
                  <TableHeader>{usesReviewedPermitFlow ? 'MF' : 'MF%'}</TableHeader>
                  <TableHeader>Fee (CAD)</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayedFeeRows.map((row) => (
                  <TableRow key={row.id}>
                    {!ministerialPermit && !detail.blanketOic && (
                      <TableCell>
                        {row.packageNumber ? formatPackageNumberLabel(row.packageNumber) : '-'}
                      </TableCell>
                    )}
                    <TableCell>{row.timberMark || '-'}</TableCell>
                    <TableCell>{row.species || '-'}</TableCell>
                    <TableCell>{row.grade || '-'}</TableCell>
                    <TableCell>{row.amv || '-'}</TableCell>
                    <TableCell>{row.volume.toLocaleString()}</TableCell>
                    {showDisplayedMinistryFeeColumn && <TableCell>{row.ewb || '-'}</TableCell>}
                    <TableCell>{row.filPercent || '-'}</TableCell>
                    <TableCell>{row.mfPercent || '-'}</TableCell>
                    <TableCell>
                      {row.amountDisplay.trim() === '$' ? '$' : `$${formatAmount(row.amount)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        ) : (
          <EmptyState
            title={ministerialFeeShellEmpty ? 'No fees yet' : 'No fee details available'}
            description={
              ministerialFeeShellEmpty ? (
                <>
                  Fees are calculated from the permit&apos;s Summary of Scale. They appear once an
                  application is selected on the{' '}
                  <button
                    type="button"
                    className="cds--link"
                    onClick={() => selectPermitTab('permit')}
                  >
                    Permit tab
                  </button>
                  .
                </>
              ) : (
                'No fee rows are available for this permit.'
              )
            }
            headingLevel={3}
          />
        )}
      </>
    )
  }

  return (
    <Grid
      id="permit-detail-content"
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
          subtitle={
            <>
              <span>Check and manage this provincial permit</span>
              {detailMatchesRoute && (
                <span className="permit-detail-header__author">
                  {' · Author: '}
                  {displayValue(detail.author)}
                </span>
              )}
            </>
          }
          status={
            detail && detailMatchesRoute ? (
              <StatusTag
                status={formatPermitStatus(detail.permitStatusCode, detail.permitStatusDescription)}
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

      {isLoadingPermitExemptionContext && (
        <Column
          sm={4}
          md={8}
          lg={16}
          className="detail-page-loading"
          role="status"
          aria-live="polite"
        >
          <Loading description="Loading permit details…" withOverlay={false} />
        </Column>
      )}

      {!loading && !!errorMessage && <DetailLoadError message={errorMessage} />}

      {detail && detailMatchesRoute && !isLoadingPermitExemptionContext && (
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
          {!!blanketOicRegionError && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                className="detail-context-notification"
                kind="warning"
                title="Blanket OIC region options unavailable"
                subtitle={blanketOicRegionError}
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
          {createdBlanketOicPermitNumber === permitNumber && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="success"
                title="Permit created"
                subtitle="The permit was saved."
                lowContrast
                onCloseButtonClick={() => setCreatedBlanketOicPermitNumber('')}
              />
            </Column>
          )}
          {!!actionFeedback && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind={actionFeedback.kind}
                title={
                  actionFeedback.kind === 'success' ? 'Action completed' : 'Action needs attention'
                }
                subtitle={actionFeedback.message}
                lowContrast
                onCloseButtonClick={() => setActionFeedback(null)}
              />
            </Column>
          )}

          {!!actionSuccessNotification && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="success"
                title={actionSuccessNotification.title}
                subtitle={actionSuccessNotification.subtitle}
                lowContrast
                onCloseButtonClick={() => setActionSuccessNotification(null)}
              />
            </Column>
          )}

          {!!documentSuccessMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="success"
                title="Document deleted"
                subtitle={documentSuccessMessage}
                lowContrast
                onCloseButtonClick={() => setDocumentSuccessMessage('')}
              />
            </Column>
          )}

          {!!actionErrorMessage && !permitApprovalEmailOpen && (
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

          {!!boicPackageErrorMessage && !blanketOicPackageEditorOpen && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                kind="error"
                title="Package needs attention"
                subtitle={boicPackageErrorMessage}
                lowContrast
                onCloseButtonClick={() => setBoicPackageErrorMessage('')}
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
                {permitDetailTabs.map(({ id, label, icon }) => (
                  <Tab key={id} renderIcon={icon}>
                    {label}
                  </Tab>
                ))}
              </TabList>
              <ContiguousTabPanels order={permitDetailTabs.map(({ id }) => id)}>
                <TabPanel key="permit" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    {!detail.blanketOic && !isMinisterialPermitEdit && (
                      <Column sm={4} md={8} lg={16}>
                        {renderFederalPermitNotice()}
                      </Column>
                    )}
                    <Column sm={4} md={8} lg={16}>
                      {isReviewedPermitEdit ? (
                        <Tile className="ministerial-permit-details">
                          <h2 className="detail-tile-title">
                            <Certificate size={24} aria-hidden="true" />
                            Permit details
                          </h2>
                          <div className="ministerial-permit-details__status">
                            <Select
                              id="permit-permitStatus"
                              labelText={requiredLabel('Status')}
                              aria-required="true"
                              value={permitForm?.permitStatus ?? ''}
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
                          </div>
                          <dl className="ministerial-permit-details__static-fields">
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Exemption number</dt>
                              <dd className="detail-field-value">
                                {displayValue(detail.exemptionNumber)}
                              </dd>
                            </div>
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Exemption type</dt>
                              <dd className="detail-field-value">
                                {displayValue(detail.exemptionTypeDescription)}
                              </dd>
                            </div>
                            {detail.blanketOic ? (
                              <div className="detail-field-item">
                                <dt className="cds--visually-hidden" aria-hidden="true">
                                  Region
                                </dt>
                                <dd className="detail-field-value">
                                  <Select
                                    id="permit-orgUnitNumber"
                                    labelText={requiredLabel('Region')}
                                    aria-required="true"
                                    value={permitForm.orgUnitNumber}
                                    invalid={!!permitFieldError('orgUnitNumber')}
                                    invalidText={permitFieldError('orgUnitNumber')}
                                    helperText={
                                      blanketOicRegionBoundToApplication
                                        ? 'Region cannot be changed after the first package is created.'
                                        : undefined
                                    }
                                    onBlur={() => markPermitFieldTouched('orgUnitNumber')}
                                    onChange={(event) =>
                                      setPermitFormField('orgUnitNumber', event.target.value)
                                    }
                                    disabled={
                                      invoiceMaterialLocked ||
                                      blanketOicRegionBoundToApplication ||
                                      isSavingBoicPackage ||
                                      isPermitOptionsLoading ||
                                      blanketOicRegionOptionsLoading ||
                                      !!blanketOicRegionError ||
                                      editablePermitRegionOptions.length === 0
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
                                </dd>
                              </div>
                            ) : (
                              <div className="detail-field-item">
                                <dt className="detail-field-label">Region</dt>
                                <dd className="detail-field-value">
                                  {displayValue(detail.region ?? detail.orgUnitNumber)}
                                </dd>
                              </div>
                            )}
                          </dl>
                          <div className="ministerial-permit-details__dates">
                            {renderPermitTextInput(
                              'permitSubmitDate',
                              'Submit date',
                              !canCorrectPermitSubmitDate,
                              undefined,
                              requiresCompletionSubmitDate && canCorrectPermitSubmitDate,
                            )}
                            {renderPermitTextInput(
                              'permitIssueDate',
                              'Issued date',
                              !canReviewPermits || invoiceMaterialLocked,
                              undefined,
                              requiresPermitCompletionDates &&
                                canReviewPermits &&
                                !invoiceMaterialLocked,
                            )}
                            {renderPermitTextInput(
                              'permitExpiryDate',
                              'Expiry date',
                              !canReviewPermits,
                              undefined,
                              requiresPermitCompletionDates && canReviewPermits,
                            )}
                          </div>
                          {detail.blanketOic ? (
                            renderPermitVolumeAndRemarks()
                          ) : (
                            <>
                              <dl className="ministerial-permit-details__totals">
                                <div className="detail-field-item">
                                  <dt className="detail-field-label">
                                    Total exemption volume (m³)
                                  </dt>
                                  <dd className="detail-field-value">
                                    {displayValue(detail.approvedExemptionVolume)}
                                  </dd>
                                </div>
                                <div className="detail-field-item">
                                  <dt className="detail-field-label">
                                    Total volume remaining (m³)
                                  </dt>
                                  <dd className="detail-field-value">
                                    {displayValue(detail.exemptionVolumeRemaining)}
                                  </dd>
                                </div>
                                <div className="detail-field-item">
                                  <dt className="detail-field-label">Current permit pieces</dt>
                                  <dd className="detail-field-value">
                                    {displayValue(detail.numberOfPieces)}
                                  </dd>
                                </div>
                                <div className="detail-field-item">
                                  <dt className="detail-field-label">Current permit volume (m³)</dt>
                                  <dd className="detail-field-value">
                                    {displayValue(detail.permitVolume)}
                                  </dd>
                                </div>
                              </dl>
                              <section className="ministerial-permit-details__applications">
                                <h3 className="detail-tile-title">Applications</h3>
                                {renderMinisterialPermitApplications()}
                              </section>
                              <div className="ministerial-permit-details__remarks">
                                {renderPermitTextArea(
                                  'permitRemarks',
                                  'Remarks',
                                  false,
                                  MAX_REVIEWED_PERMIT_REMARKS_LENGTH,
                                )}
                              </div>
                            </>
                          )}
                        </Tile>
                      ) : isEditingPermit && permitForm ? (
                        <Tile
                          className={detail.blanketOic ? 'boic-permit-details-edit' : undefined}
                        >
                          <h2 className="detail-tile-title">
                            {usesReviewedPermitFlow ? 'Permit details' : 'Permit summary'}
                          </h2>
                          {usesReviewedPermitFlow && (
                            <dl className="ministerial-permit-details__static-fields">
                              <div className="detail-field-item">
                                <dt className="detail-field-label">Exemption number</dt>
                                <dd className="detail-field-value">
                                  {displayValue(detail.exemptionNumber)}
                                </dd>
                              </div>
                              <div className="detail-field-item">
                                <dt className="detail-field-label">Exemption type</dt>
                                <dd className="detail-field-value">
                                  {displayValue(detail.exemptionTypeDescription)}
                                </dd>
                              </div>
                            </dl>
                          )}
                          <div className="legacy-search-grid">
                            {!usesReviewedPermitFlow && (
                              <>
                                {renderPermitTextInput(
                                  'permitNumber',
                                  'Permit number',
                                  true,
                                  undefined,
                                  true,
                                )}
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
                              </>
                            )}
                            {ministerialPermit && !usesReviewedPermitFlow && (
                              <TextInput
                                id="permit-exemptionType"
                                labelText="Exemption type"
                                value={displayValue(detail.exemptionTypeDescription)}
                                disabled
                              />
                            )}
                            <Select
                              id="permit-permitStatus"
                              labelText={requiredLabel(
                                usesReviewedPermitFlow ? 'Status' : 'Permit status',
                              )}
                              aria-required="true"
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
                              undefined,
                              requiresCompletionSubmitDate && canCorrectPermitSubmitDate,
                            )}
                            {renderPermitTextInput(
                              'permitIssueDate',
                              'Issued date',
                              !canReviewPermits || invoiceMaterialLocked,
                              undefined,
                              requiresPermitCompletionDates &&
                                canReviewPermits &&
                                !invoiceMaterialLocked,
                            )}
                            {renderPermitTextInput(
                              'permitExpiryDate',
                              'Expiry date',
                              !canReviewPermits,
                              undefined,
                              requiresPermitCompletionDates && canReviewPermits,
                            )}
                            {!usesReviewedPermitFlow &&
                              renderPermitTextInput('permitRequestDate', 'Received date', true)}
                            {detail.blanketOic ? (
                              <Select
                                id="permit-orgUnitNumber"
                                labelText={requiredLabel('Region')}
                                aria-required="true"
                                value={permitForm.orgUnitNumber}
                                invalid={!!permitFieldError('orgUnitNumber')}
                                invalidText={permitFieldError('orgUnitNumber')}
                                helperText={
                                  blanketOicRegionBoundToApplication
                                    ? 'Region cannot be changed after the first package is created.'
                                    : undefined
                                }
                                onBlur={() => markPermitFieldTouched('orgUnitNumber')}
                                onChange={(event) =>
                                  setPermitFormField('orgUnitNumber', event.target.value)
                                }
                                disabled={
                                  invoiceMaterialLocked ||
                                  blanketOicRegionBoundToApplication ||
                                  isSavingBoicPackage ||
                                  isPermitOptionsLoading ||
                                  blanketOicRegionOptionsLoading ||
                                  !!blanketOicRegionError ||
                                  editablePermitRegionOptions.length === 0
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
                                labelText={
                                  usesReviewedPermitFlow ? requiredLabel('Region') : 'Region'
                                }
                                value={displayValue(detail.region ?? detail.orgUnitNumber)}
                                disabled
                              />
                            )}
                          </div>
                          {detail.blanketOic && renderPermitVolumeAndRemarks()}
                        </Tile>
                      ) : ministerialPermit ? (
                        <Tile className="ministerial-permit-details">
                          <div className="detail-section-card__header">
                            <h2 className="detail-tile-title">
                              <Certificate size={24} aria-hidden="true" />
                              Permit details
                            </h2>
                            {canSavePermit && (
                              <Button
                                kind="tertiary"
                                size="sm"
                                renderIcon={Edit}
                                onClick={() => {
                                  resetPermitFormSection(false)
                                  setIsEditingPermit(true)
                                }}
                              >
                                Edit permit details
                              </Button>
                            )}
                          </div>
                          <dl className="ministerial-permit-details__status">
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Status</dt>
                              <dd className="detail-field-value">
                                <StatusTag
                                  status={formatPermitStatus(
                                    detail.permitStatusCode,
                                    detail.permitStatusDescription,
                                  )}
                                  fallbackLabel="Not provided"
                                />
                              </dd>
                            </div>
                          </dl>
                          <dl className="ministerial-permit-details__static-fields">
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Exemption number</dt>
                              <dd className="detail-field-value">
                                {detail.exemptionNumber ? (
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
                                )}
                              </dd>
                            </div>
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Exemption type</dt>
                              <dd className="detail-field-value">
                                {displayValue(detail.exemptionTypeDescription)}
                              </dd>
                            </div>
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Region</dt>
                              <dd className="detail-field-value">
                                {displayValue(detail.region ?? detail.orgUnitNumber)}
                              </dd>
                            </div>
                          </dl>
                          <dl className="ministerial-permit-details__dates">
                            {[
                              ['Submit date', detail.applicationDate],
                              ['Issued date', detail.issueDate],
                              ['Expiry date', detail.expiryDate],
                            ].map(([label, value]) => (
                              <div key={label} className="detail-field-item">
                                <dt className="detail-field-label">{label}</dt>
                                <dd className="detail-field-value">{displayValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                          <dl className="ministerial-permit-details__totals">
                            {[
                              ['Total exemption volume (m³)', detail.approvedExemptionVolume],
                              ['Total volume remaining (m³)', detail.exemptionVolumeRemaining],
                              ['Current permit pieces', detail.numberOfPieces],
                              ['Current permit volume (m³)', detail.permitVolume],
                            ].map(([label, value]) => (
                              <div key={label} className="detail-field-item">
                                <dt className="detail-field-label">{label}</dt>
                                <dd className="detail-field-value">{displayValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                          <section className="ministerial-permit-details__applications">
                            <h3 className="detail-tile-title">Applications</h3>
                            {renderMinisterialPermitApplications()}
                          </section>
                          <dl className="ministerial-permit-details__remarks detail-field-grid">
                            <div className="detail-field-item detail-field-item--full">
                              <dt className="detail-field-label">Remarks</dt>
                              <dd className="detail-field-value">{displayValue(detail.remarks)}</dd>
                            </div>
                          </dl>
                        </Tile>
                      ) : detail.blanketOic ? (
                        <Tile className="boic-permit-details">
                          <div className="detail-section-card__header">
                            <h2 className="detail-tile-title">
                              <Certificate size={24} aria-hidden="true" />
                              Permit details
                            </h2>
                            {canSavePermit && (
                              <Button
                                kind="tertiary"
                                size="sm"
                                renderIcon={Edit}
                                onClick={() => {
                                  resetPermitFormSection(false)
                                  setIsEditingPermit(true)
                                }}
                              >
                                Edit permit details
                              </Button>
                            )}
                          </div>
                          <dl className="boic-permit-details__status">
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Status</dt>
                              <dd className="detail-field-value">
                                <StatusTag
                                  status={formatPermitStatus(
                                    detail.permitStatusCode,
                                    detail.permitStatusDescription,
                                  )}
                                  fallbackLabel="Not provided"
                                />
                              </dd>
                            </div>
                          </dl>
                          <dl className="boic-permit-details__static-fields">
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Exemption number</dt>
                              <dd className="detail-field-value">
                                {detail.exemptionNumber ? (
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
                                )}
                              </dd>
                            </div>
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Exemption type</dt>
                              <dd className="detail-field-value">
                                {displayValue(detail.exemptionTypeDescription)}
                              </dd>
                            </div>
                            <div className="detail-field-item">
                              <dt className="detail-field-label">Region</dt>
                              <dd className="detail-field-value">
                                {displayValue(detail.region ?? detail.orgUnitNumber)}
                              </dd>
                            </div>
                          </dl>
                          <dl className="boic-permit-details__dates">
                            {[
                              ['Submit date', detail.applicationDate],
                              ['Issued date', detail.issueDate],
                              ['Expiry date', detail.expiryDate],
                            ].map(([label, value]) => (
                              <div key={label} className="detail-field-item">
                                <dt className="detail-field-label">{label}</dt>
                                <dd className="detail-field-value">{displayValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                          <dl className="boic-permit-details__totals">
                            {[
                              ['Total exemption volume (m³)', detail.approvedExemptionVolume],
                              ['Total volume remaining (m³)', detail.exemptionVolumeRemaining],
                              ['Current permit pieces', detail.numberOfPieces],
                              ['Current permit volume (m³)', detail.permitVolume],
                            ].map(([label, value]) => (
                              <div key={label} className="detail-field-item">
                                <dt className="detail-field-label">{label}</dt>
                                <dd className="detail-field-value">{displayValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                          <dl className="boic-permit-details__request-totals">
                            {[
                              ['Permit Request Pieces', detail.oicRequestPieces],
                              ['Permit Request Volume (m³)', detail.oicRequestVolume],
                            ].map(([label, value]) => (
                              <div key={label} className="detail-field-item">
                                <dt className="detail-field-label">{label}</dt>
                                <dd className="detail-field-value">{displayValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                          <dl className="boic-permit-details__remarks detail-field-grid">
                            <div className="detail-field-item detail-field-item--full">
                              <dt className="detail-field-label">Remarks</dt>
                              <dd className="detail-field-value">{displayValue(detail.remarks)}</dd>
                            </div>
                          </dl>
                        </Tile>
                      ) : (
                        <DetailFieldTile
                          title={usesReviewedPermitFlow ? 'Permit details' : 'Permit summary'}
                          headerAction={
                            canSavePermit ? (
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
                            ) : undefined
                          }
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
                                  status={formatPermitStatus(
                                    detail.permitStatusCode,
                                    detail.permitStatusDescription,
                                  )}
                                  fallbackLabel="Not provided"
                                />
                              ),
                            },
                            { label: 'Submit date', value: displayValue(detail.applicationDate) },
                            { label: 'Issued date', value: displayValue(detail.issueDate) },
                            { label: 'Expiry date', value: displayValue(detail.expiryDate) },
                            {
                              label: 'Received date',
                              value: displayValue(
                                detail.blanketOic ? detail.receivedDate : detail.applicationDate,
                              ),
                            },
                            { label: 'Region', value: displayValue(detail.region) },
                            ...(detail.blanketOic ? permitVolumeAndRemarksFields : []),
                          ]}
                        />
                      )}
                    </Column>

                    {!ministerialPermit &&
                      !detail.blanketOic &&
                      !(usesReviewedPermitFlow && isEditingPermit && permitForm) && (
                        <Column sm={4} md={8} lg={16}>
                          {isEditingPermit && permitForm ? (
                            <Tile>
                              <h2 className="detail-tile-title">
                                {usesReviewedPermitFlow
                                  ? 'Volume and remarks'
                                  : 'Financial and volume'}
                              </h2>
                              {renderPermitVolumeAndRemarks()}
                            </Tile>
                          ) : (
                            <DetailFieldTile
                              title={
                                usesReviewedPermitFlow
                                  ? 'Volume and remarks'
                                  : 'Financial and volume'
                              }
                              fields={permitVolumeAndRemarksFields}
                            />
                          )}
                        </Column>
                      )}
                    {!ministerialPermit && !detail.blanketOic && (
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <h2 className="detail-tile-title">
                            {ministerialPermit ? 'Applications' : 'Associated applications'}
                          </h2>
                          {ministerialPermit ? (
                            renderMinisterialPermitApplications()
                          ) : isPermitTablesLoading ? (
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
                                            onClick={() => {
                                              clearActionNotifications()
                                              setPermitApplicationPendingRemoval(applicationNumber)
                                            }}
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
                          {canEditPermitApplications && !ministerialPermit && (
                            <>
                              <div className="legacy-search-grid">
                                <SearchableSelect
                                  id="permitApplicationToAdd"
                                  labelText={requiredLabel('Available application')}
                                  required
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
                    {isMinisterialPermitEdit && (
                      <Column sm={4} md={8} lg={16}>
                        {renderFederalPermitNotice()}
                      </Column>
                    )}
                    {canSavePermit && isEditingPermit && (
                      <Column sm={4} md={8} lg={16}>
                        <div className="legacy-search-actions">
                          {isEditingPermit ? (
                            <>
                              {usesReviewedPermitFlow && (
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  disabled={isSavingPermit}
                                  onClick={() => {
                                    resetPermitFormSection(false)
                                    setAgentUsed(Boolean(detail.applicantClientNumber?.trim()))
                                    setIsEditingPermitClients(false)
                                    setIsEditingPermit(false)
                                  }}
                                >
                                  Cancel
                                </Button>
                              )}
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={
                                  isSavingPermit ||
                                  isPermitOptionsLoading ||
                                  permitOptionsUnavailable ||
                                  blanketOicRegionSelectionUnavailable ||
                                  requiredPermitOptionsMissing ||
                                  paymentPendingReceiptRequiresCompletion ||
                                  !permitClientLookupCanSave
                                }
                                renderIcon={isSavingPermit ? PendingIcon : undefined}
                                onClick={() => void onSavePermit()}
                              >
                                {isSavingPermit
                                  ? 'Saving…'
                                  : usesReviewedPermitFlow
                                    ? 'Save changes'
                                    : 'Save permit'}
                              </Button>
                              {!usesReviewedPermitFlow && (
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  disabled={isSavingPermit}
                                  onClick={() => {
                                    resetPermitFormSection(false)
                                    setAgentUsed(Boolean(detail.applicantClientNumber?.trim()))
                                    setIsEditingPermitClients(false)
                                    setIsEditingPermit(false)
                                  }}
                                >
                                  Cancel
                                </Button>
                              )}
                            </>
                          ) : null}
                        </div>
                      </Column>
                    )}
                  </Grid>
                </TabPanel>
                <TabPanel key="owner" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    {!ownerEditMode && (
                      <Column sm={4} md={8} lg={16}>
                        <PermitClientTile
                          title="Applicant details"
                          clientNumber={detail.ownerClientNumber}
                          locationCode={detail.ownerClientLocationCode}
                          clientData={ownerClientData}
                          isLoading={isClientDataLoading}
                          errorMessage={activePermitTabId === 'owner' ? clientDataErrorMessage : ''}
                          reviewedLayout={usesReviewedPermitFlow}
                          headerAction={
                            usesReviewedPermitFlow && canEditPermitClients ? (
                              <Button
                                kind="tertiary"
                                size="sm"
                                renderIcon={Edit}
                                onClick={startPermitClientEdit}
                              >
                                Edit applicant details
                              </Button>
                            ) : undefined
                          }
                        />
                        <Checkbox
                          id="permit-agent-used"
                          labelText="I'm an agent"
                          checked={agentUsed}
                          disabled
                        />
                        {usesReviewedPermitFlow && hasPermitAgent && (
                          <PermitClientTile
                            title="Agent information"
                            clientNumber={detail.applicantClientNumber}
                            locationCode={detail.agentClientLocationCode}
                            clientData={agentClientData}
                            isLoading={isClientDataLoading}
                            errorMessage={
                              activePermitTabId === 'owner' ? clientDataErrorMessage : ''
                            }
                            reviewedLayout
                          />
                        )}
                      </Column>
                    )}
                    {ownerEditMode && permitForm && (
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <h2 className="detail-tile-title">
                            {usesReviewedPermitFlow && <Enterprise size={24} aria-hidden="true" />}
                            Applicant details
                          </h2>
                          {usesReviewedPermitFlow && (
                            <p className="permit-client-editor__required-hint">
                              {requiredLabel('Required fields')}
                            </p>
                          )}
                          {renderPermitClientEditor('owner', invoiceMaterialLocked)}
                          {usesReviewedPermitFlow && (
                            <hr className="permit-client-editor__agent-divider" />
                          )}
                          <Checkbox
                            id="permit-agent-used"
                            labelText="I'm an agent"
                            checked={usesReviewedPermitFlow ? hasPermitAgent : agentUsed}
                            disabled={usesReviewedPermitFlow || invoiceMaterialLocked}
                            onChange={
                              usesReviewedPermitFlow
                                ? undefined
                                : (_, { checked }) => setPermitAgentUsed(Boolean(checked))
                            }
                          />
                          {usesReviewedPermitFlow && agentUsed && (
                            <>
                              <h3 className="detail-tile-title">Agent information</h3>
                              {renderPermitClientEditor('agent', invoiceMaterialLocked)}
                            </>
                          )}
                          {usesReviewedPermitFlow && (
                            <div className="legacy-search-actions permit-client-editor__actions">
                              <Button
                                kind="tertiary"
                                size="sm"
                                disabled={isSavingPermit}
                                onClick={cancelPermitClientEdit}
                              >
                                Cancel
                              </Button>
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={
                                  isSavingPermit ||
                                  isPermitOptionsLoading ||
                                  permitOptionsUnavailable ||
                                  blanketOicRegionSelectionUnavailable ||
                                  requiredPermitOptionsMissing ||
                                  paymentPendingReceiptRequiresCompletion ||
                                  !permitClientLookupCanSave
                                }
                                renderIcon={isSavingPermit ? PendingIcon : undefined}
                                onClick={() => void onSavePermit()}
                              >
                                {isSavingPermit ? 'Saving…' : 'Save changes'}
                              </Button>
                            </div>
                          )}
                        </Tile>
                      </Column>
                    )}
                    {canEditPermitClients && !usesReviewedPermitFlow && (
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
                                  blanketOicRegionSelectionUnavailable ||
                                  requiredPermitOptionsMissing ||
                                  paymentPendingReceiptRequiresCompletion ||
                                  !permitClientLookupCanSave
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
                                onClick={cancelPermitClientEdit}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : !usesReviewedPermitFlow ? (
                            <Button kind="tertiary" size="sm" onClick={startPermitClientEdit}>
                              Edit applicant
                            </Button>
                          ) : null}
                        </div>
                      </Column>
                    )}
                  </Grid>
                </TabPanel>
                {hasPermitAgent && !usesReviewedPermitFlow && (
                  <TabPanel key="agent" className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      {ownerEditMode && permitForm ? (
                        <Column sm={4} md={8} lg={16}>
                          <Tile>
                            <h2 className="detail-tile-title">Edit agent</h2>
                            {renderPermitClientEditor('agent', invoiceMaterialLocked)}
                          </Tile>
                        </Column>
                      ) : (
                        <Column sm={4} md={8} lg={16}>
                          <PermitClientTile
                            title="Agent"
                            clientNumber={detail.applicantClientNumber}
                            locationCode={detail.agentClientLocationCode}
                            clientData={agentClientData}
                            isLoading={isClientDataLoading}
                            errorMessage={
                              activePermitTabId === 'agent' ? clientDataErrorMessage : ''
                            }
                          />
                        </Column>
                      )}
                      {canEditPermitClients && (
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
                                    blanketOicRegionSelectionUnavailable ||
                                    requiredPermitOptionsMissing ||
                                    paymentPendingReceiptRequiresCompletion ||
                                    !permitClientLookupCanSave
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
                                  onClick={cancelPermitClientEdit}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button kind="tertiary" size="sm" onClick={startPermitClientEdit}>
                                Edit agent
                              </Button>
                            )}
                          </div>
                        </Column>
                      )}
                    </Grid>
                  </TabPanel>
                )}
                <TabPanel key="shipping" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      {isEditingShipping && permitForm ? (
                        <Tile>
                          <h2 className="detail-tile-title">
                            {usesReviewedPermitFlow && <EarthFilled size={24} aria-hidden="true" />}
                            {usesReviewedPermitFlow ? 'Shipping details' : 'Shipping'}
                          </h2>
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
                              'Purchaser',
                              false,
                              52,
                              true,
                              usesReviewedPermitFlow ? 'Company name' : undefined,
                            )}
                            {usesReviewedPermitFlow ? (
                              <PermitCountrySelect
                                id="permit-destinationCountry"
                                labelText={requiredLabel('Final destination country')}
                                required
                                value={permitForm.destinationCountry}
                                options={(shippingReferences?.countries ?? []).map((option) => ({
                                  value: option.code,
                                  label: formatShippingReferenceOption(option),
                                }))}
                                invalid={!!permitFieldError('destinationCountry')}
                                invalidText={permitFieldError('destinationCountry')}
                                onBlur={() => markPermitFieldTouched('destinationCountry')}
                                onChange={(value) =>
                                  setPermitFormField('destinationCountry', value)
                                }
                                disabled={
                                  invoiceMaterialLocked ||
                                  isShippingReferencesLoading ||
                                  !shippingReferences
                                }
                              />
                            ) : (
                              <Select
                                id="permit-destinationCountry"
                                labelText={requiredLabel('Final destination country')}
                                aria-required="true"
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
                                <SelectItem value="" text="Select a final destination country" />
                                {(shippingReferences?.countries ?? []).map((option) => (
                                  <SelectItem
                                    key={option.code}
                                    value={option.code}
                                    text={formatShippingReferenceOption(option)}
                                  />
                                ))}
                              </Select>
                            )}
                            <Select
                              id="permit-transportType"
                              labelText={requiredLabel('Transport type')}
                              aria-required="true"
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
                            {renderPermitTextInput(
                              'transportName',
                              'Transport name',
                              false,
                              26,
                              true,
                            )}
                            <IsoDatePicker
                              id="permit-estimatedShippingDate"
                              labelText={requiredLabel('Estimated shipping date')}
                              required
                              value={permitForm.estimatedShippingDate}
                              invalid={!!permitFieldError('estimatedShippingDate')}
                              invalidText={permitFieldError('estimatedShippingDate')}
                              onBlur={() => markPermitFieldTouched('estimatedShippingDate')}
                              onChange={(value) =>
                                setPermitFormField('estimatedShippingDate', value)
                              }
                            />
                            <Select
                              id="permit-portOfExport"
                              labelText={requiredLabel('Customs port of export')}
                              aria-required="true"
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
                              <SelectItem value="" text="Select a customs port of export" />
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
                                true,
                              )}
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
                            title={usesReviewedPermitFlow ? 'Shipping details' : 'Shipping'}
                            icon={
                              usesReviewedPermitFlow ? (
                                <EarthFilled size={24} aria-hidden="true" />
                              ) : undefined
                            }
                            headerAction={
                              canEditShipping ? (
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  renderIcon={usesReviewedPermitFlow ? Edit : undefined}
                                  disabled={isShippingReferencesLoading || !shippingReferences}
                                  onClick={() => {
                                    resetPermitFormSection(true)
                                    setIsEditingShipping(true)
                                  }}
                                >
                                  {usesReviewedPermitFlow
                                    ? 'Edit shipping details'
                                    : 'Edit shipping'}
                                </Button>
                              ) : undefined
                            }
                            fields={[
                              {
                                label: 'Purchaser',
                                value: displayValue(detail.destinationCompanyName),
                              },
                              {
                                label: 'Final destination country',
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
                                label: 'Estimated shipping date',
                                value: displayValue(detail.estimatedShippingDate),
                              },
                              {
                                label: 'Customs port of export',
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
                            ]}
                          />
                        </>
                      )}
                    </Column>
                    {canEditShipping && isEditingShipping && (
                      <Column sm={4} md={8} lg={16}>
                        <div className="legacy-search-actions">
                          {isEditingShipping ? (
                            <>
                              {usesReviewedPermitFlow && (
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
                              )}
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
                                {isSavingShipping
                                  ? 'Saving…'
                                  : usesReviewedPermitFlow
                                    ? 'Save changes'
                                    : 'Save shipping'}
                              </Button>
                              {!usesReviewedPermitFlow && (
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
                              )}
                            </>
                          ) : null}
                        </div>
                      </Column>
                    )}
                  </Grid>
                </TabPanel>
                <TabPanel key="items" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">
                          {usesReviewedPermitFlow && <Box size={24} aria-hidden="true" />}
                          {usesReviewedPermitFlow ? 'Scale' : 'Permit items'}
                        </h2>
                        {ministerialScaleEmpty && (
                          <EmptyState
                            title="No scale yet"
                            description={
                              <>
                                Scale comes from the applications selected for this permit. Select
                                an application on the{' '}
                                <button
                                  type="button"
                                  className="cds--link"
                                  onClick={() => selectPermitTab('permit')}
                                >
                                  Permit tab
                                </button>
                                .
                              </>
                            }
                            headingLevel={3}
                          />
                        )}
                        <fieldset className="legacy-form-fieldset" hidden={ministerialScaleEmpty}>
                          <legend>
                            {detail.blanketOic ? 'Blanket OIC package details' : 'Package details'}
                          </legend>
                          {detail.blanketOic && blanketOicPackageOptions.length > 0 && (
                            <div className="boic-package-selector">
                              <SearchableSelect
                                id="boicScalePackageNumber"
                                labelText="Package number"
                                value={selectedBlanketOicPackageNumber}
                                options={blanketOicPackageOptions}
                                placeholder="Select package"
                                disabled={blanketOicPackageActionsDisabled}
                                onChange={setSelectedBlanketOicPackageNumberState}
                              />
                              {canEditBlanketOicPackages && (
                                <Button
                                  id="create-boic-package"
                                  type="button"
                                  kind="primary"
                                  size="sm"
                                  disabled={blanketOicPackageActionsDisabled}
                                  onClick={(event) => {
                                    packagePanelLauncherRef.current = event.currentTarget
                                    startBlanketOicPackageCreate()
                                  }}
                                >
                                  Create package
                                </Button>
                              )}
                            </div>
                          )}
                          {ministerialPermit && ministerialPackageOptions.length > 0 && (
                            <div className="legacy-search-grid">
                              <SearchableSelect
                                id="ministerialScalePackageNumber"
                                labelText="Package number"
                                value={selectedMinisterialPackageNumber}
                                disabled={ministerialScaleSelectionDraft !== null}
                                options={ministerialPackageOptions}
                                placeholder="Select package"
                                onChange={setSelectedMinisterialPackageNumberState}
                              />
                            </div>
                          )}
                          {isPermitTablesLoading ? (
                            <InlineLoading description="Loading permit items…" />
                          ) : permitTablesErrorMessage ? (
                            <EmptyState
                              title={
                                usesReviewedPermitFlow
                                  ? 'Scale unavailable'
                                  : 'Permit items unavailable'
                              }
                              description={permitTablesErrorMessage}
                              headingLevel={3}
                              role="alert"
                            />
                          ) : detail.blanketOic && selectedBlanketOicPackage ? (
                            <DetailFieldTile
                              title={`Package ${formatPackageNumberLabel(selectedBlanketOicPackage.packageNumber)}`}
                              icon={<Box size={24} aria-hidden="true" />}
                              headerAction={
                                canEditBlanketOicPackages ? (
                                  <div className="boic-package-summary__actions">
                                    {selectedBlanketOicPackageHasScaleRows && (
                                      <p
                                        id={`boic-package-delete-help-${encodeURIComponent(selectedBlanketOicPackage.packageNumber)}`}
                                        className="cds--visually-hidden"
                                      >
                                        Delete unavailable while this package has scale details.
                                      </p>
                                    )}
                                    <Button
                                      type="button"
                                      kind="danger--ghost"
                                      size="sm"
                                      disabled={
                                        blanketOicPackageActionsDisabled ||
                                        selectedBlanketOicPackageHasScaleRows
                                      }
                                      aria-describedby={
                                        selectedBlanketOicPackageHasScaleRows
                                          ? `boic-package-delete-help-${encodeURIComponent(selectedBlanketOicPackage.packageNumber)}`
                                          : undefined
                                      }
                                      onClick={() => {
                                        clearActionNotifications()
                                        setBoicPackageNumberPendingDeletion(
                                          selectedBlanketOicPackage.packageNumber,
                                        )
                                      }}
                                    >
                                      {isDeletingBoicPackageNumber ===
                                      selectedBlanketOicPackage.packageNumber
                                        ? 'Deleting…'
                                        : 'Delete package'}
                                    </Button>
                                    <Button
                                      type="button"
                                      kind="ghost"
                                      size="sm"
                                      renderIcon={Edit}
                                      disabled={blanketOicPackageActionsDisabled}
                                      onClick={(event) => {
                                        packagePanelLauncherRef.current = event.currentTarget
                                        void onEditBlanketOicPackage(
                                          selectedBlanketOicPackage.packageNumber,
                                        )
                                      }}
                                    >
                                      Edit package
                                    </Button>
                                  </div>
                                ) : undefined
                              }
                              fields={[
                                {
                                  label: 'Species list',
                                  value: selectedBlanketOicPackage.speciesCodes?.join(', ') || '—',
                                },
                                {
                                  label: 'End use',
                                  value: selectedBlanketOicPackage.endUseCodes?.join(', ') || '—',
                                },
                                {
                                  label: 'Age class',
                                  value: selectedBlanketOicPackage.ageClass || '—',
                                },
                                {
                                  label: 'Product type',
                                  value: selectedBlanketOicPackage.productType || '—',
                                },
                                {
                                  label: 'Volume (m³)',
                                  value: selectedBlanketOicPackage.packageVolume || '—',
                                },
                                {
                                  label: 'Average length (m)',
                                  value: selectedBlanketOicPackage.averageLength || '—',
                                },
                                {
                                  label: 'Average top diameter (rads)',
                                  value: selectedBlanketOicPackage.averageTopDiameter || '—',
                                },
                                {
                                  label: 'Comments',
                                  value: (
                                    <span style={{ whiteSpace: 'pre-wrap' }}>
                                      {selectedBlanketOicPackage.comments || '—'}
                                    </span>
                                  ),
                                },
                              ]}
                            >
                              <div className="boic-package-summary__scale">
                                {renderScaleSummary()}
                              </div>
                            </DetailFieldTile>
                          ) : ministerialPermit && selectedMinisterialPackage ? (
                            <dl className="detail-field-grid ministerial-package-summary">
                              {[
                                ['Region', selectedMinisterialPackage.region],
                                [
                                  'Species and end use sort',
                                  selectedMinisterialPackage.speciesEndUseSort,
                                ],
                                ['Age class', selectedMinisterialPackage.ageClass],
                                ['Product type', selectedMinisterialPackage.productType],
                                [
                                  'Package volume (m³)',
                                  (
                                    selectedPermitScaleTotalsByPackage.get(
                                      selectedMinisterialPackage.packageNumber,
                                    )?.volume ?? 0
                                  ).toLocaleString(),
                                ],
                                [
                                  'Package pieces',
                                  (
                                    selectedPermitScaleTotalsByPackage.get(
                                      selectedMinisterialPackage.packageNumber,
                                    )?.pieces ?? 0
                                  ).toLocaleString(),
                                ],
                                ['Average length (m)', selectedMinisterialPackage.averageLength],
                                [
                                  'Average top diameter (rads)',
                                  selectedMinisterialPackage.averageTopDiameter,
                                ],
                              ].map(([label, value]) => (
                                <div key={label} className="detail-field-item">
                                  <dt className="detail-field-label">{label}</dt>
                                  <dd className="detail-field-value">{value || '—'}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : visiblePackages.length > 0 ? (
                            <TableFrame ariaLabel="Permit packages">
                              <Table size="md" useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Package number</TableHeader>
                                    <TableHeader>Region</TableHeader>
                                    <TableHeader>Species and end use sort</TableHeader>
                                    <TableHeader>Age class</TableHeader>
                                    {usesReviewedPermitFlow && (
                                      <TableHeader>Package pieces</TableHeader>
                                    )}
                                    <TableHeader>Package volume (m³)</TableHeader>
                                    <TableHeader>Average length</TableHeader>
                                    <TableHeader>Average top diameter</TableHeader>
                                    <TableHeader>Product type</TableHeader>
                                    {detail.blanketOic && (
                                      <>
                                        <TableHeader>Current package volume (m³)</TableHeader>
                                        <TableHeader>Comments</TableHeader>
                                      </>
                                    )}
                                    {canEditBlanketOicPackages && (
                                      <TableHeader>Actions</TableHeader>
                                    )}
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {visiblePackages.map((row) => (
                                    <TableRow key={row.packageNumber}>
                                      <TableCell>
                                        {row.packageNumber
                                          ? formatPackageNumberLabel(row.packageNumber)
                                          : '-'}
                                      </TableCell>
                                      <TableCell>{row.region || '-'}</TableCell>
                                      <TableCell style={{ whiteSpace: 'pre-line' }}>
                                        {row.speciesEndUseSort || '-'}
                                      </TableCell>
                                      <TableCell>{row.ageClass || '-'}</TableCell>
                                      {usesReviewedPermitFlow && (
                                        <TableCell>
                                          {(
                                            selectedPermitScaleTotalsByPackage.get(
                                              row.packageNumber,
                                            )?.pieces ?? 0
                                          ).toLocaleString()}
                                        </TableCell>
                                      )}
                                      <TableCell>
                                        {ministerialPermit
                                          ? (
                                              selectedPermitScaleTotalsByPackage.get(
                                                row.packageNumber,
                                              )?.volume ?? 0
                                            ).toLocaleString()
                                          : row.packageVolume || '-'}
                                      </TableCell>
                                      <TableCell>{row.averageLength || '-'}</TableCell>
                                      <TableCell>{row.averageTopDiameter || '-'}</TableCell>
                                      <TableCell>{row.productType || '-'}</TableCell>
                                      {detail.blanketOic && (
                                        <>
                                          <TableCell>{row.currentPackageVolume || '-'}</TableCell>
                                          <TableCell>{row.comments || '-'}</TableCell>
                                        </>
                                      )}
                                      {canEditBlanketOicPackages && (
                                        <TableCell>
                                          {(tabsData?.items ?? []).some(
                                            (item) => item.packageNumber === row.packageNumber,
                                          ) && (
                                            <p
                                              id={`boic-package-delete-help-${encodeURIComponent(row.packageNumber)}`}
                                            >
                                              Delete unavailable while this package has scale
                                              details.
                                            </p>
                                          )}
                                          <Button
                                            type="button"
                                            kind="ghost"
                                            size="sm"
                                            disabled={blanketOicPackageActionsDisabled}
                                            onClick={(event) => {
                                              packagePanelLauncherRef.current = event.currentTarget
                                              void onEditBlanketOicPackage(row.packageNumber)
                                            }}
                                          >
                                            Edit
                                          </Button>
                                          <Button
                                            type="button"
                                            kind="danger--ghost"
                                            size="sm"
                                            aria-describedby={
                                              (tabsData?.items ?? []).some(
                                                (item) => item.packageNumber === row.packageNumber,
                                              )
                                                ? `boic-package-delete-help-${encodeURIComponent(row.packageNumber)}`
                                                : undefined
                                            }
                                            disabled={
                                              blanketOicPackageActionsDisabled ||
                                              (tabsData?.items ?? []).some(
                                                (item) => item.packageNumber === row.packageNumber,
                                              )
                                            }
                                            onClick={() => {
                                              clearActionNotifications()
                                              setBoicPackageNumberPendingDeletion(row.packageNumber)
                                            }}
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
                            <EmptyState
                              title="No packages yet"
                              description={
                                canEditBlanketOicPackages
                                  ? 'Scale is recorded by package. Create a package, then add its scales.'
                                  : 'No package has been created for this Blanket OIC permit.'
                              }
                              headingLevel={3}
                            />
                          ) : ministerialScaleEmpty ? null : (
                            <EmptyState
                              title="No package details"
                              description="No package detail rows are available for this permit."
                              headingLevel={3}
                            />
                          )}
                          {canEditBlanketOicPackages && blanketOicPackageOptions.length === 0 && (
                            <div className="application-detail-edit-section">
                              <Button
                                id="create-boic-package"
                                type="button"
                                kind="primary"
                                size="sm"
                                disabled={blanketOicPackageActionsDisabled}
                                onClick={(event) => {
                                  packagePanelLauncherRef.current = event.currentTarget
                                  startBlanketOicPackageCreate()
                                }}
                              >
                                Create package
                              </Button>
                            </div>
                          )}
                        </fieldset>
                        {!(detail.blanketOic && selectedBlanketOicPackage) && renderScaleSummary()}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel key="fees" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    {usesReviewedPermitFlow && !ministerialFeeShellEmpty ? (
                      <>
                        <Column sm={4} md={8} lg={16}>
                          <Tile>
                            <div className="detail-section-card__header">
                              <h2 className="detail-tile-title">
                                <Currency size={24} aria-hidden="true" />
                                Permit fees
                              </h2>
                              {canEditFeeOverride && !isEditingFeeOverride && (
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  renderIcon={Edit}
                                  onClick={() => {
                                    setFeeOverrideFieldErrors({})
                                    setIsEditingFeeOverride(true)
                                  }}
                                >
                                  Edit fee override
                                </Button>
                              )}
                            </div>
                            {renderPermitFeeSummary()}
                          </Tile>
                        </Column>
                        <Column sm={4} md={8} lg={16}>
                          <Tile>
                            <div className="detail-section-card__header">
                              <h2 className="detail-tile-title">
                                <Currency size={24} aria-hidden="true" />
                                Package fees
                              </h2>
                              {canSavePermit && !isEditingPermit && (
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  renderIcon={Edit}
                                  onClick={() => {
                                    resetPermitFormSection(false)
                                    setIsEditingPermit(true)
                                  }}
                                >
                                  Edit fee details
                                </Button>
                              )}
                            </div>
                            {renderPackageFees()}
                          </Tile>
                        </Column>
                      </>
                    ) : (
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <h2 className="detail-tile-title">
                            {usesReviewedPermitFlow ? 'Fees' : 'Fee calculation details'}
                          </h2>
                          {!ministerialFeeShellEmpty && renderPermitFeeSummary()}
                          {renderPackageFees()}
                        </Tile>
                      </Column>
                    )}
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
                          <h2 className="detail-tile-title">
                            {usesReviewedPermitFlow ? 'Documents' : 'Permit documents'}
                          </h2>
                          {detail.blanketOic && canUploadPermitDocuments && (
                            <Button
                              kind="tertiary"
                              size="sm"
                              disabled={permitDocumentUploadBusy}
                              ref={
                                usesReviewedPermitFlow ? permitDocumentUploadLauncherRef : undefined
                              }
                              onClick={() => {
                                setPermitDocumentUploadResetKey((current) => current + 1)
                                setIsEditingPermitDocuments(true)
                              }}
                            >
                              Add document
                            </Button>
                          )}
                          {!detail.blanketOic &&
                            canEditPermitDocuments &&
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
                                ref={
                                  usesReviewedPermitFlow
                                    ? permitDocumentUploadLauncherRef
                                    : undefined
                                }
                                onClick={() => setIsEditingPermitDocuments(true)}
                              >
                                {usesReviewedPermitFlow ? 'Add document' : 'Edit permit documents'}
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
                            presentation={detail.blanketOic ? 'side-panel' : 'modal'}
                            initiallyOpen={usesReviewedPermitFlow}
                            onClose={
                              usesReviewedPermitFlow ? onCancelPermitDocumentEditing : undefined
                            }
                            onDirtyChange={setPermitDocumentUploadDirty}
                            onBusyChange={setPermitDocumentUploadBusy}
                            onUploadComplete={refreshPermitDocuments}
                            onUploadSuccess={
                              usesReviewedPermitFlow
                                ? (message) =>
                                    setActionSuccessNotification({
                                      title: 'Document uploaded',
                                      subtitle: message,
                                    })
                                : undefined
                            }
                          />
                        )}
                        {deferredPermitTabLoading.documents ? (
                          <InlineLoading description="Loading permit documents…" />
                        ) : documentsErrorMessage ? (
                          <EmptyState
                            title="Permit documents unavailable"
                            description={documentsErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : documentRows.length > 0 ? (
                          <TableFrame ariaLabel="Permit document rows">
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
                                {documentRows.map((row) => {
                                  const invoiceDocument = isInvoiceDocumentRow(row)
                                  const canDeleteRow =
                                    canDeletePermitDocuments &&
                                    (!invoiceDocument || canDeleteInvoiceDocuments)
                                  return (
                                    <TableRow key={row.id}>
                                      <TableCell>{row.name || '-'}</TableCell>
                                      <TableCell>{row.description || '-'}</TableCell>
                                      <TableCell>{row.type || row.typeCode || '-'}</TableCell>
                                      <TableCell>
                                        <div className="legacy-search-actions">
                                          {usesReviewedPermitFlow && (
                                            <Button
                                              kind="ghost"
                                              size="sm"
                                              disabled={!canPerform('/permitDetails')}
                                              title="Open supported files in a new tab; other formats download."
                                              onClick={() => void onOpenDocument(row, true)}
                                            >
                                              Open
                                            </Button>
                                          )}
                                          <Button
                                            kind="ghost"
                                            size="sm"
                                            disabled={!canPerform('/permitDetails')}
                                            onClick={() => void onOpenDocument(row)}
                                          >
                                            Download
                                          </Button>
                                          {(isEditingPermitDocuments ||
                                            ((detail.blanketOic || usesReviewedPermitFlow) &&
                                              canDeletePermitDocuments)) && (
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
                                              onClick={() => {
                                                clearActionNotifications()
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
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <EmptyState
                            icon={
                              usesReviewedPermitFlow ? (
                                <DocumentAdd size={48} aria-hidden="true" />
                              ) : undefined
                            }
                            title={
                              usesReviewedPermitFlow
                                ? 'No documents for this permit'
                                : 'No permit documents available'
                            }
                            description={
                              usesReviewedPermitFlow
                                ? 'Documents stay with the record as it moves through the application, exemption and permit stages.'
                                : 'No documents are available for this permit.'
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
                        {deferredPermitTabLoading.invoices ? (
                          <InlineLoading description="Loading permit invoices…" />
                        ) : invoicesErrorMessage ? (
                          <EmptyState
                            title="Invoices unavailable"
                            description={invoicesErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : invoiceRows.length > 0 ? (
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
                                {invoiceRows.map((row) => (
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
                            title="No invoices available"
                            description="No invoices are available for this permit."
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
          errorMessage={actionErrorMessage}
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
            labelText={requiredLabel('Applicant email address')}
            aria-required="true"
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
          title={
            isInvoiceDocumentRow(documentPendingDeletion)
              ? 'Delete invoice and document'
              : 'Delete document'
          }
          description={
            <>
              Permanently delete <strong>{documentPendingDeletion.name || 'this document'}</strong>?
              {isInvoiceDocumentRow(documentPendingDeletion) &&
                ' This also deletes the associated invoice record, including its value, conversion rate, and fee.'}{' '}
              This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          errorTitle={
            isInvoiceDocumentRow(documentPendingDeletion)
              ? 'Failed to delete invoice and document'
              : 'Failed to delete document'
          }
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
        title={`Delete Blanket OIC package ${formatPackageNumberLabel(boicPackageNumberPendingDeletion ?? '')}?`}
        description={`Delete Blanket OIC package ${formatPackageNumberLabel(boicPackageNumberPendingDeletion ?? '')}. This action cannot be undone.`}
        confirmLabel="Delete package"
        pendingLabel="Deleting…"
        onClose={() => setBoicPackageNumberPendingDeletion(null)}
        onConfirm={async () => {
          if (boicPackageNumberPendingDeletion) {
            await onDeleteBlanketOicPackage(boicPackageNumberPendingDeletion)
          }
        }}
      />
      {detail?.blanketOic && (
        <DetailSidePanel
          open={canEditBlanketOicPackages && blanketOicPackageEditorOpen}
          title={
            editingBoicPackageNumber
              ? `Edit ${formatPackageNumberLabel(editingBoicPackageNumber)}`
              : 'Create package'
          }
          className="permit-package-panel application-detail-edit-section"
          contentSelector="#permit-detail-content"
          initialFocusSelector="#boicPackageNumber"
          launcherRef={packagePanelLauncherRef}
          fallbackFocusSelector="#create-boic-package"
          loading={isLoadingBoicPackage}
          busy={isSavingBoicPackage}
          onClose={resetBlanketOicPackageForm}
          actions={[
            {
              label: editingBoicPackageNumber ? 'Cancel edit' : 'Cancel',
              kind: 'secondary',
              disabled: isSavingBoicPackage,
              onClick: resetBlanketOicPackageForm,
            },
            {
              label: isSavingBoicPackage
                ? 'Saving…'
                : editingBoicPackageNumber
                  ? 'Save package'
                  : 'Save package',
              kind: 'primary',
              disabled: isLoadingBoicPackage || isSavingBoicPackage || !boicCodeOptionsReady,
              renderIcon: isSavingBoicPackage ? PendingIcon : undefined,
              onClick: async () => {
                if (await onSaveBlanketOicPackage()) return
                requestAnimationFrame(() => {
                  const panel = document.querySelector('.permit-package-panel')
                  const invalid = panel?.querySelector<HTMLElement>('[aria-invalid="true"]')
                  const target =
                    invalid ?? panel?.querySelector<HTMLElement>('[data-package-error]')
                  target?.focus()
                  target?.scrollIntoView({ block: 'nearest' })
                })
              },
            },
          ]}
        >
          <div className="permit-package-panel__form">
            {!!boicPackageErrorMessage && (
              <div tabIndex={-1} data-package-error>
                <InlineNotification
                  kind="error"
                  title="Package needs attention"
                  subtitle={
                    Object.values(boicPackageFieldErrors).some(Boolean)
                      ? 'Check the highlighted fields and try again.'
                      : boicPackageErrorMessage
                  }
                  lowContrast
                  hideCloseButton
                />
              </div>
            )}
            {isLoadingBoicPackage && <InlineLoading description="Loading package…" />}
            <div className="legacy-search-grid">
              <TextInput
                id="boicPackageNumber"
                labelText={requiredLabel('Package number')}
                aria-required="true"
                maxLength={20}
                value={boicPackageForm.packageNumber}
                invalid={!!boicPackageFieldErrors.packageNumber}
                invalidText={boicPackageFieldErrors.packageNumber}
                disabled={isLoadingBoicPackage || isSavingBoicPackage}
                onChange={(event) =>
                  setBlanketOicPackageFormField('packageNumber', event.target.value.toUpperCase())
                }
              />
            </div>
            <BlanketOicPackageCodeFields
              region={String(detail.orgUnitNumber ?? '')}
              value={boicPackageForm}
              onChange={setBlanketOicPackageFormField}
              disabled={isLoadingBoicPackage || isSavingBoicPackage}
              onAvailabilityChange={setBoicCodeOptionsReady}
              fieldErrors={boicPackageFieldErrors}
            />
            <div className="legacy-search-grid">
              <TextInput
                id="boicPackageVolume"
                labelText={requiredLabel('Package volume (m³)')}
                aria-required="true"
                value={boicPackageForm.volume}
                invalid={!!boicPackageFieldErrors.volume}
                invalidText={boicPackageFieldErrors.volume}
                disabled={isLoadingBoicPackage || isSavingBoicPackage}
                onChange={(event) => setBlanketOicPackageFormField('volume', event.target.value)}
              />
              <TextInput
                id="boicPackageAverageLength"
                helperText="Enter greater than 0 and no more than 99."
                labelText={requiredLabel('Average length (m)')}
                aria-required="true"
                value={boicPackageForm.averageLength}
                invalid={!!boicPackageFieldErrors.averageLength}
                invalidText={boicPackageFieldErrors.averageLength}
                disabled={isLoadingBoicPackage || isSavingBoicPackage}
                onChange={(event) =>
                  setBlanketOicPackageFormField('averageLength', event.target.value)
                }
              />
              <TextInput
                id="boicPackageAverageDiameter"
                helperText="Enter greater than 0 and no more than 99.99."
                labelText={requiredLabel('Average top diameter (rads)')}
                aria-required="true"
                value={boicPackageForm.averageDiameter}
                invalid={!!boicPackageFieldErrors.averageDiameter}
                invalidText={boicPackageFieldErrors.averageDiameter}
                disabled={isLoadingBoicPackage || isSavingBoicPackage}
                onChange={(event) =>
                  setBlanketOicPackageFormField('averageDiameter', event.target.value)
                }
              />
            </div>
            <TextArea
              id="boicPackageComments"
              labelText="Comments"
              enableCounter
              maxCount={PACKAGE_COMMENTS_MAX_LENGTH}
              maxLength={PACKAGE_COMMENTS_MAX_LENGTH}
              helperText="Use unaccented letters, numbers, spaces, or standard punctuation."
              value={boicPackageForm.comments}
              invalid={!!boicPackageFieldErrors.comments}
              invalidText={boicPackageFieldErrors.comments}
              disabled={isLoadingBoicPackage || isSavingBoicPackage}
              onChange={(event) => setBlanketOicPackageFormField('comments', event.target.value)}
            />
          </div>
        </DetailSidePanel>
      )}
      <UnsavedChangesGuard
        isDirty={isPermitDirty}
        isBusy={
          isSavingPermit ||
          isSavingShipping ||
          isSavingFeeOverride ||
          isSavingBoicPackage ||
          isSavingBoicScale ||
          isUpdatingScaleId !== null ||
          isSavingScaleSelection ||
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
          (isPermitOptionsLoading ||
            permitOptionsUnavailable ||
            blanketOicRegionSelectionUnavailable ||
            requiredPermitOptionsMissing)
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
