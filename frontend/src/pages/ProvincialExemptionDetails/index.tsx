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
  InlineNotification,
  Loading,
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
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ContentLoadingOverlay from '@/components/ContentLoadingOverlay'
import ConfirmationModal from '@/components/ConfirmationModal'
import Modal from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import DetailLoadError from '@/components/DetailLoadError'
import DisabledButtonTooltip from '@/components/DisabledButtonTooltip'
import ExemptionApprovalEmailModal, {
  type ExemptionApprovalRecipient,
} from '@/components/ExemptionApprovalEmailModal'
import PageHeader from '@/components/PageHeader'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { useAuth } from '@/context/auth/useAuth'
import { hasProvincialSubmitterRole, hasRole } from '@/context/auth/role-utils'
import { AppNotification } from '../../components/AppNotification'
import DetailDocumentUploadPanel from '../../components/uploads/DetailDocumentUploadPanel'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import { formatDocumentSource } from '@/service/document-service-utils'
import { DetailFieldTile } from '../shared/DetailSections'
import { displayValue, matchesFilter } from '@/pages/shared/detail-page-utils'
import { appendSearchParamsToPath, searchParamsWithValue } from '@/pages/shared/search-query-utils'
import {
  locationPath,
  readDetailReturnTo,
  withDetailReturnTo,
} from '@/pages/shared/detail-navigation'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { useReloadPreservedTab } from '@/pages/shared/useReloadPreservedTab'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
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
import { requiredLabel } from '@/utils/required-label'
import BlanketOicPermitCreateModal from './BlanketOicPermitCreateModal'

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
  owner: 'Owner',
  agent: 'Agent',
  summary: 'Exemption details',
  applications: 'Applications',
  documents: 'Documents',
  permits: 'Permits',
  fees: 'Fees',
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

type ExemptionClientTileProps = {
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

const ExemptionClientTile = ({
  title,
  clientNumber,
  applicantType,
  locationCode,
  contactName,
  companyName,
  locations,
  clientData,
  isLoading,
  showAgentIndicator = false,
}: ExemptionClientTileProps) => {
  const locationName =
    locations.find((location) => location.locationCode === locationCode)?.locationName ?? ''
  const loadingValue = (value: string | null | undefined) =>
    isLoading ? 'Loading…' : displayValue(value)

  return (
    <DetailFieldTile
      title={title}
      fields={[
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
      ]}
    />
  )
}

const ProvincialExemptionDetailsPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { capabilities, canPerform, defaultRoute } = useAuth()
  const { exemptionNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [applicationPendingRemoval, setApplicationPendingRemoval] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [applicationsErrorMessage, setApplicationsErrorMessage] = useState('')
  const [permitsErrorMessage, setPermitsErrorMessage] = useState('')
  const [blanketOicTotalsErrorMessage, setBlanketOicTotalsErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [documentPendingDeletion, setDocumentPendingDeletion] =
    useState<ProvincialExemptionDocumentRow | null>(null)
  const [isEditingDocuments, setIsEditingDocuments] = useState(false)
  const [documentUploadDirty, setDocumentUploadDirty] = useState(false)
  const [documentUploadBusy, setDocumentUploadBusy] = useState(false)
  const [documentUploadResetKey, setDocumentUploadResetKey] = useState(0)
  const [selectedExemptionTab, selectExemptionTab] = useReloadPreservedTab({
    tabs: EXEMPTION_DETAIL_TAB_SLOTS,
    defaultTab: 'owner',
  })
  const beginDetailRequest = useLatestRequestGuard()
  const currentDetail = detail && String(detail.exemptionNumber) === exemptionNumber ? detail : null
  const clientContextApplication = applications[0] ?? null
  const clientContextHasAgent = isAgentApplicant(clientContextApplication?.applicantTypeCode ?? '')
  const linkedApplicationNumber = clientContextApplication?.applicationNumber.trim() ?? ''
  const exemptionOwnerClientNumber = clientContextApplication?.ownerClientNumber.trim() ?? ''
  const exemptionAgentClientNumber = clientContextApplication?.agentClientNumber.trim() ?? ''
  const ownerClientLocationCode = clientContextApplication?.ownerClientLocationCode.trim() ?? ''
  const agentClientLocationCode = clientContextApplication?.agentClientLocationCode.trim() ?? ''
  const isRefreshingDetail = loading && !!currentDetail
  const permitFilter = searchParams.get('permitFilter') ?? ''
  const documentsFilter = searchParams.get('documentsFilter') ?? ''
  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
  )
  const updateFilterParam = useCallback(
    (key: 'permitFilter' | 'documentsFilter', value: string) => {
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
    navigate(destination, {
      state: withDetailReturnTo(
        location.state,
        {
          label: 'Provincial exemption detail',
          to: locationPath(location),
        },
        detailReturnTo,
      ),
    })
  }, [
    creatingPermit,
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
          'Owner and agent details could not be retrieved from the linked application.',
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
      const isRefreshingCurrentExemption =
        detailRef.current !== null && String(detailRef.current.exemptionNumber) === exemptionNumber
      if (!isRefreshingCurrentExemption) {
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
        setIsEditingDocuments(false)
        setDocumentsErrorMessage('')
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
      setApplicationsErrorMessage('')
      setPermitsErrorMessage('')
      setBlanketOicTotalsErrorMessage('')
      setActionErrorMessage('')
      setActionInfoMessage('')
      if (!isRefreshingCurrentExemption) {
        setEditing(false)
        setIsEditingDocuments(false)
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

  const filteredDocumentRows = useMemo(() => {
    return documentRows.filter((row) =>
      matchesFilter([row.name, row.description, row.type, row.source, row.id], documentsFilter),
    )
  }, [documentRows, documentsFilter])
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
  const hasExemptionEditPermission = canPerform('saveExemption') && persistedStatusCode !== 'EXP'
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
  const editContextUnavailableMessage =
    hasExemptionEditPermission &&
    !editContextLoaded &&
    !editContextRefreshing &&
    !isRefreshingDetail
      ? 'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.'
      : ''
  const canApproveExemption =
    canPerform('approveExemption') &&
    persistedStatusCode === 'NEW' &&
    !editing &&
    !exemptionEditLocked
  const canCreateApplicationBackedPermit =
    canPerform('createPermit') &&
    (isApplicationApprover || isProvincialSubmitter) &&
    (persistedTypeCode === 'M' || persistedTypeCode === 'O') &&
    persistedStatusCode === 'ACT' &&
    editContextLoaded &&
    !exemptionEditLocked &&
    !permitCreationRequiresReload &&
    !editing &&
    !isExemptionDirty
  const canCreateBlanketOicPermit =
    canPerform('createPermit') &&
    canPerform('savePermit') &&
    (isApplicationApprover || isProvincialSubmitter) &&
    persistedTypeCode === 'B' &&
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
  const applicationNumberToAddError =
    provincialApplicationNumberFieldError(applicationNumberToAdd) ?? ''
  const addApplicationDisabled =
    Boolean(applicationMutationNumber) ||
    !applicationNumberToAdd.trim() ||
    Boolean(applicationNumberToAddError)
  const addApplicationDisabledDescription = applicationMutationNumber
    ? 'Wait for the current application link update to finish.'
    : applicationNumberToAddError
      ? applicationNumberToAddError
      : 'Enter an application number to add it.'
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
  const showOwner =
    showApplications && Boolean(linkedApplicationNumber && exemptionOwnerClientNumber)
  const showAgent =
    showApplications &&
    clientContextHasAgent &&
    Boolean(linkedApplicationNumber && exemptionAgentClientNumber)
  const feeManagementAvailable =
    currentTypeCode === 'B' ||
    currentTypeCode === 'O' ||
    containsUnmanu === true ||
    editContext.rateOverrideEnabled
  const showFees = feeManagementAvailable || Boolean(applicationsErrorMessage)
  const exemptionDetailTabs: ExemptionDetailTabKey[] = [
    ...(showOwner ? (['owner'] as const) : []),
    ...(showAgent ? (['agent'] as const) : []),
    'summary',
    ...(showApplications ? (['applications'] as const) : []),
    'documents',
    'permits',
    ...(showFees ? (['fees'] as const) : []),
  ]
  const activeExemptionTab = exemptionDetailTabs.includes(selectedExemptionTab)
    ? selectedExemptionTab
    : 'summary'
  const selectedExemptionTabIndex = Math.max(0, exemptionDetailTabs.indexOf(activeExemptionTab))
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

  const canUploadExemptionDocuments = canPerform('/fileExemptionUpload') && !exemptionEditLocked
  const canDeleteExemptionDocuments =
    isApplicationApprover &&
    persistedStatusCode.length > 0 &&
    persistedStatusCode !== 'EXP' &&
    editContextLoaded &&
    !exemptionEditLocked
  const canEditExemptionDocuments = canUploadExemptionDocuments || canDeleteExemptionDocuments

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
          setEditing(false)
        }
        throw error
      } finally {
        setEditContextRefreshing(false)
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
    setIsEditingDocuments(false)
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
      selectExemptionTab('applications')
      setActionErrorMessage('Add the typed application number or clear it before leaving.')
      return false
    }
    return isExemptionFormDirty ? onSaveExemption() : true
  }, [
    applicationRelationshipDraftDirty,
    documentUploadDirty,
    isExemptionFormDirty,
    onSaveExemption,
    selectExemptionTab,
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
            ? `Exemption approved. ${email.message || 'Approval email sent.'}`
            : `Exemption approved. ${email.message || 'The approval email could not be sent.'}`,
        )
      } catch (error) {
        console.error(error)
        setActionInfoMessage('Exemption approved. The approval email could not be sent.')
      } finally {
        setSendingApprovalEmail(false)
        setApprovalEmailRecipients([])
      }
    },
    [sendingApprovalEmail],
  )

  const onApproveExemption = useCallback(async (): Promise<boolean> => {
    if (!detail || approving || !approvalCertified) return false
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
        return false
      }

      const recipients = approval.sendGrid.map(
        ([number, email]): ExemptionApprovalRecipient => [number, email],
      )
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
      return true
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to approve the exemption.')
      return false
    } finally {
      setApproving(false)
    }
  }, [approvalCertified, approving, detail, refreshEditableData])

  const closePermitCreationConfirmation = useCallback(() => {
    if (creatingPermit) return
    setPermitCreationConfirmationOpen(false)
  }, [creatingPermit])

  const onCreatePermitFromExemption = useCallback(async () => {
    if (!detail || !canCreateApplicationBackedPermit || creatingPermit) return

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
    }

    if (newPermitPath) {
      setPermitCreationConfirmationOpen(false)
      setPermitCreationDestination(newPermitPath)
    }
  }, [canCreateApplicationBackedPermit, creatingPermit, detail])

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
      if (result.blob) {
        triggerBrowserDownload(result.blob, result.filename)
      }
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
    if (
      !detail ||
      !applicationNumberToAdd.trim() ||
      applicationNumberToAddError ||
      applicationMutationNumber
    )
      return
    const enteredNumber = applicationNumberToAdd.trim()
    const number = normalizeProvincialApplicationNumber(enteredNumber)
    setApplicationMutationNumber(enteredNumber)
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
  }, [
    applicationMutationNumber,
    applicationNumberToAdd,
    applicationNumberToAddError,
    detail,
    refreshEditableData,
  ])

  const onRemoveApplication = useCallback(
    async (applicationNumber: string) => {
      if (!detail || applicationMutationNumber) {
        throw new Error('Application links are not available for removal right now.')
      }
      setApplicationMutationNumber(applicationNumber)
      setActionErrorMessage('')
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
    setActionErrorMessage('')
    setIsEditingDocuments(false)
  }, [])

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
        throw new Error('Exemption number is unavailable.')
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
          throw new Error('Document removal failed. Refresh and try again.')
        }

        try {
          const documentsResult = await fetchExemptionDocuments(exemptionNumber)
          if (isLatestRequest()) {
            setDocumentRows(documentsResult.rows)
            setDocumentsErrorMessage('')
            setActionInfoMessage(`${row.name || 'Document'} was deleted.`)
          }
        } catch (refreshError) {
          if (isLatestRequest()) {
            console.error(refreshError)
            setDocumentsErrorMessage(
              'The document was deleted, but exemption documents could not be refreshed. Reload the page.',
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
          subtitle="Check and manage this provincial exemption"
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
            ((!editing && canSaveExemption) ||
              editing ||
              canApproveExemption ||
              (persistedStatusCode === 'ACT' && canPerform('/approvedExemptionReport'))) ? (
              <>
                {!editing && canSaveExemption && (
                  <Button
                    kind="tertiary"
                    size="sm"
                    onClick={() => {
                      selectExemptionTab('summary')
                      setEditing(true)
                    }}
                  >
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
                      renderIcon={saving ? PendingIcon : undefined}
                      onClick={() => void onSaveExemption()}
                    >
                      {saving ? 'Saving…' : 'Save exemption'}
                    </Button>
                    <Button
                      kind="tertiary"
                      size="sm"
                      disabled={saving}
                      onClick={() => {
                        setEditForm(toEditForm(currentDetail, editContext))
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
              autoDismissMs={6000}
              onCloseButtonClick={() => setActionInfoMessage('')}
            />
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
                  <Tab key={tab}>{EXEMPTION_DETAIL_TAB_LABELS[tab]}</Tab>
                ))}
              </TabList>
              <ContiguousTabPanels order={exemptionDetailTabs}>
                {showOwner && (
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
                        ) : (
                          <ExemptionClientTile
                            title="Owner client details"
                            clientNumber={exemptionOwnerClientNumber}
                            applicantType={clientContextApplication?.applicantTypeCode ?? ''}
                            locationCode={ownerClientLocationCode}
                            contactName={clientContextApplication?.ownerContactName ?? ''}
                            companyName={clientContextApplication?.ownerCompanyName ?? ''}
                            locations={ownerClientLocations}
                            clientData={ownerClientData}
                            isLoading={clientContextLoading}
                            showAgentIndicator
                          />
                        )}
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
                {showAgent && (
                  <TabPanel key="agent" className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        {clientContextErrorMessage ? (
                          <EmptyState
                            title="Client details unavailable"
                            description={clientContextErrorMessage}
                            headingLevel={3}
                            role="alert"
                          />
                        ) : (
                          <ExemptionClientTile
                            title="Agent client details"
                            clientNumber={exemptionAgentClientNumber}
                            applicantType={clientContextApplication?.applicantTypeCode ?? ''}
                            locationCode={agentClientLocationCode}
                            contactName={clientContextApplication?.agentContactName ?? ''}
                            companyName={clientContextApplication?.agentCompanyName ?? ''}
                            locations={agentClientLocations}
                            clientData={agentClientData}
                            isLoading={clientContextLoading}
                          />
                        )}
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
                <TabPanel key="summary" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    {editing && editForm ? (
                      <>
                        <Column sm={4} md={4} lg={8}>
                          <Tile>
                            <h2 className="detail-tile-title">Edit exemption</h2>
                            <div className="legacy-search-grid">
                              <SearchableSelect
                                id="exemptionDetailType"
                                labelText={requiredLabel('Exemption type')}
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
                                labelText={requiredLabel(
                                  'Approval date',
                                  currentTypeCode === 'O' || currentTypeCode === 'B',
                                )}
                                value={editForm.approvalDate}
                                invalid={
                                  ((currentTypeCode === 'O' || currentTypeCode === 'B') &&
                                    !editForm.approvalDate.trim()) ||
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
                                labelText={requiredLabel('Expiry date')}
                                value={editForm.expiryDate}
                                invalid={
                                  !editForm.expiryDate.trim() ||
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
                                value: displayValue(detail.approvalDate),
                              },
                              { label: 'Expiry date', value: displayValue(detail.expiryDate) },
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
                          <h2 className="detail-tile-title">Associated applications</h2>
                          {canLinkApplications && (
                            <div className="exemption-application-add-form">
                              <TextInput
                                id="exemptionApplicationNumberToAdd"
                                labelText={requiredLabel('Application number')}
                                value={applicationNumberToAdd}
                                invalid={Boolean(applicationNumberToAddError)}
                                invalidText={applicationNumberToAddError}
                                onChange={(event) => setApplicationNumberToAdd(event.target.value)}
                              />
                              <DisabledButtonTooltip
                                disabled={addApplicationDisabled}
                                description={addApplicationDisabledDescription}
                              >
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  disabled={addApplicationDisabled}
                                  renderIcon={
                                    applicationMutationNumber === applicationNumberToAdd.trim()
                                      ? PendingIcon
                                      : undefined
                                  }
                                  onClick={() => void onAddApplication()}
                                >
                                  {applicationMutationNumber === applicationNumberToAdd.trim()
                                    ? 'Adding…'
                                    : 'Add application'}
                                </Button>
                              </DisabledButtonTooltip>
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
                              <Table size="md" useZebraStyles>
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
                                            <DisabledButtonTooltip
                                              disabled={!canOpen}
                                              description="You do not have permission to open this application."
                                            >
                                              <Button
                                                kind="ghost"
                                                size="sm"
                                                disabled={!canOpen}
                                                onClick={() =>
                                                  navigate(withCurrentSearch(path), {
                                                    state: withDetailReturnTo(
                                                      location.state,
                                                      {
                                                        label: 'Provincial exemption detail',
                                                        to: locationPath(location),
                                                      },
                                                      detailReturnTo,
                                                    ),
                                                  })
                                                }
                                              >
                                                Open
                                              </Button>
                                            </DisabledButtonTooltip>
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
                                                  onClick={() =>
                                                    setApplicationPendingRemoval(
                                                      application.applicationNumber,
                                                    )
                                                  }
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
                        <h2 className="detail-tile-title">Related permits</h2>
                        {editing && (
                          <p className="detail-read-only-note">
                            Permit records are read-only. Use the Exemption details or Fees tab to
                            edit exemption values.
                          </p>
                        )}
                        {(canCreateApplicationBackedPermit || canCreateBlanketOicPermit) && (
                          <div className="legacy-search-actions">
                            <Button
                              kind="tertiary"
                              size="sm"
                              disabled={creatingPermit}
                              onClick={() => setPermitCreationConfirmationOpen(true)}
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
                            <Table size="md" useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>Permit</TableHeader>
                                  <TableHeader>Volume (m³)</TableHeader>
                                  <TableHeader>Status</TableHeader>
                                  <TableHeader>Issue date</TableHeader>
                                  <TableHeader>Actions</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {filteredPermitRows.map((row) => (
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
                  <TabPanel key="fees" className="application-detail-tab-panel">
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
                                  labelText={requiredLabel('Fee rate ($/m³)')}
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
                <TabPanel key="documents" className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <div className="detail-section-card__header">
                          <h2 className="detail-tile-title">Documents</h2>
                          {canEditExemptionDocuments &&
                            (isEditingDocuments ? (
                              <Button
                                kind="tertiary"
                                size="sm"
                                disabled={documentUploadBusy || isRemovingDocumentId !== null}
                                onClick={onCancelDocumentEditing}
                              >
                                Cancel
                              </Button>
                            ) : (
                              <Button
                                kind="tertiary"
                                size="sm"
                                renderIcon={Edit}
                                onClick={() => setIsEditingDocuments(true)}
                              >
                                Edit documents
                              </Button>
                            ))}
                        </div>
                        {isEditingDocuments && canUploadExemptionDocuments && (
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
                                        {isEditingDocuments && (
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
      {approvalConfirmationOpen &&
        approvalConfirmationTarget === currentDetail?.exemptionNumber && (
          <ConfirmationModal
            open
            title="Approve exemption"
            description={`You are about to approve exemption ${
              currentDetail?.exemptionNumber ?? exemptionNumber
            }.`}
            confirmLabel="Approve exemption"
            pendingLabel="Approving…"
            confirmDisabled={approving || !approvalCertified}
            onClose={closeApprovalConfirmation}
            onError={() => undefined}
            onConfirm={async () => {
              if (approvalConfirmationTarget === currentDetail?.exemptionNumber) {
                const approved = await onApproveExemption()
                if (!approved) {
                  throw new Error('Exemption approval failed.')
                }
              }
            }}
          >
            <p>
              By checking the box below you certify that this exemption has been approved. This
              exemption will be marked with an approval date of {approvalDate}.
            </p>
            <Checkbox
              id="approveExemptionCertification"
              labelText={requiredLabel('I certify that this exemption has been approved.')}
              checked={approvalCertified}
              disabled={approving}
              onChange={(_, { checked }) => setApprovalCertified(Boolean(checked))}
            />
          </ConfirmationModal>
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
      {permitCreationConfirmationOpen && canCreateApplicationBackedPermit && currentDetail && (
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
            This creates a new active permit for {currentDetail.exemptionTypeDescription} exemption{' '}
            {currentDetail.exemptionNumber}.
          </p>
          <p>Eligible application scales from this exemption will be added automatically.</p>
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
              onClick={() => void onCreatePermitFromExemption()}
            >
              {creatingPermit ? 'Creating…' : 'Create permit'}
            </Button>
          </div>
        </Modal>
      )}
      {permitCreationConfirmationOpen && canCreateBlanketOicPermit && currentDetail && (
        <BlanketOicPermitCreateModal
          open
          exemptionNumber={currentDetail.exemptionNumber}
          exemptionExpiryDate={currentDetail.expiryDate ?? ''}
          regionOptions={regionOptions}
          defaultRegionNumbers={editContext.regionNumbers}
          onClose={closePermitCreationConfirmation}
          onBusyChange={setCreatingPermit}
          onCreated={(permitNumber) => {
            setPermitCreationConfirmationOpen(false)
            setPermitCreationDestination(`/provincial/permit/${encodeURIComponent(permitNumber)}`)
          }}
          onUnknownOutcome={(message) => {
            setPermitCreationRequiresReload(true)
            setPermitCreationConfirmationOpen(false)
            setActionErrorMessage(message)
          }}
        />
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
