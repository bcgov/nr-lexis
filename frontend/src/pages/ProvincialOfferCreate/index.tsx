import { useEffect, useMemo, useReducer, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Column, Grid, TextArea, TextInput, Tile } from '@carbon/react'
import { AppNotification } from '../../components/AppNotification'
import IsoDatePicker from '../../components/IsoDatePicker'
import SearchableSelect from '../../components/SearchableSelect'
import {
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
  positiveNumericFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { useAuth } from '@/context/auth/useAuth'
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
  offerVolume: string
  purchaseOfferAmount: string
  purchaseOfferDate: string
  offerWithdrawalDate: string
  withdrawReason: string
  teacReviewDate: string
  fairOfferIndicator: string
  validOfferIndicator: string
  approvalIndicator: string
  offerRemark: string
  pickupLocation: string
  offerCondition: string
  offerInEffectUntil: string
}

type ProvincialOfferCreateField = keyof ProvincialOfferCreateForm & string

const INITIAL_FORM: ProvincialOfferCreateForm = {
  applicationNumber: '',
  packageNumber: '',
  offeringClientNumber: '',
  companyName: '',
  contactName: '',
  region: '',
  offerVolume: '',
  purchaseOfferAmount: '',
  purchaseOfferDate: '',
  offerWithdrawalDate: '',
  withdrawReason: '',
  teacReviewDate: '',
  fairOfferIndicator: 'N',
  validOfferIndicator: 'Y',
  approvalIndicator: 'N',
  offerRemark: '',
  pickupLocation: '',
  offerCondition: '',
  offerInEffectUntil: '',
}

const YES_NO_OPTIONS: SearchOption[] = [
  { value: 'Y', label: 'Yes' },
  { value: 'N', label: 'No' },
]

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
    offerVolume: query.get('offerVolume') ?? '',
    purchaseOfferAmount: query.get('purchaseOfferAmount') ?? '',
    purchaseOfferDate: query.get('purchaseOfferDate') ?? '',
    offerWithdrawalDate: query.get('offerWithdrawalDate') ?? query.get('offerEndDate') ?? '',
    withdrawReason: query.get('withdrawReason') ?? '',
    teacReviewDate: query.get('teacReviewDate') ?? '',
    fairOfferIndicator: query.get('fairOfferIndicator') ?? INITIAL_FORM.fairOfferIndicator,
    validOfferIndicator: query.get('validOfferIndicator') ?? INITIAL_FORM.validOfferIndicator,
    approvalIndicator: query.get('approvalIndicator') ?? INITIAL_FORM.approvalIndicator,
    offerRemark: query.get('offerRemark') ?? '',
    pickupLocation: query.get('pickupLocation') ?? '',
    offerCondition: query.get('offerCondition') ?? '',
    offerInEffectUntil: query.get('offerInEffectUntil') ?? query.get('offerEndDisplayDate') ?? '',
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

const ProvincialOfferCreatePage = () => {
  const navigate = useNavigate()
  const { capabilities } = useAuth()
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
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<ProvincialOfferCreateField>>({})
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)
  const author = capabilities.principal ?? ''
  const hasApplicationNumber = form.applicationNumber.trim().length > 0
  const hasNoPackagesForApplication =
    hasApplicationNumber &&
    !isLoadingApplicationContext &&
    applicationDetails !== null &&
    packageOptions.length === 0

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
        () =>
          packageOptions.length > 0
            ? requiredFieldError(form.packageNumber, 'Package number')
            : null,
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
      offerVolume: positiveNumericFieldError(form.offerVolume) ?? undefined,
      purchaseOfferAmount: firstValidationError(
        () => requiredFieldError(form.purchaseOfferAmount, 'Offer amount'),
        () => positiveNumericFieldError(form.purchaseOfferAmount),
      ),
      purchaseOfferDate: firstValidationError(
        () => requiredFieldError(form.purchaseOfferDate, 'Offer date'),
        () => isoDateFieldError(form.purchaseOfferDate),
      ),
      offerWithdrawalDate: isoDateFieldError(form.offerWithdrawalDate) ?? undefined,
      withdrawReason:
        form.offerWithdrawalDate.trim().length > 0
          ? (requiredFieldError(form.withdrawReason, 'Withdraw reason') ?? undefined)
          : undefined,
      teacReviewDate: isoDateFieldError(form.teacReviewDate) ?? undefined,
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

  const onSave = async () => {
    if (hasValidationError) {
      const validationMessage =
        Object.values(fieldErrors).find((error): error is string => !!error) ??
        'Please fix validation errors before saving.'
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
      const result = await submitProvincialOfferCreate({
        ...form,
        teacReviewDate: form.teacReviewDate || applicationDetails?.teacReviewDate || '',
      })
      if (result.success) {
        if (result.createdId) {
          navigate(`/provincial/offers/${encodeURIComponent(result.createdId)}`)
          return
        }
        setStatus({
          kind: 'success',
          title: 'Offer saved',
          message: 'Offer saved successfully.',
        })
        return
      }

      setStatus({
        kind: 'error',
        title: 'Save failed',
        message:
          'Offer save failed. Please review the form and try again. If the problem persists, contact support.',
      })
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Save failed',
        message:
          'Offer save failed. Please review the form and try again. If the problem persists, contact support.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Grid fullWidth className="default-grid provincial-offer-create-page">
      <Column sm={4} md={8} lg={16}>
        <div className="application-detail-title-row">
          <h1>Provincial offers</h1>
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
        <Tile className="provincial-offer-create">
          <fieldset className="legacy-form-fieldset">
            <legend>Application details</legend>
            <div className="legacy-search-grid">
              <TextInput
                id="applicationNumber"
                labelText="Application number"
                value={form.applicationNumber}
                invalid={!!fieldError('applicationNumber')}
                invalidText={fieldError('applicationNumber')}
                onBlur={() => markFieldTouched('applicationNumber')}
                onChange={(event) =>
                  setForm((current) => ({ ...current, applicationNumber: event.target.value }))
                }
              />
              {packageOptions.length > 0 ? (
                <SearchableSelect
                  id="packageNumber"
                  labelText="Package number"
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
                  labelText="Package number"
                  value={hasNoPackagesForApplication ? 'No Packages' : form.packageNumber}
                  readOnly={hasNoPackagesForApplication}
                  invalid={!!fieldError('packageNumber')}
                  invalidText={fieldError('packageNumber')}
                  onBlur={() => markFieldTouched('packageNumber')}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, packageNumber: event.target.value }))
                  }
                />
              )}
            </div>
            <div className="legacy-search-actions">
              <Button
                kind="ghost"
                size="sm"
                disabled={!form.applicationNumber.trim() || !form.packageNumber.trim()}
                onClick={() => {
                  const params = new URLSearchParams({ packageFilter: form.packageNumber.trim() })
                  navigate(`/provincial/application/${form.applicationNumber.trim()}?${params}`)
                }}
              >
                See Scale Detail
              </Button>
            </div>
          </fieldset>

          <fieldset className="legacy-form-fieldset">
            <legend>Offering company details</legend>
            <div className="legacy-search-grid">
              <TextInput
                id="offeringClientNumber"
                labelText="Offering client number"
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
                labelText="Company"
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
                labelText="Contact name"
                value={form.contactName}
                invalid={!!fieldError('contactName')}
                invalidText={fieldError('contactName')}
                onBlur={() => markFieldTouched('contactName')}
                onChange={(event) =>
                  setForm((current) => ({ ...current, contactName: event.target.value }))
                }
              />
            </div>
          </fieldset>

          <fieldset className="legacy-form-fieldset">
            <legend>Offer details</legend>
            <div className="legacy-search-grid">
              {contextVolume && (
                <TextInput
                  id="applicationPackageVolume"
                  labelText="Application/package volume (m³)"
                  value={contextVolume}
                  readOnly
                />
              )}
              <TextInput
                id="offerVolume"
                labelText="Offer volume (m³)"
                value={form.offerVolume}
                invalid={!!fieldError('offerVolume')}
                invalidText={fieldError('offerVolume')}
                onBlur={() => markFieldTouched('offerVolume')}
                onChange={(event) =>
                  setForm((current) => ({ ...current, offerVolume: event.target.value }))
                }
              />
              {applicationDetails?.speciesGradeCode && (
                <TextInput
                  id="speciesGradeCode"
                  labelText="Species/grade"
                  value={applicationDetails.speciesGradeCode}
                  readOnly
                />
              )}
              <TextInput
                id="purchaseOfferAmount"
                labelText="Offer amount ($/m³)"
                value={form.purchaseOfferAmount}
                invalid={!!fieldError('purchaseOfferAmount')}
                invalidText={fieldError('purchaseOfferAmount')}
                onBlur={() => markFieldTouched('purchaseOfferAmount')}
                onChange={(event) =>
                  setForm((current) => ({ ...current, purchaseOfferAmount: event.target.value }))
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
              <IsoDatePicker
                id="purchaseOfferDate"
                labelText="Offer received date"
                value={form.purchaseOfferDate}
                invalid={!!fieldError('purchaseOfferDate')}
                invalidText={fieldError('purchaseOfferDate')}
                onBlur={() => markFieldTouched('purchaseOfferDate')}
                onChange={(value) =>
                  setForm((current) => ({ ...current, purchaseOfferDate: value }))
                }
              />
              {applicationDetails?.advertisingDate && (
                <TextInput
                  id="advertisingDate"
                  labelText="Listing date"
                  value={applicationDetails.advertisingDate}
                  readOnly
                />
              )}
              {form.offerInEffectUntil && (
                <TextInput
                  id="offerInEffectUntil"
                  labelText="Offer in effect until"
                  value={form.offerInEffectUntil}
                  readOnly
                />
              )}
              <TextArea
                id="pickupLocation"
                labelText="Pickup location"
                value={form.pickupLocation}
                invalid={!!fieldError('pickupLocation')}
                invalidText={fieldError('pickupLocation')}
                onBlur={() => markFieldTouched('pickupLocation')}
                onChange={(event) =>
                  setForm((current) => ({ ...current, pickupLocation: event.target.value }))
                }
              />
              <TextArea
                id="offerCondition"
                labelText="Offer conditions / remarks"
                value={form.offerCondition}
                onChange={(event) =>
                  setForm((current) => ({ ...current, offerCondition: event.target.value }))
                }
              />
            </div>
          </fieldset>

          <fieldset className="legacy-form-fieldset">
            <legend>Offer withdrawals</legend>
            <div className="legacy-search-grid">
              <IsoDatePicker
                id="offerWithdrawalDate"
                labelText="Offer withdrawal date"
                value={form.offerWithdrawalDate}
                invalid={!!fieldError('offerWithdrawalDate')}
                invalidText={fieldError('offerWithdrawalDate')}
                onBlur={() => markFieldTouched('offerWithdrawalDate')}
                onChange={(value) =>
                  setForm((current) => ({ ...current, offerWithdrawalDate: value }))
                }
              />
              <TextArea
                id="withdrawReason"
                labelText="Offer withdrawal reason"
                value={form.withdrawReason}
                invalid={!!fieldError('withdrawReason')}
                invalidText={fieldError('withdrawReason')}
                onBlur={() => markFieldTouched('withdrawReason')}
                onChange={(event) =>
                  setForm((current) => ({ ...current, withdrawReason: event.target.value }))
                }
              />
            </div>
          </fieldset>

          <fieldset className="legacy-form-fieldset">
            <legend>Approval</legend>
            <div className="legacy-search-grid">
              <IsoDatePicker
                id="teacReviewDate"
                labelText="TEAC review date"
                value={form.teacReviewDate || applicationDetails?.teacReviewDate || ''}
                invalid={!!fieldError('teacReviewDate')}
                invalidText={fieldError('teacReviewDate')}
                onBlur={() => markFieldTouched('teacReviewDate')}
                onChange={(value) => setForm((current) => ({ ...current, teacReviewDate: value }))}
              />
              <SearchableSelect
                id="fairOfferIndicator"
                labelText="Fair market value"
                value={form.fairOfferIndicator}
                placeholder="Select value"
                options={YES_NO_OPTIONS}
                onChange={(value) =>
                  setForm((current) => ({ ...current, fairOfferIndicator: value }))
                }
              />
              <SearchableSelect
                id="validOfferIndicator"
                labelText="Valid offer"
                value={form.validOfferIndicator}
                placeholder="Select value"
                options={YES_NO_OPTIONS}
                onChange={(value) =>
                  setForm((current) => ({ ...current, validOfferIndicator: value }))
                }
              />
              <SearchableSelect
                id="approvalIndicator"
                labelText="Offer approved"
                value={form.approvalIndicator}
                placeholder="Select value"
                options={YES_NO_OPTIONS}
                onChange={(value) =>
                  setForm((current) => ({ ...current, approvalIndicator: value }))
                }
              />
              <TextArea
                id="offerRemark"
                labelText="Offer remarks"
                value={form.offerRemark}
                onChange={(event) =>
                  setForm((current) => ({ ...current, offerRemark: event.target.value }))
                }
              />
            </div>
          </fieldset>

          <div className="legacy-form-footer">
            <dl className="detail-field-grid">
              <div className="detail-field-item">
                <dt className="detail-field-label">Offer number</dt>
                <dd className="detail-field-value">New</dd>
              </div>
              <div className="detail-field-item">
                <dt className="detail-field-label">Author</dt>
                <dd className="detail-field-value">{author || 'Not available'}</dd>
              </div>
            </dl>
            <div className="legacy-search-actions">
              <Button
                kind="primary"
                onClick={() => void onSave()}
                disabled={isSubmitting || isLoadingApplicationContext}
              >
                Save
              </Button>
              <Button kind="secondary" onClick={() => navigate('/provincial/offers')}>
                Cancel
              </Button>
            </div>
          </div>
        </Tile>
      </Column>
    </Grid>
  )
}

export default ProvincialOfferCreatePage
