import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Column, Grid, TextArea, TextInput, Tile } from '@carbon/react'
import ApplicationNumberSelect from '../../components/ApplicationNumberSelect'
import IsoDatePicker from '../../components/IsoDatePicker'
import { AppNotification } from '../../components/AppNotification'
import SearchableSelect from '../../components/SearchableSelect'
import CreateDraftHistory from '../shared/CreateDraftHistory'
import {
  atMostOneDecimalFieldError,
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
  maxNumericValueFieldError,
  mergeCreateDraftPayload,
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
import {
  fetchProvincialExemptionOptions,
  type SearchOption,
} from '@/service/search-options-service'
import { submitProvincialExemptionCreate } from '@/service/create-submit-service'

type ProvincialExemptionCreateForm = {
  applicationNumber: string
  exemptionTypeCode: string
  exemptionStatusCode: string
  ownerClientNumber: string
  applicantClientNumber: string
  approvalDate: string
  expiryDate: string
  approvedVolume: string
  otherConditions: string
}

type ProvincialExemptionCreateField = keyof ProvincialExemptionCreateForm & string

type ExemptionCreatePrefillState = {
  selectedApplicationNumbers: string[]
  ownerClientNumber: string
  applicantClientNumber: string
}

const MODULE_KEY = 'provincial-exemption'

const INITIAL_FORM: ProvincialExemptionCreateForm = {
  applicationNumber: '',
  exemptionTypeCode: '',
  exemptionStatusCode: '',
  ownerClientNumber: '',
  applicantClientNumber: '',
  approvalDate: '',
  expiryDate: '',
  approvedVolume: '',
  otherConditions: '',
}

const parseExemptionPrefillState = (rawState: unknown): ExemptionCreatePrefillState | null => {
  if (!rawState || typeof rawState !== 'object') {
    return null
  }

  const state = rawState as Record<string, unknown>
  const selectedApplicationNumbers = Array.isArray(state.selectedApplicationNumbers)
    ? state.selectedApplicationNumbers.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : []

  if (selectedApplicationNumbers.length === 0) {
    return null
  }

  return {
    selectedApplicationNumbers,
    ownerClientNumber: typeof state.ownerClientNumber === 'string' ? state.ownerClientNumber : '',
    applicantClientNumber:
      typeof state.applicantClientNumber === 'string' ? state.applicantClientNumber : '',
  }
}

const parseExemptionPrefillQuery = (query: URLSearchParams): ExemptionCreatePrefillState | null => {
  const applicationsFromCsv = (query.get('applications') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  const fallbackSingleApplication = (query.get('applicationNumber') ?? '').trim()
  const selectedApplicationNumbers =
    applicationsFromCsv.length > 0
      ? applicationsFromCsv
      : fallbackSingleApplication
        ? [fallbackSingleApplication]
        : []

  if (selectedApplicationNumbers.length === 0) {
    return null
  }

  return {
    selectedApplicationNumbers,
    ownerClientNumber: query.get('ownerClientNumber') ?? '',
    applicantClientNumber:
      query.get('applicantClientNumber') ?? query.get('agentClientNumber') ?? '',
  }
}

const mergePrefillState = (
  locationPrefill: ExemptionCreatePrefillState | null,
  queryPrefill: ExemptionCreatePrefillState | null,
): ExemptionCreatePrefillState | null => {
  if (!locationPrefill && !queryPrefill) {
    return null
  }

  if (locationPrefill && !queryPrefill) {
    return locationPrefill
  }

  if (!locationPrefill && queryPrefill) {
    return queryPrefill
  }

  const mergedApplicationNumbers = Array.from(
    new Set([
      ...(locationPrefill?.selectedApplicationNumbers ?? []),
      ...(queryPrefill?.selectedApplicationNumbers ?? []),
    ]),
  )

  if (mergedApplicationNumbers.length === 0) {
    return null
  }

  return {
    selectedApplicationNumbers: mergedApplicationNumbers,
    ownerClientNumber: locationPrefill?.ownerClientNumber || queryPrefill?.ownerClientNumber || '',
    applicantClientNumber:
      locationPrefill?.applicantClientNumber || queryPrefill?.applicantClientNumber || '',
  }
}

const buildInitialForm = (
  prefillState: ExemptionCreatePrefillState | null,
): ProvincialExemptionCreateForm => {
  if (!prefillState) {
    return INITIAL_FORM
  }

  const linkedApplicationsNote =
    prefillState.selectedApplicationNumbers.length > 1
      ? `Linked applications: ${prefillState.selectedApplicationNumbers.join(', ')}`
      : ''

  return {
    ...INITIAL_FORM,
    applicationNumber: prefillState.selectedApplicationNumbers[0],
    ownerClientNumber: prefillState.ownerClientNumber,
    applicantClientNumber: prefillState.applicantClientNumber,
    otherConditions: linkedApplicationsNote,
  }
}

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
}

const ProvincialExemptionCreatePage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const prefillState = useMemo(
    () =>
      mergePrefillState(
        parseExemptionPrefillState(location.state),
        parseExemptionPrefillQuery(searchParams),
      ),
    [location.state, searchParams],
  )
  const initialForm = useMemo(() => buildInitialForm(prefillState), [prefillState])
  const [form, setForm] = useState<ProvincialExemptionCreateForm>(() =>
    buildInitialForm(prefillState),
  )
  const [exemptionTypes, setExemptionTypes] = useState<SearchOption[]>([])
  const [exemptionStatuses, setExemptionStatuses] = useState<SearchOption[]>([])
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [showMissingRequiredOptions, setShowMissingRequiredOptions] = useState(true)
  const [showPrefillNotice, setShowPrefillNotice] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<ProvincialExemptionCreateField>>(
    {},
  )
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialExemptionOptions()
      setExemptionTypes(options.exemptionTypes)
      setExemptionStatuses(options.exemptionStatuses)
    }

    void loadOptions()
  }, [])

  const fieldErrors = useMemo<FieldErrors<ProvincialExemptionCreateField>>(
    () => ({
      applicationNumber: firstValidationError(
        () => requiredFieldError(form.applicationNumber, 'Application number'),
        () => positiveNumericFieldError(form.applicationNumber),
      ),
      exemptionTypeCode: requiredFieldError(form.exemptionTypeCode, 'Exemption type') ?? undefined,
      exemptionStatusCode:
        requiredFieldError(form.exemptionStatusCode, 'Exemption status') ?? undefined,
      ownerClientNumber:
        requiredFieldError(form.ownerClientNumber, 'Owner client number') ?? undefined,
      applicantClientNumber:
        requiredFieldError(form.applicantClientNumber, 'Applicant client number') ?? undefined,
      approvalDate: isoDateFieldError(form.approvalDate) ?? undefined,
      expiryDate: isoDateFieldError(form.expiryDate) ?? undefined,
      approvedVolume: firstValidationError(
        () => requiredFieldError(form.approvedVolume, 'Approved volume'),
        () => positiveNumericFieldError(form.approvedVolume),
        () => maxNumericValueFieldError(form.approvedVolume, 9999999.9, 'Approved volume'),
        () => atMostOneDecimalFieldError(form.approvedVolume, 'Approved volume'),
      ),
    }),
    [form],
  )
  const hasValidationError = useMemo(
    () => Object.values(fieldErrors).some((error) => !!error),
    [fieldErrors],
  )
  const missingRequiredOptions = exemptionTypes.length === 0 && showMissingRequiredOptions

  const markFieldTouched = (field: ProvincialExemptionCreateField): void => {
    setTouchedFields((current) => ({ ...current, [field]: true }))
  }

  const fieldError = (field: ProvincialExemptionCreateField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showAllValidationErrors)
  const firstSubmitValidationError = Object.values(fieldErrors).find(
    (error): error is string => !!error,
  )

  const onSaveDraft = () => {
    setStatus(null)
    const saved = saveCreateDraft(MODULE_KEY, form)
    setDrafts(listCreateDrafts(MODULE_KEY))
    setShowAllValidationErrors(false)
    setStatus({ kind: 'success', title: 'Draft saved', message: `Draft ${saved.id} saved.` })
  }

  const onSubmit = async () => {
    if (hasValidationError) {
      setShowAllValidationErrors(true)
      setStatus({
        kind: 'error',
        title: 'Validation Error',
        message: firstSubmitValidationError ?? 'Please fix validation errors before submitting.',
      })
      return
    }

    setStatus(null)
    setIsSubmitting(true)
    try {
      const result = await submitProvincialExemptionCreate({
        ...form,
        linkedApplicationNumbers: prefillState?.selectedApplicationNumbers ?? [
          form.applicationNumber,
        ],
      })
      if (result.success) {
        if (result.createdId) {
          navigate(`/provincial/exemption/${encodeURIComponent(result.createdId)}`)
          return
        }
        setStatus({
          kind: 'success',
          title: 'Exemption Submitted',
          message: 'Exemption submitted successfully.',
        })
        return
      }

      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message:
          'Exemption submission failed. Please review the form and try again. If the problem persists, contact support.',
      })
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message:
          'Exemption submission failed. Please review the form and try again. If the problem persists, contact support.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const onUseDraft = (record: CreateDraftRecord<unknown>) => {
    setForm(mergeCreateDraftPayload(record.payload, initialForm))
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
        <div className="application-detail-title-row">
          <h1>Create provincial exemption</h1>
          <dl
            className="application-detail-header-metrics"
            role="group"
            aria-label="New exemption state"
          >
            <div>
              <dt>Exemption number</dt>
              <dd>New</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>New</dd>
            </div>
          </dl>
        </div>
      </Column>

      {missingRequiredOptions && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="warning"
            title="Required options unavailable"
            subtitle="Exemption type values are unavailable. Submit remains disabled until a valid type is available."
            lowContrast
            onCloseButtonClick={() => setShowMissingRequiredOptions(false)}
          />
        </Column>
      )}

      {!!prefillState && showPrefillNotice && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="info"
            title="Prefilled from selected applications"
            subtitle={`Loaded ${prefillState.selectedApplicationNumbers.length} application(s) into this form.`}
            lowContrast
            onCloseButtonClick={() => setShowPrefillNotice(false)}
            autoDismissMs={8000}
          />
        </Column>
      )}

      {!!status && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind={status.kind}
            title={status.title}
            subtitle={status.message}
            lowContrast
            onCloseButtonClick={() => setStatus(null)}
            autoDismissMs={status.kind === 'success' ? 8000 : undefined}
          />
        </Column>
      )}

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-grid">
            <ApplicationNumberSelect
              id="applicationNumber"
              labelText="Application number (required)"
              value={form.applicationNumber}
              invalid={!!fieldError('applicationNumber')}
              invalidText={fieldError('applicationNumber')}
              onBlur={() => markFieldTouched('applicationNumber')}
              onChange={(value) => setForm((current) => ({ ...current, applicationNumber: value }))}
            />
            <SearchableSelect
              id="exemptionTypeCode"
              labelText="Exemption type (required)"
              value={form.exemptionTypeCode}
              invalid={!!fieldError('exemptionTypeCode')}
              invalidText={fieldError('exemptionTypeCode')}
              placeholder="Select type"
              options={exemptionTypes}
              onBlur={() => markFieldTouched('exemptionTypeCode')}
              onChange={(value) => setForm((current) => ({ ...current, exemptionTypeCode: value }))}
            />
            <SearchableSelect
              id="exemptionStatusCode"
              labelText="Exemption status (required)"
              value={form.exemptionStatusCode}
              invalid={!!fieldError('exemptionStatusCode')}
              invalidText={fieldError('exemptionStatusCode')}
              placeholder="Select status"
              options={exemptionStatuses}
              onBlur={() => markFieldTouched('exemptionStatusCode')}
              onChange={(value) =>
                setForm((current) => ({ ...current, exemptionStatusCode: value }))
              }
            />
            <TextInput
              id="ownerClientNumber"
              labelText="Owner client number (required)"
              value={form.ownerClientNumber}
              invalid={!!fieldError('ownerClientNumber')}
              invalidText={fieldError('ownerClientNumber')}
              onBlur={() => markFieldTouched('ownerClientNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, ownerClientNumber: event.target.value }))
              }
            />
            <TextInput
              id="applicantClientNumber"
              labelText="Applicant client number (required)"
              value={form.applicantClientNumber}
              invalid={!!fieldError('applicantClientNumber')}
              invalidText={fieldError('applicantClientNumber')}
              onBlur={() => markFieldTouched('applicantClientNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicantClientNumber: event.target.value }))
              }
            />
            <IsoDatePicker
              id="approvalDate"
              labelText="Approval date (YYYY-MM-DD)"
              value={form.approvalDate}
              invalid={!!fieldError('approvalDate')}
              invalidText={fieldError('approvalDate')}
              onBlur={() => markFieldTouched('approvalDate')}
              onChange={(value) => setForm((current) => ({ ...current, approvalDate: value }))}
            />
            <IsoDatePicker
              id="expiryDate"
              labelText="Expiry date (YYYY-MM-DD)"
              value={form.expiryDate}
              invalid={!!fieldError('expiryDate')}
              invalidText={fieldError('expiryDate')}
              onBlur={() => markFieldTouched('expiryDate')}
              onChange={(value) => setForm((current) => ({ ...current, expiryDate: value }))}
            />
            <TextInput
              id="approvedVolume"
              labelText="Approved volumeume (m³) (required)"
              value={form.approvedVolume}
              invalid={!!fieldError('approvedVolume')}
              invalidText={fieldError('approvedVolume')}
              onBlur={() => markFieldTouched('approvedVolume')}
              onChange={(event) =>
                setForm((current) => ({ ...current, approvedVolume: event.target.value }))
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
            <Link className="cds--link" to="/provincial/exemption">
              Back to Search
            </Link>
          </div>
          <div className="legacy-search-actions">
            <TextArea
              id="otherConditions"
              labelText="Other conditions"
              value={form.otherConditions}
              onChange={(event) =>
                setForm((current) => ({ ...current, otherConditions: event.target.value }))
              }
            />
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <CreateDraftHistory
          title="Recent exemption drafts"
          drafts={drafts}
          onUseDraft={onUseDraft}
          onDeleteDraft={onDeleteDraft}
          summarize={(payload) => {
            const value = payload as ProvincialExemptionCreateForm
            return `new exemption / application ${value.applicationNumber || 'N/A'}`
          }}
        />
      </Column>
    </Grid>
  )
}

export default ProvincialExemptionCreatePage
