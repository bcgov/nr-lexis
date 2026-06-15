import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { Add, ArrowLeft, Launch, Search, Upload } from '@carbon/icons-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { fetchProvincialApplicationDetail } from '@/service/lexis-detail-service'
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
} from '@/service/application-review-search-service'
import {
  fetchApplicationClientData,
  fetchApplicationClientContacts,
  fetchApplicationClientLocations,
  type ApplicationClientData,
  type ApplicationClientContact,
  type ApplicationClientLocation,
} from '@/service/application-client-lookup-service'
import {
  fetchApplicationReviewOptions,
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'
import DetailDocumentUploadPanel from '@/components/uploads/DetailDocumentUploadPanel'
import IsoDatePicker from '@/components/IsoDatePicker'
import SearchableSelect from '@/components/SearchableSelect'
import { calculateApplicationTermDays } from '@/pages/shared/application-term-utils'
import {
  atMostOneDecimalFieldError,
  firstValidationError,
  isoDateFieldError,
  maxNumericValueFieldError,
  maxLengthFieldError,
  positiveNumericFieldError,
  requiredFieldError,
  type FieldErrors,
} from '@/pages/shared/create-form-utils'
import ProvincialApplicationItemsPanel from './ApplicationItemsPanel'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const normalizeText = (value: string): string => value.trim().toLowerCase()
const normalizeReviewStatus = (status: string): string => status.trim().toUpperCase()
const normalizeEmail = (email: string): string => email.trim()
const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
const EMAIL_SUPPORTED_STATUS_CODES = new Set(['REJ', 'WDN'])
const REVIEW_STATUSES_REQUIRING_REMARK = new Set(['REJ', 'WDN'])
const APPLICANT_TYPE_OPTIONS: SearchOption[] = [
  { value: 'O', label: 'Owner' },
  { value: 'A', label: 'Agent' },
]
const JURISDICTION_OPTIONS: SearchOption[] = [
  { value: 'P', label: 'Provincial' },
  { value: 'F', label: 'Federal' },
]
const OIC_INDICATOR_OPTIONS: SearchOption[] = [
  { value: 'N', label: 'No' },
  { value: 'Y', label: 'Yes' },
]

const isSelectableClientLocation = (location: ApplicationClientLocation): boolean =>
  location.locationCode !== '0'

const isSelectableClientContact = (contact: ApplicationClientContact): boolean =>
  contact.contactId !== '0'

const resolveClientLocationCode = (
  locations: ApplicationClientLocation[],
  currentCode: string,
): string => {
  const normalizedCurrentCode = currentCode.trim()
  if (
    normalizedCurrentCode &&
    locations.some(
      (location) =>
        isSelectableClientLocation(location) && location.locationCode === normalizedCurrentCode,
    )
  ) {
    return normalizedCurrentCode
  }

  const selectedLocation = locations.find(
    (location) => isSelectableClientLocation(location) && location.selected,
  )
  if (selectedLocation) {
    return selectedLocation.locationCode
  }

  return locations.find(isSelectableClientLocation)?.locationCode ?? ''
}

const resolveClientContactName = (
  contacts: ApplicationClientContact[],
  currentName: string,
): string => {
  const normalizedCurrentName = currentName.trim()
  if (
    normalizedCurrentName &&
    contacts.some(
      (contact) =>
        isSelectableClientContact(contact) && contact.contactName === normalizedCurrentName,
    )
  ) {
    return normalizedCurrentName
  }

  return contacts.find(isSelectableClientContact)?.contactName ?? normalizedCurrentName
}

const optionLabel = (option: SearchOption): string =>
  option.label === option.value ? option.label : `${option.value} - ${option.label}`

const codeOptionLabel = (option: ApplicationCodeOption): string =>
  option.description && option.description !== option.code
    ? `${option.code} - ${option.description}`
    : option.code

const toSearchOption = (option: ApplicationCodeOption): SearchOption => ({
  value: option.code,
  label: codeOptionLabel(option),
})

const toApplicationCodeOption = (option: SearchOption): ApplicationCodeOption => ({
  code: option.value,
  description: option.label,
})

type ClientDataSummaryProps = {
  title: string
  clientData: ApplicationClientData | null
  isLoading: boolean
}

const ClientDataSummary: FC<ClientDataSummaryProps> = ({ title, clientData, isLoading }) => {
  if (isLoading) {
    return <InlineLoading description={`Loading ${title.toLowerCase()}...`} />
  }

  if (!clientData) {
    return null
  }

  return (
    <section className="application-client-summary" aria-label={title}>
      <h3 className="application-client-summary__title">{title}</h3>
      <dl className="detail-field-grid">
        {[
          ['Company Name', displayValue(clientData.companyName)],
          ['Address', displayValue(clientData.address)],
          ['City', displayValue(clientData.city)],
          ['Province', displayValue(clientData.province)],
          ['Postal Code', displayValue(clientData.postalCode)],
          ['Country', displayValue(clientData.country)],
          ['Phone', displayValue(clientData.phone)],
          ['Fax', displayValue(clientData.fax)],
          ['E-Mail', displayValue(clientData.email)],
        ].map(([label, value]) => (
          <div key={label} className="detail-field-item">
            <dt className="detail-field-label">{label}</dt>
            <dd className="detail-field-value">{value}</dd>
          </div>
        ))}
      </dl>
      {clientData.notfound && (
        <InlineNotification
          kind="warning"
          title="Client Lookup"
          subtitle={clientData.notfound}
          lowContrast
          hideCloseButton
        />
      )}
    </section>
  )
}

const optionsWithCurrentValue = (options: SearchOption[], currentValue: string): SearchOption[] => {
  const normalizedCurrentValue = currentValue.trim()
  if (
    !normalizedCurrentValue ||
    options.some((option) => option.value === normalizedCurrentValue)
  ) {
    return options
  }

  return [{ value: normalizedCurrentValue, label: normalizedCurrentValue }, ...options]
}

const triggerBrowserDownload = (blob: Blob, filename: string): void => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

const matchesFilter = (
  values: Array<string | number | null | undefined>,
  filterValue: string,
): boolean => {
  if (!filterValue.trim()) {
    return true
  }

  const normalizedFilter = normalizeText(filterValue)
  return values.some((value) => normalizeText(String(value ?? '')).includes(normalizedFilter))
}

type ApplicationSummaryFormState = {
  applicationDate: string
  receivedDate: string
  termDays: string
  termMonths: string
  termYears: string
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

const toSummaryFormState = (detail: ProvincialApplicationDetail): ApplicationSummaryFormState => ({
  applicationDate: detail.applicationDate ?? '',
  receivedDate: detail.receivedDate ?? '',
  termDays: detail.termDays === null ? '' : String(detail.termDays),
  termMonths: '',
  termYears: '',
  applicationVolume: detail.applicationVolume === null ? '' : String(detail.applicationVolume),
  averageLogVolume: detail.averageLogVolume === null ? '' : String(detail.averageLogVolume),
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
  termMonths: '',
  termYears: '',
  applicationVolume: snapshot.applicationVolume,
  averageLogVolume: snapshot.averageLogVolume,
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

const productTypeRequiresGrowthType = (productTypeCode: string): boolean =>
  productTypeCode === 'H' || productTypeCode === 'S'

const isAgentApplicant = (applicantTypeCode: string): boolean => applicantTypeCode === 'A'
const APPLICATION_STATUS_EXPIRED = 'EXP'
const APPLICATION_STATUS_PERMITTED = 'PMT'
const APPLICATION_DOCUMENT_DELETE_ROLES = new Set([
  'ADMIN',
  'LEXIS_ADMIN',
  'APPLICATION_APPROVER',
  'LEXIS_APPLICATION_APPROVER',
])
const APPLICATION_DOCUMENT_INDUSTRY_ROLES = new Set([
  'PROVINCIAL_SUBMITTER',
  'LEXIS_PROVINCIAL_SUBMITTER',
  'FEDERAL_SUBMITTER',
  'LEXIS_FEDERAL_SUBMITTER',
])

const isIndustryApplicationRole = (role: string): boolean => {
  const normalizedRole = role.trim().toUpperCase()
  return (
    APPLICATION_DOCUMENT_INDUSTRY_ROLES.has(normalizedRole) ||
    normalizedRole.startsWith('PROVINCIAL_SUBMITTER_') ||
    normalizedRole.startsWith('LEXIS_PROVINCIAL_SUBMITTER_') ||
    normalizedRole.startsWith('FEDERAL_SUBMITTER_') ||
    normalizedRole.startsWith('LEXIS_FEDERAL_SUBMITTER_')
  )
}

const canDeleteApplicationDocuments = (
  detail: ProvincialApplicationDetail | null,
  roles: string[],
): boolean => {
  if (!detail) {
    return false
  }

  const status = detail.applicationStatusCode?.trim().toUpperCase() ?? ''
  const normalizedRoles = roles.map((role) => role.trim().toUpperCase())
  const approverOrAdmin = normalizedRoles.some((role) =>
    APPLICATION_DOCUMENT_DELETE_ROLES.has(role),
  )

  if (approverOrAdmin) {
    return status.length > 0 && status !== APPLICATION_STATUS_EXPIRED
  }

  const industryUser = detail.industryUser || normalizedRoles.some(isIndustryApplicationRole)
  return industryUser && [APPLICATION_STATUS_PERMITTED, APPLICATION_STATUS_EXPIRED].includes(status)
}

const reviewEmailCandidate = (
  applicantTypeCode: string,
  ownerClientData: ApplicationClientData | null,
  agentClientData: ApplicationClientData | null,
): string => {
  const ownerEmail = normalizeEmail(ownerClientData?.email ?? '')
  const agentEmail = normalizeEmail(agentClientData?.email ?? '')

  if (isAgentApplicant(applicantTypeCode)) {
    return agentEmail || ownerEmail
  }

  return ownerEmail || agentEmail
}

const ProvincialApplicationDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform, capabilities } = useAuth()
  const { applicationNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialApplicationDetail | null>(null)
  const [documentRows, setDocumentRows] = useState<ProvincialApplicationDocumentRow[]>([])
  const [permitRows, setPermitRows] = useState<ApplicationPermitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [actionWarningMessage, setActionWarningMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [remarkBody, setRemarkBody] = useState('')
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null)
  const [isSavingRemark, setIsSavingRemark] = useState(false)
  const [remarkValidationMessage, setRemarkValidationMessage] = useState('')
  const [summaryForm, setSummaryForm] = useState<ApplicationSummaryFormState | null>(null)
  const [summaryBaselineForm, setSummaryBaselineForm] =
    useState<ApplicationSummaryFormState | null>(null)
  const [summaryVolumeWarningAccepted, setSummaryVolumeWarningAccepted] = useState(false)
  const [isSavingSummary, setIsSavingSummary] = useState(false)
  const [showSummaryValidationErrors, setShowSummaryValidationErrors] = useState(false)
  const [ownerClientLocations, setOwnerClientLocations] = useState<ApplicationClientLocation[]>([])
  const [agentClientLocations, setAgentClientLocations] = useState<ApplicationClientLocation[]>([])
  const [ownerClientContacts, setOwnerClientContacts] = useState<ApplicationClientContact[]>([])
  const [agentClientContacts, setAgentClientContacts] = useState<ApplicationClientContact[]>([])
  const [ownerClientData, setOwnerClientData] = useState<ApplicationClientData | null>(null)
  const [agentClientData, setAgentClientData] = useState<ApplicationClientData | null>(null)
  const [isLoadingOwnerClientLocations, setIsLoadingOwnerClientLocations] = useState(false)
  const [isLoadingAgentClientLocations, setIsLoadingAgentClientLocations] = useState(false)
  const [isLoadingOwnerClientContacts, setIsLoadingOwnerClientContacts] = useState(false)
  const [isLoadingAgentClientContacts, setIsLoadingAgentClientContacts] = useState(false)
  const [isLoadingOwnerClientData, setIsLoadingOwnerClientData] = useState(false)
  const [isLoadingAgentClientData, setIsLoadingAgentClientData] = useState(false)
  const [summaryExemptionReasonOptions, setSummaryExemptionReasonOptions] = useState<
    SearchOption[]
  >([])
  const [summaryApplicationStatusOptions, setSummaryApplicationStatusOptions] = useState<
    SearchOption[]
  >([])
  const [summaryProductTypeOptions, setSummaryProductTypeOptions] = useState<SearchOption[]>([])
  const [summaryGrowthTypeOptions, setSummaryGrowthTypeOptions] = useState<SearchOption[]>([])
  const [summaryRegionOptions, setSummaryRegionOptions] = useState<SearchOption[]>([])
  const [summaryScheduleOptions, setSummaryScheduleOptions] = useState<SearchOption[]>([])
  const [applicationSpeciesOptions, setApplicationSpeciesOptions] = useState<
    ApplicationCodeOption[]
  >([])
  const [applicationEndUseOptions, setApplicationEndUseOptions] = useState<ApplicationCodeOption[]>(
    [],
  )
  const [applicationSpeciesCandidate, setApplicationSpeciesCandidate] = useState('')
  const [isLoadingSummaryOptions, setIsLoadingSummaryOptions] = useState(false)
  const [reviewStatusOptions, setReviewStatusOptions] = useState<SearchOption[]>([])
  const [reviewStatusCode, setReviewStatusCode] = useState('')
  const [reviewStatusRemark, setReviewStatusRemark] = useState('')
  const [reviewStatusEmailAddress, setReviewStatusEmailAddress] = useState('')
  const [reviewValidationMessage, setReviewValidationMessage] = useState('')
  const [isSubmittingReviewAction, setIsSubmittingReviewAction] = useState(false)
  const [focusedPackageNumber, setFocusedPackageNumber] = useState('')
  const [focusedPackageRequestId, setFocusedPackageRequestId] = useState(0)
  const beginDetailRequest = useLatestRequestGuard()
  const packageFilter = searchParams.get('packageFilter') ?? ''
  const offerFilter = searchParams.get('offerFilter') ?? ''
  const remarkFilter = searchParams.get('remarkFilter') ?? ''
  const documentsFilter = searchParams.get('documentsFilter') ?? ''
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
    [searchParams],
  )
  const updateFilterParam = useCallback(
    (key: 'packageFilter' | 'offerFilter' | 'remarkFilter' | 'documentsFilter', value: string) => {
      const nextSearchParams = new URLSearchParams(searchParams)
      if (value.trim().length > 0) {
        nextSearchParams.set(key, value)
      } else {
        nextSearchParams.delete(key)
      }

      if (nextSearchParams.toString() !== searchParams.toString()) {
        setSearchParams(nextSearchParams, { replace: true })
      }
    },
    [searchParams, setSearchParams],
  )
  const focusPackageInItems = useCallback((packageNumber: string) => {
    setFocusedPackageNumber(packageNumber)
    setFocusedPackageRequestId((current) => current + 1)
  }, [])

  const loadApplicationDetail = useCallback(async () => {
    const isLatestRequest = beginDetailRequest()
    if (!applicationNumber) {
      setErrorMessage('Application number is missing from the route.')
      setDetail(null)
      setDocumentRows([])
      setPermitRows([])
      setDocumentsErrorMessage('')
      setActionErrorMessage('')
      setActionInfoMessage('')
      setLoading(false)
      setSummaryForm(null)
      setSummaryBaselineForm(null)
      setShowSummaryValidationErrors(false)
      return
    }

    setLoading(true)
    setErrorMessage('')
    setDocumentsErrorMessage('')
    setActionErrorMessage('')
    setActionInfoMessage('')

    try {
      const response = await fetchProvincialApplicationDetail(applicationNumber)
      if (!isLatestRequest()) {
        return
      }
      let editableSummaryForm = response ? toSummaryFormState(response) : null
      setDetail(response)
      setSummaryForm(editableSummaryForm)
      setSummaryBaselineForm(editableSummaryForm)
      setShowSummaryValidationErrors(false)
      setReviewStatusCode(response?.applicationStatusCode ?? '')
      setReviewStatusRemark('')
      setReviewStatusEmailAddress('')
      setReviewValidationMessage('')
      setRemarkBody('')
      setEditingRemarkId(null)
      if (!response) {
        setErrorMessage(`No provincial application found for ${applicationNumber}.`)
        setDocumentRows([])
        return
      }

      try {
        const permitsResult = await fetchApplicationPermits(applicationNumber)
        if (isLatestRequest()) {
          setPermitRows(permitsResult)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setPermitRows([])
          setActionErrorMessage('Unable to retrieve application permits.')
        }
      }

      if (
        canPerform('createApplication') &&
        !response.readOnly &&
        !response.locked &&
        !response.exemptionApprover
      ) {
        try {
          const summarySnapshot = await fetchApplicationSummarySnapshot(applicationNumber)
          if (isLatestRequest() && summarySnapshot) {
            editableSummaryForm = toSummarySnapshotFormState(summarySnapshot)
            setSummaryForm(editableSummaryForm)
            setSummaryBaselineForm(editableSummaryForm)
          }
        } catch (error) {
          if (isLatestRequest()) {
            console.error(error)
            setActionErrorMessage('Unable to retrieve editable application summary fields.')
          }
        }
      }

      try {
        const applicationSpeciesRows = await fetchApplicationSpecies(applicationNumber)
        if (isLatestRequest() && editableSummaryForm) {
          const summaryFormWithSpecies = withApplicationSpecies(
            editableSummaryForm,
            applicationSpeciesRows,
          )
          setSummaryForm(summaryFormWithSpecies)
          setSummaryBaselineForm(summaryFormWithSpecies)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setActionErrorMessage('Unable to retrieve application species fields.')
        }
      }

      try {
        const documentsResult = await fetchApplicationDocuments(applicationNumber)
        if (isLatestRequest()) {
          setDocumentRows(documentsResult.rows)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setDocumentRows([])
          setDocumentsErrorMessage('Unable to retrieve application documents.')
        }
      }
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setErrorMessage('Unable to retrieve provincial application detail.')
        setDetail(null)
        setSummaryForm(null)
        setSummaryBaselineForm(null)
        setShowSummaryValidationErrors(false)
        setDocumentRows([])
        setPermitRows([])
        setDocumentsErrorMessage('')
      }
    } finally {
      if (isLatestRequest()) {
        setLoading(false)
      }
    }
  }, [applicationNumber, beginDetailRequest, canPerform])

  useEffect(() => {
    void loadApplicationDetail()
  }, [loadApplicationDetail])

  const filteredPackages = useMemo(() => {
    const rows = detail?.packages ?? []
    if (!packageFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(packageFilter)
    return rows.filter((item) =>
      normalizeText(
        `${item.packageNumber} ${item.volume.toLocaleString()} ${item.pieceCount.toLocaleString()}`,
      ).includes(normalizedFilter),
    )
  }, [detail?.packages, packageFilter])

  const filteredOffers = useMemo(() => {
    const rows = detail?.offers ?? []
    if (!offerFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(offerFilter)
    return rows.filter((item) =>
      normalizeText(
        `${item.offerNumber} ${item.companyName ?? ''} ${item.receivedDate ?? ''} ${
          item.validOffer ? 'valid' : 'invalid'
        } ${item.withdrawalDate ?? ''}`,
      ).includes(normalizedFilter),
    )
  }, [detail?.offers, offerFilter])

  const filteredRemarks = useMemo(() => {
    const rows = detail?.remarks ?? []
    if (!remarkFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(remarkFilter)
    return rows.filter((item) =>
      normalizeText(`${item.date ?? ''} ${item.user ?? ''} ${item.title} ${item.remark}`).includes(
        normalizedFilter,
      ),
    )
  }, [detail?.remarks, remarkFilter])

  const filteredDocumentRows = useMemo(() => {
    return documentRows.filter((row) =>
      matchesFilter([row.name, row.description, row.type, row.id], documentsFilter),
    )
  }, [documentRows, documentsFilter])

  const canUploadApplicationDocuments = canPerform('/fileApplicationUpload')
  const canDeleteDocuments = canDeleteApplicationDocuments(detail, capabilities?.roles ?? [])
  const canManageItems =
    canPerform('createApplication') &&
    !detail?.readOnly &&
    !detail?.locked &&
    !detail?.exemptionApprover
  const canManageRemarks = canPerform('/applicationRemarks') && !detail?.readOnly && !detail?.locked
  const canEditSummary = canManageItems
  const canReviewApplication = canPerform('/applicationsReview')
  const normalizedReviewStatusCode = useMemo(
    () => normalizeReviewStatus(reviewStatusCode),
    [reviewStatusCode],
  )
  const canSendReviewStatusEmail = EMAIL_SUPPORTED_STATUS_CODES.has(normalizedReviewStatusCode)
  const hasSummaryForm = summaryForm !== null
  const summaryOwnerClientNumber = summaryForm?.ownerClientNumber.trim() ?? ''
  const summaryAgentClientNumber = summaryForm?.agentClientNumber.trim() ?? ''
  const summaryOwnerClientLocationCode = summaryForm?.ownerClientLocationCode.trim() ?? ''
  const summaryAgentClientLocationCode = summaryForm?.agentClientLocationCode.trim() ?? ''
  const hasSelectableOwnerClientLocations = ownerClientLocations.some(isSelectableClientLocation)
  const hasSelectableAgentClientLocations = agentClientLocations.some(isSelectableClientLocation)
  const hasSelectableOwnerClientContacts = ownerClientContacts.some(isSelectableClientContact)
  const hasSelectableAgentClientContacts = agentClientContacts.some(isSelectableClientContact)
  const ownerClientLocationPlaceholder = !summaryOwnerClientNumber
    ? 'Enter owner client number first'
    : isLoadingOwnerClientLocations
      ? 'Loading locations'
      : hasSelectableOwnerClientLocations
        ? 'Select owner client location'
        : 'No locations on file'
  const agentClientLocationPlaceholder = !summaryAgentClientNumber
    ? 'Enter agent client number first'
    : isLoadingAgentClientLocations
      ? 'Loading locations'
      : hasSelectableAgentClientLocations
        ? 'Select agent client location'
        : 'No locations on file'
  const ownerContactPlaceholder = !summaryOwnerClientLocationCode
    ? 'Select owner location first'
    : isLoadingOwnerClientContacts
      ? 'Loading contacts'
      : hasSelectableOwnerClientContacts
        ? 'Select owner contact'
        : 'No contacts on file'
  const agentContactPlaceholder = !summaryAgentClientLocationCode
    ? 'Select agent location first'
    : isLoadingAgentClientContacts
      ? 'Loading contacts'
      : hasSelectableAgentClientContacts
        ? 'Select agent contact'
        : 'No contacts on file'
  const exemptionReasonOptions = optionsWithCurrentValue(
    summaryExemptionReasonOptions,
    summaryForm?.exemptionReasonCode ?? '',
  )
  const applicationStatusOptions = optionsWithCurrentValue(
    summaryApplicationStatusOptions,
    summaryForm?.applicationStatusCode ?? '',
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
  )
  const summarySpeciesCodes = useMemo(
    () => summaryForm?.speciesCodes ?? [],
    [summaryForm?.speciesCodes],
  )
  const summarySpeciesKey = summarySpeciesCodes.join(',')
  const calculatedSummaryTermDays = useMemo(() => {
    if (!summaryForm) {
      return ''
    }

    return calculateApplicationTermDays(
      summaryForm.termDays,
      summaryForm.termMonths,
      summaryForm.termYears,
    )
  }, [summaryForm])
  const summaryFieldErrors = useMemo<FieldErrors<ApplicationSummaryField>>(() => {
    if (!summaryForm) {
      return {}
    }

    return {
      ownerClientNumber:
        requiredFieldError(summaryForm.ownerClientNumber, 'Owner client number') ?? undefined,
      ownerClientLocationCode: firstValidationError(
        () => requiredFieldError(summaryForm.ownerClientLocationCode, 'Owner client location code'),
        () =>
          maxLengthFieldError(summaryForm.ownerClientLocationCode, 2, 'Owner client location code'),
      ),
      ownerContactName:
        requiredFieldError(summaryForm.ownerContactName, 'Owner contact name') ?? undefined,
      agentClientNumber: isAgentApplicant(summaryForm.applicantTypeCode)
        ? (requiredFieldError(summaryForm.agentClientNumber, 'Agent client number') ?? undefined)
        : undefined,
      agentClientLocationCode: isAgentApplicant(summaryForm.applicantTypeCode)
        ? firstValidationError(
            () =>
              requiredFieldError(summaryForm.agentClientLocationCode, 'Agent client location code'),
            () =>
              maxLengthFieldError(
                summaryForm.agentClientLocationCode,
                2,
                'Agent client location code',
              ),
          )
        : undefined,
      agentContactName: isAgentApplicant(summaryForm.applicantTypeCode)
        ? (requiredFieldError(summaryForm.agentContactName, 'Agent contact name') ?? undefined)
        : undefined,
      applicantTypeCode: firstValidationError(
        () => requiredFieldError(summaryForm.applicantTypeCode, 'Applicant type'),
        () =>
          summaryForm.applicantTypeCode === 'O' || summaryForm.applicantTypeCode === 'A'
            ? null
            : 'Applicant type must be Owner or Agent.',
      ),
      productTypeCode: requiredFieldError(summaryForm.productTypeCode, 'Product type') ?? undefined,
      growthTypeCode: productTypeRequiresGrowthType(summaryForm.productTypeCode)
        ? (requiredFieldError(summaryForm.growthTypeCode, 'Growth type') ?? undefined)
        : undefined,
      exemptionReasonCode: firstValidationError(
        () => requiredFieldError(summaryForm.exemptionReasonCode, 'Exemption reason'),
        () => maxLengthFieldError(summaryForm.exemptionReasonCode, 1, 'Exemption reason code'),
      ),
      orgUnitNumber: requiredFieldError(summaryForm.orgUnitNumber, 'Region') ?? undefined,
      applicationDate: firstValidationError(
        () => requiredFieldError(summaryForm.applicationDate, 'Application date'),
        () => isoDateFieldError(summaryForm.applicationDate),
      ),
      termDays: firstValidationError(
        () => requiredFieldError(calculatedSummaryTermDays, 'Application term'),
        () =>
          /^\d*$/.test(summaryForm.termDays.trim())
            ? null
            : 'Application term days must be zero or a positive whole number.',
      ),
      termMonths: /^\d*$/.test(summaryForm.termMonths.trim())
        ? undefined
        : 'Application term months must be zero or a positive whole number.',
      termYears: /^\d*$/.test(summaryForm.termYears.trim())
        ? undefined
        : 'Application term years must be zero or a positive whole number.',
      receivedDate: firstValidationError(
        () => requiredFieldError(summaryForm.receivedDate, 'Received date'),
        () => isoDateFieldError(summaryForm.receivedDate),
      ),
      productLocation:
        requiredFieldError(summaryForm.productLocation, 'Location of logs') ?? undefined,
      applicationVolume: firstValidationError(
        () => requiredFieldError(summaryForm.applicationVolume, 'Application volume'),
        () => positiveNumericFieldError(summaryForm.applicationVolume),
        () =>
          maxNumericValueFieldError(summaryForm.applicationVolume, 9999999.9, 'Application volume'),
        () => atMostOneDecimalFieldError(summaryForm.applicationVolume, 'Application volume'),
      ),
      averageLogVolume: firstValidationError(
        () => requiredFieldError(summaryForm.averageLogVolume, 'Average log volume'),
        () => positiveNumericFieldError(summaryForm.averageLogVolume),
        () => maxNumericValueFieldError(summaryForm.averageLogVolume, 99.9, 'Average log volume'),
        () => atMostOneDecimalFieldError(summaryForm.averageLogVolume, 'Average log volume'),
      ),
      applicationStatusCode:
        requiredFieldError(summaryForm.applicationStatusCode, 'Application status') ?? undefined,
      jurisdictionCode: firstValidationError(
        () => requiredFieldError(summaryForm.jurisdictionCode, 'Jurisdiction'),
        () =>
          summaryForm.jurisdictionCode === 'P' || summaryForm.jurisdictionCode === 'F'
            ? null
            : 'Jurisdiction must be Provincial or Federal.',
      ),
      oicIndicator: firstValidationError(
        () => requiredFieldError(summaryForm.oicIndicator, 'OIC indicator'),
        () =>
          summaryForm.oicIndicator === 'Y' || summaryForm.oicIndicator === 'N'
            ? null
            : 'OIC indicator must be Yes or No.',
      ),
    }
  }, [calculatedSummaryTermDays, summaryForm])
  const hasSummaryValidationError = Object.values(summaryFieldErrors).some((error) => !!error)
  const visibleSummaryFieldError = (field: ApplicationSummaryField): string | undefined =>
    showSummaryValidationErrors ? summaryFieldErrors[field] : undefined
  const availableApplicationSpeciesOptions = useMemo(
    () => applicationSpeciesOptions.filter((option) => !summarySpeciesCodes.includes(option.code)),
    [applicationSpeciesOptions, summarySpeciesCodes],
  )
  const applicationSpeciesSelectOptions = availableApplicationSpeciesOptions.map(toSearchOption)
  const applicationEndUseSelectOptions = applicationEndUseOptions.map(toSearchOption)
  const speciesPlaceholder =
    applicationSpeciesSelectOptions.length > 0 ? 'Select species' : 'No remaining species'
  const endUsePlaceholder =
    summarySpeciesCodes.length === 0
      ? 'Add species first'
      : applicationEndUseSelectOptions.length > 0
        ? 'Select end use'
        : 'No end uses on file'

  useEffect(() => {
    if (!hasSummaryForm || !summaryOwnerClientNumber || !summaryOwnerClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientData(null)
        setIsLoadingOwnerClientData(false)
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

    void fetchApplicationClientData(summaryOwnerClientNumber, summaryOwnerClientLocationCode)
      .then((clientData) => {
        if (isActive) {
          setOwnerClientData(clientData)
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
  }, [hasSummaryForm, summaryOwnerClientLocationCode, summaryOwnerClientNumber])

  useEffect(() => {
    if (!hasSummaryForm || !summaryAgentClientNumber || !summaryAgentClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientData(null)
        setIsLoadingAgentClientData(false)
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

    void fetchApplicationClientData(summaryAgentClientNumber, summaryAgentClientLocationCode)
      .then((clientData) => {
        if (isActive) {
          setAgentClientData(clientData)
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
  }, [hasSummaryForm, summaryAgentClientLocationCode, summaryAgentClientNumber])

  useEffect(() => {
    if (!summaryForm || reviewStatusEmailAddress.trim()) {
      return
    }

    let isActive = true
    const candidateEmail = reviewEmailCandidate(
      summaryForm.applicantTypeCode,
      ownerClientData,
      agentClientData,
    )
    void Promise.resolve().then(() => {
      if (isActive && candidateEmail) {
        setReviewStatusEmailAddress(candidateEmail)
      }
    })

    return () => {
      isActive = false
    }
  }, [agentClientData, ownerClientData, reviewStatusEmailAddress, summaryForm])

  useEffect(() => {
    if (!canEditSummary || !hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientLocations([])
        setIsLoadingOwnerClientLocations(false)
      })
      return () => {
        isActive = false
      }
    }

    if (!summaryOwnerClientNumber) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientLocations([])
        setIsLoadingOwnerClientLocations(false)
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

    void fetchApplicationClientLocations(summaryOwnerClientNumber, 'owner')
      .then((locations) => {
        if (!isActive) {
          return
        }

        setOwnerClientLocations(locations)
        setSummaryForm((current) => {
          if (!current || current.ownerClientNumber.trim() !== summaryOwnerClientNumber) {
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
      .finally(() => {
        if (isActive) {
          setIsLoadingOwnerClientLocations(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [canEditSummary, hasSummaryForm, summaryOwnerClientNumber])

  useEffect(() => {
    if (!canEditSummary || !hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientLocations([])
        setIsLoadingAgentClientLocations(false)
      })
      return () => {
        isActive = false
      }
    }

    if (!summaryAgentClientNumber) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientLocations([])
        setIsLoadingAgentClientLocations(false)
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

    void fetchApplicationClientLocations(summaryAgentClientNumber, 'agent')
      .then((locations) => {
        if (!isActive) {
          return
        }

        setAgentClientLocations(locations)
        setSummaryForm((current) => {
          if (!current || current.agentClientNumber.trim() !== summaryAgentClientNumber) {
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
      .finally(() => {
        if (isActive) {
          setIsLoadingAgentClientLocations(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [canEditSummary, hasSummaryForm, summaryAgentClientNumber])

  useEffect(() => {
    if (!canEditSummary || !hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientContacts([])
        setIsLoadingOwnerClientContacts(false)
      })
      return () => {
        isActive = false
      }
    }

    if (!summaryOwnerClientNumber || !summaryOwnerClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setOwnerClientContacts([])
        setIsLoadingOwnerClientContacts(false)
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingOwnerClientContacts(true)
      }
    })

    void fetchApplicationClientContacts(
      summaryOwnerClientNumber,
      summaryOwnerClientLocationCode,
      'owner',
      applicationNumber ?? '',
    )
      .then((contacts) => {
        if (!isActive) {
          return
        }

        setOwnerClientContacts(contacts)
        setSummaryForm((current) => {
          if (
            !current ||
            current.ownerClientNumber.trim() !== summaryOwnerClientNumber ||
            current.ownerClientLocationCode.trim() !== summaryOwnerClientLocationCode
          ) {
            return current
          }

          const nextOwnerContactName = resolveClientContactName(contacts, current.ownerContactName)
          return current.ownerContactName === nextOwnerContactName
            ? current
            : { ...current, ownerContactName: nextOwnerContactName }
        })
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingOwnerClientContacts(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [
    applicationNumber,
    canEditSummary,
    hasSummaryForm,
    summaryOwnerClientLocationCode,
    summaryOwnerClientNumber,
  ])

  useEffect(() => {
    if (!canEditSummary || !hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientContacts([])
        setIsLoadingAgentClientContacts(false)
      })
      return () => {
        isActive = false
      }
    }

    if (!summaryAgentClientNumber || !summaryAgentClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setAgentClientContacts([])
        setIsLoadingAgentClientContacts(false)
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingAgentClientContacts(true)
      }
    })

    void fetchApplicationClientContacts(
      summaryAgentClientNumber,
      summaryAgentClientLocationCode,
      'agent',
      applicationNumber ?? '',
    )
      .then((contacts) => {
        if (!isActive) {
          return
        }

        setAgentClientContacts(contacts)
        setSummaryForm((current) => {
          if (
            !current ||
            current.agentClientNumber.trim() !== summaryAgentClientNumber ||
            current.agentClientLocationCode.trim() !== summaryAgentClientLocationCode
          ) {
            return current
          }

          const nextAgentContactName = resolveClientContactName(contacts, current.agentContactName)
          return current.agentContactName === nextAgentContactName
            ? current
            : { ...current, agentContactName: nextAgentContactName }
        })
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingAgentClientContacts(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [
    applicationNumber,
    canEditSummary,
    hasSummaryForm,
    summaryAgentClientLocationCode,
    summaryAgentClientNumber,
  ])

  useEffect(() => {
    if (!canEditSummary || !hasSummaryForm) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setIsLoadingSummaryOptions(false)
      })
      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingSummaryOptions(true)
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
        setSummaryRegionOptions(options.regions)
        setSummaryScheduleOptions(options.currentSchedules)
      })
      .catch((error) => {
        if (!isActive) {
          return
        }

        console.warn('Unable to load application summary options.', error)
        setSummaryExemptionReasonOptions([])
        setSummaryApplicationStatusOptions([])
        setSummaryProductTypeOptions([])
        setSummaryGrowthTypeOptions([])
        setSummaryRegionOptions([])
        setSummaryScheduleOptions([])
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingSummaryOptions(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [canEditSummary, hasSummaryForm])

  useEffect(() => {
    if (!canEditSummary || !summaryForm?.orgUnitNumber || !summaryForm.productTypeCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }
        setApplicationSpeciesOptions([])
        setApplicationSpeciesCandidate('')
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
        setApplicationSpeciesOptions(options)
        setApplicationSpeciesCandidate((current) =>
          current && options.some((option) => option.code === current)
            ? current
            : (options[0]?.code ?? ''),
        )
      })
      .catch((error) => {
        if (!isActive) {
          return
        }
        console.warn('Unable to load remaining application species.', error)
        setApplicationSpeciesOptions([])
        setApplicationSpeciesCandidate('')
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
    if (!canEditSummary || !summaryForm?.orgUnitNumber || summarySpeciesCodes.length === 0) {
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
      .catch((error) => {
        if (!isActive) {
          return
        }
        console.warn('Unable to load application end-use options.', error)
        setApplicationEndUseOptions([])
      })

    return () => {
      isActive = false
    }
  }, [canEditSummary, summaryForm?.orgUnitNumber, summarySpeciesCodes, summarySpeciesKey])

  useEffect(() => {
    if (!canReviewApplication) {
      return
    }

    const loadReviewOptions = async () => {
      try {
        const options = await fetchApplicationReviewOptions()
        setReviewStatusOptions(options.reviewStatuses)
      } catch (error) {
        console.warn('Unable to load application review status options.', error)
        setReviewStatusOptions([])
      }
    }

    void loadReviewOptions()
  }, [canReviewApplication])

  const onCreateOffer = useCallback(() => {
    if (!detail) {
      return
    }

    const params = new URLSearchParams()
    params.set('applicationNumber', String(detail.applicationNumber))
    if (detail.packages.length === 1 && detail.packages[0]?.packageNumber) {
      params.set('packageNumber', detail.packages[0].packageNumber)
    }
    if (detail.ownerClientNumber) {
      params.set('offeringClientNumber', detail.ownerClientNumber)
    }
    if (detail.orgUnitNumber !== null) {
      params.set('region', String(detail.orgUnitNumber))
    }

    const query = params.toString()
    navigate(query.length > 0 ? `/provincial/offers/create?${query}` : '/provincial/offers/create')
  }, [detail, navigate])

  const refreshApplicationDocuments = useCallback(async () => {
    if (!applicationNumber) {
      return
    }

    const documentsResult = await fetchApplicationDocuments(applicationNumber)
    setDocumentRows(documentsResult.rows)
    setDocumentsErrorMessage('')
  }, [applicationNumber])

  const onOpenApplicationUpload = useCallback(() => {
    if (!detail) {
      return
    }
    setActionErrorMessage('')
    setActionInfoMessage('')
    document.getElementById('applicationDocumentUpload')?.scrollIntoView({ block: 'start' })
  }, [detail])

  const onOpenDocument = useCallback(async (row: ProvincialApplicationDocumentRow) => {
    setActionErrorMessage('')
    setActionInfoMessage('')

    try {
      const result = await openApplicationDocument(row.id, row.name)
      triggerBrowserDownload(result.blob, result.filename || row.name)
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to open the selected document.')
    }
  }, [])

  const onRemoveDocument = useCallback(
    async (row: ProvincialApplicationDocumentRow) => {
      if (!applicationNumber) {
        return
      }

      const isLatestRequest = beginDetailRequest()
      setIsRemovingDocumentId(row.id)
      setActionErrorMessage('')
      setActionInfoMessage('')

      try {
        const removeResult = await removeApplicationDocument(row.id, applicationNumber)
        if (!isLatestRequest()) {
          return
        }
        if (!removeResult.success) {
          setActionErrorMessage('Document removal failed. Refresh and try again.')
          return
        }

        const documentsResult = await fetchApplicationDocuments(applicationNumber)
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
    [applicationNumber, beginDetailRequest],
  )

  const onSaveRemark = useCallback(async () => {
    if (!applicationNumber || !detail) {
      return
    }

    const normalizedRemark = remarkBody.trim()
    if (!normalizedRemark) {
      setRemarkValidationMessage('Remark is required.')
      return
    }

    setRemarkValidationMessage('')
    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingRemark(true)
    try {
      const result = await saveApplicationRemark({
        applicationNumber: String(detail.applicationNumber),
        remarkBody: normalizedRemark,
        remarkId: editingRemarkId ?? undefined,
      })
      if (!result.success) {
        setActionErrorMessage('Unable to save application remark.')
        return
      }

      await loadApplicationDetail()
      setRemarkBody('')
      setEditingRemarkId(null)
      setActionInfoMessage(
        editingRemarkId ? 'Application remark updated.' : 'Application remark saved.',
      )
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to save application remark.')
    } finally {
      setIsSavingRemark(false)
    }
  }, [applicationNumber, detail, editingRemarkId, loadApplicationDetail, remarkBody])

  const onSummaryFormChange = useCallback(
    (key: keyof ApplicationSummaryFormState, value: string) => {
      setSummaryForm((current) => (current ? { ...current, [key]: value } : current))
      setSummaryVolumeWarningAccepted(false)
      setActionWarningMessage('')
    },
    [],
  )

  const onAddApplicationSpecies = useCallback(() => {
    const nextSpecies = applicationSpeciesCandidate.trim()
    if (!nextSpecies) {
      return
    }

    setSummaryForm((current) => {
      if (!current || current.speciesCodes.includes(nextSpecies)) {
        return current
      }
      return { ...current, speciesCodes: [...current.speciesCodes, nextSpecies] }
    })
    setSummaryVolumeWarningAccepted(false)
    setActionWarningMessage('')
  }, [applicationSpeciesCandidate])

  const onRemoveApplicationSpecies = useCallback((speciesCode: string) => {
    setSummaryForm((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        speciesCodes: current.speciesCodes.filter((code) => code !== speciesCode),
      }
    })
    setSummaryVolumeWarningAccepted(false)
    setActionWarningMessage('')
  }, [])

  const onSaveSummary = useCallback(async () => {
    if (!applicationNumber || !detail || !summaryForm) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    setActionWarningMessage('')
    if (hasSummaryValidationError) {
      setShowSummaryValidationErrors(true)
      setActionErrorMessage(
        Object.values(summaryFieldErrors).find((error): error is string => !!error) ??
          'Please fix validation errors before saving the application summary.',
      )
      return
    }

    setIsSavingSummary(true)
    try {
      if (!summaryVolumeWarningAccepted) {
        const volumeUsage = await checkApplicationVolumeUsage(String(detail.applicationNumber))
        if (!volumeUsage.volumeUsed) {
          setSummaryVolumeWarningAccepted(true)
          setActionWarningMessage(
            'The sum of package volumes is less than the total application volume. Review package volumes or save again to continue.',
          )
          return
        }
      }

      const result = await updateApplicationSummary({
        applicationNumber: String(detail.applicationNumber),
        applicationDate: summaryForm.applicationDate,
        receivedDate: summaryForm.receivedDate,
        termDays: calculatedSummaryTermDays,
        applicationVolume: summaryForm.applicationVolume,
        averageLogVolume: summaryForm.averageLogVolume,
        exemptionReasonCode: summaryForm.exemptionReasonCode,
        productLocation: summaryForm.productLocation,
        exportScheduleId: summaryForm.exportScheduleId,
        agentClientNumber: summaryForm.agentClientNumber,
        agentClientLocationCode: summaryForm.agentClientLocationCode,
        ownerClientNumber: summaryForm.ownerClientNumber,
        ownerClientLocationCode: summaryForm.ownerClientLocationCode,
        applicationStatusCode: summaryForm.applicationStatusCode,
        applicantTypeCode: summaryForm.applicantTypeCode,
        orgUnitNumber: summaryForm.orgUnitNumber,
        productTypeCode: summaryForm.productTypeCode,
        jurisdictionCode: summaryForm.jurisdictionCode,
        growthTypeCode: summaryForm.growthTypeCode,
        agentContactName: summaryForm.agentContactName,
        ownerContactName: summaryForm.ownerContactName,
        oicIndicator: summaryForm.oicIndicator,
        endUseCode: summaryForm.endUseCode,
        speciesCodes: summaryForm.speciesCodes,
      })
      if (!result.valid) {
        setActionErrorMessage(
          result.errors.length > 0
            ? result.errors.join(' ')
            : result.message || 'Unable to save application summary.',
        )
        return
      }

      await loadApplicationDetail()
      setShowSummaryValidationErrors(false)
      setSummaryVolumeWarningAccepted(false)
      setActionInfoMessage(result.message || 'Application summary saved.')
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to save application summary.')
    } finally {
      setIsSavingSummary(false)
    }
  }, [
    applicationNumber,
    calculatedSummaryTermDays,
    detail,
    hasSummaryValidationError,
    loadApplicationDetail,
    summaryFieldErrors,
    summaryForm,
    summaryVolumeWarningAccepted,
  ])

  const buildReviewStatusPayload = useCallback(
    (requireEmail: boolean) => {
      const statusCode = normalizedReviewStatusCode
      const clientEmailAddress = normalizeEmail(reviewStatusEmailAddress)
      const remark = reviewStatusRemark.trim()
      if (!statusCode) {
        return {
          valid: false,
          message: 'Choose an application status before updating review status.',
          payload: null,
        }
      }

      if (REVIEW_STATUSES_REQUIRING_REMARK.has(statusCode) && !remark) {
        return {
          valid: false,
          message: 'Review remark is required when rejecting or withdrawing an application.',
          payload: null,
        }
      }

      if (requireEmail) {
        if (!canSendReviewStatusEmail) {
          return {
            valid: false,
            message: 'Status email is only supported for rejected or withdrawn applications.',
            payload: null,
          }
        }

        if (!clientEmailAddress || !isValidEmail(clientEmailAddress)) {
          return {
            valid: false,
            message: 'Enter a valid client email address before sending status email.',
            payload: null,
          }
        }
      } else if (clientEmailAddress && !isValidEmail(clientEmailAddress)) {
        return {
          valid: false,
          message: 'Enter a valid client email address.',
          payload: null,
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
    ],
  )

  const onApproveApplication = useCallback(async () => {
    if (!detail || !canReviewApplication) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    setReviewValidationMessage('')
    setIsSubmittingReviewAction(true)
    try {
      const result = await approveApplicationReview(String(detail.applicationNumber))
      if (!result.valid || !result.updated) {
        setActionErrorMessage(result.message || 'Unable to approve application.')
        return
      }

      await loadApplicationDetail()
      setActionInfoMessage(result.message || 'Application approved.')
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to approve application.')
    } finally {
      setIsSubmittingReviewAction(false)
    }
  }, [canReviewApplication, detail, loadApplicationDetail])

  const onUpdateReviewStatus = useCallback(
    async (sendEmail: boolean) => {
      if (!detail || !canReviewApplication) {
        return
      }

      const payloadResult = buildReviewStatusPayload(sendEmail)
      if (!payloadResult.valid || !payloadResult.payload) {
        setReviewValidationMessage(payloadResult.message)
        return
      }

      setActionErrorMessage('')
      setActionInfoMessage('')
      setReviewValidationMessage('')
      setIsSubmittingReviewAction(true)
      try {
        const updateResult = await updateApplicationReviewStatus(
          String(detail.applicationNumber),
          payloadResult.payload,
        )
        if (!updateResult.valid || !updateResult.updated) {
          setActionErrorMessage(updateResult.message || 'Unable to update application status.')
          return
        }

        if (sendEmail) {
          const emailResult = await sendApplicationReviewStatusEmail(
            String(detail.applicationNumber),
            payloadResult.payload,
          )
          if (!emailResult.success) {
            setActionErrorMessage(
              emailResult.message || 'Application status updated; email failed.',
            )
            await loadApplicationDetail()
            return
          }
        }

        await loadApplicationDetail()
        setActionInfoMessage(
          sendEmail
            ? 'Application status updated and email sent.'
            : updateResult.message || 'Application status updated.',
        )
      } catch (error) {
        console.error(error)
        setActionErrorMessage('Unable to update application status.')
      } finally {
        setIsSubmittingReviewAction(false)
      }
    },
    [buildReviewStatusPayload, canReviewApplication, detail, loadApplicationDetail],
  )

  const clientSummaryContent =
    ownerClientData || agentClientData || isLoadingOwnerClientData || isLoadingAgentClientData ? (
      <div className="application-client-summary-grid">
        <ClientDataSummary
          title="Owner Client Details"
          clientData={ownerClientData}
          isLoading={isLoadingOwnerClientData}
        />
        {(summaryForm?.applicantTypeCode === 'A' ||
          agentClientData ||
          isLoadingAgentClientData) && (
          <ClientDataSummary
            title="Agent Client Details"
            clientData={agentClientData}
            isLoading={isLoadingAgentClientData}
          />
        )}
      </div>
    ) : null

  return (
    <Grid fullWidth className="default-grid provincial-application-detail">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <div className="application-detail-title-row">
          <div>
            <h1>Provincial Application Details</h1>
            <p>
              Application <code>{applicationNumber}</code>
            </p>
          </div>
          {detail && (
            <dl className="application-detail-header-metrics" aria-label="Application highlights">
              <div>
                <dt>Package Count</dt>
                <dd>{detail.packages.length.toLocaleString()}</dd>
              </div>
              <div>
                <dt>File Count</dt>
                <dd>{documentRows.length.toLocaleString()}</dd>
              </div>
            </dl>
          )}
        </div>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading provincial application detail..." />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <InlineNotification
            kind="error"
            title="Detail unavailable"
            subtitle={errorMessage}
            lowContrast
          />
        </Column>
      )}

      {!loading && detail && (
        <>
          {!!documentsErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                kind="warning"
                title="Documents unavailable"
                subtitle={documentsErrorMessage}
                lowContrast
              />
            </Column>
          )}
          {!!actionErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                kind="error"
                title="Action failed"
                subtitle={actionErrorMessage}
                lowContrast
              />
            </Column>
          )}
          {!!actionWarningMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                kind="warning"
                title="Review package volumes"
                subtitle={actionWarningMessage}
                lowContrast
              />
            </Column>
          )}
          {!!actionInfoMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                kind="info"
                title="Action completed"
                subtitle={actionInfoMessage}
                lowContrast
              />
            </Column>
          )}

          <Column sm={4} md={8} lg={16}>
            <nav
              className="application-detail-section-nav"
              aria-label="Application detail sections"
            >
              <a href="#application-summary">Summary Fields</a>
              {canReviewApplication && <a href="#application-review">Review Actions</a>}
              <a href="#application-packages">Package List</a>
              <a href="#application-items">Item Editor</a>
              <a href="#application-documents">Document Files</a>
              <a href="#application-offers">Offer Rows</a>
              <a href="#application-permits">Permit Rows</a>
              <a href="#application-remarks">Remark Log</a>
            </nav>
          </Column>

          <Column sm={4} md={8} lg={16}>
            <Tile className="application-detail-action-bar">
              <h2 className="detail-tile-title">Actions</h2>
              <div className="legacy-search-actions">
                <Button
                  kind="secondary"
                  size="sm"
                  renderIcon={ArrowLeft}
                  disabled={!canPerform('/applicationSearch')}
                  onClick={() => navigate(withCurrentSearch('/provincial/application'))}
                >
                  Back to Application Search Results
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  renderIcon={Launch}
                  disabled={
                    !detail.exemptionNumber ||
                    !canPerform('/exemptionSearch') ||
                    !canPerform('/exemptionDetails')
                  }
                  onClick={() => {
                    if (detail.exemptionNumber) {
                      navigate(
                        withCurrentSearch(
                          `/provincial/exemption/${encodeURIComponent(detail.exemptionNumber)}`,
                        ),
                      )
                    }
                  }}
                >
                  Open Exemption Detail
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  renderIcon={Search}
                  disabled={!canPerform('/offersSearch')}
                  onClick={() => navigate(withCurrentSearch('/provincial/offers'))}
                >
                  Open Offers Search
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  renderIcon={Upload}
                  disabled={!canUploadApplicationDocuments || !detail.applicationNumber}
                  onClick={onOpenApplicationUpload}
                >
                  Upload Application Document
                </Button>
                <Button
                  kind="primary"
                  size="sm"
                  renderIcon={Add}
                  disabled={
                    !canPerform('/offersSearch') ||
                    !canPerform('createOffer') ||
                    !detail.canCreateOffers ||
                    detail.industryUser ||
                    detail.packages.length === 0
                  }
                  onClick={onCreateOffer}
                >
                  Create Offer
                </Button>
              </div>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={16}>
            <Tile
              id="application-summary"
              className="application-detail-section application-detail-summary"
            >
              <h2 className="detail-tile-title">Application Summary</h2>
              <dl className="detail-field-grid">
                {[
                  ['Application Number', displayValue(detail.applicationNumber)],
                  ['Exemption Number', displayValue(detail.exemptionNumber)],
                  [
                    'Status',
                    displayValue(detail.statusDescription ?? detail.applicationStatusCode),
                  ],
                  ['Product Type', displayValue(detail.productTypeCode)],
                  ['Owner Client Number', displayValue(detail.ownerClientNumber)],
                  ['Agent Client Number', displayValue(detail.agentClientNumber)],
                  ['Org Unit', displayValue(detail.orgUnitName ?? detail.orgUnitNumber)],
                  ['Listing Date', displayValue(detail.listingDate)],
                ].map(([label, value]) => (
                  <div key={label} className="detail-field-item">
                    <dt className="detail-field-label">{label}</dt>
                    <dd className="detail-field-value">{value}</dd>
                  </div>
                ))}
              </dl>
              {canEditSummary && summaryForm ? (
                <>
                  <div className="legacy-search-grid">
                    <SearchableSelect
                      id="applicationSummaryExemptionReason"
                      labelText="Exemption Reason"
                      value={summaryForm.exemptionReasonCode}
                      invalid={Boolean(visibleSummaryFieldError('exemptionReasonCode'))}
                      invalidText={visibleSummaryFieldError('exemptionReasonCode')}
                      disabled={isLoadingSummaryOptions && exemptionReasonOptions.length === 0}
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
                      labelText="Application Date"
                      value={summaryForm.applicationDate}
                      invalid={Boolean(visibleSummaryFieldError('applicationDate'))}
                      invalidText={visibleSummaryFieldError('applicationDate')}
                      onChange={(value) => onSummaryFormChange('applicationDate', value)}
                    />
                    <IsoDatePicker
                      id="applicationSummaryReceivedDate"
                      labelText="Received Date"
                      value={summaryForm.receivedDate}
                      invalid={Boolean(visibleSummaryFieldError('receivedDate'))}
                      invalidText={visibleSummaryFieldError('receivedDate')}
                      onChange={(value) => onSummaryFormChange('receivedDate', value)}
                    />
                    <TextInput
                      id="applicationSummaryTermDays"
                      labelText="Term (days)"
                      type="number"
                      min={1}
                      value={summaryForm.termDays}
                      invalid={Boolean(visibleSummaryFieldError('termDays'))}
                      invalidText={visibleSummaryFieldError('termDays')}
                      onChange={(event) => onSummaryFormChange('termDays', event.target.value)}
                    />
                    <TextInput
                      id="applicationSummaryTermMonths"
                      labelText="Term (months)"
                      type="number"
                      min={0}
                      value={summaryForm.termMonths}
                      invalid={Boolean(visibleSummaryFieldError('termMonths'))}
                      invalidText={visibleSummaryFieldError('termMonths')}
                      onChange={(event) => onSummaryFormChange('termMonths', event.target.value)}
                    />
                    <TextInput
                      id="applicationSummaryTermYears"
                      labelText="Term (years)"
                      type="number"
                      min={0}
                      value={summaryForm.termYears}
                      invalid={Boolean(visibleSummaryFieldError('termYears'))}
                      invalidText={visibleSummaryFieldError('termYears')}
                      onChange={(event) => onSummaryFormChange('termYears', event.target.value)}
                    />
                    <TextInput
                      id="applicationSummaryVolume"
                      labelText="Application Volume (m³)"
                      type="number"
                      min={0}
                      step="0.1"
                      value={summaryForm.applicationVolume}
                      invalid={Boolean(visibleSummaryFieldError('applicationVolume'))}
                      invalidText={visibleSummaryFieldError('applicationVolume')}
                      onChange={(event) =>
                        onSummaryFormChange('applicationVolume', event.target.value)
                      }
                    />
                    <TextInput
                      id="applicationSummaryAverageLogVolume"
                      labelText="Average Log Volume"
                      type="number"
                      min={0}
                      step="0.1"
                      value={summaryForm.averageLogVolume}
                      invalid={Boolean(visibleSummaryFieldError('averageLogVolume'))}
                      invalidText={visibleSummaryFieldError('averageLogVolume')}
                      onChange={(event) =>
                        onSummaryFormChange('averageLogVolume', event.target.value)
                      }
                    />
                    <TextInput
                      id="applicationSummaryOwnerClientNumber"
                      labelText="Owner Client Number"
                      value={summaryForm.ownerClientNumber}
                      invalid={Boolean(visibleSummaryFieldError('ownerClientNumber'))}
                      invalidText={visibleSummaryFieldError('ownerClientNumber')}
                      onChange={(event) =>
                        onSummaryFormChange('ownerClientNumber', event.target.value)
                      }
                    />
                    <SearchableSelect
                      id="applicationSummaryOwnerClientLocationCode"
                      labelText="Owner Client Location"
                      value={summaryForm.ownerClientLocationCode}
                      invalid={Boolean(visibleSummaryFieldError('ownerClientLocationCode'))}
                      invalidText={visibleSummaryFieldError('ownerClientLocationCode')}
                      disabled={
                        !summaryForm.ownerClientNumber.trim() || isLoadingOwnerClientLocations
                      }
                      placeholder={ownerClientLocationPlaceholder}
                      options={ownerClientLocations
                        .filter(isSelectableClientLocation)
                        .map((location) => ({
                          value: location.locationCode,
                          label: location.locationName,
                        }))}
                      onChange={(value) => onSummaryFormChange('ownerClientLocationCode', value)}
                    />
                    {hasSelectableOwnerClientContacts || isLoadingOwnerClientContacts ? (
                      <SearchableSelect
                        id="applicationSummaryOwnerContactName"
                        labelText="Owner Contact Name"
                        value={summaryForm.ownerContactName}
                        invalid={Boolean(visibleSummaryFieldError('ownerContactName'))}
                        invalidText={visibleSummaryFieldError('ownerContactName')}
                        disabled={
                          !summaryForm.ownerClientLocationCode.trim() ||
                          isLoadingOwnerClientContacts
                        }
                        placeholder={ownerContactPlaceholder}
                        options={ownerClientContacts
                          .filter(isSelectableClientContact)
                          .map((contact) => ({
                            value: contact.contactName,
                            label: contact.contactName,
                          }))}
                        onChange={(value) => onSummaryFormChange('ownerContactName', value)}
                      />
                    ) : (
                      <TextInput
                        id="applicationSummaryOwnerContactName"
                        labelText="Owner Contact Name"
                        value={summaryForm.ownerContactName}
                        invalid={Boolean(visibleSummaryFieldError('ownerContactName'))}
                        invalidText={visibleSummaryFieldError('ownerContactName')}
                        disabled={!summaryForm.ownerClientLocationCode.trim()}
                        placeholder="Enter owner contact name"
                        onChange={(event) =>
                          onSummaryFormChange('ownerContactName', event.target.value)
                        }
                      />
                    )}
                    <SearchableSelect
                      id="applicationSummaryApplicantTypeCode"
                      labelText="Applicant Type"
                      value={summaryForm.applicantTypeCode}
                      placeholder="Select applicant type"
                      options={optionsWithCurrentValue(
                        APPLICANT_TYPE_OPTIONS,
                        summaryForm.applicantTypeCode,
                      ).map((option) => ({ value: option.value, label: optionLabel(option) }))}
                      invalid={Boolean(visibleSummaryFieldError('applicantTypeCode'))}
                      invalidText={visibleSummaryFieldError('applicantTypeCode')}
                      onChange={(value) =>
                        onSummaryFormChange('applicantTypeCode', value.toUpperCase())
                      }
                    />
                    <TextInput
                      id="applicationSummaryAgentClientNumber"
                      labelText="Agent Client Number"
                      value={summaryForm.agentClientNumber}
                      invalid={Boolean(visibleSummaryFieldError('agentClientNumber'))}
                      invalidText={visibleSummaryFieldError('agentClientNumber')}
                      onChange={(event) =>
                        onSummaryFormChange('agentClientNumber', event.target.value)
                      }
                    />
                    <SearchableSelect
                      id="applicationSummaryAgentClientLocationCode"
                      labelText="Agent Client Location"
                      value={summaryForm.agentClientLocationCode}
                      invalid={Boolean(visibleSummaryFieldError('agentClientLocationCode'))}
                      invalidText={visibleSummaryFieldError('agentClientLocationCode')}
                      disabled={
                        !summaryForm.agentClientNumber.trim() || isLoadingAgentClientLocations
                      }
                      placeholder={agentClientLocationPlaceholder}
                      options={agentClientLocations
                        .filter(isSelectableClientLocation)
                        .map((location) => ({
                          value: location.locationCode,
                          label: location.locationName,
                        }))}
                      onChange={(value) => onSummaryFormChange('agentClientLocationCode', value)}
                    />
                    {hasSelectableAgentClientContacts || isLoadingAgentClientContacts ? (
                      <SearchableSelect
                        id="applicationSummaryAgentContactName"
                        labelText="Agent Contact Name"
                        value={summaryForm.agentContactName}
                        invalid={Boolean(visibleSummaryFieldError('agentContactName'))}
                        invalidText={visibleSummaryFieldError('agentContactName')}
                        disabled={
                          !summaryForm.agentClientLocationCode.trim() ||
                          isLoadingAgentClientContacts
                        }
                        placeholder={agentContactPlaceholder}
                        options={agentClientContacts
                          .filter(isSelectableClientContact)
                          .map((contact) => ({
                            value: contact.contactName,
                            label: contact.contactName,
                          }))}
                        onChange={(value) => onSummaryFormChange('agentContactName', value)}
                      />
                    ) : (
                      <TextInput
                        id="applicationSummaryAgentContactName"
                        labelText="Agent Contact Name"
                        value={summaryForm.agentContactName}
                        invalid={Boolean(visibleSummaryFieldError('agentContactName'))}
                        invalidText={visibleSummaryFieldError('agentContactName')}
                        disabled={!summaryForm.agentClientLocationCode.trim()}
                        placeholder="Enter agent contact name"
                        onChange={(event) =>
                          onSummaryFormChange('agentContactName', event.target.value)
                        }
                      />
                    )}
                    <SearchableSelect
                      id="applicationSummaryRegion"
                      labelText="Region"
                      value={summaryForm.orgUnitNumber}
                      invalid={Boolean(visibleSummaryFieldError('orgUnitNumber'))}
                      invalidText={visibleSummaryFieldError('orgUnitNumber')}
                      disabled={isLoadingSummaryOptions && regionOptions.length === 0}
                      placeholder="Select region"
                      options={optionsWithCurrentValue(regionOptions, summaryForm.orgUnitNumber)}
                      onChange={(value) => onSummaryFormChange('orgUnitNumber', value)}
                    />
                    <SearchableSelect
                      id="applicationSummaryProductType"
                      labelText="Product Type"
                      value={summaryForm.productTypeCode}
                      invalid={Boolean(visibleSummaryFieldError('productTypeCode'))}
                      invalidText={visibleSummaryFieldError('productTypeCode')}
                      disabled={isLoadingSummaryOptions && productTypeOptions.length === 0}
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
                      id="applicationSummaryGrowthType"
                      labelText="Growth Type"
                      value={summaryForm.growthTypeCode}
                      invalid={Boolean(visibleSummaryFieldError('growthTypeCode'))}
                      invalidText={visibleSummaryFieldError('growthTypeCode')}
                      disabled={isLoadingSummaryOptions && growthTypeOptions.length === 0}
                      placeholder="Select growth type"
                      options={optionsWithCurrentValue(
                        growthTypeOptions,
                        summaryForm.growthTypeCode,
                      )}
                      onChange={(value) =>
                        onSummaryFormChange('growthTypeCode', value.toUpperCase())
                      }
                    />
                    <SearchableSelect
                      id="applicationSummaryStatus"
                      labelText="Application Status"
                      value={summaryForm.applicationStatusCode}
                      invalid={Boolean(visibleSummaryFieldError('applicationStatusCode'))}
                      invalidText={visibleSummaryFieldError('applicationStatusCode')}
                      disabled={isLoadingSummaryOptions && applicationStatusOptions.length === 0}
                      placeholder="Select application status"
                      options={optionsWithCurrentValue(
                        applicationStatusOptions,
                        summaryForm.applicationStatusCode,
                      )}
                      onChange={(value) =>
                        onSummaryFormChange('applicationStatusCode', value.toUpperCase())
                      }
                    />
                    <SearchableSelect
                      id="applicationSummaryJurisdiction"
                      labelText="Jurisdiction"
                      value={summaryForm.jurisdictionCode}
                      placeholder="Select jurisdiction"
                      options={optionsWithCurrentValue(
                        JURISDICTION_OPTIONS,
                        summaryForm.jurisdictionCode,
                      ).map((option) => ({ value: option.value, label: optionLabel(option) }))}
                      invalid={Boolean(visibleSummaryFieldError('jurisdictionCode'))}
                      invalidText={visibleSummaryFieldError('jurisdictionCode')}
                      onChange={(value) =>
                        onSummaryFormChange('jurisdictionCode', value.toUpperCase())
                      }
                    />
                    <SearchableSelect
                      id="applicationSummarySchedule"
                      labelText="Listing Date"
                      value={summaryForm.exportScheduleId}
                      disabled={isLoadingSummaryOptions && summaryScheduleOptions.length === 0}
                      placeholder="Search listing date"
                      options={optionsWithCurrentValue(
                        summaryScheduleOptions,
                        summaryForm.exportScheduleId,
                      )}
                      onChange={(value) => onSummaryFormChange('exportScheduleId', value)}
                    />
                    <SearchableSelect
                      id="applicationSummaryOicIndicator"
                      labelText="OIC Indicator"
                      value={summaryForm.oicIndicator}
                      placeholder="Select OIC indicator"
                      options={optionsWithCurrentValue(
                        OIC_INDICATOR_OPTIONS,
                        summaryForm.oicIndicator,
                      ).map((option) => ({ value: option.value, label: optionLabel(option) }))}
                      invalid={Boolean(visibleSummaryFieldError('oicIndicator'))}
                      invalidText={visibleSummaryFieldError('oicIndicator')}
                      onChange={(value) => onSummaryFormChange('oicIndicator', value.toUpperCase())}
                    />
                  </div>
                  {clientSummaryContent}
                  <div className="legacy-search-grid">
                    <TextArea
                      id="applicationSummaryProductLocation"
                      labelText="Location of Logs"
                      value={summaryForm.productLocation}
                      invalid={Boolean(visibleSummaryFieldError('productLocation'))}
                      invalidText={visibleSummaryFieldError('productLocation')}
                      onChange={(event) =>
                        onSummaryFormChange('productLocation', event.target.value)
                      }
                    />
                  </div>
                  <div className="legacy-search-grid">
                    <SearchableSelect
                      id="applicationSummarySpeciesCandidate"
                      labelText="Application Species"
                      value={applicationSpeciesCandidate}
                      disabled={applicationSpeciesSelectOptions.length === 0}
                      placeholder={speciesPlaceholder}
                      options={applicationSpeciesSelectOptions}
                      onChange={setApplicationSpeciesCandidate}
                    />
                    <SearchableSelect
                      id="applicationSummaryEndUse"
                      labelText="Application End Use"
                      value={summaryForm.endUseCode}
                      disabled={
                        (summaryForm.speciesCodes ?? []).length === 0 ||
                        applicationEndUseSelectOptions.length === 0
                      }
                      placeholder={endUsePlaceholder}
                      options={applicationEndUseSelectOptions}
                      onChange={(value) => onSummaryFormChange('endUseCode', value)}
                    />
                  </div>
                  <div className="legacy-search-actions">
                    <Button
                      kind="secondary"
                      size="sm"
                      disabled={
                        !applicationSpeciesCandidate ||
                        !availableApplicationSpeciesOptions.some(
                          (option) => option.code === applicationSpeciesCandidate,
                        )
                      }
                      onClick={onAddApplicationSpecies}
                    >
                      Add Application Species
                    </Button>
                    {(summaryForm.speciesCodes ?? []).map((speciesCode) => (
                      <span key={speciesCode} className="legacy-search-actions">
                        <Tag type="blue">{speciesCode}</Tag>
                        <Button
                          kind="ghost"
                          size="sm"
                          onClick={() => onRemoveApplicationSpecies(speciesCode)}
                        >
                          Remove
                        </Button>
                      </span>
                    ))}
                  </div>
                  <div className="legacy-search-actions">
                    <Button
                      kind="primary"
                      size="sm"
                      disabled={isSavingSummary}
                      onClick={() => void onSaveSummary()}
                    >
                      {isSavingSummary ? 'Saving...' : 'Save Summary'}
                    </Button>
                    <Button
                      kind="secondary"
                      size="sm"
                      disabled={isSavingSummary}
                      onClick={() => {
                        setSummaryForm(summaryBaselineForm ?? toSummaryFormState(detail))
                        setShowSummaryValidationErrors(false)
                      }}
                    >
                      Reset Summary
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <dl className="detail-field-grid">
                    {[
                      ['Exemption Reason', displayValue(detail.exemptionReasonCode)],
                      ['Application Date', displayValue(detail.applicationDate)],
                      ['Received Date', displayValue(detail.receivedDate)],
                      ['Term (days)', displayValue(detail.termDays)],
                      ['Application Volume (m³)', displayValue(detail.applicationVolume)],
                      ['Average Log Volume', displayValue(detail.averageLogVolume)],
                    ].map(([label, value]) => (
                      <div key={label} className="detail-field-item">
                        <dt className="detail-field-label">{label}</dt>
                        <dd className="detail-field-value">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {clientSummaryContent}
                </>
              )}
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={16}>
            <Tile className="application-detail-section application-detail-status-strip">
              <h2 className="detail-tile-title">Access & Workflow Flags</h2>
              <div className="application-detail-flag-row">
                <Tag type={detail.canCreateOffers ? 'green' : 'gray'}>
                  Create Offers: {detail.canCreateOffers ? 'Yes' : 'No'}
                </Tag>
                <Tag type={detail.industryUser ? 'green' : 'gray'}>
                  Industry User: {detail.industryUser ? 'Yes' : 'No'}
                </Tag>
                <Tag type={detail.readOnly ? 'red' : 'gray'}>
                  Read Only: {detail.readOnly ? 'Yes' : 'No'}
                </Tag>
                <Tag type={detail.exemptionApprover ? 'green' : 'gray'}>
                  Exemption Approver: {detail.exemptionApprover ? 'Yes' : 'No'}
                </Tag>
                <Tag type={detail.locked ? 'red' : 'green'}>
                  Locked: {detail.locked ? 'Yes' : 'No'}
                </Tag>
              </div>
            </Tile>
          </Column>

          {canReviewApplication && (
            <Column sm={4} md={8} lg={16}>
              <Tile
                id="application-review"
                className="application-detail-section application-detail-review"
              >
                <h2 className="detail-tile-title">Application Review</h2>
                <div className="legacy-search-grid">
                  <SearchableSelect
                    id="applicationDetailReviewStatus"
                    labelText="Application Status"
                    value={reviewStatusCode}
                    placeholder="Select status"
                    options={reviewStatusOptions}
                    invalid={!!reviewValidationMessage && !normalizedReviewStatusCode}
                    invalidText={reviewValidationMessage}
                    onChange={(value) => {
                      setReviewStatusCode(value)
                      setReviewValidationMessage('')
                    }}
                  />
                  <TextInput
                    id="applicationDetailReviewEmail"
                    labelText="Client Email Address"
                    value={reviewStatusEmailAddress}
                    invalid={
                      !!reviewValidationMessage &&
                      reviewValidationMessage.toLowerCase().includes('email')
                    }
                    invalidText={reviewValidationMessage}
                    onChange={(event) => {
                      setReviewStatusEmailAddress(event.target.value)
                      setReviewValidationMessage('')
                    }}
                  />
                </div>
                <div className="legacy-search-grid">
                  <TextArea
                    id="applicationDetailReviewRemark"
                    labelText="Review Remark"
                    maxCount={250}
                    value={reviewStatusRemark}
                    onChange={(event) => setReviewStatusRemark(event.target.value.slice(0, 250))}
                  />
                </div>
                {!!reviewValidationMessage && normalizedReviewStatusCode && (
                  <InlineNotification
                    className="legacy-inline-notification"
                    kind="error"
                    title="Review validation"
                    subtitle={reviewValidationMessage}
                    lowContrast
                    onCloseButtonClick={() => setReviewValidationMessage('')}
                  />
                )}
                <div className="legacy-search-actions">
                  <Button
                    kind="primary"
                    size="sm"
                    disabled={isSubmittingReviewAction}
                    onClick={() => void onApproveApplication()}
                  >
                    Approve Application
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    disabled={isSubmittingReviewAction}
                    onClick={() => void onUpdateReviewStatus(false)}
                  >
                    Update Review Status
                  </Button>
                  <Button
                    kind="tertiary"
                    size="sm"
                    disabled={isSubmittingReviewAction || !canSendReviewStatusEmail}
                    onClick={() => void onUpdateReviewStatus(true)}
                  >
                    Update Status and Send Email
                  </Button>
                </div>
              </Tile>
            </Column>
          )}

          <Column sm={4} md={8} lg={16}>
            <Tile
              id="application-packages"
              className="application-detail-section application-detail-packages"
            >
              <h2 className="detail-tile-title">Packages</h2>
              <TextInput
                id="applicationDetailPackageFilter"
                labelText="Filter packages"
                value={packageFilter}
                onChange={(event) => updateFilterParam('packageFilter', event.target.value)}
                placeholder="Filter by package, pieces, or volume"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Package</TableHeader>
                    <TableHeader>Volume (m3)</TableHeader>
                    <TableHeader>Pieces</TableHeader>
                    <TableHeader>Action</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPackages.map((item) => (
                    <TableRow key={item.packageNumber}>
                      <TableCell>{item.packageNumber}</TableCell>
                      <TableCell>{item.volume.toLocaleString()}</TableCell>
                      <TableCell>{item.pieceCount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Button
                          kind="ghost"
                          size="sm"
                          aria-label={`Edit package ${item.packageNumber} items`}
                          onClick={() => focusPackageInItems(item.packageNumber)}
                        >
                          Edit Items
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredPackages.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>No package rows matched the current filter.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>
          <Column sm={4} md={8} lg={16}>
            <ProvincialApplicationItemsPanel
              detail={detail}
              canManageItems={canManageItems}
              productTypeOptions={packageProductTypeOptions}
              growthTypeOptions={packageGrowthTypeOptions}
              onDetailChanged={loadApplicationDetail}
              focusedPackageNumber={focusedPackageNumber}
              focusedPackageRequestId={focusedPackageRequestId}
            />
          </Column>
          <Column sm={4} md={8} lg={8}>
            <Tile id="application-permits" className="application-detail-section">
              <h2 className="detail-tile-title">Permits</h2>
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Permit</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Open</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {permitRows.map((item) => (
                    <TableRow key={item.permitNumber}>
                      <TableCell>{item.permitNumber}</TableCell>
                      <TableCell>{item.permitStatusDescription || '-'}</TableCell>
                      <TableCell>
                        <Button
                          kind="ghost"
                          size="sm"
                          disabled={!canPerform('/permitDetails')}
                          onClick={() =>
                            navigate(withCurrentSearch(`/provincial/permit/${item.permitNumber}`))
                          }
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {permitRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3}>No permits found for this application.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>
          <Column sm={4} md={8} lg={8}>
            <Tile id="application-offers" className="application-detail-section">
              <h2 className="detail-tile-title">Offers</h2>
              <TextInput
                id="applicationDetailOfferFilter"
                labelText="Filter offers"
                value={offerFilter}
                onChange={(event) => updateFilterParam('offerFilter', event.target.value)}
                placeholder="Filter by company, offer number, received date, validity, or withdrawal date"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Offer</TableHeader>
                    <TableHeader>Company</TableHeader>
                    <TableHeader>Date Received</TableHeader>
                    <TableHeader>Valid</TableHeader>
                    <TableHeader>Withdrawal Date</TableHeader>
                    <TableHeader>Open</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredOffers.map((item) => (
                    <TableRow key={item.offerNumber}>
                      <TableCell>{item.offerNumber}</TableCell>
                      <TableCell>{item.companyName ?? '-'}</TableCell>
                      <TableCell>{item.receivedDate ?? '-'}</TableCell>
                      <TableCell>{item.validOffer ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{item.withdrawalDate ?? '-'}</TableCell>
                      <TableCell>
                        <Button
                          kind="ghost"
                          size="sm"
                          disabled={!canPerform('/offersSearch') || !canPerform('/offerDetails')}
                          onClick={() =>
                            navigate(withCurrentSearch(`/provincial/offers/${item.offerNumber}`))
                          }
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredOffers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>No offer rows matched the current filter.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>
          <Column sm={4} md={8} lg={16}>
            <Tile
              id="application-documents"
              className="application-detail-section application-detail-documents"
            >
              <h2 className="detail-tile-title">
                Documents <Tag type="green">API</Tag>
              </h2>
              {canUploadApplicationDocuments && (
                <DetailDocumentUploadPanel
                  workflowType="application"
                  targetNumber={String(detail.applicationNumber ?? '')}
                  inputId="applicationDocumentUpload"
                  disabled={!detail.applicationNumber}
                  onUploadComplete={refreshApplicationDocuments}
                />
              )}
              <TextInput
                id="applicationDetailDocumentsFilter"
                labelText="Filter document rows"
                value={documentsFilter}
                onChange={(event) => updateFilterParam('documentsFilter', event.target.value)}
                placeholder="Filter by file name, description, type, or id"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>File Name</TableHeader>
                    <TableHeader>Description</TableHeader>
                    <TableHeader>Type</TableHeader>
                    <TableHeader>Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredDocumentRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name || '-'}</TableCell>
                      <TableCell>{row.description || '-'}</TableCell>
                      <TableCell>{row.type || '-'}</TableCell>
                      <TableCell>
                        <div className="legacy-search-actions">
                          <Button kind="ghost" size="sm" onClick={() => void onOpenDocument(row)}>
                            Open
                          </Button>
                          <Button
                            kind="danger--ghost"
                            size="sm"
                            disabled={!canDeleteDocuments || isRemovingDocumentId === row.id}
                            onClick={() => void onRemoveDocument(row)}
                          >
                            {isRemovingDocumentId === row.id ? 'Deleting...' : 'Delete'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredDocumentRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        No document rows matched the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={16}>
            <Tile
              id="application-remarks"
              className="application-detail-section application-detail-remarks"
            >
              <h2 className="detail-tile-title">Remarks</h2>
              {canManageRemarks && (
                <div className="legacy-search-actions">
                  <TextArea
                    id="applicationRemarkBody"
                    labelText={editingRemarkId ? `Edit Remark ${editingRemarkId}` : 'New Remark'}
                    value={remarkBody}
                    invalid={!!remarkValidationMessage}
                    invalidText={remarkValidationMessage}
                    onChange={(event) => {
                      setRemarkBody(event.target.value)
                      if (remarkValidationMessage) {
                        setRemarkValidationMessage('')
                      }
                    }}
                  />
                  <Button
                    kind="primary"
                    size="sm"
                    disabled={isSavingRemark}
                    onClick={() => void onSaveRemark()}
                  >
                    {isSavingRemark
                      ? 'Saving...'
                      : editingRemarkId
                        ? 'Update Remark'
                        : 'Save Remark'}
                  </Button>
                  {editingRemarkId && (
                    <Button
                      kind="ghost"
                      size="sm"
                      disabled={isSavingRemark}
                      onClick={() => {
                        setEditingRemarkId(null)
                        setRemarkBody('')
                        setRemarkValidationMessage('')
                      }}
                    >
                      Cancel Edit
                    </Button>
                  )}
                </div>
              )}
              <TextInput
                id="applicationDetailRemarkFilter"
                labelText="Filter remarks"
                value={remarkFilter}
                onChange={(event) => updateFilterParam('remarkFilter', event.target.value)}
                placeholder="Filter by title or remark text"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Date</TableHeader>
                    <TableHeader>User</TableHeader>
                    <TableHeader>Title</TableHeader>
                    <TableHeader>Remark</TableHeader>
                    {canManageRemarks && <TableHeader>Actions</TableHeader>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRemarks.map((item) => (
                    <TableRow key={`${item.remarkId ?? item.title}-${item.remark}`}>
                      <TableCell>{displayValue(item.date)}</TableCell>
                      <TableCell>{displayValue(item.user)}</TableCell>
                      <TableCell>{item.title}</TableCell>
                      <TableCell>{item.remark}</TableCell>
                      {canManageRemarks && (
                        <TableCell>
                          <Button
                            kind="ghost"
                            size="sm"
                            disabled={!item.remarkId}
                            onClick={() => {
                              setEditingRemarkId(item.remarkId ? String(item.remarkId) : null)
                              setRemarkBody(item.remark)
                              setRemarkValidationMessage('')
                            }}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {filteredRemarks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={canManageRemarks ? 5 : 4}>
                        No remarks matched the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>
        </>
      )}
    </Grid>
  )
}

export default ProvincialApplicationDetailsPage
