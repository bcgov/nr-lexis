import { useEffect, useMemo, useState, type FC } from 'react'
import { Link } from 'react-router-dom'
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

const FALLBACK_PRODUCT_TYPES: SearchOption[] = [
  { value: 'LOG', label: 'Logs' },
  { value: 'LUM', label: 'Lumber' },
]

const FALLBACK_EXEMPTION_TYPES: SearchOption[] = [
  { value: 'SECTION_1', label: 'Section 1' },
  { value: 'SECTION_2', label: 'Section 2' },
]

const FALLBACK_REGIONS: SearchOption[] = [
  { value: '11', label: 'Cariboo' },
  { value: '12', label: 'Coast' },
]

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

const ProvincialApplicationCreatePage: FC = () => {
  const [form, setForm] = useState<ProvincialApplicationCreateForm>(INITIAL_FORM)
  const [productTypes, setProductTypes] = useState<SearchOption[]>(FALLBACK_PRODUCT_TYPES)
  const [exemptionTypes, setExemptionTypes] = useState<SearchOption[]>(FALLBACK_EXEMPTION_TYPES)
  const [regions, setRegions] = useState<SearchOption[]>(FALLBACK_REGIONS)
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialApplicationOptions()
      if (options.productTypes.length > 0) {
        setProductTypes(options.productTypes)
      }
      if (options.exemptionTypes.length > 0) {
        setExemptionTypes(options.exemptionTypes)
      }
      if (options.regions.length > 0) {
        setRegions(options.regions)
      }
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
      setStatus({ kind: 'error', message: 'Please fix validation errors before saving the draft.' })
      return
    }

    const saved = saveCreateDraft(MODULE_KEY, form)
    setDrafts(listCreateDrafts(MODULE_KEY))
    setStatus({ kind: 'success', message: `Draft ${saved.id} saved.` })
  }

  const onUseDraft = (record: CreateDraftRecord<unknown>) => {
    setForm(mapDraftPayloadToForm(record.payload))
    setStatus({ kind: 'success', message: `Draft ${record.id} loaded.` })
  }

  const onDeleteDraft = (draftId: string) => {
    const wasDeleted = deleteCreateDraft(MODULE_KEY, draftId)
    setDrafts(listCreateDrafts(MODULE_KEY))
    setStatus({
      kind: wasDeleted ? 'success' : 'error',
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
            title={status.kind === 'success' ? 'Draft Saved' : 'Validation Error'}
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
