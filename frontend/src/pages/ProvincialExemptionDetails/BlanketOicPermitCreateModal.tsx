import { useEffect, useState } from 'react'
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
import { clientLocationLabel } from '@/pages/shared/application-form-utils'
import { isValidIsoDate } from '@/pages/shared/create-form-utils'
import type { IdTextOption } from '@/pages/shared/search-query-utils'
import {
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
    destinationCompanyName: requiredTextError(
      form.destinationCompanyName,
      'Destination company',
      52,
    ),
    destinationCountry:
      form.destinationCountry.trim().length === 2 ? undefined : 'Destination country is required.',
    transportType:
      form.transportType.trim().length === 1 ? undefined : 'Transport type is required.',
    transportName: requiredTextError(form.transportName, 'Transport name', 26),
    estimatedShippingDate: requiredDateError(form.estimatedShippingDate, 'Estimated shipping date'),
    portOfExport: form.portOfExport.trim().length === 2 ? undefined : 'Port of export is required.',
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

  const loadClientLocations = async (kind: ClientKind): Promise<string> => {
    const clientNumber =
      kind === 'owner' ? form.ownerClientNumber.trim() : form.agentClientNumber.trim()
    const setLocations = kind === 'owner' ? setOwnerLocations : setAgentLocations
    const setLoading = kind === 'owner' ? setOwnerLookupLoading : setAgentLookupLoading
    const setAttempted = kind === 'owner' ? setOwnerLookupAttempted : setAgentLookupAttempted
    const locationField: FormField =
      kind === 'owner' ? 'ownerClientLocation' : 'agentClientLocation'

    setAttempted(true)
    if (!/^\d{8}$/.test(clientNumber)) {
      setLocations([])
      setField(locationField, '')
      return ''
    }

    setLoading(true)
    try {
      const locations = await fetchExemptionClientLocations(clientNumber)
      const selectedLocation =
        locations.find(({ selected }) => selected)?.locationCode ?? locations[0]?.locationCode ?? ''
      setLocations(locations)
      setForm((current) => {
        const currentClientNumber =
          kind === 'owner' ? current.ownerClientNumber.trim() : current.agentClientNumber.trim()
        return currentClientNumber === clientNumber
          ? { ...current, [locationField]: selectedLocation }
          : current
      })
      return selectedLocation
    } catch (error) {
      console.error(error)
      setLocations([])
      setField(locationField, '')
      return ''
    } finally {
      setLoading(false)
    }
  }

  const createPermit = async () => {
    if (saving) return
    setShowValidationErrors(true)
    setActionError('')

    let ownerLocation = form.ownerClientLocation.trim()
    let agentLocation = agentUsed ? form.agentClientLocation.trim() : ''
    if (!ownerLocation && /^\d{8}$/.test(form.ownerClientNumber.trim())) {
      ownerLocation = await loadClientLocations('owner')
    }
    if (agentUsed && !agentLocation && /^\d{8}$/.test(form.agentClientNumber.trim())) {
      agentLocation = await loadClientLocations('agent')
    }

    const requestForm = {
      ...form,
      ownerClientLocation: ownerLocation,
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
            labelText="Submit date"
            value={form.permitSubmitDate}
            invalid={!!fieldError('permitSubmitDate')}
            invalidText={fieldError('permitSubmitDate')}
            onChange={(value) => setField('permitSubmitDate', value)}
          />
          <IsoDatePicker
            id="boic-permit-issue-date"
            labelText="Issue date"
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
          <TextInput
            id="boic-permit-request-pieces"
            labelText="Permit Request Pieces"
            value={form.oicPermitTotalPieces}
            invalid={!!fieldError('oicPermitTotalPieces')}
            invalidText={fieldError('oicPermitTotalPieces')}
            onChange={(event) => setField('oicPermitTotalPieces', event.target.value)}
          />
          <TextInput
            id="boic-permit-request-volume"
            labelText="Permit Request Volume (m³)"
            value={form.oicPermitTotalVolume}
            invalid={!!fieldError('oicPermitTotalVolume')}
            invalidText={fieldError('oicPermitTotalVolume')}
            onChange={(event) => setField('oicPermitTotalVolume', event.target.value)}
          />
          <Select
            id="boic-permit-region"
            labelText="Region"
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
            labelText="Owner client number"
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
              setField('ownerClientNumber', event.target.value)
              setField('ownerClientLocation', '')
              setOwnerLocations([])
              setOwnerLookupAttempted(false)
            }}
            onBlur={() => void loadClientLocations('owner')}
          />
          <Select
            id="boic-permit-owner-location"
            labelText="Owner location"
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
                labelText="Agent client number"
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
                  setField('agentClientNumber', event.target.value)
                  setField('agentClientLocation', '')
                  setAgentLocations([])
                  setAgentLookupAttempted(false)
                }}
                onBlur={() => void loadClientLocations('agent')}
              />
              <Select
                id="boic-permit-agent-location"
                labelText="Agent location"
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
            labelText="Destination company"
            value={form.destinationCompanyName}
            invalid={!!fieldError('destinationCompanyName')}
            invalidText={fieldError('destinationCompanyName')}
            maxLength={52}
            onChange={(event) => setField('destinationCompanyName', event.target.value)}
          />
          <Select
            id="boic-permit-destination-country"
            labelText="Destination country"
            value={form.destinationCountry}
            invalid={!!fieldError('destinationCountry')}
            invalidText={fieldError('destinationCountry')}
            disabled={shippingReferencesLoading || !shippingReferences}
            onChange={(event) => setField('destinationCountry', event.target.value)}
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
            id="boic-permit-transport-type"
            labelText="Transport type"
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
            labelText="Transport name"
            value={form.transportName}
            invalid={!!fieldError('transportName')}
            invalidText={fieldError('transportName')}
            maxLength={26}
            onChange={(event) => setField('transportName', event.target.value)}
          />
          <IsoDatePicker
            id="boic-permit-estimated-shipping-date"
            labelText="Estimated shipping date"
            value={form.estimatedShippingDate}
            invalid={!!fieldError('estimatedShippingDate')}
            invalidText={fieldError('estimatedShippingDate')}
            onChange={(value) => setField('estimatedShippingDate', value)}
          />
          <Select
            id="boic-permit-port-of-export"
            labelText="Port of export"
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
            <SelectItem value="" text="Select a port of export" />
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
              labelText="Other port of export"
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
