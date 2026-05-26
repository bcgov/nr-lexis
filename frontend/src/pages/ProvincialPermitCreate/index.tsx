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

const FALLBACK_PERMIT_STATUSES: SearchOption[] = [
  { value: 'Issued', label: 'Issued' },
  { value: 'Active', label: 'Active' },
]

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

const ProvincialPermitCreatePage: FC = () => {
  const [form, setForm] = useState<ProvincialPermitCreateForm>(INITIAL_FORM)
  const [permitStatuses, setPermitStatuses] = useState<SearchOption[]>(FALLBACK_PERMIT_STATUSES)
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialPermitOptions()
      if (options.permitStatuses.length > 0) {
        setPermitStatuses(options.permitStatuses)
      }
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
        <h1>Create Provincial Permit</h1>
        <p>Base create form for provincial permit migration.</p>
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
            <Button kind="secondary" onClick={() => setForm(INITIAL_FORM)}>
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
