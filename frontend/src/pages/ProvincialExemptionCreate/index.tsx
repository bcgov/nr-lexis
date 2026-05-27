import { useEffect, useMemo, useState, type FC } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Select,
  SelectItem,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import CreateDraftHistory from '@/pages/shared/CreateDraftHistory'
import { isPositiveNumeric, isValidIsoDate, normalizeText } from '@/pages/shared/create-form-utils'
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
  exemptionNumber: string
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

type ExemptionCreatePrefillState = {
  selectedApplicationNumbers: string[]
  ownerClientNumber: string
  applicantClientNumber: string
}

const MODULE_KEY = 'provincial-exemption'

const FALLBACK_EXEMPTION_TYPES: SearchOption[] = [
  { value: 'SECTION_1', label: 'Section 1' },
  { value: 'SECTION_2', label: 'Section 2' },
]

const FALLBACK_EXEMPTION_STATUSES: SearchOption[] = [
  { value: 'NEW', label: 'New' },
  { value: 'APPROVED', label: 'Approved' },
]

const INITIAL_FORM: ProvincialExemptionCreateForm = {
  exemptionNumber: '',
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
    ownerClientNumber:
      locationPrefill?.ownerClientNumber || queryPrefill?.ownerClientNumber || '',
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

const ProvincialExemptionCreatePage: FC = () => {
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
  const [form, setForm] = useState<ProvincialExemptionCreateForm>(initialForm)
  const [exemptionTypes, setExemptionTypes] = useState<SearchOption[]>(FALLBACK_EXEMPTION_TYPES)
  const [exemptionStatuses, setExemptionStatuses] = useState<SearchOption[]>(
    FALLBACK_EXEMPTION_STATUSES,
  )
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const mapDraftPayloadToForm = (payload: unknown): ProvincialExemptionCreateForm => {
    if (!payload || typeof payload !== 'object') {
      return initialForm
    }

    return {
      ...initialForm,
      ...(payload as Partial<ProvincialExemptionCreateForm>),
    }
  }

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialExemptionOptions()
      if (options.exemptionTypes.length > 0) {
        setExemptionTypes(options.exemptionTypes)
      }
      if (options.exemptionStatuses.length > 0) {
        setExemptionStatuses(options.exemptionStatuses)
      }
    }

    void loadOptions()
  }, [])

  useEffect(() => {
    setForm(initialForm)
  }, [initialForm])

  const hasValidationError = useMemo(() => {
    return (
      !normalizeText(form.exemptionNumber) ||
      !normalizeText(form.applicationNumber) ||
      !normalizeText(form.exemptionTypeCode) ||
      !normalizeText(form.ownerClientNumber) ||
      !normalizeText(form.applicantClientNumber) ||
      !isPositiveNumeric(form.applicationNumber) ||
      !isPositiveNumeric(form.approvedVolume) ||
      !isValidIsoDate(form.approvalDate) ||
      !isValidIsoDate(form.expiryDate)
    )
  }, [form])

  const onSaveDraft = () => {
    setStatus(null)
    if (hasValidationError) {
      setStatus({
        kind: 'error',
        title: 'Validation Error',
        message: 'Please fix validation errors before saving the draft.',
      })
      return
    }

    const saved = saveCreateDraft(MODULE_KEY, form)
    setDrafts(listCreateDrafts(MODULE_KEY))
    setStatus({ kind: 'success', title: 'Draft Saved', message: `Draft ${saved.id} saved.` })
  }

  const onSubmit = async () => {
    if (hasValidationError) {
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
      const result = await submitProvincialExemptionCreate({
        ...form,
        linkedApplicationNumbers: prefillState?.selectedApplicationNumbers ?? [form.applicationNumber],
      })
      const responseMessage = [result.message, ...result.errors, ...result.warnings]
        .filter((value) => value.trim().length > 0)
        .join(' ')

      if (result.success) {
        if (result.createdId) {
          navigate(`/provincial/exemption/${encodeURIComponent(result.createdId)}`)
          return
        }
        setStatus({
          kind: 'success',
          title: 'Exemption Submitted',
          message: responseMessage || 'Exemption submitted successfully.',
        })
        return
      }

      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message: responseMessage || 'Unable to submit provincial exemption create request.',
      })
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message: 'Unable to submit provincial exemption create request.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const onUseDraft = (record: CreateDraftRecord<unknown>) => {
    setForm(mapDraftPayloadToForm(record.payload))
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
        <h1>Create Provincial Exemption</h1>
        <p>Base create form for provincial exemption migration.</p>
      </Column>

      {!!prefillState && (
        <Column sm={4} md={8} lg={16}>
          <InlineNotification
            kind="info"
            title="Prefilled from selected applications"
            subtitle={`Loaded ${prefillState.selectedApplicationNumbers.length} application(s) into this form.`}
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
              id="exemptionNumber"
              labelText="Exemption Number (required)"
              value={form.exemptionNumber}
              onChange={(event) =>
                setForm((current) => ({ ...current, exemptionNumber: event.target.value }))
              }
            />
            <TextInput
              id="applicationNumber"
              labelText="Application Number (required)"
              value={form.applicationNumber}
              invalid={!isPositiveNumeric(form.applicationNumber)}
              invalidText="Use a positive numeric value."
              onChange={(event) =>
                setForm((current) => ({ ...current, applicationNumber: event.target.value }))
              }
            />
            <Select
              id="exemptionTypeCode"
              labelText="Exemption Type (required)"
              value={form.exemptionTypeCode}
              onChange={(event) =>
                setForm((current) => ({ ...current, exemptionTypeCode: event.target.value }))
              }
            >
              <SelectItem value="" text="Select type" />
              {exemptionTypes.map((option) => (
                <SelectItem key={option.value} value={option.value} text={option.label} />
              ))}
            </Select>
            <Select
              id="exemptionStatusCode"
              labelText="Exemption Status"
              value={form.exemptionStatusCode}
              onChange={(event) =>
                setForm((current) => ({ ...current, exemptionStatusCode: event.target.value }))
              }
            >
              <SelectItem value="" text="Select status" />
              {exemptionStatuses.map((option) => (
                <SelectItem key={option.value} value={option.value} text={option.label} />
              ))}
            </Select>
            <TextInput
              id="ownerClientNumber"
              labelText="Owner Client Number (required)"
              value={form.ownerClientNumber}
              onChange={(event) =>
                setForm((current) => ({ ...current, ownerClientNumber: event.target.value }))
              }
            />
            <TextInput
              id="applicantClientNumber"
              labelText="Applicant Client Number (required)"
              value={form.applicantClientNumber}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicantClientNumber: event.target.value }))
              }
            />
            <TextInput
              id="approvalDate"
              labelText="Approval Date (YYYY-MM-DD)"
              value={form.approvalDate}
              invalid={!isValidIsoDate(form.approvalDate)}
              invalidText="Date must be YYYY-MM-DD."
              onChange={(event) =>
                setForm((current) => ({ ...current, approvalDate: event.target.value }))
              }
            />
            <TextInput
              id="expiryDate"
              labelText="Expiry Date (YYYY-MM-DD)"
              value={form.expiryDate}
              invalid={!isValidIsoDate(form.expiryDate)}
              invalidText="Date must be YYYY-MM-DD."
              onChange={(event) =>
                setForm((current) => ({ ...current, expiryDate: event.target.value }))
              }
            />
            <TextInput
              id="approvedVolume"
              labelText="Approved Volume (m³)"
              value={form.approvedVolume}
              invalid={!isPositiveNumeric(form.approvedVolume)}
              invalidText="Use a positive numeric value."
              onChange={(event) =>
                setForm((current) => ({ ...current, approvedVolume: event.target.value }))
              }
            />
          </div>
          <div className="legacy-search-actions">
            <Button kind="primary" onClick={onSaveDraft} disabled={hasValidationError}>
              Save Draft
            </Button>
            <Button
              kind="primary"
              onClick={() => void onSubmit()}
              disabled={hasValidationError || isSubmitting}
            >
              Submit
            </Button>
            <Button kind="secondary" onClick={() => setForm(initialForm)}>
              Reset
            </Button>
            <Link className="cds--link" to="/provincial/exemption">
              Back to Search
            </Link>
          </div>
          <div className="legacy-search-actions">
            <TextArea
              id="otherConditions"
              labelText="Other Conditions"
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
          title="Recent Exemption Drafts"
          drafts={drafts}
          onUseDraft={onUseDraft}
          onDeleteDraft={onDeleteDraft}
          summarize={(payload) => {
            const value = payload as ProvincialExemptionCreateForm
            return `${value.exemptionNumber || 'N/A'} / application ${value.applicationNumber || 'N/A'}`
          }}
        />
      </Column>
    </Grid>
  )
}

export default ProvincialExemptionCreatePage
