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
  calculateApplicationTermDays,
  nonNegativeWholeNumberFieldError,
} from '@/pages/shared/application-term-utils'
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
import {
  fetchApplicationClientContacts,
  fetchApplicationClientLocations,
  type ApplicationClientContact,
  type ApplicationClientLocation,
} from '@/service/application-client-lookup-service'

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
  applicationTermMonths: string
  applicationTermYears: string
  receivedDate: string
  listingDate: string
  productLocation: string
  applicationVolume: string
  averageLogVolume: string
  comments: string
}

type ProvincialApplicationCreateField = keyof ProvincialApplicationCreateForm & string

const MODULE_KEY = 'provincial-application'

const INITIAL_FORM: ProvincialApplicationCreateForm = {
  ownerClientNumber: '',
  ownerClientLocationCode: '',
  ownerContactName: '',
  agentClientNumber: '',
  agentClientLocationCode: '',
  agentContactName: '',
  applicantTypeCode: 'O',
  productTypeCode: '',
  ageClass: '',
  exemptionType: '',
  region: '',
  applicationDate: '',
  applicationTermDays: '',
  applicationTermMonths: '',
  applicationTermYears: '',
  receivedDate: '',
  listingDate: '',
  productLocation: '',
  applicationVolume: '',
  averageLogVolume: '',
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
    ownerClientNumber: query.get('ownerClientNumber') ?? '',
    ownerClientLocationCode:
      query.get('ownerClientLocationCode') ?? query.get('ownerClientLocation') ?? '',
    ownerContactName: query.get('ownerContactName') ?? query.get('ownerName') ?? '',
    agentClientNumber: query.get('agentClientNumber') ?? query.get('applicantClientNumber') ?? '',
    agentClientLocationCode:
      query.get('agentClientLocationCode') ?? query.get('agentClientLocation') ?? '',
    agentContactName: query.get('agentContactName') ?? '',
    applicantTypeCode: query.get('ownerApplicantType') ?? query.get('applicantType') ?? 'O',
    productTypeCode: query.get('productTypeCode') ?? '',
    ageClass: query.get('ageClass') ?? query.get('growthTypeCode') ?? '',
    exemptionType: query.get('exemptionReason') ?? query.get('exemptionReasonCode') ?? '',
    region: query.get('region') ?? query.get('orgUnitNumber') ?? '',
    applicationDate: query.get('applicationDate') ?? '',
    applicationTermDays:
      query.get('applicationTermDays') ?? query.get('exemptionTerm') ?? query.get('termDays') ?? '',
    applicationTermMonths: query.get('applicationTermMonths') ?? query.get('termMonths') ?? '',
    applicationTermYears: query.get('applicationTermYears') ?? query.get('termYears') ?? '',
    receivedDate: query.get('receivedDate') ?? '',
    listingDate: query.get('listingDate') ?? '',
    productLocation: query.get('productLocation') ?? query.get('logLocation') ?? '',
    applicationVolume: query.get('applicationVolume') ?? '',
    averageLogVolume: query.get('averageLogVolume') ?? query.get('logVolume') ?? '',
    comments: query.get('comments') ?? '',
  }
}

const isSelectableClientLocation = (location: ApplicationClientLocation): boolean =>
  location.locationCode !== '0'

const isSelectableClientContact = (contact: ApplicationClientContact): boolean =>
  contact.contactId !== '0'

const resolveOwnerClientLocationCode = (
  locations: ApplicationClientLocation[],
  currentCode: string,
): string => {
  const normalizedCurrentCode = currentCode.trim()
  if (
    normalizedCurrentCode &&
    locations.some(
      (location) =>
        isSelectableClientLocation(location) && location.locationCode === normalizedCurrentCode,
    )
  ) {
    return normalizedCurrentCode
  }

  const selectedLocation = locations.find(
    (location) => isSelectableClientLocation(location) && location.selected,
  )
  if (selectedLocation) {
    return selectedLocation.locationCode
  }

  return locations.find(isSelectableClientLocation)?.locationCode ?? ''
}

const resolveClientContactName = (
  contacts: ApplicationClientContact[],
  currentName: string,
): string => {
  const normalizedCurrentName = currentName.trim()
  if (
    normalizedCurrentName &&
    contacts.some(
      (contact) =>
        isSelectableClientContact(contact) && contact.contactName === normalizedCurrentName,
    )
  ) {
    return normalizedCurrentName
  }

  return contacts.find(isSelectableClientContact)?.contactName ?? normalizedCurrentName
}

const productTypeRequiresGrowthType = (productTypeCode: string): boolean =>
  productTypeCode === 'H' || productTypeCode === 'S'

const isAgentApplicant = (applicantTypeCode: string): boolean => applicantTypeCode === 'A'

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
  const [growthTypes, setGrowthTypes] = useState<SearchOption[]>([])
  const [exemptionReasons, setExemptionReasons] = useState<SearchOption[]>([])
  const [regions, setRegions] = useState<SearchOption[]>([])
  const [ownerClientLocations, setOwnerClientLocations] = useState<ApplicationClientLocation[]>([])
  const [agentClientLocations, setAgentClientLocations] = useState<ApplicationClientLocation[]>([])
  const [ownerClientContacts, setOwnerClientContacts] = useState<ApplicationClientContact[]>([])
  const [agentClientContacts, setAgentClientContacts] = useState<ApplicationClientContact[]>([])
  const [isLoadingOwnerClientLocations, setIsLoadingOwnerClientLocations] = useState(false)
  const [isLoadingAgentClientLocations, setIsLoadingAgentClientLocations] = useState(false)
  const [isLoadingOwnerClientContacts, setIsLoadingOwnerClientContacts] = useState(false)
  const [isLoadingAgentClientContacts, setIsLoadingAgentClientContacts] = useState(false)
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
      setGrowthTypes(options.growthTypes)
      setExemptionReasons(options.exemptionReasons)
      setRegions(options.regions)
    }

    void loadOptions()
  }, [])

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
    const ownerClientNumber = form.ownerClientNumber.trim()
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

          const nextOwnerClientLocationCode = resolveOwnerClientLocationCode(
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
  }, [form.ownerClientNumber])

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

    const agentClientNumber = form.agentClientNumber.trim()
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

          const nextAgentClientLocationCode = resolveOwnerClientLocationCode(
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
  }, [form.agentClientNumber, form.applicantTypeCode])

  useEffect(() => {
    const ownerClientNumber = form.ownerClientNumber.trim()
    const ownerClientLocationCode = form.ownerClientLocationCode.trim()
    if (!ownerClientNumber || !ownerClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setOwnerClientContacts([])
        setIsLoadingOwnerClientContacts(false)
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

    return () => {
      isActive = false
    }
  }, [form.ownerClientLocationCode, form.ownerClientNumber])

  useEffect(() => {
    if (!isAgentApplicant(form.applicantTypeCode)) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setAgentClientContacts([])
        setIsLoadingAgentClientContacts(false)
      })

      return () => {
        isActive = false
      }
    }

    const agentClientNumber = form.agentClientNumber.trim()
    const agentClientLocationCode = form.agentClientLocationCode.trim()
    if (!agentClientNumber || !agentClientLocationCode) {
      let isActive = true
      void Promise.resolve().then(() => {
        if (!isActive) {
          return
        }

        setAgentClientContacts([])
        setIsLoadingAgentClientContacts(false)
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

    return () => {
      isActive = false
    }
  }, [form.agentClientLocationCode, form.agentClientNumber, form.applicantTypeCode])

  const calculatedApplicationTermDays = useMemo(
    () =>
      calculateApplicationTermDays(
        form.applicationTermDays,
        form.applicationTermMonths,
        form.applicationTermYears,
      ),
    [form.applicationTermDays, form.applicationTermMonths, form.applicationTermYears],
  )

  const fieldErrors = useMemo<FieldErrors<ProvincialApplicationCreateField>>(
    () => ({
      ownerClientNumber:
        requiredFieldError(form.ownerClientNumber, 'Owner client number') ?? undefined,
      ownerClientLocationCode: firstValidationError(
        () => requiredFieldError(form.ownerClientLocationCode, 'Owner client location code'),
        () => maxLengthFieldError(form.ownerClientLocationCode, 2, 'Owner client location code'),
      ),
      ownerContactName: requiredFieldError(form.ownerContactName, 'Owner name') ?? undefined,
      agentClientNumber: isAgentApplicant(form.applicantTypeCode)
        ? (requiredFieldError(form.agentClientNumber, 'Agent client number') ?? undefined)
        : undefined,
      agentClientLocationCode: isAgentApplicant(form.applicantTypeCode)
        ? firstValidationError(
            () => requiredFieldError(form.agentClientLocationCode, 'Agent client location code'),
            () =>
              maxLengthFieldError(form.agentClientLocationCode, 2, 'Agent client location code'),
          )
        : undefined,
      agentContactName: isAgentApplicant(form.applicantTypeCode)
        ? (requiredFieldError(form.agentContactName, 'Agent contact name') ?? undefined)
        : undefined,
      applicantTypeCode: firstValidationError(
        () => requiredFieldError(form.applicantTypeCode, 'Applicant type'),
        () =>
          form.applicantTypeCode === 'O' || form.applicantTypeCode === 'A'
            ? undefined
            : 'Applicant type must be Owner or Agent.',
      ),
      productTypeCode: requiredFieldError(form.productTypeCode, 'Product type') ?? undefined,
      ageClass: productTypeRequiresGrowthType(form.productTypeCode)
        ? (requiredFieldError(form.ageClass, 'Age class') ?? undefined)
        : undefined,
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
        () => requiredFieldError(calculatedApplicationTermDays, 'Application term'),
        () => nonNegativeWholeNumberFieldError(form.applicationTermDays, 'Application term days'),
      ),
      applicationTermMonths: nonNegativeWholeNumberFieldError(
        form.applicationTermMonths,
        'Application term months',
      ),
      applicationTermYears: nonNegativeWholeNumberFieldError(
        form.applicationTermYears,
        'Application term years',
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
      averageLogVolume: firstValidationError(
        () => requiredFieldError(form.averageLogVolume, 'Average log volume'),
        () => positiveNumericFieldError(form.averageLogVolume),
      ),
    }),
    [calculatedApplicationTermDays, form],
  )
  const hasValidationError = useMemo(
    () => Object.values(fieldErrors).some((error) => !!error),
    [fieldErrors],
  )
  const missingRequiredOptions = productTypes.length === 0
  const hasSelectableOwnerClientLocations = ownerClientLocations.some(isSelectableClientLocation)
  const hasSelectableAgentClientLocations = agentClientLocations.some(isSelectableClientLocation)
  const hasSelectableOwnerClientContacts = ownerClientContacts.some(isSelectableClientContact)
  const hasSelectableAgentClientContacts = agentClientContacts.some(isSelectableClientContact)
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
      const result = await submitProvincialApplicationCreate({
        ...form,
        applicationTermDays: calculatedApplicationTermDays,
      })
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
            <Select
              id="ownerClientLocationCode"
              labelText="Owner Client Location (required)"
              value={form.ownerClientLocationCode}
              disabled={!form.ownerClientNumber.trim() || isLoadingOwnerClientLocations}
              invalid={!!fieldError('ownerClientLocationCode')}
              invalidText={fieldError('ownerClientLocationCode')}
              onBlur={() => markFieldTouched('ownerClientLocationCode')}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  ownerClientLocationCode: event.target.value,
                }))
              }
            >
              <SelectItem value="" text={ownerClientLocationPlaceholder} />
              {ownerClientLocations.filter(isSelectableClientLocation).map((location) => (
                <SelectItem
                  key={location.locationCode}
                  value={location.locationCode}
                  text={location.locationName}
                />
              ))}
            </Select>
            {hasSelectableOwnerClientContacts || isLoadingOwnerClientContacts ? (
              <Select
                id="ownerContactName"
                labelText="Owner Name (required)"
                value={form.ownerContactName}
                disabled={!form.ownerClientLocationCode.trim() || isLoadingOwnerClientContacts}
                invalid={!!fieldError('ownerContactName')}
                invalidText={fieldError('ownerContactName')}
                onBlur={() => markFieldTouched('ownerContactName')}
                onChange={(event) =>
                  setForm((current) => ({ ...current, ownerContactName: event.target.value }))
                }
              >
                <SelectItem value="" text={ownerContactPlaceholder} />
                {ownerClientContacts.filter(isSelectableClientContact).map((contact) => (
                  <SelectItem
                    key={contact.contactId}
                    value={contact.contactName}
                    text={contact.contactName}
                  />
                ))}
              </Select>
            ) : (
              <TextInput
                id="ownerContactName"
                labelText="Owner Name (required)"
                value={form.ownerContactName}
                disabled={!form.ownerClientLocationCode.trim()}
                placeholder="Enter owner contact name"
                invalid={!!fieldError('ownerContactName')}
                invalidText={fieldError('ownerContactName')}
                onBlur={() => markFieldTouched('ownerContactName')}
                onChange={(event) =>
                  setForm((current) => ({ ...current, ownerContactName: event.target.value }))
                }
              />
            )}
            <Select
              id="applicantTypeCode"
              labelText="Applicant Type (required)"
              value={form.applicantTypeCode}
              invalid={!!fieldError('applicantTypeCode')}
              invalidText={fieldError('applicantTypeCode')}
              onBlur={() => markFieldTouched('applicantTypeCode')}
              onChange={(event) => {
                const applicantTypeCode = event.target.value
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
            >
              <SelectItem value="O" text="Owner" />
              <SelectItem value="A" text="Agent" />
            </Select>
            {isAgentApplicant(form.applicantTypeCode) && (
              <>
                <TextInput
                  id="agentClientNumber"
                  labelText="Agent Client Number (required)"
                  value={form.agentClientNumber}
                  invalid={!!fieldError('agentClientNumber')}
                  invalidText={fieldError('agentClientNumber')}
                  onBlur={() => markFieldTouched('agentClientNumber')}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      agentClientNumber: event.target.value,
                    }))
                  }
                />
                <Select
                  id="agentClientLocationCode"
                  labelText="Agent Client Location (required)"
                  value={form.agentClientLocationCode}
                  disabled={!form.agentClientNumber.trim() || isLoadingAgentClientLocations}
                  invalid={!!fieldError('agentClientLocationCode')}
                  invalidText={fieldError('agentClientLocationCode')}
                  onBlur={() => markFieldTouched('agentClientLocationCode')}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      agentClientLocationCode: event.target.value,
                    }))
                  }
                >
                  <SelectItem value="" text={agentClientLocationPlaceholder} />
                  {agentClientLocations.filter(isSelectableClientLocation).map((location) => (
                    <SelectItem
                      key={location.locationCode}
                      value={location.locationCode}
                      text={location.locationName}
                    />
                  ))}
                </Select>
                {hasSelectableAgentClientContacts || isLoadingAgentClientContacts ? (
                  <Select
                    id="agentContactName"
                    labelText="Agent Contact Name (required)"
                    value={form.agentContactName}
                    disabled={!form.agentClientLocationCode.trim() || isLoadingAgentClientContacts}
                    invalid={!!fieldError('agentContactName')}
                    invalidText={fieldError('agentContactName')}
                    onBlur={() => markFieldTouched('agentContactName')}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, agentContactName: event.target.value }))
                    }
                  >
                    <SelectItem value="" text={agentContactPlaceholder} />
                    {agentClientContacts.filter(isSelectableClientContact).map((contact) => (
                      <SelectItem
                        key={contact.contactId}
                        value={contact.contactName}
                        text={contact.contactName}
                      />
                    ))}
                  </Select>
                ) : (
                  <TextInput
                    id="agentContactName"
                    labelText="Agent Contact Name (required)"
                    value={form.agentContactName}
                    disabled={!form.agentClientLocationCode.trim()}
                    placeholder="Enter agent contact name"
                    invalid={!!fieldError('agentContactName')}
                    invalidText={fieldError('agentContactName')}
                    onBlur={() => markFieldTouched('agentContactName')}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, agentContactName: event.target.value }))
                    }
                  />
                )}
              </>
            )}
            <Select
              id="productTypeCode"
              labelText="Product Type (required)"
              value={form.productTypeCode}
              invalid={!!fieldError('productTypeCode')}
              invalidText={fieldError('productTypeCode')}
              onBlur={() => markFieldTouched('productTypeCode')}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  productTypeCode: event.target.value,
                  ageClass: productTypeRequiresGrowthType(event.target.value)
                    ? current.ageClass
                    : '',
                }))
              }
            >
              <SelectItem value="" text="Select product type" />
              {productTypes.map((option) => (
                <SelectItem key={option.value} value={option.value} text={option.label} />
              ))}
            </Select>
            <Select
              id="ageClass"
              labelText={
                productTypeRequiresGrowthType(form.productTypeCode)
                  ? 'Age Class (required)'
                  : 'Age Class'
              }
              value={form.ageClass}
              disabled={!productTypeRequiresGrowthType(form.productTypeCode)}
              invalid={!!fieldError('ageClass')}
              invalidText={fieldError('ageClass')}
              onBlur={() => markFieldTouched('ageClass')}
              onChange={(event) =>
                setForm((current) => ({ ...current, ageClass: event.target.value }))
              }
            >
              <SelectItem value="" text="Select age class" />
              {growthTypes.map((option) => (
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
              id="applicationTermMonths"
              labelText="Application Term Months"
              value={form.applicationTermMonths}
              invalid={!!fieldError('applicationTermMonths')}
              invalidText={fieldError('applicationTermMonths')}
              onBlur={() => markFieldTouched('applicationTermMonths')}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicationTermMonths: event.target.value }))
              }
            />
            <TextInput
              id="applicationTermYears"
              labelText="Application Term Years"
              value={form.applicationTermYears}
              invalid={!!fieldError('applicationTermYears')}
              invalidText={fieldError('applicationTermYears')}
              onBlur={() => markFieldTouched('applicationTermYears')}
              onChange={(event) =>
                setForm((current) => ({ ...current, applicationTermYears: event.target.value }))
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
            <TextInput
              id="averageLogVolume"
              labelText="Average Log Volume (required)"
              value={form.averageLogVolume}
              invalid={!!fieldError('averageLogVolume')}
              invalidText={fieldError('averageLogVolume')}
              onBlur={() => markFieldTouched('averageLogVolume')}
              onChange={(event) =>
                setForm((current) => ({ ...current, averageLogVolume: event.target.value }))
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
              disabled={
                missingRequiredOptions ||
                isSubmitting ||
                isLoadingOwnerClientLocations ||
                isLoadingAgentClientLocations
              }
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
            return `${value.ownerClientNumber || 'N/A'} / ${value.productLocation || 'N/A'}`
          }}
        />
      </Column>
    </Grid>
  )
}

export default ProvincialApplicationCreatePage
