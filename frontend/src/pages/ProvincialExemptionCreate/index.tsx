import {
  RecordField,
  RecordFieldCell,
  RecordFieldGrid,
  RecordFieldRow,
} from '@/pages/shared/RecordFieldGrid'
import { Certificate, Currency, DocumentAttachment, Result, Rule, Save } from '@carbon/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Column,
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
import IsoDatePicker from '../../components/IsoDatePicker'
import { AppNotification } from '../../components/AppNotification'
import SearchableSelect from '../../components/SearchableSelect'
import RegionMultiSelect from '@/components/RegionMultiSelect'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import { discardNewRecordCopy } from '@/components/DiscardChangesModal'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { hasProvincialSubmitterRole, hasRole } from '@/context/auth/role-utils'
import { useAuth } from '@/context/auth/useAuth'
import { useAllowedRegionOptions } from '@/context/auth/useAllowedRegionOptions'
import {
  atMostTwoDecimalFieldError,
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
  maxNumericValueFieldError,
  positiveNumericFieldError,
  requiredFieldError,
  type FieldErrors,
} from '@/pages/shared/create-form-utils'
import {
  mapSelectedOptionsById,
  mapValueLabelOptionsToIdTextOptions,
  type IdTextOption,
} from '@/pages/shared/search-query-utils'
import {
  fetchProvincialExemptionOptions,
  type SearchOption,
} from '@/service/search-options-service'
import {
  checkProvincialExemptionNumber,
  submitProvincialExemptionCreate,
} from '@/service/create-submit-service'
import { fieldErrorText } from '@/utils/field-error'
import { requiredLabel } from '@/utils/required-label'
import { focusFirstInvalidFieldAfterRender } from '@/utils/focus'
import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'

type ProvincialExemptionCreateForm = {
  exemptionNumber: string
  exemptionTypeCode: string
  exemptionStatusCode: string
  approvalDate: string
  expiryDate: string
  approvedVolume: string
  enableRateOverride: boolean
  feeRate: string
  regionNumbers: string[]
  otherConditions: string
}

type ProvincialExemptionCreateField = keyof ProvincialExemptionCreateForm & string

type ExemptionCreateTab = 'summary' | 'applications' | 'documents' | 'permits' | 'fees'

const EXEMPTION_CREATE_TABS: readonly ExemptionCreateTab[] = [
  'summary',
  'applications',
  'documents',
  'permits',
  'fees',
]

const EXEMPTION_CREATE_TAB_LABELS: Record<ExemptionCreateTab, string> = {
  summary: 'Exemption details',
  applications: 'Applications',
  documents: 'Documents',
  permits: 'Permits',
  fees: 'Fees',
}

const EXEMPTION_CREATE_TAB_ICONS = {
  summary: Rule,
  applications: Result,
  documents: DocumentAttachment,
  permits: Certificate,
  fees: Currency,
}

const INITIAL_FORM: ProvincialExemptionCreateForm = {
  exemptionNumber: '',
  exemptionTypeCode: 'O',
  exemptionStatusCode: 'ACT',
  approvalDate: '',
  expiryDate: '',
  approvedVolume: '',
  enableRateOverride: false,
  feeRate: '',
  regionNumbers: [],
  otherConditions: '',
}

const BLANKET_OIC_MAX_VOLUME = '9999999.9'
const OIC_TYPES = new Set(['O', 'B'])
const ASCII_PATTERN = /^[\u0000-\u007f]*$/
const SAVE_FAILED_MESSAGE =
  'Exemption save failed. Please review the form and try again. If the problem persists, contact support.'
const DUPLICATE_EXEMPTION_NUMBER_ERROR = '* - this exemption number has already been assigned'
const DUPLICATE_EXEMPTION_NUMBER_FIELD_ERROR = 'This exemption number has already been assigned.'

const feeRateError = (value: string): string | undefined => {
  const normalized = value.trim()
  if (!normalized) {
    return 'Fee rate is required.'
  }
  const parsed = Number(normalized)
  if (
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > 999.99 ||
    !/^\d+(?:\.\d{1,2})?$/.test(normalized)
  ) {
    return 'Fee rate must be greater than 0, at most 999.99, and have at most two decimal places.'
  }
  return undefined
}

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
  placement?: 'inline'
  focusOnReveal?: boolean
}

// A server message about one field. It shows while the field still holds the value that was
// rejected, so editing the field clears it.
type ServerFieldError = { message: string; value: string }
type ServerFieldErrors = Partial<Record<ProvincialExemptionCreateField, ServerFieldError>>

// Server messages that name one field.
const serverErrorField = (message: string): ProvincialExemptionCreateField | undefined => {
  if (message === DUPLICATE_EXEMPTION_NUMBER_ERROR) return 'exemptionNumber'
  if (
    message.startsWith('Exemption number ') ||
    message === 'A valid exemption number is required for an active OIC exemption.'
  ) {
    return 'exemptionNumber'
  }
  if (message.startsWith('The approved volume ')) return 'approvedVolume'
  if (message.startsWith('Other conditions ')) return 'otherConditions'
  if (
    message === 'A valid expiry date is required.' ||
    message === 'The approval date must come before the expiry.' ||
    message === 'An active exemption cannot have an expiry date before today.'
  ) {
    return 'expiryDate'
  }
  if (message.startsWith('The fee rate ')) return 'feeRate'
  return undefined
}

const ProvincialExemptionCreatePage = () => {
  const { capabilities, canPerform } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<ProvincialExemptionCreateForm>(INITIAL_FORM)
  const draftBaselineRef = useRef(form)
  const [formEdited, setFormEdited] = useState(false)
  const [createdExemptionNumber, setCreatedExemptionNumber] = useState<string | null>(null)
  const [exemptionTypes, setExemptionTypes] = useState<SearchOption[]>([])
  const [exemptionStatuses, setExemptionStatuses] = useState<SearchOption[]>([])
  const [allRegionOptions, setAllRegionOptions] = useState<IdTextOption[]>([])
  const regionOptions = useAllowedRegionOptions(
    allRegionOptions,
    ['/createExemption', 'saveExemption'],
    'id',
  )
  const [optionsLoaded, setOptionsLoaded] = useState(false)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [showMissingRequiredOptions, setShowMissingRequiredOptions] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedExemptionTab, setSelectedExemptionTab] = useState<ExemptionCreateTab>('summary')
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)
  const [serverFieldErrors, setServerFieldErrors] = useState<ServerFieldErrors>({})
  const checkedExemptionNumberRef = useRef<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const roles = capabilities?.roles ?? []
  const canCreateExemption = canPerform('/createExemption')
  const canCreateBlanketOic =
    !hasRole(roles, 'EXEMPTION_APPROVER') ||
    hasRole(roles, 'ADMIN') ||
    hasRole(roles, 'APPLICATION_APPROVER') ||
    hasRole(roles, 'READ_ONLY') ||
    hasProvincialSubmitterRole(roles)
  const normalizedTypeCode = form.exemptionTypeCode.trim().toUpperCase()
  const oicLike = OIC_TYPES.has(normalizedTypeCode)
  const blanketOic = normalizedTypeCode === 'B'
  const showApplications = !blanketOic
  const visibleExemptionTabs = useMemo(
    () =>
      EXEMPTION_CREATE_TABS.filter((tab) =>
        tab === 'applications' ? showApplications : tab === 'fees' ? oicLike : true,
      ),
    [oicLike, showApplications],
  )
  const activeExemptionTab = visibleExemptionTabs.includes(selectedExemptionTab)
    ? selectedExemptionTab
    : 'summary'
  const selectedExemptionTabIndex = Math.max(0, visibleExemptionTabs.indexOf(activeExemptionTab))
  // OIC and Blanket OIC creation uses a system-selected initial status, so it is a payload
  // invariant, not a required user input.
  const canEditInitialExemptionStatus =
    optionsLoaded && !optionsUnavailable && !OIC_TYPES.has(normalizedTypeCode)
  // INTENTIONAL_LEGACY_DIVERGENCE(EXEMPTION_CREATE_OIC_TYPES): Ministerial exemptions are created
  // from selected applications in Application search, so this page doesn't offer the type.
  const availableExemptionTypes = useMemo(
    () =>
      exemptionTypes.filter((option) => {
        const typeCode = option.value.toUpperCase()
        return typeCode !== 'M' && (typeCode !== 'B' || canCreateBlanketOic)
      }),
    [canCreateBlanketOic, exemptionTypes],
  )
  const selectedRegions = useMemo(
    () => mapSelectedOptionsById(form.regionNumbers, regionOptions, (id) => `Region ${id}`),
    [form.regionNumbers, regionOptions],
  )
  useEffect(() => {
    if (createdExemptionNumber) {
      // The detail page shows the saved confirmation once for the record this page created.
      navigate(`/provincial/exemption/${encodeURIComponent(createdExemptionNumber)}`, {
        state: { exemptionCreationNotice: { exemptionNumber: createdExemptionNumber } },
      })
    }
  }, [createdExemptionNumber, navigate])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const options = await fetchProvincialExemptionOptions()
        setExemptionTypes(options.exemptionTypes)
        setExemptionStatuses(options.exemptionStatuses)
        setAllRegionOptions(mapValueLabelOptionsToIdTextOptions(options.regions))
        setOptionsUnavailable(false)
      } catch {
        setOptionsUnavailable(true)
      } finally {
        setOptionsLoaded(true)
      }
    }

    void loadOptions()
  }, [])

  const fieldErrors = useMemo<FieldErrors<ProvincialExemptionCreateField>>(
    () => ({
      exemptionNumber: oicLike
        ? (firstValidationError(
            () => requiredFieldError(form.exemptionNumber, 'Exemption number'),
            () =>
              ASCII_PATTERN.test(form.exemptionNumber.trim())
                ? null
                : 'Exemption number contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
            () =>
              form.exemptionNumber.trim().length > 8
                ? 'Exemption number must be 8 characters or fewer.'
                : null,
          ) ?? undefined)
        : undefined,
      exemptionTypeCode: firstValidationError(
        () => requiredFieldError(form.exemptionTypeCode, 'Exemption type'),
        () =>
          availableExemptionTypes.some((option) => option.value === form.exemptionTypeCode)
            ? null
            : 'Select a valid exemption type.',
      ),
      exemptionStatusCode: firstValidationError(
        () => requiredFieldError(form.exemptionStatusCode, 'Status'),
        () =>
          exemptionStatuses.some((option) => option.value === form.exemptionStatusCode)
            ? null
            : 'Select a valid exemption status.',
      ),
      approvalDate:
        (oicLike
          ? firstValidationError(
              () => requiredFieldError(form.approvalDate, 'Approval date'),
              () => isoDateFieldError(form.approvalDate),
            )
          : (isoDateFieldError(form.approvalDate) ?? undefined)) ?? undefined,
      expiryDate:
        (firstValidationError(
          () =>
            oicLike || form.approvalDate
              ? requiredFieldError(form.expiryDate, 'Expiry date')
              : null,
          () => isoDateFieldError(form.expiryDate),
          () => {
            if (!form.approvalDate || !form.expiryDate) return null
            const invalidOrder = form.expiryDate <= form.approvalDate
            return invalidOrder ? 'Expiry date must be after the approval date.' : null
          },
        ) ??
          undefined) ||
        undefined,
      approvedVolume: firstValidationError(
        () => requiredFieldError(form.approvedVolume, 'Approval volume'),
        () => positiveNumericFieldError(form.approvedVolume),
        () => maxNumericValueFieldError(form.approvedVolume, 9999999.99, 'Approval volume'),
        () => atMostTwoDecimalFieldError(form.approvedVolume, 'Approval volume'),
      ),
      feeRate: oicLike && form.enableRateOverride ? feeRateError(form.feeRate) : undefined,
      regionNumbers:
        blanketOic && form.regionNumbers.length === 0
          ? 'Select at least one region for a Blanket OIC exemption.'
          : blanketOic &&
              form.regionNumbers.some(
                (regionNumber) => !regionOptions.some((option) => option.id === regionNumber),
              )
            ? 'Select valid regions for a Blanket OIC exemption.'
            : undefined,
      otherConditions:
        firstValidationError(
          () =>
            ASCII_PATTERN.test(form.otherConditions.trim())
              ? null
              : 'Conditions contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
          () =>
            form.otherConditions.length <= 250
              ? null
              : 'Conditions must contain at most 250 characters.',
        ) ?? undefined,
    }),
    [availableExemptionTypes, blanketOic, exemptionStatuses, form, oicLike, regionOptions],
  )
  const hasValidationError = useMemo(
    () => Object.values(fieldErrors).some((error) => !!error),
    [fieldErrors],
  )
  const requiredOptionsUnavailable =
    availableExemptionTypes.length === 0 ||
    exemptionStatuses.length === 0 ||
    (blanketOic && regionOptions.length === 0)
  const missingRequiredOptions =
    optionsLoaded && !optionsUnavailable && showMissingRequiredOptions && requiredOptionsUnavailable

  const markFormEdited = (): void => {
    if (!formEdited) {
      draftBaselineRef.current = form
    }
    setFormEdited(true)
  }

  const fieldError = (field: ProvincialExemptionCreateField): string | undefined => {
    const serverError = serverFieldErrors[field]
    return serverError && serverError.value === String(form[field]).trim()
      ? fieldErrorText(serverError.message)
      : getVisibleFieldError(field, fieldErrors, {}, showAllValidationErrors)
  }

  // Asks LEXIS whether a changed exemption number is already assigned. A failed lookup shows
  // nothing: Save makes the same check.
  const checkExemptionNumber = async (): Promise<void> => {
    const exemptionNumber = form.exemptionNumber.trim()
    if (
      !exemptionNumber ||
      exemptionNumber === checkedExemptionNumberRef.current ||
      fieldErrors.exemptionNumber
    ) {
      return
    }
    checkedExemptionNumberRef.current = exemptionNumber
    try {
      const result = await checkProvincialExemptionNumber(exemptionNumber)
      setServerFieldErrors((current) => {
        if (!result.valid) {
          return {
            ...current,
            exemptionNumber: {
              message: DUPLICATE_EXEMPTION_NUMBER_FIELD_ERROR,
              value: exemptionNumber,
            },
          }
        }
        // A number that is free now drops an earlier taken message for that same number.
        const previous = current.exemptionNumber
        if (
          previous?.value !== exemptionNumber ||
          previous.message !== DUPLICATE_EXEMPTION_NUMBER_FIELD_ERROR
        ) {
          return current
        }
        const next = { ...current }
        delete next.exemptionNumber
        return next
      })
    } catch {
      if (checkedExemptionNumberRef.current === exemptionNumber) {
        checkedExemptionNumberRef.current = null
      }
    }
  }

  const onExemptionTypeChange = (value: string): void => {
    if (value === form.exemptionTypeCode) {
      return
    }
    markFormEdited()
    setServerFieldErrors({})
    checkedExemptionNumberRef.current = null
    const typeCode = value.trim().toUpperCase()
    // Legacy creates OIC/BOIC as Active without the separate Ministerial approval permission.
    const nextStatus = OIC_TYPES.has(typeCode) ? 'ACT' : ''
    setForm((current) => {
      const currentTypeCode = current.exemptionTypeCode.trim().toUpperCase()
      const currentVolume = current.approvedVolume.trim()
      const approvedVolume =
        typeCode === 'B'
          ? !currentVolume || Number(currentVolume) === 0
            ? BLANKET_OIC_MAX_VOLUME
            : current.approvedVolume
          : currentTypeCode === 'B' && currentVolume === BLANKET_OIC_MAX_VOLUME
            ? ''
            : current.approvedVolume
      return {
        ...current,
        exemptionNumber: OIC_TYPES.has(typeCode) ? current.exemptionNumber : '',
        exemptionTypeCode: value,
        exemptionStatusCode: nextStatus || current.exemptionStatusCode,
        approvedVolume,
        enableRateOverride: OIC_TYPES.has(typeCode) ? current.enableRateOverride : false,
        feeRate: OIC_TYPES.has(typeCode) ? current.feeRate : '',
        regionNumbers: typeCode === 'B' ? current.regionNumbers : [],
      }
    })
  }

  const onSave = async (): Promise<boolean> => {
    const saveUnavailableReason =
      !optionsLoaded || optionsUnavailable || requiredOptionsUnavailable
        ? 'Authoritative exemption options must load before this exemption can be saved.'
        : !canCreateExemption
          ? 'Authorization to create this exemption is required before it can be saved.'
          : undefined
    if (saveUnavailableReason) {
      setStatus({
        kind: 'error',
        title: 'Cannot save yet.',
        message: saveUnavailableReason,
        placement: 'inline',
      })
      return false
    }
    if (hasValidationError) {
      // The fee rate is the only validated field outside Exemption details.
      const { feeRate: feeRateValidationError, ...summaryFieldErrors } = fieldErrors
      const firstSummaryError = Object.values(summaryFieldErrors).find(
        (error): error is string => !!error,
      )
      setSelectedExemptionTab(!firstSummaryError && feeRateValidationError ? 'fees' : 'summary')
      setShowAllValidationErrors(true)
      setStatus(null)
      focusFirstInvalidFieldAfterRender(() => formRef.current)
      return false
    }

    setStatus(null)
    setServerFieldErrors({})
    setIsSubmitting(true)
    try {
      const result = await submitProvincialExemptionCreate({
        ...form,
        applicationNumber: '',
        linkedApplicationNumbers: [],
      })
      if (result.success) {
        draftBaselineRef.current = form
        setFormEdited(false)
        if (result.createdId) {
          setCreatedExemptionNumber(result.createdId)
          return true
        }
        setStatus({
          kind: 'success',
          title: 'Exemption saved',
          message: 'Exemption saved successfully.',
        })
        return true
      }

      const nextServerFieldErrors: ServerFieldErrors = {}
      const unmappedErrors: string[] = []
      result.errors.forEach((error) => {
        const field = serverErrorField(error.trim())
        if (!field) {
          unmappedErrors.push(error)
          return
        }
        const message =
          error.trim() === DUPLICATE_EXEMPTION_NUMBER_ERROR
            ? DUPLICATE_EXEMPTION_NUMBER_FIELD_ERROR
            : error
        const existing = nextServerFieldErrors[field]
        nextServerFieldErrors[field] = {
          message: existing ? `${existing.message} ${message}` : message,
          value: String(form[field]).trim(),
        }
      })
      const mappedFields = Object.keys(nextServerFieldErrors)
      setServerFieldErrors(nextServerFieldErrors)
      setStatus(
        unmappedErrors.length > 0 || mappedFields.length === 0
          ? {
              kind: 'error',
              title: 'Save failed',
              message: unmappedErrors.join(' ') || result.message || SAVE_FAILED_MESSAGE,
              focusOnReveal: mappedFields.length === 0,
            }
          : null,
      )
      if (mappedFields.length > 0) {
        setSelectedExemptionTab(
          mappedFields.some((field) => field !== 'feeRate') ? 'summary' : 'fees',
        )
        focusFirstInvalidFieldAfterRender(() => formRef.current)
      }
      return false
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Save failed',
        message: SAVE_FAILED_MESSAGE,
        focusOnReveal: true,
      })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const onDiscardCreateDraft = (): void => {
    setForm(draftBaselineRef.current)
    setFormEdited(false)
    setShowAllValidationErrors(false)
    setServerFieldErrors({})
    checkedExemptionNumberRef.current = null
    setStatus(null)
  }

  const isCreateDraftDirty = formEdited && !formValuesEqual(form, draftBaselineRef.current)

  return (
    <Grid fullWidth className="default-grid create-page-grid provincial-exemption-create-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Create new exemption"
          focusTitle
          actions={
            <>
              <Button
                type="button"
                kind="tertiary"
                size="md"
                onClick={() => navigate('/provincial/exemption')}
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
                {isSubmitting ? 'Saving…' : 'Save exemption'}
              </Button>
            </>
          }
        />
      </Column>

      <Column sm={4} md={8} lg={16}>
        <InlineNotification
          kind="info"
          subtitle={
            showApplications
              ? 'Applications, documents and permits can be added after you save the exemption.'
              : 'Documents and Permits can be added after you save the exemption.'
          }
          lowContrast
          hideCloseButton
        />
      </Column>

      {optionsUnavailable && <AuthoritativeOptionsUnavailableNotification />}

      {missingRequiredOptions && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="warning"
            title="Required options not configured"
            subtitle="No valid exemption type, status, or required region values are configured."
            lowContrast
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
            revealKey={status}
            focusOnReveal={status.focusOnReveal ?? status.kind === 'error'}
            lowContrast
            onCloseButtonClick={() => setStatus(null)}
          />
        </Column>
      )}

      <Column ref={formRef} sm={4} md={8} lg={16} className="application-detail-tabs-column">
        {status?.placement === 'inline' && (
          <AppNotification
            className="create-form-validation-notification"
            kind="error"
            revealKey={status}
            title={status.title}
            subtitle={status.message}
            focusOnReveal
            lowContrast
            onCloseButtonClick={() => setStatus(null)}
          />
        )}
        <Tabs
          selectedIndex={selectedExemptionTabIndex}
          onChange={({ selectedIndex }) => {
            const nextTab = visibleExemptionTabs[selectedIndex]
            if (nextTab) {
              setSelectedExemptionTab(nextTab)
            }
          }}
        >
          <TabList
            aria-label="Exemption create sections"
            contained
            className="application-tabs__list application-detail-tab-list"
          >
            {visibleExemptionTabs.map((tab) => (
              <Tab key={tab} renderIcon={EXEMPTION_CREATE_TAB_ICONS[tab]}>
                {EXEMPTION_CREATE_TAB_LABELS[tab]}
              </Tab>
            ))}
          </TabList>
          <TabPanels>
            {[
              <TabPanel key="summary" className="application-detail-tab-panel">
                <Tile
                  className="create-form-tile application-detail-section"
                  role="region"
                  aria-label="Exemption details"
                >
                  <fieldset className="legacy-form-fieldset create-form-section">
                    <legend className="detail-tile-title">
                      <Rule size={24} aria-hidden="true" />
                      Exemption details
                    </legend>
                    <RequiredFieldsLegend className="application-detail-required" />
                    <RecordFieldGrid editing>
                      <RecordFieldRow>
                        <RecordFieldCell>
                          <RadioButtonGroup
                            className="provincial-exemption-type-group"
                            legendText={requiredLabel('Exemption type')}
                            name="exemptionTypeCode"
                            valueSelected={form.exemptionTypeCode}
                            required
                            orientation="horizontal"
                            invalid={!!fieldError('exemptionTypeCode')}
                            invalidText={fieldError('exemptionTypeCode')}
                            disabled={!optionsLoaded || optionsUnavailable}
                            onChange={(value) => onExemptionTypeChange(String(value))}
                          >
                            {availableExemptionTypes.map((option) => (
                              <RadioButton
                                key={option.value}
                                id={`exemptionTypeCode-${option.value}`}
                                value={option.value}
                                labelText={option.label}
                              />
                            ))}
                          </RadioButtonGroup>
                        </RecordFieldCell>
                      </RecordFieldRow>
                      <RecordFieldRow>
                        {oicLike && (
                          <RecordFieldCell>
                            <TextInput
                              id="exemptionNumber"
                              labelText={requiredLabel('Exemption number')}
                              aria-required="true"
                              maxLength={8}
                              value={form.exemptionNumber}
                              invalid={!!fieldError('exemptionNumber')}
                              invalidText={fieldError('exemptionNumber')}
                              onChange={(event) => {
                                markFormEdited()
                                checkedExemptionNumberRef.current = null
                                setForm((current) => ({
                                  ...current,
                                  exemptionNumber: event.target.value.toUpperCase(),
                                }))
                              }}
                              onBlur={() => void checkExemptionNumber()}
                            />
                          </RecordFieldCell>
                        )}
                        <RecordFieldCell>
                          <SearchableSelect
                            id="exemptionStatusCode"
                            labelText={requiredLabel('Status', canEditInitialExemptionStatus)}
                            required={canEditInitialExemptionStatus}
                            value={form.exemptionStatusCode}
                            invalid={!!fieldError('exemptionStatusCode')}
                            invalidText={fieldError('exemptionStatusCode')}
                            placeholder="Select status"
                            options={exemptionStatuses}
                            disabled={!canEditInitialExemptionStatus}
                            onChange={(value) => {
                              markFormEdited()
                              setForm((current) => ({ ...current, exemptionStatusCode: value }))
                            }}
                          />
                        </RecordFieldCell>
                      </RecordFieldRow>
                      {oicLike && (
                        <RecordFieldRow>
                          <RecordField
                            label="Exemption holder"
                            value="No applications associated with this exemption"
                            span="wide"
                          />
                        </RecordFieldRow>
                      )}
                      <RecordFieldRow>
                        <RecordFieldCell>
                          <IsoDatePicker
                            id="approvalDate"
                            labelText={requiredLabel('Approval date', oicLike)}
                            required={oicLike}
                            value={form.approvalDate}
                            invalid={!!fieldError('approvalDate')}
                            invalidText={fieldError('approvalDate')}
                            onChange={(value) => {
                              markFormEdited()
                              setForm((current) => ({ ...current, approvalDate: value }))
                            }}
                          />
                        </RecordFieldCell>
                        <RecordFieldCell>
                          <IsoDatePicker
                            id="expiryDate"
                            labelText={requiredLabel('Expiry date', oicLike || !!form.approvalDate)}
                            required={oicLike || !!form.approvalDate}
                            value={form.expiryDate}
                            invalid={!!fieldError('expiryDate')}
                            invalidText={fieldError('expiryDate')}
                            onChange={(value) => {
                              markFormEdited()
                              setForm((current) => ({ ...current, expiryDate: value }))
                            }}
                          />
                        </RecordFieldCell>
                      </RecordFieldRow>
                      <RecordFieldRow>
                        <RecordFieldCell>
                          <TextInput
                            id="approvedVolume"
                            labelText={requiredLabel('Approval volume (m³)')}
                            aria-required="true"
                            value={form.approvedVolume}
                            invalid={!!fieldError('approvedVolume')}
                            invalidText={fieldError('approvedVolume')}
                            onChange={(event) => {
                              markFormEdited()
                              setForm((current) => ({
                                ...current,
                                approvedVolume: event.target.value,
                              }))
                            }}
                          />
                        </RecordFieldCell>
                      </RecordFieldRow>
                      <RecordFieldRow>
                        {blanketOic && (
                          <RecordFieldCell span="wide">
                            <RegionMultiSelect
                              id="exemptionRegions"
                              titleText={requiredLabel('Region')}
                              required
                              items={regionOptions}
                              selectedItems={selectedRegions}
                              invalid={!!fieldError('regionNumbers')}
                              invalidText={fieldError('regionNumbers')}
                              showSelectedNames
                              disabled={!optionsLoaded || optionsUnavailable}
                              onChange={(selectedItems) => {
                                const regionNumbers = selectedItems.map((item) => item.id)
                                if (formValuesEqual(regionNumbers, form.regionNumbers)) {
                                  return
                                }
                                markFormEdited()
                                setForm((current) => ({ ...current, regionNumbers }))
                              }}
                            />
                          </RecordFieldCell>
                        )}
                      </RecordFieldRow>
                    </RecordFieldGrid>
                    <div className="legacy-search-actions create-form-comments">
                      <RecordFieldGrid editing>
                        <RecordFieldRow>
                          <RecordFieldCell span="full">
                            <TextArea
                              id="otherConditions"
                              labelText="Conditions"
                              enableCounter
                              maxCount={250}
                              maxLength={250}
                              value={form.otherConditions}
                              invalid={!!fieldError('otherConditions')}
                              invalidText={fieldError('otherConditions')}
                              onChange={(event) => {
                                markFormEdited()
                                setForm((current) => ({
                                  ...current,
                                  otherConditions: event.target.value,
                                }))
                              }}
                            />
                          </RecordFieldCell>
                        </RecordFieldRow>
                      </RecordFieldGrid>
                    </div>
                  </fieldset>
                </Tile>
              </TabPanel>,
              showApplications && (
                <TabPanel
                  key="applications"
                  className="application-detail-tab-panel application-detail-tab-panel--empty"
                >
                  <p className="unsaved-tab-note">Available after the exemption is saved.</p>
                </TabPanel>
              ),
              <TabPanel
                key="documents"
                className="application-detail-tab-panel application-detail-tab-panel--empty"
              >
                <p className="unsaved-tab-note">Available after the exemption is saved.</p>
              </TabPanel>,
              <TabPanel
                key="permits"
                className="application-detail-tab-panel application-detail-tab-panel--empty"
              >
                <p className="unsaved-tab-note">Available after the exemption is saved.</p>
              </TabPanel>,
              oicLike && (
                <TabPanel key="fees" className="application-detail-tab-panel">
                  <Tile
                    className="create-form-tile application-detail-section"
                    role="region"
                    aria-label="Fees"
                  >
                    <fieldset className="legacy-form-fieldset create-form-section">
                      <legend className="detail-tile-title">
                        <Currency size={24} aria-hidden="true" />
                        Fees
                      </legend>
                      {form.enableRateOverride && (
                        <RequiredFieldsLegend className="application-detail-required" />
                      )}
                      <RecordFieldGrid editing>
                        <RecordFieldRow>
                          <RecordFieldCell>
                            <RadioButtonGroup
                              legendText={requiredLabel('Override fee rate?')}
                              required
                              name="enableExemptionRateOverride"
                              valueSelected={form.enableRateOverride ? 'yes' : 'no'}
                              orientation="horizontal"
                              onChange={(value) => {
                                const enabled = String(value) === 'yes'
                                if (enabled === form.enableRateOverride) return
                                markFormEdited()
                                setForm((current) => ({
                                  ...current,
                                  enableRateOverride: enabled,
                                  feeRate: enabled ? current.feeRate : '',
                                }))
                              }}
                            >
                              <RadioButton
                                id="enableExemptionRateOverride-no"
                                labelText="No"
                                value="no"
                              />
                              <RadioButton
                                id="enableExemptionRateOverride-yes"
                                labelText="Yes"
                                value="yes"
                              />
                            </RadioButtonGroup>
                          </RecordFieldCell>
                        </RecordFieldRow>
                        <RecordFieldRow>
                          {form.enableRateOverride && (
                            <RecordFieldCell>
                              <TextInput
                                id="exemptionFeeRate"
                                labelText={requiredLabel('Fee rate ($/m³)')}
                                aria-required="true"
                                value={form.feeRate}
                                invalid={!!fieldError('feeRate')}
                                invalidText={fieldError('feeRate')}
                                onChange={(event) => {
                                  markFormEdited()
                                  setForm((current) => ({
                                    ...current,
                                    feeRate: event.target.value,
                                  }))
                                }}
                              />
                            </RecordFieldCell>
                          )}
                        </RecordFieldRow>
                      </RecordFieldGrid>
                    </fieldset>
                  </Tile>
                </TabPanel>
              ),
            ].filter(Boolean)}
          </TabPanels>
        </Tabs>
      </Column>
      <UnsavedChangesGuard
        isDirty={isCreateDraftDirty}
        isBusy={isSubmitting}
        onDiscard={onDiscardCreateDraft}
        discardCopy={discardNewRecordCopy('exemption')}
        subject="this new exemption"
      />
    </Grid>
  )
}

export default ProvincialExemptionCreatePage
