import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Column, Grid, TextArea, TextInput } from '@carbon/react'
import { AppNotification } from '../../components/AppNotification'
import IsoDatePicker from '../../components/IsoDatePicker'
import SearchableSelect from '../../components/SearchableSelect'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { hasProvincialSubmitterRole, hasRole } from '@/context/auth/role-utils'
import {
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
  positiveNumericFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'
import { useAuth } from '@/context/auth/useAuth'
import { submitProvincialOfferCreate } from '@/service/create-submit-service'
import {
  fetchOfferApplicationDetails,
  fetchOfferApplicationVolume,
  fetchOfferClientData,
  fetchOfferPackageList,
  fetchOfferPackageVolume,
  validateOfferApplication,
  type OfferApplicationDetails,
} from '@/service/provincial-offer-create-service'
import type { SearchOption } from '@/service/search-options-service'
import { formatBusinessIsoDate } from '@/utils/date'
import { displayAuditIdentity } from '@/utils/text'
import {
  OFFER_COMPANY_NAME_MAX_LENGTH,
  OFFER_CONDITION_MAX_LENGTH,
  OFFER_CONTACT_NAME_MAX_LENGTH,
  OFFER_PICKUP_LOCATION_MAX_LENGTH,
  OFFER_REMARK_MAX_LENGTH,
  OFFER_VOLUME_MAX,
  PURCHASE_OFFER_AMOUNT_MAX,
  formatLegacyOfferVolume,
  offerDecimalStorageFieldError,
  offerTextStorageFieldError,
} from '@/pages/shared/offer-storage-validation'

type ProvincialOfferCreateForm = {
  applicationNumber: string
  packageNumber: string
  offeringClientNumber: string
  companyName: string
  contactName: string
  offerVolume: string
  purchaseOfferAmount: string
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
  offerVolume: '',
  purchaseOfferAmount: '',
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
    offerVolume: query.get('offerVolume') ?? '',
    purchaseOfferAmount: query.get('purchaseOfferAmount') ?? '',
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

type ScopedOfferClientContext = {
  clientNumber: string
  companyName: string
  errorMessage: string
}

type OfferApplicationContextState = {
  applicationDetails: OfferApplicationDetails | null
  applicationVolume: string
  packageOptions: SearchOption[]
  packageVolume: string
  applicationValidationError: string
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
  | { type: 'loadFailure'; applicationValidationError?: string }
  | { type: 'setPackageVolume'; packageVolume: string }

const createOfferApplicationContextState = (
  packageOptions: SearchOption[],
): OfferApplicationContextState => ({
  applicationDetails: null,
  applicationVolume: '',
  packageOptions,
  packageVolume: '',
  applicationValidationError: '',
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
      return { ...state, applicationValidationError: '', isLoading: true }
    case 'loadSuccess':
      return {
        ...state,
        applicationDetails: action.applicationDetails,
        applicationVolume: action.applicationVolume,
        packageOptions: action.packageOptions,
        applicationValidationError: '',
        isLoading: false,
      }
    case 'loadFailure':
      return {
        ...state,
        applicationDetails: null,
        applicationVolume: '',
        packageOptions: [],
        applicationValidationError: action.applicationValidationError ?? '',
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
  const draftBaselineRef = useRef(form)
  const [formEdited, setFormEdited] = useState(false)
  const [createdRecordPath, setCreatedRecordPath] = useState<string | null>(null)
  const [applicationContext, dispatchApplicationContext] = useReducer(
    offerApplicationContextReducer,
    queryPackageOptions,
    createOfferApplicationContextState,
  )
  const {
    applicationDetails,
    applicationVolume,
    applicationValidationError,
    packageOptions,
    packageVolume,
    isLoading: isLoadingApplicationContext,
  } = applicationContext
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<ProvincialOfferCreateField>>({})
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)
  const [scopedClientContext, setScopedClientContext] = useState<ScopedOfferClientContext>({
    clientNumber: '',
    companyName: '',
    errorMessage: '',
  })
  const [scopedContact, setScopedContact] = useState({ clientNumber: '', contactName: '' })
  const scopedContactBaselineRef = useRef(scopedContact)
  const canManageOfferApproval =
    hasRole(capabilities.roles, 'APPLICATION_APPROVER') || hasRole(capabilities.roles, 'ADMIN')
  const isScopedProvincialSubmitter =
    hasProvincialSubmitterRole(capabilities.roles) &&
    Boolean(capabilities.forestClientNumber?.trim())
  const authoritativeOfferingClientNumber = capabilities.forestClientNumber?.trim() ?? ''
  const effectiveOfferingClientNumber = isScopedProvincialSubmitter
    ? authoritativeOfferingClientNumber
    : ''
  const scopedClientContextIsCurrent =
    isScopedProvincialSubmitter &&
    scopedClientContext.clientNumber === authoritativeOfferingClientNumber
  const effectiveCompanyName = isScopedProvincialSubmitter
    ? scopedClientContextIsCurrent
      ? scopedClientContext.companyName
      : ''
    : form.companyName
  const effectiveContactName = isScopedProvincialSubmitter
    ? scopedContact.clientNumber === authoritativeOfferingClientNumber
      ? scopedContact.contactName
      : ''
    : form.contactName
  const scopedClientLookupPending = isScopedProvincialSubmitter && !scopedClientContextIsCurrent
  const scopedClientLookupError = scopedClientContextIsCurrent
    ? scopedClientContext.errorMessage
    : ''
  const author = displayAuditIdentity(capabilities.principal)
  const receivedDate = formatBusinessIsoDate()
  const hasApplicationNumber = form.applicationNumber.trim().length > 0
  const hasNoPackagesForApplication =
    hasApplicationNumber &&
    !isLoadingApplicationContext &&
    applicationDetails !== null &&
    packageOptions.length === 0
  const debouncedApplicationNumber = useDebouncedValue(form.applicationNumber)
  const debouncedPackageNumber = useDebouncedValue(form.packageNumber)
  const applicationNumberForLookup = formEdited
    ? debouncedApplicationNumber
    : form.applicationNumber
  const packageNumberForLookup = formEdited ? debouncedPackageNumber : form.packageNumber

  useEffect(() => {
    if (createdRecordPath) {
      navigate(createdRecordPath)
    }
  }, [createdRecordPath, navigate])

  useEffect(() => {
    if (!isScopedProvincialSubmitter) {
      return undefined
    }

    const requestedClientNumber = authoritativeOfferingClientNumber
    let active = true
    void fetchOfferClientData(requestedClientNumber)
      .then((clientData) => {
        if (!active) {
          return
        }
        setScopedClientContext({
          clientNumber: requestedClientNumber,
          companyName: clientData?.companyName ?? '',
          errorMessage: clientData
            ? ''
            : 'The offering company could not be loaded from the authenticated forest client.',
        })
      })
      .catch((error) => {
        if (!active) {
          return
        }
        console.error(error)
        setScopedClientContext({
          clientNumber: requestedClientNumber,
          companyName: '',
          errorMessage:
            'The offering company could not be loaded from the authenticated forest client.',
        })
      })

    return () => {
      active = false
    }
  }, [authoritativeOfferingClientNumber, isScopedProvincialSubmitter])

  useEffect(() => {
    const applicationNumber = applicationNumberForLookup.trim()
    if (!applicationNumber) {
      dispatchApplicationContext({ type: 'reset', packageOptions: queryPackageOptions })
      return
    }

    let isActive = true
    dispatchApplicationContext({ type: 'loadStart' })
    void (async () => {
      try {
        const validation = await validateOfferApplication(applicationNumber)
        if (!isActive) {
          return
        }
        if (!validation.isValid) {
          dispatchApplicationContext({
            type: 'loadFailure',
            applicationValidationError:
              validation.errors[0] ?? 'This application cannot accept purchase offers.',
          })
          setForm((current) =>
            current.applicationNumber.trim() === applicationNumber
              ? { ...current, packageNumber: '' }
              : current,
          )
          return
        }

        const [detailsResult, packagesResult, volumeResult] = await Promise.allSettled([
          fetchOfferApplicationDetails(applicationNumber),
          fetchOfferPackageList(applicationNumber),
          fetchOfferApplicationVolume(applicationNumber),
        ])
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
      } catch (error) {
        console.error(error)
        if (isActive) {
          dispatchApplicationContext({
            type: 'loadFailure',
            applicationValidationError:
              'Application eligibility could not be verified. Reload the page and try again.',
          })
          setForm((current) =>
            current.applicationNumber.trim() === applicationNumber
              ? { ...current, packageNumber: '' }
              : current,
          )
        }
      }
    })()

    return () => {
      isActive = false
    }
  }, [applicationNumberForLookup, queryPackageOptions])

  useEffect(() => {
    const packageNumber =
      packageOptions.length > 0 ? form.packageNumber.trim() : packageNumberForLookup.trim()
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
  }, [form.packageNumber, packageNumberForLookup, packageOptions.length])

  const contextVolume = form.packageNumber.trim() ? packageVolume : applicationVolume

  const fieldErrors = useMemo<FieldErrors<ProvincialOfferCreateField>>(
    () => ({
      applicationNumber: firstValidationError(
        () => requiredFieldError(form.applicationNumber, 'Application number'),
        () => positiveNumericFieldError(form.applicationNumber),
        () => applicationValidationError || null,
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
      offeringClientNumber: isScopedProvincialSubmitter
        ? (requiredFieldError(effectiveOfferingClientNumber, 'Offering client number') ?? undefined)
        : undefined,
      companyName:
        offerTextStorageFieldError(
          effectiveCompanyName,
          OFFER_COMPANY_NAME_MAX_LENGTH,
          'Company name',
          true,
        ) ?? undefined,
      contactName:
        offerTextStorageFieldError(
          effectiveContactName,
          OFFER_CONTACT_NAME_MAX_LENGTH,
          'Contact name',
          true,
        ) ?? undefined,
      offerVolume:
        offerDecimalStorageFieldError(form.offerVolume, OFFER_VOLUME_MAX, 'Offer volume') ??
        undefined,
      purchaseOfferAmount:
        offerDecimalStorageFieldError(
          form.purchaseOfferAmount,
          PURCHASE_OFFER_AMOUNT_MAX,
          'Offer amount',
          true,
        ) ?? undefined,
      teacReviewDate: canManageOfferApproval
        ? (isoDateFieldError(form.teacReviewDate) ?? undefined)
        : undefined,
      pickupLocation:
        offerTextStorageFieldError(
          form.pickupLocation,
          OFFER_PICKUP_LOCATION_MAX_LENGTH,
          'Pickup location',
          true,
        ) ?? undefined,
      offerCondition:
        offerTextStorageFieldError(
          form.offerCondition,
          OFFER_CONDITION_MAX_LENGTH,
          'Offer conditions / remarks',
        ) ?? undefined,
      offerRemark: canManageOfferApproval
        ? (offerTextStorageFieldError(form.offerRemark, OFFER_REMARK_MAX_LENGTH, 'Offer remarks') ??
          undefined)
        : undefined,
    }),
    [
      applicationValidationError,
      canManageOfferApproval,
      effectiveCompanyName,
      effectiveContactName,
      effectiveOfferingClientNumber,
      form,
      isLoadingApplicationContext,
      isScopedProvincialSubmitter,
      packageOptions,
    ],
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
  const applicationNumberError = applicationValidationError || fieldError('applicationNumber')

  const onSave = async (navigateToCreatedRecord = true): Promise<boolean> => {
    if (isLoadingApplicationContext || scopedClientLookupPending) {
      return false
    }
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
      return false
    }

    setStatus(null)
    setIsSubmitting(true)
    try {
      const result = await submitProvincialOfferCreate({
        ...form,
        offeringClientNumber: effectiveOfferingClientNumber,
        companyName: effectiveCompanyName,
        contactName: effectiveContactName,
        teacReviewDate: canManageOfferApproval
          ? form.teacReviewDate || applicationDetails?.teacReviewDate || ''
          : applicationDetails?.teacReviewDate || '',
        fairOfferIndicator: canManageOfferApproval ? form.fairOfferIndicator : 'N',
        validOfferIndicator: canManageOfferApproval ? form.validOfferIndicator : 'Y',
        approvalIndicator: canManageOfferApproval ? form.approvalIndicator : 'N',
        offerRemark: canManageOfferApproval ? form.offerRemark : '',
      })
      if (result.success) {
        draftBaselineRef.current = form
        scopedContactBaselineRef.current = scopedContact
        setFormEdited(false)
        if (result.createdId) {
          if (navigateToCreatedRecord) {
            setCreatedRecordPath(`/provincial/offers/${encodeURIComponent(result.createdId)}`)
          }
          return true
        }
        setStatus({
          kind: 'success',
          title: 'Offer saved',
          message: 'Offer saved successfully.',
        })
        return true
      }

      setStatus({
        kind: 'error',
        title: 'Save failed',
        message:
          result.errors[0] ||
          result.message ||
          'Offer save failed. Please review the form and try again. If the problem persists, contact support.',
      })
      return false
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Save failed',
        message:
          'Offer save failed. Please review the form and try again. If the problem persists, contact support.',
      })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const onDiscardCreateDraft = (): void => {
    setForm(draftBaselineRef.current)
    setScopedContact(scopedContactBaselineRef.current)
    setFormEdited(false)
    setTouchedFields({})
    setShowAllValidationErrors(false)
    setStatus(null)
  }

  const markFormEdited = (): void => {
    if (!formEdited) {
      draftBaselineRef.current = form
      scopedContactBaselineRef.current = scopedContact
    }
    setFormEdited(true)
  }

  const isCreateDraftDirty =
    formEdited &&
    (!formValuesEqual(form, draftBaselineRef.current) ||
      !formValuesEqual(scopedContact, scopedContactBaselineRef.current))

  return (
    <Grid fullWidth className="default-grid create-page-grid provincial-offer-create-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Create provincial offer"
          subtitle="Enter offer details and save a new offer."
        />
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

      {!!scopedClientLookupError && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="error"
            title="Offering client unavailable"
            subtitle={scopedClientLookupError}
            lowContrast
          />
        </Column>
      )}

      <Column sm={4} md={8} lg={16}>
        <div className="provincial-offer-create create-form-tile provincial-offer-sections provincial-offer-section-stack">
          <fieldset className="legacy-form-fieldset create-form-section offer-form-section">
            <legend>Application details</legend>
            <div className="legacy-search-grid create-form-grid">
              <TextInput
                id="applicationNumber"
                labelText="Application number"
                value={form.applicationNumber}
                invalid={!!applicationNumberError}
                invalidText={applicationNumberError}
                onBlur={() => markFieldTouched('applicationNumber')}
                onChange={(event) => {
                  markFormEdited()
                  setForm((current) => ({ ...current, applicationNumber: event.target.value }))
                }}
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
                  onChange={(value) => {
                    markFormEdited()
                    setForm((current) => ({ ...current, packageNumber: value }))
                  }}
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
                  onChange={(event) => {
                    markFormEdited()
                    setForm((current) => ({ ...current, packageNumber: event.target.value }))
                  }}
                />
              )}
            </div>
            <div className="legacy-search-actions">
              <Button
                type="button"
                kind="ghost"
                size="sm"
                disabled={!form.applicationNumber.trim() || !form.packageNumber.trim()}
                onClick={() => {
                  const params = new URLSearchParams({
                    tab: 'items',
                    packageNumber: form.packageNumber.trim(),
                    section: 'scales',
                  })
                  navigate(`/provincial/application/${form.applicationNumber.trim()}?${params}`)
                }}
              >
                See Scale Detail
              </Button>
            </div>
          </fieldset>

          <fieldset className="legacy-form-fieldset create-form-section offer-form-section">
            <legend>Offering company details</legend>
            <div className="legacy-search-grid create-form-grid">
              {isScopedProvincialSubmitter && (
                <TextInput
                  id="offeringClientNumber"
                  labelText="Offering client number"
                  value={effectiveOfferingClientNumber}
                  invalid={!!fieldError('offeringClientNumber')}
                  invalidText={fieldError('offeringClientNumber')}
                  readOnly
                  helperText="Loaded from your authenticated forest client access."
                />
              )}
              <TextInput
                id="companyName"
                labelText="Company"
                value={effectiveCompanyName}
                invalid={!!fieldError('companyName')}
                invalidText={fieldError('companyName')}
                readOnly={isScopedProvincialSubmitter}
                helperText={
                  isScopedProvincialSubmitter
                    ? scopedClientLookupPending
                      ? 'Loading from your authenticated forest client…'
                      : 'Loaded from your authenticated forest client.'
                    : undefined
                }
                onBlur={() => markFieldTouched('companyName')}
                onChange={(event) => {
                  markFormEdited()
                  setForm((current) => ({ ...current, companyName: event.target.value }))
                }}
                maxLength={OFFER_COMPANY_NAME_MAX_LENGTH}
              />
              <TextInput
                id="contactName"
                labelText="Contact name"
                value={effectiveContactName}
                invalid={!!fieldError('contactName')}
                invalidText={fieldError('contactName')}
                onBlur={() => markFieldTouched('contactName')}
                onChange={(event) => {
                  markFormEdited()
                  if (isScopedProvincialSubmitter) {
                    setScopedContact({
                      clientNumber: authoritativeOfferingClientNumber,
                      contactName: event.target.value,
                    })
                    return
                  }
                  setForm((current) => ({ ...current, contactName: event.target.value }))
                }}
                maxLength={OFFER_CONTACT_NAME_MAX_LENGTH}
              />
            </div>
          </fieldset>

          <fieldset className="legacy-form-fieldset create-form-section offer-form-section">
            <legend>Offer details</legend>
            <div className="legacy-search-grid create-form-grid">
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
                onBlur={() => {
                  markFieldTouched('offerVolume')
                  setForm((current) => ({
                    ...current,
                    offerVolume: formatLegacyOfferVolume(current.offerVolume),
                  }))
                }}
                onChange={(event) => {
                  markFormEdited()
                  setForm((current) => ({ ...current, offerVolume: event.target.value }))
                }}
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
                onChange={(event) => {
                  markFormEdited()
                  setForm((current) => ({ ...current, purchaseOfferAmount: event.target.value }))
                }}
              />
              <TextInput
                id="region"
                labelText="Region"
                value={applicationDetails?.region || 'Not available'}
                helperText="Derived from the selected application."
                readOnly
              />
              <TextInput
                id="purchaseOfferDate"
                labelText="Offer received date"
                value={receivedDate}
                helperText="Set automatically when the offer is saved."
                readOnly
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
                onChange={(event) => {
                  markFormEdited()
                  setForm((current) => ({ ...current, pickupLocation: event.target.value }))
                }}
                maxLength={OFFER_PICKUP_LOCATION_MAX_LENGTH}
              />
              <TextArea
                id="offerCondition"
                labelText="Offer conditions / remarks"
                value={form.offerCondition}
                invalid={!!fieldError('offerCondition')}
                invalidText={fieldError('offerCondition')}
                onBlur={() => markFieldTouched('offerCondition')}
                onChange={(event) => {
                  markFormEdited()
                  setForm((current) => ({ ...current, offerCondition: event.target.value }))
                }}
                maxLength={OFFER_CONDITION_MAX_LENGTH}
              />
            </div>
          </fieldset>

          <fieldset className="legacy-form-fieldset create-form-section offer-form-section">
            <legend>Offer withdrawals</legend>
            <div className="legacy-search-grid create-form-grid">
              <TextInput
                id="offerWithdrawalDate"
                labelText="Offer withdrawal date"
                value=""
                helperText="New offers are created as not withdrawn."
                readOnly
              />
              <TextArea id="withdrawReason" labelText="Offer withdrawal reason" value="" readOnly />
            </div>
          </fieldset>

          <fieldset className="legacy-form-fieldset create-form-section offer-form-section">
            <legend>Approval</legend>
            {canManageOfferApproval ? (
              <div className="legacy-search-grid create-form-grid">
                <IsoDatePicker
                  id="teacReviewDate"
                  labelText="TEAC review date"
                  value={form.teacReviewDate || applicationDetails?.teacReviewDate || ''}
                  invalid={!!fieldError('teacReviewDate')}
                  invalidText={fieldError('teacReviewDate')}
                  onBlur={() => markFieldTouched('teacReviewDate')}
                  onChange={(value) => {
                    markFormEdited()
                    setForm((current) => ({ ...current, teacReviewDate: value }))
                  }}
                />
                <SearchableSelect
                  id="fairOfferIndicator"
                  labelText="Fair market value"
                  value={form.fairOfferIndicator}
                  placeholder="Select value"
                  options={YES_NO_OPTIONS}
                  onChange={(value) => {
                    markFormEdited()
                    setForm((current) => ({ ...current, fairOfferIndicator: value }))
                  }}
                />
                <SearchableSelect
                  id="validOfferIndicator"
                  labelText="Valid offer"
                  value={form.validOfferIndicator}
                  placeholder="Select value"
                  options={YES_NO_OPTIONS}
                  onChange={(value) => {
                    markFormEdited()
                    setForm((current) => ({ ...current, validOfferIndicator: value }))
                  }}
                />
                <SearchableSelect
                  id="approvalIndicator"
                  labelText="Offer approved"
                  value={form.approvalIndicator}
                  placeholder="Select value"
                  options={YES_NO_OPTIONS}
                  onChange={(value) => {
                    markFormEdited()
                    setForm((current) => ({ ...current, approvalIndicator: value }))
                  }}
                />
                <TextArea
                  id="offerRemark"
                  labelText="Offer remarks"
                  value={form.offerRemark}
                  invalid={!!fieldError('offerRemark')}
                  invalidText={fieldError('offerRemark')}
                  onBlur={() => markFieldTouched('offerRemark')}
                  onChange={(event) => {
                    markFormEdited()
                    setForm((current) => ({ ...current, offerRemark: event.target.value }))
                  }}
                  maxLength={OFFER_REMARK_MAX_LENGTH}
                />
              </div>
            ) : (
              <div className="legacy-search-grid create-form-grid">
                <TextInput
                  id="teacReviewDate"
                  labelText="TEAC review date"
                  value={applicationDetails?.teacReviewDate || 'Not scheduled'}
                  readOnly
                />
                <TextInput
                  id="fairOfferIndicator"
                  labelText="Fair market value"
                  value="No"
                  readOnly
                />
                <TextInput id="validOfferIndicator" labelText="Valid offer" value="Yes" readOnly />
                <TextInput id="approvalIndicator" labelText="Offer approved" value="No" readOnly />
              </div>
            )}
          </fieldset>

          <div className="legacy-form-footer">
            <dl className="detail-field-grid">
              <div className="detail-field-item">
                <dt className="detail-field-label">Offer number</dt>
                <dd className="detail-field-value">New</dd>
              </div>
              <div className="detail-field-item">
                <dt className="detail-field-label">Author</dt>
                <dd className="detail-field-value">{author}</dd>
              </div>
            </dl>
            <div
              className="legacy-search-actions create-form-actions"
              role="group"
              aria-label="Offer form actions"
            >
              <Button
                type="button"
                kind="tertiary"
                size="md"
                onClick={() => navigate('/provincial/offers')}
              >
                Cancel
              </Button>
              <Button
                type="button"
                kind="primary"
                size="md"
                onClick={() => void onSave(true)}
                disabled={
                  isSubmitting ||
                  isLoadingApplicationContext ||
                  scopedClientLookupPending ||
                  !!applicationValidationError
                }
                renderIcon={isSubmitting ? PendingIcon : undefined}
              >
                {isSubmitting ? 'Saving…' : 'Save new offer'}
              </Button>
            </div>
          </div>
        </div>
      </Column>
      <UnsavedChangesGuard
        isDirty={isCreateDraftDirty}
        isBusy={isSubmitting}
        onSave={() => onSave(false)}
        onDiscard={onDiscardCreateDraft}
        subject="this new purchase offer"
        saveUnavailableReason={
          isLoadingApplicationContext || scopedClientLookupPending
            ? 'Application and client details must finish loading before this offer can be saved.'
            : undefined
        }
      />
    </Grid>
  )
}

export default ProvincialOfferCreatePage
