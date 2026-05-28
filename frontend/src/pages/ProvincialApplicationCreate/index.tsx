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
import {
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'
import { submitProvincialApplicationCreate } from '@/service/create-submit-service'

type ProvincialApplicationCreateForm = {
  applicationNumber: string
  packageNumber: string
  ownerClientNumber: string
  applicantClientNumber: string
  productTypeCode: string
  exemptionType: string
  region: string
  receivedDate: string
  listingDate: string
  comments: string
}

const MODULE_KEY = 'provincial-application'

const INITIAL_FORM: ProvincialApplicationCreateForm = {
  applicationNumber: '',
  packageNumber: '',
  ownerClientNumber: '',
  applicantClientNumber: '',
  productTypeCode: '',
  exemptionType: '',
  region: '',
  receivedDate: '',
  listingDate: '',
  comments: '',
}

const mapDraftPayloadToForm = (payload: unknown): ProvincialApplicationCreateForm => {
  if (!payload || typeof payload !== 'object') {
    return INITIAL_FORM
  }

  return {
    ...INITIAL_FORM,
    ...(payload as Partial<ProvincialApplicationCreateForm>),
  }
}

const buildInitialFormFromQuery = (query: URLSearchParams): ProvincialApplicationCreateForm => {
  return {
    ...INITIAL_FORM,
    applicationNumber: query.get('applicationNumber') ?? '',
    packageNumber: query.get('packageNumber') ?? '',
    ownerClientNumber: query.get('ownerClientNumber') ?? '',
    applicantClientNumber: query.get('applicantClientNumber') ?? '',
    productTypeCode: query.get('productTypeCode') ?? '',
    exemptionType: query.get('exemptionType') ?? query.get('exemptionTypeCode') ?? '',
    region: query.get('region') ?? query.get('orgUnitNumber') ?? '',
    receivedDate: query.get('receivedDate') ?? '',
    listingDate: query.get('listingDate') ?? '',
    comments: query.get('comments') ?? '',
  }
}

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
}

const ProvincialApplicationCreatePage: FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState<ProvincialApplicationCreateForm>(() =>
    buildInitialFormFromQuery(searchParams),
  )
  const [productTypes, setProductTypes] = useState<SearchOption[]>([])
  const [exemptionTypes, setExemptionTypes] = useState<SearchOption[]>([])
  const [regions, setRegions] = useState<SearchOption[]>([])
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialApplicationOptions()
      setProductTypes(options.productTypes)
      setExemptionTypes(options.exemptionTypes)
      setRegions(options.regions)
    }

    void loadOptions()
  }, [])

  const hasValidationError = useMemo(() => {
    return (
      !normalizeText(form.applicationNumber) ||
      !normalizeText(form.packageNumber) ||
      !normalizeText(form.ownerClientNumber) ||
      !normalizeText(form.applicantClientNumber) ||
      !normalizeText(form.productTypeCode) ||
      !isPositiveNumeric(form.applicationNumber) ||
      !isValidIsoDate(form.receivedDate) ||
      !isValidIsoDate(form.listingDate)
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
      const result = await submitProvincialApplicationCreate(form)
      const responseMessage = [result.message, ...result.errors, ...result.warnings]
        .filter((value) => value.trim().length > 0)
        .join(' ')

      if (result.success) {
        if (result.createdId) {
          navigate(`/provincial/application/${encodeURIComponent(result.createdId)}`)
          return
        }
        setStatus({
          kind: 'success',
          title: 'Application Submitted',
          message: responseMessage || 'Application submitted successfully.',
        })
        return
      }

      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message: responseMessage || 'Unable to submit provincial application create request.',
      })
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Submit Failed',
        message: 'Unable to submit provincial application create request.',
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
        <h1>Create Provincial Application</h1>
        <p>Base create form for provincial application migration.</p>
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
            <Select
              id="productTypeCode"
              labelText="Product Type (required)"
              value={form.productTypeCode}
              onChange={(event) =>
                setForm((current) => ({ ...current, productTypeCode: event.target.value }))
              }
            >
              <SelectItem value="" text="Select product type" />
              {productTypes.map((option) => (
                <SelectItem key={option.value} value={option.value} text={option.label} />
              ))}
            </Select>
            <Select
              id="exemptionType"
              labelText="Exemption Type"
              value={form.exemptionType}
              onChange={(event) =>
                setForm((current) => ({ ...current, exemptionType: event.target.value }))
              }
            >
              <SelectItem value="" text="Select exemption type" />
              {exemptionTypes.map((option) => (
                <SelectItem key={option.value} value={option.value} text={option.label} />
              ))}
            </Select>
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
              id="receivedDate"
              labelText="Received Date (YYYY-MM-DD)"
              value={form.receivedDate}
              invalid={!isValidIsoDate(form.receivedDate)}
              invalidText="Date must be YYYY-MM-DD."
              onChange={(event) =>
                setForm((current) => ({ ...current, receivedDate: event.target.value }))
              }
            />
            <TextInput
              id="listingDate"
              labelText="Listing Date (YYYY-MM-DD)"
              value={form.listingDate}
              invalid={!isValidIsoDate(form.listingDate)}
              invalidText="Date must be YYYY-MM-DD."
              onChange={(event) =>
                setForm((current) => ({ ...current, listingDate: event.target.value }))
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
            <Button kind="secondary" onClick={() => setForm(INITIAL_FORM)}>
              Reset
            </Button>
            <Link className="cds--link" to="/provincial/application">
              Back to Search
            </Link>
          </div>
          <div className="legacy-search-actions">
            <TextArea
              id="applicationComments"
              labelText="Comments"
              value={form.comments}
              onChange={(event) =>
                setForm((current) => ({ ...current, comments: event.target.value }))
              }
            />
          </div>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <CreateDraftHistory
          title="Recent Application Drafts"
          drafts={drafts}
          onUseDraft={onUseDraft}
          onDeleteDraft={onDeleteDraft}
          summarize={(payload) => {
            const value = payload as ProvincialApplicationCreateForm
            return `${value.applicationNumber || 'N/A'} / ${value.packageNumber || 'N/A'}`
          }}
        />
      </Column>
    </Grid>
  )
}

export default ProvincialApplicationCreatePage
