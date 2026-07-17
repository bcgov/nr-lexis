import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineLoading,
  Modal,
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
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import ExemptionApprovalEmailModal, {
  type ExemptionApprovalRecipient,
} from '@/components/ExemptionApprovalEmailModal'
import PageHeader from '@/components/PageHeader'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { useAuth } from '@/context/auth/useAuth'
import { hasRole } from '@/context/auth/role-utils'
import { AppNotification } from '../../components/AppNotification'
import DetailDocumentUploadPanel from '../../components/uploads/DetailDocumentUploadPanel'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import { formatDocumentSource } from '@/service/document-service-utils'
import { DetailFieldTile } from '../shared/DetailSections'
import {
  displayValue,
  matchesFilter,
  normalizeFilterText as normalizeText,
} from '@/pages/shared/detail-page-utils'
import { appendSearchParamsToPath, searchParamsWithValue } from '@/pages/shared/search-query-utils'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
import {
  fetchExemptionDocuments,
  openExemptionDocument,
  removeExemptionDocument,
  type ProvincialExemptionDocumentRow,
} from '@/service/provincial-exemption-documents-service'
import { createPermitFromExemption } from '@/service/provincial-permit-documents-invoices-service'
import { triggerBrowserDownload } from '@/utils/download'
import IsoDatePicker from '../../components/IsoDatePicker'
import SearchableSelect from '../../components/SearchableSelect'
import RegionMultiSelect from '@/components/RegionMultiSelect'
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
  releaseExemptionEditLock,
  removeApplicationFromExemption,
  sendExemptionApprovalEmails,
  updateExemption,
  type ExemptionApplicationRow,
  type ExemptionBlanketOicTotals,
  type ExemptionEditContext,
  type ExemptionPermitRow,
} from '@/service/provincial-exemption-detail-service'
import { ReportRequestError, runReport } from '@/service/report-service'
import { formatLocalIsoDate } from '@/utils/date'

const EXEMPTION_DETAIL_TAB_INDEX = {
  summary: 0,
  applications: 1,
  permits: 2,
  fees: 3,
  documents: 4,
  remarks: 5,
} as const

type ExemptionEditForm = {
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

const normalizeServerMessage = (message: string): string =>
  message
    .replace(/<\/?br\s*\/?\s*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const ProvincialExemptionDetailsPage = () => {
  const navigate = useNavigate()
  const { capabilities, canPerform } = useAuth()
  const { exemptionNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialExemptionDetail | null>(null)
  const [documentRows, setDocumentRows] = useState<ProvincialExemptionDocumentRow[]>([])
  const [applications, setApplications] = useState<ExemptionApplicationRow[]>([])
  const [permitRows, setPermitRows] = useState<ExemptionPermitRow[]>([])
  const [blanketOicTotals, setBlanketOicTotals] = useState<ExemptionBlanketOicTotals | null>(null)
  const [containsUnmanu, setContainsUnmanu] = useState<boolean | null>(null)
  const [editContext, setEditContext] = useState<ExemptionEditContext>(EMPTY_EDIT_CONTEXT)
  const [editContextLoaded, setEditContextLoaded] = useState(false)
  const [editForm, setEditForm] = useState<ExemptionEditForm | null>(null)
  const [regionOptions, setRegionOptions] = useState<IdTextOption[]>([])
  const [exemptionTypeOptions, setExemptionTypeOptions] = useState<SearchOption[]>([])
  const [exemptionStatusOptions, setExemptionStatusOptions] = useState<SearchOption[]>([])
  const [optionsAvailability, setOptionsAvailability] = useState<
    'loading' | 'available' | 'unavailable'
  >('loading')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approvalConfirmationOpen, setApprovalConfirmationOpen] = useState(false)
  const [approvalConfirmationTarget, setApprovalConfirmationTarget] = useState<string | null>(null)
  const [approvalCertified, setApprovalCertified] = useState(false)
  const [approvalDate, setApprovalDate] = useState('')
  const [approvalEmailRecipients, setApprovalEmailRecipients] = useState<
    ExemptionApprovalRecipient[]
  >([])
  const [sendingApprovalEmail, setSendingApprovalEmail] = useState(false)
  const [permitCreationConfirmationOpen, setPermitCreationConfirmationOpen] = useState(false)
  const [creatingPermit, setCreatingPermit] = useState(false)
  const [permitCreationDestination, setPermitCreationDestination] = useState<string | null>(null)
  const [permitCreationRequiresReload, setPermitCreationRequiresReload] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [applicationNumberToAdd, setApplicationNumberToAdd] = useState('')
  const [applicationMutationNumber, setApplicationMutationNumber] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [documentsErrorDismissed, setDocumentsErrorDismissed] = useState(false)
  const [applicationsErrorMessage, setApplicationsErrorMessage] = useState('')
  const [permitsErrorMessage, setPermitsErrorMessage] = useState('')
  const [blanketOicTotalsErrorMessage, setBlanketOicTotalsErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [documentUploadDirty, setDocumentUploadDirty] = useState(false)
  const [documentUploadBusy, setDocumentUploadBusy] = useState(false)
  const [documentUploadResetKey, setDocumentUploadResetKey] = useState(0)
  const [selectedExemptionTabIndex, setSelectedExemptionTabIndex] = useState<number>(
    EXEMPTION_DETAIL_TAB_INDEX.summary,
  )
  const beginDetailRequest = useLatestRequestGuard()
  const permitFilter = searchParams.get('permitFilter') ?? ''
  const remarkFilter = searchParams.get('remarkFilter') ?? ''
  const documentsFilter = searchParams.get('documentsFilter') ?? ''
  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
  )
  const updateFilterParam = useCallback(
    (key: 'permitFilter' | 'remarkFilter' | 'documentsFilter', value: string) => {
      const nextSearchParams = searchParamsWithValue(searchParams, key, value)

      if (nextSearchParams.toString() !== searchParams.toString()) {
        setSearchParams(nextSearchParams, { replace: true })
      }
    },
    [searchParams, setSearchParams],
  )

  useEffect(() => {
    if (creatingPermit || !permitCreationDestination) return

    const destination = withCurrentSearch(permitCreationDestination)
    navigate(destination)
  }, [creatingPermit, navigate, permitCreationDestination, withCurrentSearch])

  useEffect(() => {
    const load = async () => {
      setApprovalConfirmationOpen(false)
      setApprovalConfirmationTarget(null)
      setApprovalCertified(false)
      setApprovalDate('')
      setApprovalEmailRecipients([])
      setSendingApprovalEmail(false)
      setPermitCreationConfirmationOpen(false)
      setCreatingPermit(false)
      setPermitCreationDestination(null)
      setPermitCreationRequiresReload(false)
      setApplicationNumberToAdd('')
      setApplicationMutationNumber(null)
      const isLatestRequest = beginDetailRequest()
      if (!exemptionNumber) {
        setErrorMessage('Exemption number is missing from the route.')
        setDetail(null)
        setDocumentRows([])
        setApplications([])
        setPermitRows([])
        setBlanketOicTotals(null)
        setContainsUnmanu(null)
        setEditContext(EMPTY_EDIT_CONTEXT)
        setEditContextLoaded(false)
        setEditForm(null)
        setDocumentsErrorMessage('')
        setDocumentsErrorDismissed(false)
        setApplicationsErrorMessage('')
        setPermitsErrorMessage('')
        setBlanketOicTotalsErrorMessage('')
        setActionErrorMessage('')
        setActionInfoMessage('')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      setDocumentsErrorMessage('')
      setDocumentsErrorDismissed(false)
      setApplicationsErrorMessage('')
      setPermitsErrorMessage('')
      setBlanketOicTotalsErrorMessage('')
      setActionErrorMessage('')
      setActionInfoMessage('')
      setEditing(false)
      setApplications([])
      setPermitRows([])
      setBlanketOicTotals(null)
      setContainsUnmanu(null)
      setEditContext(EMPTY_EDIT_CONTEXT)
      setEditContextLoaded(false)
      setEditForm(null)

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
          setDocumentsErrorDismissed(false)
        }

        if (applicationsResult.status === 'fulfilled') {
          setApplications(applicationsResult.value.applications)
          setContainsUnmanu(applicationsResult.value.containsUnmanu)
          setApplicationsErrorMessage('')
        } else {
          console.error(applicationsResult.reason)
          setApplications([])
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
          setDetail(null)
          setDocumentRows([])
          setApplications([])
          setPermitRows([])
          setBlanketOicTotals(null)
          setContainsUnmanu(null)
          setEditContext(EMPTY_EDIT_CONTEXT)
          setEditContextLoaded(false)
          setEditForm(null)
          setDocumentsErrorMessage('')
          setDocumentsErrorDismissed(false)
          setApplicationsErrorMessage('')
          setPermitsErrorMessage('')
          setBlanketOicTotalsErrorMessage('')
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
    return () => {
      if (exemptionNumber) {
        void releaseExemptionEditLock(exemptionNumber)
      }
    }
  }, [exemptionNumber])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const options = await fetchProvincialExemptionOptions()
        setExemptionTypeOptions(options.exemptionTypes)
        setExemptionStatusOptions(options.exemptionStatuses)
        setRegionOptions(mapValueLabelOptionsToIdTextOptions(options.regions))
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

  const filteredPermitRows = useMemo(() => {
    const rows = visiblePermitRows
    if (!permitFilter.trim()) {
      return rows
    }

    return rows.filter((row) =>
      matchesFilter(
        [row.permitNumber, row.permitVolume, row.permitStatus, row.permitIssueDate],
        permitFilter,
      ),
    )
  }, [permitFilter, visiblePermitRows])

  const filteredRemarks = useMemo(() => {
    const rows = detail?.remarks ?? []
    if (!remarkFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(remarkFilter)
    return rows.filter((item) =>
      normalizeText(`${item.title} ${item.remark}`).includes(normalizedFilter),
    )
  }, [detail?.remarks, remarkFilter])

  const filteredDocumentRows = useMemo(() => {
    return documentRows.filter((row) =>
      matchesFilter([row.name, row.description, row.type, row.source, row.id], documentsFilter),
    )
  }, [documentRows, documentsFilter])

  const currentTypeCode = (
    editForm?.exemptionTypeCode ||
    detail?.exemptionTypeCode ||
    ''
  ).toUpperCase()
  const persistedTypeCode = (detail?.exemptionTypeCode ?? '').toUpperCase()
  const persistedStatusCode = (detail?.exemptionStatusCode ?? '').toUpperCase()
  const roles = capabilities?.roles ?? []
  const isApplicationApprover = hasRole(roles, 'APPLICATION_APPROVER') || hasRole(roles, 'ADMIN')
  const exemptionEditLocked = editContext.locked
  const exemptionEditLockMessage = exemptionEditLocked
    ? editContext.lockMessage || 'This exemption is currently locked for editing by another user.'
    : ''
  const hasExemptionEditPermission = canPerform('saveExemption') && persistedStatusCode !== 'EXP'
  const canSaveExemption = hasExemptionEditPermission && editContextLoaded && !exemptionEditLocked
  const isExemptionFormDirty = useMemo(
    () =>
      editing &&
      !!detail &&
      !!editForm &&
      !formValuesEqual(editForm, toEditForm(detail, editContext)),
    [detail, editContext, editForm, editing],
  )
  const applicationRelationshipDraftDirty =
    isApplicationApprover && applicationNumberToAdd.trim().length > 0
  const isExemptionDirty =
    isExemptionFormDirty || applicationRelationshipDraftDirty || documentUploadDirty
  const editContextUnavailableMessage =
    hasExemptionEditPermission && !editContextLoaded
      ? 'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.'
      : ''
  const canApproveExemption =
    canPerform('approveExemption') &&
    persistedStatusCode === 'NEW' &&
    !editing &&
    !exemptionEditLocked
  const canCreateMinisterialPermit =
    canPerform('createPermit') &&
    isApplicationApprover &&
    persistedTypeCode === 'M' &&
    persistedStatusCode === 'ACT' &&
    editContextLoaded &&
    !exemptionEditLocked &&
    !permitCreationRequiresReload &&
    !editing &&
    !isExemptionDirty
  const canLinkApplications =
    isApplicationApprover &&
    canSaveExemption &&
    !applicationsErrorMessage &&
    !editing &&
    !isExemptionFormDirty &&
    !documentUploadDirty &&
    persistedTypeCode !== 'B' &&
    persistedStatusCode !== 'CAN'
  const cancelledBlanketOic = persistedTypeCode === 'B' && persistedStatusCode === 'CAN'
  const cancelledExemption = persistedStatusCode === 'CAN'
  const canEditSummaryFields =
    editing && canSaveExemption && !cancelledBlanketOic && !cancelledExemption
  const canEditStatus = editing && canSaveExemption
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
  const feeManagementAvailable =
    currentTypeCode === 'B' ||
    currentTypeCode === 'O' ||
    containsUnmanu === true ||
    editContext.rateOverrideEnabled
  const showFees = feeManagementAvailable || Boolean(applicationsErrorMessage)
  const canManageFeeRate = !applicationsErrorMessage && feeManagementAvailable && editContextLoaded
  const canEditFeeOverride =
    canManageFeeRate &&
    canEditSummaryFields &&
    (currentTypeCode !== 'M' || persistedStatusCode === 'NEW')
  const selectedRegions = useMemo(
    () =>
      mapSelectedOptionsById(editForm?.regionNumbers ?? [], regionOptions, (id) => `Region ${id}`),
    [editForm?.regionNumbers, regionOptions],
  )
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

  const formValidationMessage = useMemo(() => {
    if (!editForm) return 'Exemption values are unavailable.'
    if (!exemptionTypeOptions.some((option) => option.value === editForm.exemptionTypeCode)) {
      return 'Select a valid exemption type.'
    }
    if (!exemptionStatusOptions.some((option) => option.value === editForm.exemptionStatusCode)) {
      return 'Select a valid exemption status.'
    }
    if (
      persistedStatusCode === 'CAN' &&
      editForm.exemptionStatusCode.trim().toUpperCase() !== 'NEW'
    ) {
      return 'Select New to reopen this cancelled exemption.'
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
      return 'Other conditions must contain at most 250 characters.'
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
    if (editForm.enableRateOverride) {
      const rate = Number(editForm.feeRate)
      if (
        !Number.isFinite(rate) ||
        rate <= 0 ||
        rate > 999.99 ||
        !/^\d{1,7}(\.\d{1,2})?$/.test(editForm.feeRate.trim())
      ) {
        return 'Fee rate must be greater than 0, at most 999.99, and have at most two decimal places.'
      }
    }
    return ''
  }, [
    currentTypeCode,
    editForm,
    exemptionStatusOptions,
    exemptionTypeOptions,
    persistedStatusCode,
    regionOptions,
  ])

  const canUploadExemptionDocuments =
    canPerform('/fileExemptionUpload') && persistedStatusCode !== 'EXP' && !exemptionEditLocked
  const canDeleteExemptionDocuments =
    isApplicationApprover &&
    persistedStatusCode.length > 0 &&
    persistedStatusCode !== 'EXP' &&
    editContextLoaded &&
    !exemptionEditLocked

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
        setContainsUnmanu(nextApplications.containsUnmanu)
        setApplicationsErrorMessage('')
        setEditContext(nextContext)
        setEditContextLoaded(true)
        setEditForm(toEditForm(nextDetail, nextContext))
        await refreshPermitData(nextDetail.exemptionNumber, nextDetail.blanketOic)
      } catch (error) {
        if (!preserveCurrentStateOnFailure) {
          setApplications([])
          setContainsUnmanu(null)
          setApplicationsErrorMessage(
            'Unable to refresh applications associated with this exemption.',
          )
          setEditContext(EMPTY_EDIT_CONTEXT)
          setEditForm(null)
          setEditing(false)
        }
        throw error
      }
    },
    [exemptionNumber, refreshPermitData],
  )

  const onSaveExemption = useCallback(async (): Promise<boolean> => {
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
    setActionErrorMessage('')
    setActionInfoMessage('')
    try {
      const result = await updateExemption({
        exemptionNumber: detail.exemptionNumber,
        approvedVolume: editForm.approvedVolume,
        approvalDate: editForm.approvalDate,
        expiryDate: editForm.expiryDate,
        otherConditions: editForm.otherConditions,
        exemptionTypeCode: editForm.exemptionTypeCode,
        exemptionStatusCode: editForm.exemptionStatusCode,
        manageFeeRate: canManageFeeRate,
        enableRateOverride: editForm.enableRateOverride,
        feeRate: editForm.feeRate,
        regionNumbers: editForm.regionNumbers,
      })
      if (!result.success) {
        setActionErrorMessage(result.errors.join(' ') || result.message)
        return false
      }
      const committedDetail: ProvincialExemptionDetail = {
        ...detail,
        exemptionTypeCode: editForm.exemptionTypeCode,
        exemptionStatusCode: editForm.exemptionStatusCode,
        approvalDate: editForm.approvalDate || null,
        expiryDate: editForm.expiryDate || null,
        approvedVolume: Number(editForm.approvedVolume),
        otherConditions: editForm.otherConditions || null,
        blanketOic: editForm.exemptionTypeCode.trim().toUpperCase() === 'B',
      }
      const committedContext: ExemptionEditContext = {
        ...editContext,
        rateOverrideEnabled: editForm.enableRateOverride,
        fixedFeeRate: editForm.enableRateOverride ? editForm.feeRate : '',
        regionNumbers: editForm.regionNumbers,
      }
      setDetail(committedDetail)
      setEditContext(committedContext)
      setEditForm(toEditForm(committedDetail, committedContext))
      setEditing(false)
      try {
        await refreshEditableData()
        setActionInfoMessage(result.message)
      } catch (refreshError) {
        console.error(refreshError)
        setApplicationsErrorMessage(
          'Application links changed, but the current links could not be refreshed. Reload the page.',
        )
        setActionInfoMessage(
          `${result.message || 'The exemption was saved.'} Current data could not be refreshed; reload before making another change.`,
        )
      }
      return true
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to save the exemption.')
      return false
    } finally {
      setSaving(false)
    }
  }, [
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
  ])

  const onDiscardExemptionChanges = useCallback(() => {
    if (detail) {
      setEditForm(toEditForm(detail, editContext))
    }
    setEditing(false)
    setActionErrorMessage('')
    setDocumentUploadDirty(false)
    setDocumentUploadBusy(false)
    setDocumentUploadResetKey((current) => current + 1)
    setApplicationNumberToAdd('')
  }, [detail, editContext])

  const onSaveUnsavedExemptionChanges = useCallback(async (): Promise<boolean> => {
    if (documentUploadDirty) {
      setActionErrorMessage(
        'Queued document uploads must be submitted or reset before leaving this exemption.',
      )
      return false
    }
    if (applicationRelationshipDraftDirty) {
      setSelectedExemptionTabIndex(EXEMPTION_DETAIL_TAB_INDEX.applications)
      setActionErrorMessage('Add the typed application number or clear it before leaving.')
      return false
    }
    return isExemptionFormDirty ? onSaveExemption() : true
  }, [
    applicationRelationshipDraftDirty,
    documentUploadDirty,
    isExemptionFormDirty,
    onSaveExemption,
  ])

  const closeApprovalConfirmation = useCallback(() => {
    if (approving) return
    setApprovalConfirmationOpen(false)
    setApprovalConfirmationTarget(null)
    setApprovalCertified(false)
    setApprovalDate('')
  }, [approving])

  const closeApprovalEmail = useCallback(() => {
    if (sendingApprovalEmail) return
    setApprovalEmailRecipients([])
    setActionInfoMessage('Exemption approved. Approval notification was skipped.')
  }, [sendingApprovalEmail])

  const onSendApprovalEmail = useCallback(
    async (recipients: ExemptionApprovalRecipient[]) => {
      if (sendingApprovalEmail) return
      setSendingApprovalEmail(true)
      try {
        const email = await sendExemptionApprovalEmails(recipients)
        setActionInfoMessage(
          email.success
            ? `Exemption approved. ${email.message || 'Approval notification queued.'}`
            : `Exemption approved. ${
                email.message || 'The approval notification could not be queued.'
              }`,
        )
      } catch (error) {
        console.error(error)
        setActionInfoMessage('Exemption approved. The approval notification could not be queued.')
      } finally {
        setSendingApprovalEmail(false)
        setApprovalEmailRecipients([])
      }
    },
    [sendingApprovalEmail],
  )

  const onApproveExemption = useCallback(async () => {
    if (!detail || approving || !approvalCertified) return
    setApproving(true)
    setActionErrorMessage('')
    setActionInfoMessage('')
    try {
      const approval = await approveExemptions([detail.exemptionNumber])
      if (!approval.success || !approval.valid) {
        setActionErrorMessage(
          normalizeServerMessage(approval.errorMessage) ||
            approval.errors.join(' ') ||
            'The exemption could not be approved.',
        )
        return
      }

      const recipients = approval.sendGrid.map(
        ([number, email]): ExemptionApprovalRecipient => [number, email],
      )
      setApprovalConfirmationOpen(false)
      setApprovalEmailRecipients(recipients)
      setActionInfoMessage(
        recipients.length > 0
          ? 'Exemption approved. Review the applicant recipient before sending the notification.'
          : 'Exemption approved. No applicant notification recipient was returned.',
      )
      try {
        await refreshEditableData(true)
      } catch (refreshError) {
        console.error(refreshError)
        setActionInfoMessage((current) => `${current} Refresh the page to see the latest status.`)
      }
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to approve the exemption.')
    } finally {
      setApproving(false)
      setApprovalConfirmationOpen(false)
      setApprovalConfirmationTarget(null)
      setApprovalCertified(false)
      setApprovalDate('')
    }
  }, [approvalCertified, approving, detail, refreshEditableData])

  const closePermitCreationConfirmation = useCallback(() => {
    if (creatingPermit) return
    setPermitCreationConfirmationOpen(false)
  }, [creatingPermit])

  const onCreatePermitFromExemption = useCallback(async () => {
    if (!detail || !canCreateMinisterialPermit || creatingPermit) return

    let newPermitPath: string | null = null
    setCreatingPermit(true)
    setActionErrorMessage('')
    setActionInfoMessage('')
    try {
      const result = await createPermitFromExemption(detail.exemptionNumber)
      if (!result.success) {
        setActionErrorMessage(
          result.errors.join(' ') || result.message || 'Unable to create the permit.',
        )
        return
      }

      const permitNumber = result.permitNumber.trim()
      if (!/^[1-9]\d*$/.test(permitNumber)) {
        setPermitCreationRequiresReload(true)
        setActionErrorMessage(
          'The permit response did not include a valid permit number. Reload before trying again.',
        )
        return
      }

      newPermitPath = `/provincial/permit/${encodeURIComponent(permitNumber)}`
    } catch (error) {
      console.error(error)
      setPermitCreationRequiresReload(true)
      setActionErrorMessage(
        'The permit request outcome could not be confirmed. Reload this exemption and check Related permits before trying again.',
      )
    } finally {
      setCreatingPermit(false)
      setPermitCreationConfirmationOpen(false)
    }

    if (newPermitPath) setPermitCreationDestination(newPermitPath)
  }, [canCreateMinisterialPermit, creatingPermit, detail])

  const onGenerateApprovedReport = useCallback(async () => {
    if (!detail || generatingReport) return
    setGeneratingReport(true)
    setActionErrorMessage('')
    setActionInfoMessage('')
    try {
      const result = await runReport({
        reportId: 'approvedExemptionReport',
        values: { exemptionNumber: detail.exemptionNumber },
      })
      triggerBrowserDownload(result.blob, result.filename)
    } catch (error) {
      console.error(error)
      setActionErrorMessage(
        error instanceof ReportRequestError
          ? error.message
          : 'Unable to generate the approved exemption report.',
      )
    } finally {
      setGeneratingReport(false)
    }
  }, [detail, generatingReport])

  const onAddApplication = useCallback(async () => {
    if (!detail || !applicationNumberToAdd.trim() || applicationMutationNumber) return
    const number = applicationNumberToAdd.trim()
    setApplicationMutationNumber(number)
    setActionErrorMessage('')
    try {
      const result = await addApplicationToExemption(detail.exemptionNumber, number)
      if (!result.success) {
        setActionErrorMessage(result.errors.join(' ') || 'Unable to link the application.')
        return
      }
      setApplicationNumberToAdd('')
      try {
        await refreshEditableData(true)
        setActionInfoMessage(`Application ${number} linked to the exemption.`)
      } catch (refreshError) {
        console.error(refreshError)
        setActionInfoMessage(
          `Application ${number} was linked, but the page could not refresh. Reload before changing application links again.`,
        )
      }
    } catch (error) {
      console.error(error)
      setActionErrorMessage(`Unable to link application ${number}.`)
    } finally {
      setApplicationMutationNumber(null)
    }
  }, [applicationMutationNumber, applicationNumberToAdd, detail, refreshEditableData])

  const onRemoveApplication = useCallback(
    async (applicationNumber: string) => {
      if (!detail || applicationMutationNumber) return
      setApplicationMutationNumber(applicationNumber)
      setActionErrorMessage('')
      try {
        const result = await removeApplicationFromExemption(
          detail.exemptionNumber,
          applicationNumber,
        )
        if (!result.success) {
          setActionErrorMessage(result.errors.join(' ') || 'Unable to unlink the application.')
          return
        }
        try {
          await refreshEditableData(true)
          setActionInfoMessage(`Application ${applicationNumber} removed from the exemption.`)
        } catch (refreshError) {
          console.error(refreshError)
          setApplicationsErrorMessage(
            'Application links changed, but the current links could not be refreshed. Reload the page.',
          )
          setActionInfoMessage(
            `Application ${applicationNumber} was removed, but the page could not refresh. Reload before changing application links again.`,
          )
        }
      } catch (error) {
        console.error(error)
        setActionErrorMessage(`Unable to remove application ${applicationNumber}.`)
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

  const onOpenDocument = useCallback(
    async (row: ProvincialExemptionDocumentRow) => {
      if (!exemptionNumber) {
        return
      }

      setActionErrorMessage('')
      setActionInfoMessage('')

      try {
        const result = await openExemptionDocument(row.id, row.name, exemptionNumber)
        triggerBrowserDownload(result.blob, result.filename || row.name)
      } catch (error) {
        console.error(error)
        setActionErrorMessage('Unable to open the selected document.')
      }
    },
    [exemptionNumber],
  )

  const onRemoveDocument = useCallback(
    async (row: ProvincialExemptionDocumentRow) => {
      if (!exemptionNumber) {
        return
      }

      const isLatestRequest = beginDetailRequest()
      setIsRemovingDocumentId(row.id)
      setActionErrorMessage('')
      setActionInfoMessage('')

      try {
        const removeResult = await removeExemptionDocument(row.id, exemptionNumber)
        if (!isLatestRequest()) {
          return
        }
        if (!removeResult.success) {
          setActionErrorMessage('Document removal failed. Refresh and try again.')
          return
        }

        const documentsResult = await fetchExemptionDocuments(exemptionNumber)
        if (isLatestRequest()) {
          setDocumentRows(documentsResult.rows)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setActionErrorMessage('Unable to remove the selected document.')
        }
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
        <DetailBreadcrumb label="Provincial exemption search" to="/provincial/exemption" />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <div className="application-detail-title-row">
          <PageHeader
            title={`Exemption ${detail?.exemptionNumber ?? exemptionNumber ?? ''}`.trim()}
            subtitle="Check and manage this provincial exemption"
            status={
              detail ? (
                <StatusTag
                  status={detail.exemptionStatusDescription ?? detail.exemptionStatusCode ?? ''}
                  fallbackLabel="Not provided"
                />
              ) : undefined
            }
            actionsLabel="Exemption actions"
            actions={
              detail &&
              ((!editing && canSaveExemption) ||
                editing ||
                canApproveExemption ||
                (persistedStatusCode === 'ACT' && canPerform('/approvedExemptionReport'))) ? (
                <>
                  {!editing && canSaveExemption && (
                    <Button kind="secondary" size="sm" onClick={() => setEditing(true)}>
                      Edit exemption
                    </Button>
                  )}
                  {editing && (
                    <>
                      <Button
                        kind="primary"
                        size="sm"
                        disabled={
                          saving ||
                          Boolean(formValidationMessage) ||
                          requiredExemptionOptionsMissing ||
                          optionsAvailability !== 'available'
                        }
                        onClick={() => void onSaveExemption()}
                      >
                        {saving ? 'Saving...' : 'Save exemption'}
                      </Button>
                      <Button
                        kind="tertiary"
                        size="sm"
                        disabled={saving}
                        onClick={() => {
                          setEditForm(toEditForm(detail, editContext))
                          setEditing(false)
                        }}
                      >
                        Cancel edit
                      </Button>
                    </>
                  )}
                  {canApproveExemption && (
                    <Button
                      kind="primary"
                      size="sm"
                      disabled={approving}
                      onClick={() => {
                        setApprovalCertified(false)
                        setApprovalDate(formatLocalIsoDate(new Date()))
                        setApprovalConfirmationTarget(detail.exemptionNumber)
                        setApprovalConfirmationOpen(true)
                      }}
                    >
                      {approving ? 'Approving...' : 'Approve exemption'}
                    </Button>
                  )}
                  {persistedStatusCode === 'ACT' && canPerform('/approvedExemptionReport') && (
                    <Button
                      kind="secondary"
                      size="sm"
                      disabled={generatingReport}
                      onClick={() => void onGenerateApprovedReport()}
                    >
                      {generatingReport ? 'Generating...' : 'Print approved exemption'}
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />
          {detail && (
            <dl className="application-detail-header-metrics" aria-label="Exemption highlights">
              <div>
                <dt>Type</dt>
                <dd>{displayValue(detail.exemptionTypeDescription ?? detail.exemptionTypeCode)}</dd>
              </div>
              <div>
                <dt>Remaining volume (m³)</dt>
                <dd>{displayValue(detail.remainingVolume)}</dd>
              </div>
              <div>
                <dt>Permits</dt>
                <dd>
                  {permitsErrorMessage ? 'Unavailable' : visiblePermitRows.length.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Documents</dt>
                <dd>
                  {documentsErrorMessage ? 'Unavailable' : documentRows.length.toLocaleString()}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading provincial exemption detail..." />
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

      {!loading && detail && (
        <>
          {!!exemptionEditLockMessage && (
            <AppNotification
              kind="warning"
              title="Editing unavailable"
              subtitle={exemptionEditLockMessage}
              lowContrast
            />
          )}
          {!!editContextUnavailableMessage && (
            <AppNotification
              kind="warning"
              title="Editing unavailable"
              subtitle={editContextUnavailableMessage}
              lowContrast
            />
          )}
          {optionsAvailability === 'unavailable' && <AuthoritativeOptionsUnavailableNotification />}
          {requiredExemptionOptionsMissing && (
            <AppNotification
              kind="warning"
              title="Required exemption options not configured"
              subtitle="A required exemption type, status, or Blanket OIC region list is empty. Exemption saves are disabled."
              lowContrast
            />
          )}
          {!!documentsErrorMessage && !documentsErrorDismissed && (
            <AppNotification
              kind="warning"
              title="Documents unavailable"
              subtitle={documentsErrorMessage}
              lowContrast
              onCloseButtonClick={() => setDocumentsErrorDismissed(true)}
            />
          )}
          {!!applicationsErrorMessage && (
            <AppNotification
              kind="warning"
              title="Associated applications unavailable"
              subtitle={applicationsErrorMessage}
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
          {editing && !!formValidationMessage && (
            <AppNotification
              kind="warning"
              title="Review exemption values"
              subtitle={formValidationMessage}
              lowContrast
            />
          )}

          <Column sm={4} md={8} lg={16} className="application-detail-tabs-column">
            <Tabs
              selectedIndex={selectedExemptionTabIndex}
              onChange={({ selectedIndex }) => setSelectedExemptionTabIndex(selectedIndex)}
            >
              <TabList
                aria-label="Exemption detail sections"
                contained
                size="md"
                className="application-tabs__list application-detail-tab-list"
              >
                <Tab>Summary</Tab>
                {showApplications && <Tab>Applications</Tab>}
                <Tab>Permits</Tab>
                {showFees && <Tab>Fees</Tab>}
                <Tab>Documents</Tab>
                <Tab>Remarks</Tab>
              </TabList>
              <TabPanels>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    {editing && editForm ? (
                      <>
                        <Column sm={4} md={4} lg={8}>
                          <Tile>
                            <h2 className="detail-tile-title">Edit exemption</h2>
                            <div className="legacy-search-grid">
                              <SearchableSelect
                                id="exemptionDetailType"
                                labelText="Exemption type"
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
                                labelText="Status"
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
                                labelText="Approval date"
                                value={editForm.approvalDate}
                                disabled={!canEditApprovalDate}
                                onChange={(value) =>
                                  setEditForm((current) =>
                                    current ? { ...current, approvalDate: value } : current,
                                  )
                                }
                              />
                              <IsoDatePicker
                                id="exemptionDetailExpiryDate"
                                labelText="Expiry date"
                                value={editForm.expiryDate}
                                disabled={!canEditExpiryDate}
                                onChange={(value) =>
                                  setEditForm((current) =>
                                    current ? { ...current, expiryDate: value } : current,
                                  )
                                }
                              />
                              <TextInput
                                id="exemptionDetailApprovedVolume"
                                labelText="Approved volume (m³)"
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
                                titleText="Regions"
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
                            <h2 className="detail-tile-title">Other conditions</h2>
                            <TextArea
                              id="exemptionDetailOtherConditions"
                              labelText="Conditions"
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
                      </>
                    ) : (
                      <>
                        <Column sm={4} md={8} lg={16}>
                          <DetailFieldTile
                            title="Exemption summary"
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
                                value: (
                                  <StatusTag
                                    status={
                                      detail.exemptionStatusDescription ??
                                      detail.exemptionStatusCode ??
                                      ''
                                    }
                                    fallbackLabel="Not provided"
                                  />
                                ),
                              },
                              {
                                label: 'Application number',
                                value: displayValue(detail.applicationNumber),
                              },
                              {
                                label: 'Application status',
                                value: (
                                  <StatusTag
                                    status={detail.applicationStatus ?? ''}
                                    fallbackLabel="Not provided"
                                  />
                                ),
                              },
                              {
                                label: 'Owner client number',
                                value: displayValue(detail.ownerClientNumber),
                              },
                              {
                                label: 'Agent client number',
                                value: displayValue(detail.agentClientNumber),
                              },
                              { label: 'Approval date', value: displayValue(detail.approvalDate) },
                              { label: 'Expiry date', value: displayValue(detail.expiryDate) },
                              {
                                label: 'Approved volume (m³)',
                                value: displayValue(detail.approvedVolume),
                              },
                              { label: 'Used volume (m³)', value: displayValue(detail.usedVolume) },
                              {
                                label: 'Remaining volume (m³)',
                                value: displayValue(detail.remainingVolume),
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
                            title="Other conditions"
                            fields={[
                              { label: 'Conditions', value: displayValue(detail.otherConditions) },
                            ]}
                          />
                        </Column>
                      </>
                    )}
                  </Grid>
                </TabPanel>
                {showApplications && (
                  <TabPanel className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <h2 className="detail-tile-title">Associated applications</h2>
                          {canLinkApplications && (
                            <div className="legacy-search-actions">
                              <TextInput
                                id="exemptionApplicationNumberToAdd"
                                labelText="Application number"
                                value={applicationNumberToAdd}
                                onChange={(event) =>
                                  setApplicationNumberToAdd(event.target.value.replace(/\D/g, ''))
                                }
                              />
                              <Button
                                kind="secondary"
                                size="sm"
                                disabled={
                                  !applicationNumberToAdd.trim() ||
                                  Boolean(applicationMutationNumber)
                                }
                                onClick={() => void onAddApplication()}
                              >
                                {applicationMutationNumber === applicationNumberToAdd.trim()
                                  ? 'Adding...'
                                  : 'Add application'}
                              </Button>
                            </div>
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
                              <Table useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Application</TableHeader>
                                    <TableHeader>Requested volume (m³)</TableHeader>
                                    <TableHeader>Scale volume (m³)</TableHeader>
                                    <TableHeader>Actions</TableHeader>
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
                                        <TableCell>{application.applicationNumber}</TableCell>
                                        <TableCell>{application.requestedVolume || '-'}</TableCell>
                                        <TableCell>{application.scaleVolume || '-'}</TableCell>
                                        <TableCell>
                                          <div className="legacy-search-actions">
                                            <Button
                                              kind="ghost"
                                              size="sm"
                                              disabled={!canOpen}
                                              onClick={() => navigate(withCurrentSearch(path))}
                                            >
                                              Open
                                            </Button>
                                            {canLinkApplications && (
                                              <Button
                                                kind="danger--ghost"
                                                size="sm"
                                                disabled={
                                                  application.locked ||
                                                  Boolean(applicationMutationNumber)
                                                }
                                                onClick={() =>
                                                  void onRemoveApplication(
                                                    application.applicationNumber,
                                                  )
                                                }
                                              >
                                                {applicationMutationNumber ===
                                                application.applicationNumber
                                                  ? 'Removing...'
                                                  : application.locked
                                                    ? 'Locked'
                                                    : 'Remove'}
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
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Related permits</h2>
                        {canCreateMinisterialPermit && (
                          <div className="legacy-search-actions">
                            <Button
                              kind="secondary"
                              size="sm"
                              disabled={creatingPermit}
                              onClick={() => setPermitCreationConfirmationOpen(true)}
                            >
                              {creatingPermit ? 'Creating permit...' : 'Apply for new permit'}
                            </Button>
                          </div>
                        )}
                        {detail.blanketOic && blanketOicTotalsErrorMessage && (
                          <AppNotification
                            kind="warning"
                            title="Blanket OIC totals unavailable"
                            subtitle={blanketOicTotalsErrorMessage}
                            lowContrast
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
                        {!permitsErrorMessage && visiblePermitRows.length > 0 && (
                          <TextInput
                            id="exemptionDetailPermitFilter"
                            labelText="Filter permits"
                            value={permitFilter}
                            onChange={(event) =>
                              updateFilterParam('permitFilter', event.target.value)
                            }
                            placeholder="Filter by permit number, volume, status, or issue date"
                          />
                        )}
                        {permitsErrorMessage ? (
                          <EmptyState
                            title="Permits unavailable"
                            description={permitsErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : filteredPermitRows.length > 0 ? (
                          <TableFrame ariaLabel="Related exemption permits">
                            <Table useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>Permit number</TableHeader>
                                  <TableHeader>Volume (m³)</TableHeader>
                                  <TableHeader>Status</TableHeader>
                                  <TableHeader>Issue date</TableHeader>
                                  <TableHeader>Open</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {filteredPermitRows.map((row) => (
                                  <TableRow key={row.permitNumber}>
                                    <TableCell>{row.permitNumber}</TableCell>
                                    <TableCell>{displayValue(row.permitVolume)}</TableCell>
                                    <TableCell>{displayValue(row.permitStatus)}</TableCell>
                                    <TableCell>{displayValue(row.permitIssueDate)}</TableCell>
                                    <TableCell>
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
                            title={
                              visiblePermitRows.length === 0
                                ? permitRows.length > 0
                                  ? 'No permits available'
                                  : 'No permits found'
                                : 'No permits match this filter'
                            }
                            description={
                              visiblePermitRows.length === 0
                                ? permitRows.length > 0
                                  ? 'No associated permits are available to your account.'
                                  : 'No permits are associated with this exemption.'
                                : 'Try a different permit number.'
                            }
                            headingLevel={3}
                          />
                        )}
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                {showFees && (
                  <TabPanel className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <h2 className="detail-tile-title">Fee rate override</h2>
                          {applicationsErrorMessage ? (
                            <EmptyState
                              title="Fee eligibility unavailable"
                              description="Associated applications could not be loaded, so fee eligibility cannot be determined."
                              headingLevel={3}
                            />
                          ) : editing && editForm ? (
                            <>
                              <Checkbox
                                id="exemptionFeeRateOverride"
                                labelText="Enable fee rate override"
                                checked={editForm.enableRateOverride}
                                disabled={!canEditFeeOverride}
                                onChange={(_, { checked }) =>
                                  setEditForm((current) =>
                                    current
                                      ? {
                                          ...current,
                                          enableRateOverride: Boolean(checked),
                                          feeRate: checked ? current.feeRate : '',
                                        }
                                      : current,
                                  )
                                }
                              />
                              {editForm.enableRateOverride && (
                                <TextInput
                                  id="exemptionFeeRate"
                                  labelText="Fee rate ($/m³)"
                                  value={editForm.feeRate}
                                  disabled={!canEditFeeOverride}
                                  onChange={(event) =>
                                    setEditForm((current) =>
                                      current
                                        ? { ...current, feeRate: event.target.value }
                                        : current,
                                    )
                                  }
                                />
                              )}
                            </>
                          ) : !editContextLoaded ? (
                            <EmptyState
                              title="Fee rate unavailable"
                              description="Fee rate settings could not be loaded."
                              headingLevel={3}
                            />
                          ) : editContext.rateOverrideEnabled ? (
                            <p>{`$${editContext.fixedFeeRate || '0.00'} per m³`}</p>
                          ) : (
                            <EmptyState
                              title="No fee rate override"
                              description="No flat rate has been set for this exemption."
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
                        <h2 className="detail-tile-title">Documents</h2>
                        {canUploadExemptionDocuments && (
                          <DetailDocumentUploadPanel
                            key={`exemption-document-upload-${exemptionNumber}-${documentUploadResetKey}`}
                            workflowType="exemption"
                            targetNumber={detail.exemptionNumber}
                            inputId="exemptionDocumentUpload"
                            disabled={!detail.exemptionNumber}
                            onDirtyChange={setDocumentUploadDirty}
                            onBusyChange={setDocumentUploadBusy}
                            onUploadComplete={refreshExemptionDocuments}
                          />
                        )}
                        {documentRows.length > 0 && (
                          <TextInput
                            id="exemptionDetailDocumentsFilter"
                            labelText="Filter document rows"
                            value={documentsFilter}
                            onChange={(event) =>
                              updateFilterParam('documentsFilter', event.target.value)
                            }
                            placeholder="Filter by file name, description, type, source, or id"
                          />
                        )}
                        {documentsErrorMessage ? (
                          <EmptyState
                            title="Documents unavailable"
                            description={documentsErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : filteredDocumentRows.length > 0 ? (
                          <TableFrame ariaLabel="Exemption document rows">
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
                                            !canDeleteExemptionDocuments ||
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
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <EmptyState
                            title={
                              documentRows.length === 0
                                ? 'No documents found'
                                : 'No documents match this filter'
                            }
                            description={
                              documentRows.length === 0
                                ? 'No documents have been uploaded for this exemption.'
                                : 'Try a different file name, description, type, or identifier.'
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
                        <h2 className="detail-tile-title">Remarks</h2>
                        {(detail.remarks ?? []).length > 0 && (
                          <TextInput
                            id="exemptionDetailRemarkFilter"
                            labelText="Filter remarks"
                            value={remarkFilter}
                            onChange={(event) =>
                              updateFilterParam('remarkFilter', event.target.value)
                            }
                            placeholder="Filter by title or remark text"
                          />
                        )}
                        {filteredRemarks.length > 0 ? (
                          <TableFrame ariaLabel="Exemption remarks">
                            <Table useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>Title</TableHeader>
                                  <TableHeader>Remark</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {filteredRemarks.map((item) => (
                                  <TableRow key={`${item.title}-${item.remark}`}>
                                    <TableCell>{item.title}</TableCell>
                                    <TableCell>{item.remark}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <EmptyState
                            title={
                              (detail.remarks ?? []).length === 0
                                ? 'No remarks found'
                                : 'No remarks match this filter'
                            }
                            description={
                              (detail.remarks ?? []).length === 0
                                ? 'No remarks have been added to this exemption.'
                                : 'Try a different title or remark text.'
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
      {approvalConfirmationOpen && approvalConfirmationTarget === detail?.exemptionNumber && (
        <Modal
          open
          danger
          modalHeading="Approve exemption"
          primaryButtonText={approving ? 'Approving...' : 'Approve exemption'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={approving || !approvalCertified}
          onRequestClose={closeApprovalConfirmation}
          onSecondarySubmit={closeApprovalConfirmation}
          onRequestSubmit={() => {
            if (approvalConfirmationTarget === detail?.exemptionNumber) {
              void onApproveExemption()
            }
          }}
        >
          <p>You are about to approve exemption {detail?.exemptionNumber ?? exemptionNumber}.</p>
          <p>
            By checking the box below you certify that this exemption has been approved. This
            exemption will be marked with an approval date of {approvalDate}.
          </p>
          <Checkbox
            id="approveExemptionCertification"
            labelText="I certify that this exemption has been approved."
            checked={approvalCertified}
            disabled={approving}
            onChange={(_, { checked }) => setApprovalCertified(Boolean(checked))}
          />
        </Modal>
      )}
      {approvalEmailRecipients.length > 0 && (
        <ExemptionApprovalEmailModal
          recipients={approvalEmailRecipients}
          sending={sendingApprovalEmail}
          onRecipientsChange={setApprovalEmailRecipients}
          onSend={(recipients) => void onSendApprovalEmail(recipients)}
          onSkip={closeApprovalEmail}
        />
      )}
      {permitCreationConfirmationOpen && canCreateMinisterialPermit && detail && (
        <Modal
          open
          modalHeading="Apply for new permit"
          primaryButtonText={creatingPermit ? 'Creating...' : 'Create permit'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={creatingPermit}
          aria-describedby="permit-creation-confirmation-description"
          onRequestClose={closePermitCreationConfirmation}
          onSecondarySubmit={closePermitCreationConfirmation}
          onRequestSubmit={() => void onCreatePermitFromExemption()}
        >
          <p id="permit-creation-confirmation-description">
            This creates a new active permit shell for Ministerial exemption{' '}
            {detail.exemptionNumber}.
          </p>
          <p>
            Applications are not attached automatically. Attach the required applications separately
            from the new permit.
          </p>
        </Modal>
      )}
      <UnsavedChangesGuard
        isDirty={isExemptionDirty}
        isBusy={
          saving ||
          approving ||
          sendingApprovalEmail ||
          creatingPermit ||
          applicationMutationNumber !== null ||
          isRemovingDocumentId !== null ||
          documentUploadBusy
        }
        onSave={onSaveUnsavedExemptionChanges}
        onDiscard={onDiscardExemptionChanges}
        subject="this exemption"
        saveUnavailableReason={
          (optionsAvailability !== 'available' || requiredExemptionOptionsMissing) &&
          isExemptionFormDirty
            ? 'Authoritative exemption options must load before these changes can be saved.'
            : documentUploadDirty
              ? 'Finish or reset the queued document uploads before leaving, or discard all changes.'
              : applicationRelationshipDraftDirty
                ? 'Add or clear the typed application number before leaving, or discard all changes.'
                : undefined
        }
      />
    </Grid>
  )
}

export default ProvincialExemptionDetailsPage
