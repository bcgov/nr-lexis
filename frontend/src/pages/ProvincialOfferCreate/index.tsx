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
import { submitProvincialOfferCreate } from '@/service/create-submit-service'
import { fetchProvincialOfferOptions, type SearchOption } from '@/service/search-options-service'

type ProvincialOfferCreateForm = {
  offerNumber: string
  applicationNumber: string
  packageNumber: string
  offeringClientNumber: string
  companyName: string
  contactName: string
  region: string
  purchaseOfferAmount: string
  purchaseOfferDate: string
  offerEndDate: string
  withdrawReason: string
  pickupLocation: string
  offerCondition: string
}

const MODULE_KEY = 'provincial-offer'

const INITIAL_FORM: ProvincialOfferCreateForm = {
  offerNumber: '',
  applicationNumber: '',
  packageNumber: '',
  offeringClientNumber: '',
  companyName: '',
  contactName: '',
  region: '',
  purchaseOfferAmount: '',
  purchaseOfferDate: '',
  offerEndDate: '',
  withdrawReason: '',
  pickupLocation: '',
  offerCondition: '',
}

const mapDraftPayloadToForm = (payload: unknown): ProvincialOfferCreateForm => {
  if (!payload || typeof payload !== 'object') {
    return INITIAL_FORM
  }

  return {
    ...INITIAL_FORM,
    ...(payload as Partial<ProvincialOfferCreateForm>),
  }
}

const buildInitialFormFromQuery = (query: URLSearchParams): ProvincialOfferCreateForm => {
  return {
    ...INITIAL_FORM,
    applicationNumber: query.get('applicationNumber') ?? '',
    packageNumber: query.get('packageNumber') ?? '',
    offeringClientNumber: query.get('offeringClientNumber') ?? query.get('clientNumber') ?? '',
    companyName: query.get('companyName') ?? '',
    contactName: query.get('contactName') ?? '',
    region: query.get('region') ?? '',
    withdrawReason: query.get('withdrawReason') ?? '',
  }
}

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
}

const ProvincialOfferCreatePage: FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState<ProvincialOfferCreateForm>(() =>
    buildInitialFormFromQuery(searchParams),
  )
  const [regions, setRegions] = useState<SearchOption[]>([])
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialOfferOptions()
      setRegions(options.regions)
    }

    void loadOptions()
  }, [])

  const hasValidationError = useMemo(() => {
    return (
      !normalizeText(form.offerNumber) ||
      !normalizeText(form.applicationNumber) ||
      !normalizeText(form.packageNumber) ||
      !normalizeText(form.offeringClientNumber) ||
      !normalizeText(form.companyName) ||
      !normalizeText(form.contactName) ||
      !normalizeText(form.purchaseOfferDate) ||
      !normalizeText(form.pickupLocation) ||
      (!!normalizeText(form.offerEndDate) && !normalizeText(form.withdrawReason)) ||
      !isPositiveNumeric(form.offerNumber) ||
      !isPositiveNumeric(form.applicationNumber) ||
      !isPositiveNumeric(form.purchaseOfferAmount) ||
      !isValidIsoDate(form.purchaseOfferDate) ||
      !isValidIsoDate(form.offerEndDate)
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
      const result = await submitProvincialOfferCreate(form)
      const responseMessage = [result.message, ...result.errors, ...result.warnings]
        .filter((value) => value.trim().length > 0)
        .join(' ')

      if (result.success) {
        if (result.createdId) {
          navigate(`/provincial/offers/${encodeURIComponent(result.createdId)}`)
          return
        }
        setStatus({
          kind: 'success',
          title: 'Offer Submitted',
          message: responseMessage || 'Offer submitted successfully.',
        })
        return
      }

      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message: responseMessage || 'Unable to submit provincial offer create request.',
      })
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message: 'Unable to submit provincial offer create request.',
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
        <h1>Create Provincial Offer</h1>
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
              id="offerNumber"
              labelText="Offer Number (required)"
              value={form.offerNumber}
              invalid={!isPositiveNumeric(form.offerNumber)}
              invalidText="Use a positive numeric value."
              onChange={(event) =>
                setForm((current) => ({ ...current, offerNumber: event.target.value }))
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
              id="offeringClientNumber"
              labelText="Offering Client Number (required)"
              value={form.offeringClientNumber}
              onChange={(event) =>
                setForm((current) => ({ ...current, offeringClientNumber: event.target.value }))
              }
            />
            <TextInput
              id="companyName"
              labelText="Company Name (required)"
              value={form.companyName}
              onChange={(event) =>
                setForm((current) => ({ ...current, companyName: event.target.value }))
              }
            />
            <TextInput
              id="contactName"
              labelText="Contact Name (required)"
              value={form.contactName}
              onChange={(event) =>
                setForm((current) => ({ ...current, contactName: event.target.value }))
              }
            />
            <Select
              id="region"
              labelText="Region"
              value={form.region}
              onChange={(event) =>
                setForm((current) => ({ ...current, region: event.target.value }))
              }
            >
              <SelectItem value="" text="Select region" />
              {regions.map((option) => (
                <SelectItem key={option.value} value={option.value} text={option.label} />
              ))}
            </Select>
            <TextInput
              id="purchaseOfferAmount"
              labelText="Offer Amount (required)"
              value={form.purchaseOfferAmount}
              invalid={!isPositiveNumeric(form.purchaseOfferAmount)}
              invalidText="Use a positive numeric value."
              onChange={(event) =>
                setForm((current) => ({ ...current, purchaseOfferAmount: event.target.value }))
              }
            />
            <TextInput
              id="purchaseOfferDate"
              labelText="Offer Date (YYYY-MM-DD) (required)"
              value={form.purchaseOfferDate}
              invalid={!isValidIsoDate(form.purchaseOfferDate)}
              invalidText="Date must be YYYY-MM-DD."
              onChange={(event) =>
                setForm((current) => ({ ...current, purchaseOfferDate: event.target.value }))
              }
            />
            <TextInput
              id="offerEndDate"
              labelText="Withdrawal Date (YYYY-MM-DD)"
              value={form.offerEndDate}
              invalid={!isValidIsoDate(form.offerEndDate)}
              invalidText="Date must be YYYY-MM-DD."
              onChange={(event) =>
                setForm((current) => ({ ...current, offerEndDate: event.target.value }))
              }
            />
            <TextInput
              id="withdrawReason"
              labelText="Withdraw Reason (required when withdrawn)"
              value={form.withdrawReason}
              onChange={(event) =>
                setForm((current) => ({ ...current, withdrawReason: event.target.value }))
              }
            />
            <TextInput
              id="pickupLocation"
              labelText="Pickup Location (required)"
              value={form.pickupLocation}
              onChange={(event) =>
                setForm((current) => ({ ...current, pickupLocation: event.target.value }))
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
            <Link className="cds--link" to="/provincial/offers">
              Back to Search
            </Link>
          </div>
          <div className="legacy-search-actions">
            <TextArea
              id="offerCondition"
              labelText="Offer Conditions / Remarks"
              value={form.offerCondition}
              onChange={(event) =>
                setForm((current) => ({ ...current, offerCondition: event.target.value }))
              }
            />
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <CreateDraftHistory
          title="Recent Offer Drafts"
          drafts={drafts}
          onUseDraft={onUseDraft}
          onDeleteDraft={onDeleteDraft}
          summarize={(payload) => {
            const value = payload as ProvincialOfferCreateForm
            return `${value.offerNumber || 'N/A'} / application ${value.applicationNumber || 'N/A'}`
          }}
        />
      </Column>
    </Grid>
  )
}

export default ProvincialOfferCreatePage
