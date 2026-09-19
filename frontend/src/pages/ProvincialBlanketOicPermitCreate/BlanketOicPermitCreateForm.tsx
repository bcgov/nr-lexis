import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Checkbox,
  InlineLoading,
  InlineNotification,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import {
  CurrencyDollar,
  DataTable,
  Delivery,
  Document,
  DocumentAttachment,
  User,
} from '@carbon/icons-react'
import EmptyState from '@/components/EmptyState'
import ForestClientComboBox from '@/components/ForestClientComboBox'
import IsoDatePicker from '@/components/IsoDatePicker'
import PendingIcon from '@/components/PendingIcon'
import PermitCountrySelect from '@/components/PermitCountrySelect'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import {
  CLIENT_LOOKUP_UNAVAILABLE_MESSAGE,
  clientLocationLabel,
  isSelectableClientLocation,
  resolveClientLocationCode,
} from '@/pages/shared/application-form-utils'
import { isValidIsoDate } from '@/pages/shared/create-form-utils'
import type { IdTextOption } from '@/pages/shared/search-query-utils'
import {
  fetchExemptionClientData,
  fetchExemptionClientLocations,
  type ApplicationClientData,
  type ApplicationClientLocation,
} from '@/service/application-client-lookup-service'
import {
  addPermitDetail,
  type PermitDetailMutationRequest,
} from '@/service/provincial-permit-documents-invoices-service'
import {
  fetchShippingReferenceOptions,
  formatShippingReferenceOption,
  type ShippingReferenceOptions,
} from '@/service/shipping-reference-service'
import { formatBusinessIsoDate } from '@/utils/date'
import { requiredLabel } from '@/utils/required-label'
import { resolveBlanketOicRegionContext } from './region-context'

import './BlanketOicPermitCreateForm.scss'

type BlanketOicPermitForm = {
  permitSubmitDate: string
  permitIssueDate: string
  permitExpiryDate: string
  oicPermitTotalPieces: string
  oicPermitTotalVolume: string
  orgUnitNumber: string
  permitRemarks: string
  ownerClientNumber: string
  ownerClientLocation: string
  agentClientNumber: string
  agentClientLocation: string
  destinationCompanyName: string
  destinationCountry: string
  transportType: string
  transportName: string
  estimatedShippingDate: string
  portOfExport: string
  otherPortOfExport: string
}

type FormField = keyof BlanketOicPermitForm
type FormErrors = Partial<Record<FormField, string>>
type BlanketOicPermitDraft = {
  form: BlanketOicPermitForm
  agentUsed: boolean
}

type ClientKind = 'owner' | 'agent'
type ClientLookupResult = { clientNumber: string; locationCode: string }
type PendingClientLookup = { clientNumber: string; promise: Promise<ClientLookupResult> }

type BlanketOicPermitCreateFormProps = {
  exemptionNumber: string
  regionOptions: IdTextOption[]
  defaultRegionNumbers: string[]
  onCancel: () => void
  onCreated: (permitNumber: string) => void
  onUnknownOutcome: (message: string) => void
}

const MAX_OIC_REQUEST_PIECES = 9_999_999_999
const MAX_OIC_REQUEST_VOLUME_LENGTH = 9

const FORM_TABS = [
  {
    label: 'Permit',
    icon: Document,
    requiredFields: [
      'permitSubmitDate',
      'orgUnitNumber',
      'oicPermitTotalPieces',
      'oicPermitTotalVolume',
    ],
  },
  {
    label: 'Applicant',
    icon: User,
    requiredFields: [
      'ownerClientNumber',
      'ownerClientLocation',
      'agentClientNumber',
      'agentClientLocation',
    ],
  },
  {
    label: 'Shipping',
    icon: Delivery,
    requiredFields: [
      'destinationCompanyName',
      'destinationCountry',
      'transportType',
      'transportName',
      'estimatedShippingDate',
      'portOfExport',
      'otherPortOfExport',
    ],
  },
  { label: 'Scale', icon: DataTable, requiredFields: [] },
  { label: 'Documents', icon: DocumentAttachment, requiredFields: [] },
  { label: 'Fees', icon: CurrencyDollar, requiredFields: [] },
] as const

const withShippingDefaults = (
  form: BlanketOicPermitForm,
  options: ShippingReferenceOptions,
): BlanketOicPermitForm => ({
  ...form,
  destinationCountry:
    form.destinationCountry ||
    options.countries.find(({ code }) => code === 'US')?.code ||
    options.countries[0]?.code ||
    '',
  transportType:
    form.transportType ||
    options.transportTypes.find(({ code }) => code === 'B')?.code ||
    options.transportTypes[0]?.code ||
    '',
  portOfExport:
    form.portOfExport ||
    options.ports.find(({ code }) => code === 'CB')?.code ||
    options.ports[0]?.code ||
    '',
})

const initialForm = (defaultRegionNumber: string): BlanketOicPermitForm => {
  const today = formatBusinessIsoDate()
  return {
    permitSubmitDate: today,
    permitIssueDate: '',
    permitExpiryDate: '',
    oicPermitTotalPieces: '',
    oicPermitTotalVolume: '',
    orgUnitNumber: defaultRegionNumber,
    permitRemarks: '',
    ownerClientNumber: '',
    ownerClientLocation: '',
    agentClientNumber: '',
    agentClientLocation: '',
    destinationCompanyName: '',
    destinationCountry: '',
    transportType: '',
    transportName: '',
    estimatedShippingDate: '',
    portOfExport: '',
    otherPortOfExport: '',
  }
}

const requiredDateError = (value: string, label: string): string | undefined => {
  if (!value.trim()) return `${label} is required.`
  return isValidIsoDate(value) ? undefined : `${label} must use YYYY-MM-DD.`
}

const optionalDateError = (value: string, label: string): string | undefined =>
  value.trim() && !isValidIsoDate(value) ? `${label} must use YYYY-MM-DD.` : undefined

const requiredTextError = (value: string, label: string, maxLength: number): string | undefined => {
  const normalized = value.trim()
  if (!normalized) return `${label} is required.`
  return normalized.length <= maxLength
    ? undefined
    : `${label} must be ${maxLength} characters or fewer.`
}

const clientNumberError = (value: string, label: string): string | undefined =>
  /^\d{8}$/.test(value.trim()) ? undefined : `${label} must be exactly 8 digits.`

const isPopulatedIsoDate = (value: string): boolean => !!value.trim() && isValidIsoDate(value)

const firstInvalidTabIndex = (errors: FormErrors): number => {
  const hasError = (fields: readonly FormField[]) => fields.some((field) => !!errors[field])
  if (
    hasError([
      'permitSubmitDate',
      'permitIssueDate',
      'permitExpiryDate',
      'oicPermitTotalPieces',
      'oicPermitTotalVolume',
      'orgUnitNumber',
      'permitRemarks',
    ])
  ) {
    return 0
  }
  if (
    hasError([
      'ownerClientNumber',
      'ownerClientLocation',
      'agentClientNumber',
      'agentClientLocation',
    ])
  ) {
    return 1
  }
  return 2
}

const validateForm = (form: BlanketOicPermitForm, agentUsed: boolean): FormErrors => {
  const errors: FormErrors = {
    permitSubmitDate: requiredDateError(form.permitSubmitDate, 'Submit date'),
    permitIssueDate: optionalDateError(form.permitIssueDate, 'Issued date'),
    permitExpiryDate: optionalDateError(form.permitExpiryDate, 'Expiry date'),
    orgUnitNumber: form.orgUnitNumber.trim() ? undefined : 'Region is required.',
    ownerClientNumber: clientNumberError(form.ownerClientNumber, 'Applicant client number'),
    ownerClientLocation: form.ownerClientLocation.trim()
      ? undefined
      : 'Applicant location is required.',
    destinationCompanyName: requiredTextError(form.destinationCompanyName, 'Purchaser', 52),
    destinationCountry:
      form.destinationCountry.trim().length === 2
        ? undefined
        : 'Final destination country is required.',
    transportType:
      form.transportType.trim().length === 1 ? undefined : 'Transport type is required.',
    transportName: requiredTextError(form.transportName, 'Transport name', 26),
    estimatedShippingDate: requiredDateError(form.estimatedShippingDate, 'Estimated shipping date'),
    portOfExport:
      form.portOfExport.trim().length === 2 ? undefined : 'Customs port of export is required.',
    otherPortOfExport:
      form.portOfExport.trim().toUpperCase() === 'OT'
        ? requiredTextError(form.otherPortOfExport, 'Other port name', 34)
        : undefined,
  }

  const pieces = form.oicPermitTotalPieces.trim()
  if (!pieces) {
    errors.oicPermitTotalPieces = 'Permit request pieces is required.'
  } else if (!/^\d+$/.test(pieces) || Number(pieces) > MAX_OIC_REQUEST_PIECES) {
    errors.oicPermitTotalPieces =
      'Permit request pieces must be a whole number no greater than 9999999999.'
  }

  const volume = form.oicPermitTotalVolume.trim()
  if (!volume) {
    errors.oicPermitTotalVolume = 'Permit request volume is required.'
  } else if (
    !/^\d+(?:\.\d{1,2})?$/.test(volume) ||
    Number(volume) < 0 ||
    volume.length > MAX_OIC_REQUEST_VOLUME_LENGTH
  ) {
    errors.oicPermitTotalVolume =
      'Permit request volume must be non-negative, 9 characters or fewer, with at most 2 decimal places.'
  }

  if (form.permitRemarks.length > 250) {
    errors.permitRemarks = 'Remarks must be 250 characters or fewer.'
  }

  if (
    isPopulatedIsoDate(form.permitSubmitDate) &&
    form.permitSubmitDate > formatBusinessIsoDate()
  ) {
    errors.permitSubmitDate = "Submit date can't be in the future."
  }
  if (
    isPopulatedIsoDate(form.permitSubmitDate) &&
    isPopulatedIsoDate(form.permitIssueDate) &&
    form.permitIssueDate < form.permitSubmitDate
  ) {
    errors.permitIssueDate = 'Issued date must be after or equal to submit date.'
  }
  if (
    isPopulatedIsoDate(form.permitExpiryDate) &&
    ((isPopulatedIsoDate(form.permitSubmitDate) &&
      form.permitExpiryDate <= form.permitSubmitDate) ||
      (isPopulatedIsoDate(form.permitIssueDate) && form.permitExpiryDate <= form.permitIssueDate))
  ) {
    errors.permitExpiryDate = 'Expiry date must be after submit and issue dates.'
  }

  if (agentUsed) {
    errors.agentClientNumber = clientNumberError(form.agentClientNumber, 'Agent client number')
    errors.agentClientLocation = form.agentClientLocation.trim()
      ? undefined
      : 'Agent location is required.'
  }

  return Object.fromEntries(Object.entries(errors).filter(([, error]) => Boolean(error)))
}

const BlanketOicPermitCreateForm = ({
  exemptionNumber,
  regionOptions,
  defaultRegionNumbers,
  onCancel,
  onCreated,
  onUnknownOutcome,
}: BlanketOicPermitCreateFormProps) => {
  const regionContext = resolveBlanketOicRegionContext(regionOptions, defaultRegionNumbers)
  const [form, setForm] = useState(() => initialForm(regionContext.defaultRegionNumber))
  const [agentUsed, setAgentUsed] = useState(false)
  const draftBaselineRef = useRef<BlanketOicPermitDraft>({ form, agentUsed: false })
  const formEditedRef = useRef(false)
  const [formEdited, setFormEdited] = useState(false)
  const [clientSearchResetKey, setClientSearchResetKey] = useState(0)
  const [ownerLocations, setOwnerLocations] = useState<ApplicationClientLocation[]>([])
  const [agentLocations, setAgentLocations] = useState<ApplicationClientLocation[]>([])
  const [ownerClientData, setOwnerClientData] = useState<ApplicationClientData | null>(null)
  const [agentClientData, setAgentClientData] = useState<ApplicationClientData | null>(null)
  const [ownerLookupLoading, setOwnerLookupLoading] = useState(false)
  const [agentLookupLoading, setAgentLookupLoading] = useState(false)
  const [ownerLookupAttempted, setOwnerLookupAttempted] = useState(false)
  const [agentLookupAttempted, setAgentLookupAttempted] = useState(false)
  const [shippingReferences, setShippingReferences] = useState<ShippingReferenceOptions | null>(
    null,
  )
  const [shippingReferencesLoading, setShippingReferencesLoading] = useState(true)
  const [shippingReferencesError, setShippingReferencesError] = useState('')
  const [showValidationErrors, setShowValidationErrors] = useState(false)
  const [selectedTabIndex, setSelectedTabIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [createdPermitNumber, setCreatedPermitNumber] = useState<string | null>(null)
  const [unknownOutcomeMessage, setUnknownOutcomeMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [failedSubmitCount, setFailedSubmitCount] = useState(0)
  const errorSummaryRef = useRef<HTMLDivElement>(null)
  const [clientLookupFailures, setClientLookupFailures] = useState<ReadonlySet<ClientKind>>(
    () => new Set(),
  )
  const createPermitInFlightRef = useRef(false)
  const currentFormRef = useRef(form)
  const ownerLookupRequestRef = useRef(0)
  const agentLookupRequestRef = useRef(0)
  const ownerPendingLookupRef = useRef<PendingClientLookup | null>(null)
  const agentPendingLookupRef = useRef<PendingClientLookup | null>(null)
  currentFormRef.current = form
  const formErrors = validateForm(form, agentUsed)
  const errorMessages = Array.from(
    new Set(
      [
        ...(showValidationErrors ? Object.values(formErrors) : []),
        shippingReferencesError,
        regionContext.errorMessage,
        clientLookupFailures.size > 0 ? CLIENT_LOOKUP_UNAVAILABLE_MESSAGE : '',
        showValidationErrors && shippingReferencesLoading
          ? 'Shipping reference options are still loading. Try saving again when they are ready.'
          : '',
        actionError,
      ].filter(Boolean),
    ),
  )
  const isDraftDirty = formEdited && !formValuesEqual({ form, agentUsed }, draftBaselineRef.current)

  useEffect(() => {
    if (failedSubmitCount > 0) errorSummaryRef.current?.focus()
  }, [failedSubmitCount])

  useEffect(() => {
    if (createdPermitNumber) onCreated(createdPermitNumber)
  }, [createdPermitNumber, onCreated])

  useEffect(() => {
    if (unknownOutcomeMessage) onUnknownOutcome(unknownOutcomeMessage)
  }, [onUnknownOutcome, unknownOutcomeMessage])

  useEffect(() => {
    let active = true
    void fetchShippingReferenceOptions()
      .then((options) => {
        if (!active) return
        setShippingReferences(options)
        // Reference defaults belong to the initial draft, even if the user started editing first.
        draftBaselineRef.current = {
          ...draftBaselineRef.current,
          form: withShippingDefaults(draftBaselineRef.current.form, options),
        }
        setForm((current) => withShippingDefaults(current, options))
      })
      .catch((error) => {
        if (!active) return
        console.error(error)
        setShippingReferences(null)
        setShippingReferencesError(
          'Shipping reference options could not be loaded. Reload before creating a permit.',
        )
      })
      .finally(() => {
        if (active) setShippingReferencesLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const markFormEdited = () => {
    setActionError('')
    if (!formEditedRef.current) {
      draftBaselineRef.current = { form, agentUsed }
      formEditedRef.current = true
      setFormEdited(true)
    }
  }

  const setField = (field: FormField, value: string) => {
    markFormEdited()
    setForm((current) => ({ ...current, [field]: value }))
  }

  const updateClientLookupFailure = (kind: ClientKind, failed: boolean) => {
    setClientLookupFailures((current) => {
      if (current.has(kind) === failed) {
        return current
      }

      const next = new Set(current)
      if (failed) {
        next.add(kind)
      } else {
        next.delete(kind)
      }
      return next
    })
  }

  const loadClientLocations = async (
    kind: ClientKind,
    clientNumberOverride?: string,
  ): Promise<ClientLookupResult> => {
    const clientNumber = (
      clientNumberOverride ??
      (kind === 'owner'
        ? currentFormRef.current.ownerClientNumber
        : currentFormRef.current.agentClientNumber)
    ).trim()
    const setLocations = kind === 'owner' ? setOwnerLocations : setAgentLocations
    const setClientData = kind === 'owner' ? setOwnerClientData : setAgentClientData
    const setLoading = kind === 'owner' ? setOwnerLookupLoading : setAgentLookupLoading
    const setAttempted = kind === 'owner' ? setOwnerLookupAttempted : setAgentLookupAttempted
    const requestRef = kind === 'owner' ? ownerLookupRequestRef : agentLookupRequestRef
    const requestId = ++requestRef.current
    const locationField: FormField =
      kind === 'owner' ? 'ownerClientLocation' : 'agentClientLocation'
    const clientNumberField: FormField =
      kind === 'owner' ? 'ownerClientNumber' : 'agentClientNumber'
    const currentSelection = (): { clientNumber: string; locationCode: string } => {
      const current = currentFormRef.current
      return kind === 'owner'
        ? {
            clientNumber: current.ownerClientNumber.trim(),
            locationCode: current.ownerClientLocation.trim(),
          }
        : {
            clientNumber: current.agentClientNumber.trim(),
            locationCode: current.agentClientLocation.trim(),
          }
    }
    const isLatestRequest = (): boolean => {
      const current = currentSelection()
      return requestRef.current === requestId && current.clientNumber === clientNumber
    }

    setAttempted(true)
    if (!/^\d{1,8}$/.test(clientNumber)) {
      updateClientLookupFailure(kind, false)
      setLocations([])
      setClientData(null)
      setField(locationField, '')
      return { clientNumber, locationCode: '' }
    }

    setLoading(true)
    try {
      const locations = await fetchExemptionClientLocations(clientNumber)
      if (!isLatestRequest()) {
        return currentSelection()
      }
      const selectableLocations = locations.filter(isSelectableClientLocation)
      const selectedLocation = resolveClientLocationCode(
        selectableLocations,
        currentSelection().locationCode,
      )
      const clientData = selectedLocation
        ? await fetchExemptionClientData(clientNumber, selectedLocation)
        : null
      if (!isLatestRequest()) {
        return currentSelection()
      }
      const confirmedClientNumber = clientData?.clientNumber.trim() || clientNumber
      updateClientLookupFailure(kind, false)
      setLocations(selectableLocations)
      setClientData(clientData)
      setForm((current) => {
        const currentClientNumber =
          kind === 'owner' ? current.ownerClientNumber.trim() : current.agentClientNumber.trim()
        return currentClientNumber === clientNumber
          ? {
              ...current,
              [clientNumberField]: confirmedClientNumber,
              [locationField]: selectedLocation,
            }
          : current
      })
      return { clientNumber: confirmedClientNumber, locationCode: selectedLocation }
    } catch (error) {
      if (!isLatestRequest()) {
        return currentSelection()
      }
      console.error(error)
      updateClientLookupFailure(kind, true)
      return currentSelection()
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false)
      }
    }
  }

  const requestClientLocations = (
    kind: ClientKind,
    clientNumberOverride?: string,
  ): Promise<ClientLookupResult> => {
    const clientNumber = (
      clientNumberOverride ??
      (kind === 'owner'
        ? currentFormRef.current.ownerClientNumber
        : currentFormRef.current.agentClientNumber)
    ).trim()
    const pendingLookupRef = kind === 'owner' ? ownerPendingLookupRef : agentPendingLookupRef
    const pending = pendingLookupRef.current
    if (pending?.clientNumber === clientNumber) {
      return pending.promise
    }

    const promise = loadClientLocations(kind, clientNumber)
    const nextPending = { clientNumber, promise }
    pendingLookupRef.current = nextPending
    void promise.then(
      () => {
        if (pendingLookupRef.current === nextPending) {
          pendingLookupRef.current = null
        }
      },
      () => {
        if (pendingLookupRef.current === nextPending) {
          pendingLookupRef.current = null
        }
      },
    )
    return promise
  }

  const selectClient = (kind: ClientKind, clientNumber: string): void => {
    const requestRef = kind === 'owner' ? ownerLookupRequestRef : agentLookupRequestRef
    const pendingLookupRef = kind === 'owner' ? ownerPendingLookupRef : agentPendingLookupRef
    const setLoading = kind === 'owner' ? setOwnerLookupLoading : setAgentLookupLoading
    const setLocations = kind === 'owner' ? setOwnerLocations : setAgentLocations
    const setClientData = kind === 'owner' ? setOwnerClientData : setAgentClientData
    const setAttempted = kind === 'owner' ? setOwnerLookupAttempted : setAgentLookupAttempted
    const clientNumberField: FormField =
      kind === 'owner' ? 'ownerClientNumber' : 'agentClientNumber'
    const locationField: FormField =
      kind === 'owner' ? 'ownerClientLocation' : 'agentClientLocation'
    const nextForm = {
      ...currentFormRef.current,
      [clientNumberField]: clientNumber,
      [locationField]: '',
    }

    requestRef.current += 1
    pendingLookupRef.current = null
    setLoading(false)
    setLocations([])
    setClientData(null)
    updateClientLookupFailure(kind, false)
    setAttempted(false)
    markFormEdited()
    currentFormRef.current = nextForm
    setForm((current) => ({
      ...current,
      [clientNumberField]: clientNumber,
      [locationField]: '',
    }))
    if (clientNumber) {
      void requestClientLocations(kind, clientNumber)
    }
  }

  const selectClientLocation = async (kind: ClientKind, locationCode: string): Promise<void> => {
    const requestRef = kind === 'owner' ? ownerLookupRequestRef : agentLookupRequestRef
    const pendingLookupRef = kind === 'owner' ? ownerPendingLookupRef : agentPendingLookupRef
    const setLoading = kind === 'owner' ? setOwnerLookupLoading : setAgentLookupLoading
    const setClientData = kind === 'owner' ? setOwnerClientData : setAgentClientData
    const clientNumberField = kind === 'owner' ? 'ownerClientNumber' : 'agentClientNumber'
    const locationField = kind === 'owner' ? 'ownerClientLocation' : 'agentClientLocation'
    const clientNumber = currentFormRef.current[clientNumberField].trim()
    const requestId = ++requestRef.current
    pendingLookupRef.current = null
    setField(locationField, locationCode)
    currentFormRef.current = { ...currentFormRef.current, [locationField]: locationCode }
    setClientData(null)
    updateClientLookupFailure(kind, false)
    if (!clientNumber || !locationCode) {
      setLoading(false)
      return
    }

    const isLatestRequest = () =>
      requestRef.current === requestId &&
      currentFormRef.current[clientNumberField].trim() === clientNumber &&
      currentFormRef.current[locationField] === locationCode
    setLoading(true)
    try {
      const clientData = await fetchExemptionClientData(clientNumber, locationCode)
      if (isLatestRequest()) setClientData(clientData)
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        updateClientLookupFailure(kind, true)
      }
    } finally {
      if (isLatestRequest()) setLoading(false)
    }
  }

  const renderClientDetails = (kind: ClientKind) => {
    const clientData = kind === 'owner' ? ownerClientData : agentClientData
    const loading = kind === 'owner' ? ownerLookupLoading : agentLookupLoading
    const title = kind === 'owner' ? 'Applicant details' : 'Agent details'
    if (loading) return <InlineLoading description={`Loading ${title.toLowerCase()}…`} />
    if (!clientData) return null

    return (
      <section aria-label={title} className="application-client-summary">
        <dl className="detail-field-grid">
          {[
            ['Company name', clientData.companyName],
            ['Address', clientData.address],
            ['City', clientData.city],
            ['Province', clientData.province],
            ['Postal code', clientData.postalCode],
            ['Country', clientData.country],
            ['Phone', clientData.phone],
            ['Fax', clientData.fax],
            ['Email', clientData.email],
          ].map(([label, value]) => (
            <div key={label} className="detail-field-item">
              <dt className="detail-field-label">{label}</dt>
              <dd className="detail-field-value">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>
    )
  }

  const markDraftSaved = (nextForm: BlanketOicPermitForm) => {
    draftBaselineRef.current = { form: nextForm, agentUsed }
    formEditedRef.current = false
    setFormEdited(false)
  }

  const discardDraft = () => {
    const baseline = draftBaselineRef.current
    setForm(baseline.form)
    setAgentUsed(baseline.agentUsed)
    formEditedRef.current = false
    setFormEdited(false)
    setClientSearchResetKey((current) => current + 1)
  }

  const reportUnknownOutcome = (message: string, nextForm: BlanketOicPermitForm = form) => {
    markDraftSaved(nextForm)
    setUnknownOutcomeMessage(message)
  }

  const createPermit = async (navigateToCreatedPermit = true): Promise<boolean> => {
    if (createPermitInFlightRef.current) return false
    createPermitInFlightRef.current = true
    setSaving(true)
    try {
      setActionError('')

      let ownerClientNumber = form.ownerClientNumber.trim()
      let ownerLocation = form.ownerClientLocation.trim()
      let agentClientNumber = agentUsed ? form.agentClientNumber.trim() : ''
      let agentLocation = agentUsed ? form.agentClientLocation.trim() : ''
      const hasSelectedOwnerLocation = ownerLocations.some(
        (location) =>
          isSelectableClientLocation(location) && location.locationCode === ownerLocation,
      )
      const hasSelectedAgentLocation = agentLocations.some(
        (location) =>
          isSelectableClientLocation(location) && location.locationCode === agentLocation,
      )
      if (
        (!ownerLocation || !hasSelectedOwnerLocation || ownerClientNumber.length < 8) &&
        /^\d{1,8}$/.test(ownerClientNumber)
      ) {
        const confirmedOwner = await requestClientLocations('owner')
        ownerClientNumber = confirmedOwner.clientNumber
        ownerLocation = confirmedOwner.locationCode
      }
      if (
        agentUsed &&
        (!agentLocation || !hasSelectedAgentLocation || agentClientNumber.length < 8) &&
        /^\d{1,8}$/.test(agentClientNumber)
      ) {
        const confirmedAgent = await requestClientLocations('agent')
        agentClientNumber = confirmedAgent.clientNumber
        agentLocation = confirmedAgent.locationCode
      }

      const requestForm = {
        ...form,
        ownerClientNumber,
        ownerClientLocation: ownerLocation,
        agentClientNumber,
        agentClientLocation: agentLocation,
      }
      const errors = validateForm(requestForm, agentUsed)
      if (Object.keys(errors).length > 0) {
        setForm(requestForm)
        setSelectedTabIndex(firstInvalidTabIndex(errors))
        setShowValidationErrors(true)
        setFailedSubmitCount((count) => count + 1)
        return false
      }
      if (!shippingReferences || shippingReferencesLoading || regionContext.options.length === 0) {
        setShowValidationErrors(true)
        setFailedSubmitCount((count) => count + 1)
        return false
      }

      const request: PermitDetailMutationRequest = {
        permitNumber: '',
        permitStatus: 'ACT',
        permitSubmitDate: requestForm.permitSubmitDate,
        permitIssueDate: requestForm.permitIssueDate,
        permitExpiryDate: requestForm.permitExpiryDate,
        permitRequestDate: '',
        exemptionNumber,
        permitReceiptNo: '',
        permitRemarks: requestForm.permitRemarks,
        permitTotalVolume: '',
        permitNumberOfPieces: '',
        oicPermitTotalPieces: requestForm.oicPermitTotalPieces,
        oicPermitTotalVolume: requestForm.oicPermitTotalVolume,
        orgUnitNumber: requestForm.orgUnitNumber,
        ownerClientNumber: requestForm.ownerClientNumber,
        ownerClientLocation: requestForm.ownerClientLocation,
        agentClientNumber: agentUsed ? requestForm.agentClientNumber : '',
        agentClientLocation: agentUsed ? requestForm.agentClientLocation : '',
        destinationCompanyName: requestForm.destinationCompanyName,
        destinationCountry: requestForm.destinationCountry,
        transportType: requestForm.transportType,
        transportName: requestForm.transportName,
        estimatedShippingDate: requestForm.estimatedShippingDate,
        portOfExport: requestForm.portOfExport,
        otherPortOfExport: requestForm.otherPortOfExport,
      }

      const result = await addPermitDetail(request)
      if (!result.success) {
        setActionError(result.errors.join(' ') || result.message || 'Unable to create the permit.')
        setFailedSubmitCount((count) => count + 1)
        return false
      }
      const permitNumber = result.permitNumber.trim()
      if (!/^[1-9]\d*$/.test(permitNumber)) {
        reportUnknownOutcome(
          'The permit response did not include a valid permit number. Reload this exemption and check Related permits before trying again.',
          requestForm,
        )
        return false
      }
      setForm(requestForm)
      markDraftSaved(requestForm)
      if (navigateToCreatedPermit) {
        setCreatedPermitNumber(permitNumber)
      }
      return true
    } catch (error) {
      console.error(error)
      reportUnknownOutcome(
        'The permit request outcome could not be confirmed. Reload this exemption and check Related permits before trying again.',
      )
      return false
    } finally {
      createPermitInFlightRef.current = false
      setSaving(false)
    }
  }

  const fieldError = (field: FormField): string | undefined =>
    showValidationErrors ? formErrors[field] : undefined

  const close = () => {
    if (!saving) onCancel()
  }

  return (
    <section aria-label="Blanket OIC permit details">
      {errorMessages.length > 0 ? (
        <div ref={errorSummaryRef} tabIndex={-1} role="group" aria-label="Permit needs attention">
          <InlineNotification
            kind="error"
            role="alert"
            title="Permit needs attention"
            lowContrast
            hideCloseButton
          >
            <ul>
              {errorMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </InlineNotification>
        </div>
      ) : (
        <InlineNotification
          kind="info"
          title="The permit number is assigned after a successful save. The Scale, Documents and Fees tabs become available afterwards."
          lowContrast
          hideCloseButton
        />
      )}
      <div
        className="legacy-search-actions application-create-actions"
        role="group"
        aria-label="Blanket OIC permit actions"
      >
        <Button kind="tertiary" disabled={saving} onClick={close}>
          Cancel
        </Button>
        <Button
          kind="primary"
          disabled={saving}
          renderIcon={saving ? PendingIcon : undefined}
          onClick={() => void createPermit()}
        >
          {saving ? 'Saving…' : 'Save permit'}
        </Button>
      </div>

      <Tabs
        selectedIndex={selectedTabIndex}
        onChange={({ selectedIndex }) => setSelectedTabIndex(selectedIndex)}
      >
        <TabList
          aria-label="Blanket OIC permit sections"
          contained
          className="application-tabs__list application-detail-tab-list"
        >
          {FORM_TABS.map(({ label, icon, requiredFields }) => {
            const outstanding = showValidationErrors
              ? requiredFields.filter((field) => !!formErrors[field]).length
              : 0
            return (
              <Tab
                key={label}
                renderIcon={outstanding ? undefined : icon}
                aria-label={
                  outstanding
                    ? `${label}, ${outstanding} required ${outstanding === 1 ? 'field' : 'fields'} outstanding`
                    : label
                }
              >
                {label}
                {outstanding > 0 && (
                  <Tag type="red" size="sm" aria-hidden="true">
                    {outstanding}
                  </Tag>
                )}
              </Tab>
            )
          })}
        </TabList>
        <TabPanels>
          <TabPanel className="application-detail-tab-panel">
            <Tile className="create-form-tile application-detail-section" aria-label="Permit">
              <h2 className="detail-tile-title">Permit details</h2>
              <fieldset className="legacy-form-fieldset boic-permit-details">
                <legend className="cds--visually-hidden">Permit details</legend>
                <dl className="detail-field-grid boic-permit-details__status">
                  <div className="detail-field-item">
                    <dt className="detail-field-label">{requiredLabel('Status')}</dt>
                    <dd className="detail-field-value">Active</dd>
                  </div>
                </dl>
                <dl className="detail-field-grid boic-permit-details__pair">
                  <div className="detail-field-item">
                    <dt className="detail-field-label">Exemption number</dt>
                    <dd className="detail-field-value">{exemptionNumber}</dd>
                  </div>
                  <div className="detail-field-item">
                    <dt className="detail-field-label">Exemption type</dt>
                    <dd className="detail-field-value">Blanket OIC</dd>
                  </div>
                </dl>
                <div className="boic-permit-details__region">
                  <Select
                    id="boic-permit-region"
                    labelText={requiredLabel('Region')}
                    aria-required="true"
                    value={form.orgUnitNumber}
                    invalid={!!fieldError('orgUnitNumber')}
                    invalidText={fieldError('orgUnitNumber')}
                    disabled={regionContext.options.length === 0}
                    onChange={(event) => setField('orgUnitNumber', event.target.value)}
                  >
                    <SelectItem value="" text="Select a region" />
                    {regionContext.options.map((option) => (
                      <SelectItem key={option.id} value={option.id} text={option.text} />
                    ))}
                  </Select>
                </div>
                <div className="boic-permit-details__dates">
                  <IsoDatePicker
                    id="boic-permit-submit-date"
                    labelText={requiredLabel('Submit date')}
                    required
                    value={form.permitSubmitDate}
                    invalid={!!fieldError('permitSubmitDate')}
                    invalidText={fieldError('permitSubmitDate')}
                    onChange={(value) => setField('permitSubmitDate', value)}
                  />
                  <IsoDatePicker
                    id="boic-permit-issue-date"
                    labelText="Issued date"
                    value={form.permitIssueDate}
                    invalid={!!fieldError('permitIssueDate')}
                    invalidText={fieldError('permitIssueDate')}
                    onChange={(value) => setField('permitIssueDate', value)}
                  />
                  <IsoDatePicker
                    id="boic-permit-expiry-date"
                    labelText="Expiry date"
                    value={form.permitExpiryDate}
                    invalid={!!fieldError('permitExpiryDate')}
                    invalidText={fieldError('permitExpiryDate')}
                    onChange={(value) => setField('permitExpiryDate', value)}
                  />
                </div>
                <dl className="detail-field-grid boic-permit-details__pair">
                  <div className="detail-field-item">
                    <dt className="detail-field-label">Current permit pieces</dt>
                    <dd className="detail-field-value">0</dd>
                  </div>
                  <div className="detail-field-item">
                    <dt className="detail-field-label">Current permit volume (m³)</dt>
                    <dd className="detail-field-value">0</dd>
                  </div>
                </dl>
                <div className="boic-permit-details__pair">
                  <TextInput
                    id="boic-permit-request-pieces"
                    labelText={requiredLabel('Permit request pieces')}
                    aria-required="true"
                    value={form.oicPermitTotalPieces}
                    invalid={!!fieldError('oicPermitTotalPieces')}
                    invalidText={fieldError('oicPermitTotalPieces')}
                    onChange={(event) => setField('oicPermitTotalPieces', event.target.value)}
                  />
                  <TextInput
                    id="boic-permit-request-volume"
                    labelText={requiredLabel('Permit request volume (m³)')}
                    aria-required="true"
                    value={form.oicPermitTotalVolume}
                    invalid={!!fieldError('oicPermitTotalVolume')}
                    invalidText={fieldError('oicPermitTotalVolume')}
                    onChange={(event) => setField('oicPermitTotalVolume', event.target.value)}
                  />
                </div>
                <div className="boic-permit-details__remarks">
                  <TextArea
                    id="boic-permit-remarks"
                    labelText="Remarks"
                    enableCounter
                    maxCount={250}
                    value={form.permitRemarks}
                    invalid={!!fieldError('permitRemarks')}
                    invalidText={fieldError('permitRemarks')}
                    maxLength={250}
                    onChange={(event) => setField('permitRemarks', event.target.value)}
                  />
                </div>
              </fieldset>
            </Tile>
          </TabPanel>
          <TabPanel className="application-detail-tab-panel">
            <Tile className="create-form-tile application-detail-section" aria-label="Applicant">
              <fieldset className="legacy-form-fieldset">
                <legend className="cds--visually-hidden">Applicant</legend>
                <div className="legacy-search-grid">
                  <ForestClientComboBox
                    id="boic-permit-owner-client"
                    labelText={requiredLabel('Applicant client number')}
                    value={form.ownerClientNumber}
                    resetKey={clientSearchResetKey}
                    counterpartyClientNumber={form.agentClientNumber}
                    required
                    invalid={
                      !!fieldError('ownerClientNumber') ||
                      (ownerLookupAttempted &&
                        !ownerLookupLoading &&
                        !ownerLocations.some(isSelectableClientLocation))
                    }
                    invalidText={
                      fieldError('ownerClientNumber') ||
                      'No verified locations were found for this applicant.'
                    }
                    onBlur={() => {
                      if (form.ownerClientNumber.trim()) {
                        void requestClientLocations('owner')
                      }
                    }}
                    onChange={(ownerClientNumber) => selectClient('owner', ownerClientNumber)}
                  />
                  <Select
                    id="boic-permit-owner-location"
                    labelText={requiredLabel('Applicant location')}
                    aria-required="true"
                    value={form.ownerClientLocation}
                    invalid={!!fieldError('ownerClientLocation')}
                    invalidText={fieldError('ownerClientLocation')}
                    disabled={
                      ownerLookupLoading || !ownerLocations.some(isSelectableClientLocation)
                    }
                    onChange={(event) => void selectClientLocation('owner', event.target.value)}
                  >
                    <SelectItem
                      value=""
                      text={
                        ownerLookupLoading ? 'Loading locations' : 'Select an applicant location'
                      }
                    />
                    {ownerLocations.filter(isSelectableClientLocation).map((location) => (
                      <SelectItem
                        key={location.locationCode}
                        value={location.locationCode}
                        text={clientLocationLabel(location.locationCode, location.locationName)}
                      />
                    ))}
                  </Select>
                </div>
                {renderClientDetails('owner')}
                <Checkbox
                  id="boic-permit-agent-used"
                  labelText="I'm an agent"
                  checked={agentUsed}
                  onChange={(_, { checked }) => {
                    markFormEdited()
                    const enabled = Boolean(checked)
                    setAgentUsed(enabled)
                    if (!enabled) {
                      agentLookupRequestRef.current += 1
                      setAgentLookupLoading(false)
                      updateClientLookupFailure('agent', false)
                      setField('agentClientNumber', '')
                      setField('agentClientLocation', '')
                      setAgentLocations([])
                      setAgentClientData(null)
                      setAgentLookupAttempted(false)
                    }
                  }}
                />
                {agentUsed && (
                  <section
                    className="boic-permit-agent-information"
                    aria-labelledby="boic-permit-agent-information-heading"
                  >
                    <h2 id="boic-permit-agent-information-heading" className="detail-tile-title">
                      Agent information
                    </h2>
                    <div className="legacy-search-grid">
                      <ForestClientComboBox
                        id="boic-permit-agent-client"
                        labelText={requiredLabel('Agent client number')}
                        value={form.agentClientNumber}
                        resetKey={clientSearchResetKey}
                        counterpartyClientNumber={form.ownerClientNumber}
                        required
                        invalid={
                          !!fieldError('agentClientNumber') ||
                          (agentLookupAttempted &&
                            !agentLookupLoading &&
                            !agentLocations.some(isSelectableClientLocation))
                        }
                        invalidText={
                          fieldError('agentClientNumber') ||
                          'No verified locations were found for this agent.'
                        }
                        onBlur={() => {
                          if (form.agentClientNumber.trim()) {
                            void requestClientLocations('agent')
                          }
                        }}
                        onChange={(agentClientNumber) => selectClient('agent', agentClientNumber)}
                      />
                      <Select
                        id="boic-permit-agent-location"
                        labelText={requiredLabel('Agent location')}
                        aria-required="true"
                        value={form.agentClientLocation}
                        invalid={!!fieldError('agentClientLocation')}
                        invalidText={fieldError('agentClientLocation')}
                        disabled={
                          agentLookupLoading || !agentLocations.some(isSelectableClientLocation)
                        }
                        onChange={(event) => void selectClientLocation('agent', event.target.value)}
                      >
                        <SelectItem
                          value=""
                          text={
                            agentLookupLoading ? 'Loading locations' : 'Select an agent location'
                          }
                        />
                        {agentLocations.filter(isSelectableClientLocation).map((location) => (
                          <SelectItem
                            key={location.locationCode}
                            value={location.locationCode}
                            text={clientLocationLabel(location.locationCode, location.locationName)}
                          />
                        ))}
                      </Select>
                    </div>
                    {renderClientDetails('agent')}
                  </section>
                )}
              </fieldset>
            </Tile>
          </TabPanel>
          <TabPanel className="application-detail-tab-panel">
            <Tile className="create-form-tile application-detail-section" aria-label="Shipping">
              <fieldset className="legacy-form-fieldset">
                <legend className="cds--visually-hidden">Shipping</legend>
                <div className="legacy-search-grid">
                  <TextInput
                    id="boic-permit-destination-company"
                    labelText={requiredLabel('Purchaser')}
                    aria-required="true"
                    helperText="Company name"
                    value={form.destinationCompanyName}
                    invalid={!!fieldError('destinationCompanyName')}
                    invalidText={fieldError('destinationCompanyName')}
                    maxLength={52}
                    onChange={(event) => setField('destinationCompanyName', event.target.value)}
                  />
                  <PermitCountrySelect
                    id="boic-permit-destination-country"
                    labelText={requiredLabel('Final destination country')}
                    value={form.destinationCountry}
                    options={(shippingReferences?.countries ?? []).map((option) => ({
                      value: option.code,
                      label: formatShippingReferenceOption(option),
                    }))}
                    placeholder="Search and select a final destination country"
                    required
                    invalid={!!fieldError('destinationCountry')}
                    invalidText={fieldError('destinationCountry')}
                    disabled={shippingReferencesLoading || !shippingReferences}
                    onChange={(value) => setField('destinationCountry', value)}
                  />
                  <Select
                    id="boic-permit-transport-type"
                    labelText={requiredLabel('Transport type')}
                    aria-required="true"
                    value={form.transportType}
                    invalid={!!fieldError('transportType')}
                    invalidText={fieldError('transportType')}
                    disabled={shippingReferencesLoading || !shippingReferences}
                    onChange={(event) => setField('transportType', event.target.value)}
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
                    id="boic-permit-transport-name"
                    labelText={requiredLabel('Transport name')}
                    aria-required="true"
                    value={form.transportName}
                    invalid={!!fieldError('transportName')}
                    invalidText={fieldError('transportName')}
                    maxLength={26}
                    onChange={(event) => setField('transportName', event.target.value)}
                  />
                  <IsoDatePicker
                    id="boic-permit-estimated-shipping-date"
                    labelText={requiredLabel('Estimated shipping date')}
                    required
                    value={form.estimatedShippingDate}
                    invalid={!!fieldError('estimatedShippingDate')}
                    invalidText={fieldError('estimatedShippingDate')}
                    onChange={(value) => setField('estimatedShippingDate', value)}
                  />
                  <Select
                    id="boic-permit-port-of-export"
                    labelText={requiredLabel('Customs port of export')}
                    aria-required="true"
                    value={form.portOfExport}
                    invalid={!!fieldError('portOfExport')}
                    invalidText={fieldError('portOfExport')}
                    disabled={shippingReferencesLoading || !shippingReferences}
                    onChange={(event) => {
                      const port = event.target.value
                      setField('portOfExport', port)
                      if (port.toUpperCase() !== 'OT') setField('otherPortOfExport', '')
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
                  {form.portOfExport.trim().toUpperCase() === 'OT' && (
                    <TextInput
                      id="boic-permit-other-port"
                      labelText={requiredLabel('Other port name')}
                      aria-required="true"
                      value={form.otherPortOfExport}
                      invalid={!!fieldError('otherPortOfExport')}
                      invalidText={fieldError('otherPortOfExport')}
                      maxLength={34}
                      onChange={(event) => setField('otherPortOfExport', event.target.value)}
                    />
                  )}
                </div>
              </fieldset>
            </Tile>
          </TabPanel>
          <TabPanel className="application-detail-tab-panel">
            <Tile className="create-form-tile application-detail-section" aria-label="Scale">
              <EmptyState
                title="Save the permit first"
                description="Scale details are available after the permit is saved."
                headingLevel={2}
              />
            </Tile>
          </TabPanel>
          <TabPanel className="application-detail-tab-panel">
            <Tile className="create-form-tile application-detail-section" aria-label="Documents">
              <EmptyState
                title="Save the permit first"
                description="Documents can be added after the permit is saved."
                headingLevel={2}
              />
            </Tile>
          </TabPanel>
          <TabPanel className="application-detail-tab-panel">
            <Tile className="create-form-tile application-detail-section" aria-label="Fees">
              <EmptyState
                title="Save the permit first"
                description="Fee details are available after the permit is saved."
                headingLevel={2}
              />
            </Tile>
          </TabPanel>
        </TabPanels>
      </Tabs>
      <UnsavedChangesGuard
        isDirty={isDraftDirty}
        isBusy={saving}
        onSave={() => createPermit(false)}
        onDiscard={discardDraft}
        subject="this new Blanket OIC permit"
        saveUnavailableReason={
          shippingReferencesLoading || !shippingReferences || regionContext.options.length === 0
            ? regionContext.errorMessage ||
              'Required region and shipping options must load before this permit can be saved.'
            : undefined
        }
      />
    </section>
  )
}

export default BlanketOicPermitCreateForm
