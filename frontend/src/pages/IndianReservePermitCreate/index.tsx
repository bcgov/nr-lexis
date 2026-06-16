import { useEffect, useMemo, useState, type FC } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Column, Grid, TextArea, TextInput, Tile } from '@carbon/react'
import { AppNotification } from '@/components/AppNotification'
import SearchableSelect from '@/components/SearchableSelect'
import CreateDraftHistory from '@/pages/shared/CreateDraftHistory'
import {
  isSelectableClientLocation,
  resolveClientLocationCode,
} from '@/pages/shared/application-form-utils'
import {
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
  mergeCreateDraftPayload,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import {
  deleteCreateDraft,
  listCreateDrafts,
  saveCreateDraft,
  type CreateDraftRecord,
} from '@/service/create-draft-service'
import {
  fetchApplicationClientLocations,
  type ApplicationClientLocation,
} from '@/service/application-client-lookup-service'
import IsoDatePicker from '@/components/IsoDatePicker'
import { submitIndianReservePermitCreate } from '@/service/create-submit-service'
import { fetchReportOptions, type SearchOption } from '@/service/search-options-service'

type IndianReservePermitCreateForm = {
  permitNumber: string
  packageNumber: string
  clientNumber: string
  clientLocation: string
  region: string
  applicationDate: string
  permitIssueDate: string
  estimatedShippingDate: string
  destinationCountry: string
  transportTypeCode: string
  transportName: string
  portOfExport: string
  otherPortOfExport: string
  remarks: string
}

type IndianReservePermitCreateField = keyof IndianReservePermitCreateForm & string

const MODULE_KEY = 'indian-reserve-permit'

const INITIAL_FORM: IndianReservePermitCreateForm = {
  permitNumber: '',
  packageNumber: '',
  clientNumber: '',
  clientLocation: '',
  region: '',
  applicationDate: '',
  permitIssueDate: '',
  estimatedShippingDate: '',
  destinationCountry: '',
  transportTypeCode: '',
  transportName: '',
  portOfExport: '',
  otherPortOfExport: '',
  remarks: '',
}

const buildInitialFormFromQuery = (query: URLSearchParams): IndianReservePermitCreateForm => {
  return {
    ...INITIAL_FORM,
    permitNumber: query.get('permitNumber') ?? '',
    packageNumber: query.get('packageNumber') ?? '',
    clientNumber: query.get('clientNumber') ?? '',
    clientLocation: query.get('clientLocation') ?? '',
    region: query.get('region') ?? query.get('orgUnitNumber') ?? '',
    applicationDate: query.get('applicationDate') ?? '',
    permitIssueDate: query.get('permitIssueDate') ?? '',
    estimatedShippingDate: query.get('estimatedShippingDate') ?? query.get('estShippingDate') ?? '',
    destinationCountry: query.get('destinationCountry') ?? '',
    transportTypeCode: query.get('transportTypeCode') ?? '',
    transportName: query.get('transportName') ?? '',
    portOfExport: query.get('portOfExport') ?? '',
    otherPortOfExport: query.get('otherPortOfExport') ?? '',
    remarks: query.get('remarks') ?? '',
  }
}

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
}

const IndianReservePermitCreatePage: FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialForm = useMemo(() => buildInitialFormFromQuery(searchParams), [searchParams])
  const [form, setForm] = useState<IndianReservePermitCreateForm>(() => initialForm)
  const [clientLocations, setClientLocations] = useState<ApplicationClientLocation[]>([])
  const [isLoadingClientLocations, setIsLoadingClientLocations] = useState(false)
  const [regions, setRegions] = useState<SearchOption[]>([])
  const [destinationCountries, setDestinationCountries] = useState<SearchOption[]>([])
  const [portsOfExport, setPortsOfExport] = useState<SearchOption[]>([])
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<IndianReservePermitCreateField>>(
    {},
  )
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchReportOptions()
      setRegions(options.regions.filter((option) => option.value.trim()))
      setDestinationCountries(
        options.allDestinationCountries.filter((option) => option.value.trim()),
      )
      setPortsOfExport(options.portsOfExport.filter((option) => option.value.trim()))
    }

    void loadOptions()
  }, [])

  useEffect(() => {
    const clientNumber = form.clientNumber.trim()
    let isActive = true

    if (!clientNumber) {
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setClientLocations([])
        setForm((current) =>
          current.clientLocation === '' ? current : { ...current, clientLocation: '' },
        )
        setIsLoadingClientLocations(false)
      })

      return () => {
        isActive = false
      }
    }

    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingClientLocations(true)
      }
    })

    void fetchApplicationClientLocations(clientNumber)
      .then((locations) => {
        if (!isActive) {
          return
        }

        setClientLocations(locations)
        setForm((current) => {
          if (current.clientNumber.trim() !== clientNumber) {
            return current
          }

          const nextClientLocation = resolveClientLocationCode(locations, current.clientLocation)
          return current.clientLocation === nextClientLocation
            ? current
            : { ...current, clientLocation: nextClientLocation }
        })
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingClientLocations(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [form.clientNumber])

  const fieldErrors = useMemo<FieldErrors<IndianReservePermitCreateField>>(
    () => ({
      permitNumber: requiredFieldError(form.permitNumber, 'Permit number') ?? undefined,
      packageNumber: requiredFieldError(form.packageNumber, 'Package number') ?? undefined,
      clientNumber: requiredFieldError(form.clientNumber, 'Client number') ?? undefined,
      clientLocation: requiredFieldError(form.clientLocation, 'Client location') ?? undefined,
      region: requiredFieldError(form.region, 'Region') ?? undefined,
      applicationDate: firstValidationError(
        () => requiredFieldError(form.applicationDate, 'Application date'),
        () => isoDateFieldError(form.applicationDate),
      ),
      permitIssueDate: firstValidationError(
        () => requiredFieldError(form.permitIssueDate, 'Permit issue date'),
        () => isoDateFieldError(form.permitIssueDate),
      ),
      estimatedShippingDate: firstValidationError(
        () => requiredFieldError(form.estimatedShippingDate, 'Estimated shipping date'),
        () => isoDateFieldError(form.estimatedShippingDate),
      ),
      transportName: requiredFieldError(form.transportName, 'Transport name') ?? undefined,
    }),
    [form],
  )
  const hasValidationError = useMemo(
    () => Object.values(fieldErrors).some((error) => !!error),
    [fieldErrors],
  )

  const markFieldTouched = (field: IndianReservePermitCreateField): void => {
    setTouchedFields((current) => ({ ...current, [field]: true }))
  }

  const fieldError = (field: IndianReservePermitCreateField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showAllValidationErrors)

  const hasSelectableClientLocations = clientLocations.some(isSelectableClientLocation)
  const clientLocationPlaceholder = isLoadingClientLocations
    ? 'Loading locations'
    : form.clientNumber.trim() && !hasSelectableClientLocations
      ? 'No locations found'
      : 'Select client location'

  const onSaveDraft = () => {
    setStatus(null)
    const saved = saveCreateDraft(MODULE_KEY, form)
    setDrafts(listCreateDrafts(MODULE_KEY))
    setShowAllValidationErrors(false)
    setStatus({ kind: 'success', title: 'Draft saved', message: `Draft ${saved.id} saved.` })
  }

  const onSubmit = async () => {
    if (hasValidationError) {
      const validationMessage =
        Object.values(fieldErrors).find((error): error is string => !!error) ??
        'Please fix validation errors before submitting.'
      setShowAllValidationErrors(true)
      setStatus({
        kind: 'error',
        title: 'Validation error',
        message: validationMessage,
      })
      return
    }

    setStatus(null)
    setIsSubmitting(true)
    try {
      const result = await submitIndianReservePermitCreate(form)
      if (result.success) {
        if (result.createdId) {
          navigate(`/indian-reserve/permit/${encodeURIComponent(result.createdId)}`)
          return
        }
        setStatus({
          kind: 'success',
          title: 'Permit submitted',
          message: 'Indigenous reserve permit submitted successfully.',
        })
        return
      }

      setStatus({
        kind: 'error',
        title: 'Submit failed',
        message:
          'Indigenous reserve permit submission failed. Please review the form and try again. If the problem persists, contact support.',
      })
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Submit failed',
        message:
          'Indigenous reserve permit submission failed. Please review the form and try again. If the problem persists, contact support.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const onUseDraft = (record: CreateDraftRecord<unknown>) => {
    setForm(mergeCreateDraftPayload(record.payload, INITIAL_FORM))
    setTouchedFields({})
    setShowAllValidationErrors(false)
    setStatus({ kind: 'success', title: 'Draft loaded', message: `Draft ${record.id} loaded.` })
  }

  const onDeleteDraft = (draftId: string) => {
    const wasDeleted = deleteCreateDraft(MODULE_KEY, draftId)
    setDrafts(listCreateDrafts(MODULE_KEY))
    setStatus({
      kind: wasDeleted ? 'success' : 'error',
      title: wasDeleted ? 'Draft deleted' : 'Draft delete failed',
      message: wasDeleted ? `Draft ${draftId} deleted.` : `Draft ${draftId} was not found.`,
    })
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Create indigenous reserve permit</h1>
      </Column>

      {!!status && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind={status.kind}
            title={status.title}
            subtitle={status.message}
            lowContrast
            autoDismissMs={status.kind === 'success' ? 8000 : undefined}
            onCloseButtonClick={() => setStatus(null)}
          />
        </Column>
      )}

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-grid">
            <TextInput
              id="permitNumber"
              labelText="Permit number (required)"
              value={form.permitNumber}
              invalid={!!fieldError('permitNumber')}
              invalidText={fieldError('permitNumber')}
              onBlur={() => markFieldTouched('permitNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, permitNumber: event.target.value }))
              }
            />
            <TextInput
              id="packageNumber"
              labelText="Package number (required)"
              value={form.packageNumber}
              invalid={!!fieldError('packageNumber')}
              invalidText={fieldError('packageNumber')}
              onBlur={() => markFieldTouched('packageNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, packageNumber: event.target.value }))
              }
            />
            <TextInput
              id="clientNumber"
              labelText="Client number (required)"
              value={form.clientNumber}
              invalid={!!fieldError('clientNumber')}
              invalidText={fieldError('clientNumber')}
              onBlur={() => markFieldTouched('clientNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, clientNumber: event.target.value }))
              }
            />
            <SearchableSelect
              id="clientLocation"
              labelText="Client location (required)"
              value={form.clientLocation}
              disabled={!form.clientNumber.trim() || isLoadingClientLocations}
              invalid={!!fieldError('clientLocation')}
              invalidText={fieldError('clientLocation')}
              onBlur={() => markFieldTouched('clientLocation')}
              placeholder={clientLocationPlaceholder}
              options={clientLocations.filter(isSelectableClientLocation).map((location) => ({
                value: location.locationCode,
                label: location.locationName,
              }))}
              onChange={(value) => setForm((current) => ({ ...current, clientLocation: value }))}
            />
            <SearchableSelect
              id="reserveRegion"
              labelText="Region (required)"
              value={form.region}
              placeholder="Select region"
              options={regions}
              invalid={!!fieldError('region')}
              invalidText={fieldError('region')}
              onBlur={() => markFieldTouched('region')}
              onChange={(value) => setForm((current) => ({ ...current, region: value }))}
            />
            <IsoDatePicker
              id="applicationDate"
              labelText="Application date (YYYY-MM-DD) (required)"
              value={form.applicationDate}
              invalid={!!fieldError('applicationDate')}
              invalidText={fieldError('applicationDate')}
              onBlur={() => markFieldTouched('applicationDate')}
              onChange={(value) => setForm((current) => ({ ...current, applicationDate: value }))}
            />
            <IsoDatePicker
              id="permitIssueDate"
              labelText="Permit issue date (YYYY-MM-DD) (required)"
              value={form.permitIssueDate}
              invalid={!!fieldError('permitIssueDate')}
              invalidText={fieldError('permitIssueDate')}
              onBlur={() => markFieldTouched('permitIssueDate')}
              onChange={(value) => setForm((current) => ({ ...current, permitIssueDate: value }))}
            />
            <IsoDatePicker
              id="estimatedShippingDate"
              labelText="Estimated shipping date (YYYY-MM-DD) (required)"
              value={form.estimatedShippingDate}
              invalid={!!fieldError('estimatedShippingDate')}
              invalidText={fieldError('estimatedShippingDate')}
              onBlur={() => markFieldTouched('estimatedShippingDate')}
              onChange={(value) =>
                setForm((current) => ({ ...current, estimatedShippingDate: value }))
              }
            />
            <SearchableSelect
              id="destinationCountry"
              labelText="Destination country"
              value={form.destinationCountry}
              placeholder="Select country"
              options={destinationCountries}
              onChange={(value) =>
                setForm((current) => ({ ...current, destinationCountry: value }))
              }
            />
            <TextInput
              id="transportTypeCode"
              labelText="Transport type code"
              value={form.transportTypeCode}
              onChange={(event) =>
                setForm((current) => ({ ...current, transportTypeCode: event.target.value }))
              }
            />
            <TextInput
              id="transportName"
              labelText="Transport name (required)"
              value={form.transportName}
              invalid={!!fieldError('transportName')}
              invalidText={fieldError('transportName')}
              onBlur={() => markFieldTouched('transportName')}
              onChange={(event) =>
                setForm((current) => ({ ...current, transportName: event.target.value }))
              }
            />
            <SearchableSelect
              id="portOfExport"
              labelText="Port of export"
              value={form.portOfExport}
              placeholder="Select port"
              options={portsOfExport}
              onChange={(value) => setForm((current) => ({ ...current, portOfExport: value }))}
            />
            <TextInput
              id="otherPortOfExport"
              labelText="Other port of export"
              value={form.otherPortOfExport}
              onChange={(event) =>
                setForm((current) => ({ ...current, otherPortOfExport: event.target.value }))
              }
            />
          </div>
          <div className="legacy-search-actions">
            <Button kind="primary" onClick={onSaveDraft}>
              Save Draft
            </Button>
            <Button kind="primary" onClick={() => void onSubmit()} disabled={isSubmitting}>
              Submit
            </Button>
            <Button
              kind="secondary"
              onClick={() => {
                setForm(initialForm)
                setTouchedFields({})
                setShowAllValidationErrors(false)
              }}
            >
              Reset
            </Button>
            <Link className="cds--link" to="/indian-reserve">
              Back to Search
            </Link>
          </div>
          <div className="legacy-search-actions">
            <TextArea
              id="reservePermitRemarks"
              labelText="Remarks"
              value={form.remarks}
              onChange={(event) =>
                setForm((current) => ({ ...current, remarks: event.target.value }))
              }
            />
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <CreateDraftHistory
          title="Recent indigenous reserve permit drafts"
          drafts={drafts}
          onUseDraft={onUseDraft}
          onDeleteDraft={onDeleteDraft}
          summarize={(payload) => {
            const value = payload as IndianReservePermitCreateForm
            return `${value.permitNumber || 'N/A'} / ${value.packageNumber || 'N/A'}`
          }}
        />
      </Column>
    </Grid>
  )
}

export default IndianReservePermitCreatePage
