import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Edit, TrashCan } from '@carbon/icons-react'
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
import ConfirmationModal from '@/components/ConfirmationModal'
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
import { hasRole } from '@/context/auth/role-utils'
import { AppNotification } from '../../components/AppNotification'
import DetailDocumentUploadPanel from '../../components/uploads/DetailDocumentUploadPanel'
import type { FederalApplicationDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '../shared/DetailSections'
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
  fetchFederalApplicationDetail,
  releaseApplicationEditLock,
} from '@/service/lexis-detail-service'
import {
  fetchFederalApplicationDocuments,
  openFederalApplicationDocument,
  removeFederalApplicationDocument,
  type FederalApplicationDocumentRow,
} from '@/service/federal-application-documents-service'
import { triggerBrowserDownload } from '@/utils/download'
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
import { displayAuditIdentity } from '@/utils/text'
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
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [statusCode, setStatusCode] = useState('')
  const [statusRemark, setStatusRemark] = useState('')
  const [remarkDraft, setRemarkDraft] = useState('')
  const [editingRemarkId, setEditingRemarkId] = useState<number | null>(null)
  const [remarkValidationMessage, setRemarkValidationMessage] = useState('')
  const [permitForm, setPermitForm] = useState<FederalPermitMutation>(emptyPermitForm)
  const [isEditingFederalStatus, setIsEditingFederalStatus] = useState(false)
  const [isEditingFederalRemarks, setIsEditingFederalRemarks] = useState(false)
  const [isEditingFederalDocuments, setIsEditingFederalDocuments] = useState(false)
  const [isEditingFederalPermit, setIsEditingFederalPermit] = useState(false)
  const [isSavingMutation, setIsSavingMutation] = useState(false)
  const [isSavingRemark, setIsSavingRemark] = useState(false)
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [documentPendingDeletion, setDocumentPendingDeletion] =
    useState<FederalApplicationDocumentRow | null>(null)
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
  const canManageFederalApplication = canPerform('manageFederalApplication')
  const canMutateFederalApplication =
    canManageFederalApplication &&
    !!currentDetail &&
    !currentDetail.readOnly &&
    !federalApplicationLocked
  const canUploadApplicationDocuments =
    canPerform('/fileApplicationUpload') &&
    !!currentDetail &&
    !currentDetail.readOnly &&
    !federalApplicationLocked
  const applicationStatusCode = currentDetail?.statusCode?.trim().toUpperCase() ?? ''
  const businessToday = formatBusinessIsoDate()
  const statusTransitions = allowedFederalStatusTransitions(
    applicationStatusCode,
    currentDetail?.listingDate,
    businessToday,
  )
  const canDeleteApplicationDocuments =
    !currentDetail?.readOnly &&
    !federalApplicationLocked &&
    applicationStatusCode.length > 0 &&
    applicationStatusCode !== 'EXP' &&
    (hasRole(capabilities.roles, 'APPLICATION_APPROVER') || hasRole(capabilities.roles, 'ADMIN'))
  const canEditApplicationDocuments = canUploadApplicationDocuments || canDeleteApplicationDocuments
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

  const permitFieldErrors = useMemo(
    () => ({
      permitIssueDate: firstValidationError(
        () => requiredFieldError(permitForm.permitIssueDate, 'Permit issue date'),
        () => isoDateFieldError(permitForm.permitIssueDate),
      ),
      destinationCountry:
        requiredExactLengthFieldError(permitForm.destinationCountry, 2, 'Destination country') ??
        undefined,
      transportType:
        requiredExactLengthFieldError(permitForm.transportType, 1, 'Transport type') ?? undefined,
      transportName:
        firstValidationError(
          () => requiredMaxLengthFieldError(permitForm.transportName, 26, 'Transport name'),
          () =>
            ASCII_PATTERN.test(permitForm.transportName.trim())
              ? null
              : 'Transport name must contain ASCII characters only.',
        ) ?? undefined,
      shippingDate: firstValidationError(
        () => requiredFieldError(permitForm.shippingDate, 'Estimated shipping date'),
        () => isoDateFieldError(permitForm.shippingDate),
      ),
      portOfExport:
        requiredExactLengthFieldError(permitForm.portOfExport, 2, 'Port of export') ?? undefined,
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
                  : 'Other port of export must contain ASCII characters only.',
            ) ?? undefined)
          : undefined,
    }),
    [permitForm],
  )
  const hasPermitValidationError = Object.values(permitFieldErrors).some(Boolean)

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
        setActionErrorMessage('')
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
      setActionErrorMessage('')
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
        setIsEditingFederalStatus(false)
        setIsEditingFederalRemarks(false)
        setIsEditingFederalDocuments(false)
        setIsEditingFederalPermit(false)
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
      if (applicationNumber) {
        void releaseApplicationEditLock(applicationNumber)
      }
    }
  }, [applicationNumber])

  const refreshDetail = useCallback(async () => {
    if (!applicationNumber) return
    const refreshed = await fetchFederalApplicationDetail(applicationNumber)
    setDetail(refreshed)
    setStatusCode(
      allowedFederalStatusTransitions(
        refreshed?.statusCode,
        refreshed?.listingDate,
        formatBusinessIsoDate(),
      )[0]?.code ?? '',
    )
    setStatusRemark('')
    setPermitForm(refreshed ? permitFormFromDetail(refreshed) : emptyPermitForm())
    setIsEditingFederalStatus(false)
    setIsEditingFederalPermit(false)
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
  }, [applicationNumber, canViewFederalApplication])

  const onSaveStatus = useCallback(async (): Promise<boolean> => {
    if (
      !applicationNumber ||
      !canMutateFederalApplication ||
      !statusTransitions.some((transition) => transition.code === statusCode)
    )
      return false
    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingMutation(true)
    try {
      const result = await updateFederalApplicationStatus(
        applicationNumber,
        statusCode,
        statusRemark,
      )
      if (!result.success) {
        setActionErrorMessage(result.errors[0] || 'Unable to update federal application status.')
        return false
      }
      await refreshDetail()
      setActionInfoMessage(result.message || 'Federal application status updated.')
      setIsEditingFederalStatus(false)
      return true
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to update federal application status.')
      return false
    } finally {
      setIsSavingMutation(false)
    }
  }, [
    applicationNumber,
    canMutateFederalApplication,
    refreshDetail,
    statusCode,
    statusRemark,
    statusTransitions,
  ])

  const onSavePermit = useCallback(async (): Promise<boolean> => {
    if (!applicationNumber || !canMutateFederalApplication) return false
    if (!shippingReferences) {
      setActionErrorMessage(
        'Shipping reference options are unavailable. Reload the page before saving the federal permit.',
      )
      return false
    }
    if (hasPermitValidationError) {
      setActionErrorMessage(
        Object.values(permitFieldErrors).find((error): error is string => !!error) ??
          'Please fix the federal permit fields before saving.',
      )
      return false
    }
    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingMutation(true)
    try {
      const result = await saveFederalPermit(applicationNumber, permitForm, !!detail?.federalPermit)
      if (!result.success) {
        setActionErrorMessage(result.errors[0] || 'Unable to save federal permit.')
        return false
      }
      await refreshDetail()
      setActionInfoMessage(result.message || 'Federal permit saved.')
      return true
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to save federal permit.')
      return false
    } finally {
      setIsSavingMutation(false)
    }
  }, [
    applicationNumber,
    canMutateFederalApplication,
    detail?.federalPermit,
    hasPermitValidationError,
    permitFieldErrors,
    permitForm,
    refreshDetail,
    shippingReferences,
  ])

  const onStartFederalPermitEdit = useCallback(() => {
    if (
      !canMutateFederalApplication ||
      !detail ||
      isShippingReferencesLoading ||
      !shippingReferences
    ) {
      return
    }
    setPermitForm(permitFormFromDetail(detail))
    setActionErrorMessage('')
    setIsEditingFederalPermit(true)
  }, [canMutateFederalApplication, detail, isShippingReferencesLoading, shippingReferences])

  const onCancelFederalPermitEdit = useCallback(() => {
    setPermitForm(detail ? permitFormFromDetail(detail) : emptyPermitForm())
    setActionErrorMessage('')
    setIsEditingFederalPermit(false)
  }, [detail])

  const onSaveRemark = useCallback(async (): Promise<boolean> => {
    if (!applicationNumber || !canMutateFederalApplication || isSavingRemark) return false

    const normalizedRemark = remarkDraft.trim()
    if (!normalizedRemark) {
      setRemarkValidationMessage('Remark is required.')
      return false
    }
    if (normalizedRemark.length > 250) {
      setRemarkValidationMessage('Remark must not exceed 250 characters.')
      return false
    }

    setRemarkValidationMessage('')
    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingRemark(true)
    try {
      const result = await saveFederalApplicationRemark(
        applicationNumber,
        normalizedRemark,
        editingRemarkId ?? undefined,
      )
      if (!result.success) {
        setActionErrorMessage(result.errors[0] || 'Unable to save federal application remark.')
        return false
      }
      setRemarkRows(await fetchFederalApplicationRemarks(applicationNumber))
      setRemarksErrorMessage('')
      setEditingRemarkId(null)
      setRemarkDraft('')
      setRemarkValidationMessage('')
      setIsEditingFederalRemarks(false)
      setActionInfoMessage(result.message || 'Federal application remark saved.')
      return true
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to save federal application remark.')
      return false
    } finally {
      setIsSavingRemark(false)
    }
  }, [applicationNumber, canMutateFederalApplication, editingRemarkId, isSavingRemark, remarkDraft])

  const refreshFederalApplicationDocuments = useCallback(async () => {
    if (!applicationNumber) {
      return
    }

    const documentsResult = await fetchFederalApplicationDocuments(applicationNumber)
    setDocumentRows(documentsResult.rows)
    setDocumentsErrorMessage('')
  }, [applicationNumber])

  const onCancelFederalStatusEdit = useCallback(() => {
    setStatusCode(statusTransitions[0]?.code ?? '')
    setStatusRemark('')
    setActionErrorMessage('')
    setIsEditingFederalStatus(false)
  }, [statusTransitions])

  const onCancelFederalRemarkEdit = useCallback(() => {
    setRemarkDraft('')
    setEditingRemarkId(null)
    setRemarkValidationMessage('')
    setActionErrorMessage('')
    setIsEditingFederalRemarks(false)
  }, [])

  const onCancelFederalDocumentEdit = useCallback(() => {
    setDocumentUploadDirty(false)
    setDocumentUploadBusy(false)
    setDocumentUploadResetKey((current) => current + 1)
    setActionErrorMessage('')
    setIsEditingFederalDocuments(false)
  }, [])

  const onOpenDocument = useCallback(
    async (row: FederalApplicationDocumentRow) => {
      if (!applicationNumber) {
        return
      }

      setActionErrorMessage('')

      try {
        const result = await openFederalApplicationDocument(row.id, row.name, applicationNumber)
        triggerBrowserDownload(result.blob, result.filename || row.name)
      } catch (error) {
        console.error(error)
        setActionErrorMessage('Unable to open the selected document.')
      }
    },
    [applicationNumber],
  )

  const onRemoveDocument = useCallback(
    async (row: FederalApplicationDocumentRow) => {
      if (!applicationNumber || federalApplicationLocked || !canDeleteApplicationDocuments) {
        throw new Error('This document cannot be deleted from the current application.')
      }

      const isLatestRequest = beginDetailRequest()
      setIsRemovingDocumentId(row.id)
      setActionErrorMessage('')

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
            setActionInfoMessage(`${row.name || 'Document'} was deleted.`)
          }
        } catch (refreshError) {
          if (isLatestRequest()) {
            console.error(refreshError)
            setDocumentsErrorMessage(
              'The document was deleted, but federal application documents could not be refreshed. Reload the page.',
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

  const statusDraftDirty =
    canMutateFederalApplication &&
    isEditingFederalStatus &&
    (statusCode !== (statusTransitions[0]?.code ?? '') || statusRemark.length > 0)
  const remarkBaseline =
    editingRemarkId === null
      ? ''
      : (remarkRows.find((remark) => remark.remarkId === editingRemarkId)?.remark ?? '')
  const remarkDraftDirty =
    canMutateFederalApplication && isEditingFederalRemarks && remarkDraft !== remarkBaseline
  const permitDraftDirty =
    isEditingFederalPermit &&
    canMutateFederalApplication &&
    !!detail &&
    !formValuesEqual(permitForm, permitFormFromDetail(detail))
  const independentDraftCount = [statusDraftDirty, remarkDraftDirty, permitDraftDirty].filter(
    Boolean,
  ).length
  const isFederalApplicationDirty =
    statusDraftDirty || remarkDraftDirty || permitDraftDirty || documentUploadDirty
  const unsavedSaveUnavailableReason = documentUploadDirty
    ? 'Finish or reset the queued document uploads before leaving, or discard all changes.'
    : independentDraftCount > 1
      ? 'Save each status, remark, and permit draft from its tab before leaving, or discard all changes.'
      : undefined

  const onSaveUnsavedFederalApplicationChanges = useCallback(async (): Promise<boolean> => {
    if (documentUploadDirty) {
      setActionErrorMessage(
        'Queued document uploads must be submitted or reset before leaving this federal application.',
      )
      return false
    }
    if ([statusDraftDirty, remarkDraftDirty, permitDraftDirty].filter(Boolean).length > 1) {
      setActionErrorMessage(
        'Save each federal application draft from its tab before leaving this application.',
      )
      return false
    }
    if (statusDraftDirty) return onSaveStatus()
    if (remarkDraftDirty) return onSaveRemark()
    if (permitDraftDirty) return onSavePermit()
    return true
  }, [
    documentUploadDirty,
    onSavePermit,
    onSaveRemark,
    onSaveStatus,
    permitDraftDirty,
    remarkDraftDirty,
    statusDraftDirty,
  ])

  const onDiscardFederalApplicationChanges = useCallback(() => {
    setStatusCode(statusTransitions[0]?.code ?? '')
    setStatusRemark('')
    setRemarkDraft('')
    setEditingRemarkId(null)
    setRemarkValidationMessage('')
    setPermitForm(detail ? permitFormFromDetail(detail) : emptyPermitForm())
    setIsEditingFederalStatus(false)
    setIsEditingFederalRemarks(false)
    setIsEditingFederalDocuments(false)
    setIsEditingFederalPermit(false)
    setDocumentUploadDirty(false)
    setDocumentUploadBusy(false)
    setDocumentUploadResetKey((current) => current + 1)
    setActionErrorMessage('')
  }, [detail, statusTransitions])

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
          title={`LEXIS application ${federalApplicationDisplayNumber}`.trim()}
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
          {!!actionInfoMessage && (
            <Column sm={4} md={8} lg={16}>
              <AppNotification
                kind="success"
                title="Action completed"
                subtitle={actionInfoMessage}
                lowContrast
                onCloseButtonClick={() => setActionInfoMessage('')}
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
                selectFederalApplicationTab(
                  FEDERAL_APPLICATION_DETAIL_TAB_SLOTS[selectedIndex] ?? 'owner',
                )
              }}
            >
              <TabList
                aria-label="Federal application detail sections"
                contained
                className="application-tabs__list application-detail-tab-list"
              >
                <Tab>Owner</Tab>
                {hasAgent && <Tab>Agent</Tab>}
                <Tab>Application</Tab>
                <Tab>Items</Tab>
                <Tab>Offers</Tab>
                {canViewFederalApplication && <Tab>Remarks</Tab>}
                <Tab>Documents</Tab>
                <Tab>Shipping Details</Tab>
              </TabList>
              <TabPanels>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <DetailFieldTile
                        title="Owner"
                        fields={[
                          {
                            label: 'Client number',
                            value: displayValue(detail.ownerClientNumber),
                          },
                          {
                            label: 'Applicant type',
                            value: displayValue(applicantTypeLabel(detail.ownerApplicantType)),
                          },
                          {
                            label: 'Client location',
                            value: displayValue(detail.ownerClientLocationCode),
                          },
                          {
                            label: 'Contact name',
                            value: displayValue(detail.ownerContactName),
                          },
                          {
                            label: 'Company name',
                            value: displayValue(detail.ownerCompanyName),
                          },
                          {
                            label: 'Address',
                            value: displayValue(detail.ownerClientContext?.address),
                          },
                          {
                            label: 'City',
                            value: displayValue(detail.ownerClientContext?.city),
                          },
                          {
                            label: 'Province',
                            value: displayValue(detail.ownerClientContext?.province),
                          },
                          {
                            label: 'Postal code',
                            value: displayValue(detail.ownerClientContext?.postalCode),
                          },
                          {
                            label: 'Country',
                            value: displayValue(detail.ownerClientContext?.country),
                          },
                          {
                            label: 'Phone',
                            value: displayValue(detail.ownerClientContext?.phone),
                          },
                          {
                            label: 'Fax',
                            value: displayValue(detail.ownerClientContext?.fax),
                          },
                          {
                            label: 'Email',
                            value: displayValue(detail.ownerClientContext?.email),
                          },
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
                            {
                              label: 'Client number',
                              value: displayValue(detail.agentClientNumber),
                            },
                            {
                              label: 'Applicant type',
                              value: displayValue(
                                applicantTypeLabel(detail.agentApplicantType ?? 'A'),
                              ),
                            },
                            {
                              label: 'Client location',
                              value: displayValue(detail.agentClientLocationCode),
                            },
                            {
                              label: 'Contact name',
                              value: displayValue(detail.agentContactName),
                            },
                            {
                              label: 'Company name',
                              value: displayValue(detail.agentCompanyName),
                            },
                            {
                              label: 'Address',
                              value: displayValue(detail.agentClientContext?.address),
                            },
                            {
                              label: 'City',
                              value: displayValue(detail.agentClientContext?.city),
                            },
                            {
                              label: 'Province',
                              value: displayValue(detail.agentClientContext?.province),
                            },
                            {
                              label: 'Postal code',
                              value: displayValue(detail.agentClientContext?.postalCode),
                            },
                            {
                              label: 'Country',
                              value: displayValue(detail.agentClientContext?.country),
                            },
                            {
                              label: 'Phone',
                              value: displayValue(detail.agentClientContext?.phone),
                            },
                            {
                              label: 'Fax',
                              value: displayValue(detail.agentClientContext?.fax),
                            },
                            {
                              label: 'Email',
                              value: displayValue(detail.agentClientContext?.email),
                            },
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
                              kind="tertiary"
                              size="sm"
                              renderIcon={Edit}
                              onClick={() => {
                                setStatusCode(statusTransitions[0]?.code ?? '')
                                setStatusRemark('')
                                setActionErrorMessage('')
                                setIsEditingFederalStatus(true)
                              }}
                            >
                              Edit federal status
                            </Button>
                          ) : undefined
                        }
                        fields={[
                          {
                            label: 'Region',
                            value: displayValue(detail.region),
                          },
                          {
                            label: 'Product type',
                            value: displayValue(detail.productType),
                          },
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
                          {
                            label: 'Exemption number',
                            value: displayValue(detail.exemptionNumber),
                          },
                          {
                            label: 'Exemption type',
                            value: displayValue(detail.exemptionType),
                          },
                          {
                            label: 'Exemption reason',
                            value: displayValue(detail.exemptionReason),
                          },
                          {
                            label: 'Term days',
                            value: displayValue(detail.termDays),
                          },
                        ]}
                      />
                      {canMutateFederalApplication &&
                        statusTransitions.length > 0 &&
                        isEditingFederalStatus && (
                          <Tile>
                            <h2 className="detail-tile-title">Update federal status</h2>
                            <div className="legacy-search-grid">
                              <Select
                                id="federalApplicationStatus"
                                labelText="Status"
                                value={statusCode}
                                onChange={(event) => setStatusCode(event.target.value)}
                              >
                                {statusTransitions.map((transition) => (
                                  <SelectItem
                                    key={transition.code}
                                    value={transition.code}
                                    text={transition.label}
                                  />
                                ))}
                              </Select>
                              <TextArea
                                id="federalApplicationStatusRemark"
                                labelText="Remark"
                                value={statusRemark}
                                onChange={(event) => setStatusRemark(event.target.value)}
                              />
                            </div>
                            <div className="legacy-search-actions">
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={
                                  isSavingMutation ||
                                  !statusCode ||
                                  ((statusCode === 'REJ' || statusCode === 'WDN') &&
                                    !statusRemark.trim())
                                }
                                renderIcon={isSavingMutation ? PendingIcon : undefined}
                                onClick={() => void onSaveStatus()}
                              >
                                {isSavingMutation ? 'Saving…' : 'Update status'}
                              </Button>
                              <Button
                                kind="ghost"
                                size="sm"
                                disabled={isSavingMutation}
                                onClick={onCancelFederalStatusEdit}
                              >
                                Cancel
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
                          {
                            label: 'Location of logs',
                            value: displayValue(detail.logLocation),
                          },
                          {
                            label: 'Age class',
                            value: displayValue(detail.ageClass),
                          },
                          {
                            label: 'Average log volume',
                            value: displayValue(detail.averageLogVolume),
                          },
                          {
                            label: 'Application volume',
                            value: displayValue(detail.applicationVolume),
                          },
                          {
                            label: 'Species and end use sort',
                            value: displayValue(detail.endUse),
                          },
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
                        Suppress dependent Summary of Scale content until a package exists. */}
                    {detail.packages.length > 0 && (
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <h2 className="detail-tile-title">Summary of Scale</h2>
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
                                    <TableHeader>Timber Mark</TableHeader>
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
                                      <TableCell>{row.timberMark || '-'}</TableCell>
                                      <TableCell>{row.pieces.toLocaleString()}</TableCell>
                                      <TableCell>{row.species || '-'}</TableCell>
                                      <TableCell>{row.grade || '-'}</TableCell>
                                      <TableCell>{row.volume || '-'}</TableCell>
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
                                  <TableHeader>Open</TableHeader>
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
                                        size="sm"
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
                        <Tile className="application-detail-section application-detail-remarks">
                          <div className="detail-section-card__header">
                            <h2 className="detail-tile-title">Remarks</h2>
                            {canMutateFederalApplication && !isEditingFederalRemarks && (
                              <Button
                                kind="tertiary"
                                size="sm"
                                onClick={() => {
                                  setRemarkDraft('')
                                  setEditingRemarkId(null)
                                  setRemarkValidationMessage('')
                                  setIsEditingFederalRemarks(true)
                                }}
                              >
                                Add remark
                              </Button>
                            )}
                          </div>
                          {canMutateFederalApplication && isEditingFederalRemarks && (
                            <div className="legacy-search-actions">
                              <TextArea
                                id="federalApplicationRemark"
                                labelText={
                                  editingRemarkId ? `Edit Remark ${editingRemarkId}` : 'New Remark'
                                }
                                maxCount={250}
                                value={remarkDraft}
                                invalid={!!remarkValidationMessage}
                                invalidText={remarkValidationMessage}
                                onChange={(event) => {
                                  setRemarkDraft(event.target.value)
                                  if (remarkValidationMessage) {
                                    setRemarkValidationMessage('')
                                  }
                                }}
                              />
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={isSavingRemark}
                                renderIcon={isSavingRemark ? PendingIcon : undefined}
                                onClick={() => void onSaveRemark()}
                              >
                                {isSavingRemark
                                  ? 'Saving…'
                                  : editingRemarkId
                                    ? 'Update Remark'
                                    : 'Save Remark'}
                              </Button>
                              <Button
                                kind="ghost"
                                size="sm"
                                disabled={isSavingRemark}
                                onClick={onCancelFederalRemarkEdit}
                              >
                                Cancel
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
                                            kind="ghost"
                                            size="sm"
                                            onClick={() => {
                                              setEditingRemarkId(item.remarkId)
                                              setRemarkDraft(item.remark)
                                              setRemarkValidationMessage('')
                                              setIsEditingFederalRemarks(true)
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

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <div className="detail-section-card__header">
                          <h2 className="detail-tile-title">Documents</h2>
                          {canEditApplicationDocuments &&
                            (isEditingFederalDocuments ? (
                              <Button
                                kind="tertiary"
                                size="sm"
                                disabled={documentUploadBusy || isRemovingDocumentId !== null}
                                onClick={onCancelFederalDocumentEdit}
                              >
                                Cancel
                              </Button>
                            ) : (
                              <Button
                                kind="tertiary"
                                size="sm"
                                renderIcon={Edit}
                                onClick={() => setIsEditingFederalDocuments(true)}
                              >
                                Edit documents
                              </Button>
                            ))}
                        </div>
                        {isEditingFederalDocuments && canUploadApplicationDocuments && (
                          <DetailDocumentUploadPanel
                            key={`federal-application-document-upload-${applicationNumber}-${documentUploadResetKey}`}
                            workflowType="application"
                            targetNumber={String(
                              detail.applicationNumber ?? applicationNumber ?? '',
                            )}
                            inputId="federalApplicationDocumentUpload"
                            disabled={!detail.applicationNumber && !applicationNumber}
                            onDirtyChange={setDocumentUploadDirty}
                            onBusyChange={setDocumentUploadBusy}
                            onUploadComplete={refreshFederalApplicationDocuments}
                          />
                        )}
                        {documentsErrorMessage ? (
                          <EmptyState
                            title="Documents unavailable"
                            description={documentsErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : documentRows.length > 0 ? (
                          <TableFrame ariaLabel="Federal application documents">
                            <Table size="md" useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>File Name</TableHeader>
                                  <TableHeader>Description</TableHeader>
                                  <TableHeader>Type</TableHeader>
                                  <TableHeader>Actions</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {documentRows.map((row) => (
                                  <TableRow key={row.id}>
                                    <TableCell>{row.name || '-'}</TableCell>
                                    <TableCell>{row.description || '-'}</TableCell>
                                    <TableCell>{row.type || '-'}</TableCell>
                                    <TableCell>
                                      <div className="legacy-search-actions">
                                        <Button
                                          kind="ghost"
                                          size="sm"
                                          onClick={() => void onOpenDocument(row)}
                                        >
                                          Open
                                        </Button>
                                        {isEditingFederalDocuments &&
                                          !federalApplicationLocked &&
                                          row.deletable !== false && (
                                            <Button
                                              kind="danger--ghost"
                                              size="sm"
                                              disabled={
                                                !canDeleteApplicationDocuments ||
                                                isRemovingDocumentId === row.id
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
                                ))}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <EmptyState
                            title="No documents found"
                            description="No documents have been uploaded for this federal application."
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
                      <Tile className="detail-section-card federal-shipping-details">
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
                            <div className="federal-shipping-details__form">
                              {detail.federalPermit && (
                                <TextInput
                                  id="federalPermitNumber"
                                  labelText="Permit number"
                                  value={String(permitForm.permitNumber ?? '')}
                                  readOnly
                                />
                              )}
                              <IsoDatePicker
                                id="federalPermitIssueDate"
                                labelText="Permit issue date"
                                value={permitForm.permitIssueDate}
                                invalid={!!permitFieldErrors.permitIssueDate}
                                invalidText={permitFieldErrors.permitIssueDate}
                                onChange={(value) =>
                                  setPermitForm((current) => ({
                                    ...current,
                                    permitIssueDate: value,
                                  }))
                                }
                              />
                              <Select
                                id="federalPermitDestinationCountry"
                                labelText="Destination country"
                                value={permitForm.destinationCountry}
                                invalid={!!permitFieldErrors.destinationCountry}
                                invalidText={permitFieldErrors.destinationCountry}
                                onChange={(event) =>
                                  setPermitForm((current) => ({
                                    ...current,
                                    destinationCountry: event.target.value,
                                  }))
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
                                id="federalPermitTransportType"
                                labelText="Transport type"
                                value={permitForm.transportType}
                                invalid={!!permitFieldErrors.transportType}
                                invalidText={permitFieldErrors.transportType}
                                onChange={(event) =>
                                  setPermitForm((current) => ({
                                    ...current,
                                    transportType: event.target.value,
                                  }))
                                }
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
                              <TextInput
                                id="federalPermitTransportName"
                                labelText="Transport name"
                                value={permitForm.transportName}
                                invalid={!!permitFieldErrors.transportName}
                                invalidText={permitFieldErrors.transportName}
                                maxLength={26}
                                onChange={(event) =>
                                  setPermitForm((current) => ({
                                    ...current,
                                    transportName: event.target.value,
                                  }))
                                }
                              />
                              <IsoDatePicker
                                id="federalPermitShippingDate"
                                labelText="Estimated shipping date"
                                value={permitForm.shippingDate}
                                invalid={!!permitFieldErrors.shippingDate}
                                invalidText={permitFieldErrors.shippingDate}
                                onChange={(value) =>
                                  setPermitForm((current) => ({
                                    ...current,
                                    shippingDate: value,
                                  }))
                                }
                              />
                              <Select
                                id="federalPermitPortOfExport"
                                labelText="Port of export"
                                value={permitForm.portOfExport}
                                invalid={!!permitFieldErrors.portOfExport}
                                invalidText={permitFieldErrors.portOfExport}
                                onChange={(event) => {
                                  const portCode = event.target.value
                                  setPermitForm((current) => ({
                                    ...current,
                                    portOfExport: portCode,
                                    otherPortOfExport:
                                      portCode.toUpperCase() === 'OT'
                                        ? current.otherPortOfExport
                                        : '',
                                  }))
                                }}
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
                              {permitForm.portOfExport.trim().toUpperCase() === 'OT' && (
                                <TextInput
                                  id="federalPermitOtherPort"
                                  labelText="Other port of export"
                                  value={permitForm.otherPortOfExport}
                                  invalid={!!permitFieldErrors.otherPortOfExport}
                                  invalidText={permitFieldErrors.otherPortOfExport}
                                  maxLength={34}
                                  onChange={(event) =>
                                    setPermitForm((current) => ({
                                      ...current,
                                      otherPortOfExport: event.target.value,
                                    }))
                                  }
                                />
                              )}
                            </div>
                            <div className="federal-shipping-details__actions">
                              <Button
                                kind="tertiary"
                                size="sm"
                                disabled={isSavingMutation}
                                onClick={onCancelFederalPermitEdit}
                              >
                                Cancel
                              </Button>
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={isSavingMutation || hasPermitValidationError}
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
                                  kind="tertiary"
                                  size="sm"
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
                            <dl className="detail-field-grid federal-shipping-details__field-grid">
                              {[
                                {
                                  label: 'Permit issue date',
                                  value: displayValue(detail.federalPermit?.permitIssueDate),
                                },
                                {
                                  label: 'Final destination country',
                                  value: displayValue(
                                    shippingReferenceLabel(
                                      shippingReferences?.countries,
                                      detail.federalPermit?.destinationCountry,
                                    ),
                                  ),
                                },
                                {
                                  label: 'Transport type',
                                  value: displayValue(
                                    shippingReferenceLabel(
                                      shippingReferences?.transportTypes,
                                      detail.federalPermit?.transportType,
                                    ),
                                  ),
                                },
                                {
                                  label: 'Transport name',
                                  value: displayValue(detail.federalPermit?.transportName),
                                },
                                {
                                  label: 'Estimated shipping date',
                                  value: displayValue(detail.federalPermit?.shippingDate),
                                },
                                {
                                  label: 'Customs port of export',
                                  value: displayValue(
                                    shippingReferenceLabel(
                                      shippingReferences?.ports,
                                      detail.federalPermit?.portOfExport,
                                    ),
                                  ),
                                },
                                ...(detail.federalPermit?.portOfExport?.trim().toUpperCase() ===
                                'OT'
                                  ? [
                                      {
                                        label: 'Other port of export',
                                        value: displayValue(
                                          detail.federalPermit?.otherPortOfExport,
                                        ),
                                      },
                                    ]
                                  : []),
                                {
                                  label: 'Permit number',
                                  value: displayValue(detail.federalPermit?.permitNumber),
                                },
                              ].map((field) => (
                                <div key={field.label} className="detail-field-item">
                                  <dt className="detail-field-label">{field.label}</dt>
                                  <dd className="detail-field-value">{field.value}</dd>
                                </div>
                              ))}
                            </dl>
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
      <UnsavedChangesGuard
        isDirty={isFederalApplicationDirty}
        isBusy={
          isSavingMutation || isSavingRemark || isRemovingDocumentId !== null || documentUploadBusy
        }
        onSave={onSaveUnsavedFederalApplicationChanges}
        onDiscard={onDiscardFederalApplicationChanges}
        subject="this federal application"
        saveUnavailableReason={unsavedSaveUnavailableReason}
      />
    </Grid>
  )
}

export default FederalApplicationDetailsPage
