import { useMemo, useState, type FC } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Column, Grid, InlineNotification, TextArea, TextInput, Tile } from '@carbon/react'
import CreateDraftHistory from '@/pages/shared/CreateDraftHistory'
import { isValidIsoDate, normalizeText } from '@/pages/shared/create-form-utils'
import {
  deleteCreateDraft,
  listCreateDrafts,
  saveCreateDraft,
  type CreateDraftRecord,
} from '@/service/create-draft-service'
import { submitIndianReservePermitCreate } from '@/service/create-submit-service'

type IndianReservePermitCreateForm = {
  permitNumber: string
  packageNumber: string
  clientNumber: string
  applicationDate: string
  permitIssueDate: string
  estimatedShippingDate: string
  destinationCountry: string
  transportTypeCode: string
  transportName: string
  portOfExport: string
  remarks: string
}

const MODULE_KEY = 'indian-reserve-permit'

const INITIAL_FORM: IndianReservePermitCreateForm = {
  permitNumber: '',
  packageNumber: '',
  clientNumber: '',
  applicationDate: '',
  permitIssueDate: '',
  estimatedShippingDate: '',
  destinationCountry: '',
  transportTypeCode: '',
  transportName: '',
  portOfExport: '',
  remarks: '',
}

const mapDraftPayloadToForm = (payload: unknown): IndianReservePermitCreateForm => {
  if (!payload || typeof payload !== 'object') {
    return INITIAL_FORM
  }

  return {
    ...INITIAL_FORM,
    ...(payload as Partial<IndianReservePermitCreateForm>),
  }
}

const buildInitialFormFromQuery = (query: URLSearchParams): IndianReservePermitCreateForm => {
  return {
    ...INITIAL_FORM,
    permitNumber: query.get('permitNumber') ?? '',
    packageNumber: query.get('packageNumber') ?? '',
    clientNumber: query.get('clientNumber') ?? '',
    applicationDate: query.get('applicationDate') ?? '',
    permitIssueDate: query.get('permitIssueDate') ?? '',
    estimatedShippingDate: query.get('estimatedShippingDate') ?? query.get('estShippingDate') ?? '',
    destinationCountry: query.get('destinationCountry') ?? '',
    transportTypeCode: query.get('transportTypeCode') ?? '',
    transportName: query.get('transportName') ?? '',
    portOfExport: query.get('portOfExport') ?? '',
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
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const hasValidationError = useMemo(() => {
    return (
      !normalizeText(form.permitNumber) ||
      !normalizeText(form.packageNumber) ||
      !normalizeText(form.clientNumber) ||
      !isValidIsoDate(form.applicationDate) ||
      !isValidIsoDate(form.permitIssueDate) ||
      !isValidIsoDate(form.estimatedShippingDate)
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
      const result = await submitIndianReservePermitCreate(form)
      const responseMessage = [result.message, ...result.errors, ...result.warnings]
        .filter((value) => value.trim().length > 0)
        .join(' ')

      if (result.success) {
        if (result.createdId) {
          navigate(`/indian-reserve/permit/${encodeURIComponent(result.createdId)}`)
          return
        }
        setStatus({
          kind: 'success',
          title: 'Permit Submitted',
          message: responseMessage || 'Indigenous reserve permit submitted successfully.',
        })
        return
      }

      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message: responseMessage || 'Unable to submit indigenous reserve permit create request.',
      })
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message: 'Unable to submit indigenous reserve permit create request.',
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
        <h1>Create Indigenous Reserve Permit</h1>
        <p>Base create form for indigenous reserve permit migration.</p>
      </Column>

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
              onChange={(event) =>
                setForm((current) => ({ ...current, permitNumber: event.target.value }))
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
              id="clientNumber"
              labelText="Client Number (required)"
              value={form.clientNumber}
              onChange={(event) =>
                setForm((current) => ({ ...current, clientNumber: event.target.value }))
              }
            />
            <TextInput
              id="applicationDate"
              labelText="Application Date (YYYY-MM-DD)"
              value={form.applicationDate}
              invalid={!isValidIsoDate(form.applicationDate)}
              invalidText="Date must be YYYY-MM-DD."
              onChange={(event) =>
                setForm((current) => ({ ...current, applicationDate: event.target.value }))
              }
            />
            <TextInput
              id="permitIssueDate"
              labelText="Permit Issue Date (YYYY-MM-DD)"
              value={form.permitIssueDate}
              invalid={!isValidIsoDate(form.permitIssueDate)}
              invalidText="Date must be YYYY-MM-DD."
              onChange={(event) =>
                setForm((current) => ({ ...current, permitIssueDate: event.target.value }))
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
              id="destinationCountry"
              labelText="Destination Country"
              value={form.destinationCountry}
              onChange={(event) =>
                setForm((current) => ({ ...current, destinationCountry: event.target.value }))
              }
            />
            <TextInput
              id="transportTypeCode"
              labelText="Transport Type Code"
              value={form.transportTypeCode}
              onChange={(event) =>
                setForm((current) => ({ ...current, transportTypeCode: event.target.value }))
              }
            />
            <TextInput
              id="transportName"
              labelText="Transport Name"
              value={form.transportName}
              onChange={(event) =>
                setForm((current) => ({ ...current, transportName: event.target.value }))
              }
            />
            <TextInput
              id="portOfExport"
              labelText="Port Of Export"
              value={form.portOfExport}
              onChange={(event) =>
                setForm((current) => ({ ...current, portOfExport: event.target.value }))
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
          title="Recent Indigenous Reserve Permit Drafts"
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
