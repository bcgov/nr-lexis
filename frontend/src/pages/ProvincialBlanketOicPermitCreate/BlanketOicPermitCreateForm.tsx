import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  Checkbox,
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
  Box,
  Certificate,
  Currency,
  DocumentAttachment,
  EarthFilled,
  Enterprise,
  Save,
} from '@carbon/icons-react'
import { Link, useLocation } from 'react-router-dom'
import DetailCardTitle from '@/components/DetailCardTitle'
import ForestClientComboBox from '@/components/ForestClientComboBox'
import IsoDatePicker from '@/components/IsoDatePicker'
import PendingIcon from '@/components/PendingIcon'
import PermitCountrySelect from '@/components/PermitCountrySelect'
import { discardNewRecordCopy } from '@/components/DiscardChangesModal'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { hasProvincialSubmitterRole } from '@/context/auth/role-utils'
import { useAuth } from '@/context/auth/useAuth'
import {
  CLIENT_LOOKUP_UNAVAILABLE_MESSAGE,
  clientLocationLabel,
  clientLookupNumbersMatch,
  isSelectableClientLocation,
  resolveClientLocationCode,
} from '@/pages/shared/application-form-utils'
import { isoDateFieldError, isValidIsoDate } from '@/pages/shared/create-form-utils'
import { withShippingDefaults } from '@/pages/ProvincialPermitDetails/shipping-defaults'
import { readDetailReturnTo } from '@/pages/shared/detail-navigation'
import type { IdTextOption } from '@/pages/shared/search-query-utils'
import {
  fetchApplicationClientData,
  fetchApplicationClientLocations,
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
import { fieldErrorText } from '@/utils/field-error'
import { requiredLabel } from '@/utils/required-label'
import { resolveBlanketOicRegionContext } from './region-context'

import './BlanketOicPermitCreateForm.scss'
import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'
import { ClientDetailsRows } from '@/pages/shared/ClientDetailsRows'
import { RecordField, RecordFieldGrid, RecordFieldRow } from '@/pages/shared/RecordFieldGrid'
import { displayVolume, formatVolume } from '@/utils/volume'

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
  approvedExemptionVolume?: number | null
  exemptionVolumeRemaining?: number | null
  regionOptions: IdTextOption[]
  defaultRegionNumbers: string[]
  onCancel: () => void
  onCreated: (permitNumber: string) => void
  onUnknownOutcome: (message: string) => void
  /** Places the page actions (Cancel, Save permit) and the form; the page puts the actions on its title row. */
  layout?: (parts: { actions: ReactNode; content: ReactNode }) => ReactNode
}

const defaultLayout = ({ actions, content }: { actions: ReactNode; content: ReactNode }) => (
  <>
    {actions}
    {content}
  </>
)

const MAX_OIC_REQUEST_PIECES = 9_999_999_999
const MAX_OIC_REQUEST_VOLUME_LENGTH = 9

// The fields on each tab. The error summary names the tabs with errors, and each tab counts its own.
const FORM_TABS = [
  {
    label: 'Permit',
    icon: Certificate,
    fields: [
      'permitSubmitDate',
      'permitIssueDate',
      'permitExpiryDate',
      'orgUnitNumber',
      'oicPermitTotalPieces',
      'oicPermitTotalVolume',
      'permitRemarks',
    ],
  },
  {
    label: 'Applicant',
    icon: Enterprise,
    fields: [
      'ownerClientNumber',
      'ownerClientLocation',
      'agentClientNumber',
      'agentClientLocation',
    ],
  },
  {
    label: 'Shipping',
    icon: EarthFilled,
    fields: [
      'destinationCompanyName',
      'destinationCountry',
      'transportType',
      'transportName',
      'estimatedShippingDate',
      'portOfExport',
      'otherPortOfExport',
    ],
  },
  { label: 'Scale', icon: Box, fields: [] },
  { label: 'Documents', icon: DocumentAttachment, fields: [] },
  { label: 'Fees', icon: Currency, fields: [] },
] as const

const SUBMITTER_CLIENT_REQUIRED_MESSAGE = 'Your client must be the owner or the agent.'

const initialForm = (
  defaultRegionNumber: string,
  ownerClientNumber: string,
): BlanketOicPermitForm => {
  const today = formatBusinessIsoDate()
  return {
    permitSubmitDate: today,
    permitIssueDate: '',
    permitExpiryDate: '',
    oicPermitTotalPieces: '',
    oicPermitTotalVolume: '',
    orgUnitNumber: defaultRegionNumber,
    permitRemarks: '',
    ownerClientNumber,
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
  return isoDateFieldError(value) ?? undefined
}

const optionalDateError = (value: string): string | undefined =>
  value.trim() ? (isoDateFieldError(value) ?? undefined) : undefined

const requiredTextError = (value: string, label: string, maxLength: number): string | undefined => {
  const normalized = value.trim()
  if (!normalized) return `${label} is required.`
  return normalized.length <= maxLength
    ? undefined
    : `${label} must be ${maxLength} characters or fewer.`
}

const clientNumberError = (value: string, fieldLabel: string): string | undefined => {
  const normalized = value.trim()
  if (!normalized) return `${fieldLabel} is required.`
  return /^\d{8}$/.test(normalized) ? undefined : `${fieldLabel} number must be exactly 8 digits.`
}

// A location waits on a valid client, which shows its own error until then.
const clientLocationError = (
  location: string,
  clientError: string | undefined,
  fieldLabel: string,
): string | undefined => (clientError || location.trim() ? undefined : `${fieldLabel} is required.`)

const isPopulatedIsoDate = (value: string): boolean => !!value.trim() && isValidIsoDate(value)

const tabFieldsHaveError = (fields: readonly FormField[], errors: FormErrors): boolean =>
  fields.some((field) => !!errors[field])

const firstInvalidTabIndex = (errors: FormErrors): number => {
  const index = FORM_TABS.findIndex(({ fields }) => tabFieldsHaveError(fields, errors))
  return index === -1 ? 2 : index
}

// INTENTIONAL_LEGACY_DIVERGENCE(SUBMITTER_BOIC_PERMIT_CLIENTS): a Provincial Submitter's own
// client (`submitterClientNumber`) must be the owner, or the agent when they act as one.
const validateForm = (
  form: BlanketOicPermitForm,
  agentUsed: boolean,
  submitterClientNumber: string,
): FormErrors => {
  const submitterIsAgent =
    agentUsed && clientLookupNumbersMatch(form.agentClientNumber, submitterClientNumber)
  const ownerClientError =
    clientNumberError(form.ownerClientNumber, 'Client') ||
    (submitterClientNumber &&
    !submitterIsAgent &&
    !clientLookupNumbersMatch(form.ownerClientNumber, submitterClientNumber)
      ? SUBMITTER_CLIENT_REQUIRED_MESSAGE
      : undefined)
  const errors: FormErrors = {
    permitSubmitDate: requiredDateError(form.permitSubmitDate, 'Submit date'),
    permitIssueDate: optionalDateError(form.permitIssueDate),
    permitExpiryDate: optionalDateError(form.permitExpiryDate),
    orgUnitNumber: form.orgUnitNumber.trim() ? undefined : 'Region is required.',
    ownerClientNumber: ownerClientError,
    ownerClientLocation: clientLocationError(
      form.ownerClientLocation,
      ownerClientError,
      'Client location',
    ),
    destinationCompanyName: form.destinationCompanyName.trim()
      ? requiredTextError(form.destinationCompanyName, 'Purchaser', 52)
      : 'Purchaser is required. Enter company name.',
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
        ? requiredTextError(form.otherPortOfExport, 'Other port of export name', 34)
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
    errors.agentClientNumber = clientNumberError(form.agentClientNumber, 'Agent client')
    errors.agentClientLocation = clientLocationError(
      form.agentClientLocation,
      errors.agentClientNumber,
      'Agent client location',
    )
  }

  return Object.fromEntries(Object.entries(errors).filter(([, error]) => Boolean(error)))
}

const BlanketOicPermitCreateForm = ({
  exemptionNumber,
  approvedExemptionVolume,
  exemptionVolumeRemaining,
  regionOptions,
  defaultRegionNumbers,
  onCancel,
  onCreated,
  onUnknownOutcome,
  layout = defaultLayout,
}: BlanketOicPermitCreateFormProps) => {
  const { canPerform, capabilities } = useAuth()
  const canReviewPermits = canPerform('/permitsReview')
  // A Provincial Submitter's own client starts as the owner and must stay the owner or the agent.
  const submitterClientNumber = hasProvincialSubmitterRole(capabilities.roles)
    ? (capabilities.forestClientNumber?.trim() ?? '')
    : ''
  const location = useLocation()
  const exemptionReturnTo = readDetailReturnTo(location.state)
  const regionContext = resolveBlanketOicRegionContext(regionOptions, defaultRegionNumbers)
  const [form, setForm] = useState(() =>
    initialForm(regionContext.defaultRegionNumber, submitterClientNumber),
  )
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
  const formSectionRef = useRef<HTMLElement>(null)
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
  const formErrors = validateForm(form, agentUsed, submitterClientNumber)
  const invalidTabLabels = showValidationErrors
    ? FORM_TABS.filter(({ fields }) => tabFieldsHaveError(fields, formErrors)).map(
        ({ label }) => label,
      )
    : []
  const invalidTabsText =
    invalidTabLabels.length > 1
      ? `${invalidTabLabels.slice(0, -1).join(', ')} and ${invalidTabLabels.at(-1)}`
      : invalidTabLabels[0]
  const invalidTabsMessage =
    invalidTabLabels.length === 0
      ? ''
      : invalidTabLabels.length === 1
        ? `Complete the required fields in the ${invalidTabsText} tab.`
        : `Complete the required fields in ${invalidTabsText} tabs.`
  // Field errors show on their fields; the summary lists only problems that have no field.
  const errorMessages = Array.from(
    new Set(
      [
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
  const [summaryMessage, ...listedErrorMessages] = invalidTabsMessage
    ? [invalidTabsMessage, ...errorMessages]
    : errorMessages
  const isDraftDirty = formEdited && !formValuesEqual({ form, agentUsed }, draftBaselineRef.current)

  // A failed save shows the first tab with an error and moves focus to the error summary, so
  // keyboard and screen reader users hear why Save did nothing.
  useEffect(() => {
    if (failedSubmitCount === 0) return
    errorSummaryRef.current?.focus()
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

  // A client's lookups name the client in the other slot, which lets a Provincial Submitter look
  // up the owner they act for, or the agent they name.
  const counterpartyClientNumber = (kind: ClientKind): string =>
    (kind === 'owner'
      ? currentFormRef.current.agentClientNumber
      : currentFormRef.current.ownerClientNumber
    ).trim()

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
      const counterparty = counterpartyClientNumber(kind)
      const locations = await fetchApplicationClientLocations(clientNumber, kind, '', counterparty)
      if (!isLatestRequest()) {
        return currentSelection()
      }
      const selectableLocations = locations.filter(isSelectableClientLocation)
      const selectedLocation = resolveClientLocationCode(
        selectableLocations,
        currentSelection().locationCode,
      )
      const clientData = selectedLocation
        ? await fetchApplicationClientData(clientNumber, selectedLocation, {
            counterpartyClientNumber: counterparty,
          })
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

  // The submitter's own client starts as the owner, so its locations load with the page. The
  // location chosen for it belongs to the initial draft, even if the user started editing first.
  const prefillSubmitterOwner = useEffectEvent(() => {
    if (!submitterClientNumber) return
    void requestClientLocations('owner', submitterClientNumber).then(
      ({ clientNumber, locationCode }) => {
        const baseline = draftBaselineRef.current
        if (
          clientNumber !== submitterClientNumber ||
          baseline.form.ownerClientNumber !== submitterClientNumber ||
          baseline.form.ownerClientLocation
        ) {
          return
        }
        draftBaselineRef.current = {
          ...baseline,
          form: { ...baseline.form, ownerClientLocation: locationCode },
        }
      },
    )
  })
  useEffect(() => prefillSubmitterOwner(), [])

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
      const clientData = await fetchApplicationClientData(clientNumber, locationCode, {
        counterpartyClientNumber: counterpartyClientNumber(kind),
      })
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

  const createPermit = async (): Promise<boolean> => {
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
      const errors = validateForm(requestForm, agentUsed, submitterClientNumber)
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
          'The permit response did not include a valid permit number. Reload this exemption and check the Permits tab before trying again.',
          requestForm,
        )
        return false
      }
      setForm(requestForm)
      markDraftSaved(requestForm)
      setCreatedPermitNumber(permitNumber)
      return true
    } catch (error) {
      console.error(error)
      reportUnknownOutcome(
        'The permit request outcome could not be confirmed. Reload this exemption and check the Permits tab before trying again.',
      )
      return false
    } finally {
      createPermitInFlightRef.current = false
      setSaving(false)
    }
  }

  const fieldError = (field: FormField): string | undefined =>
    showValidationErrors ? fieldErrorText(formErrors[field]) : undefined

  const close = () => {
    if (!saving) onCancel()
  }

  const actions = (
    <>
      <Button kind="tertiary" size="md" disabled={saving} onClick={close}>
        Cancel
      </Button>
      <Button
        kind="primary"
        size="md"
        disabled={saving}
        renderIcon={saving ? PendingIcon : Save}
        onClick={() => void createPermit()}
      >
        {saving ? 'Saving…' : 'Save permit'}
      </Button>
    </>
  )

  const content = (
    <section
      ref={formSectionRef}
      aria-label="Blanket OIC permit details"
      className="boic-permit-create-form"
    >
      {summaryMessage ? (
        <div ref={errorSummaryRef} tabIndex={-1} role="group" aria-label="Permit needs attention">
          <InlineNotification
            kind="error"
            role="alert"
            title={invalidTabLabels.length > 0 ? 'Cannot save yet.' : 'Permit needs attention'}
            subtitle={summaryMessage}
            lowContrast
            hideCloseButton
          >
            {listedErrorMessages.length > 0 && (
              <ul className="boic-permit-error-list">
                {listedErrorMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </InlineNotification>
        </div>
      ) : (
        <InlineNotification
          kind="info"
          title="The permit number is assigned when you save."
          subtitle="Scale, Documents and Fees can be added after that."
          lowContrast
          hideCloseButton
        />
      )}
      <Tabs
        selectedIndex={selectedTabIndex}
        onChange={({ selectedIndex }) => setSelectedTabIndex(selectedIndex)}
      >
        <TabList
          aria-label="Blanket OIC permit sections"
          contained
          className="application-tabs__list application-detail-tab-list"
        >
          {FORM_TABS.map(({ label, icon, fields }) => {
            const outstanding = showValidationErrors
              ? fields.filter((field: FormField) => !!formErrors[field]).length
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
                  <Tag
                    className="boic-permit-tab-error-count"
                    type="red"
                    size="sm"
                    aria-hidden="true"
                  >
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
              <DetailCardTitle icon={Certificate}>Permit details</DetailCardTitle>
              <RequiredFieldsLegend className="boic-permit-required-hint" />
              <fieldset className="legacy-form-fieldset boic-permit-details">
                <legend className="cds--visually-hidden">Permit details</legend>
                <RecordFieldGrid editing>
                  <RecordFieldRow>
                    {/* New permits are always created Active, so Status is a fixed value. */}
                    <RecordField label="Status" value="Active" />
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordField
                      label="Exemption number"
                      value={
                        <Link
                          className="cds--link"
                          to={
                            exemptionReturnTo?.to ??
                            `/provincial/exemption/${encodeURIComponent(exemptionNumber)}`
                          }
                          state={exemptionReturnTo?.state}
                        >
                          {exemptionNumber}
                        </Link>
                      }
                    />
                    <RecordField label="Exemption type" value="Blanket OIC" />
                    <RecordField
                      label="Region"
                      span="wide"
                      edit={
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
                      }
                    />
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordField
                      label="Submit date"
                      edit={
                        <IsoDatePicker
                          id="boic-permit-submit-date"
                          labelText={requiredLabel('Submit date', canReviewPermits)}
                          required={canReviewPermits}
                          disabled={!canReviewPermits}
                          value={form.permitSubmitDate}
                          invalid={!!fieldError('permitSubmitDate')}
                          invalidText={fieldError('permitSubmitDate')}
                          onChange={(value) => setField('permitSubmitDate', value)}
                        />
                      }
                    />
                    <RecordField
                      label="Issued date"
                      edit={
                        <IsoDatePicker
                          id="boic-permit-issue-date"
                          labelText="Issued date"
                          disabled={!canReviewPermits}
                          value={form.permitIssueDate}
                          invalid={!!fieldError('permitIssueDate')}
                          invalidText={fieldError('permitIssueDate')}
                          onChange={(value) => setField('permitIssueDate', value)}
                        />
                      }
                    />
                    <RecordField
                      label="Expiry date"
                      edit={
                        <IsoDatePicker
                          id="boic-permit-expiry-date"
                          labelText="Expiry date"
                          disabled={!canReviewPermits}
                          value={form.permitExpiryDate}
                          invalid={!!fieldError('permitExpiryDate')}
                          invalidText={fieldError('permitExpiryDate')}
                          onChange={(value) => setField('permitExpiryDate', value)}
                        />
                      }
                    />
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordField
                      label="Total exemption volume (m³)"
                      value={displayVolume(approvedExemptionVolume)}
                    />
                    <RecordField
                      label="Total volume remaining (m³)"
                      value={displayVolume(exemptionVolumeRemaining)}
                    />
                    <RecordField label="Current permit pieces" value={0} />
                    <RecordField label="Current permit volume (m³)" value={formatVolume(0)} />
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordField
                      label="Permit request pieces"
                      edit={
                        <TextInput
                          id="boic-permit-request-pieces"
                          labelText={requiredLabel('Permit request pieces')}
                          aria-required="true"
                          value={form.oicPermitTotalPieces}
                          invalid={!!fieldError('oicPermitTotalPieces')}
                          invalidText={fieldError('oicPermitTotalPieces')}
                          onChange={(event) => setField('oicPermitTotalPieces', event.target.value)}
                        />
                      }
                    />
                    <RecordField
                      label="Permit request volume (m³)"
                      edit={
                        <TextInput
                          id="boic-permit-request-volume"
                          labelText={requiredLabel('Permit request volume (m³)')}
                          aria-required="true"
                          value={form.oicPermitTotalVolume}
                          invalid={!!fieldError('oicPermitTotalVolume')}
                          invalidText={fieldError('oicPermitTotalVolume')}
                          onChange={(event) => setField('oicPermitTotalVolume', event.target.value)}
                        />
                      }
                    />
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordField
                      label="Remarks"
                      span="full"
                      edit={
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
                      }
                    />
                  </RecordFieldRow>
                </RecordFieldGrid>
              </fieldset>
            </Tile>
          </TabPanel>
          <TabPanel className="application-detail-tab-panel">
            <Tile className="create-form-tile application-detail-section" aria-label="Applicant">
              <DetailCardTitle icon={Enterprise}>Applicant details</DetailCardTitle>
              <RequiredFieldsLegend className="boic-permit-required-hint" />
              <fieldset className="legacy-form-fieldset">
                <legend className="cds--visually-hidden">Applicant</legend>
                <h3 className="permit-client-subheading">Owner</h3>
                <RecordFieldGrid editing>
                  <ClientDetailsRows
                    client={{
                      label: 'Client',
                      edit: () => (
                        <ForestClientComboBox
                          id="boic-permit-owner-client"
                          labelText={requiredLabel('Client')}
                          helperText="Enter name, acronym, or client number (min. 3 characters)"
                          value={form.ownerClientNumber}
                          selectedClientName={ownerClientData?.companyName}
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
                      ),
                    }}
                    location={{
                      label: 'Client location',
                      edit: () => (
                        <Select
                          id="boic-permit-owner-location"
                          labelText={requiredLabel('Client location')}
                          aria-required="true"
                          helperText={
                            form.ownerClientNumber.trim()
                              ? undefined
                              : 'Available once a client is selected.'
                          }
                          value={form.ownerClientLocation}
                          invalid={!!fieldError('ownerClientLocation')}
                          invalidText={fieldError('ownerClientLocation')}
                          disabled={
                            ownerLookupLoading || !ownerLocations.some(isSelectableClientLocation)
                          }
                          onChange={(event) =>
                            void selectClientLocation('owner', event.target.value)
                          }
                        >
                          <SelectItem
                            value=""
                            text={ownerLookupLoading ? 'Loading locations' : 'Select location'}
                          />
                          {ownerLocations.filter(isSelectableClientLocation).map((location) => (
                            <SelectItem
                              key={location.locationCode}
                              value={location.locationCode}
                              text={clientLocationLabel(
                                location.locationCode,
                                location.locationName,
                              )}
                            />
                          ))}
                        </Select>
                      ),
                    }}
                    clientData={ownerClientData}
                    isLoading={ownerLookupLoading}
                    showDetails={!!form.ownerClientLocation}
                  />
                </RecordFieldGrid>
                <hr className="application-applicant-divider" />
                <Checkbox
                  id="boic-permit-agent-used"
                  labelText="I'm an agent"
                  checked={agentUsed}
                  onChange={(_, { checked }) => {
                    markFormEdited()
                    const enabled = Boolean(checked)
                    setAgentUsed(enabled)
                    // A submitter acting as agent starts as the agent, so the owner they act for
                    // can be found.
                    if (enabled && submitterClientNumber && !form.agentClientNumber.trim()) {
                      selectClient('agent', submitterClientNumber)
                    }
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
                    <h3
                      id="boic-permit-agent-information-heading"
                      className="permit-client-subheading"
                    >
                      Agent
                    </h3>
                    <RecordFieldGrid editing>
                      <ClientDetailsRows
                        client={{
                          label: 'Agent client',
                          edit: () => (
                            <ForestClientComboBox
                              id="boic-permit-agent-client"
                              labelText={requiredLabel('Agent client')}
                              helperText="Enter name, acronym, or client number (min. 3 characters)"
                              value={form.agentClientNumber}
                              selectedClientName={agentClientData?.companyName}
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
                              onChange={(agentClientNumber) =>
                                selectClient('agent', agentClientNumber)
                              }
                            />
                          ),
                        }}
                        location={{
                          label: 'Agent client location',
                          edit: () => (
                            <Select
                              id="boic-permit-agent-location"
                              labelText={requiredLabel('Agent client location')}
                              aria-required="true"
                              helperText={
                                form.agentClientNumber.trim()
                                  ? undefined
                                  : 'Available once a client is selected.'
                              }
                              value={form.agentClientLocation}
                              invalid={!!fieldError('agentClientLocation')}
                              invalidText={fieldError('agentClientLocation')}
                              disabled={
                                agentLookupLoading ||
                                !agentLocations.some(isSelectableClientLocation)
                              }
                              onChange={(event) =>
                                void selectClientLocation('agent', event.target.value)
                              }
                            >
                              <SelectItem
                                value=""
                                text={agentLookupLoading ? 'Loading locations' : 'Select location'}
                              />
                              {agentLocations.filter(isSelectableClientLocation).map((location) => (
                                <SelectItem
                                  key={location.locationCode}
                                  value={location.locationCode}
                                  text={clientLocationLabel(
                                    location.locationCode,
                                    location.locationName,
                                  )}
                                />
                              ))}
                            </Select>
                          ),
                        }}
                        clientData={agentClientData}
                        isLoading={agentLookupLoading}
                        showDetails={!!form.agentClientLocation}
                      />
                    </RecordFieldGrid>
                  </section>
                )}
              </fieldset>
            </Tile>
          </TabPanel>
          <TabPanel className="application-detail-tab-panel">
            <Tile className="create-form-tile application-detail-section" aria-label="Shipping">
              <DetailCardTitle icon={EarthFilled}>Shipping details</DetailCardTitle>
              <RequiredFieldsLegend className="boic-permit-required-hint" />
              <fieldset className="legacy-form-fieldset">
                <legend className="cds--visually-hidden">Shipping</legend>
                <RecordFieldGrid editing>
                  <RecordFieldRow>
                    <RecordField
                      label="Purchaser"
                      span="wide"
                      edit={
                        <TextInput
                          id="boic-permit-destination-company"
                          labelText={requiredLabel('Purchaser')}
                          aria-required="true"
                          helperText="Company name"
                          value={form.destinationCompanyName}
                          invalid={!!fieldError('destinationCompanyName')}
                          invalidText={fieldError('destinationCompanyName')}
                          maxLength={52}
                          onChange={(event) =>
                            setField('destinationCompanyName', event.target.value)
                          }
                        />
                      }
                    />
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordField
                      label="Final destination country"
                      span="wide"
                      edit={
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
                      }
                    />
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordField
                      label="Transport type"
                      edit={
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
                      }
                    />
                    <RecordField
                      label="Transport name"
                      edit={
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
                      }
                    />
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordField
                      label="Estimated shipping date"
                      edit={
                        <IsoDatePicker
                          id="boic-permit-estimated-shipping-date"
                          labelText={requiredLabel('Estimated shipping date')}
                          required
                          value={form.estimatedShippingDate}
                          invalid={!!fieldError('estimatedShippingDate')}
                          invalidText={fieldError('estimatedShippingDate')}
                          onChange={(value) => setField('estimatedShippingDate', value)}
                        />
                      }
                    />
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordField
                      label="Customs port of export"
                      edit={
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
                      }
                    />
                    <RecordField
                      label="Other port of export name"
                      hidden={form.portOfExport.trim().toUpperCase() !== 'OT'}
                      edit={
                        <TextInput
                          id="boic-permit-other-port"
                          labelText={requiredLabel('Other port of export name')}
                          aria-required="true"
                          value={form.otherPortOfExport}
                          invalid={!!fieldError('otherPortOfExport')}
                          invalidText={fieldError('otherPortOfExport')}
                          maxLength={34}
                          onChange={(event) => setField('otherPortOfExport', event.target.value)}
                        />
                      }
                    />
                  </RecordFieldRow>
                </RecordFieldGrid>
              </fieldset>
            </Tile>
          </TabPanel>
          <TabPanel className="application-detail-tab-panel application-detail-tab-panel--empty">
            <p className="unsaved-tab-note">Available after the permit is saved.</p>
          </TabPanel>
          <TabPanel className="application-detail-tab-panel application-detail-tab-panel--empty">
            <p className="unsaved-tab-note">Available after the permit is saved.</p>
          </TabPanel>
          <TabPanel className="application-detail-tab-panel application-detail-tab-panel--empty">
            <p className="unsaved-tab-note">Available after the permit is saved.</p>
          </TabPanel>
        </TabPanels>
      </Tabs>
      <UnsavedChangesGuard
        isDirty={isDraftDirty}
        isBusy={saving}
        onDiscard={discardDraft}
        discardCopy={discardNewRecordCopy('permit')}
        subject="this new Blanket OIC permit"
      />
    </section>
  )

  return layout({ actions, content })
}

export default BlanketOicPermitCreateForm
