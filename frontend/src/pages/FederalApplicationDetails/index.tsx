import {
  RecordField,
  RecordFieldCell,
  RecordFieldGrid,
  RecordFieldRow,
} from '@/pages/shared/RecordFieldGrid'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Edit } from '@carbon/icons-react'
import {
  Button,
  Column,
  Grid,
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
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ContentLoadingOverlay from '@/components/ContentLoadingOverlay'
import EmptyState from '@/components/EmptyState'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import DetailLoadError from '@/components/DetailLoadError'
import IsoDatePicker from '@/components/IsoDatePicker'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { useAuth } from '@/context/auth/useAuth'
import { allowedRegions, withinRegions } from '@/context/auth/region-utils'
import { hasRole } from '@/context/auth/role-utils'
import { ActionResultNotification } from '../../components/ActionResultNotification'
import RecordDocumentsSection, {
  DOCUMENT_DELETED_RESULT,
  documentsSavedResult,
} from '@/components/documents/RecordDocumentsSection'
import { useDocumentOpener } from '@/components/documents/useDocumentOpener'
import type { FederalApplicationDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '../shared/DetailSections'
import { displayValue } from '@/pages/shared/detail-page-utils'
import { appendSearchParamsToPath } from '@/pages/shared/search-query-utils'
import {
  locationPath,
  readDetailReturnTo,
  withDetailReturnTo,
} from '@/pages/shared/detail-navigation'
import { useEditSections } from '@/pages/shared/useEditSections'
import { hasFieldErrors, useFieldErrors, type FieldErrors } from '@/pages/shared/useFieldErrors'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { useReloadPreservedTab } from '@/pages/shared/useReloadPreservedTab'
import {
  fetchFederalApplicationDetail,
  releaseApplicationEditLock,
} from '@/service/lexis-detail-service'
import {
  fetchFederalApplicationDocuments,
  openFederalApplicationDocument,
  removeFederalApplicationDocument,
  type FederalApplicationDocumentRow,
} from '@/service/federal-application-documents-service'
import { withoutActionError, type ActionResult } from '@/utils/action-result'
import {
  saveFederalPermit,
  updateFederalApplicationStatus,
  type FederalPermitMutation,
} from '@/service/federal-application-mutation-service'
import {
  fetchFederalApplicationRemarks,
  saveFederalApplicationRemark,
  type FederalApplicationRemark,
} from '@/service/federal-application-remarks-service'
import {
  fetchApplicationPackageScales,
  type ApplicationPackageScaleRow,
} from '@/service/provincial-application-items-service'
import { formatBusinessDateTime, formatBusinessIsoDate } from '@/utils/date'
import { fieldErrorText } from '@/utils/field-error'
import { focusFirstInvalidFieldAfterRender } from '@/utils/focus'
import { displayAuditIdentity, displayTableValue } from '@/utils/text'
import { requiredLabel } from '@/utils/required-label'
import {
  firstValidationError,
  isoDateFieldError,
  requiredFieldError,
  requiredMaxLengthFieldError,
} from '@/pages/shared/create-form-utils'
import {
  fetchShippingReferenceOptions,
  formatShippingReferenceOption,
  shippingReferenceLabel,
  type ShippingReferenceOptions,
} from '@/service/shipping-reference-service'
import { allowedFederalStatusTransitions } from './status-transitions'
import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'
import { displayVolume } from '@/utils/volume'

type FederalApplicationScaleRow = ApplicationPackageScaleRow & {
  packageNumber: string
}

type FederalApplicationDetailTabKey =
  | 'owner'
  | 'agent'
  | 'application'
  | 'items'
  | 'offers'
  | 'remarks'
  | 'documents'
  | 'shipping'

const FEDERAL_APPLICATION_DETAIL_TAB_SLOTS: readonly FederalApplicationDetailTabKey[] = [
  'owner',
  'agent',
  'application',
  'items',
  'offers',
  'remarks',
  'documents',
  'shipping',
]

type FederalEditSection = 'status' | 'permit' | 'new-remark' | `remark-${number}`

type FederalStatusField = 'statusCode' | 'statusRemark'

type FederalPermitField = Exclude<keyof FederalPermitMutation, 'permitNumber'>

const isRemarkSection = (section: FederalEditSection | null): boolean =>
  section === 'new-remark' || !!section?.startsWith('remark-')

const statusRemarkRequired = (statusCode: string): boolean =>
  statusCode === 'REJ' || statusCode === 'WDN'

const federalStatusServerField = (message: string): FederalStatusField | undefined => {
  if (message === 'Federal status must be APP, REJ, or WDN.') return 'statusCode'
  if (
    message === 'A remark is required when rejecting or withdrawing a federal application.' ||
    message === 'Remark is too long to save. Shorten it and try again.'
  ) {
    return 'statusRemark'
  }
  return undefined
}

// The server names each permit field at the start of its message.
const FEDERAL_PERMIT_SERVER_FIELD_LABELS: Record<FederalPermitField, string> = {
  permitIssueDate: 'Permit issue date',
  destinationCountry: 'Destination country',
  transportType: 'Transport type',
  transportName: 'Transport name',
  shippingDate: 'Estimated shipping date',
  portOfExport: 'Port of export',
  otherPortOfExport: 'Other port of export',
}

const federalPermitServerField = (message: string): FederalPermitField | undefined =>
  (Object.keys(FEDERAL_PERMIT_SERVER_FIELD_LABELS) as FederalPermitField[]).find((field) =>
    message.startsWith(`${FEDERAL_PERMIT_SERVER_FIELD_LABELS[field]} `),
  )

const federalRemarkServerField = (message: string): 'remark' | undefined =>
  message === 'Remark is required.' || message === 'Remark must not exceed 250 characters.'
    ? 'remark'
    : undefined

/** Splits server errors into the ones that belong to a field and the rest. */
const splitServerErrors = <F extends string>(
  errors: string[],
  fieldFor: (message: string) => F | undefined,
): { fieldErrors: FieldErrors<F>; otherErrors: string[] } => {
  const fieldErrors: FieldErrors<F> = {}
  const otherErrors: string[] = []
  for (const message of errors) {
    const field = fieldFor(message)
    if (!field) otherErrors.push(message)
    else fieldErrors[field] ??= message
  }
  return { fieldErrors, otherErrors }
}

const ASCII_PATTERN = /^[\u0000-\u007f]*$/

const emptyPermitForm = (): FederalPermitMutation => ({
  permitNumber: null,
  permitIssueDate: '',
  destinationCountry: '',
  transportType: '',
  transportName: '',
  shippingDate: '',
  portOfExport: '',
  otherPortOfExport: '',
})

const permitFormFromDetail = (detail: FederalApplicationDetail): FederalPermitMutation => ({
  permitNumber: detail.federalPermit?.permitNumber ?? null,
  permitIssueDate: detail.federalPermit?.permitIssueDate ?? '',
  destinationCountry: detail.federalPermit?.destinationCountry ?? '',
  transportType: detail.federalPermit?.transportType ?? '',
  transportName: detail.federalPermit?.transportName ?? '',
  shippingDate: detail.federalPermit?.shippingDate ?? '',
  portOfExport: detail.federalPermit?.portOfExport ?? '',
  otherPortOfExport: detail.federalPermit?.otherPortOfExport ?? '',
})

const applicantTypeLabel = (value: string | null | undefined): string => {
  const normalizedValue = value?.trim().toUpperCase()
  if (normalizedValue === 'A') return 'Agent'
  if (normalizedValue === 'O') return 'Owner'
  return value?.trim() ?? ''
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

const FederalApplicationDetailsPage = () => {
  const navigate = useNavigate()
  const { capabilities, canPerform, defaultRoute } = useAuth()
  const location = useLocation()
  const { applicationNumber } = useParams()
  const [searchParams] = useSearchParams()
  const fallbackReturnTo = canPerform('/federalApplicationSearch')
    ? { label: 'Federal application search', to: '/federal' }
    : { label: 'Your landing page', to: defaultRoute }
  const detailReturnTo = readDetailReturnTo(location.state) ?? fallbackReturnTo
  const [detail, setDetail] = useState<FederalApplicationDetail | null>(null)
  const detailRef = useRef<FederalApplicationDetail | null>(null)
  const [documentRows, setDocumentRows] = useState<FederalApplicationDocumentRow[]>([])
  const [remarkRows, setRemarkRows] = useState<FederalApplicationRemark[]>([])
  const [scaleRows, setScaleRows] = useState<FederalApplicationScaleRow[]>([])
  const [scaleErrorMessage, setScaleErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [remarksErrorMessage, setRemarksErrorMessage] = useState('')
  // Documents results show in the Documents tab; every other result stays at page level.
  const [actionResult, setActionResult] = useState<
    (ActionResult & { source?: 'documents' }) | null
  >(null)
  const documentActionResult = actionResult?.source === 'documents' ? actionResult : null
  const pageActionResult = actionResult?.source === 'documents' ? null : actionResult
  const [statusCode, setStatusCode] = useState('')
  const [statusRemark, setStatusRemark] = useState('')
  const [remarkDraft, setRemarkDraft] = useState('')
  const [editingRemarkId, setEditingRemarkId] = useState<number | null>(null)
  const [remarkValidationMessage, setRemarkValidationMessage] = useState('')
  const [permitForm, setPermitForm] = useState<FederalPermitMutation>(emptyPermitForm)
  const [editingSection, setEditingSection] = useState<FederalEditSection | null>(null)
  const isEditingFederalStatus = editingSection === 'status'
  const isEditingFederalRemarks = isRemarkSection(editingSection)
  const isEditingFederalPermit = editingSection === 'permit'
  const [isEditingFederalDocuments, setIsEditingFederalDocuments] = useState(false)
  const {
    clearFieldError: clearStatusFieldError,
    resetFieldErrors: resetStatusFieldErrors,
    showFieldErrors: showStatusFieldErrors,
    invalidProps: statusInvalidProps,
  } = useFieldErrors<FederalStatusField>()
  const {
    clearFieldError: clearPermitFieldError,
    resetFieldErrors: resetPermitFieldErrors,
    showFieldErrors: showPermitFieldErrors,
    invalidProps: permitInvalidProps,
  } = useFieldErrors<FederalPermitField>()
  const statusFormRef = useRef<HTMLDivElement>(null)
  const permitFormRef = useRef<HTMLDivElement>(null)
  const remarkFormRef = useRef<HTMLDivElement>(null)
  const [isSavingMutation, setIsSavingMutation] = useState(false)
  const [isSavingRemark, setIsSavingRemark] = useState(false)
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [documentUploadDirty, setDocumentUploadDirty] = useState(false)
  const [documentUploadBusy, setDocumentUploadBusy] = useState(false)
  const [documentUploadResetKey, setDocumentUploadResetKey] = useState(0)
  const [selectedFederalApplicationTab, selectFederalApplicationTab] = useReloadPreservedTab({
    tabs: FEDERAL_APPLICATION_DETAIL_TAB_SLOTS,
    defaultTab: 'owner',
  })
  const [shippingReferences, setShippingReferences] = useState<ShippingReferenceOptions | null>(
    null,
  )
  const [isShippingReferencesLoading, setIsShippingReferencesLoading] = useState(true)
  const [shippingReferencesErrorMessage, setShippingReferencesErrorMessage] = useState('')
  const beginDetailRequest = useLatestRequestGuard()
  const currentDetail =
    detail && String(detail.applicationNumber) === applicationNumber ? detail : null
  const federalApplicationDisplayNumber =
    currentDetail?.federalApplicationNumber?.trim() ||
    String(currentDetail?.applicationNumber ?? applicationNumber ?? '').trim()
  const isRefreshingDetail = loading && !!currentDetail

  const federalApplicationLocked = currentDetail?.locked === true
  const canViewFederalApplication =
    canPerform('/federalApplicationDetails') && canPerform('viewFederalApplication')
  // Writes also need the application's region when the user's grant is regional.
  const applicationOrgUnit = currentDetail?.orgUnitNumber ?? null
  const canManageFederalApplication = canPerform('manageFederalApplication', applicationOrgUnit)
  const canMutateFederalApplication =
    canManageFederalApplication &&
    !!currentDetail &&
    !currentDetail.readOnly &&
    !federalApplicationLocked
  const applicationStatusCode = currentDetail?.statusCode?.trim().toUpperCase() ?? ''
  // Staff document maintenance stays role-based, limited to the application's region for
  // regional grants; it does not depend on holding the upload action.
  const applicationDocumentEditor =
    (hasRole(capabilities.roles, 'APPLICATION_APPROVER') || hasRole(capabilities.roles, 'ADMIN')) &&
    withinRegions(allowedRegions(capabilities, '/fileApplicationUpload'), applicationOrgUnit)
  // INTENTIONAL_LEGACY_DIVERGENCE(EXPIRED_DOCUMENT_MAINTENANCE): Expiry may lock the
  // federal application form while authorized staff can still maintain its documents.
  const canMaintainApplicationDocuments =
    !!currentDetail &&
    !federalApplicationLocked &&
    (!currentDetail.readOnly || (applicationStatusCode === 'EXP' && applicationDocumentEditor))
  const canUploadApplicationDocuments =
    canPerform('/fileApplicationUpload', applicationOrgUnit) && canMaintainApplicationDocuments
  const businessToday = formatBusinessIsoDate()
  const statusTransitions = allowedFederalStatusTransitions(
    applicationStatusCode,
    currentDetail?.listingDate,
    businessToday,
  )
  const statusDraftDirty =
    canMutateFederalApplication &&
    isEditingFederalStatus &&
    (statusCode !== (statusTransitions[0]?.code ?? '') || statusRemark.length > 0)
  const permitDraftDirty =
    isEditingFederalPermit &&
    canMutateFederalApplication &&
    !!detail &&
    !formValuesEqual(permitForm, permitFormFromDetail(detail))
  const remarkBaseline =
    editingRemarkId === null
      ? ''
      : (remarkRows.find((remark) => remark.remarkId === editingRemarkId)?.remark ?? '')
  const remarkDraftDirty =
    canMutateFederalApplication && isEditingFederalRemarks && remarkDraft !== remarkBaseline
  const independentDraftsRef = useRef({ statusDraftDirty, permitDraftDirty, statusCode })
  useEffect(() => {
    independentDraftsRef.current = { statusDraftDirty, permitDraftDirty, statusCode }
  }, [statusDraftDirty, permitDraftDirty, statusCode])
  const canDeleteApplicationDocuments =
    canMaintainApplicationDocuments && applicationStatusCode.length > 0 && applicationDocumentEditor
  const hasAgent = currentDetail?.ownerApplicantType?.trim().toUpperCase() === 'A'
  const federalApplicationDetailTabs: FederalApplicationDetailTabKey[] = [
    'owner',
    ...(hasAgent ? (['agent'] as const) : []),
    'application',
    'items',
    'offers',
    ...(canViewFederalApplication ? (['remarks'] as const) : []),
    'documents',
    'shipping',
  ]
  const activeFederalApplicationTab = federalApplicationDetailTabs.includes(
    selectedFederalApplicationTab,
  )
    ? selectedFederalApplicationTab
    : 'owner'
  const selectedFederalApplicationTabIndex = Math.max(
    0,
    FEDERAL_APPLICATION_DETAIL_TAB_SLOTS.indexOf(activeFederalApplicationTab),
  )

  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
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
            'Shipping reference options could not be loaded. Federal permit changes are unavailable.',
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

  const permitValidationErrors = useMemo<FieldErrors<FederalPermitField>>(
    () => ({
      permitIssueDate: firstValidationError(
        () => requiredFieldError(permitForm.permitIssueDate, 'Permit issue date'),
        () => isoDateFieldError(permitForm.permitIssueDate),
      ),
      destinationCountry:
        requiredExactLengthFieldError(
          permitForm.destinationCountry,
          2,
          'Final destination country',
        ) ?? undefined,
      transportType:
        requiredExactLengthFieldError(permitForm.transportType, 1, 'Transport type') ?? undefined,
      transportName:
        firstValidationError(
          () => requiredMaxLengthFieldError(permitForm.transportName, 26, 'Transport name'),
          () =>
            ASCII_PATTERN.test(permitForm.transportName.trim())
              ? null
              : 'Transport name contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
        ) ?? undefined,
      shippingDate: firstValidationError(
        () => requiredFieldError(permitForm.shippingDate, 'Estimated shipping date'),
        () => isoDateFieldError(permitForm.shippingDate),
      ),
      portOfExport:
        requiredExactLengthFieldError(permitForm.portOfExport, 2, 'Customs port of export') ??
        undefined,
      otherPortOfExport:
        permitForm.portOfExport.trim().toUpperCase() === 'OT'
          ? (firstValidationError(
              () =>
                requiredMaxLengthFieldError(
                  permitForm.otherPortOfExport,
                  34,
                  'Other port of export',
                ),
              () =>
                ASCII_PATTERN.test(permitForm.otherPortOfExport.trim())
                  ? null
                  : 'Other port of export contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
            ) ?? undefined)
          : undefined,
    }),
    [permitForm],
  )

  useEffect(() => {
    detailRef.current = detail
  }, [detail])

  useEffect(() => {
    const load = async () => {
      const isLatestRequest = beginDetailRequest()
      if (!applicationNumber) {
        setErrorMessage('Application number is missing from the route.')
        setDetail(null)
        setDocumentRows([])
        setRemarkRows([])
        setScaleRows([])
        setScaleErrorMessage('')
        setDocumentsErrorMessage('')
        setRemarksErrorMessage('')
        setActionResult(null)
        setLoading(false)
        return
      }

      const isRefreshingCurrentApplication =
        detailRef.current !== null &&
        String(detailRef.current.applicationNumber) === applicationNumber
      setLoading(true)
      setErrorMessage('')
      setDocumentsErrorMessage('')
      setRemarksErrorMessage('')
      if (!isRefreshingCurrentApplication) {
        setDocumentRows([])
        setRemarkRows([])
        setScaleRows([])
      }
      setScaleErrorMessage('')
      setActionResult(null)
      try {
        const response = await fetchFederalApplicationDetail(applicationNumber)
        if (!isLatestRequest()) {
          return
        }
        setDetail(response)
        setStatusCode(
          allowedFederalStatusTransitions(
            response?.statusCode,
            response?.listingDate,
            formatBusinessIsoDate(),
          )[0]?.code ?? '',
        )
        setStatusRemark('')
        setPermitForm(response ? permitFormFromDetail(response) : emptyPermitForm())
        setEditingSection(null)
        setIsEditingFederalDocuments(false)
        if (!response) {
          setErrorMessage(`No federal application found for ${applicationNumber}.`)
          setDocumentRows([])
          setRemarkRows([])
          setScaleRows([])
          setScaleErrorMessage('')
          setRemarksErrorMessage('')
          return
        }

        const loadScaleRows = async () => {
          try {
            const packageScaleRows = await Promise.all(
              response.packages.map(async (packageNumber) =>
                (await fetchApplicationPackageScales(packageNumber)).map((row) => ({
                  ...row,
                  packageNumber,
                })),
              ),
            )
            if (isLatestRequest()) {
              setScaleRows(packageScaleRows.flat())
              setScaleErrorMessage('')
            }
          } catch (error) {
            if (isLatestRequest()) {
              console.error(error)
              setScaleRows([])
              setScaleErrorMessage('Unable to retrieve federal application scale details.')
            }
          }
        }

        const loadDocuments = async () => {
          try {
            const documentsResult = await fetchFederalApplicationDocuments(applicationNumber)
            if (isLatestRequest()) {
              setDocumentRows(documentsResult.rows)
            }
          } catch (error) {
            if (isLatestRequest()) {
              console.error(error)
              setDocumentRows([])
              setDocumentsErrorMessage('Unable to retrieve federal application documents.')
            }
          }
        }

        const loadRemarks = async () => {
          if (!canViewFederalApplication) {
            if (isLatestRequest()) {
              setRemarkRows([])
              setRemarksErrorMessage('')
            }
            return
          }

          try {
            const remarks = await fetchFederalApplicationRemarks(applicationNumber)
            if (isLatestRequest()) {
              setRemarkRows(remarks)
              setRemarksErrorMessage('')
            }
          } catch (error) {
            if (isLatestRequest()) {
              console.error(error)
              setRemarkRows([])
              setRemarksErrorMessage('Unable to retrieve federal application remarks.')
            }
          }
        }

        await Promise.all([loadScaleRows(), loadDocuments(), loadRemarks()])
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve federal application detail.')
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    }

    void load()
  }, [applicationNumber, beginDetailRequest, canViewFederalApplication])

  useEffect(() => {
    return () => {
      if (applicationNumber && canManageFederalApplication) {
        void releaseApplicationEditLock(applicationNumber)
      }
    }
  }, [applicationNumber, canManageFederalApplication])

  const refreshDetail = useCallback(
    async (savedSection: 'status' | 'permit') => {
      if (!applicationNumber) return
      const refreshed = await fetchFederalApplicationDetail(applicationNumber)
      setDetail(refreshed)
      const refreshedTransitions = allowedFederalStatusTransitions(
        refreshed?.statusCode,
        refreshed?.listingDate,
        formatBusinessIsoDate(),
      )
      const canContinueEditing =
        canManageFederalApplication && !!refreshed && !refreshed.readOnly && !refreshed.locked
      const drafts = independentDraftsRef.current
      // Saving one tab must not discard an independent draft still allowed by the refreshed record.
      if (
        savedSection === 'status' ||
        !canContinueEditing ||
        !drafts.statusDraftDirty ||
        !refreshedTransitions.some((transition) => transition.code === drafts.statusCode)
      ) {
        setStatusCode(refreshedTransitions[0]?.code ?? '')
        setStatusRemark('')
        setEditingSection((current) => (current === 'status' ? null : current))
      }
      if (savedSection === 'permit' || !canContinueEditing || !drafts.permitDraftDirty) {
        setPermitForm(refreshed ? permitFormFromDetail(refreshed) : emptyPermitForm())
        setEditingSection((current) => (current === 'permit' ? null : current))
      }
      if (canViewFederalApplication) {
        try {
          setRemarkRows(await fetchFederalApplicationRemarks(applicationNumber))
          setRemarksErrorMessage('')
        } catch (error) {
          console.error(error)
          setRemarkRows([])
          setRemarksErrorMessage('Unable to refresh federal application remarks.')
        }
      }
    },
    [applicationNumber, canManageFederalApplication, canViewFederalApplication],
  )

  const onSaveStatus = useCallback(async (): Promise<boolean> => {
    if (
      !applicationNumber ||
      !canMutateFederalApplication ||
      !statusTransitions.some((transition) => transition.code === statusCode)
    )
      return false
    const statusRemarkError = statusRemarkRequired(statusCode)
      ? requiredFieldError(statusRemark, 'Remark')
      : null
    if (!showStatusFieldErrors({ statusRemark: statusRemarkError }, () => statusFormRef.current)) {
      return false
    }
    setActionResult(null)
    setIsSavingMutation(true)
    try {
      const result = await updateFederalApplicationStatus(
        applicationNumber,
        statusCode,
        statusRemark,
      )
      if (!result.success) {
        const { fieldErrors, otherErrors } = splitServerErrors(
          result.errors,
          federalStatusServerField,
        )
        showStatusFieldErrors(fieldErrors, () => statusFormRef.current)
        if (otherErrors.length > 0 || !hasFieldErrors(fieldErrors)) {
          setActionResult({
            kind: 'error',
            message: otherErrors[0] || 'Unable to update federal application status.',
          })
        }
        return false
      }
      try {
        await refreshDetail('status')
        setActionResult({
          kind: 'success',
          message: result.message || 'Federal application status updated.',
        })
      } catch {
        setActionResult({
          kind: 'warning',
          message:
            'Federal application status updated, but details could not be refreshed. Reload before making more changes.',
        })
      }
      setEditingSection((current) => (current === 'status' ? null : current))
      return true
    } catch (error) {
      console.error(error)
      setActionResult({ kind: 'error', message: 'Unable to update federal application status.' })
      return false
    } finally {
      setIsSavingMutation(false)
    }
  }, [
    applicationNumber,
    canMutateFederalApplication,
    refreshDetail,
    showStatusFieldErrors,
    statusCode,
    statusRemark,
    statusTransitions,
  ])

  const onSavePermit = useCallback(async (): Promise<boolean> => {
    if (!applicationNumber || !canMutateFederalApplication) return false
    if (!shippingReferences) {
      setActionResult({
        kind: 'error',
        message:
          'Shipping reference options are unavailable. Reload the page before saving the federal permit.',
      })
      return false
    }
    if (isSavingMutation) return false
    if (detail?.federalPermit && !permitDraftDirty) {
      resetPermitFieldErrors()
      setActionResult(null)
      setEditingSection(null)
      return true
    }
    if (!showPermitFieldErrors(permitValidationErrors, () => permitFormRef.current)) {
      return false
    }
    setActionResult(null)
    setIsSavingMutation(true)
    try {
      const result = await saveFederalPermit(applicationNumber, permitForm, !!detail?.federalPermit)
      if (!result.success) {
        const { fieldErrors, otherErrors } = splitServerErrors(
          result.errors,
          federalPermitServerField,
        )
        showPermitFieldErrors(fieldErrors, () => permitFormRef.current)
        if (otherErrors.length > 0 || !hasFieldErrors(fieldErrors)) {
          setActionResult({
            kind: 'error',
            message: otherErrors[0] || 'Unable to save federal permit.',
          })
        }
        return false
      }
      try {
        await refreshDetail('permit')
        setActionResult({ kind: 'success', message: result.message || 'Federal permit saved.' })
      } catch {
        setActionResult({
          kind: 'warning',
          message:
            'Federal permit saved, but details could not be refreshed. Reload before making more changes.',
        })
      }
      setEditingSection((current) => (current === 'permit' ? null : current))
      return true
    } catch (error) {
      console.error(error)
      setActionResult({ kind: 'error', message: 'Unable to save federal permit.' })
      return false
    } finally {
      setIsSavingMutation(false)
    }
  }, [
    isSavingMutation,
    permitDraftDirty,
    resetPermitFieldErrors,
    applicationNumber,
    canMutateFederalApplication,
    detail?.federalPermit,
    permitForm,
    permitValidationErrors,
    refreshDetail,
    shippingReferences,
    showPermitFieldErrors,
  ])

  const onSaveRemark = useCallback(async (): Promise<boolean> => {
    if (!applicationNumber || !canMutateFederalApplication || isSavingRemark) return false

    if (editingRemarkId !== null && !remarkDraftDirty) {
      setRemarkValidationMessage('')
      setActionResult(null)
      setEditingSection(null)
      setRemarkDraft('')
      setEditingRemarkId(null)
      return true
    }

    const normalizedRemark = remarkDraft.trim()
    const remarkError = !normalizedRemark
      ? 'Remark is required.'
      : normalizedRemark.length > 250
        ? 'Remark must not exceed 250 characters.'
        : ''
    if (remarkError) {
      setRemarkValidationMessage(remarkError)
      focusFirstInvalidFieldAfterRender(() => remarkFormRef.current)
      return false
    }

    setRemarkValidationMessage('')
    setActionResult(null)
    setIsSavingRemark(true)
    try {
      const result = await saveFederalApplicationRemark(
        applicationNumber,
        normalizedRemark,
        editingRemarkId ?? undefined,
      )
      if (!result.success) {
        const { fieldErrors, otherErrors } = splitServerErrors(
          result.errors,
          federalRemarkServerField,
        )
        if (fieldErrors.remark) {
          setRemarkValidationMessage(fieldErrors.remark)
          focusFirstInvalidFieldAfterRender(() => remarkFormRef.current)
        }
        if (otherErrors.length > 0 || !fieldErrors.remark) {
          setActionResult({
            kind: 'error',
            message: otherErrors[0] || 'Unable to save federal application remark.',
          })
        }
        return false
      }
      try {
        setRemarkRows(await fetchFederalApplicationRemarks(applicationNumber))
        setRemarksErrorMessage('')
        setActionResult({
          kind: 'success',
          message: result.message || 'Federal application remark saved.',
        })
      } catch {
        setActionResult({
          kind: 'warning',
          message:
            'Federal application remark saved, but remarks could not be refreshed. Reload before making more changes.',
        })
      }
      setEditingRemarkId(null)
      setRemarkDraft('')
      setRemarkValidationMessage('')
      setEditingSection((current) => (isRemarkSection(current) ? null : current))
      return true
    } catch (error) {
      console.error(error)
      setActionResult({ kind: 'error', message: 'Unable to save federal application remark.' })
      return false
    } finally {
      setIsSavingRemark(false)
    }
  }, [
    applicationNumber,
    canMutateFederalApplication,
    editingRemarkId,
    isSavingRemark,
    remarkDraft,
    remarkDraftDirty,
  ])

  const refreshFederalApplicationDocuments = useCallback(async () => {
    if (!applicationNumber) {
      return
    }

    const documentsResult = await fetchFederalApplicationDocuments(applicationNumber)
    setDocumentRows(documentsResult.rows)
    setDocumentsErrorMessage('')
  }, [applicationNumber])

  const onDiscardFederalSection = useCallback(
    (section: FederalEditSection) => {
      if (section === 'status') {
        setStatusCode(statusTransitions[0]?.code ?? '')
        setStatusRemark('')
        resetStatusFieldErrors()
      } else if (section === 'permit') {
        setPermitForm(detail ? permitFormFromDetail(detail) : emptyPermitForm())
        resetPermitFieldErrors()
      } else {
        setRemarkDraft('')
        setEditingRemarkId(null)
        setRemarkValidationMessage('')
      }
      setActionResult(withoutActionError)
    },
    [detail, resetPermitFieldErrors, resetStatusFieldErrors, statusTransitions],
  )

  const onCancelFederalDocumentEdit = useCallback(() => {
    setDocumentUploadDirty(false)
    setDocumentUploadBusy(false)
    setDocumentUploadResetKey((current) => current + 1)
    setActionResult(withoutActionError)
    setIsEditingFederalDocuments(false)
  }, [])

  const fetchFederalApplicationDocument = useCallback(
    (row: FederalApplicationDocumentRow) =>
      openFederalApplicationDocument(row.id, row.name, applicationNumber ?? ''),
    [applicationNumber],
  )
  const clearActionResult = useCallback(() => setActionResult(null), [])
  const showDocumentOpenError = useCallback(
    (message: string) => setActionResult({ kind: 'error', message, source: 'documents' }),
    [],
  )
  const onOpenDocument = useDocumentOpener({
    recordKey: applicationNumber,
    fetchDocument: fetchFederalApplicationDocument,
    onStart: clearActionResult,
    onError: showDocumentOpenError,
  })

  const onRemoveDocument = useCallback(
    async (row: FederalApplicationDocumentRow) => {
      if (!applicationNumber || federalApplicationLocked || !canDeleteApplicationDocuments) {
        throw new Error('This document cannot be deleted from the current application.')
      }

      const isLatestRequest = beginDetailRequest()
      setIsRemovingDocumentId(row.id)
      setActionResult(null)

      try {
        const removeResult = await removeFederalApplicationDocument(row.id, applicationNumber)
        if (!isLatestRequest()) {
          return
        }
        if (!removeResult.success) {
          throw new Error('Document removal failed. Refresh and try again.')
        }

        try {
          const documentsResult = await fetchFederalApplicationDocuments(applicationNumber)
          if (isLatestRequest()) {
            setDocumentRows(documentsResult.rows)
            setDocumentsErrorMessage('')
            setActionResult({ ...DOCUMENT_DELETED_RESULT, source: 'documents' })
          }
        } catch (refreshError) {
          if (isLatestRequest()) {
            console.error(refreshError)
            setDocumentsErrorMessage(
              'The document was deleted, but federal application documents could not be refreshed. Reload the page.',
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
    [
      applicationNumber,
      beginDetailRequest,
      canDeleteApplicationDocuments,
      federalApplicationLocked,
    ],
  )

  const isFederalApplicationDirty =
    statusDraftDirty || remarkDraftDirty || permitDraftDirty || documentUploadDirty
  const isFederalApplicationBusy =
    isSavingMutation || isSavingRemark || isRemovingDocumentId !== null || documentUploadBusy
  const onDiscardFederalApplicationChanges = useCallback(() => {
    setStatusCode(statusTransitions[0]?.code ?? '')
    setStatusRemark('')
    setRemarkDraft('')
    setEditingRemarkId(null)
    setRemarkValidationMessage('')
    setPermitForm(detail ? permitFormFromDetail(detail) : emptyPermitForm())
    resetStatusFieldErrors()
    resetPermitFieldErrors()
    setEditingSection(null)
    setIsEditingFederalDocuments(false)
    setDocumentUploadDirty(false)
    setDocumentUploadBusy(false)
    setDocumentUploadResetKey((current) => current + 1)
    setActionResult(withoutActionError)
  }, [detail, resetPermitFieldErrors, resetStatusFieldErrors, statusTransitions])

  const sections = useEditSections<FederalEditSection>({
    isDirty: statusDraftDirty || remarkDraftDirty || permitDraftDirty,
    onDiscard: onDiscardFederalSection,
    state: [editingSection, setEditingSection],
    leaveGuard: {
      isDirty: isFederalApplicationDirty,
      isBusy: isFederalApplicationBusy,
      onDiscard: () => {
        if (isEditingFederalDocuments || documentUploadDirty) onDiscardFederalApplicationChanges()
      },
    },
  })
  const editingRemarkSection = isRemarkSection(editingSection) ? editingSection : null

  const onStartFederalPermitEdit = () => {
    if (
      !canMutateFederalApplication ||
      !detail ||
      isShippingReferencesLoading ||
      !shippingReferences
    ) {
      return
    }
    sections.startEditing('permit', () => {
      setPermitForm(permitFormFromDetail(detail))
      resetPermitFieldErrors()
      setActionResult(withoutActionError)
    })
  }

  const renderFederalShippingFields = () => {
    if (!detail) return null
    const editing = isEditingFederalPermit && canMutateFederalApplication
    const otherPortSelected =
      (editing ? permitForm.portOfExport : detail.federalPermit?.portOfExport)
        ?.trim()
        .toUpperCase() === 'OT'
    return (
      <RecordFieldGrid ref={permitFormRef} editing={editing}>
        <RecordFieldRow>
          <RecordField
            label="Permit issue date"
            value={displayValue(detail.federalPermit?.permitIssueDate)}
            edit={() => (
              <IsoDatePicker
                id="federalPermitIssueDate"
                labelText={requiredLabel('Permit issue date')}
                required
                value={permitForm.permitIssueDate}
                {...permitInvalidProps('permitIssueDate')}
                onChange={(value) => {
                  setPermitForm((current) => ({
                    ...current,
                    permitIssueDate: value,
                  }))
                  clearPermitFieldError('permitIssueDate')
                }}
              />
            )}
          />
        </RecordFieldRow>
        <RecordFieldRow>
          <RecordField
            label="Final destination country"
            value={displayValue(
              shippingReferenceLabel(
                shippingReferences?.countries,
                detail.federalPermit?.destinationCountry,
              ),
            )}
            span="wide"
            edit={() => (
              <Select
                id="federalPermitDestinationCountry"
                labelText={requiredLabel('Final destination country')}
                aria-required="true"
                value={permitForm.destinationCountry}
                {...permitInvalidProps('destinationCountry')}
                onChange={(event) => {
                  setPermitForm((current) => ({
                    ...current,
                    destinationCountry: event.target.value,
                  }))
                  clearPermitFieldError('destinationCountry')
                }}
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
          />
        </RecordFieldRow>
        <RecordFieldRow>
          <RecordField
            label="Transport type"
            value={displayValue(
              shippingReferenceLabel(
                shippingReferences?.transportTypes,
                detail.federalPermit?.transportType,
              ),
            )}
            edit={() => (
              <Select
                id="federalPermitTransportType"
                labelText={requiredLabel('Transport type')}
                aria-required="true"
                value={permitForm.transportType}
                {...permitInvalidProps('transportType')}
                onChange={(event) => {
                  setPermitForm((current) => ({
                    ...current,
                    transportType: event.target.value,
                  }))
                  clearPermitFieldError('transportType')
                }}
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
            )}
          />
          <RecordField
            label="Transport name"
            value={displayValue(detail.federalPermit?.transportName)}
            edit={() => (
              <TextInput
                id="federalPermitTransportName"
                labelText={requiredLabel('Transport name')}
                aria-required="true"
                value={permitForm.transportName}
                maxLength={26}
                {...permitInvalidProps('transportName')}
                onChange={(event) => {
                  setPermitForm((current) => ({
                    ...current,
                    transportName: event.target.value,
                  }))
                  clearPermitFieldError('transportName')
                }}
              />
            )}
          />
        </RecordFieldRow>
        <RecordFieldRow>
          <RecordField
            label="Estimated shipping date"
            value={displayValue(detail.federalPermit?.shippingDate)}
            edit={() => (
              <IsoDatePicker
                id="federalPermitShippingDate"
                labelText={requiredLabel('Estimated shipping date')}
                required
                value={permitForm.shippingDate}
                {...permitInvalidProps('shippingDate')}
                onChange={(value) => {
                  setPermitForm((current) => ({
                    ...current,
                    shippingDate: value,
                  }))
                  clearPermitFieldError('shippingDate')
                }}
              />
            )}
          />
        </RecordFieldRow>
        <RecordFieldRow>
          <RecordField
            label="Customs port of export"
            value={displayValue(
              shippingReferenceLabel(shippingReferences?.ports, detail.federalPermit?.portOfExport),
            )}
            edit={() => (
              <Select
                id="federalPermitPortOfExport"
                labelText={requiredLabel('Customs port of export')}
                aria-required="true"
                value={permitForm.portOfExport}
                {...permitInvalidProps('portOfExport')}
                onChange={(event) => {
                  const portCode = event.target.value
                  setPermitForm((current) => ({
                    ...current,
                    portOfExport: portCode,
                    otherPortOfExport:
                      portCode.toUpperCase() === 'OT' ? current.otherPortOfExport : '',
                  }))
                  clearPermitFieldError('portOfExport')
                  clearPermitFieldError('otherPortOfExport')
                }}
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
            )}
          />
          <RecordField
            label="Other port of export"
            value={displayValue(detail.federalPermit?.otherPortOfExport)}
            hidden={!otherPortSelected}
            edit={() => (
              <TextInput
                id="federalPermitOtherPort"
                labelText={requiredLabel('Other port of export')}
                aria-required="true"
                value={permitForm.otherPortOfExport}
                maxLength={34}
                {...permitInvalidProps('otherPortOfExport')}
                onChange={(event) => {
                  setPermitForm((current) => ({
                    ...current,
                    otherPortOfExport: event.target.value,
                  }))
                  clearPermitFieldError('otherPortOfExport')
                }}
              />
            )}
          />
        </RecordFieldRow>
      </RecordFieldGrid>
    )
  }

  return (
    <Grid fullWidth className="default-grid detail-page-grid">
      <Column sm={4} md={8} lg={16}>
        <DetailBreadcrumb
          label={fallbackReturnTo.label}
          to={fallbackReturnTo.to}
          returnTo={detailReturnTo}
        />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <PageHeader
          title={`Federal application ${federalApplicationDisplayNumber}`.trim()}
          subtitle="Check and manage this federal application"
          status={
            currentDetail ? (
              <StatusTag
                status={currentDetail.statusDescription ?? currentDetail.statusCode ?? ''}
                fallbackLabel="Not provided"
              />
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
          <Loading description="Loading federal application detail…" withOverlay={false} />
        </Column>
      )}

      {!loading && !!errorMessage && <DetailLoadError message={errorMessage} />}

      {detail && currentDetail && (
        <>
          {!!pageActionResult && (
            <Column
              sm={4}
              md={8}
              lg={16}
              className={pageActionResult.kind === 'error' ? 'detail-page-error' : undefined}
            >
              <ActionResultNotification
                result={pageActionResult}
                onClose={() => setActionResult(null)}
              />
            </Column>
          )}
          {federalApplicationLocked && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                className="detail-context-notification"
                kind="warning"
                title="Application locked"
                subtitle={
                  currentDetail.lockMessage ||
                  'This application is currently locked for editing by another user.'
                }
                lowContrast
                hideCloseButton
              />
            </Column>
          )}

          <Column
            sm={4}
            md={8}
            lg={16}
            className={`application-detail-tabs-column content-loading-region${
              isRefreshingDetail ? ' is-loading' : ''
            }`}
            inert={isRefreshingDetail ? true : undefined}
            aria-busy={isRefreshingDetail}
          >
            <ContentLoadingOverlay
              loading={isRefreshingDetail}
              loadingDescription="Refreshing federal application detail…"
            />
            <Tabs
              selectedIndex={selectedFederalApplicationTabIndex}
              onChange={({ selectedIndex }) => {
                sections.confirmLeave(() =>
                  selectFederalApplicationTab(
                    FEDERAL_APPLICATION_DETAIL_TAB_SLOTS[selectedIndex] ?? 'owner',
                  ),
                )
              }}
            >
              <TabList
                aria-label="Federal application detail sections"
                contained
                className="application-tabs__list application-detail-tab-list"
              >
                <Tab>Applicant</Tab>
                {hasAgent && <Tab>Agent</Tab>}
                <Tab>Application</Tab>
                <Tab>Items</Tab>
                <Tab>Offers</Tab>
                {canViewFederalApplication && <Tab>Remarks</Tab>}
                <Tab>Documents</Tab>
                <Tab>Shipping details</Tab>
              </TabList>
              <TabPanels>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <DetailFieldTile
                        title="Applicant"
                        fields={[
                          [
                            {
                              label: 'Contact name',
                              value: displayValue(detail.ownerContactName),
                            },
                            {
                              label: 'Applicant type',
                              value: displayValue(applicantTypeLabel(detail.ownerApplicantType)),
                            },
                          ],
                          [
                            {
                              label: 'Client',
                              span: 'wide',
                              value: displayValue(
                                [detail.ownerCompanyName?.trim(), detail.ownerClientNumber?.trim()]
                                  .filter(Boolean)
                                  .join(' · '),
                              ),
                            },
                            {
                              label: 'Client location',
                              value: displayValue(detail.ownerClientLocationCode),
                              span: 'wide',
                            },
                          ],
                          [
                            {
                              label: 'Address',
                              value: displayValue(detail.ownerClientContext?.address),
                              span: 'wide',
                            },
                            {
                              label: 'City',
                              value: displayValue(detail.ownerClientContext?.city),
                            },
                            {
                              label: 'Province',
                              value: displayValue(detail.ownerClientContext?.province),
                            },
                          ],
                          [
                            {
                              label: 'Country',
                              value: displayValue(detail.ownerClientContext?.country),
                            },
                            {
                              label: 'Postal code',
                              value: displayValue(detail.ownerClientContext?.postalCode),
                            },
                          ],
                          [
                            {
                              label: 'Phone number',
                              value: displayValue(detail.ownerClientContext?.phone),
                            },
                            {
                              label: 'Fax number',
                              value: displayValue(detail.ownerClientContext?.fax),
                            },
                            {
                              label: 'Email address',
                              value: displayValue(detail.ownerClientContext?.email),
                            },
                          ],
                        ]}
                      />
                    </Column>
                  </Grid>
                </TabPanel>

                {hasAgent && (
                  <TabPanel className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <DetailFieldTile
                          title="Agent"
                          fields={[
                            [
                              {
                                label: 'Contact name',
                                value: displayValue(detail.agentContactName),
                              },
                              {
                                label: 'Applicant type',
                                value: displayValue(
                                  applicantTypeLabel(detail.agentApplicantType ?? 'A'),
                                ),
                              },
                            ],
                            [
                              {
                                label: 'Client',
                                span: 'wide',
                                value: displayValue(
                                  [
                                    detail.agentCompanyName?.trim(),
                                    detail.agentClientNumber?.trim(),
                                  ]
                                    .filter(Boolean)
                                    .join(' · '),
                                ),
                              },
                              {
                                label: 'Client location',
                                value: displayValue(detail.agentClientLocationCode),
                                span: 'wide',
                              },
                            ],
                            [
                              {
                                label: 'Address',
                                value: displayValue(detail.agentClientContext?.address),
                                span: 'wide',
                              },
                              {
                                label: 'City',
                                value: displayValue(detail.agentClientContext?.city),
                              },
                              {
                                label: 'Province',
                                value: displayValue(detail.agentClientContext?.province),
                              },
                            ],
                            [
                              {
                                label: 'Country',
                                value: displayValue(detail.agentClientContext?.country),
                              },
                              {
                                label: 'Postal code',
                                value: displayValue(detail.agentClientContext?.postalCode),
                              },
                            ],
                            [
                              {
                                label: 'Phone number',
                                value: displayValue(detail.agentClientContext?.phone),
                              },
                              {
                                label: 'Fax number',
                                value: displayValue(detail.agentClientContext?.fax),
                              },
                              {
                                label: 'Email address',
                                value: displayValue(detail.agentClientContext?.email),
                              },
                            ],
                          ]}
                        />
                      </Column>
                    </Grid>
                  </TabPanel>
                )}

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <DetailFieldTile
                        title="Application"
                        headerAction={
                          canMutateFederalApplication &&
                          statusTransitions.length > 0 &&
                          !isEditingFederalStatus ? (
                            <Button
                              ref={sections.editButtonRef('status')}
                              kind="tertiary"
                              size="md"
                              renderIcon={Edit}
                              onClick={() =>
                                sections.startEditing('status', () => {
                                  setStatusCode(statusTransitions[0]?.code ?? '')
                                  setStatusRemark('')
                                  resetStatusFieldErrors()
                                  setActionResult(withoutActionError)
                                })
                              }
                            >
                              Edit federal status
                            </Button>
                          ) : undefined
                        }
                        fields={[
                          [
                            {
                              label: 'Region',
                              value: displayValue(detail.region),
                              span: 'wide',
                            },
                            {
                              label: 'Product type',
                              value: displayValue(detail.productType),
                            },
                          ],
                          [
                            {
                              label: 'Application date',
                              value: displayValue(detail.applicationDate),
                            },
                            {
                              label: 'Date received',
                              value: displayValue(detail.receivedDate),
                            },
                            {
                              label: 'List date',
                              value: displayValue(detail.listingDate),
                            },
                          ],
                          [
                            {
                              label: 'Federal application number',
                              value: displayValue(detail.federalApplicationNumber),
                            },
                            {
                              label: 'Status',
                              value: (
                                <StatusTag
                                  status={detail.statusDescription ?? detail.statusCode ?? ''}
                                  fallbackLabel="Not provided"
                                />
                              ),
                            },
                            {
                              label: 'Author',
                              value: displayAuditIdentity(detail.author),
                            },
                          ],
                        ]}
                      />
                      {canMutateFederalApplication &&
                        statusTransitions.length > 0 &&
                        isEditingFederalStatus && (
                          <Tile ref={sections.sectionRef('status')}>
                            <h2 className="detail-tile-title">Update federal status</h2>
                            <RequiredFieldsLegend />
                            <RecordFieldGrid editing ref={statusFormRef}>
                              <RecordFieldRow>
                                <RecordFieldCell>
                                  <Select
                                    id="federalApplicationStatus"
                                    labelText={requiredLabel('Status')}
                                    aria-required="true"
                                    value={statusCode}
                                    {...statusInvalidProps('statusCode')}
                                    onChange={(event) => {
                                      setStatusCode(event.target.value)
                                      clearStatusFieldError('statusCode')
                                      if (!statusRemarkRequired(event.target.value)) {
                                        clearStatusFieldError('statusRemark')
                                      }
                                    }}
                                  >
                                    {statusTransitions.map((transition) => (
                                      <SelectItem
                                        key={transition.code}
                                        value={transition.code}
                                        text={transition.label}
                                      />
                                    ))}
                                  </Select>
                                </RecordFieldCell>
                              </RecordFieldRow>
                              <RecordFieldRow>
                                <RecordFieldCell span="full">
                                  <TextArea
                                    id="federalApplicationStatusRemark"
                                    labelText={requiredLabel(
                                      'Remark',
                                      statusCode === 'REJ' || statusCode === 'WDN',
                                    )}
                                    aria-required={
                                      statusCode === 'REJ' || statusCode === 'WDN'
                                        ? 'true'
                                        : undefined
                                    }
                                    value={statusRemark}
                                    {...statusInvalidProps('statusRemark')}
                                    onChange={(event) => {
                                      setStatusRemark(event.target.value)
                                      clearStatusFieldError('statusRemark')
                                    }}
                                  />
                                </RecordFieldCell>
                              </RecordFieldRow>
                            </RecordFieldGrid>
                            <div className="legacy-search-actions">
                              <Button
                                kind="ghost"
                                size="md"
                                disabled={isSavingMutation}
                                onClick={sections.cancelEditing}
                              >
                                Cancel
                              </Button>
                              <Button
                                kind="primary"
                                size="md"
                                disabled={isSavingMutation}
                                renderIcon={isSavingMutation ? PendingIcon : undefined}
                                onClick={() => void onSaveStatus()}
                              >
                                {isSavingMutation ? 'Saving…' : 'Update status'}
                              </Button>
                            </div>
                          </Tile>
                        )}
                    </Column>
                  </Grid>
                </TabPanel>

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <DetailFieldTile
                        title="Items"
                        fields={[
                          [
                            {
                              label: 'Location of logs',
                              value: displayValue(detail.logLocation),
                            },
                          ],
                          [
                            {
                              label: 'Age class',
                              value: displayValue(detail.ageClass),
                            },
                          ],
                          [
                            {
                              label: 'Average log volume (m³)',
                              value: displayVolume(detail.averageLogVolume),
                            },
                            {
                              label: 'Application volume (m³)',
                              value: displayVolume(detail.applicationVolume),
                            },
                          ],
                          [
                            {
                              label: 'Species and end use sort',
                              value: displayValue(detail.endUse),
                            },
                          ],
                        ]}
                      />
                    </Column>
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Packages</h2>
                        {detail.packages.length > 0 ? (
                          <TableFrame ariaLabel="Federal application packages">
                            <Table size="md" useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>Package number</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {detail.packages.map((item) => (
                                  <TableRow key={item}>
                                    <TableCell>{item}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <p className="detail-empty-message">
                            No package has been recorded for this federal application.
                          </p>
                        )}
                      </Tile>
                    </Column>
                    {/* INTENTIONAL_LEGACY_DIVERGENCE(PACKAGE_FIRST_ITEMS_WORKFLOW):
                        Suppress dependent Summary of scale content until a package exists. */}
                    {detail.packages.length > 0 && (
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <h2 className="detail-tile-title">Summary of scale</h2>
                          {scaleErrorMessage ? (
                            <EmptyState
                              title="Scale details unavailable"
                              description={scaleErrorMessage}
                              headingLevel={3}
                              role="alert"
                            />
                          ) : scaleRows.length > 0 ? (
                            <TableFrame ariaLabel="Federal application scale details">
                              <Table size="md" useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Package</TableHeader>
                                    <TableHeader>Timber mark</TableHeader>
                                    <TableHeader>Pieces</TableHeader>
                                    <TableHeader>Species</TableHeader>
                                    <TableHeader>Grade</TableHeader>
                                    <TableHeader>Volume (m³)</TableHeader>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {scaleRows.map((row) => (
                                    <TableRow key={`${row.packageNumber}-${row.id}`}>
                                      <TableCell>{row.packageNumber}</TableCell>
                                      <TableCell>{displayTableValue(row.timberMark)}</TableCell>
                                      <TableCell>{row.pieces.toLocaleString()}</TableCell>
                                      <TableCell>{displayTableValue(row.species)}</TableCell>
                                      <TableCell>{displayTableValue(row.grade)}</TableCell>
                                      <TableCell>{displayVolume(row.volume)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableFrame>
                          ) : (
                            <EmptyState
                              title="No scale details found"
                              description="No scale details are recorded for this federal application."
                              headingLevel={3}
                            />
                          )}
                        </Tile>
                      </Column>
                    )}
                  </Grid>
                </TabPanel>

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Offers</h2>
                        {detail.offers.length > 0 ? (
                          <TableFrame ariaLabel="Federal application offers">
                            <Table size="md" useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>Offer number</TableHeader>
                                  <TableHeader>Company</TableHeader>
                                  <TableHeader>Date received</TableHeader>
                                  <TableHeader>Actions</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {detail.offers.map((item) => (
                                  <TableRow key={item.offerNumber}>
                                    <TableCell>{displayValue(item.offerNumber)}</TableCell>
                                    <TableCell>{displayValue(item.companyName)}</TableCell>
                                    <TableCell>{displayValue(item.receivedDate)}</TableCell>
                                    <TableCell>
                                      <Button
                                        kind="ghost"
                                        size="md"
                                        disabled={
                                          !canPerform('/offersSearch') ||
                                          !canPerform('/offerDetails')
                                        }
                                        onClick={() =>
                                          navigate(
                                            withCurrentSearch(
                                              `/provincial/offers/${encodeURIComponent(item.offerNumber)}`,
                                            ),
                                            {
                                              state: withDetailReturnTo(
                                                location.state,
                                                {
                                                  label: 'Federal application detail',
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
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <EmptyState
                            title="No offers found"
                            description="No purchase offers are linked to this federal application."
                            headingLevel={3}
                          />
                        )}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>

                {canViewFederalApplication && (
                  <TabPanel className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <Tile
                          ref={
                            editingRemarkSection
                              ? sections.sectionRef(editingRemarkSection)
                              : undefined
                          }
                          className="application-detail-section application-detail-remarks"
                        >
                          <div className="detail-section-card__header">
                            <h2 className="detail-tile-title">Remarks</h2>
                            {canMutateFederalApplication && !isEditingFederalRemarks && (
                              <Button
                                ref={sections.editButtonRef('new-remark')}
                                kind="tertiary"
                                size="md"
                                onClick={() =>
                                  sections.startEditing('new-remark', () => {
                                    setRemarkDraft('')
                                    setEditingRemarkId(null)
                                    setRemarkValidationMessage('')
                                  })
                                }
                              >
                                Add remark
                              </Button>
                            )}
                          </div>
                          {canMutateFederalApplication && isEditingFederalRemarks && (
                            <div ref={remarkFormRef} className="legacy-search-actions">
                              <TextArea
                                id="federalApplicationRemark"
                                labelText={requiredLabel(
                                  editingRemarkId ? `Edit remark ${editingRemarkId}` : 'New remark',
                                )}
                                aria-required="true"
                                maxCount={250}
                                value={remarkDraft}
                                invalid={!!remarkValidationMessage}
                                invalidText={fieldErrorText(remarkValidationMessage)}
                                onChange={(event) => {
                                  setRemarkDraft(event.target.value)
                                  if (remarkValidationMessage) {
                                    setRemarkValidationMessage('')
                                  }
                                }}
                              />
                              <Button
                                kind="ghost"
                                size="md"
                                disabled={isSavingRemark}
                                onClick={sections.cancelEditing}
                              >
                                Cancel
                              </Button>
                              <Button
                                kind="primary"
                                size="md"
                                disabled={isSavingRemark}
                                renderIcon={isSavingRemark ? PendingIcon : undefined}
                                onClick={() => void onSaveRemark()}
                              >
                                {isSavingRemark
                                  ? 'Saving…'
                                  : editingRemarkId
                                    ? 'Update remark'
                                    : 'Save remark'}
                              </Button>
                            </div>
                          )}
                          {remarksErrorMessage ? (
                            <EmptyState
                              title="Remarks unavailable"
                              description={remarksErrorMessage}
                              headingLevel={3}
                              role="alert"
                            />
                          ) : remarkRows.length > 0 ? (
                            <TableFrame ariaLabel="Federal application remarks">
                              <Table size="md" useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Date</TableHeader>
                                    <TableHeader>User</TableHeader>
                                    <TableHeader>Remark</TableHeader>
                                    {canMutateFederalApplication && (
                                      <TableHeader>Actions</TableHeader>
                                    )}
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {remarkRows.map((item) => (
                                    <TableRow key={item.remarkId}>
                                      <TableCell>{formatBusinessDateTime(item.date)}</TableCell>
                                      <TableCell>{displayValue(item.user)}</TableCell>
                                      <TableCell>{item.remark}</TableCell>
                                      {canMutateFederalApplication && (
                                        <TableCell>
                                          <Button
                                            ref={sections.editButtonRef(`remark-${item.remarkId}`)}
                                            kind="ghost"
                                            size="md"
                                            onClick={() =>
                                              sections.startEditing(
                                                `remark-${item.remarkId}`,
                                                () => {
                                                  setEditingRemarkId(item.remarkId)
                                                  setRemarkDraft(item.remark)
                                                  setRemarkValidationMessage('')
                                                },
                                              )
                                            }
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
                          ) : (
                            <EmptyState
                              title="No remarks found"
                              description="No remarks have been added to this federal application."
                              headingLevel={3}
                            />
                          )}
                        </Tile>
                      </Column>
                    </Grid>
                  </TabPanel>
                )}

                <TabPanel
                  className={`application-detail-tab-panel detail-documents-tab-panel${
                    !documentsErrorMessage && documentRows.length === 0
                      ? ' application-detail-tab-panel--empty'
                      : ''
                  }`}
                >
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <RecordDocumentsSection
                        id="federal-application-documents"
                        recordType="application"
                        rows={documentRows}
                        errorMessage={documentsErrorMessage}
                        result={documentActionResult}
                        onDismissResult={clearActionResult}
                        upload={{
                          enabled: canUploadApplicationDocuments,
                          open: isEditingFederalDocuments,
                          resetKey: documentUploadResetKey,
                          targetNumber: String(detail.applicationNumber ?? applicationNumber ?? ''),
                          inputId: 'federalApplicationDocumentUpload',
                          contentSelector: '.application-detail-tabs-column',
                          busy: documentUploadBusy,
                          onOpen: () => setIsEditingFederalDocuments(true),
                          onClose: onCancelFederalDocumentEdit,
                          onDirtyChange: setDocumentUploadDirty,
                          onBusyChange: setDocumentUploadBusy,
                          onUploadComplete: refreshFederalApplicationDocuments,
                          onSaved: (savedCount) =>
                            setActionResult({
                              ...documentsSavedResult(savedCount),
                              source: 'documents',
                            }),
                        }}
                        onOpen={(row, preview) => void onOpenDocument(row, preview)}
                        canDelete={canDeleteApplicationDocuments}
                        removingId={isRemovingDocumentId}
                        onDeleteStart={clearActionResult}
                        onDelete={onRemoveDocument}
                      />
                    </Column>
                  </Grid>
                </TabPanel>

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile
                        ref={sections.sectionRef('permit')}
                        className="detail-section-card federal-shipping-details"
                      >
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
                        {isEditingFederalPermit && canMutateFederalApplication ? (
                          <>
                            <div className="detail-section-card__header">
                              <h2 className="detail-tile-title">
                                {detail.federalPermit
                                  ? 'Edit shipping details'
                                  : 'Add federal permit'}
                              </h2>
                            </div>
                            <RequiredFieldsLegend />
                            {renderFederalShippingFields()}
                            <div className="federal-shipping-details__actions">
                              <Button
                                kind="tertiary"
                                size="md"
                                disabled={isSavingMutation}
                                onClick={sections.cancelEditing}
                              >
                                Cancel
                              </Button>
                              <Button
                                kind="primary"
                                size="md"
                                disabled={isSavingMutation}
                                renderIcon={isSavingMutation ? PendingIcon : undefined}
                                onClick={() => void onSavePermit()}
                              >
                                {isSavingMutation ? 'Saving…' : 'Save federal permit'}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="detail-section-card__header">
                              <h2 className="detail-tile-title">Shipping details</h2>
                              {canMutateFederalApplication && (
                                <Button
                                  ref={sections.editButtonRef('permit')}
                                  kind="tertiary"
                                  size="md"
                                  renderIcon={Edit}
                                  disabled={
                                    isSavingMutation ||
                                    isShippingReferencesLoading ||
                                    !shippingReferences
                                  }
                                  onClick={onStartFederalPermitEdit}
                                >
                                  {detail.federalPermit
                                    ? 'Edit shipping details'
                                    : 'Add federal permit'}
                                </Button>
                              )}
                            </div>
                            {renderFederalShippingFields()}
                          </>
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
      <UnsavedChangesGuard
        isDirty={isFederalApplicationDirty}
        isBusy={isFederalApplicationBusy}
        onDiscard={onDiscardFederalApplicationChanges}
        subject="this federal application"
      />
      {sections.discardModal}
    </Grid>
  )
}

export default FederalApplicationDetailsPage
