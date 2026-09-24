import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button,
  Column,
  Checkbox,
  FilterableMultiSelect,
  Grid,
  InlineNotification,
  RadioButton,
  RadioButtonGroup,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import SearchableSelect from '../../components/SearchableSelect'
import { AppNotification } from '../../components/AppNotification'
import ForestClientComboBox from '@/components/ForestClientComboBox'
import PageHeader from '@/components/PageHeader'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import ApplicationAccuracyConfirmation, {
  APPLICATION_ACCURACY_ACKNOWLEDGEMENT,
} from '@/components/ApplicationAccuracyConfirmation'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { nonNegativeWholeNumberFieldError } from '@/pages/shared/application-term-utils'
import {
  applicationListDateOptions,
  NO_LIST_DATE_VALUE,
} from '@/pages/shared/application-list-date-options'
import {
  CLIENT_LOOKUP_UNAVAILABLE_MESSAGE,
  averageLogVolumeFieldError,
  clientLookupNumbersMatch,
  clientLocationLabel,
  isAgentApplicant,
  isSelectableClientContact,
  isSelectableClientLocation,
  productTypeRequiresGrowthType,
  productTypeRequiresLogDetails,
  resolveClientContactName,
  resolveClientLocationCode,
  toSearchOption,
} from '@/pages/shared/application-form-utils'
import {
  atMostTwoDecimalFieldError,
  firstValidationError,
  greaterThanFieldError,
  getVisibleFieldError,
  isoDateFieldError,
  maxLengthFieldError,
  maxNumericValueFieldError,
  positiveNumericFieldError,
  requiredFieldError,
  requiredMaxLengthFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { useDebouncedValue } from '@/pages/shared/useDebouncedValue'
import {
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'
import { submitProvincialApplicationCreate } from '@/service/create-submit-service'
import {
  fetchApplicationClientData,
  fetchApplicationClientContacts,
  fetchApplicationClientLocations,
  type ApplicationClientData,
  type ApplicationClientContact,
  type ApplicationClientLocation,
} from '@/service/application-client-lookup-service'
import {
  fetchApplicationEndUsesForSpeciesRegion,
  fetchApplicationRemainingSpecies,
  type ApplicationCodeOption,
} from '@/service/provincial-application-items-service'
import { useAuth } from '@/context/auth/useAuth'
import { useAllowedRegionOptions } from '@/context/auth/useAllowedRegionOptions'
import { hasProvincialSubmitterRole } from '@/context/auth/role-utils'
import IsoDatePicker from '../../components/IsoDatePicker'
import { formatBusinessIsoDate } from '@/utils/date'
import { requiredLabel } from '@/utils/required-label'
import { displayValue } from '@/utils/text'
import './ApplicationCreate.scss'

type ProvincialApplicationCreateForm = {
  ownerClientNumber: string
  ownerClientLocationCode: string
  ownerContactName: string
  agentClientNumber: string
  agentClientLocationCode: string
  agentContactName: string
  applicantTypeCode: string
  productTypeCode: string
  ageClass: string
  exemptionType: string
  region: string
  applicationDate: string
  applicationTermDays: string
  exportScheduleId: string
  listingDate: string
  productLocation: string
  applicationVolume: string
  averageLogVolume: string
  speciesCodes: string[]
  endUseCode: string
}

type ProvincialApplicationCreateField = keyof ProvincialApplicationCreateForm & string

type CreatedApplicationNavigation = {
  path: string
  applicationNumber: string
}

// INTENTIONAL_LEGACY_DIVERGENCE(APPLICATION_FLOW_LAYOUT): Keep agent entry in Applicant
// and record-dependent actions unavailable until the application has been saved.
type ApplicationCreateTab =
  | 'owner'
  | 'application'
  | 'items'
  | 'documents'
  | 'remarks'
  | 'offers'
  | 'review'

const APPLICATION_CREATE_TABS: ApplicationCreateTab[] = [
  'owner',
  'application',
  'items',
  'documents',
  'remarks',
  'offers',
  'review',
]

const APPLICATION_CREATE_TAB_LABELS: Record<ApplicationCreateTab, string> = {
  owner: 'Applicant',
  application: 'Application',
  items: 'Scale',
  documents: 'Documents',
  remarks: 'Remarks',
  offers: 'Offers',
  review: 'Review',
}

const CLIENT_NUMBER_PATTERN = /^\d{1,8}$/
const ASCII_PATTERN = /^[\u0000-\u007f]*$/
const APPLICATION_CONTACT_NAME_MAX_LENGTH = 120
const APPLICATION_PRODUCT_LOCATION_MAX_LENGTH = 250

const clientNumberFieldError = (value: string, label: string): string | undefined =>
  firstValidationError(
    () => requiredFieldError(value, label),
    () => (CLIENT_NUMBER_PATTERN.test(value.trim()) ? null : `${label} must be 1 to 8 digits.`),
  )

const applicationTextStorageFieldError = (
  value: string,
  maximumLength: number,
  label: string,
  required = false,
): string | undefined =>
  firstValidationError(
    () => (required ? requiredFieldError(value, label) : null),
    () =>
      ASCII_PATTERN.test(value.trim())
        ? null
        : `${label} contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.`,
    () => maxLengthFieldError(value, maximumLength, label),
  )

const APPLICATION_CREATE_FIELD_TAB: Partial<
  Record<ProvincialApplicationCreateField, ApplicationCreateTab>
> = {
  ownerClientNumber: 'owner',
  ownerClientLocationCode: 'owner',
  ownerContactName: 'owner',
  applicantTypeCode: 'owner',
  agentClientNumber: 'owner',
  agentClientLocationCode: 'owner',
  agentContactName: 'owner',
  productTypeCode: 'application',
  exemptionType: 'application',
  region: 'application',
  applicationDate: 'application',
  applicationTermDays: 'application',
  exportScheduleId: 'application',
  ageClass: 'items',
  productLocation: 'items',
  applicationVolume: 'items',
  averageLogVolume: 'items',
  speciesCodes: 'items',
  endUseCode: 'items',
}

const INITIAL_FORM: ProvincialApplicationCreateForm = {
  ownerClientNumber: '',
  ownerClientLocationCode: '',
  ownerContactName: '',
  agentClientNumber: '',
  agentClientLocationCode: '',
  agentContactName: '',
  applicantTypeCode: 'O',
  productTypeCode: 'H',
  ageClass: '',
  exemptionType: 'S',
  region: '',
  applicationDate: '',
  applicationTermDays: '180',
  exportScheduleId: '',
  listingDate: '',
  productLocation: '',
  applicationVolume: '',
  averageLogVolume: '',
  speciesCodes: [],
  endUseCode: '',
}

const buildInitialFormFromQuery = (
  query: URLSearchParams,
  provincialSubmitterIdentityLocked: boolean,
  authoritativeOwnerClientNumber: string,
  canChangeApplicantType: boolean,
): ProvincialApplicationCreateForm => {
  const today = formatBusinessIsoDate()
  return {
    ...INITIAL_FORM,
    ownerClientNumber: provincialSubmitterIdentityLocked
      ? authoritativeOwnerClientNumber
      : (query.get('ownerClientNumber') ?? ''),
    ownerClientLocationCode: provincialSubmitterIdentityLocked
      ? authoritativeOwnerClientNumber
        ? '00'
        : ''
      : (query.get('ownerClientLocationCode') ?? query.get('ownerClientLocation') ?? ''),
    ownerContactName: query.get('ownerContactName') ?? query.get('ownerName') ?? '',
    agentClientNumber: canChangeApplicantType
      ? (query.get('agentClientNumber') ?? query.get('applicantClientNumber') ?? '')
      : '',
    agentClientLocationCode: canChangeApplicantType
      ? (query.get('agentClientLocationCode') ?? query.get('agentClientLocation') ?? '')
      : '',
    agentContactName: canChangeApplicantType ? (query.get('agentContactName') ?? '') : '',
    applicantTypeCode: canChangeApplicantType
      ? (query.get('ownerApplicantType') ?? query.get('applicantType') ?? 'O')
      : 'O',
    productTypeCode: query.get('productTypeCode') ?? INITIAL_FORM.productTypeCode,
    ageClass: query.get('ageClass') ?? query.get('growthTypeCode') ?? '',
    exemptionType:
      query.get('exemptionReason') ??
      query.get('exemptionReasonCode') ??
      INITIAL_FORM.exemptionType,
    region: provincialSubmitterIdentityLocked
      ? ''
      : (query.get('region') ?? query.get('orgUnitNumber') ?? INITIAL_FORM.region),
    applicationDate: query.get('applicationDate') ?? today,
    applicationTermDays:
      query.get('applicationTermDays') ??
      query.get('exemptionTerm') ??
      query.get('termDays') ??
      INITIAL_FORM.applicationTermDays,
    exportScheduleId: query.get('exportScheduleId') ?? query.get('legacyExportScheduleId') ?? '',
    listingDate: query.get('listingDate') ?? '',
    productLocation: query.get('productLocation') ?? query.get('logLocation') ?? '',
    applicationVolume: query.get('applicationVolume') ?? '',
    averageLogVolume: query.get('averageLogVolume') ?? query.get('logVolume') ?? '',
    speciesCodes: (query.get('speciesCodes') ?? query.get('speciesTableValues') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    endUseCode:
      query.get('applicationEndUseCode') ?? query.get('endUseCode') ?? query.get('endUse') ?? '',
  }
}

const applyScheduleDefaults = (
  form: ProvincialApplicationCreateForm,
  schedules: SearchOption[],
  defaultScheduleId: string | undefined,
): ProvincialApplicationCreateForm => {
  if (schedules.length === 0) {
    return form
  }

  const nextListingSchedule = schedules.find((option) => option.value === defaultScheduleId)
  if (!form.exportScheduleId && !form.listingDate && nextListingSchedule) {
    return {
      ...form,
      exportScheduleId: nextListingSchedule.value,
      listingDate: nextListingSchedule.label,
    }
  }

  if (
    form.exportScheduleId ||
    !form.listingDate ||
    !schedules.some((option) => option.label === form.listingDate)
  ) {
    return form
  }

  const matchingSchedule = schedules.find((option) => option.label === form.listingDate)
  return matchingSchedule ? { ...form, exportScheduleId: matchingSchedule.value } : form
}

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
  placement?: 'inline'
}

type ClientLookupFailure = 'owner-locations' | 'agent-locations' | 'owner-details' | 'agent-details'

const CLIENT_LOOKUP_UNAVAILABLE_STATUS: PageStatus = {
  kind: 'error',
  title: 'Client details unavailable',
  message: CLIENT_LOOKUP_UNAVAILABLE_MESSAGE,
}

type ApplicationCreateClientSummaryProps = {
  title: string
  clientData: ApplicationClientData | null
}

const ApplicationCreateClientSummary = ({
  title,
  clientData,
}: ApplicationCreateClientSummaryProps) => {
  if (!clientData) {
    return null
  }

  return (
    <section className="application-create-client-summary" aria-label={title}>
      <dl className="detail-field-grid">
        {[
          ['Company name', displayValue(clientData.companyName)],
          ['Address', displayValue(clientData.address)],
          ['City', displayValue(clientData.city)],
          ['Province', displayValue(clientData.province)],
          ['Postal code', displayValue(clientData.postalCode)],
          ['Country', displayValue(clientData.country)],
          ['Phone', displayValue(clientData.phone)],
          ['Fax', displayValue(clientData.fax)],
          ['Email', displayValue(clientData.email)],
        ].map(([label, value]) => (
          <div key={label} className="detail-field-item">
            <dt className="detail-field-label">{label}</dt>
            <dd className="detail-field-value">{value}</dd>
          </div>
        ))}
      </dl>
      {clientData.notfound && (
        <InlineNotification
          className="detail-context-notification"
          kind="warning"
          title="Client lookup"
          subtitle={clientData.notfound}
          lowContrast
          hideCloseButton
        />
      )}
    </section>
  )
}

const ProvincialApplicationCreatePage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { capabilities, canPerform } = useAuth()
  const canChangeApplicantType = canPerform('/changeApplicantType')
  const canReviewApplications = canPerform('/applicationsReview')
  const canViewRemarks = canPerform('/applicationRemarks')
  const provincialSubmitterIdentityLocked = hasProvincialSubmitterRole(capabilities.roles)
  const authoritativeOwnerClientNumber = capabilities.forestClientNumber?.trim() ?? ''
  const authoritativeOrgUnitNo = capabilities.orgUnitNo?.trim() ?? ''
  const provincialSubmitterScopeUnavailable =
    provincialSubmitterIdentityLocked && !authoritativeOwnerClientNumber
  const [form, setForm] = useState<ProvincialApplicationCreateForm>(() =>
    buildInitialFormFromQuery(
      searchParams,
      provincialSubmitterIdentityLocked,
      authoritativeOwnerClientNumber,
      canChangeApplicantType,
    ),
  )
  const draftBaselineRef = useRef(form)
  const currentFormRef = useRef(form)
  currentFormRef.current = form
  const [formEdited, setFormEdited] = useState(false)
  const [clientSearchResetKey, setClientSearchResetKey] = useState(0)
  const [createdApplicationNavigation, setCreatedApplicationNavigation] =
    useState<CreatedApplicationNavigation | null>(null)
  const [productTypes, setProductTypes] = useState<SearchOption[]>([])
  const [growthTypes, setGrowthTypes] = useState<SearchOption[]>([])
  const [exemptionReasons, setExemptionReasons] = useState<SearchOption[]>([])
  const [allRegions, setAllRegions] = useState<SearchOption[]>([])
  const regions = useAllowedRegionOptions(allRegions, 'createApplication', 'value')
  const [currentSchedules, setCurrentSchedules] = useState<SearchOption[]>([])
  const [optionsLoaded, setOptionsLoaded] = useState(false)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [ownerClientLocations, setOwnerClientLocations] = useState<ApplicationClientLocation[]>([])
  const [agentClientLocations, setAgentClientLocations] = useState<ApplicationClientLocation[]>([])
  const [ownerClientContacts, setOwnerClientContacts] = useState<ApplicationClientContact[]>([])
  const [agentClientContacts, setAgentClientContacts] = useState<ApplicationClientContact[]>([])
  const [ownerClientData, setOwnerClientData] = useState<ApplicationClientData | null>(null)
  const [agentClientData, setAgentClientData] = useState<ApplicationClientData | null>(null)
  const [applicationSpeciesOptions, setApplicationSpeciesOptions] = useState<
    ApplicationCodeOption[]
  >([])
  const [applicationSpeciesScope, setApplicationSpeciesScope] = useState('')
  const [applicationEndUseOptions, setApplicationEndUseOptions] = useState<ApplicationCodeOption[]>(
    [],
  )
  const [isLoadingOwnerClientLocations, setIsLoadingOwnerClientLocations] = useState(false)
  const [isLoadingAgentClientLocations, setIsLoadingAgentClientLocations] = useState(false)
  const [isLoadingOwnerClientContacts, setIsLoadingOwnerClientContacts] = useState(false)
  const [isLoadingAgentClientContacts, setIsLoadingAgentClientContacts] = useState(false)
  const [isLoadingApplicationSpecies, setIsLoadingApplicationSpecies] = useState(false)
  const [isLoadingApplicationEndUses, setIsLoadingApplicationEndUses] = useState(false)
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [clientLookupFailures, setClientLookupFailures] = useState<
    ReadonlySet<ClientLookupFailure>
  >(() => new Set())
  const updateClientLookupFailure = useCallback((lookup: ClientLookupFailure, failed: boolean) => {
    setClientLookupFailures((current) => {
      if (current.has(lookup) === failed) {
        return current
      }

      const next = new Set(current)
      if (failed) {
        next.add(lookup)
      } else {
        next.delete(lookup)
      }
      return next
    })
  }, [])
  const [showMissingRequiredOptions, setShowMissingRequiredOptions] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [accuracyConfirmationOpen, setAccuracyConfirmationOpen] = useState(false)
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false)
  const [touchedFields, setTouchedFields] = useState<
    TouchedFields<ProvincialApplicationCreateField>
  >({})
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)
  const [selectedApplicationTab, setSelectedApplicationTab] =
    useState<ApplicationCreateTab>('owner')
  const hasAgentDetails = isAgentApplicant(form.applicantTypeCode)
  const visibleApplicationTabs = useMemo(
    () =>
      APPLICATION_CREATE_TABS.filter(
        (tab) =>
          (tab !== 'remarks' || canViewRemarks) && (tab !== 'review' || canReviewApplications),
      ),
    [canReviewApplications, canViewRemarks],
  )
  const selectedApplicationTabIndex = Math.max(
    0,
    visibleApplicationTabs.indexOf(selectedApplicationTab),
  )
  const debouncedOwnerClientNumber = useDebouncedValue(form.ownerClientNumber)
  const debouncedAgentClientNumber = useDebouncedValue(form.agentClientNumber)
  const ownerClientNumberForLookup = formEdited
    ? debouncedOwnerClientNumber
    : form.ownerClientNumber
  const agentClientNumberForLookup = formEdited
    ? debouncedAgentClientNumber
    : form.agentClientNumber

  useEffect(() => {
    if (createdApplicationNavigation) {
      navigate(createdApplicationNavigation.path, {
        state: {
          applicationCreationNotice: {
            applicationNumber: createdApplicationNavigation.applicationNumber,
          },
        },
      })
    }
  }, [createdApplicationNavigation, navigate])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const options = await fetchProvincialApplicationOptions()
        const nextSchedules = options.nextSchedules ?? options.currentSchedules
        const scheduleOptions = applicationListDateOptions(
          nextSchedules,
          options.currentSchedules,
          canReviewApplications,
          formatBusinessIsoDate(),
        )
        const defaultScheduleId = nextSchedules.find((option) => option.value.trim())?.value
        setProductTypes(options.productTypes)
        setGrowthTypes(options.growthTypes)
        setExemptionReasons(options.exemptionReasons)
        setAllRegions(options.regions)
        setCurrentSchedules(scheduleOptions)
        setForm((current) => {
          const withScheduleDefaults = applyScheduleDefaults(
            current,
            scheduleOptions,
            defaultScheduleId,
          )
          if (!provincialSubmitterIdentityLocked) {
            return withScheduleDefaults
          }

          const defaultRegion = options.regions.some(
            (option) => option.value === authoritativeOrgUnitNo,
          )
            ? authoritativeOrgUnitNo
            : ''
          return withScheduleDefaults.region === defaultRegion
            ? withScheduleDefaults
            : { ...withScheduleDefaults, region: defaultRegion }
        })
        setOptionsUnavailable(false)
      } catch {
        setOptionsUnavailable(true)
      } finally {
        setOptionsLoaded(true)
      }
    }

    void loadOptions()
  }, [authoritativeOrgUnitNo, canReviewApplications, provincialSubmitterIdentityLocked])

  useEffect(() => {
    if (!provincialSubmitterIdentityLocked) {
      return undefined
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (!isActive) {
        return
      }

      setForm((current) => {
        const ownerClientLocationCode = authoritativeOwnerClientNumber ? '00' : ''
        if (
          current.ownerClientNumber === authoritativeOwnerClientNumber &&
          current.ownerClientLocationCode === ownerClientLocationCode
        ) {
          return current
        }
        return {
          ...current,
          ownerClientNumber: authoritativeOwnerClientNumber,
          ownerClientLocationCode,
        }
      })
    })

    return () => {
      isActive = false
    }
  }, [authoritativeOwnerClientNumber, provincialSubmitterIdentityLocked])

  useEffect(() => {
    if (canChangeApplicantType) {
      return undefined
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (!isActive) {
        return
      }
      setForm((current) =>
        current.applicantTypeCode === 'O' &&
        !current.agentClientNumber &&
        !current.agentClientLocationCode &&
        !current.agentContactName
          ? current
          : {
              ...current,
              applicantTypeCode: 'O',
              agentClientNumber: '',
              agentClientLocationCode: '',
              agentContactName: '',
            },
      )
    })

    return () => {
      isActive = false
    }
  }, [canChangeApplicantType])

  useEffect(() => {
    if (exemptionReasons.length === 0) {
      return
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (!isActive) {
        return
      }

      setForm((current) => {
        const currentExemptionReason = current.exemptionType.trim()
        if (
          !currentExemptionReason ||
          exemptionReasons.some((option) => option.value === currentExemptionReason)
        ) {
          return current
        }

        return { ...current, exemptionType: '' }
      })
    })

    return () => {
      isActive = false
    }
  }, [exemptionReasons])

  useEffect(() => {
    const ownerClientNumber = ownerClientNumberForLookup.trim()
    if (!CLIENT_NUMBER_PATTERN.test(ownerClientNumber)) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setOwnerClientLocations([])
        setOwnerClientContacts([])
        setOwnerClientData(null)
        setIsLoadingOwnerClientLocations(false)
        updateClientLookupFailure('owner-locations', false)
        setForm((current) =>
          current.ownerClientLocationCode || current.ownerContactName
            ? { ...current, ownerClientLocationCode: '', ownerContactName: '' }
            : current,
        )
      })

      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingOwnerClientLocations(true)
      }
    })

    void fetchApplicationClientLocations(ownerClientNumber, 'owner')
      .then((locations) => {
        if (
          !isActive ||
          !clientLookupNumbersMatch(currentFormRef.current.ownerClientNumber, ownerClientNumber)
        ) {
          return
        }

        setOwnerClientLocations(locations)
        updateClientLookupFailure('owner-locations', false)
        setForm((current) => {
          if (!clientLookupNumbersMatch(current.ownerClientNumber, ownerClientNumber)) {
            return current
          }

          const nextOwnerClientLocationCode = resolveClientLocationCode(
            locations,
            current.ownerClientLocationCode,
          )
          const nextOwnerContactName =
            nextOwnerClientLocationCode === current.ownerClientLocationCode
              ? current.ownerContactName
              : ''
          return current.ownerClientLocationCode === nextOwnerClientLocationCode &&
            current.ownerContactName === nextOwnerContactName
            ? current
            : {
                ...current,
                ownerClientLocationCode: nextOwnerClientLocationCode,
                ownerContactName: nextOwnerContactName,
              }
        })
      })
      .catch(() => {
        if (
          isActive &&
          clientLookupNumbersMatch(currentFormRef.current.ownerClientNumber, ownerClientNumber)
        ) {
          updateClientLookupFailure('owner-locations', true)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingOwnerClientLocations(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [ownerClientNumberForLookup, updateClientLookupFailure])

  useEffect(() => {
    if (!isAgentApplicant(form.applicantTypeCode)) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setAgentClientLocations([])
        setIsLoadingAgentClientLocations(false)
        updateClientLookupFailure('agent-locations', false)
        setForm((current) =>
          current.agentClientNumber || current.agentClientLocationCode || current.agentContactName
            ? {
                ...current,
                agentClientNumber: '',
                agentClientLocationCode: '',
                agentContactName: '',
              }
            : current,
        )
      })

      return () => {
        isActive = false
      }
    }

    const agentClientNumber = agentClientNumberForLookup.trim()
    if (!CLIENT_NUMBER_PATTERN.test(agentClientNumber)) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setAgentClientLocations([])
        setAgentClientContacts([])
        setAgentClientData(null)
        setIsLoadingAgentClientLocations(false)
        updateClientLookupFailure('agent-locations', false)
        setForm((current) =>
          current.agentClientLocationCode || current.agentContactName
            ? { ...current, agentClientLocationCode: '', agentContactName: '' }
            : current,
        )
      })

      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingAgentClientLocations(true)
      }
    })

    void fetchApplicationClientLocations(agentClientNumber, 'agent')
      .then((locations) => {
        if (
          !isActive ||
          !clientLookupNumbersMatch(currentFormRef.current.agentClientNumber, agentClientNumber)
        ) {
          return
        }

        setAgentClientLocations(locations)
        updateClientLookupFailure('agent-locations', false)
        setForm((current) => {
          if (!clientLookupNumbersMatch(current.agentClientNumber, agentClientNumber)) {
            return current
          }

          const nextAgentClientLocationCode = resolveClientLocationCode(
            locations,
            current.agentClientLocationCode,
          )
          const nextAgentContactName =
            nextAgentClientLocationCode === current.agentClientLocationCode
              ? current.agentContactName
              : ''
          return current.agentClientLocationCode === nextAgentClientLocationCode &&
            current.agentContactName === nextAgentContactName
            ? current
            : {
                ...current,
                agentClientLocationCode: nextAgentClientLocationCode,
                agentContactName: nextAgentContactName,
              }
        })
      })
      .catch(() => {
        if (
          isActive &&
          clientLookupNumbersMatch(currentFormRef.current.agentClientNumber, agentClientNumber)
        ) {
          updateClientLookupFailure('agent-locations', true)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingAgentClientLocations(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [agentClientNumberForLookup, form.applicantTypeCode, updateClientLookupFailure])

  useEffect(() => {
    const ownerClientNumber = ownerClientNumberForLookup.trim()
    const ownerClientLocationCode = form.ownerClientLocationCode.trim()
    if (!ownerClientNumber || !ownerClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setOwnerClientContacts([])
        setOwnerClientData(null)
        setIsLoadingOwnerClientContacts(false)
        updateClientLookupFailure('owner-details', false)
        setForm((current) =>
          current.ownerContactName ? { ...current, ownerContactName: '' } : current,
        )
      })

      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingOwnerClientContacts(true)
      }
    })

    void Promise.all([
      fetchApplicationClientContacts(ownerClientNumber, ownerClientLocationCode, 'owner'),
      fetchApplicationClientData(ownerClientNumber, ownerClientLocationCode),
    ])
      .then(([contacts, clientData]) => {
        const currentForm = currentFormRef.current
        if (
          !isActive ||
          !clientLookupNumbersMatch(currentForm.ownerClientNumber, ownerClientNumber) ||
          currentForm.ownerClientLocationCode.trim() !== ownerClientLocationCode
        ) {
          return
        }

        setOwnerClientContacts(contacts)
        setOwnerClientData(clientData)
        updateClientLookupFailure('owner-details', false)
        setForm((current) => {
          if (
            !clientLookupNumbersMatch(current.ownerClientNumber, ownerClientNumber) ||
            current.ownerClientLocationCode.trim() !== ownerClientLocationCode
          ) {
            return current
          }

          const confirmedOwnerClientNumber = clientData?.clientNumber.trim() || ownerClientNumber
          const nextOwnerContactName = resolveClientContactName(contacts, current.ownerContactName)
          return current.ownerClientNumber === confirmedOwnerClientNumber &&
            current.ownerContactName === nextOwnerContactName
            ? current
            : {
                ...current,
                ownerClientNumber: confirmedOwnerClientNumber,
                ownerContactName: nextOwnerContactName,
              }
        })
      })
      .catch(() => {
        const currentForm = currentFormRef.current
        if (
          isActive &&
          clientLookupNumbersMatch(currentForm.ownerClientNumber, ownerClientNumber) &&
          currentForm.ownerClientLocationCode.trim() === ownerClientLocationCode
        ) {
          updateClientLookupFailure('owner-details', true)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingOwnerClientContacts(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [form.ownerClientLocationCode, ownerClientNumberForLookup, updateClientLookupFailure])

  useEffect(() => {
    if (!isAgentApplicant(form.applicantTypeCode)) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setAgentClientContacts([])
        setAgentClientData(null)
        setIsLoadingAgentClientContacts(false)
        updateClientLookupFailure('agent-details', false)
        setForm((current) =>
          current.agentContactName ? { ...current, agentContactName: '' } : current,
        )
      })

      return () => {
        isActive = false
      }
    }

    const agentClientNumber = agentClientNumberForLookup.trim()
    const agentClientLocationCode = form.agentClientLocationCode.trim()
    if (!agentClientNumber || !agentClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setAgentClientContacts([])
        setAgentClientData(null)
        setIsLoadingAgentClientContacts(false)
        updateClientLookupFailure('agent-details', false)
      })

      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingAgentClientContacts(true)
      }
    })

    void Promise.all([
      fetchApplicationClientContacts(agentClientNumber, agentClientLocationCode, 'agent'),
      fetchApplicationClientData(agentClientNumber, agentClientLocationCode),
    ])
      .then(([contacts, clientData]) => {
        const currentForm = currentFormRef.current
        if (
          !isActive ||
          !clientLookupNumbersMatch(currentForm.agentClientNumber, agentClientNumber) ||
          currentForm.agentClientLocationCode.trim() !== agentClientLocationCode
        ) {
          return
        }

        setAgentClientContacts(contacts)
        setAgentClientData(clientData)
        updateClientLookupFailure('agent-details', false)
        setForm((current) => {
          if (
            !clientLookupNumbersMatch(current.agentClientNumber, agentClientNumber) ||
            current.agentClientLocationCode.trim() !== agentClientLocationCode
          ) {
            return current
          }

          const confirmedAgentClientNumber = clientData?.clientNumber.trim() || agentClientNumber
          const nextAgentContactName = resolveClientContactName(contacts, current.agentContactName)
          return current.agentClientNumber === confirmedAgentClientNumber &&
            current.agentContactName === nextAgentContactName
            ? current
            : {
                ...current,
                agentClientNumber: confirmedAgentClientNumber,
                agentContactName: nextAgentContactName,
              }
        })
      })
      .catch(() => {
        const currentForm = currentFormRef.current
        if (
          isActive &&
          clientLookupNumbersMatch(currentForm.agentClientNumber, agentClientNumber) &&
          currentForm.agentClientLocationCode.trim() === agentClientLocationCode
        ) {
          updateClientLookupFailure('agent-details', true)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingAgentClientContacts(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [
    agentClientNumberForLookup,
    form.agentClientLocationCode,
    form.applicantTypeCode,
    updateClientLookupFailure,
  ])

  useEffect(() => {
    const region = form.region.trim()
    const productTypeCode = form.productTypeCode.trim()
    if (!region || !productTypeCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setApplicationSpeciesOptions([])
        setIsLoadingApplicationSpecies(false)
      })

      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingApplicationSpecies(true)
      }
    })

    void fetchApplicationRemainingSpecies(region, productTypeCode, form.speciesCodes)
      .then((options) => {
        if (!isActive) {
          return
        }

        setApplicationSpeciesScope(`${region}|${productTypeCode}`)
        // The endpoint omits selected species; retain their labels for the multiselect.
        setApplicationSpeciesOptions((current) => [
          ...current.filter(
            (option) =>
              form.speciesCodes.includes(option.code) &&
              !options.some((next) => next.code === option.code),
          ),
          ...options,
        ])
      })
      .catch((error) => {
        if (!isActive) {
          return
        }

        console.warn('Unable to load remaining application species.', error)
        setApplicationSpeciesOptions([])
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingApplicationSpecies(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [form.productTypeCode, form.region, form.speciesCodes])

  useEffect(() => {
    const region = form.region.trim()
    if (!region || form.speciesCodes.length === 0) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setApplicationEndUseOptions([])
        setIsLoadingApplicationEndUses(false)
        setForm((current) => (current.endUseCode ? { ...current, endUseCode: '' } : current))
      })

      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setIsLoadingApplicationEndUses(true)
      }
    })

    void fetchApplicationEndUsesForSpeciesRegion(region, form.speciesCodes)
      .then((options) => {
        if (!isActive) {
          return
        }

        setApplicationEndUseOptions(options)
        setForm((current) => {
          const currentSpeciesKey = current.speciesCodes.join(',')
          const requestedSpeciesKey = form.speciesCodes.join(',')
          if (current.region.trim() !== region || currentSpeciesKey !== requestedSpeciesKey) {
            return current
          }
          if (current.endUseCode && options.some((option) => option.code === current.endUseCode)) {
            return current
          }
          return { ...current, endUseCode: options[0]?.code ?? '' }
        })
      })
      .catch((error) => {
        if (!isActive) {
          return
        }

        console.warn('Unable to load application end-use options.', error)
        setApplicationEndUseOptions([])
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingApplicationEndUses(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [form.region, form.speciesCodes])

  const fieldErrors = useMemo<FieldErrors<ProvincialApplicationCreateField>>(
    () => ({
      ownerClientNumber: clientNumberFieldError(form.ownerClientNumber, 'Applicant client number'),
      ownerClientLocationCode:
        requiredMaxLengthFieldError(
          form.ownerClientLocationCode,
          2,
          'Applicant client location code',
        ) ?? undefined,
      ownerContactName: applicationTextStorageFieldError(
        form.ownerContactName,
        APPLICATION_CONTACT_NAME_MAX_LENGTH,
        'Applicant contact name',
        true,
      ),
      agentClientNumber: isAgentApplicant(form.applicantTypeCode)
        ? clientNumberFieldError(form.agentClientNumber, 'Agent client number')
        : undefined,
      agentClientLocationCode: isAgentApplicant(form.applicantTypeCode)
        ? (requiredMaxLengthFieldError(
            form.agentClientLocationCode,
            2,
            'Agent client location code',
          ) ?? undefined)
        : undefined,
      agentContactName: isAgentApplicant(form.applicantTypeCode)
        ? applicationTextStorageFieldError(
            form.agentContactName,
            APPLICATION_CONTACT_NAME_MAX_LENGTH,
            'Agent contact name',
            true,
          )
        : undefined,
      applicantTypeCode: firstValidationError(
        () => requiredFieldError(form.applicantTypeCode, 'Applicant type'),
        () =>
          form.applicantTypeCode === 'O' ||
          form.applicantTypeCode === 'M' ||
          form.applicantTypeCode === 'A'
            ? null
            : 'Applicant type must be Owner, Ministerial, or Agent.',
      ),
      productTypeCode: firstValidationError(
        () => requiredFieldError(form.productTypeCode, 'Product type'),
        () =>
          productTypes.some((option) => option.value === form.productTypeCode)
            ? null
            : 'Select a valid product type.',
      ),
      ageClass: productTypeRequiresGrowthType(form.productTypeCode)
        ? firstValidationError(
            () => requiredFieldError(form.ageClass, 'Age class'),
            () =>
              growthTypes.some((option) => option.value === form.ageClass)
                ? null
                : 'Select a valid age class.',
          )
        : undefined,
      speciesCodes:
        form.speciesCodes.length === 0
          ? !form.region.trim()
            ? 'Select a region before adding species.'
            : !form.productTypeCode.trim()
              ? 'Select a product type before adding species.'
              : !isLoadingApplicationSpecies && applicationSpeciesOptions.length === 0
                ? 'At least one species is required, but no species are available for the selected region and product type.'
                : 'At least one species is required.'
          : undefined,
      exemptionType: firstValidationError(
        () =>
          requiredMaxLengthFieldError(
            form.exemptionType,
            1,
            'Exemption reason code',
            'Exemption reason',
          ),
        () =>
          exemptionReasons.some((option) => option.value === form.exemptionType)
            ? null
            : 'Select a valid exemption reason.',
      ),
      region: firstValidationError(
        () => requiredFieldError(form.region, 'Region'),
        () =>
          regions.some((option) => option.value === form.region) ? null : 'Select a valid region.',
      ),
      applicationDate: firstValidationError(
        () => requiredFieldError(form.applicationDate, 'Application date'),
        () => isoDateFieldError(form.applicationDate),
      ),
      applicationTermDays: firstValidationError(
        () => requiredFieldError(form.applicationTermDays, 'Exemption term days'),
        () => nonNegativeWholeNumberFieldError(form.applicationTermDays, 'Exemption term days'),
        () => greaterThanFieldError(form.applicationTermDays, 'Exemption term days', 0),
        () => maxNumericValueFieldError(form.applicationTermDays, 99999, 'Exemption term days'),
      ),
      exportScheduleId:
        (canReviewApplications && !form.exportScheduleId) ||
        currentSchedules.some((option) => option.value === form.exportScheduleId)
          ? undefined
          : 'Select a valid list date.',
      productLocation: productTypeRequiresLogDetails(form.productTypeCode)
        ? applicationTextStorageFieldError(
            form.productLocation,
            APPLICATION_PRODUCT_LOCATION_MAX_LENGTH,
            'Location of logs',
            true,
          )
        : undefined,
      applicationVolume: firstValidationError(
        () => requiredFieldError(form.applicationVolume, 'Application volume'),
        () => positiveNumericFieldError(form.applicationVolume),
        () => maxNumericValueFieldError(form.applicationVolume, 9999999.99, 'Application volume'),
        () => atMostTwoDecimalFieldError(form.applicationVolume, 'Application volume'),
      ),
      averageLogVolume: productTypeRequiresLogDetails(form.productTypeCode)
        ? averageLogVolumeFieldError(form.averageLogVolume)
        : undefined,
    }),
    [
      applicationSpeciesOptions.length,
      canReviewApplications,
      currentSchedules,
      exemptionReasons,
      form,
      growthTypes,
      isLoadingApplicationSpecies,
      productTypes,
      regions,
    ],
  )
  const hasValidationError = useMemo(
    () => Object.values(fieldErrors).some((error) => !!error),
    [fieldErrors],
  )
  const requiredApplicationOptionsMissing =
    optionsLoaded &&
    !optionsUnavailable &&
    (productTypes.length === 0 ||
      exemptionReasons.length === 0 ||
      regions.length === 0 ||
      (productTypeRequiresGrowthType(form.productTypeCode) && growthTypes.length === 0))
  const missingRequiredOptions = requiredApplicationOptionsMissing && showMissingRequiredOptions
  const hasSelectableOwnerClientLocations = ownerClientLocations.some(isSelectableClientLocation)
  const hasSelectableAgentClientLocations = agentClientLocations.some(isSelectableClientLocation)
  const hasSelectableOwnerClientContacts = ownerClientContacts.some(isSelectableClientContact)
  const hasSelectableAgentClientContacts = agentClientContacts.some(isSelectableClientContact)
  const hasValidOwnerClientNumber = CLIENT_NUMBER_PATTERN.test(form.ownerClientNumber.trim())
  const hasValidAgentClientNumber = CLIENT_NUMBER_PATTERN.test(form.agentClientNumber.trim())
  const selectedApplicationSpeciesOptions = form.speciesCodes.map(
    (code) =>
      applicationSpeciesOptions.find((option) => option.code === code) ?? {
        code,
        description: '',
      },
  )
  const applicationSpeciesSelectOptions = [
    ...selectedApplicationSpeciesOptions,
    ...applicationSpeciesOptions.filter((option) => !form.speciesCodes.includes(option.code)),
  ]
  const applicationEndUseSelectOptions = applicationEndUseOptions.map(toSearchOption)
  // Refreshing after a species pick keeps the list usable so further picks and focus are not
  // lost; options from another region or product type stay locked until the new list loads.
  const isLoadingApplicationSpeciesScope =
    isLoadingApplicationSpecies &&
    applicationSpeciesScope !== `${form.region.trim()}|${form.productTypeCode.trim()}`
  const isApplicationSpeciesSelectDisabled =
    !form.region.trim() ||
    !form.productTypeCode.trim() ||
    isLoadingApplicationSpeciesScope ||
    applicationSpeciesSelectOptions.length === 0
  const ownerClientLocationPlaceholder = !form.ownerClientNumber.trim()
    ? 'Enter applicant client number first'
    : !hasValidOwnerClientNumber
      ? 'Enter a valid applicant client number'
      : isLoadingOwnerClientLocations
        ? 'Loading locations'
        : hasSelectableOwnerClientLocations
          ? 'Select applicant client location'
          : 'No locations on file'
  const agentClientLocationPlaceholder = !form.agentClientNumber.trim()
    ? 'Enter agent client number first'
    : !hasValidAgentClientNumber
      ? 'Enter a valid agent client number'
      : isLoadingAgentClientLocations
        ? 'Loading locations'
        : hasSelectableAgentClientLocations
          ? 'Select agent client location'
          : 'No locations on file'
  const ownerContactPlaceholder = !form.ownerClientLocationCode.trim()
    ? 'Select applicant location first'
    : isLoadingOwnerClientContacts
      ? 'Loading contacts'
      : hasSelectableOwnerClientContacts
        ? 'Select applicant contact'
        : 'No contacts on file'
  const agentContactPlaceholder = !form.agentClientLocationCode.trim()
    ? 'Select agent location first'
    : isLoadingAgentClientContacts
      ? 'Loading contacts'
      : hasSelectableAgentClientContacts
        ? 'Select agent contact'
        : 'No contacts on file'
  const speciesPlaceholder = !form.region.trim()
    ? 'Select region first'
    : !form.productTypeCode.trim()
      ? 'Select product type first'
      : isLoadingApplicationSpeciesScope
        ? 'Loading species'
        : applicationSpeciesSelectOptions.length > 0
          ? 'Select species'
          : 'No remaining species'
  const endUsePlaceholder =
    form.speciesCodes.length === 0
      ? 'Add species first'
      : isLoadingApplicationEndUses
        ? 'Loading end uses'
        : applicationEndUseSelectOptions.length > 0
          ? 'Select end use'
          : 'No end uses on file'

  const markFieldTouched = (field: ProvincialApplicationCreateField): void => {
    setTouchedFields((current) => ({ ...current, [field]: true }))
  }

  const markFormEdited = (): void => {
    if (!formEdited) {
      draftBaselineRef.current = form
    }
    setFormEdited(true)
  }

  const fieldError = (field: ProvincialApplicationCreateField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showAllValidationErrors)
  const speciesCodesError = fieldError('speciesCodes')
  const firstInvalidField = (Object.keys(fieldErrors) as ProvincialApplicationCreateField[]).find(
    (field) => !!fieldErrors[field],
  )

  const onSave = async (
    accuracyAcknowledged = false,
    navigateToCreatedRecord = true,
  ): Promise<boolean> => {
    if (provincialSubmitterIdentityLocked && !accuracyAcknowledged) {
      return false
    }
    if (
      !optionsLoaded ||
      optionsUnavailable ||
      requiredApplicationOptionsMissing ||
      isLoadingOwnerClientLocations ||
      isLoadingAgentClientLocations ||
      isLoadingOwnerClientContacts ||
      isLoadingAgentClientContacts ||
      provincialSubmitterScopeUnavailable
    ) {
      return false
    }
    setStatus(null)
    setIsSubmitting(true)
    try {
      const confirmClientNumber = async (
        clientNumber: string,
        clientLocationCode: string,
      ): Promise<string> => {
        const normalizedClientNumber = clientNumber.trim()
        if (!/^\d{1,7}$/.test(normalizedClientNumber) || !clientLocationCode.trim()) {
          return normalizedClientNumber
        }

        const clientData = await fetchApplicationClientData(
          normalizedClientNumber,
          clientLocationCode,
        )
        return clientData?.clientNumber.trim() || normalizedClientNumber
      }
      const [ownerClientNumber, agentClientNumber] = await Promise.all([
        confirmClientNumber(form.ownerClientNumber, form.ownerClientLocationCode),
        isAgentApplicant(form.applicantTypeCode)
          ? confirmClientNumber(form.agentClientNumber, form.agentClientLocationCode)
          : Promise.resolve(''),
      ])
      const confirmedForm = { ...form, ownerClientNumber, agentClientNumber }
      setForm((current) =>
        current.ownerClientNumber === form.ownerClientNumber &&
        current.ownerClientLocationCode === form.ownerClientLocationCode &&
        current.agentClientNumber === form.agentClientNumber &&
        current.agentClientLocationCode === form.agentClientLocationCode
          ? { ...current, ownerClientNumber, agentClientNumber }
          : current,
      )

      if (hasValidationError) {
        if (firstInvalidField) {
          setSelectedApplicationTab(
            APPLICATION_CREATE_FIELD_TAB[firstInvalidField] ?? 'application',
          )
        }
        setShowAllValidationErrors(true)
        setStatus({
          kind: 'error',
          title: 'Cannot save yet.',
          message: 'Complete the required fields in the Applicant, Application and Scale tabs.',
          placement: 'inline',
        })
        return false
      }

      const result = await submitProvincialApplicationCreate({
        ...confirmedForm,
        applicationTermDays: confirmedForm.applicationTermDays.trim(),
      })
      if (result.success) {
        draftBaselineRef.current = confirmedForm
        setFormEdited(false)
        if (result.createdId) {
          if (navigateToCreatedRecord) {
            setCreatedApplicationNavigation({
              path: `/provincial/application/${encodeURIComponent(result.createdId)}`,
              applicationNumber: result.createdId,
            })
          }
          return true
        }
        setStatus({
          kind: 'success',
          title: 'Application Saved',
          message: 'Application saved successfully.',
        })
        return true
      }

      setStatus({
        kind: 'error',
        title: 'Save Failed',
        message:
          result.errors.length > 0
            ? result.errors.join(' ')
            : result.message.trim() ||
              'Application save failed. Please review the form and try again. If the problem persists, contact support.',
      })
      return false
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Save Failed',
        message:
          'Application save failed. Please review the form and try again. If the problem persists, contact support.',
      })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const closeAccuracyConfirmation = () => {
    setAccuracyConfirmationOpen(false)
    setAccuracyConfirmed(false)
  }

  const onRequestSave = () => {
    if (!provincialSubmitterIdentityLocked) {
      void onSave(false, true)
      return
    }
    setStatus(null)
    setAccuracyConfirmed(false)
    setAccuracyConfirmationOpen(true)
  }

  const onConfirmAccuracy = async () => {
    if (!accuracyConfirmed || isSubmitting) return
    const saved = await onSave(true, true)
    if (!saved) {
      throw new Error('Application save failed.')
    }
  }

  const onDiscardCreateDraft = (): void => {
    setForm(draftBaselineRef.current)
    setFormEdited(false)
    setClientSearchResetKey((current) => current + 1)
    setTouchedFields({})
    setShowAllValidationErrors(false)
    setStatus(null)
    closeAccuracyConfirmation()
  }

  const isCreateDraftDirty = formEdited && !formValuesEqual(form, draftBaselineRef.current)

  return (
    <Grid fullWidth className="default-grid create-page-grid provincial-application-create-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Create provincial application"
          actions={
            <div
              className="legacy-search-actions application-create-actions"
              role="group"
              aria-label="Application form actions"
            >
              <Button
                type="button"
                kind="tertiary"
                size="md"
                onClick={() => {
                  closeAccuracyConfirmation()
                  navigate('/provincial/application')
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                kind="primary"
                size="md"
                onClick={onRequestSave}
                disabled={
                  !optionsLoaded ||
                  optionsUnavailable ||
                  requiredApplicationOptionsMissing ||
                  isSubmitting ||
                  isLoadingOwnerClientLocations ||
                  isLoadingAgentClientLocations ||
                  isLoadingOwnerClientContacts ||
                  isLoadingAgentClientContacts ||
                  provincialSubmitterScopeUnavailable
                }
              >
                {isSubmitting ? 'Saving application…' : 'Save application'}
              </Button>
            </div>
          }
        />
      </Column>

      {status?.kind !== 'error' && !accuracyConfirmationOpen && (
        <Column sm={4} md={8} lg={16}>
          <InlineNotification
            kind="info"
            title="The application number is assigned when you save."
            subtitle="Documents, Remarks, Offers and Review are available after that, according to your access."
            lowContrast
            hideCloseButton
          />
        </Column>
      )}

      {optionsUnavailable && <AuthoritativeOptionsUnavailableNotification />}

      {provincialSubmitterScopeUnavailable && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="error"
            title="Forest client scope unavailable"
            subtitle="Your Provincial Submitter access does not contain one authoritative forest client. Save is disabled."
            lowContrast
          />
        </Column>
      )}

      {missingRequiredOptions && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="warning"
            title="Required options not configured"
            subtitle="A required product type, exemption reason, age class, or region list is empty. Save remains disabled."
            lowContrast
            onCloseButtonClick={() => setShowMissingRequiredOptions(false)}
          />
        </Column>
      )}

      {clientLookupFailures.size > 0 && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind={CLIENT_LOOKUP_UNAVAILABLE_STATUS.kind}
            title={CLIENT_LOOKUP_UNAVAILABLE_STATUS.title}
            subtitle={CLIENT_LOOKUP_UNAVAILABLE_STATUS.message}
            lowContrast
            onCloseButtonClick={() => setClientLookupFailures(new Set())}
          />
        </Column>
      )}

      {!!status && status.placement !== 'inline' && !accuracyConfirmationOpen && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind={status.kind}
            title={status.title}
            subtitle={status.message}
            lowContrast
            onCloseButtonClick={() => setStatus(null)}
          />
        </Column>
      )}

      <Column sm={4} md={8} lg={16} className="application-detail-tabs-column">
        {status?.placement === 'inline' && !accuracyConfirmationOpen && (
          <AppNotification
            className="create-form-validation-notification"
            kind="error"
            revealKey={status}
            title={status.title}
            subtitle={status.message}
            lowContrast
            onCloseButtonClick={() => setStatus(null)}
          />
        )}
        <Tabs
          selectedIndex={selectedApplicationTabIndex}
          onChange={({ selectedIndex }) => {
            const selectedTab = visibleApplicationTabs[selectedIndex]
            if (selectedTab) {
              setSelectedApplicationTab(selectedTab)
            }
          }}
        >
          <TabList
            aria-label="Application create sections"
            contained
            className="application-tabs__list application-detail-tab-list"
          >
            {visibleApplicationTabs.map((tab) => {
              const errorCount = showAllValidationErrors
                ? (Object.keys(fieldErrors) as ProvincialApplicationCreateField[]).filter(
                    (field) => fieldErrors[field] && APPLICATION_CREATE_FIELD_TAB[field] === tab,
                  ).length
                : 0
              return (
                <Tab
                  key={tab}
                  aria-label={APPLICATION_CREATE_TAB_LABELS[tab]}
                  aria-description={errorCount ? `${errorCount} fields need attention` : undefined}
                >
                  {APPLICATION_CREATE_TAB_LABELS[tab]}
                  {errorCount > 0 && (
                    <span className="application-create-tab-errors" aria-hidden="true">
                      {errorCount}
                    </span>
                  )}
                </Tab>
              )
            })}
          </TabList>
          <TabPanels>
            <TabPanel className="application-detail-tab-panel">
              <Tile
                className="create-form-tile application-detail-section"
                role="region"
                aria-label="Applicant"
              >
                <p className="application-create-required">* Required fields</p>
                <div className="legacy-search-grid create-form-grid application-create-client-grid">
                  {hasSelectableOwnerClientContacts || isLoadingOwnerClientContacts ? (
                    <SearchableSelect
                      id="ownerContactName"
                      labelText={requiredLabel('Contact name')}
                      required
                      value={form.ownerContactName}
                      disabled={
                        !form.ownerClientLocationCode.trim() || isLoadingOwnerClientContacts
                      }
                      invalid={!!fieldError('ownerContactName')}
                      invalidText={fieldError('ownerContactName')}
                      placeholder={ownerContactPlaceholder}
                      allowCustomValue
                      options={ownerClientContacts
                        .filter(isSelectableClientContact)
                        .map((contact) => ({
                          value: contact.contactName,
                          label: contact.contactName,
                        }))}
                      onBlur={() => markFieldTouched('ownerContactName')}
                      onChange={(value) => {
                        markFormEdited()
                        setForm((current) => ({ ...current, ownerContactName: value }))
                      }}
                    />
                  ) : (
                    <TextInput
                      id="ownerContactName"
                      labelText={requiredLabel('Contact name')}
                      aria-required="true"
                      value={form.ownerContactName}
                      disabled={!form.ownerClientLocationCode.trim()}
                      placeholder="Enter applicant contact name"
                      invalid={!!fieldError('ownerContactName')}
                      invalidText={fieldError('ownerContactName')}
                      onBlur={() => markFieldTouched('ownerContactName')}
                      onChange={(event) => {
                        markFormEdited()
                        setForm((current) => ({
                          ...current,
                          ownerContactName: event.target.value,
                        }))
                      }}
                    />
                  )}
                  {provincialSubmitterIdentityLocked ? (
                    <TextInput
                      id="ownerClientNumber"
                      labelText={requiredLabel('Client')}
                      aria-required="true"
                      value={form.ownerClientNumber}
                      readOnly
                      helperText="Loaded from your authenticated forest client access."
                      invalid={!!fieldError('ownerClientNumber')}
                      invalidText={fieldError('ownerClientNumber')}
                      onBlur={() => markFieldTouched('ownerClientNumber')}
                      onChange={(event) => {
                        markFormEdited()
                        setOwnerClientLocations([])
                        setOwnerClientContacts([])
                        setOwnerClientData(null)
                        setForm((current) => ({
                          ...current,
                          ownerClientNumber: event.target.value,
                          ownerClientLocationCode: '',
                          ownerContactName: '',
                        }))
                      }}
                    />
                  ) : (
                    <ForestClientComboBox
                      id="ownerClientNumber"
                      labelText={requiredLabel('Client')}
                      value={form.ownerClientNumber}
                      resetKey={clientSearchResetKey}
                      selectedClientName={ownerClientData?.companyName}
                      counterpartyClientNumber={form.agentClientNumber}
                      required
                      invalid={!!fieldError('ownerClientNumber')}
                      invalidText={fieldError('ownerClientNumber')}
                      onBlur={() => markFieldTouched('ownerClientNumber')}
                      onChange={(ownerClientNumber) => {
                        markFormEdited()
                        setOwnerClientLocations([])
                        setOwnerClientContacts([])
                        setOwnerClientData(null)
                        setForm((current) => ({
                          ...current,
                          ownerClientNumber,
                          ownerClientLocationCode: '',
                          ownerContactName: '',
                        }))
                      }}
                    />
                  )}
                  <SearchableSelect
                    id="ownerClientLocationCode"
                    labelText={requiredLabel('Client location')}
                    required
                    value={form.ownerClientLocationCode}
                    disabled={!hasValidOwnerClientNumber || isLoadingOwnerClientLocations}
                    invalid={!!fieldError('ownerClientLocationCode')}
                    invalidText={fieldError('ownerClientLocationCode')}
                    placeholder={ownerClientLocationPlaceholder}
                    options={ownerClientLocations
                      .filter(isSelectableClientLocation)
                      .map((location) => ({
                        value: location.locationCode,
                        label: clientLocationLabel(location.locationCode, location.locationName),
                      }))}
                    onBlur={() => markFieldTouched('ownerClientLocationCode')}
                    onChange={(value) => {
                      markFormEdited()
                      setOwnerClientContacts([])
                      setOwnerClientData(null)
                      setForm((current) => ({
                        ...current,
                        ownerClientLocationCode: value,
                        ownerContactName:
                          current.ownerClientLocationCode === value ? current.ownerContactName : '',
                      }))
                    }}
                  />
                  <ApplicationCreateClientSummary
                    title="Applicant client details"
                    clientData={ownerClientData}
                  />
                </div>
                <div className="application-create-applicant-type">
                  {canChangeApplicantType && !hasAgentDetails ? (
                    <SearchableSelect
                      id="applicantTypeCode"
                      labelText={requiredLabel('Applicant type')}
                      required
                      value={form.applicantTypeCode}
                      placeholder="Select applicant type"
                      options={[
                        { value: 'O', label: 'Owner' },
                        { value: 'M', label: 'Ministerial' },
                      ]}
                      invalid={!!fieldError('applicantTypeCode')}
                      invalidText={fieldError('applicantTypeCode')}
                      onBlur={() => markFieldTouched('applicantTypeCode')}
                      onChange={(applicantTypeCode) => {
                        markFormEdited()
                        setForm((current) => ({
                          ...current,
                          applicantTypeCode,
                          agentClientNumber: isAgentApplicant(applicantTypeCode)
                            ? current.agentClientNumber
                            : '',
                          agentClientLocationCode: isAgentApplicant(applicantTypeCode)
                            ? current.agentClientLocationCode
                            : '',
                          agentContactName: isAgentApplicant(applicantTypeCode)
                            ? current.agentContactName
                            : '',
                        }))
                      }}
                    />
                  ) : !canChangeApplicantType ? (
                    <TextInput
                      id="applicantTypeCode"
                      labelText={requiredLabel('Applicant type')}
                      aria-required="true"
                      value="Owner"
                      readOnly
                    />
                  ) : null}
                  {canChangeApplicantType && (
                    <Checkbox
                      id="applicationCreateAgentUsed"
                      labelText="I'm an agent"
                      checked={hasAgentDetails}
                      disabled={isSubmitting}
                      onChange={(_, { checked }) => {
                        markFormEdited()
                        setForm((current) => ({
                          ...current,
                          applicantTypeCode: checked ? 'A' : 'O',
                          agentClientNumber: checked ? current.agentClientNumber : '',
                          agentClientLocationCode: checked ? current.agentClientLocationCode : '',
                          agentContactName: checked ? current.agentContactName : '',
                        }))
                      }}
                    />
                  )}
                </div>

                {hasAgentDetails && (
                  <section
                    className="application-create-agent-details"
                    role="region"
                    aria-label="Agent information"
                  >
                    <h2>Agent information</h2>
                    <div className="legacy-search-grid create-form-grid application-create-client-grid">
                      {hasSelectableAgentClientContacts || isLoadingAgentClientContacts ? (
                        <SearchableSelect
                          id="agentContactName"
                          labelText={requiredLabel('Contact name')}
                          required
                          value={form.agentContactName}
                          disabled={
                            !form.agentClientLocationCode.trim() || isLoadingAgentClientContacts
                          }
                          invalid={!!fieldError('agentContactName')}
                          invalidText={fieldError('agentContactName')}
                          placeholder={agentContactPlaceholder}
                          options={agentClientContacts
                            .filter(isSelectableClientContact)
                            .map((contact) => ({
                              value: contact.contactName,
                              label: contact.contactName,
                            }))}
                          onBlur={() => markFieldTouched('agentContactName')}
                          onChange={(value) => {
                            markFormEdited()
                            setForm((current) => ({ ...current, agentContactName: value }))
                          }}
                        />
                      ) : (
                        <TextInput
                          id="agentContactName"
                          labelText={requiredLabel('Contact name')}
                          aria-required="true"
                          value={form.agentContactName}
                          disabled={!form.agentClientLocationCode.trim()}
                          placeholder="Enter agent contact name"
                          invalid={!!fieldError('agentContactName')}
                          invalidText={fieldError('agentContactName')}
                          onBlur={() => markFieldTouched('agentContactName')}
                          onChange={(event) => {
                            markFormEdited()
                            setForm((current) => ({
                              ...current,
                              agentContactName: event.target.value,
                            }))
                          }}
                        />
                      )}
                      <ForestClientComboBox
                        id="agentClientNumber"
                        labelText={requiredLabel('Agent client')}
                        value={form.agentClientNumber}
                        resetKey={clientSearchResetKey}
                        selectedClientName={agentClientData?.companyName}
                        counterpartyClientNumber={form.ownerClientNumber}
                        required
                        invalid={!!fieldError('agentClientNumber')}
                        invalidText={fieldError('agentClientNumber')}
                        onBlur={() => markFieldTouched('agentClientNumber')}
                        onChange={(agentClientNumber) => {
                          markFormEdited()
                          setAgentClientLocations([])
                          setAgentClientContacts([])
                          setAgentClientData(null)
                          setForm((current) => ({
                            ...current,
                            agentClientNumber,
                            agentClientLocationCode: '',
                            agentContactName: '',
                          }))
                        }}
                      />
                      <SearchableSelect
                        id="agentClientLocationCode"
                        labelText={requiredLabel('Agent location')}
                        required
                        value={form.agentClientLocationCode}
                        disabled={!hasValidAgentClientNumber || isLoadingAgentClientLocations}
                        invalid={!!fieldError('agentClientLocationCode')}
                        invalidText={fieldError('agentClientLocationCode')}
                        placeholder={agentClientLocationPlaceholder}
                        options={agentClientLocations
                          .filter(isSelectableClientLocation)
                          .map((location) => ({
                            value: location.locationCode,
                            label: clientLocationLabel(
                              location.locationCode,
                              location.locationName,
                            ),
                          }))}
                        onBlur={() => markFieldTouched('agentClientLocationCode')}
                        onChange={(value) => {
                          markFormEdited()
                          setAgentClientContacts([])
                          setAgentClientData(null)
                          setForm((current) => ({
                            ...current,
                            agentClientLocationCode: value,
                            agentContactName:
                              current.agentClientLocationCode === value
                                ? current.agentContactName
                                : '',
                          }))
                        }}
                      />
                      <ApplicationCreateClientSummary
                        title="Agent client details"
                        clientData={agentClientData}
                      />
                    </div>
                  </section>
                )}
              </Tile>
            </TabPanel>
            <TabPanel className="application-detail-tab-panel">
              <Tile
                className="create-form-tile application-detail-section"
                role="region"
                aria-label="Application"
              >
                <p className="application-create-required">* Required fields</p>
                <div className="legacy-search-grid create-form-grid">
                  <SearchableSelect
                    id="region"
                    labelText={requiredLabel('Region')}
                    required
                    value={form.region}
                    invalid={!!fieldError('region')}
                    invalidText={fieldError('region')}
                    placeholder="Select region"
                    options={regions}
                    disabled={!optionsLoaded || optionsUnavailable}
                    onBlur={() => markFieldTouched('region')}
                    onChange={(value) => {
                      markFormEdited()
                      setForm((current) => {
                        if (current.region === value) {
                          return current
                        }
                        return {
                          ...current,
                          region: value,
                          speciesCodes: [],
                          endUseCode: '',
                        }
                      })
                    }}
                  />
                  <SearchableSelect
                    id="productTypeCode"
                    labelText={requiredLabel('Product type')}
                    required
                    value={form.productTypeCode}
                    invalid={!!fieldError('productTypeCode')}
                    invalidText={fieldError('productTypeCode')}
                    placeholder="Select product type"
                    options={productTypes}
                    disabled={!optionsLoaded || optionsUnavailable}
                    onBlur={() => markFieldTouched('productTypeCode')}
                    onChange={(value) => {
                      markFormEdited()
                      setForm((current) => {
                        if (current.productTypeCode === value) {
                          return current
                        }
                        return {
                          ...current,
                          productTypeCode: value,
                          ageClass: productTypeRequiresGrowthType(value) ? current.ageClass : '',
                          speciesCodes: [],
                          endUseCode: '',
                        }
                      })
                    }}
                  />
                  <SearchableSelect
                    id="exemptionType"
                    labelText={requiredLabel('Exemption reason')}
                    required
                    value={form.exemptionType}
                    invalid={!!fieldError('exemptionType')}
                    invalidText={fieldError('exemptionType')}
                    placeholder="Select exemption reason"
                    options={exemptionReasons}
                    disabled={!optionsLoaded || optionsUnavailable}
                    onBlur={() => markFieldTouched('exemptionType')}
                    onChange={(value) => {
                      markFormEdited()
                      setForm((current) => ({ ...current, exemptionType: value }))
                    }}
                  />
                  <IsoDatePicker
                    id="applicationDate"
                    labelText={requiredLabel('Application date (YYYY-MM-DD)')}
                    required
                    value={form.applicationDate}
                    invalid={!!fieldError('applicationDate')}
                    invalidText={fieldError('applicationDate')}
                    onBlur={() => markFieldTouched('applicationDate')}
                    onChange={(value) => {
                      markFormEdited()
                      setForm((current) => ({ ...current, applicationDate: value }))
                    }}
                  />
                  <div className="application-list-date-field">
                    <RadioButtonGroup
                      legendText={requiredLabel('List date')}
                      name="exportScheduleId"
                      valueSelected={
                        form.exportScheduleId || (canReviewApplications ? NO_LIST_DATE_VALUE : '')
                      }
                      required
                      orientation="horizontal"
                      disabled={!optionsLoaded || optionsUnavailable}
                      onChange={(value) => {
                        markFormEdited()
                        markFieldTouched('exportScheduleId')
                        const selectedId = String(value)
                        setForm((current) => ({
                          ...current,
                          exportScheduleId: selectedId === NO_LIST_DATE_VALUE ? '' : selectedId,
                          listingDate:
                            selectedId !== NO_LIST_DATE_VALUE
                              ? (currentSchedules.find((option) => option.value === selectedId)
                                  ?.label ?? '')
                              : '',
                        }))
                      }}
                    >
                      {currentSchedules.map((option) => (
                        <RadioButton
                          key={option.value}
                          id={`exportScheduleId-${option.value}`}
                          value={option.value}
                          labelText={option.label}
                        />
                      ))}
                    </RadioButtonGroup>
                    {fieldError('exportScheduleId') && (
                      <p role="alert">{fieldError('exportScheduleId')}</p>
                    )}
                  </div>
                  <TextInput
                    id="applicationTermDays"
                    labelText={requiredLabel('Exemption term (days)')}
                    aria-required="true"
                    type="number"
                    min={1}
                    max={99999}
                    step={1}
                    value={form.applicationTermDays}
                    invalid={!!fieldError('applicationTermDays')}
                    invalidText={fieldError('applicationTermDays')}
                    onBlur={() => markFieldTouched('applicationTermDays')}
                    onChange={(event) => {
                      markFormEdited()
                      setForm((current) => ({
                        ...current,
                        applicationTermDays: event.target.value,
                      }))
                    }}
                  />
                </div>
              </Tile>
            </TabPanel>
            <TabPanel className="application-detail-tab-panel">
              <div className="application-items-grid">
                <Tile
                  className="create-form-tile application-detail-section"
                  role="region"
                  aria-label="Scale"
                >
                  <p className="application-create-required">* Required fields</p>
                  <div className="legacy-search-grid create-form-grid">
                    {productTypeRequiresLogDetails(form.productTypeCode) && (
                      <TextArea
                        id="productLocation"
                        labelText={requiredLabel('Location of logs')}
                        aria-required="true"
                        enableCounter
                        maxCount={250}
                        maxLength={250}
                        value={form.productLocation}
                        invalid={!!fieldError('productLocation')}
                        invalidText={fieldError('productLocation')}
                        onBlur={() => markFieldTouched('productLocation')}
                        onChange={(event) => {
                          markFormEdited()
                          setForm((current) => ({
                            ...current,
                            productLocation: event.target.value,
                          }))
                        }}
                      />
                    )}
                    {productTypeRequiresGrowthType(form.productTypeCode) && (
                      <SearchableSelect
                        id="ageClass"
                        labelText={requiredLabel('Age class')}
                        required
                        value={form.ageClass}
                        disabled={!optionsLoaded || optionsUnavailable}
                        invalid={!!fieldError('ageClass')}
                        invalidText={fieldError('ageClass')}
                        placeholder="Select age class"
                        options={growthTypes}
                        onBlur={() => markFieldTouched('ageClass')}
                        onChange={(value) => {
                          markFormEdited()
                          setForm((current) => ({ ...current, ageClass: value }))
                        }}
                      />
                    )}
                    {productTypeRequiresLogDetails(form.productTypeCode) && (
                      <TextInput
                        id="averageLogVolume"
                        labelText={requiredLabel('Average log volume (m³)')}
                        aria-required="true"
                        type="number"
                        min={0}
                        max={99.9}
                        step="0.1"
                        value={form.averageLogVolume}
                        invalid={!!fieldError('averageLogVolume')}
                        invalidText={fieldError('averageLogVolume')}
                        onBlur={() => markFieldTouched('averageLogVolume')}
                        onChange={(event) => {
                          markFormEdited()
                          setForm((current) => ({
                            ...current,
                            averageLogVolume: event.target.value,
                          }))
                        }}
                      />
                    )}
                    <TextInput
                      id="applicationVolume"
                      labelText={requiredLabel('Application volume (m³)')}
                      aria-required="true"
                      value={form.applicationVolume}
                      invalid={!!fieldError('applicationVolume')}
                      invalidText={fieldError('applicationVolume')}
                      onBlur={() => markFieldTouched('applicationVolume')}
                      onChange={(event) => {
                        markFormEdited()
                        setForm((current) => ({
                          ...current,
                          applicationVolume: event.target.value,
                        }))
                      }}
                    />
                    <FilterableMultiSelect<ApplicationCodeOption>
                      id="applicationSpecies"
                      titleText={requiredLabel('Species list')}
                      items={applicationSpeciesSelectOptions}
                      selectedItems={selectedApplicationSpeciesOptions}
                      itemToString={(item) => (item ? toSearchOption(item).label : '')}
                      inputProps={{ 'aria-required': true }}
                      disabled={isApplicationSpeciesSelectDisabled}
                      placeholder={speciesPlaceholder}
                      invalid={!!speciesCodesError}
                      invalidText={speciesCodesError}
                      helperText={
                        isApplicationSpeciesSelectDisabled ? speciesCodesError : undefined
                      }
                      onChange={({ selectedItems }) => {
                        markFormEdited()
                        setForm((current) => ({
                          ...current,
                          speciesCodes: selectedItems.map((item) => item.code),
                          endUseCode: '',
                        }))
                        markFieldTouched('speciesCodes')
                      }}
                    />
                    <SearchableSelect
                      id="applicationEndUse"
                      labelText="End use"
                      value={form.endUseCode}
                      disabled={
                        form.speciesCodes.length === 0 ||
                        isLoadingApplicationEndUses ||
                        applicationEndUseSelectOptions.length === 0
                      }
                      placeholder={endUsePlaceholder}
                      options={applicationEndUseSelectOptions}
                      onChange={(value) => {
                        markFormEdited()
                        setForm((current) => ({ ...current, endUseCode: value }))
                      }}
                    />
                    <div className="detail-field-item">
                      <span className="detail-field-label">Total pieces</span>
                      <p className="detail-field-value">0</p>
                    </div>
                  </div>
                </Tile>
              </div>
            </TabPanel>
            <TabPanel className="application-detail-tab-panel">
              <Tile
                className="create-form-tile application-detail-section"
                role="region"
                aria-label="Documents"
              >
                <p className="detail-empty-message">Available after the application is saved.</p>
              </Tile>
            </TabPanel>
            {canViewRemarks
              ? [
                  <TabPanel key="remarks" className="application-detail-tab-panel">
                    <Tile
                      className="create-form-tile application-detail-section"
                      role="region"
                      aria-label="Remarks"
                    >
                      <p className="detail-empty-message">
                        Available after the application is saved.
                      </p>
                    </Tile>
                  </TabPanel>,
                ]
              : []}
            <TabPanel className="application-detail-tab-panel">
              <Tile
                className="create-form-tile application-detail-section"
                role="region"
                aria-label="Offers"
              >
                <p className="detail-empty-message">Available after the application is saved.</p>
              </Tile>
            </TabPanel>
            {canReviewApplications
              ? [
                  <TabPanel key="review" className="application-detail-tab-panel">
                    <Tile
                      className="create-form-tile application-detail-section"
                      role="region"
                      aria-label="Review"
                    >
                      <p className="detail-empty-message">
                        Available after the application is saved.
                      </p>
                    </Tile>
                  </TabPanel>,
                ]
              : []}
          </TabPanels>
        </Tabs>
      </Column>
      {accuracyConfirmationOpen && (
        <ApplicationAccuracyConfirmation
          open
          confirmed={accuracyConfirmed}
          busy={isSubmitting}
          confirmLabel="Save application"
          pendingLabel="Saving application…"
          onConfirmedChange={setAccuracyConfirmed}
          onConfirm={onConfirmAccuracy}
          onClose={closeAccuracyConfirmation}
          errorTitle={status?.title}
          errorMessage={status?.kind === 'error' ? status.message : undefined}
          onError={() => undefined}
        />
      )}
      <UnsavedChangesGuard
        isDirty={isCreateDraftDirty}
        isBusy={isSubmitting}
        onSave={() => onSave(provincialSubmitterIdentityLocked, false)}
        onDiscard={onDiscardCreateDraft}
        subject="this new application"
        saveAcknowledgement={
          provincialSubmitterIdentityLocked ? APPLICATION_ACCURACY_ACKNOWLEDGEMENT : undefined
        }
        saveUnavailableReason={
          !optionsLoaded || optionsUnavailable || requiredApplicationOptionsMissing
            ? 'Authoritative application options must load before this application can be saved.'
            : isLoadingOwnerClientLocations ||
                isLoadingAgentClientLocations ||
                isLoadingOwnerClientContacts ||
                isLoadingAgentClientContacts
              ? 'Client details must finish loading before this application can be saved.'
              : provincialSubmitterScopeUnavailable
                ? 'An authenticated forest client is required before this application can be saved.'
                : undefined
        }
      />
    </Grid>
  )
}

export default ProvincialApplicationCreatePage
