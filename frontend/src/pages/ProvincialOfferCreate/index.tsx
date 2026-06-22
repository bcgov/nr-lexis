import { useEffect, useMemo, useReducer, useState, type FC } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Column, Grid, TextArea, TextInput, Tile } from '@carbon/react'
import { AppNotification } from '@/components/AppNotification'
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
import {
  fetchOfferApplicationDetails,
  fetchOfferApplicationVolume,
  fetchOfferPackageList,
  fetchOfferPackageVolume,
  type OfferApplicationDetails,
} from '@/service/provincial-offer-create-service'
import { fetchProvincialOfferOptions, type SearchOption } from '@/service/search-options-service'

type ProvincialOfferCreateForm = {
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

const packageOptionsFromQuery = (query: URLSearchParams): SearchOption[] => {
  const packageNumbers = [
    query.get('packageNumber') ?? '',
    ...(query.get('packageNumbers') ?? '').split(','),
  ]
    .map((packageNumber) => packageNumber.trim())
    .filter((packageNumber) => packageNumber.length > 0)

  return Array.from(new Set(packageNumbers)).map((packageNumber) => ({
    value: packageNumber,
    label: packageNumber,
  }))
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
    purchaseOfferAmount: query.get('purchaseOfferAmount') ?? '',
    purchaseOfferDate: query.get('purchaseOfferDate') ?? '',
    offerEndDate: query.get('offerEndDate') ?? '',
    withdrawReason: query.get('withdrawReason') ?? '',
    pickupLocation: query.get('pickupLocation') ?? '',
    offerCondition: query.get('offerCondition') ?? '',
  }
}

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
}

type OfferApplicationContextState = {
  applicationDetails: OfferApplicationDetails | null
  applicationVolume: string
  packageOptions: SearchOption[]
  packageVolume: string
  isLoading: boolean
}

type OfferApplicationContextAction =
  | { type: 'reset'; packageOptions: SearchOption[] }
  | { type: 'loadStart' }
  | {
      type: 'loadSuccess'
      applicationDetails: OfferApplicationDetails | null
      applicationVolume: string
      packageOptions: SearchOption[]
    }
  | { type: 'loadFailure' }
  | { type: 'setPackageVolume'; packageVolume: string }

const createOfferApplicationContextState = (
  packageOptions: SearchOption[],
): OfferApplicationContextState => ({
  applicationDetails: null,
  applicationVolume: '',
  packageOptions,
  packageVolume: '',
  isLoading: false,
})

const offerApplicationContextReducer = (
  state: OfferApplicationContextState,
  action: OfferApplicationContextAction,
): OfferApplicationContextState => {
  switch (action.type) {
    case 'reset':
      return createOfferApplicationContextState(action.packageOptions)
    case 'loadStart':
      return { ...state, isLoading: true }
    case 'loadSuccess':
      return {
        ...state,
        applicationDetails: action.applicationDetails,
        applicationVolume: action.applicationVolume,
        packageOptions: action.packageOptions,
        isLoading: false,
      }
    case 'loadFailure':
      return {
        ...state,
        applicationDetails: null,
        applicationVolume: '',
        packageOptions: [],
        isLoading: false,
      }
    case 'setPackageVolume':
      return { ...state, packageVolume: action.packageVolume }
    default:
      return state
  }
}

const ProvincialOfferCreatePage: FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const initialForm = useMemo(
    () => buildInitialFormFromQuery(new URLSearchParams(searchParamsKey)),
    [searchParamsKey],
  )
  const queryPackageOptions = useMemo(
    () => packageOptionsFromQuery(new URLSearchParams(searchParamsKey)),
    [searchParamsKey],
  )
  const [form, setForm] = useState<ProvincialOfferCreateForm>(() => initialForm)
  const [regions, setRegions] = useState<SearchOption[]>([])
  const [applicationContext, dispatchApplicationContext] = useReducer(
    offerApplicationContextReducer,
    queryPackageOptions,
    createOfferApplicationContextState,
  )
  const {
    applicationDetails,
    applicationVolume,
    packageOptions,
    packageVolume,
    isLoading: isLoadingApplicationContext,
  } = applicationContext
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

  useEffect(() => {
    const applicationNumber = form.applicationNumber.trim()
    if (!applicationNumber) {
      dispatchApplicationContext({ type: 'reset', packageOptions: queryPackageOptions })
      return
    }

    let isActive = true
    dispatchApplicationContext({ type: 'loadStart' })
    void Promise.allSettled([
      fetchOfferApplicationDetails(applicationNumber),
      fetchOfferPackageList(applicationNumber),
      fetchOfferApplicationVolume(applicationNumber),
    ])
      .then(([detailsResult, packagesResult, volumeResult]) => {
        if (!isActive) {
          return
        }

        const packageNumbers = packagesResult.status === 'fulfilled' ? packagesResult.value : []
        const nextPackageOptions = packageNumbers.map((packageNumber) => ({
          value: packageNumber,
          label: packageNumber,
        }))
        dispatchApplicationContext({
          type: 'loadSuccess',
          applicationDetails:
            detailsResult.status === 'fulfilled' && detailsResult.value.success
              ? detailsResult.value
              : null,
          applicationVolume: volumeResult.status === 'fulfilled' ? volumeResult.value : '',
          packageOptions: nextPackageOptions,
        })
        setForm((current) => {
          if (current.applicationNumber.trim() !== applicationNumber) {
            return current
          }
          const firstPackageNumber = nextPackageOptions[0]?.value
          if (!firstPackageNumber) {
            return current.packageNumber ? { ...current, packageNumber: '' } : current
          }
          const selectedPackageNumber = current.packageNumber.trim()
          const hasSelectedPackage = nextPackageOptions.some(
            (option) => option.value === selectedPackageNumber,
          )
          if (hasSelectedPackage) {
            return current
          }
          return { ...current, packageNumber: firstPackageNumber }
        })
      })
      .catch(() => {
        if (isActive) {
          dispatchApplicationContext({ type: 'loadFailure' })
          setForm((current) =>
            current.applicationNumber.trim() === applicationNumber
              ? { ...current, packageNumber: '' }
              : current,
          )
        }
      })

    return () => {
      isActive = false
    }
  }, [form.applicationNumber, queryPackageOptions])

  useEffect(() => {
    const packageNumber = form.packageNumber.trim()
    if (!packageNumber) {
      dispatchApplicationContext({ type: 'setPackageVolume', packageVolume: '' })
      return
    }

    let isActive = true
    void fetchOfferPackageVolume(packageNumber)
      .then((volume) => {
        if (isActive) {
          dispatchApplicationContext({ type: 'setPackageVolume', packageVolume: volume })
        }
      })
      .catch(() => {
        if (isActive) {
          dispatchApplicationContext({ type: 'setPackageVolume', packageVolume: '' })
        }
      })

    return () => {
      isActive = false
    }
  }, [form.packageNumber])

  const contextVolume = form.packageNumber.trim() ? packageVolume : applicationVolume

  const fieldErrors = useMemo<FieldErrors<ProvincialOfferCreateField>>(
    () => ({
      applicationNumber: firstValidationError(
        () => requiredFieldError(form.applicationNumber, 'Application number'),
        () => positiveNumericFieldError(form.applicationNumber),
      ),
      packageNumber: firstValidationError(
        () => (isLoadingApplicationContext ? 'Wait for package list to load.' : null),
        () => requiredFieldError(form.packageNumber, 'Package number'),
        () =>
          packageOptions.length > 0 &&
          !packageOptions.some((option) => option.value === form.packageNumber.trim())
            ? 'Select a package from this application.'
            : null,
      ),
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
    [form, isLoadingApplicationContext, packageOptions],
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
    setStatus({ kind: 'success', title: 'Draft saved', message: `Draft ${saved.id} saved.` })
  }

  const onSubmit = async () => {
    if (hasValidationError) {
      const validationMessage =
        Object.values(fieldErrors).find((error): error is string => !!error) ??
        'Please fix validation errors before submitting.'
      setShowAllValidationErrors(true)
      setStatus({
        kind: 'error',
        title: 'Validation error',
        message: validationMessage,
      })
      return
    }

    setStatus(null)
    setIsSubmitting(true)
    try {
      const result = await submitProvincialOfferCreate(form)
      if (result.success) {
        if (result.createdId) {
          navigate(`/provincial/offers/${encodeURIComponent(result.createdId)}`)
          return
        }
        setStatus({
          kind: 'success',
          title: 'Offer submitted',
          message: 'Offer submitted successfully.',
        })
        return
      }

      setStatus({
        kind: 'error',
        title: 'Submit failed',
        message:
          'Offer submission failed. Please review the form and try again. If the problem persists, contact support.',
      })
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Submit failed',
        message:
          'Offer submission failed. Please review the form and try again. If the problem persists, contact support.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const onUseDraft = (record: CreateDraftRecord<unknown>) => {
    setForm(mergeCreateDraftPayload(record.payload, INITIAL_FORM))
    setTouchedFields({})
    setShowAllValidationErrors(false)
    setStatus({ kind: 'success', title: 'Draft loaded', message: `Draft ${record.id} loaded.` })
  }

  const onDeleteDraft = (draftId: string) => {
    const wasDeleted = deleteCreateDraft(MODULE_KEY, draftId)
    setDrafts(listCreateDrafts(MODULE_KEY))
    setStatus({
      kind: wasDeleted ? 'success' : 'error',
      title: wasDeleted ? 'Draft deleted' : 'Draft delete failed',
      message: wasDeleted ? `Draft ${draftId} deleted.` : `Draft ${draftId} was not found.`,
    })
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <div className="application-detail-title-row">
          <h1>Create provincial offer</h1>
          <dl
            className="application-detail-header-metrics"
            role="group"
            aria-label="New offer state"
          >
            <div>
              <dt>Offer number</dt>
              <dd>New</dd>
            </div>
          </dl>
        </div>
      </Column>

      {!!status && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind={status.kind}
            title={status.title}
            subtitle={status.message}
            lowContrast
            autoDismissMs={status.kind === 'success' ? 8000 : undefined}
            onCloseButtonClick={() => setStatus(null)}
          />
        </Column>
      )}

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-grid">
            <ApplicationNumberSelect
              id="applicationNumber"
              labelText="Application number (required)"
              value={form.applicationNumber}
              invalid={!!fieldError('applicationNumber')}
              invalidText={fieldError('applicationNumber')}
              onBlur={() => markFieldTouched('applicationNumber')}
              onChange={(value) => setForm((current) => ({ ...current, applicationNumber: value }))}
            />
            {packageOptions.length > 0 ? (
              <SearchableSelect
                id="packageNumber"
                labelText="Package number (required)"
                value={form.packageNumber}
                options={packageOptions}
                placeholder={
                  isLoadingApplicationContext ? 'Loading packages' : 'Select package number'
                }
                invalid={!!fieldError('packageNumber')}
                invalidText={fieldError('packageNumber')}
                onBlur={() => markFieldTouched('packageNumber')}
                onChange={(value) => setForm((current) => ({ ...current, packageNumber: value }))}
              />
            ) : (
              <TextInput
                id="packageNumber"
                labelText="Package number (required)"
                value={form.packageNumber}
                invalid={!!fieldError('packageNumber')}
                invalidText={fieldError('packageNumber')}
                onBlur={() => markFieldTouched('packageNumber')}
                onChange={(event) =>
                  setForm((current) => ({ ...current, packageNumber: event.target.value }))
                }
              />
            )}
            {contextVolume && (
              <TextInput
                id="applicationPackageVolume"
                labelText="Application/package volume (m3)"
                value={contextVolume}
                readOnly
              />
            )}
            {applicationDetails?.speciesGradeCode && (
              <TextInput
                id="speciesGradeCode"
                labelText="Species/grade"
                value={applicationDetails.speciesGradeCode}
                readOnly
              />
            )}
            {applicationDetails?.advertisingDate && (
              <TextInput
                id="advertisingDate"
                labelText="Listing date"
                value={applicationDetails.advertisingDate}
                readOnly
              />
            )}
            <TextInput
              id="offeringClientNumber"
              labelText="Offering client number (required)"
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
              labelText="Company name (required)"
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
              labelText="Contact name (required)"
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
              labelText="Offer amount (required)"
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
              labelText="Offer date (YYYY-MM-DD) (required)"
              value={form.purchaseOfferDate}
              invalid={!!fieldError('purchaseOfferDate')}
              invalidText={fieldError('purchaseOfferDate')}
              onBlur={() => markFieldTouched('purchaseOfferDate')}
              onChange={(value) => setForm((current) => ({ ...current, purchaseOfferDate: value }))}
            />
            <IsoDatePicker
              id="offerEndDate"
              labelText="Withdrawal date (YYYY-MM-DD)"
              value={form.offerEndDate}
              invalid={!!fieldError('offerEndDate')}
              invalidText={fieldError('offerEndDate')}
              onBlur={() => markFieldTouched('offerEndDate')}
              onChange={(value) => setForm((current) => ({ ...current, offerEndDate: value }))}
            />
            <TextInput
              id="withdrawReason"
              labelText="Withdraw reason (required when withdrawn)"
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
              labelText="Pickup location (required)"
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
            <Button
              kind="primary"
              onClick={() => void onSubmit()}
              disabled={isSubmitting || isLoadingApplicationContext}
            >
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
              labelText="Offer conditions / remarks"
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
          title="Recent offer drafts"
          drafts={drafts}
          onUseDraft={onUseDraft}
          onDeleteDraft={onDeleteDraft}
          summarize={(payload) => {
            const value = payload as ProvincialOfferCreateForm
            return `new offer / application ${value.applicationNumber || 'N/A'}`
          }}
        />
      </Column>
    </Grid>
  )
}

export default ProvincialOfferCreatePage
