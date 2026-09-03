import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Checkbox,
  InlineNotification,
  Select,
  SelectItem,
  TextArea,
  TextInput,
} from '@carbon/react'
import IsoDatePicker from '@/components/IsoDatePicker'
import Modal from '@/components/Modal'
import PendingIcon from '@/components/PendingIcon'
import {
  CLIENT_LOOKUP_UNAVAILABLE_MESSAGE,
  clientLocationLabel,
} from '@/pages/shared/application-form-utils'
import { isValidIsoDate } from '@/pages/shared/create-form-utils'
import type { IdTextOption } from '@/pages/shared/search-query-utils'
import {
  fetchExemptionClientData,
  fetchExemptionClientLocations,
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

type ClientKind = 'owner' | 'agent'

type BlanketOicPermitCreateModalProps = {
  open: boolean
  exemptionNumber: string
  exemptionExpiryDate: string
  regionOptions: IdTextOption[]
  defaultRegionNumbers: string[]
  onClose: () => void
  onBusyChange: (busy: boolean) => void
  onCreated: (permitNumber: string) => void
  onUnknownOutcome: (message: string) => void
}

const MAX_OIC_REQUEST_PIECES = 9_999_999_999
const MAX_OIC_REQUEST_VOLUME_LENGTH = 9

const initialForm = (
  exemptionExpiryDate: string,
  regionOptions: IdTextOption[],
  defaultRegionNumbers: string[],
): BlanketOicPermitForm => {
  const today = formatBusinessIsoDate()
  const defaultRegion =
    defaultRegionNumbers.find((id) => regionOptions.some((option) => option.id === id)) ?? ''
  return {
    permitSubmitDate: today,
    permitIssueDate: today,
    permitExpiryDate: exemptionExpiryDate,
    oicPermitTotalPieces: '',
    oicPermitTotalVolume: '',
    orgUnitNumber: defaultRegion,
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

const validateForm = (form: BlanketOicPermitForm, agentUsed: boolean): FormErrors => {
  const errors: FormErrors = {
    permitSubmitDate: requiredDateError(form.permitSubmitDate, 'Submit date'),
    permitIssueDate: requiredDateError(form.permitIssueDate, 'Issue date'),
    permitExpiryDate: requiredDateError(form.permitExpiryDate, 'Expiry date'),
    orgUnitNumber: form.orgUnitNumber.trim() ? undefined : 'Region is required.',
    ownerClientNumber: clientNumberError(form.ownerClientNumber, 'Owner client number'),
    ownerClientLocation: form.ownerClientLocation.trim()
      ? undefined
      : 'Owner location is required.',
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
        ? requiredTextError(form.otherPortOfExport, 'Other port of export', 34)
        : undefined,
  }

  const pieces = form.oicPermitTotalPieces.trim()
  if (!/^[1-9]\d*$/.test(pieces) || Number(pieces) > MAX_OIC_REQUEST_PIECES) {
    errors.oicPermitTotalPieces =
      'Permit Request Pieces must be a positive whole number no greater than 9999999999.'
  }

  const volume = form.oicPermitTotalVolume.trim()
  if (
    !/^\d+(?:\.\d{1,2})?$/.test(volume) ||
    Number(volume) <= 0 ||
    volume.length > MAX_OIC_REQUEST_VOLUME_LENGTH
  ) {
    errors.oicPermitTotalVolume =
      'Permit Request Volume must be positive, 9 characters or fewer, with at most 2 decimal places.'
  }

  if (form.permitRemarks.trim().length > 254) {
    errors.permitRemarks = 'Remarks must be 254 characters or fewer.'
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
    errors.permitIssueDate = 'Issue date must be after or equal to submit date.'
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

const BlanketOicPermitCreateModal = ({
  open,
  exemptionNumber,
  exemptionExpiryDate,
  regionOptions,
  defaultRegionNumbers,
  onClose,
  onBusyChange,
  onCreated,
  onUnknownOutcome,
}: BlanketOicPermitCreateModalProps) => {
  const [form, setForm] = useState(() =>
    initialForm(exemptionExpiryDate, regionOptions, defaultRegionNumbers),
  )
  const [agentUsed, setAgentUsed] = useState(false)
  const [ownerLocations, setOwnerLocations] = useState<ApplicationClientLocation[]>([])
  const [agentLocations, setAgentLocations] = useState<ApplicationClientLocation[]>([])
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
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [clientLookupFailures, setClientLookupFailures] = useState<ReadonlySet<ClientKind>>(
    () => new Set(),
  )
  const currentFormRef = useRef(form)
  const ownerLookupRequestRef = useRef(0)
  const agentLookupRequestRef = useRef(0)
  currentFormRef.current = form
  const formErrors = validateForm(form, agentUsed)

  useEffect(() => {
    if (!open) return
    let active = true
    void fetchShippingReferenceOptions()
      .then((options) => {
        if (!active) return
        setShippingReferences(options)
        setForm((current) => ({
          ...current,
          destinationCountry:
            current.destinationCountry ||
            options.countries.find(({ code }) => code === 'US')?.code ||
            options.countries[0]?.code ||
            '',
          transportType:
            current.transportType ||
            options.transportTypes.find(({ code }) => code === 'B')?.code ||
            options.transportTypes[0]?.code ||
            '',
          portOfExport:
            current.portOfExport ||
            options.ports.find(({ code }) => code === 'CB')?.code ||
            options.ports[0]?.code ||
            '',
        }))
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
  }, [open])

  const setField = (field: FormField, value: string) => {
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
  ): Promise<{ clientNumber: string; locationCode: string }> => {
    const clientNumber =
      kind === 'owner' ? form.ownerClientNumber.trim() : form.agentClientNumber.trim()
    const setLocations = kind === 'owner' ? setOwnerLocations : setAgentLocations
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
      setField(locationField, '')
      return { clientNumber, locationCode: '' }
    }

    setLoading(true)
    try {
      const locations = await fetchExemptionClientLocations(clientNumber)
      if (!isLatestRequest()) {
        return currentSelection()
      }
      const selectedLocation =
        locations.find(({ selected }) => selected)?.locationCode ?? locations[0]?.locationCode ?? ''
      const clientData = selectedLocation
        ? await fetchExemptionClientData(clientNumber, selectedLocation)
        : null
      if (!isLatestRequest()) {
        return currentSelection()
      }
      const confirmedClientNumber = clientData?.clientNumber.trim() || clientNumber
      updateClientLookupFailure(kind, false)
      setLocations(locations)
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

  const createPermit = async () => {
    if (saving) return
    setShowValidationErrors(true)
    setActionError('')

    let ownerClientNumber = form.ownerClientNumber.trim()
    let ownerLocation = form.ownerClientLocation.trim()
    let agentClientNumber = agentUsed ? form.agentClientNumber.trim() : ''
    let agentLocation = agentUsed ? form.agentClientLocation.trim() : ''
    if ((!ownerLocation || ownerClientNumber.length < 8) && /^\d{1,8}$/.test(ownerClientNumber)) {
      const confirmedOwner = await loadClientLocations('owner')
      ownerClientNumber = confirmedOwner.clientNumber
      ownerLocation = confirmedOwner.locationCode
    }
    if (
      agentUsed &&
      (!agentLocation || agentClientNumber.length < 8) &&
      /^\d{1,8}$/.test(agentClientNumber)
    ) {
      const confirmedAgent = await loadClientLocations('agent')
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
      setActionError(Object.values(errors)[0] ?? 'Fix the validation errors before creating.')
      return
    }
    if (!shippingReferences || shippingReferencesLoading || regionOptions.length === 0) {
      setActionError(
        shippingReferencesError || 'Required region or shipping options are unavailable.',
      )
      return
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

    setSaving(true)
    onBusyChange(true)
    try {
      const result = await addPermitDetail(request)
      if (!result.success) {
        setActionError(result.errors.join(' ') || result.message || 'Unable to create the permit.')
        return
      }
      const permitNumber = result.permitNumber.trim()
      if (!/^[1-9]\d*$/.test(permitNumber)) {
        onUnknownOutcome(
          'The permit response did not include a valid permit number. Reload this exemption and check Related permits before trying again.',
        )
        return
      }
      onCreated(permitNumber)
    } catch (error) {
      console.error(error)
      onUnknownOutcome(
        'The permit request outcome could not be confirmed. Reload this exemption and check Related permits before trying again.',
      )
    } finally {
      setSaving(false)
      onBusyChange(false)
    }
  }

  const fieldError = (field: FormField): string | undefined =>
    showValidationErrors ? formErrors[field] : undefined

  const close = () => {
    if (!saving) onClose()
  }

  return (
    <Modal
      open={open}
      passiveModal
      size="lg"
      modalHeading="Apply for new Blanket OIC permit"
      aria-label="Apply for new Blanket OIC permit"
      preventCloseOnClickOutside
      onRequestClose={close}
    >
      <p>
        Enter the required permit, owner, and shipping details for Blanket OIC exemption{' '}
        {exemptionNumber}. The permit number is assigned only after a successful save.
      </p>
      {shippingReferencesError && (
        <InlineNotification
          kind="error"
          title="Shipping options unavailable"
          subtitle={shippingReferencesError}
          lowContrast
          hideCloseButton
        />
      )}
      {clientLookupFailures.size > 0 && (
        <InlineNotification
          kind="error"
          title="Client details unavailable"
          subtitle={CLIENT_LOOKUP_UNAVAILABLE_MESSAGE}
          lowContrast
          onCloseButtonClick={() => setClientLookupFailures(new Set())}
        />
      )}
      {actionError && (
        <InlineNotification
          kind="error"
          title="Permit not created"
          subtitle={actionError}
          lowContrast
          onCloseButtonClick={() => setActionError('')}
        />
      )}

      <fieldset className="legacy-form-fieldset">
        <legend>Permit</legend>
        <div className="legacy-search-grid">
          <TextInput id="boic-permit-status" labelText="Status" value="Active" disabled />
          <IsoDatePicker
            id="boic-permit-submit-date"
            labelText={requiredLabel('Submit date')}
            value={form.permitSubmitDate}
            invalid={!!fieldError('permitSubmitDate')}
            invalidText={fieldError('permitSubmitDate')}
            onChange={(value) => setField('permitSubmitDate', value)}
          />
          <IsoDatePicker
            id="boic-permit-issue-date"
            labelText={requiredLabel('Issue date')}
            value={form.permitIssueDate}
            invalid={!!fieldError('permitIssueDate')}
            invalidText={fieldError('permitIssueDate')}
            onChange={(value) => setField('permitIssueDate', value)}
          />
          <IsoDatePicker
            id="boic-permit-expiry-date"
            labelText={requiredLabel('Expiry date')}
            value={form.permitExpiryDate}
            invalid={!!fieldError('permitExpiryDate')}
            invalidText={fieldError('permitExpiryDate')}
            onChange={(value) => setField('permitExpiryDate', value)}
          />
          <TextInput
            id="boic-permit-request-pieces"
            labelText={requiredLabel('Permit Request Pieces')}
            value={form.oicPermitTotalPieces}
            invalid={!!fieldError('oicPermitTotalPieces')}
            invalidText={fieldError('oicPermitTotalPieces')}
            onChange={(event) => setField('oicPermitTotalPieces', event.target.value)}
          />
          <TextInput
            id="boic-permit-request-volume"
            labelText={requiredLabel('Permit Request Volume (m³)')}
            value={form.oicPermitTotalVolume}
            invalid={!!fieldError('oicPermitTotalVolume')}
            invalidText={fieldError('oicPermitTotalVolume')}
            onChange={(event) => setField('oicPermitTotalVolume', event.target.value)}
          />
          <Select
            id="boic-permit-region"
            labelText={requiredLabel('Region')}
            value={form.orgUnitNumber}
            invalid={!!fieldError('orgUnitNumber')}
            invalidText={fieldError('orgUnitNumber')}
            disabled={regionOptions.length === 0}
            onChange={(event) => setField('orgUnitNumber', event.target.value)}
          >
            <SelectItem value="" text="Select a region" />
            {regionOptions.map((option) => (
              <SelectItem key={option.id} value={option.id} text={option.text} />
            ))}
          </Select>
          <TextArea
            id="boic-permit-remarks"
            labelText="Remarks"
            value={form.permitRemarks}
            invalid={!!fieldError('permitRemarks')}
            invalidText={fieldError('permitRemarks')}
            maxLength={254}
            onChange={(event) => setField('permitRemarks', event.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="legacy-form-fieldset">
        <legend>Owner and agent</legend>
        <div className="legacy-search-grid">
          <TextInput
            id="boic-permit-owner-client"
            labelText={requiredLabel('Owner client number')}
            value={form.ownerClientNumber}
            invalid={
              !!fieldError('ownerClientNumber') ||
              (ownerLookupAttempted && !ownerLookupLoading && ownerLocations.length === 0)
            }
            invalidText={
              fieldError('ownerClientNumber') || 'No verified locations were found for this owner.'
            }
            maxLength={8}
            onChange={(event) => {
              ownerLookupRequestRef.current += 1
              setOwnerLookupLoading(false)
              setField('ownerClientNumber', event.target.value)
              setField('ownerClientLocation', '')
              setOwnerLocations([])
              setOwnerLookupAttempted(false)
            }}
            onBlur={() => void loadClientLocations('owner')}
          />
          <Select
            id="boic-permit-owner-location"
            labelText={requiredLabel('Owner location')}
            value={form.ownerClientLocation}
            invalid={!!fieldError('ownerClientLocation')}
            invalidText={fieldError('ownerClientLocation')}
            disabled={ownerLookupLoading || ownerLocations.length === 0}
            onChange={(event) => setField('ownerClientLocation', event.target.value)}
          >
            <SelectItem
              value=""
              text={ownerLookupLoading ? 'Loading locations' : 'Select an owner location'}
            />
            {ownerLocations.map((location) => (
              <SelectItem
                key={location.locationCode}
                value={location.locationCode}
                text={clientLocationLabel(location.locationCode, location.locationName)}
              />
            ))}
          </Select>
          <Checkbox
            id="boic-permit-agent-used"
            labelText="An agent is acting for the owner"
            checked={agentUsed}
            onChange={(_, { checked }) => {
              const enabled = Boolean(checked)
              setAgentUsed(enabled)
              if (!enabled) {
                agentLookupRequestRef.current += 1
                setAgentLookupLoading(false)
                updateClientLookupFailure('agent', false)
                setField('agentClientNumber', '')
                setField('agentClientLocation', '')
                setAgentLocations([])
                setAgentLookupAttempted(false)
              }
            }}
          />
          {agentUsed && (
            <>
              <TextInput
                id="boic-permit-agent-client"
                labelText={requiredLabel('Agent client number')}
                value={form.agentClientNumber}
                invalid={
                  !!fieldError('agentClientNumber') ||
                  (agentLookupAttempted && !agentLookupLoading && agentLocations.length === 0)
                }
                invalidText={
                  fieldError('agentClientNumber') ||
                  'No verified locations were found for this agent.'
                }
                maxLength={8}
                onChange={(event) => {
                  agentLookupRequestRef.current += 1
                  setAgentLookupLoading(false)
                  setField('agentClientNumber', event.target.value)
                  setField('agentClientLocation', '')
                  setAgentLocations([])
                  setAgentLookupAttempted(false)
                }}
                onBlur={() => void loadClientLocations('agent')}
              />
              <Select
                id="boic-permit-agent-location"
                labelText={requiredLabel('Agent location')}
                value={form.agentClientLocation}
                invalid={!!fieldError('agentClientLocation')}
                invalidText={fieldError('agentClientLocation')}
                disabled={agentLookupLoading || agentLocations.length === 0}
                onChange={(event) => setField('agentClientLocation', event.target.value)}
              >
                <SelectItem
                  value=""
                  text={agentLookupLoading ? 'Loading locations' : 'Select an agent location'}
                />
                {agentLocations.map((location) => (
                  <SelectItem
                    key={location.locationCode}
                    value={location.locationCode}
                    text={clientLocationLabel(location.locationCode, location.locationName)}
                  />
                ))}
              </Select>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="legacy-form-fieldset">
        <legend>Shipping</legend>
        <div className="legacy-search-grid">
          <TextInput
            id="boic-permit-destination-company"
            labelText={requiredLabel('Purchaser')}
            value={form.destinationCompanyName}
            invalid={!!fieldError('destinationCompanyName')}
            invalidText={fieldError('destinationCompanyName')}
            maxLength={52}
            onChange={(event) => setField('destinationCompanyName', event.target.value)}
          />
          <Select
            id="boic-permit-destination-country"
            labelText={requiredLabel('Final destination country')}
            value={form.destinationCountry}
            invalid={!!fieldError('destinationCountry')}
            invalidText={fieldError('destinationCountry')}
            disabled={shippingReferencesLoading || !shippingReferences}
            onChange={(event) => setField('destinationCountry', event.target.value)}
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
          <Select
            id="boic-permit-transport-type"
            labelText={requiredLabel('Transport type')}
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
            value={form.transportName}
            invalid={!!fieldError('transportName')}
            invalidText={fieldError('transportName')}
            maxLength={26}
            onChange={(event) => setField('transportName', event.target.value)}
          />
          <IsoDatePicker
            id="boic-permit-estimated-shipping-date"
            labelText={requiredLabel('Estimated shipping date')}
            value={form.estimatedShippingDate}
            invalid={!!fieldError('estimatedShippingDate')}
            invalidText={fieldError('estimatedShippingDate')}
            onChange={(value) => setField('estimatedShippingDate', value)}
          />
          <Select
            id="boic-permit-port-of-export"
            labelText={requiredLabel('Customs port of export')}
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
              labelText={requiredLabel('Other port of export')}
              value={form.otherPortOfExport}
              invalid={!!fieldError('otherPortOfExport')}
              invalidText={fieldError('otherPortOfExport')}
              maxLength={34}
              onChange={(event) => setField('otherPortOfExport', event.target.value)}
            />
          )}
        </div>
      </fieldset>

      <div className="permit-creation-confirmation-modal__actions">
        <Button kind="tertiary" disabled={saving} onClick={close}>
          Cancel
        </Button>
        <Button
          kind="primary"
          disabled={
            saving || shippingReferencesLoading || !shippingReferences || regionOptions.length === 0
          }
          renderIcon={saving ? PendingIcon : undefined}
          onClick={() => void createPermit()}
        >
          {saving ? 'Creating…' : 'Create permit'}
        </Button>
      </div>
    </Modal>
  )
}

export default BlanketOicPermitCreateModal
