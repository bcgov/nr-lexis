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
  listCreateDrafts,
  saveCreateDraft,
  type CreateDraftRecord,
} from '@/service/create-draft-service'
import { fetchProvincialOfferOptions, type SearchOption } from '@/service/search-options-service'

type ProvincialOfferCreateForm = {
  offerNumber: string
  applicationNumber: string
  packageNumber: string
  offeringClientNumber: string
  region: string
  purchaseOfferAmount: string
  purchaseOfferDate: string
  offerEndDate: string
  pickupLocation: string
  offerCondition: string
}

const MODULE_KEY = 'provincial-offer'

const FALLBACK_REGIONS: SearchOption[] = [
  { value: '11', label: 'Cariboo' },
  { value: '12', label: 'Coast' },
]

const INITIAL_FORM: ProvincialOfferCreateForm = {
  offerNumber: '',
  applicationNumber: '',
  packageNumber: '',
  offeringClientNumber: '',
  region: '',
  purchaseOfferAmount: '',
  purchaseOfferDate: '',
  offerEndDate: '',
  pickupLocation: '',
  offerCondition: '',
}

const ProvincialOfferCreatePage: FC = () => {
  const [form, setForm] = useState<ProvincialOfferCreateForm>(INITIAL_FORM)
  const [regions, setRegions] = useState<SearchOption[]>(FALLBACK_REGIONS)
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialOfferOptions()
      if (options.regions.length > 0) {
        setRegions(options.regions)
      }
    }

    void loadOptions()
  }, [])

  const hasValidationError = useMemo(() => {
    return (
      !normalizeText(form.offerNumber) ||
      !normalizeText(form.applicationNumber) ||
      !normalizeText(form.packageNumber) ||
      !normalizeText(form.offeringClientNumber) ||
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
      setStatus({ kind: 'error', message: 'Please fix validation errors before saving the draft.' })
      return
    }

    const saved = saveCreateDraft(MODULE_KEY, form)
    setDrafts(listCreateDrafts(MODULE_KEY))
    setStatus({ kind: 'success', message: `Draft ${saved.id} saved.` })
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Create Provincial Offer</h1>
        <p>Base create form for provincial offer migration.</p>
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
              labelText="Offer Date (YYYY-MM-DD)"
              value={form.purchaseOfferDate}
              invalid={!isValidIsoDate(form.purchaseOfferDate)}
              invalidText="Date must be YYYY-MM-DD."
              onChange={(event) =>
                setForm((current) => ({ ...current, purchaseOfferDate: event.target.value }))
              }
            />
            <TextInput
              id="offerEndDate"
              labelText="Offer End Date (YYYY-MM-DD)"
              value={form.offerEndDate}
              invalid={!isValidIsoDate(form.offerEndDate)}
              invalidText="Date must be YYYY-MM-DD."
              onChange={(event) =>
                setForm((current) => ({ ...current, offerEndDate: event.target.value }))
              }
            />
            <TextInput
              id="pickupLocation"
              labelText="Pickup Location"
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
            <Button kind="secondary" onClick={() => setForm(INITIAL_FORM)}>
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
