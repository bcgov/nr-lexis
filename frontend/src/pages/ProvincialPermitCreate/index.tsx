import { useEffect, useMemo, useState, type FC } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
import { submitProvincialPermitCreate } from '@/service/create-submit-service'
import { fetchProvincialPermitOptions, type SearchOption } from '@/service/search-options-service'

type ProvincialPermitCreateForm = {
  permitNumber: string
  applicationNumber: string
  packageNumber: string
  exemptionNumber: string
  permitStatus: string
  applicantClientNumber: string
  ownerClientNumber: string
  issueDate: string
  estimatedShippingDate: string
  permitVolume: string
  remarks: string
}

const MODULE_KEY = 'provincial-permit'

const INITIAL_FORM: ProvincialPermitCreateForm = {
  permitNumber: '',
  applicationNumber: '',
  packageNumber: '',
  exemptionNumber: '',
  permitStatus: '',
  applicantClientNumber: '',
  ownerClientNumber: '',
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
    permitStatus: query.get('permitStatus') ?? query.get('permitStatusCode') ?? '',
    applicantClientNumber:
      query.get('applicantClientNumber') ?? query.get('agentClientNumber') ?? '',
    ownerClientNumber: query.get('ownerClientNumber') ?? '',
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
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialPermitOptions()
      setPermitStatuses(options.permitStatuses)
    }

    void loadOptions()
  }, [])

  const hasValidationError = useMemo(() => {
    return (
      !normalizeText(form.permitNumber) ||
      !normalizeText(form.applicationNumber) ||
      !normalizeText(form.packageNumber) ||
      !normalizeText(form.permitStatus) ||
      !normalizeText(form.applicantClientNumber) ||
      !normalizeText(form.ownerClientNumber) ||
      !isPositiveNumeric(form.permitNumber) ||
      !isPositiveNumeric(form.applicationNumber) ||
      !isPositiveNumeric(form.permitVolume) ||
      !isValidIsoDate(form.issueDate) ||
      !isValidIsoDate(form.estimatedShippingDate)
    )
  }, [form])
  const missingRequiredOptions = permitStatuses.length === 0

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
        <p>Base create form for provincial permit migration.</p>
      </Column>

      {missingRequiredOptions && (
        <Column sm={4} md={8} lg={16}>
          <InlineNotification
            kind="warning"
            title="Required options unavailable"
            subtitle="Permit status values are unavailable from backend options. Submit remains disabled until a valid status is available."
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
              invalid={!isPositiveNumeric(form.permitNumber)}
              invalidText="Use a positive numeric value."
              onChange={(event) =>
                setForm((current) => ({ ...current, permitNumber: event.target.value }))
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
            <TextInput
              id="packageNumber"
              labelText="Package Number (required)"
              value={form.packageNumber}
              onChange={(event) =>
                setForm((current) => ({ ...current, packageNumber: event.target.value }))
              }
            />
            <TextInput
              id="exemptionNumber"
              labelText="Exemption Number"
              value={form.exemptionNumber}
              onChange={(event) =>
                setForm((current) => ({ ...current, exemptionNumber: event.target.value }))
              }
            />
            <Select
              id="permitStatus"
              labelText="Permit Status (required)"
              value={form.permitStatus}
              onChange={(event) =>
                setForm((current) => ({ ...current, permitStatus: event.target.value }))
              }
            >
              <SelectItem value="" text="Select permit status" />
              {permitStatuses.map((option) => (
                <SelectItem key={option.value} value={option.value} text={option.label} />
              ))}
            </Select>
            <TextInput
              id="applicantClientNumber"
              labelText="Applicant Client Number (required)"
              value={form.applicantClientNumber}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicantClientNumber: event.target.value }))
              }
            />
            <TextInput
              id="ownerClientNumber"
              labelText="Owner Client Number (required)"
              value={form.ownerClientNumber}
              onChange={(event) =>
                setForm((current) => ({ ...current, ownerClientNumber: event.target.value }))
              }
            />
            <TextInput
              id="issueDate"
              labelText="Issue Date (YYYY-MM-DD)"
              value={form.issueDate}
              invalid={!isValidIsoDate(form.issueDate)}
              invalidText="Date must be YYYY-MM-DD."
              onChange={(event) =>
                setForm((current) => ({ ...current, issueDate: event.target.value }))
              }
            />
            <TextInput
              id="estimatedShippingDate"
              labelText="Estimated Shipping Date (YYYY-MM-DD)"
              value={form.estimatedShippingDate}
              invalid={!isValidIsoDate(form.estimatedShippingDate)}
              invalidText="Date must be YYYY-MM-DD."
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
              invalid={!isPositiveNumeric(form.permitVolume)}
              invalidText="Use a positive numeric value."
              onChange={(event) =>
                setForm((current) => ({ ...current, permitVolume: event.target.value }))
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
