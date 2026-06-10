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
import {
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
  maxLengthFieldError,
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
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'
import { submitProvincialApplicationCreate } from '@/service/create-submit-service'

type ProvincialApplicationCreateForm = {
  applicationNumber: string
  packageNumber: string
  ownerClientNumber: string
  ownerClientLocationCode: string
  ownerContactName: string
  applicantClientNumber: string
  productTypeCode: string
  exemptionType: string
  region: string
  applicationDate: string
  applicationTermDays: string
  receivedDate: string
  listingDate: string
  productLocation: string
  applicationVolume: string
  comments: string
}

type ProvincialApplicationCreateField = keyof ProvincialApplicationCreateForm & string

const MODULE_KEY = 'provincial-application'

const INITIAL_FORM: ProvincialApplicationCreateForm = {
  applicationNumber: '',
  packageNumber: '',
  ownerClientNumber: '',
  ownerClientLocationCode: '',
  ownerContactName: '',
  applicantClientNumber: '',
  productTypeCode: '',
  exemptionType: '',
  region: '',
  applicationDate: '',
  applicationTermDays: '',
  receivedDate: '',
  listingDate: '',
  productLocation: '',
  applicationVolume: '',
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
    ownerClientLocationCode:
      query.get('ownerClientLocationCode') ?? query.get('ownerClientLocation') ?? '',
    ownerContactName: query.get('ownerContactName') ?? query.get('ownerName') ?? '',
    applicantClientNumber: query.get('applicantClientNumber') ?? '',
    productTypeCode: query.get('productTypeCode') ?? '',
    exemptionType:
      query.get('exemptionReason') ??
      query.get('exemptionReasonCode') ??
      query.get('exemptionType') ??
      query.get('exemptionTypeCode') ??
      '',
    region: query.get('region') ?? query.get('orgUnitNumber') ?? '',
    applicationDate: query.get('applicationDate') ?? '',
    applicationTermDays:
      query.get('applicationTermDays') ?? query.get('exemptionTerm') ?? query.get('termDays') ?? '',
    receivedDate: query.get('receivedDate') ?? '',
    listingDate: query.get('listingDate') ?? '',
    productLocation: query.get('productLocation') ?? query.get('logLocation') ?? '',
    applicationVolume: query.get('applicationVolume') ?? '',
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
  const [exemptionReasons, setExemptionReasons] = useState<SearchOption[]>([])
  const [regions, setRegions] = useState<SearchOption[]>([])
  const [drafts, setDrafts] = useState<CreateDraftRecord<unknown>[]>(() =>
    listCreateDrafts(MODULE_KEY),
  )
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touchedFields, setTouchedFields] = useState<
    TouchedFields<ProvincialApplicationCreateField>
  >({})
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)

  useEffect(() => {
    const loadOptions = async () => {
      const options = await fetchProvincialApplicationOptions()
      setProductTypes(options.productTypes)
      setExemptionReasons(options.exemptionReasons)
      setRegions(options.regions)
    }

    void loadOptions()
  }, [])

  const fieldErrors = useMemo<FieldErrors<ProvincialApplicationCreateField>>(
    () => ({
      applicationNumber: firstValidationError(
        () => requiredFieldError(form.applicationNumber, 'Application number'),
        () => positiveNumericFieldError(form.applicationNumber),
      ),
      packageNumber: requiredFieldError(form.packageNumber, 'Package number') ?? undefined,
      ownerClientNumber:
        requiredFieldError(form.ownerClientNumber, 'Owner client number') ?? undefined,
      ownerClientLocationCode: firstValidationError(
        () => requiredFieldError(form.ownerClientLocationCode, 'Owner client location code'),
        () => maxLengthFieldError(form.ownerClientLocationCode, 2, 'Owner client location code'),
      ),
      ownerContactName: requiredFieldError(form.ownerContactName, 'Owner name') ?? undefined,
      applicantClientNumber:
        requiredFieldError(form.applicantClientNumber, 'Applicant client number') ?? undefined,
      productTypeCode: requiredFieldError(form.productTypeCode, 'Product type') ?? undefined,
      exemptionType: firstValidationError(
        () => requiredFieldError(form.exemptionType, 'Exemption reason'),
        () => maxLengthFieldError(form.exemptionType, 1, 'Exemption reason code'),
      ),
      region: requiredFieldError(form.region, 'Region') ?? undefined,
      applicationDate: firstValidationError(
        () => requiredFieldError(form.applicationDate, 'Application date'),
        () => isoDateFieldError(form.applicationDate),
      ),
      applicationTermDays: firstValidationError(
        () => requiredFieldError(form.applicationTermDays, 'Application term days'),
        () => positiveNumericFieldError(form.applicationTermDays),
      ),
      receivedDate: firstValidationError(
        () => requiredFieldError(form.receivedDate, 'Received date'),
        () => isoDateFieldError(form.receivedDate),
      ),
      listingDate: isoDateFieldError(form.listingDate) ?? undefined,
      productLocation: requiredFieldError(form.productLocation, 'Location of logs') ?? undefined,
      applicationVolume: firstValidationError(
        () => requiredFieldError(form.applicationVolume, 'Application volume'),
        () => positiveNumericFieldError(form.applicationVolume),
      ),
    }),
    [form],
  )
  const hasValidationError = useMemo(
    () => Object.values(fieldErrors).some((error) => !!error),
    [fieldErrors],
  )
  const missingRequiredOptions = productTypes.length === 0

  const markFieldTouched = (field: ProvincialApplicationCreateField): void => {
    setTouchedFields((current) => ({ ...current, [field]: true }))
  }

  const fieldError = (field: ProvincialApplicationCreateField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showAllValidationErrors)

  const onSaveDraft = () => {
    setStatus(null)
    if (hasValidationError) {
      setShowAllValidationErrors(true)
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
      setShowAllValidationErrors(true)
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
        <h1>Create Provincial Application</h1>
      </Column>

      {missingRequiredOptions && (
        <Column sm={4} md={8} lg={16}>
          <InlineNotification
            kind="warning"
            title="Required options unavailable"
            subtitle="Product type values are unavailable. Submit remains disabled until a valid product type is available."
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
              id="applicationNumber"
              labelText="Application Number (required)"
              value={form.applicationNumber}
              invalid={!!fieldError('applicationNumber')}
              invalidText={fieldError('applicationNumber')}
              onBlur={() => markFieldTouched('applicationNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicationNumber: event.target.value }))
              }
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
              id="ownerClientNumber"
              labelText="Owner Client Number (required)"
              value={form.ownerClientNumber}
              invalid={!!fieldError('ownerClientNumber')}
              invalidText={fieldError('ownerClientNumber')}
              onBlur={() => markFieldTouched('ownerClientNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, ownerClientNumber: event.target.value }))
              }
            />
            <TextInput
              id="ownerClientLocationCode"
              labelText="Owner Client Location Code (required)"
              maxLength={2}
              value={form.ownerClientLocationCode}
              invalid={!!fieldError('ownerClientLocationCode')}
              invalidText={fieldError('ownerClientLocationCode')}
              onBlur={() => markFieldTouched('ownerClientLocationCode')}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  ownerClientLocationCode: event.target.value,
                }))
              }
            />
            <TextInput
              id="ownerContactName"
              labelText="Owner Name (required)"
              value={form.ownerContactName}
              invalid={!!fieldError('ownerContactName')}
              invalidText={fieldError('ownerContactName')}
              onBlur={() => markFieldTouched('ownerContactName')}
              onChange={(event) =>
                setForm((current) => ({ ...current, ownerContactName: event.target.value }))
              }
            />
            <TextInput
              id="applicantClientNumber"
              labelText="Applicant Client Number (required)"
              value={form.applicantClientNumber}
              invalid={!!fieldError('applicantClientNumber')}
              invalidText={fieldError('applicantClientNumber')}
              onBlur={() => markFieldTouched('applicantClientNumber')}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicantClientNumber: event.target.value }))
              }
            />
            <Select
              id="productTypeCode"
              labelText="Product Type (required)"
              value={form.productTypeCode}
              invalid={!!fieldError('productTypeCode')}
              invalidText={fieldError('productTypeCode')}
              onBlur={() => markFieldTouched('productTypeCode')}
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
              labelText="Exemption Reason (required)"
              value={form.exemptionType}
              invalid={!!fieldError('exemptionType')}
              invalidText={fieldError('exemptionType')}
              onBlur={() => markFieldTouched('exemptionType')}
              onChange={(event) =>
                setForm((current) => ({ ...current, exemptionType: event.target.value }))
              }
            >
              <SelectItem value="" text="Select exemption reason" />
              {exemptionReasons.map((option) => (
                <SelectItem key={option.value} value={option.value} text={option.label} />
              ))}
            </Select>
            <Select
              id="region"
              labelText="Region (required)"
              value={form.region}
              invalid={!!fieldError('region')}
              invalidText={fieldError('region')}
              onBlur={() => markFieldTouched('region')}
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
              id="applicationDate"
              labelText="Application Date (YYYY-MM-DD) (required)"
              value={form.applicationDate}
              invalid={!!fieldError('applicationDate')}
              invalidText={fieldError('applicationDate')}
              onBlur={() => markFieldTouched('applicationDate')}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicationDate: event.target.value }))
              }
            />
            <TextInput
              id="applicationTermDays"
              labelText="Application Term Days (required)"
              value={form.applicationTermDays}
              invalid={!!fieldError('applicationTermDays')}
              invalidText={fieldError('applicationTermDays')}
              onBlur={() => markFieldTouched('applicationTermDays')}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicationTermDays: event.target.value }))
              }
            />
            <TextInput
              id="receivedDate"
              labelText="Received Date (YYYY-MM-DD) (required)"
              value={form.receivedDate}
              invalid={!!fieldError('receivedDate')}
              invalidText={fieldError('receivedDate')}
              onBlur={() => markFieldTouched('receivedDate')}
              onChange={(event) =>
                setForm((current) => ({ ...current, receivedDate: event.target.value }))
              }
            />
            <TextInput
              id="listingDate"
              labelText="Listing Date (YYYY-MM-DD)"
              value={form.listingDate}
              invalid={!!fieldError('listingDate')}
              invalidText={fieldError('listingDate')}
              onBlur={() => markFieldTouched('listingDate')}
              onChange={(event) =>
                setForm((current) => ({ ...current, listingDate: event.target.value }))
              }
            />
            <TextArea
              id="productLocation"
              labelText="Location of Logs (required)"
              maxCount={250}
              value={form.productLocation}
              invalid={!!fieldError('productLocation')}
              invalidText={fieldError('productLocation')}
              onBlur={() => markFieldTouched('productLocation')}
              onChange={(event) =>
                setForm((current) => ({ ...current, productLocation: event.target.value }))
              }
            />
            <TextInput
              id="applicationVolume"
              labelText="Application Volume (required)"
              value={form.applicationVolume}
              invalid={!!fieldError('applicationVolume')}
              invalidText={fieldError('applicationVolume')}
              onBlur={() => markFieldTouched('applicationVolume')}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicationVolume: event.target.value }))
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
                setForm(INITIAL_FORM)
                setTouchedFields({})
                setShowAllValidationErrors(false)
              }}
            >
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
