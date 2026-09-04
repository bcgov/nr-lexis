import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Column,
  DismissibleTag,
  Grid,
  InlineNotification,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import ApplicationNumberSelect from '../../components/ApplicationNumberSelect'
import IsoDatePicker from '../../components/IsoDatePicker'
import { AppNotification } from '../../components/AppNotification'
import SearchableSelect from '../../components/SearchableSelect'
import RegionMultiSelect from '@/components/RegionMultiSelect'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import AuthoritativeOptionsUnavailableNotification from '@/components/AuthoritativeOptionsUnavailableNotification'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { hasProvincialSubmitterRole, hasRole } from '@/context/auth/role-utils'
import { useAuth } from '@/context/auth/useAuth'
import {
  atMostTwoDecimalFieldError,
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
  maxNumericValueFieldError,
  normalizeProvincialApplicationNumber,
  positiveNumericFieldError,
  provincialApplicationNumberFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
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
  fetchProvincialExemptionCreatePreview,
  submitProvincialExemptionCreate,
} from '@/service/create-submit-service'
import { requiredLabel } from '@/utils/required-label'

type ProvincialExemptionCreateForm = {
  applicationNumber: string
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

type ExemptionApplicationSource = 'federal' | 'provincial'

type ExemptionCreatePrefillState = {
  selectedApplicationNumbers: string[]
  applicationSource?: ExemptionApplicationSource
}

const INITIAL_FORM: ProvincialExemptionCreateForm = {
  applicationNumber: '',
  exemptionNumber: '',
  exemptionTypeCode: 'M',
  exemptionStatusCode: 'NEW',
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

const parseApplicationSource = (value: unknown): ExemptionApplicationSource | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'federal' || normalized === 'f') {
    return 'federal'
  }
  if (normalized === 'provincial' || normalized === 'p') {
    return 'provincial'
  }
  return undefined
}

const parseExemptionPrefillState = (rawState: unknown): ExemptionCreatePrefillState | null => {
  if (!rawState || typeof rawState !== 'object') {
    return null
  }

  const state = rawState as Record<string, unknown>
  const selectedApplicationNumbers = Array.isArray(state.selectedApplicationNumbers)
    ? state.selectedApplicationNumbers.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : []

  if (selectedApplicationNumbers.length === 0) {
    return null
  }

  return {
    selectedApplicationNumbers,
    applicationSource: parseApplicationSource(state.applicationSource ?? state.source),
  }
}

const parseExemptionPrefillQuery = (query: URLSearchParams): ExemptionCreatePrefillState | null => {
  const applicationsFromCsv = (query.get('applications') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  const fallbackSingleApplication = (query.get('applicationNumber') ?? '').trim()
  const selectedApplicationNumbers =
    applicationsFromCsv.length > 0
      ? applicationsFromCsv
      : fallbackSingleApplication
        ? [fallbackSingleApplication]
        : []

  if (selectedApplicationNumbers.length === 0) {
    return null
  }

  return {
    selectedApplicationNumbers,
    applicationSource: parseApplicationSource(query.get('source')),
  }
}

const mergePrefillState = (
  locationPrefill: ExemptionCreatePrefillState | null,
  queryPrefill: ExemptionCreatePrefillState | null,
): ExemptionCreatePrefillState | null => {
  if (!locationPrefill && !queryPrefill) {
    return null
  }

  if (locationPrefill && !queryPrefill) {
    return locationPrefill
  }

  if (!locationPrefill && queryPrefill) {
    return queryPrefill
  }

  const mergedApplicationNumbers = Array.from(
    new Set([
      ...(locationPrefill?.selectedApplicationNumbers ?? []),
      ...(queryPrefill?.selectedApplicationNumbers ?? []),
    ]),
  )

  if (mergedApplicationNumbers.length === 0) {
    return null
  }

  return {
    selectedApplicationNumbers: mergedApplicationNumbers,
    applicationSource: queryPrefill?.applicationSource ?? locationPrefill?.applicationSource,
  }
}

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
  placement?: 'inline'
}

const ProvincialExemptionCreatePage = () => {
  const { capabilities, canPerform } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const prefillState = useMemo(
    () =>
      mergePrefillState(
        parseExemptionPrefillState(location.state),
        parseExemptionPrefillQuery(searchParams),
      ),
    [location.state, searchParams],
  )
  const initialSelectedApplicationNumbers = useMemo(
    () =>
      Array.from(
        new Set(
          (prefillState?.selectedApplicationNumbers ?? [])
            .map(normalizeProvincialApplicationNumber)
            .filter((value) => value.length > 0),
        ),
      ),
    [prefillState],
  )
  const [form, setForm] = useState<ProvincialExemptionCreateForm>(INITIAL_FORM)
  const [selectedApplicationNumbers, setSelectedApplicationNumbers] = useState<string[]>(
    () => initialSelectedApplicationNumbers,
  )
  const draftBaselineRef = useRef(form)
  const selectedApplicationNumbersBaselineRef = useRef(selectedApplicationNumbers)
  const [formEdited, setFormEdited] = useState(false)
  const [createdRecordPath, setCreatedRecordPath] = useState<string | null>(null)
  const [exemptionTypes, setExemptionTypes] = useState<SearchOption[]>([])
  const [exemptionStatuses, setExemptionStatuses] = useState<SearchOption[]>([])
  const [regionOptions, setRegionOptions] = useState<IdTextOption[]>([])
  const [optionsLoaded, setOptionsLoaded] = useState(false)
  const [optionsUnavailable, setOptionsUnavailable] = useState(false)
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [showMissingRequiredOptions, setShowMissingRequiredOptions] = useState(true)
  const [showPrefillNotice, setShowPrefillNotice] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    prefillState ? 'loading' : 'idle',
  )
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [confirmedApplicationNumbers, setConfirmedApplicationNumbers] = useState<string[]>([])
  const [touchedFields, setTouchedFields] = useState<TouchedFields<ProvincialExemptionCreateField>>(
    {},
  )
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)
  const roles = capabilities?.roles ?? []
  const isFederalApplicationPrefill = prefillState?.applicationSource === 'federal'
  const canUseApplicationPrefill =
    canPerform('/createExemption') &&
    (!isFederalApplicationPrefill || canPerform('viewFederalApplication'))
  const pageSubtitle = isFederalApplicationPrefill
    ? 'Enter exemption details for the selected federal applications.'
    : 'Enter exemption details and save a new exemption.'
  const prefillApplicationLabel = isFederalApplicationPrefill
    ? 'federal application(s)'
    : 'application(s)'
  const canCreateBlanketOic =
    !hasRole(roles, 'EXEMPTION_APPROVER') ||
    hasRole(roles, 'ADMIN') ||
    hasRole(roles, 'APPLICATION_APPROVER') ||
    hasRole(roles, 'READ_ONLY') ||
    hasProvincialSubmitterRole(roles)
  const hasCurrentPreview =
    previewState === 'ready' &&
    confirmedApplicationNumbers.length === selectedApplicationNumbers.length &&
    confirmedApplicationNumbers.every(
      (applicationNumber, index) => applicationNumber === selectedApplicationNumbers[index],
    )
  const normalizedTypeCode = form.exemptionTypeCode.trim().toUpperCase()
  const oicLike = OIC_TYPES.has(normalizedTypeCode)
  const blanketOic = normalizedTypeCode === 'B'
  const availableExemptionTypes = useMemo(
    () =>
      exemptionTypes.filter(
        (option) =>
          option.value.toUpperCase() !== 'B' ||
          (canCreateBlanketOic && selectedApplicationNumbers.length === 0),
      ),
    [canCreateBlanketOic, exemptionTypes, selectedApplicationNumbers.length],
  )
  const selectedRegions = useMemo(
    () => mapSelectedOptionsById(form.regionNumbers, regionOptions, (id) => `Region ${id}`),
    [form.regionNumbers, regionOptions],
  )
  useEffect(() => {
    if (createdRecordPath) {
      navigate(createdRecordPath)
    }
  }, [createdRecordPath, navigate])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const options = await fetchProvincialExemptionOptions()
        setExemptionTypes(options.exemptionTypes)
        setExemptionStatuses(options.exemptionStatuses)
        setRegionOptions(mapValueLabelOptionsToIdTextOptions(options.regions))
        setOptionsUnavailable(false)
      } catch {
        setOptionsUnavailable(true)
      } finally {
        setOptionsLoaded(true)
      }
    }

    void loadOptions()
  }, [])

  useEffect(() => {
    let active = true
    const synchronizePreview = async () => {
      if (selectedApplicationNumbers.length === 0) {
        setPreviewState('idle')
        setPreviewError(null)
        setConfirmedApplicationNumbers([])
        return
      }
      if (!canUseApplicationPrefill) {
        setPreviewState('error')
        setPreviewError(null)
        setConfirmedApplicationNumbers([])
        return
      }

      setPreviewState('loading')
      setPreviewError(null)
      setConfirmedApplicationNumbers([])
      try {
        const preview = await fetchProvincialExemptionCreatePreview(selectedApplicationNumbers)
        if (!active) {
          return
        }
        setForm((current) => ({
          ...current,
          exemptionNumber: '',
          exemptionTypeCode: preview.exemptionTypeCode,
          exemptionStatusCode: preview.exemptionStatusCode,
          expiryDate: preview.expiryDate,
          approvedVolume: preview.approvedVolume,
          enableRateOverride: false,
          feeRate: '',
          regionNumbers: [],
        }))
        setConfirmedApplicationNumbers(preview.applicationNumbers)
        setPreviewState('ready')
      } catch (error) {
        if (!active) {
          return
        }
        setConfirmedApplicationNumbers([])
        setPreviewState('error')
        setPreviewError(
          error instanceof Error
            ? error.message
            : 'LEXIS could not prepare the exemption. Please try again before saving.',
        )
      }
    }

    void synchronizePreview()
    return () => {
      active = false
    }
  }, [canUseApplicationPrefill, selectedApplicationNumbers])

  const fieldErrors = useMemo<FieldErrors<ProvincialExemptionCreateField>>(
    () => ({
      applicationNumber:
        firstValidationError(
          () => provincialApplicationNumberFieldError(form.applicationNumber),
          () => {
            const applicationNumber = normalizeProvincialApplicationNumber(form.applicationNumber)
            return applicationNumber && selectedApplicationNumbers.includes(applicationNumber)
              ? `Application ${applicationNumber} is already selected.`
              : null
          },
        ) ?? undefined,
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
        () => requiredFieldError(form.exemptionStatusCode, 'Exemption status'),
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
        () => requiredFieldError(form.approvedVolume, 'Approved volume'),
        () => positiveNumericFieldError(form.approvedVolume),
        () => maxNumericValueFieldError(form.approvedVolume, 9999999.99, 'Approved volume'),
        () => atMostTwoDecimalFieldError(form.approvedVolume, 'Approved volume'),
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
    [
      availableExemptionTypes,
      blanketOic,
      exemptionStatuses,
      form,
      oicLike,
      regionOptions,
      selectedApplicationNumbers,
    ],
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

  const markFieldTouched = (field: ProvincialExemptionCreateField): void => {
    setTouchedFields((current) => ({ ...current, [field]: true }))
  }

  const markFormEdited = (): void => {
    if (!formEdited) {
      draftBaselineRef.current = form
    }
    setFormEdited(true)
  }

  const fieldError = (field: ProvincialExemptionCreateField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showAllValidationErrors)
  const firstSubmitValidationError = Object.values(fieldErrors).find(
    (error): error is string => !!error,
  )

  const onExemptionTypeChange = (value: string): void => {
    if (value === form.exemptionTypeCode) {
      return
    }
    markFormEdited()
    const typeCode = value.trim().toUpperCase()
    // Legacy creates OIC/BOIC as Active without the separate Ministerial approval permission.
    const nextStatus = typeCode === 'M' ? 'NEW' : OIC_TYPES.has(typeCode) ? 'ACT' : ''
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

  const onAddApplication = (): void => {
    const applicationNumber = normalizeProvincialApplicationNumber(form.applicationNumber)
    if (!applicationNumber || fieldErrors.applicationNumber) {
      markFieldTouched('applicationNumber')
      return
    }

    markFormEdited()
    setSelectedApplicationNumbers((current) => [...current, applicationNumber])
    setForm((current) => ({ ...current, applicationNumber: '' }))
    setTouchedFields((current) => ({ ...current, applicationNumber: false }))
    setShowPrefillNotice(false)
    setStatus(null)
  }

  const onRemoveApplication = (applicationNumber: string): void => {
    markFormEdited()
    setSelectedApplicationNumbers((current) =>
      current.filter(
        (selectedApplicationNumber) => selectedApplicationNumber !== applicationNumber,
      ),
    )
    setShowPrefillNotice(false)
    setStatus(null)
  }

  const onSave = async (navigateToCreatedRecord = true): Promise<boolean> => {
    if (
      !optionsLoaded ||
      optionsUnavailable ||
      requiredOptionsUnavailable ||
      !canUseApplicationPrefill
    ) {
      return false
    }
    if (form.applicationNumber.trim()) {
      markFieldTouched('applicationNumber')
      setStatus({
        kind: 'error',
        title: 'Application Not Added',
        message: 'Add or clear the pending application number before saving.',
        placement: 'inline',
      })
      return false
    }
    if (selectedApplicationNumbers.length > 0 && !hasCurrentPreview) {
      setStatus({
        kind: 'error',
        title: 'Exemption Preview Required',
        message:
          previewError ?? 'Wait for LEXIS to validate the selected applications before saving.',
        placement: 'inline',
      })
      return false
    }
    if (hasValidationError) {
      setShowAllValidationErrors(true)
      setStatus({
        kind: 'error',
        title: 'Validation error',
        message: firstSubmitValidationError ?? 'Please fix validation errors before saving.',
        placement: 'inline',
      })
      return false
    }

    setStatus(null)
    setIsSubmitting(true)
    try {
      const linkedApplicationNumbers =
        confirmedApplicationNumbers.length > 0 ? confirmedApplicationNumbers : []
      const result = await submitProvincialExemptionCreate({
        ...form,
        applicationNumber: linkedApplicationNumbers[0] ?? '',
        linkedApplicationNumbers,
      })
      if (result.success) {
        draftBaselineRef.current = form
        selectedApplicationNumbersBaselineRef.current = [...selectedApplicationNumbers]
        setFormEdited(false)
        if (result.createdId) {
          if (navigateToCreatedRecord) {
            setCreatedRecordPath(`/provincial/exemption/${encodeURIComponent(result.createdId)}`)
          }
          return true
        }
        setStatus({
          kind: 'success',
          title: 'Exemption Saved',
          message: 'Exemption saved successfully.',
        })
        return true
      }

      setStatus({
        kind: 'error',
        title: 'Save Failed',
        message:
          result.errors[0] ||
          result.message ||
          'Exemption save failed. Please review the form and try again. If the problem persists, contact support.',
      })
      return false
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Save Failed',
        message:
          'Exemption save failed. Please review the form and try again. If the problem persists, contact support.',
      })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const onDiscardCreateDraft = (): void => {
    setForm(draftBaselineRef.current)
    setSelectedApplicationNumbers([...selectedApplicationNumbersBaselineRef.current])
    setFormEdited(false)
    setTouchedFields({})
    setShowAllValidationErrors(false)
    setStatus(null)
  }

  const isCreateDraftDirty =
    formEdited &&
    (!formValuesEqual(form, draftBaselineRef.current) ||
      !formValuesEqual(selectedApplicationNumbers, selectedApplicationNumbersBaselineRef.current))

  return (
    <Grid fullWidth className="default-grid create-page-grid provincial-exemption-create-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader title="Create exemption" subtitle={pageSubtitle} />
      </Column>

      {optionsUnavailable && <AuthoritativeOptionsUnavailableNotification />}

      {missingRequiredOptions && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="warning"
            title="Required options not configured"
            subtitle="No valid exemption type, status, or required region values are configured. Save remains disabled."
            lowContrast
            onCloseButtonClick={() => setShowMissingRequiredOptions(false)}
          />
        </Column>
      )}

      {isFederalApplicationPrefill && !canUseApplicationPrefill && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="error"
            title="Federal application access required"
            subtitle="Your session cannot create an exemption from the selected federal applications."
            lowContrast
          />
        </Column>
      )}

      {!!previewError && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="error"
            title="Selected applications could not be prepared"
            subtitle={previewError}
            lowContrast
          />
        </Column>
      )}

      {!!prefillState && hasCurrentPreview && showPrefillNotice && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="info"
            title="Prefilled from selected applications"
            subtitle={`Loaded ${prefillState.selectedApplicationNumbers.length} ${prefillApplicationLabel} into this form.`}
            lowContrast
            onCloseButtonClick={() => setShowPrefillNotice(false)}
            autoDismissMs={6000}
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

      <Column sm={4} md={8} lg={16}>
        {/* INTENTIONAL_LEGACY_DIVERGENCE(EXEMPTION_CREATE_SAVE_FIRST): Owner data is
            derived from linked applications, while documents, permits, and fees require
            the persisted exemption created by this form. */}
        <Tile className="create-form-tile">
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
          <fieldset className="legacy-form-fieldset create-form-section">
            <legend>Exemption details</legend>
            <div className="legacy-search-grid create-form-grid">
              {!blanketOic &&
                (isFederalApplicationPrefill ? (
                  <TextArea
                    className="selected-application-numbers"
                    id="selectedApplicationNumbers"
                    labelText="Selected application numbers"
                    value={selectedApplicationNumbers.join('\n')}
                    rows={Math.min(Math.max(selectedApplicationNumbers.length, 2), 6)}
                    readOnly
                  />
                ) : (
                  <div className="exemption-create-application-field">
                    <div className="exemption-create-application-picker">
                      <ApplicationNumberSelect
                        id="applicationNumber"
                        labelText="Application number (optional)"
                        value={form.applicationNumber}
                        invalid={!!fieldError('applicationNumber')}
                        invalidText={fieldError('applicationNumber')}
                        onBlur={() => markFieldTouched('applicationNumber')}
                        onChange={(value) => {
                          markFormEdited()
                          setForm((current) => ({ ...current, applicationNumber: value }))
                        }}
                      />
                      <Button
                        type="button"
                        kind="tertiary"
                        size="sm"
                        disabled={!form.applicationNumber.trim()}
                        onClick={onAddApplication}
                      >
                        Add application
                      </Button>
                    </div>
                    {selectedApplicationNumbers.length > 0 && (
                      <div className="exemption-create-application-selection">
                        <p>Selected applications</p>
                        <ul
                          className="exemption-create-application-list"
                          aria-label="Selected applications"
                        >
                          {selectedApplicationNumbers.map((applicationNumber) => (
                            <li key={applicationNumber}>
                              <DismissibleTag
                                type="blue"
                                text={applicationNumber}
                                title={`Remove application ${applicationNumber}`}
                                dismissTooltipLabel={`Remove application ${applicationNumber}`}
                                onClose={() => onRemoveApplication(applicationNumber)}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              <SearchableSelect
                id="exemptionTypeCode"
                labelText={requiredLabel('Exemption type')}
                required
                value={form.exemptionTypeCode}
                invalid={!!fieldError('exemptionTypeCode')}
                invalidText={fieldError('exemptionTypeCode')}
                placeholder="Select type"
                options={availableExemptionTypes}
                disabled={!optionsLoaded || optionsUnavailable}
                onBlur={() => markFieldTouched('exemptionTypeCode')}
                onChange={onExemptionTypeChange}
              />
              {oicLike && (
                <TextInput
                  id="exemptionNumber"
                  labelText={requiredLabel('Exemption number')}
                  aria-required="true"
                  maxLength={8}
                  value={form.exemptionNumber}
                  invalid={!!fieldError('exemptionNumber')}
                  invalidText={fieldError('exemptionNumber')}
                  onBlur={() => markFieldTouched('exemptionNumber')}
                  onChange={(event) => {
                    markFormEdited()
                    setForm((current) => ({
                      ...current,
                      exemptionNumber: event.target.value,
                    }))
                  }}
                />
              )}
              <SearchableSelect
                id="exemptionStatusCode"
                labelText={requiredLabel('Exemption status')}
                required
                value={form.exemptionStatusCode}
                invalid={!!fieldError('exemptionStatusCode')}
                invalidText={fieldError('exemptionStatusCode')}
                placeholder="Select status"
                options={exemptionStatuses}
                disabled={
                  !optionsLoaded ||
                  optionsUnavailable ||
                  ['M', 'O', 'B'].includes(normalizedTypeCode)
                }
                onBlur={() => markFieldTouched('exemptionStatusCode')}
                onChange={(value) => {
                  markFormEdited()
                  setForm((current) => ({ ...current, exemptionStatusCode: value }))
                }}
              />
              <IsoDatePicker
                id="approvalDate"
                labelText={requiredLabel('Approval date (YYYY-MM-DD)', oicLike)}
                required={oicLike}
                value={form.approvalDate}
                disabled={normalizedTypeCode === 'M'}
                invalid={!!fieldError('approvalDate')}
                invalidText={fieldError('approvalDate')}
                onBlur={() => markFieldTouched('approvalDate')}
                onChange={(value) => {
                  markFormEdited()
                  setForm((current) => ({ ...current, approvalDate: value }))
                }}
              />
              <IsoDatePicker
                id="expiryDate"
                labelText={requiredLabel(
                  'Expiry date (YYYY-MM-DD)',
                  oicLike || !!form.approvalDate,
                )}
                required={oicLike || !!form.approvalDate}
                value={form.expiryDate}
                invalid={!!fieldError('expiryDate')}
                invalidText={fieldError('expiryDate')}
                onBlur={() => markFieldTouched('expiryDate')}
                onChange={(value) => {
                  markFormEdited()
                  setForm((current) => ({ ...current, expiryDate: value }))
                }}
              />
              <TextInput
                id="approvedVolume"
                labelText={requiredLabel('Approved volume (m³)')}
                aria-required="true"
                value={form.approvedVolume}
                invalid={!!fieldError('approvedVolume')}
                invalidText={fieldError('approvedVolume')}
                onBlur={() => markFieldTouched('approvedVolume')}
                onChange={(event) => {
                  markFormEdited()
                  setForm((current) => ({ ...current, approvedVolume: event.target.value }))
                }}
              />
              {blanketOic && (
                <RegionMultiSelect
                  id="exemptionRegions"
                  titleText={requiredLabel('Regions')}
                  required
                  items={regionOptions}
                  selectedItems={selectedRegions}
                  invalid={!!fieldError('regionNumbers')}
                  invalidText={fieldError('regionNumbers')}
                  disabled={!optionsLoaded || optionsUnavailable}
                  onChange={(selectedItems) => {
                    const regionNumbers = selectedItems.map((item) => item.id)
                    if (formValuesEqual(regionNumbers, form.regionNumbers)) {
                      return
                    }
                    markFormEdited()
                    setForm((current) => ({
                      ...current,
                      regionNumbers,
                    }))
                  }}
                />
              )}
            </div>
            {oicLike && (
              <div className="legacy-search-actions create-form-option-row">
                <Checkbox
                  id="enableExemptionRateOverride"
                  labelText="Enable fee rate override"
                  checked={form.enableRateOverride}
                  onChange={(_, { checked }) => {
                    if (Boolean(checked) === form.enableRateOverride) {
                      return
                    }
                    markFormEdited()
                    setForm((current) => ({
                      ...current,
                      enableRateOverride: Boolean(checked),
                      feeRate: checked ? current.feeRate : '',
                    }))
                  }}
                />
                {form.enableRateOverride && (
                  <TextInput
                    id="exemptionFeeRate"
                    labelText={requiredLabel('Fee rate ($/m³)')}
                    aria-required="true"
                    value={form.feeRate}
                    invalid={!!fieldError('feeRate')}
                    invalidText={fieldError('feeRate')}
                    onBlur={() => markFieldTouched('feeRate')}
                    onChange={(event) => {
                      markFormEdited()
                      setForm((current) => ({ ...current, feeRate: event.target.value }))
                    }}
                  />
                )}
              </div>
            )}
            <div className="legacy-search-actions create-form-comments">
              <TextArea
                id="otherConditions"
                labelText="Conditions"
                enableCounter
                maxCount={250}
                maxLength={250}
                value={form.otherConditions}
                invalid={!!fieldError('otherConditions')}
                invalidText={fieldError('otherConditions')}
                onBlur={() => markFieldTouched('otherConditions')}
                onChange={(event) => {
                  markFormEdited()
                  setForm((current) => ({ ...current, otherConditions: event.target.value }))
                }}
              />
            </div>
          </fieldset>
          <div
            className="legacy-search-actions create-form-actions"
            role="group"
            aria-label="Exemption form actions"
          >
            <Button
              type="button"
              kind="tertiary"
              size="md"
              onClick={() =>
                navigate(isFederalApplicationPrefill ? '/federal' : '/provincial/exemption')
              }
            >
              Cancel
            </Button>
            <Button
              type="button"
              kind="primary"
              size="md"
              onClick={() => void onSave(true)}
              disabled={
                !optionsLoaded ||
                optionsUnavailable ||
                requiredOptionsUnavailable ||
                isSubmitting ||
                !canUseApplicationPrefill ||
                (selectedApplicationNumbers.length > 0 && !hasCurrentPreview)
              }
              renderIcon={isSubmitting ? PendingIcon : undefined}
            >
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Tile>
      </Column>
      <UnsavedChangesGuard
        isDirty={isCreateDraftDirty}
        isBusy={isSubmitting}
        onSave={() => onSave(false)}
        onDiscard={onDiscardCreateDraft}
        subject="this new exemption"
        saveUnavailableReason={
          !optionsLoaded || optionsUnavailable || requiredOptionsUnavailable
            ? 'Authoritative exemption options must load before this exemption can be saved.'
            : !canUseApplicationPrefill
              ? 'Authorization to create this exemption is required before it can be saved.'
              : form.applicationNumber.trim()
                ? 'Add or clear the pending application number before this exemption can be saved.'
                : selectedApplicationNumbers.length > 0 && !hasCurrentPreview
                  ? 'The selected applications must be validated before this exemption can be saved.'
                  : undefined
        }
      />
    </Grid>
  )
}

export default ProvincialExemptionCreatePage
