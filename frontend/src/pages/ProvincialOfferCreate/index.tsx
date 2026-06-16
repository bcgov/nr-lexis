import { useEffect, useMemo, useState, type FC } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Column, Grid, InlineNotification, TextArea, TextInput, Tile } from '@carbon/react'
import ApplicationNumberSelect from '@/components/ApplicationNumberSelect'
import IsoDatePicker from '@/components/IsoDatePicker'
import SearchableSelect from '@/components/SearchableSelect'
import CreateDraftHistory from '@/pages/shared/CreateDraftHistory'
import {
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
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

type ProvincialOfferCreateField = keyof ProvincialOfferCreateForm & string

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
  const initialForm = useMemo(() => buildInitialFormFromQuery(searchParams), [searchParams])
  const [form, setForm] = useState<ProvincialOfferCreateForm>(() => initialForm)
  const [regions, setRegions] = useState<SearchOption[]>([])
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<ProvincialOfferCreateField>>({})
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialOfferOptions()
      setRegions(options.regions)
    }

    void loadOptions()
  }, [])

  const fieldErrors = useMemo<FieldErrors<ProvincialOfferCreateField>>(
    () => ({
      offerNumber: firstValidationError(
        () => requiredFieldError(form.offerNumber, 'Offer number'),
        () => positiveNumericFieldError(form.offerNumber),
      ),
      applicationNumber: firstValidationError(
        () => requiredFieldError(form.applicationNumber, 'Application number'),
        () => positiveNumericFieldError(form.applicationNumber),
      ),
      packageNumber: requiredFieldError(form.packageNumber, 'Package number') ?? undefined,
      offeringClientNumber:
        requiredFieldError(form.offeringClientNumber, 'Offering client number') ?? undefined,
      companyName: requiredFieldError(form.companyName, 'Company name') ?? undefined,
      contactName: requiredFieldError(form.contactName, 'Contact name') ?? undefined,
      purchaseOfferAmount: firstValidationError(
        () => requiredFieldError(form.purchaseOfferAmount, 'Offer amount'),
        () => positiveNumericFieldError(form.purchaseOfferAmount),
      ),
      purchaseOfferDate: firstValidationError(
        () => requiredFieldError(form.purchaseOfferDate, 'Offer date'),
        () => isoDateFieldError(form.purchaseOfferDate),
      ),
      offerEndDate: isoDateFieldError(form.offerEndDate) ?? undefined,
      withdrawReason:
        form.offerEndDate.trim().length > 0
          ? (requiredFieldError(form.withdrawReason, 'Withdraw reason') ?? undefined)
          : undefined,
      pickupLocation: requiredFieldError(form.pickupLocation, 'Pickup location') ?? undefined,
    }),
    [form],
  )
  const hasValidationError = useMemo(
    () => Object.values(fieldErrors).some((error) => !!error),
    [fieldErrors],
  )

  const markFieldTouched = (field: ProvincialOfferCreateField): void => {
    setTouchedFields((current) => ({ ...current, [field]: true }))
  }

  const fieldError = (field: ProvincialOfferCreateField): string | undefined =>
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
      const validationMessage =
        Object.values(fieldErrors).find((error): error is string => !!error) ??
        'Please fix validation errors before submitting.'
      setShowAllValidationErrors(true)
      setStatus({
        kind: 'error',
        title: 'Validation Error',
        message: validationMessage,
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
    setForm(mergeCreateDraftPayload(record.payload, INITIAL_FORM))
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
              invalid={!!fieldError('offerNumber')}
              invalidText={fieldError('offerNumber')}
              onBlur={() => markFieldTouched('offerNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, offerNumber: event.target.value }))
              }
            />
            <ApplicationNumberSelect
              id="applicationNumber"
              labelText="Application Number (required)"
              value={form.applicationNumber}
              invalid={!!fieldError('applicationNumber')}
              invalidText={fieldError('applicationNumber')}
              onBlur={() => markFieldTouched('applicationNumber')}
              onChange={(value) => setForm((current) => ({ ...current, applicationNumber: value }))}
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
              id="offeringClientNumber"
              labelText="Offering Client Number (required)"
              value={form.offeringClientNumber}
              invalid={!!fieldError('offeringClientNumber')}
              invalidText={fieldError('offeringClientNumber')}
              onBlur={() => markFieldTouched('offeringClientNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, offeringClientNumber: event.target.value }))
              }
            />
            <TextInput
              id="companyName"
              labelText="Company Name (required)"
              value={form.companyName}
              invalid={!!fieldError('companyName')}
              invalidText={fieldError('companyName')}
              onBlur={() => markFieldTouched('companyName')}
              onChange={(event) =>
                setForm((current) => ({ ...current, companyName: event.target.value }))
              }
            />
            <TextInput
              id="contactName"
              labelText="Contact Name (required)"
              value={form.contactName}
              invalid={!!fieldError('contactName')}
              invalidText={fieldError('contactName')}
              onBlur={() => markFieldTouched('contactName')}
              onChange={(event) =>
                setForm((current) => ({ ...current, contactName: event.target.value }))
              }
            />
            <SearchableSelect
              id="region"
              labelText="Region"
              value={form.region}
              placeholder="Select region"
              options={regions}
              onChange={(value) => setForm((current) => ({ ...current, region: value }))}
            />
            <TextInput
              id="purchaseOfferAmount"
              labelText="Offer Amount (required)"
              value={form.purchaseOfferAmount}
              invalid={!!fieldError('purchaseOfferAmount')}
              invalidText={fieldError('purchaseOfferAmount')}
              onBlur={() => markFieldTouched('purchaseOfferAmount')}
              onChange={(event) =>
                setForm((current) => ({ ...current, purchaseOfferAmount: event.target.value }))
              }
            />
            <IsoDatePicker
              id="purchaseOfferDate"
              labelText="Offer Date (YYYY-MM-DD) (required)"
              value={form.purchaseOfferDate}
              invalid={!!fieldError('purchaseOfferDate')}
              invalidText={fieldError('purchaseOfferDate')}
              onBlur={() => markFieldTouched('purchaseOfferDate')}
              onChange={(value) => setForm((current) => ({ ...current, purchaseOfferDate: value }))}
            />
            <IsoDatePicker
              id="offerEndDate"
              labelText="Withdrawal Date (YYYY-MM-DD)"
              value={form.offerEndDate}
              invalid={!!fieldError('offerEndDate')}
              invalidText={fieldError('offerEndDate')}
              onBlur={() => markFieldTouched('offerEndDate')}
              onChange={(value) => setForm((current) => ({ ...current, offerEndDate: value }))}
            />
            <TextInput
              id="withdrawReason"
              labelText="Withdraw Reason (required when withdrawn)"
              value={form.withdrawReason}
              invalid={!!fieldError('withdrawReason')}
              invalidText={fieldError('withdrawReason')}
              onBlur={() => markFieldTouched('withdrawReason')}
              onChange={(event) =>
                setForm((current) => ({ ...current, withdrawReason: event.target.value }))
              }
            />
            <TextInput
              id="pickupLocation"
              labelText="Pickup Location (required)"
              value={form.pickupLocation}
              invalid={!!fieldError('pickupLocation')}
              invalidText={fieldError('pickupLocation')}
              onBlur={() => markFieldTouched('pickupLocation')}
              onChange={(event) =>
                setForm((current) => ({ ...current, pickupLocation: event.target.value }))
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
