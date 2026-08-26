import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button,
  Column,
  DismissibleTag,
  Grid,
  InlineNotification,
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
import Modal from '@/components/Modal'
import DetailDocumentUploadPanel from '../../components/uploads/DetailDocumentUploadPanel'
import PageHeader from '@/components/PageHeader'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import ApplicationAccuracyConfirmation, {
  APPLICATION_ACCURACY_ACKNOWLEDGEMENT,
} from '@/components/ApplicationAccuracyConfirmation'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { nonNegativeWholeNumberFieldError } from '@/pages/shared/application-term-utils'
import {
  averageLogVolumeFieldError,
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
import { hasProvincialSubmitterRole } from '@/context/auth/role-utils'
import IsoDatePicker from '../../components/IsoDatePicker'
import { formatBusinessIsoDate } from '@/utils/date'
import { displayValue } from '@/utils/text'

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
  receivedDate: string
  exportScheduleId: string
  listingDate: string
  productLocation: string
  applicationVolume: string
  averageLogVolume: string
  speciesCodes: string[]
  endUseCode: string
  comments: string
}

type ProvincialApplicationCreateField = keyof ProvincialApplicationCreateForm & string

type CreatedApplicationNavigation = {
  path: string
  applicationNumber: string
}

type ApplicationCreateTab =
  | 'owner'
  | 'agent'
  | 'application'
  | 'items'
  | 'documents'
  | 'remarks'
  | 'offers'

const APPLICATION_CREATE_TABS: ApplicationCreateTab[] = [
  'owner',
  'agent',
  'application',
  'items',
  'documents',
  'remarks',
  'offers',
]

const APPLICATION_CREATE_TAB_LABELS: Record<ApplicationCreateTab, string> = {
  owner: 'Owner',
  agent: 'Agent',
  application: 'Application',
  items: 'Items',
  documents: 'Documents',
  remarks: 'Remarks',
  offers: 'Offers',
}

const productTypeSupportsPackages = (productTypeCode: string): boolean =>
  ['H', 'T'].includes(productTypeCode.trim().toUpperCase())

const APPLICATION_CREATE_FIELD_TAB: Partial<
  Record<ProvincialApplicationCreateField, ApplicationCreateTab>
> = {
  ownerClientNumber: 'owner',
  ownerClientLocationCode: 'owner',
  ownerContactName: 'owner',
  applicantTypeCode: 'owner',
  agentClientNumber: 'agent',
  agentClientLocationCode: 'agent',
  agentContactName: 'agent',
  productTypeCode: 'application',
  exemptionType: 'application',
  region: 'application',
  applicationDate: 'application',
  applicationTermDays: 'application',
  receivedDate: 'application',
  ageClass: 'items',
  productLocation: 'items',
  applicationVolume: 'items',
  averageLogVolume: 'items',
  speciesCodes: 'items',
  endUseCode: 'items',
  comments: 'remarks',
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
  receivedDate: '',
  exportScheduleId: '',
  listingDate: '',
  productLocation: '',
  applicationVolume: '',
  averageLogVolume: '',
  speciesCodes: [],
  endUseCode: '',
  comments: '',
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
    receivedDate: query.get('receivedDate') ?? INITIAL_FORM.receivedDate,
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
    comments: query.get('comments') ?? '',
  }
}

const applyScheduleDefaults = (
  form: ProvincialApplicationCreateForm,
  schedules: SearchOption[],
): ProvincialApplicationCreateForm => {
  if (schedules.length === 0) {
    return form
  }

  const nextListingSchedule = schedules.find((option) => option.value.trim())
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
      <h3 className="application-client-summary__title">{title}</h3>
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
  const [formEdited, setFormEdited] = useState(false)
  const [createdApplicationNavigation, setCreatedApplicationNavigation] =
    useState<CreatedApplicationNavigation | null>(null)
  const [productTypes, setProductTypes] = useState<SearchOption[]>([])
  const [growthTypes, setGrowthTypes] = useState<SearchOption[]>([])
  const [exemptionReasons, setExemptionReasons] = useState<SearchOption[]>([])
  const [regions, setRegions] = useState<SearchOption[]>([])
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
  const [applicationSpeciesCandidate, setApplicationSpeciesCandidate] = useState('')
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
  const [showMissingRequiredOptions, setShowMissingRequiredOptions] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [accuracyConfirmationOpen, setAccuracyConfirmationOpen] = useState(false)
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false)
  const [packageSavePromptOpen, setPackageSavePromptOpen] = useState(false)
  const createPackageButtonRef = useRef<HTMLButtonElement>(null)
  const [touchedFields, setTouchedFields] = useState<
    TouchedFields<ProvincialApplicationCreateField>
  >({})
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)
  const [selectedApplicationTab, setSelectedApplicationTab] =
    useState<ApplicationCreateTab>('owner')
  const hasAgentTab = isAgentApplicant(form.applicantTypeCode)
  const visibleApplicationTabs = useMemo(
    () => APPLICATION_CREATE_TABS.filter((tab) => tab !== 'agent' || hasAgentTab),
    [hasAgentTab],
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
        const scheduleOptions = options.nextSchedules ?? options.currentSchedules
        setProductTypes(options.productTypes)
        setGrowthTypes(options.growthTypes)
        setExemptionReasons(options.exemptionReasons)
        setRegions(options.regions)
        setCurrentSchedules(scheduleOptions)
        setForm((current) => {
          const withScheduleDefaults = applyScheduleDefaults(current, scheduleOptions)
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
  }, [authoritativeOrgUnitNo, provincialSubmitterIdentityLocked])

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
    if (!ownerClientNumber) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setOwnerClientLocations([])
        setIsLoadingOwnerClientLocations(false)
        setForm((current) =>
          current.ownerClientLocationCode ? { ...current, ownerClientLocationCode: '' } : current,
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
        if (!isActive) {
          return
        }

        setOwnerClientLocations(locations)
        setForm((current) => {
          if (current.ownerClientNumber.trim() !== ownerClientNumber) {
            return current
          }

          const nextOwnerClientLocationCode = resolveClientLocationCode(
            locations,
            current.ownerClientLocationCode,
          )
          return current.ownerClientLocationCode === nextOwnerClientLocationCode
            ? current
            : { ...current, ownerClientLocationCode: nextOwnerClientLocationCode }
        })
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingOwnerClientLocations(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [ownerClientNumberForLookup])

  useEffect(() => {
    if (!isAgentApplicant(form.applicantTypeCode)) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setAgentClientLocations([])
        setIsLoadingAgentClientLocations(false)
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
    if (!agentClientNumber) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setAgentClientLocations([])
        setIsLoadingAgentClientLocations(false)
        setForm((current) =>
          current.agentClientLocationCode ? { ...current, agentClientLocationCode: '' } : current,
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
        if (!isActive) {
          return
        }

        setAgentClientLocations(locations)
        setForm((current) => {
          if (current.agentClientNumber.trim() !== agentClientNumber) {
            return current
          }

          const nextAgentClientLocationCode = resolveClientLocationCode(
            locations,
            current.agentClientLocationCode,
          )
          return current.agentClientLocationCode === nextAgentClientLocationCode
            ? current
            : { ...current, agentClientLocationCode: nextAgentClientLocationCode }
        })
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingAgentClientLocations(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [agentClientNumberForLookup, form.applicantTypeCode])

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
      })

      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setOwnerClientData(null)
        setIsLoadingOwnerClientContacts(true)
      }
    })

    void fetchApplicationClientContacts(ownerClientNumber, ownerClientLocationCode, 'owner')
      .then((contacts) => {
        if (!isActive) {
          return
        }

        setOwnerClientContacts(contacts)
        setForm((current) => {
          if (
            current.ownerClientNumber.trim() !== ownerClientNumber ||
            current.ownerClientLocationCode.trim() !== ownerClientLocationCode
          ) {
            return current
          }

          const nextOwnerContactName = resolveClientContactName(contacts, current.ownerContactName)
          return current.ownerContactName === nextOwnerContactName
            ? current
            : { ...current, ownerContactName: nextOwnerContactName }
        })
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingOwnerClientContacts(false)
        }
      })

    void fetchApplicationClientData(ownerClientNumber, ownerClientLocationCode).then(
      (clientData) => {
        if (isActive) {
          setOwnerClientData(clientData)
        }
      },
    )

    return () => {
      isActive = false
    }
  }, [form.ownerClientLocationCode, ownerClientNumberForLookup])

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
      })

      return () => {
        isActive = false
      }
    }

    let isActive = true
    void Promise.resolve().then(() => {
      if (isActive) {
        setAgentClientData(null)
        setIsLoadingAgentClientContacts(true)
      }
    })

    void fetchApplicationClientContacts(agentClientNumber, agentClientLocationCode, 'agent')
      .then((contacts) => {
        if (!isActive) {
          return
        }

        setAgentClientContacts(contacts)
        setForm((current) => {
          if (
            current.agentClientNumber.trim() !== agentClientNumber ||
            current.agentClientLocationCode.trim() !== agentClientLocationCode
          ) {
            return current
          }

          const nextAgentContactName = resolveClientContactName(contacts, current.agentContactName)
          return current.agentContactName === nextAgentContactName
            ? current
            : { ...current, agentContactName: nextAgentContactName }
        })
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingAgentClientContacts(false)
        }
      })

    void fetchApplicationClientData(agentClientNumber, agentClientLocationCode).then(
      (clientData) => {
        if (isActive) {
          setAgentClientData(clientData)
        }
      },
    )

    return () => {
      isActive = false
    }
  }, [agentClientNumberForLookup, form.agentClientLocationCode, form.applicantTypeCode])

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
        setApplicationSpeciesCandidate('')
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

        setApplicationSpeciesOptions(options)
        setApplicationSpeciesCandidate((current) =>
          current && options.some((option) => option.code === current)
            ? current
            : (options[0]?.code ?? ''),
        )
      })
      .catch((error) => {
        if (!isActive) {
          return
        }

        console.warn('Unable to load remaining application species.', error)
        setApplicationSpeciesOptions([])
        setApplicationSpeciesCandidate('')
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
      ownerClientNumber:
        requiredFieldError(form.ownerClientNumber, 'Owner client number') ?? undefined,
      ownerClientLocationCode:
        requiredMaxLengthFieldError(
          form.ownerClientLocationCode,
          2,
          'Owner client location code',
        ) ?? undefined,
      ownerContactName: requiredFieldError(form.ownerContactName, 'Owner name') ?? undefined,
      agentClientNumber: isAgentApplicant(form.applicantTypeCode)
        ? (requiredFieldError(form.agentClientNumber, 'Agent client number') ?? undefined)
        : undefined,
      agentClientLocationCode: isAgentApplicant(form.applicantTypeCode)
        ? (requiredMaxLengthFieldError(
            form.agentClientLocationCode,
            2,
            'Agent client location code',
          ) ?? undefined)
        : undefined,
      agentContactName: isAgentApplicant(form.applicantTypeCode)
        ? (requiredFieldError(form.agentContactName, 'Agent contact name') ?? undefined)
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
            () => requiredFieldError(form.ageClass, 'Growth type'),
            () =>
              growthTypes.some((option) => option.value === form.ageClass)
                ? null
                : 'Select a valid growth type.',
          )
        : undefined,
      speciesCodes:
        form.speciesCodes.length === 0
          ? !form.region.trim()
            ? 'Select a region before adding application species.'
            : !form.productTypeCode.trim()
              ? 'Select a product type before adding application species.'
              : !isLoadingApplicationSpecies && applicationSpeciesOptions.length === 0
                ? 'At least one application species is required, but no species are available for the selected region and product type.'
                : 'At least one application species is required.'
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
        () => requiredFieldError(form.applicationTermDays, 'Application term days'),
        () => nonNegativeWholeNumberFieldError(form.applicationTermDays, 'Application term days'),
        () => greaterThanFieldError(form.applicationTermDays, 'Application term days', 0),
        () => maxNumericValueFieldError(form.applicationTermDays, 99999, 'Application term days'),
      ),
      receivedDate: firstValidationError(
        () => requiredFieldError(form.receivedDate, 'Received date'),
        () => isoDateFieldError(form.receivedDate),
      ),
      exportScheduleId:
        !form.exportScheduleId ||
        currentSchedules.some((option) => option.value === form.exportScheduleId)
          ? undefined
          : 'Select a valid listing date.',
      productLocation: productTypeRequiresLogDetails(form.productTypeCode)
        ? (requiredFieldError(form.productLocation, 'Location of logs') ?? undefined)
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
  const availableApplicationSpeciesOptions = useMemo(
    () => applicationSpeciesOptions.filter((option) => !form.speciesCodes.includes(option.code)),
    [applicationSpeciesOptions, form.speciesCodes],
  )
  const applicationSpeciesSelectOptions = availableApplicationSpeciesOptions.map(toSearchOption)
  const applicationEndUseSelectOptions = applicationEndUseOptions.map(toSearchOption)
  const isApplicationSpeciesSelectDisabled =
    !form.region.trim() ||
    !form.productTypeCode.trim() ||
    isLoadingApplicationSpecies ||
    applicationSpeciesSelectOptions.length === 0
  const ownerClientLocationPlaceholder = !form.ownerClientNumber.trim()
    ? 'Enter owner client number first'
    : isLoadingOwnerClientLocations
      ? 'Loading locations'
      : hasSelectableOwnerClientLocations
        ? 'Select owner client location'
        : 'No locations on file'
  const agentClientLocationPlaceholder = !form.agentClientNumber.trim()
    ? 'Enter agent client number first'
    : isLoadingAgentClientLocations
      ? 'Loading locations'
      : hasSelectableAgentClientLocations
        ? 'Select agent client location'
        : 'No locations on file'
  const ownerContactPlaceholder = !form.ownerClientLocationCode.trim()
    ? 'Select owner location first'
    : isLoadingOwnerClientContacts
      ? 'Loading contacts'
      : hasSelectableOwnerClientContacts
        ? 'Select owner contact'
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
      : isLoadingApplicationSpecies
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

  const onAddApplicationSpecies = (): void => {
    const speciesCode = applicationSpeciesCandidate.trim()
    if (
      !speciesCode ||
      form.speciesCodes.includes(speciesCode) ||
      !availableApplicationSpeciesOptions.some((option) => option.code === speciesCode)
    ) {
      return
    }

    markFormEdited()
    setForm((current) => ({
      ...current,
      speciesCodes: [...current.speciesCodes, speciesCode],
      endUseCode: '',
    }))
    markFieldTouched('speciesCodes')
  }

  const onRemoveApplicationSpecies = (speciesCode: string): void => {
    markFormEdited()
    setForm((current) => ({
      ...current,
      speciesCodes: current.speciesCodes.filter((code) => code !== speciesCode),
      endUseCode: '',
    }))
    markFieldTouched('speciesCodes')
  }

  const fieldError = (field: ProvincialApplicationCreateField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showAllValidationErrors)
  const firstSubmitValidationError = Object.values(fieldErrors).find(
    (error): error is string => !!error,
  )
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
      provincialSubmitterScopeUnavailable
    ) {
      return false
    }
    if (hasValidationError) {
      if (firstInvalidField) {
        setSelectedApplicationTab(APPLICATION_CREATE_FIELD_TAB[firstInvalidField] ?? 'application')
      }
      setShowAllValidationErrors(true)
      setStatus({
        kind: 'error',
        title: 'Validation Error',
        message: firstSubmitValidationError ?? 'Please fix validation errors before saving.',
        placement: 'inline',
      })
      return false
    }

    setStatus(null)
    setIsSubmitting(true)
    try {
      const result = await submitProvincialApplicationCreate({
        ...form,
        applicationTermDays: form.applicationTermDays.trim(),
      })
      if (result.success) {
        draftBaselineRef.current = form
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
          subtitle="Enter application details and save a new provincial application."
        />
      </Column>

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
            subtitle="A required product type, exemption reason, growth type, or region list is empty. Save remains disabled."
            lowContrast
            autoDismissMs={undefined}
            onCloseButtonClick={() => setShowMissingRequiredOptions(false)}
          />
        </Column>
      )}

      {!!status && status.placement !== 'inline' && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind={status.kind}
            title={status.title}
            subtitle={status.message}
            lowContrast
            onCloseButtonClick={() => setStatus(null)}
            autoDismissMs={status.kind === 'success' ? 6000 : undefined}
          />
        </Column>
      )}

      <Column sm={4} md={8} lg={16} className="application-detail-tabs-column">
        {status?.placement === 'inline' && (
          <InlineNotification
            className="create-form-validation-notification"
            kind="error"
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
            {visibleApplicationTabs.map((tab) => (
              <Tab key={tab}>{APPLICATION_CREATE_TAB_LABELS[tab]}</Tab>
            ))}
          </TabList>
          <TabPanels>
            <TabPanel className="application-detail-tab-panel">
              <Tile
                className="create-form-tile application-detail-section"
                role="region"
                aria-labelledby="application-create-owner-heading"
              >
                <h2 id="application-create-owner-heading" className="detail-tile-title">
                  Owner
                </h2>
                <div className="legacy-search-grid create-form-grid">
                  <TextInput
                    id="ownerClientNumber"
                    labelText="Client number"
                    value={form.ownerClientNumber}
                    readOnly={provincialSubmitterIdentityLocked}
                    helperText={
                      provincialSubmitterIdentityLocked
                        ? 'Loaded from your authenticated forest client access.'
                        : undefined
                    }
                    invalid={!!fieldError('ownerClientNumber')}
                    invalidText={fieldError('ownerClientNumber')}
                    onBlur={() => markFieldTouched('ownerClientNumber')}
                    onChange={(event) => {
                      markFormEdited()
                      setForm((current) => ({
                        ...current,
                        ownerClientNumber: event.target.value,
                      }))
                    }}
                  />
                  {canChangeApplicantType ? (
                    <SearchableSelect
                      id="applicantTypeCode"
                      labelText="Applicant type"
                      value={form.applicantTypeCode}
                      placeholder="Select applicant type"
                      options={[
                        { value: 'O', label: 'Owner' },
                        { value: 'M', label: 'Ministerial' },
                        { value: 'A', label: 'Agent' },
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
                  ) : (
                    <TextInput
                      id="applicantTypeCode"
                      labelText="Applicant type"
                      value="Owner"
                      readOnly
                    />
                  )}
                  <SearchableSelect
                    id="ownerClientLocationCode"
                    labelText="Client location"
                    value={form.ownerClientLocationCode}
                    disabled={!form.ownerClientNumber.trim() || isLoadingOwnerClientLocations}
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
                      setForm((current) => ({
                        ...current,
                        ownerClientLocationCode: value,
                      }))
                    }}
                  />
                  {hasSelectableOwnerClientContacts || isLoadingOwnerClientContacts ? (
                    <SearchableSelect
                      id="ownerContactName"
                      labelText="Contact name"
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
                      labelText="Contact name"
                      value={form.ownerContactName}
                      disabled={!form.ownerClientLocationCode.trim()}
                      placeholder="Enter owner contact name"
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
                  <ApplicationCreateClientSummary
                    title="Owner client details"
                    clientData={ownerClientData}
                  />
                </div>
              </Tile>
            </TabPanel>
            {hasAgentTab
              ? [
                  <TabPanel key="agent" className="application-detail-tab-panel">
                    <Tile
                      className="create-form-tile application-detail-section"
                      role="region"
                      aria-labelledby="application-create-agent-heading"
                    >
                      <h2 id="application-create-agent-heading" className="detail-tile-title">
                        Agent
                      </h2>
                      <div className="legacy-search-grid create-form-grid">
                        <TextInput
                          id="agentClientNumber"
                          labelText="Agent number"
                          value={form.agentClientNumber}
                          invalid={!!fieldError('agentClientNumber')}
                          invalidText={fieldError('agentClientNumber')}
                          onBlur={() => markFieldTouched('agentClientNumber')}
                          onChange={(event) => {
                            markFormEdited()
                            setForm((current) => ({
                              ...current,
                              agentClientNumber: event.target.value,
                            }))
                          }}
                        />
                        <TextInput
                          id="agentApplicantType"
                          labelText="Applicant type"
                          value="Agent"
                          readOnly
                        />
                        <SearchableSelect
                          id="agentClientLocationCode"
                          labelText="Contact location"
                          value={form.agentClientLocationCode}
                          disabled={!form.agentClientNumber.trim() || isLoadingAgentClientLocations}
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
                            setForm((current) => ({
                              ...current,
                              agentClientLocationCode: value,
                            }))
                          }}
                        />
                        {hasSelectableAgentClientContacts || isLoadingAgentClientContacts ? (
                          <SearchableSelect
                            id="agentContactName"
                            labelText="Contact name"
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
                            labelText="Contact name"
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
                        <ApplicationCreateClientSummary
                          title="Agent client details"
                          clientData={agentClientData}
                        />
                      </div>
                    </Tile>
                  </TabPanel>,
                ]
              : []}
            <TabPanel className="application-detail-tab-panel">
              <Tile
                className="create-form-tile application-detail-section"
                role="region"
                aria-labelledby="application-create-application-heading"
              >
                <h2 id="application-create-application-heading" className="detail-tile-title">
                  Application
                </h2>
                <div className="legacy-search-grid create-form-grid">
                  <SearchableSelect
                    id="region"
                    labelText="Region"
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
                    labelText="Product type"
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
                    labelText="Exemption reason"
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
                    labelText="Application date (YYYY-MM-DD)"
                    value={form.applicationDate}
                    invalid={!!fieldError('applicationDate')}
                    invalidText={fieldError('applicationDate')}
                    onBlur={() => markFieldTouched('applicationDate')}
                    onChange={(value) => {
                      markFormEdited()
                      setForm((current) => ({ ...current, applicationDate: value }))
                    }}
                  />
                  <IsoDatePicker
                    id="receivedDate"
                    labelText="Date received (YYYY-MM-DD)"
                    value={form.receivedDate}
                    invalid={!!fieldError('receivedDate')}
                    invalidText={fieldError('receivedDate')}
                    onBlur={() => markFieldTouched('receivedDate')}
                    onChange={(value) => {
                      markFormEdited()
                      setForm((current) => ({ ...current, receivedDate: value }))
                    }}
                  />
                  <SearchableSelect
                    id="exportScheduleId"
                    labelText="List date"
                    value={form.exportScheduleId}
                    options={currentSchedules}
                    disabled={!optionsLoaded || optionsUnavailable}
                    placeholder="Search list date"
                    onBlur={() => markFieldTouched('exportScheduleId')}
                    onChange={(value) => {
                      markFormEdited()
                      setForm((current) => ({
                        ...current,
                        exportScheduleId: value,
                        listingDate: value
                          ? (currentSchedules.find((option) => option.value === value)?.label ?? '')
                          : '',
                      }))
                    }}
                  />
                  <TextInput
                    id="applicationTermDays"
                    labelText="Application term (days)"
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
                  aria-labelledby="application-create-items-heading"
                >
                  <h2 id="application-create-items-heading" className="detail-tile-title">
                    Items
                  </h2>
                  <div className="legacy-search-grid create-form-grid">
                    {productTypeRequiresLogDetails(form.productTypeCode) && (
                      <TextArea
                        id="productLocation"
                        labelText="Location of logs"
                        maxCount={250}
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
                        labelText="Growth type"
                        value={form.ageClass}
                        disabled={!optionsLoaded || optionsUnavailable}
                        invalid={!!fieldError('ageClass')}
                        invalidText={fieldError('ageClass')}
                        placeholder="Select growth type"
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
                        labelText="Average log volume"
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
                      labelText="Application volume"
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
                    <div className="legacy-field-stack">
                      <SearchableSelect
                        id="applicationSpeciesCandidate"
                        labelText="Species list"
                        value={applicationSpeciesCandidate}
                        disabled={isApplicationSpeciesSelectDisabled}
                        invalid={!!fieldError('speciesCodes')}
                        invalidText={fieldError('speciesCodes')}
                        placeholder={speciesPlaceholder}
                        options={applicationSpeciesSelectOptions}
                        onBlur={() => markFieldTouched('speciesCodes')}
                        onChange={setApplicationSpeciesCandidate}
                      />
                      {isApplicationSpeciesSelectDisabled && !!fieldError('speciesCodes') && (
                        <p className="legacy-search-error" role="alert">
                          {fieldError('speciesCodes')}
                        </p>
                      )}
                      <div className="application-species-actions">
                        <Button
                          type="button"
                          kind="tertiary"
                          size="sm"
                          disabled={
                            !applicationSpeciesCandidate ||
                            !availableApplicationSpeciesOptions.some(
                              (option) => option.code === applicationSpeciesCandidate,
                            )
                          }
                          onClick={onAddApplicationSpecies}
                        >
                          Add application species
                        </Button>
                        <ul
                          className="application-species-list"
                          aria-label="Selected application species"
                        >
                          {form.speciesCodes.map((speciesCode) => (
                            <li key={speciesCode}>
                              <DismissibleTag
                                type="blue"
                                text={speciesCode}
                                title={`Remove ${speciesCode} from application`}
                                dismissTooltipLabel={`Remove ${speciesCode} from application`}
                                onClose={() => onRemoveApplicationSpecies(speciesCode)}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
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
                  </div>
                </Tile>
                {productTypeSupportsPackages(form.productTypeCode) && (
                  <section className="application-items-card application-items-section application-items-section--package-details">
                    <div className="application-items-section-header">
                      <h3>Package Details</h3>
                      <SearchableSelect
                        id="applicationCreatePackageSelect"
                        labelText="Selected Package"
                        value=""
                        disabled
                        placeholder="No packages"
                        options={[]}
                        onChange={() => undefined}
                      />
                    </div>
                    <dl className="detail-field-grid application-items-summary">
                      {[
                        ['Package Number', 'None selected'],
                        ['Package Volume', 'Not provided'],
                        ['Total Scale Volume', 'Not provided'],
                        ['Total Pieces', '0'],
                        ['Average Length', 'Not provided'],
                        ['Average Top Diameter', 'Not provided'],
                        ['Package Status', 'Not provided'],
                        ['Reprocessed', 'Not provided'],
                      ].map(([label, value]) => (
                        <div key={label} className="detail-field-item">
                          <dt className="detail-field-label">{label}</dt>
                          <dd className="detail-field-value">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="application-create-package-actions">
                      <Button
                        ref={createPackageButtonRef}
                        type="button"
                        kind="tertiary"
                        size="sm"
                        onClick={() => setPackageSavePromptOpen(true)}
                      >
                        Create New Package
                      </Button>
                    </div>
                  </section>
                )}
              </div>
            </TabPanel>
            <TabPanel className="application-detail-tab-panel">
              <Tile
                className="create-form-tile application-detail-section"
                role="region"
                aria-labelledby="application-create-documents-heading"
              >
                <h2 id="application-create-documents-heading" className="detail-tile-title">
                  Documents
                </h2>
                <DetailDocumentUploadPanel
                  workflowType="application"
                  targetNumber=""
                  inputId="applicationCreateDocumentUpload"
                  disabled
                  disabledReason="Save the application before uploading documents."
                />
              </Tile>
            </TabPanel>
            <TabPanel className="application-detail-tab-panel">
              <Tile
                className="create-form-tile application-detail-section"
                role="region"
                aria-labelledby="application-create-remarks-heading"
              >
                <h2 id="application-create-remarks-heading" className="detail-tile-title">
                  Remarks
                </h2>
                <div className="legacy-search-actions create-form-comments">
                  <TextArea
                    id="applicationComments"
                    labelText="Comments"
                    value={form.comments}
                    onChange={(event) => {
                      markFormEdited()
                      setForm((current) => ({ ...current, comments: event.target.value }))
                    }}
                  />
                </div>
              </Tile>
            </TabPanel>
            <TabPanel className="application-detail-tab-panel">
              <Tile
                className="create-form-tile application-detail-section"
                role="region"
                aria-labelledby="application-create-offers-heading"
              >
                <h2 id="application-create-offers-heading" className="detail-tile-title">
                  Offers
                </h2>
                <p className="detail-empty-message">
                  Offers are available after the application is saved.
                </p>
              </Tile>
            </TabPanel>
          </TabPanels>
        </Tabs>
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
              provincialSubmitterScopeUnavailable
            }
          >
            Save
          </Button>
        </div>
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
          onError={() => undefined}
        />
      )}
      <Modal
        open={packageSavePromptOpen}
        passiveModal
        size="xs"
        modalHeading="Application not saved"
        className="application-create-package-save-modal"
        launcherButtonRef={createPackageButtonRef}
        selectorPrimaryFocus="#applicationCreatePackageSavePromptOk"
        onRequestClose={() => setPackageSavePromptOpen(false)}
      >
        <div className="application-create-package-save-prompt">
          <p>Please save this application before adding packages.</p>
          <div className="application-create-package-save-prompt__actions">
            <Button
              id="applicationCreatePackageSavePromptOk"
              type="button"
              kind="primary"
              onClick={() => setPackageSavePromptOpen(false)}
            >
              OK
            </Button>
          </div>
        </div>
      </Modal>
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
            : isLoadingOwnerClientLocations || isLoadingAgentClientLocations
              ? 'Client locations must finish loading before this application can be saved.'
              : provincialSubmitterScopeUnavailable
                ? 'An authenticated forest client is required before this application can be saved.'
                : undefined
        }
      />
    </Grid>
  )
}

export default ProvincialApplicationCreatePage
