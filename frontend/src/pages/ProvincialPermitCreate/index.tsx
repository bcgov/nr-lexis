import { useEffect, useMemo, useState, type FC } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Column, Grid, InlineNotification, TextArea, TextInput, Tile } from '@carbon/react'
import IsoDatePicker from '@/components/IsoDatePicker'
import SearchableSelect from '@/components/SearchableSelect'
import CreateDraftHistory from '@/pages/shared/CreateDraftHistory'
import {
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
  positiveNumericFieldError,
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
import { submitProvincialPermitCreate } from '@/service/create-submit-service'
import { fetchProvincialPermitOptions, type SearchOption } from '@/service/search-options-service'

type ProvincialPermitCreateForm = {
  permitNumber: string
  applicationNumber: string
  packageNumber: string
  exemptionNumber: string
  region: string
  permitStatus: string
  applicantClientNumber: string
  ownerClientNumber: string
  submitDate: string
  issueDate: string
  estimatedShippingDate: string
  permitVolume: string
  remarks: string
}

type ProvincialPermitCreateField = keyof ProvincialPermitCreateForm & string

const MODULE_KEY = 'provincial-permit'

const INITIAL_FORM: ProvincialPermitCreateForm = {
  permitNumber: '',
  applicationNumber: '',
  packageNumber: '',
  exemptionNumber: '',
  region: '',
  permitStatus: '',
  applicantClientNumber: '',
  ownerClientNumber: '',
  submitDate: '',
  issueDate: '',
  estimatedShippingDate: '',
  permitVolume: '',
  remarks: '',
}

const mapDraftPayloadToForm = (payload: unknown): ProvincialPermitCreateForm => {
  if (!payload || typeof payload !== 'object') {
    return INITIAL_FORM
  }

  return {
    ...INITIAL_FORM,
    ...(payload as Partial<ProvincialPermitCreateForm>),
  }
}

const buildInitialFormFromQuery = (query: URLSearchParams): ProvincialPermitCreateForm => {
  return {
    ...INITIAL_FORM,
    permitNumber: query.get('permitNumber') ?? '',
    applicationNumber: query.get('applicationNumber') ?? '',
    packageNumber: query.get('packageNumber') ?? '',
    exemptionNumber: query.get('exemptionNumber') ?? '',
    region: query.get('region') ?? query.get('orgUnitNo') ?? '',
    permitStatus: query.get('permitStatus') ?? query.get('permitStatusCode') ?? '',
    applicantClientNumber:
      query.get('applicantClientNumber') ?? query.get('agentClientNumber') ?? '',
    ownerClientNumber: query.get('ownerClientNumber') ?? '',
    submitDate: query.get('submitDate') ?? query.get('permitSubmitDate') ?? '',
    issueDate: query.get('issueDate') ?? '',
    estimatedShippingDate: query.get('estimatedShippingDate') ?? '',
    permitVolume: query.get('permitVolume') ?? '',
    remarks: query.get('remarks') ?? '',
  }
}

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
}

const ProvincialPermitCreatePage: FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialForm = useMemo(() => buildInitialFormFromQuery(searchParams), [searchParams])
  const [form, setForm] = useState<ProvincialPermitCreateForm>(() => initialForm)
  const [permitStatuses, setPermitStatuses] = useState<SearchOption[]>([])
  const [regions, setRegions] = useState<SearchOption[]>([])
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<ProvincialPermitCreateField>>({})
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialPermitOptions()
      setPermitStatuses(options.permitStatuses)
      setRegions(options.regions)
    }

    void loadOptions()
  }, [])

  const fieldErrors = useMemo<FieldErrors<ProvincialPermitCreateField>>(
    () => ({
      permitNumber: firstValidationError(
        () => requiredFieldError(form.permitNumber, 'Permit number'),
        () => positiveNumericFieldError(form.permitNumber),
      ),
      applicationNumber: firstValidationError(
        () => requiredFieldError(form.applicationNumber, 'Application number'),
        () => positiveNumericFieldError(form.applicationNumber),
      ),
      packageNumber: requiredFieldError(form.packageNumber, 'Package number') ?? undefined,
      exemptionNumber: requiredFieldError(form.exemptionNumber, 'Exemption number') ?? undefined,
      region: requiredFieldError(form.region, 'Region') ?? undefined,
      permitStatus: requiredFieldError(form.permitStatus, 'Permit status') ?? undefined,
      applicantClientNumber:
        requiredFieldError(form.applicantClientNumber, 'Applicant client number') ?? undefined,
      ownerClientNumber:
        requiredFieldError(form.ownerClientNumber, 'Owner client number') ?? undefined,
      submitDate: firstValidationError(
        () => requiredFieldError(form.submitDate, 'Submit date'),
        () => isoDateFieldError(form.submitDate),
      ),
      issueDate: firstValidationError(
        () => requiredFieldError(form.issueDate, 'Issue date'),
        () => isoDateFieldError(form.issueDate),
      ),
      estimatedShippingDate: isoDateFieldError(form.estimatedShippingDate) ?? undefined,
      permitVolume: positiveNumericFieldError(form.permitVolume) ?? undefined,
    }),
    [form],
  )
  const hasValidationError = useMemo(
    () => Object.values(fieldErrors).some((error) => !!error),
    [fieldErrors],
  )
  const missingRequiredOptions = permitStatuses.length === 0 || regions.length === 0

  const markFieldTouched = (field: ProvincialPermitCreateField): void => {
    setTouchedFields((current) => ({ ...current, [field]: true }))
  }

  const fieldError = (field: ProvincialPermitCreateField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showAllValidationErrors)

  const onSaveDraft = () => {
    setStatus(null)
    const saved = saveCreateDraft(MODULE_KEY, form)
    setDrafts(listCreateDrafts(MODULE_KEY))
    setShowAllValidationErrors(false)
    setStatus({ kind: 'success', title: 'Draft Saved', message: `Draft ${saved.id} saved.` })
  }

  const onSubmit = async () => {
    if (hasValidationError) {
      setShowAllValidationErrors(true)
      setStatus({
        kind: 'error',
        title: 'Validation Error',
        message: 'Please fix validation errors before submitting.',
      })
      return
    }

    setStatus(null)
    setIsSubmitting(true)
    try {
      const result = await submitProvincialPermitCreate(form)
      const responseMessage = [result.message, ...result.errors, ...result.warnings]
        .filter((value) => value.trim().length > 0)
        .join(' ')

      if (result.success) {
        if (result.createdId) {
          navigate(`/provincial/permit/${encodeURIComponent(result.createdId)}`)
          return
        }
        setStatus({
          kind: 'success',
          title: 'Permit Submitted',
          message: responseMessage || 'Permit submitted successfully.',
        })
        return
      }

      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message: responseMessage || 'Unable to submit provincial permit create request.',
      })
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message: 'Unable to submit provincial permit create request.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const onUseDraft = (record: CreateDraftRecord<unknown>) => {
    setForm(mapDraftPayloadToForm(record.payload))
    setTouchedFields({})
    setShowAllValidationErrors(false)
    setStatus({ kind: 'success', title: 'Draft Loaded', message: `Draft ${record.id} loaded.` })
  }

  const onDeleteDraft = (draftId: string) => {
    const wasDeleted = deleteCreateDraft(MODULE_KEY, draftId)
    setDrafts(listCreateDrafts(MODULE_KEY))
    setStatus({
      kind: wasDeleted ? 'success' : 'error',
      title: wasDeleted ? 'Draft Deleted' : 'Draft Delete Failed',
      message: wasDeleted ? `Draft ${draftId} deleted.` : `Draft ${draftId} was not found.`,
    })
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Create Provincial Permit</h1>
      </Column>

      {missingRequiredOptions && (
        <Column sm={4} md={8} lg={16}>
          <InlineNotification
            kind="warning"
            title="Required options unavailable"
            subtitle="Permit status or region values are unavailable. Submit remains disabled until valid options are available."
            lowContrast
            hideCloseButton
          />
        </Column>
      )}

      {!!status && (
        <Column sm={4} md={8} lg={16}>
          <InlineNotification
            kind={status.kind}
            title={status.title}
            subtitle={status.message}
            lowContrast
            onCloseButtonClick={() => setStatus(null)}
          />
        </Column>
      )}

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-grid">
            <TextInput
              id="permitNumber"
              labelText="Permit Number (required)"
              value={form.permitNumber}
              invalid={!!fieldError('permitNumber')}
              invalidText={fieldError('permitNumber')}
              onBlur={() => markFieldTouched('permitNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, permitNumber: event.target.value }))
              }
            />
            <TextInput
              id="applicationNumber"
              labelText="Application Number (required)"
              value={form.applicationNumber}
              invalid={!!fieldError('applicationNumber')}
              invalidText={fieldError('applicationNumber')}
              onBlur={() => markFieldTouched('applicationNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicationNumber: event.target.value }))
              }
            />
            <TextInput
              id="packageNumber"
              labelText="Package Number (required)"
              value={form.packageNumber}
              invalid={!!fieldError('packageNumber')}
              invalidText={fieldError('packageNumber')}
              onBlur={() => markFieldTouched('packageNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, packageNumber: event.target.value }))
              }
            />
            <TextInput
              id="exemptionNumber"
              labelText="Exemption Number (required)"
              value={form.exemptionNumber}
              invalid={!!fieldError('exemptionNumber')}
              invalidText={fieldError('exemptionNumber')}
              onBlur={() => markFieldTouched('exemptionNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, exemptionNumber: event.target.value }))
              }
            />
            <SearchableSelect
              id="permitRegion"
              labelText="Region (required)"
              value={form.region}
              invalid={!!fieldError('region')}
              invalidText={fieldError('region')}
              placeholder="Select region"
              options={regions}
              onBlur={() => markFieldTouched('region')}
              onChange={(value) => setForm((current) => ({ ...current, region: value }))}
            />
            <SearchableSelect
              id="permitStatus"
              labelText="Permit Status (required)"
              value={form.permitStatus}
              invalid={!!fieldError('permitStatus')}
              invalidText={fieldError('permitStatus')}
              placeholder="Select permit status"
              options={permitStatuses}
              onBlur={() => markFieldTouched('permitStatus')}
              onChange={(value) => setForm((current) => ({ ...current, permitStatus: value }))}
            />
            <TextInput
              id="applicantClientNumber"
              labelText="Applicant Client Number (required)"
              value={form.applicantClientNumber}
              invalid={!!fieldError('applicantClientNumber')}
              invalidText={fieldError('applicantClientNumber')}
              onBlur={() => markFieldTouched('applicantClientNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicantClientNumber: event.target.value }))
              }
            />
            <TextInput
              id="ownerClientNumber"
              labelText="Owner Client Number (required)"
              value={form.ownerClientNumber}
              invalid={!!fieldError('ownerClientNumber')}
              invalidText={fieldError('ownerClientNumber')}
              onBlur={() => markFieldTouched('ownerClientNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, ownerClientNumber: event.target.value }))
              }
            />
            <IsoDatePicker
              id="submitDate"
              labelText="Submit Date (YYYY-MM-DD) (required)"
              value={form.submitDate}
              invalid={!!fieldError('submitDate')}
              invalidText={fieldError('submitDate')}
              onBlur={() => markFieldTouched('submitDate')}
              onChange={(value) => setForm((current) => ({ ...current, submitDate: value }))}
            />
            <IsoDatePicker
              id="issueDate"
              labelText="Issue Date (YYYY-MM-DD) (required)"
              value={form.issueDate}
              invalid={!!fieldError('issueDate')}
              invalidText={fieldError('issueDate')}
              onBlur={() => markFieldTouched('issueDate')}
              onChange={(value) => setForm((current) => ({ ...current, issueDate: value }))}
            />
            <TextInput
              id="estimatedShippingDate"
              labelText="Estimated Shipping Date (YYYY-MM-DD)"
              value={form.estimatedShippingDate}
              invalid={!!fieldError('estimatedShippingDate')}
              invalidText={fieldError('estimatedShippingDate')}
              onBlur={() => markFieldTouched('estimatedShippingDate')}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  estimatedShippingDate: event.target.value,
                }))
              }
            />
            <TextInput
              id="permitVolume"
              labelText="Permit Volume (m³)"
              value={form.permitVolume}
              invalid={!!fieldError('permitVolume')}
              invalidText={fieldError('permitVolume')}
              onBlur={() => markFieldTouched('permitVolume')}
              onChange={(event) =>
                setForm((current) => ({ ...current, permitVolume: event.target.value }))
              }
            />
          </div>
          <div className="legacy-search-actions">
            <Button kind="primary" onClick={onSaveDraft}>
              Save Draft
            </Button>
            <Button
              kind="primary"
              onClick={() => void onSubmit()}
              disabled={missingRequiredOptions || isSubmitting}
            >
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
            <Link className="cds--link" to="/provincial/permit">
              Back to Search
            </Link>
          </div>
          <div className="legacy-search-actions">
            <TextArea
              id="permitRemarks"
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
          title="Recent Permit Drafts"
          drafts={drafts}
          onUseDraft={onUseDraft}
          onDeleteDraft={onDeleteDraft}
          summarize={(payload) => {
            const value = payload as ProvincialPermitCreateForm
            return `${value.permitNumber || 'N/A'} / application ${value.applicationNumber || 'N/A'}`
          }}
        />
      </Column>
    </Grid>
  )
}

export default ProvincialPermitCreatePage
