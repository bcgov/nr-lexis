import {
  RecordField,
  RecordFieldCell,
  RecordFieldGrid,
  RecordFieldRow,
} from '@/pages/shared/RecordFieldGrid'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DataDefinition, Enterprise, Result, Save, Stamp } from '@carbon/icons-react'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  RadioButton,
  RadioButtonGroup,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { AppNotification } from '../../components/AppNotification'
import IsoDatePicker from '../../components/IsoDatePicker'
import OfferScaleDetailAction from '@/components/OfferScaleDetailAction'
import SearchableSelect from '../../components/SearchableSelect'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import { discardNewRecordCopy } from '@/components/DiscardChangesModal'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { hasProvincialSubmitterRole, hasRole } from '@/context/auth/role-utils'
import {
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
  normalizeProvincialApplicationNumber,
  provincialApplicationNumberFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import OfferFormSection from '@/pages/shared/OfferFormSection'
import { offerSaveNotice, type OfferSaveNotice } from '@/pages/shared/offer-save-notice'
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
import { displayNumericDate } from '@/utils/display-value'
import { fieldErrorText } from '@/utils/field-error'
import { focusFirstInvalidFieldAfterRender } from '@/utils/focus'
import { requiredLabel } from '@/utils/required-label'
import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'
import { formatPackageNumberLabel } from '@/utils/text'
import { displayVolume } from '@/utils/volume'
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
  offerVolumeContextFieldError,
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
}

const YES_NO_OPTIONS: SearchOption[] = [
  { value: 'Y', label: 'Yes' },
  { value: 'N', label: 'No' },
]

const packageOptionsFromQuery = (query: URLSearchParams): SearchOption[] => {
  const packageNumbers = [
    query.get('packageNumber') ?? '',
    ...(query.get('packageNumbers') ?? '').split(','),
  ].filter((packageNumber) => packageNumber.trim().length > 0)

  return Array.from(new Set(packageNumbers)).map((packageNumber) => ({
    value: packageNumber,
    label: formatPackageNumberLabel(packageNumber),
  }))
}

const buildInitialFormFromQuery = (query: URLSearchParams): ProvincialOfferCreateForm => {
  return {
    ...INITIAL_FORM,
    applicationNumber: normalizeProvincialApplicationNumber(query.get('applicationNumber') ?? ''),
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
  }
}

const OFFER_NOT_SAVED_TITLE = 'Offer not saved.'
const FIELD_ERRORS_MESSAGE = 'Some fields have errors. Correct them and save again.'

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
  /** Errors that no field shows take focus, so the reason is read out. */
  focusOnReveal?: boolean
}

type CreatedOfferNavigation = {
  path: string
  notice: OfferSaveNotice
}

type ScopedOfferClientContext = {
  clientNumber: string
  confirmedClientNumber: string
  companyName: string
  errorMessage: string
}

type OfferApplicationContextState = {
  applicationDetails: OfferApplicationDetails | null
  applicationVolume: string
  packageOptions: SearchOption[]
  packageVolume: string
  packageVolumeError: string
  packageVolumeTarget: string
  isLoadingPackageVolume: boolean
  applicationValidationError: string
  isLoading: boolean
  /** The current application number was found and can take offers. */
  applicationLoaded: boolean
  /**
   * INTENTIONAL_LEGACY_DIVERGENCE(OFFER_CREATE_AND_RECORD): the rest of the offer shows once an
   * application is first found, and then stays.
   */
  offerSectionsShown: boolean
  /** Read out when an application is found, without moving focus. */
  foundAnnouncement: string
}

type OfferApplicationContextAction =
  | { type: 'reset'; packageOptions: SearchOption[] }
  | { type: 'loadStart' }
  | {
      type: 'loadSuccess'
      applicationNumber: string
      applicationDetails: OfferApplicationDetails | null
      applicationVolume: string
      packageOptions: SearchOption[]
    }
  | { type: 'loadFailure'; applicationValidationError?: string }
  | { type: 'clearPackageVolume' }
  | { type: 'packageVolumeLoadStart'; target: string }
  | { type: 'packageVolumeLoadSuccess'; target: string; packageVolume: string }
  | { type: 'packageVolumeLoadFailure'; target: string }

const createOfferApplicationContextState = (
  packageOptions: SearchOption[],
): OfferApplicationContextState => ({
  applicationDetails: null,
  applicationVolume: '',
  packageOptions,
  packageVolume: '',
  packageVolumeError: '',
  packageVolumeTarget: '',
  isLoadingPackageVolume: false,
  applicationValidationError: '',
  isLoading: false,
  applicationLoaded: false,
  offerSectionsShown: false,
  foundAnnouncement: '',
})

const offerApplicationContextReducer = (
  state: OfferApplicationContextState,
  action: OfferApplicationContextAction,
): OfferApplicationContextState => {
  switch (action.type) {
    case 'reset':
      return {
        ...createOfferApplicationContextState(action.packageOptions),
        offerSectionsShown: state.offerSectionsShown,
      }
    case 'loadStart':
      return {
        ...state,
        applicationValidationError: '',
        packageVolumeError: '',
        isLoading: true,
        applicationLoaded: false,
        foundAnnouncement: '',
      }
    case 'loadSuccess':
      return {
        ...state,
        applicationDetails: action.applicationDetails,
        applicationVolume: action.applicationVolume,
        packageOptions: action.packageOptions,
        applicationValidationError: '',
        isLoading: false,
        applicationLoaded: true,
        offerSectionsShown: true,
        foundAnnouncement: `Application ${action.applicationNumber} found. Enter the offer details.`,
      }
    case 'loadFailure':
      return {
        ...state,
        applicationDetails: null,
        applicationVolume: '',
        packageOptions: [],
        applicationValidationError: action.applicationValidationError ?? '',
        packageVolumeError: '',
        isLoading: false,
        applicationLoaded: false,
      }
    case 'clearPackageVolume':
      return {
        ...state,
        packageVolume: '',
        packageVolumeError: '',
        packageVolumeTarget: '',
        isLoadingPackageVolume: false,
      }
    case 'packageVolumeLoadStart':
      return {
        ...state,
        packageVolume: '',
        packageVolumeError: '',
        packageVolumeTarget: action.target,
        isLoadingPackageVolume: true,
      }
    case 'packageVolumeLoadSuccess':
      return state.packageVolumeTarget === action.target
        ? {
            ...state,
            packageVolume: action.packageVolume,
            packageVolumeError: '',
            isLoadingPackageVolume: false,
          }
        : state
    case 'packageVolumeLoadFailure':
      return state.packageVolumeTarget === action.target
        ? {
            ...state,
            packageVolume: '',
            packageVolumeError:
              'Application/package volume could not be loaded. Reload the page to try again.',
            isLoadingPackageVolume: false,
          }
        : state
    default:
      return state
  }
}

const packageVolumeTargetKey = (applicationNumber: string, packageNumber: string): string => {
  return packageNumber.trim()
    ? `${normalizeProvincialApplicationNumber(applicationNumber)}\u0000${packageNumber}`
    : ''
}

const normalizeOfferContextVolume = (value: string): string | null => {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? normalized : null
}

const yesNoLabel = (value: string): string | undefined =>
  YES_NO_OPTIONS.find((option) => option.value === value)?.label

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
  // Values the page fills in itself belong to the starting draft, even after the user starts editing.
  const applyLoadedFormValues = useCallback(
    (update: (current: ProvincialOfferCreateForm) => ProvincialOfferCreateForm) => {
      draftBaselineRef.current = update(draftBaselineRef.current)
      setForm(update)
    },
    [],
  )
  const formRef = useRef<HTMLDivElement>(null)
  const teacSeedRef = useRef<{ applicationNumber: string; value: string } | null>(null)
  const [createdOfferNavigation, setCreatedOfferNavigation] =
    useState<CreatedOfferNavigation | null>(null)
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
    packageVolumeError,
    packageVolumeTarget,
    isLoadingPackageVolume,
    isLoading: isLoadingApplicationContext,
    applicationLoaded,
    offerSectionsShown,
    foundAnnouncement,
  } = applicationContext
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<ProvincialOfferCreateField>>({})
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)
  const [scopedClientContext, setScopedClientContext] = useState<ScopedOfferClientContext>({
    clientNumber: '',
    confirmedClientNumber: '',
    companyName: '',
    errorMessage: '',
  })
  const [scopedContact, setScopedContact] = useState({ clientNumber: '', contactName: '' })
  const scopedContactBaselineRef = useRef(scopedContact)
  // Fills the submitter's contact name from the client's legal name unless they already typed one.
  const prefillScopedContactName = useCallback((clientNumber: string, contactName: string) => {
    setScopedContact((current) =>
      current.clientNumber === clientNumber ? current : { clientNumber, contactName },
    )
    if (scopedContactBaselineRef.current.clientNumber !== clientNumber) {
      scopedContactBaselineRef.current = { clientNumber, contactName }
    }
  }, [])
  const canManageOfferApproval =
    hasRole(capabilities.roles, 'APPLICATION_APPROVER') || hasRole(capabilities.roles, 'ADMIN')
  const isScopedProvincialSubmitter =
    hasProvincialSubmitterRole(capabilities.roles) &&
    Boolean(capabilities.forestClientNumber?.trim())
  const authoritativeOfferingClientNumber = capabilities.forestClientNumber?.trim() ?? ''
  const scopedClientContextIsCurrent =
    isScopedProvincialSubmitter &&
    scopedClientContext.clientNumber === authoritativeOfferingClientNumber
  const effectiveOfferingClientNumber = isScopedProvincialSubmitter
    ? scopedClientContextIsCurrent
      ? scopedClientContext.confirmedClientNumber || authoritativeOfferingClientNumber
      : authoritativeOfferingClientNumber
    : ''
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
  const receivedDate = formatBusinessIsoDate()
  const debouncedApplicationNumber = useDebouncedValue(form.applicationNumber)
  const debouncedPackageNumber = useDebouncedValue(form.packageNumber)
  const applicationNumberForLookup = formEdited
    ? debouncedApplicationNumber
    : form.applicationNumber
  const packageNumberForLookup = formEdited ? debouncedPackageNumber : form.packageNumber
  const isCurrentApplicationNumberValid = !provincialApplicationNumberFieldError(
    form.applicationNumber,
    'Application number',
    true,
  )
  const isLookupApplicationNumberValid = !provincialApplicationNumberFieldError(
    applicationNumberForLookup,
    'Application number',
    true,
  )
  const isApplicationLookupDebouncing =
    formEdited &&
    isCurrentApplicationNumberValid &&
    normalizeProvincialApplicationNumber(form.applicationNumber) !==
      normalizeProvincialApplicationNumber(applicationNumberForLookup)
  const packageNumberForVolumeLookup =
    packageOptions.length > 0 ? form.packageNumber : packageNumberForLookup.trim()
  const currentPackageNumberForVolumeLookup =
    packageOptions.length > 0 ? form.packageNumber : form.packageNumber.trim()
  const packageVolumeLookupTarget = isLookupApplicationNumberValid
    ? packageVolumeTargetKey(applicationNumberForLookup, packageNumberForVolumeLookup)
    : ''
  const currentPackageVolumeTarget = isCurrentApplicationNumberValid
    ? packageVolumeTargetKey(form.applicationNumber, currentPackageNumberForVolumeLookup)
    : ''
  const isPackageVolumePending =
    Boolean(currentPackageVolumeTarget) &&
    (packageVolumeTarget !== currentPackageVolumeTarget || isLoadingPackageVolume)
  const isLoadingOfferContext =
    isLoadingApplicationContext || isApplicationLookupDebouncing || isPackageVolumePending
  const currentApplicationLoaded =
    applicationLoaded && !isLoadingApplicationContext && !isApplicationLookupDebouncing
  const hasNoPackagesForApplication = currentApplicationLoaded && packageOptions.length === 0

  useEffect(() => {
    if (!createdOfferNavigation) {
      return
    }

    navigate(createdOfferNavigation.path, {
      state: { offerCreationNotice: createdOfferNavigation.notice },
    })
  }, [createdOfferNavigation, navigate])

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
          confirmedClientNumber: clientData?.clientNumber.trim() ?? '',
          companyName: clientData?.companyName ?? '',
          errorMessage: clientData
            ? ''
            : 'The offering company could not be loaded from the authenticated forest client.',
        })
        const legalContactName = clientData?.legalContactName?.trim()
        if (legalContactName) {
          prefillScopedContactName(requestedClientNumber, legalContactName)
        }
      })
      .catch((error) => {
        if (!active) {
          return
        }
        console.error(error)
        setScopedClientContext({
          clientNumber: requestedClientNumber,
          confirmedClientNumber: '',
          companyName: '',
          errorMessage:
            'The offering company could not be loaded from the authenticated forest client.',
        })
      })

    return () => {
      active = false
    }
  }, [authoritativeOfferingClientNumber, isScopedProvincialSubmitter, prefillScopedContactName])

  useEffect(() => {
    const rawApplicationNumber = applicationNumberForLookup.trim()
    if (!rawApplicationNumber) {
      dispatchApplicationContext({ type: 'reset', packageOptions: queryPackageOptions })
      return
    }
    if (provincialApplicationNumberFieldError(rawApplicationNumber, 'Application number', true)) {
      dispatchApplicationContext({ type: 'reset', packageOptions: [] })
      return
    }
    const applicationNumber = normalizeProvincialApplicationNumber(rawApplicationNumber)

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
          applyLoadedFormValues((current) =>
            normalizeProvincialApplicationNumber(current.applicationNumber) === applicationNumber
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

        if (packagesResult.status !== 'fulfilled') {
          dispatchApplicationContext({
            type: 'loadFailure',
            applicationValidationError:
              'Application packages could not be loaded. Reload the page and try again.',
          })
          applyLoadedFormValues((current) =>
            normalizeProvincialApplicationNumber(current.applicationNumber) === applicationNumber
              ? { ...current, packageNumber: '' }
              : current,
          )
          return
        }

        const packageNumbers = packagesResult.value
        const nextPackageOptions = packageNumbers.map((packageNumber) => ({
          value: packageNumber,
          label: formatPackageNumberLabel(packageNumber),
        }))
        const nextApplicationVolume =
          volumeResult.status === 'fulfilled'
            ? normalizeOfferContextVolume(volumeResult.value)
            : null
        if (nextPackageOptions.length === 0 && nextApplicationVolume === null) {
          dispatchApplicationContext({
            type: 'loadFailure',
            applicationValidationError:
              'Application volume could not be loaded. Reload the page and try again.',
          })
          applyLoadedFormValues((current) =>
            normalizeProvincialApplicationNumber(current.applicationNumber) === applicationNumber
              ? { ...current, packageNumber: '' }
              : current,
          )
          return
        }
        dispatchApplicationContext({
          type: 'loadSuccess',
          applicationNumber,
          applicationDetails:
            detailsResult.status === 'fulfilled' && detailsResult.value.success
              ? detailsResult.value
              : null,
          applicationVolume: nextApplicationVolume ?? '',
          packageOptions: nextPackageOptions,
        })
        // The schedule's TEAC date fills the field once per application, so an approver who
        // clears it keeps it empty. A date the approver typed for another application stays.
        const scheduleTeacReviewDate =
          detailsResult.status === 'fulfilled' && detailsResult.value.success
            ? detailsResult.value.teacReviewDate
            : ''
        const previousTeacSeed = teacSeedRef.current
        const seedTeacReviewDate = previousTeacSeed?.applicationNumber !== applicationNumber
        if (seedTeacReviewDate) {
          teacSeedRef.current = { applicationNumber, value: scheduleTeacReviewDate }
        }
        applyLoadedFormValues((loaded) => {
          if (
            normalizeProvincialApplicationNumber(loaded.applicationNumber) !== applicationNumber
          ) {
            return loaded
          }
          const current =
            seedTeacReviewDate &&
            (loaded.teacReviewDate === '' || loaded.teacReviewDate === previousTeacSeed?.value)
              ? { ...loaded, teacReviewDate: scheduleTeacReviewDate }
              : loaded
          const firstPackageNumber = nextPackageOptions[0]?.value
          if (!firstPackageNumber) {
            return current.packageNumber ? { ...current, packageNumber: '' } : current
          }
          const selectedPackageNumber = current.packageNumber
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
          applyLoadedFormValues((current) =>
            normalizeProvincialApplicationNumber(current.applicationNumber) === applicationNumber
              ? { ...current, packageNumber: '' }
              : current,
          )
        }
      }
    })()

    return () => {
      isActive = false
    }
  }, [applicationNumberForLookup, applyLoadedFormValues, queryPackageOptions])

  useEffect(() => {
    if (!packageNumberForVolumeLookup || !packageVolumeLookupTarget) {
      dispatchApplicationContext({ type: 'clearPackageVolume' })
      return
    }

    let isActive = true
    dispatchApplicationContext({
      type: 'packageVolumeLoadStart',
      target: packageVolumeLookupTarget,
    })
    void fetchOfferPackageVolume(packageNumberForVolumeLookup)
      .then((volume) => {
        if (isActive) {
          const normalizedVolume = normalizeOfferContextVolume(volume)
          dispatchApplicationContext(
            normalizedVolume === null
              ? { type: 'packageVolumeLoadFailure', target: packageVolumeLookupTarget }
              : {
                  type: 'packageVolumeLoadSuccess',
                  target: packageVolumeLookupTarget,
                  packageVolume: normalizedVolume,
                },
          )
        }
      })
      .catch(() => {
        if (isActive) {
          dispatchApplicationContext({
            type: 'packageVolumeLoadFailure',
            target: packageVolumeLookupTarget,
          })
        }
      })

    return () => {
      isActive = false
    }
  }, [packageNumberForVolumeLookup, packageVolumeLookupTarget])

  const contextVolume = form.packageNumber.trim()
    ? packageVolumeTarget === currentPackageVolumeTarget && !isLoadingPackageVolume
      ? packageVolume
      : ''
    : isLoadingApplicationContext || isApplicationLookupDebouncing
      ? ''
      : applicationVolume

  const fieldErrors = useMemo<FieldErrors<ProvincialOfferCreateField>>(
    () => ({
      applicationNumber: firstValidationError(
        () => requiredFieldError(form.applicationNumber, 'Application number'),
        () => provincialApplicationNumberFieldError(form.applicationNumber),
        () => applicationValidationError || null,
      ),
      // Without a found application, only its number shows an error.
      ...(applicationLoaded
        ? {
            packageNumber: firstValidationError(
              () => packageVolumeError || null,
              () =>
                packageOptions.length > 0
                  ? requiredFieldError(form.packageNumber, 'Package number')
                  : null,
              () =>
                packageOptions.length > 0 &&
                !packageOptions.some((option) => option.value === form.packageNumber)
                  ? 'Select a package from this application.'
                  : null,
            ),
            companyName:
              offerTextStorageFieldError(
                effectiveCompanyName,
                OFFER_COMPANY_NAME_MAX_LENGTH,
                'Company',
                true,
              ) ?? undefined,
            contactName:
              offerTextStorageFieldError(
                effectiveContactName,
                OFFER_CONTACT_NAME_MAX_LENGTH,
                'Contact name',
                true,
              ) ?? undefined,
            offerVolume: firstValidationError(
              () =>
                offerDecimalStorageFieldError(
                  form.offerVolume,
                  OFFER_VOLUME_MAX,
                  'Offer volume',
                  false,
                  true,
                ),
              () => offerVolumeContextFieldError(form.offerVolume, contextVolume),
            ),
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
                'Offer conditions/remarks',
              ) ?? undefined,
            offerRemark: canManageOfferApproval
              ? (offerTextStorageFieldError(
                  form.offerRemark,
                  OFFER_REMARK_MAX_LENGTH,
                  'Offer remarks',
                ) ?? undefined)
              : undefined,
          }
        : {}),
    }),
    [
      applicationValidationError,
      canManageOfferApproval,
      contextVolume,
      effectiveCompanyName,
      effectiveContactName,
      form,
      applicationLoaded,
      packageOptions,
      packageVolumeError,
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
  const applicationNumberError =
    fieldError('applicationNumber') || fieldErrorText(applicationValidationError)
  const packageNumberError = fieldError('packageNumber') || fieldErrorText(packageVolumeError)

  const onSave = async (): Promise<boolean> => {
    // A client's company is text from their login, so its error can't show on a field.
    const saveUnavailableReason =
      isLoadingOfferContext || scopedClientLookupPending
        ? 'Application and client details must finish loading before this offer can be saved.'
        : scopedClientLookupError ||
          (isScopedProvincialSubmitter ? fieldErrors.companyName : undefined)
    if (saveUnavailableReason) {
      setStatus({
        kind: 'error',
        title: OFFER_NOT_SAVED_TITLE,
        message: saveUnavailableReason,
        focusOnReveal: true,
      })
      return false
    }
    if (hasValidationError) {
      // Before an application is found only its number was checked, so the fields that show
      // once it is found start without errors.
      if (applicationLoaded) {
        setShowAllValidationErrors(true)
      } else {
        markFieldTouched('applicationNumber')
      }
      setStatus({ kind: 'error', title: OFFER_NOT_SAVED_TITLE, message: FIELD_ERRORS_MESSAGE })
      focusFirstInvalidFieldAfterRender(() => formRef.current)
      return false
    }

    setStatus(null)
    setIsSubmitting(true)
    try {
      const result = await submitProvincialOfferCreate({
        ...form,
        applicationNumber: normalizeProvincialApplicationNumber(form.applicationNumber),
        offeringClientNumber: effectiveOfferingClientNumber,
        companyName: effectiveCompanyName,
        contactName: effectiveContactName,
        teacReviewDate: canManageOfferApproval
          ? form.teacReviewDate
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
          setCreatedOfferNavigation({
            path: `/provincial/offers/${encodeURIComponent(result.createdId)}`,
            notice: offerSaveNotice(result),
          })
          return true
        }
        setStatus({ kind: 'success', title: 'Offer saved.', message: '' })
        return true
      }

      setStatus({
        kind: 'error',
        title: OFFER_NOT_SAVED_TITLE,
        message:
          result.errors[0] ||
          result.message ||
          'Offer save failed. Please review the form and try again. If the problem persists, contact support.',
        focusOnReveal: true,
      })
      return false
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: OFFER_NOT_SAVED_TITLE,
        message:
          'Offer save failed. Please review the form and try again. If the problem persists, contact support.',
        focusOnReveal: true,
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

  const yesNoGroup = (
    field: 'fairOfferIndicator' | 'validOfferIndicator' | 'approvalIndicator',
    label: string,
  ) => (
    <RadioButtonGroup
      legendText={label}
      name={field}
      orientation="horizontal"
      valueSelected={form[field]}
      onChange={(value) => {
        markFormEdited()
        setForm((current) => ({ ...current, [field]: String(value) }))
      }}
    >
      {YES_NO_OPTIONS.map((option) => (
        <RadioButton
          key={option.value}
          id={`${field}-${option.value}`}
          value={option.value}
          labelText={option.label}
        />
      ))}
    </RadioButtonGroup>
  )

  return (
    <Grid fullWidth className="default-grid create-page-grid provincial-offer-create-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Create new offer"
          subtitle="Make an offer to buy timber advertised on the Advertising List."
          focusTitle
          actionsLabel="Offer form actions"
          actions={
            <>
              <Button
                type="button"
                kind="tertiary"
                size="md"
                disabled={isSubmitting}
                onClick={() => navigate('/provincial/offers')}
              >
                Cancel
              </Button>
              <Button
                type="button"
                kind="primary"
                size="md"
                onClick={() => void onSave()}
                disabled={isSubmitting}
                renderIcon={isSubmitting ? PendingIcon : Save}
              >
                {isSubmitting ? 'Saving…' : 'Save offer'}
              </Button>
            </>
          }
        />
      </Column>

      {!!status && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            className="create-form-validation-notification"
            kind={status.kind}
            revealKey={status}
            title={status.title}
            subtitle={status.message}
            focusOnReveal={status.focusOnReveal}
            lowContrast
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

      <Column ref={formRef} sm={4} md={8} lg={16}>
        <Tile className="create-form-tile offer-form-card">
          <OfferFormSection icon={Result} title="Application details">
            <RequiredFieldsLegend />
            <RecordFieldGrid editing>
              <RecordFieldRow>
                <RecordFieldCell>
                  <TextInput
                    id="applicationNumber"
                    labelText={requiredLabel('Application number')}
                    aria-required="true"
                    value={form.applicationNumber}
                    helperText="Once the application is found, you can fill in your offer."
                    invalid={!!applicationNumberError}
                    invalidText={applicationNumberError}
                    onBlur={() => markFieldTouched('applicationNumber')}
                    onChange={(event) => {
                      markFormEdited()
                      setForm((current) => ({ ...current, applicationNumber: event.target.value }))
                    }}
                  />
                  {isLoadingApplicationContext && (
                    <InlineLoading
                      className="offer-application-check"
                      description="Checking application…"
                      aria-live="polite"
                    />
                  )}
                  <div className="cds--visually-hidden" aria-live="polite" aria-atomic="true">
                    {foundAnnouncement}
                  </div>
                </RecordFieldCell>
                {offerSectionsShown &&
                  (packageOptions.length > 0 ? (
                    <>
                      <RecordFieldCell>
                        <SearchableSelect
                          id="packageNumber"
                          labelText={requiredLabel('Package number')}
                          required
                          clearable={false}
                          value={form.packageNumber}
                          options={packageOptions}
                          placeholder="Select package number"
                          invalid={!!packageNumberError}
                          invalidText={packageNumberError}
                          onBlur={() => markFieldTouched('packageNumber')}
                          onChange={(value) => {
                            markFormEdited()
                            setForm((current) => ({ ...current, packageNumber: value }))
                          }}
                        />
                      </RecordFieldCell>
                      {!!form.packageNumber.trim() && (
                        <RecordFieldCell className="offer-scale-detail-cell">
                          <OfferScaleDetailAction
                            target={{ packageNumber: currentPackageNumberForVolumeLookup }}
                          />
                        </RecordFieldCell>
                      )}
                    </>
                  ) : (
                    <RecordField
                      label="Package number"
                      value={hasNoPackagesForApplication ? 'No packages' : undefined}
                    />
                  ))}
              </RecordFieldRow>
            </RecordFieldGrid>
          </OfferFormSection>

          {offerSectionsShown && (
            <>
              <OfferFormSection icon={Enterprise} title="Offering company details">
                <RecordFieldGrid editing>
                  <RecordFieldRow>
                    {isScopedProvincialSubmitter ? (
                      <RecordField label="Company" value={effectiveCompanyName} />
                    ) : (
                      <RecordFieldCell>
                        <TextInput
                          id="companyName"
                          labelText={requiredLabel('Company')}
                          aria-required="true"
                          value={effectiveCompanyName}
                          invalid={!!fieldError('companyName')}
                          invalidText={fieldError('companyName')}
                          onBlur={() => markFieldTouched('companyName')}
                          onChange={(event) => {
                            markFormEdited()
                            setForm((current) => ({ ...current, companyName: event.target.value }))
                          }}
                          maxLength={OFFER_COMPANY_NAME_MAX_LENGTH}
                        />
                      </RecordFieldCell>
                    )}
                    <RecordFieldCell>
                      <TextInput
                        id="contactName"
                        labelText={requiredLabel('Contact name')}
                        aria-required="true"
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
                    </RecordFieldCell>
                  </RecordFieldRow>
                </RecordFieldGrid>
              </OfferFormSection>

              <OfferFormSection icon={DataDefinition} title="Offer details">
                <RecordFieldGrid editing>
                  <RecordFieldRow>
                    <RecordField
                      label="Application/package volume (m³)"
                      value={displayVolume(contextVolume)}
                    />
                    <RecordFieldCell>
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
                            offerVolume:
                              !contextVolume.trim() ||
                              offerVolumeContextFieldError(current.offerVolume, contextVolume)
                                ? current.offerVolume
                                : formatLegacyOfferVolume(current.offerVolume),
                          }))
                        }}
                        onChange={(event) => {
                          markFormEdited()
                          setForm((current) => ({ ...current, offerVolume: event.target.value }))
                        }}
                      />
                    </RecordFieldCell>
                    <RecordField
                      label="Species/grade"
                      value={applicationDetails?.speciesGradeCode}
                    />
                    <RecordFieldCell>
                      <TextInput
                        id="purchaseOfferAmount"
                        labelText={requiredLabel('Offer amount ($/m³)')}
                        aria-required="true"
                        value={form.purchaseOfferAmount}
                        invalid={!!fieldError('purchaseOfferAmount')}
                        invalidText={fieldError('purchaseOfferAmount')}
                        onBlur={() => markFieldTouched('purchaseOfferAmount')}
                        onChange={(event) => {
                          markFormEdited()
                          setForm((current) => ({
                            ...current,
                            purchaseOfferAmount: event.target.value,
                          }))
                        }}
                      />
                    </RecordFieldCell>
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordField
                      label="List date"
                      value={displayNumericDate(applicationDetails?.advertisingDate)}
                    />
                    <RecordField
                      label="Offer received date"
                      value={displayNumericDate(receivedDate)}
                    />
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordFieldCell span="wide">
                      <TextArea
                        id="pickupLocation"
                        labelText={requiredLabel('Pickup location')}
                        aria-required="true"
                        enableCounter
                        maxCount={OFFER_PICKUP_LOCATION_MAX_LENGTH}
                        maxLength={OFFER_PICKUP_LOCATION_MAX_LENGTH}
                        value={form.pickupLocation}
                        invalid={!!fieldError('pickupLocation')}
                        invalidText={fieldError('pickupLocation')}
                        onBlur={() => markFieldTouched('pickupLocation')}
                        onChange={(event) => {
                          markFormEdited()
                          setForm((current) => ({ ...current, pickupLocation: event.target.value }))
                        }}
                      />
                    </RecordFieldCell>
                  </RecordFieldRow>
                  <RecordFieldRow>
                    <RecordFieldCell span="wide">
                      <TextArea
                        id="offerCondition"
                        labelText="Offer conditions/remarks"
                        enableCounter
                        maxCount={OFFER_CONDITION_MAX_LENGTH}
                        maxLength={OFFER_CONDITION_MAX_LENGTH}
                        value={form.offerCondition}
                        invalid={!!fieldError('offerCondition')}
                        invalidText={fieldError('offerCondition')}
                        onBlur={() => markFieldTouched('offerCondition')}
                        onChange={(event) => {
                          markFormEdited()
                          setForm((current) => ({ ...current, offerCondition: event.target.value }))
                        }}
                      />
                    </RecordFieldCell>
                  </RecordFieldRow>
                </RecordFieldGrid>
              </OfferFormSection>

              <OfferFormSection icon={Stamp} title="Approval">
                {canManageOfferApproval ? (
                  <RecordFieldGrid editing>
                    <RecordFieldRow>
                      <RecordFieldCell>
                        <IsoDatePicker
                          id="teacReviewDate"
                          labelText="TEAC review date"
                          value={form.teacReviewDate}
                          invalid={!!fieldError('teacReviewDate')}
                          invalidText={fieldError('teacReviewDate')}
                          onBlur={() => markFieldTouched('teacReviewDate')}
                          onChange={(value) => {
                            markFormEdited()
                            setForm((current) => ({ ...current, teacReviewDate: value }))
                          }}
                        />
                      </RecordFieldCell>
                      <RecordFieldCell>
                        {yesNoGroup('fairOfferIndicator', 'Fair market value')}
                      </RecordFieldCell>
                      <RecordFieldCell>
                        {yesNoGroup('validOfferIndicator', 'Valid offer')}
                      </RecordFieldCell>
                      <RecordFieldCell>
                        {yesNoGroup('approvalIndicator', 'Offer approved')}
                      </RecordFieldCell>
                    </RecordFieldRow>
                    <RecordFieldRow>
                      <RecordFieldCell span="wide">
                        <TextArea
                          id="offerRemark"
                          labelText="Offer remarks"
                          enableCounter
                          maxCount={OFFER_REMARK_MAX_LENGTH}
                          maxLength={OFFER_REMARK_MAX_LENGTH}
                          value={form.offerRemark}
                          invalid={!!fieldError('offerRemark')}
                          invalidText={fieldError('offerRemark')}
                          onBlur={() => markFieldTouched('offerRemark')}
                          onChange={(event) => {
                            markFormEdited()
                            setForm((current) => ({ ...current, offerRemark: event.target.value }))
                          }}
                        />
                      </RecordFieldCell>
                    </RecordFieldRow>
                  </RecordFieldGrid>
                ) : (
                  <RecordFieldGrid editing>
                    <RecordFieldRow>
                      <RecordField
                        label="Fair market value"
                        value={yesNoLabel(INITIAL_FORM.fairOfferIndicator)}
                      />
                      <RecordField
                        label="Valid offer"
                        value={yesNoLabel(INITIAL_FORM.validOfferIndicator)}
                      />
                      <RecordField
                        label="Offer approved"
                        value={yesNoLabel(INITIAL_FORM.approvalIndicator)}
                      />
                    </RecordFieldRow>
                  </RecordFieldGrid>
                )}
              </OfferFormSection>
            </>
          )}
        </Tile>
      </Column>
      <UnsavedChangesGuard
        isDirty={isCreateDraftDirty}
        isBusy={isSubmitting}
        onDiscard={onDiscardCreateDraft}
        discardCopy={discardNewRecordCopy('offer')}
        subject="this new purchase offer"
      />
    </Grid>
  )
}

export default ProvincialOfferCreatePage
