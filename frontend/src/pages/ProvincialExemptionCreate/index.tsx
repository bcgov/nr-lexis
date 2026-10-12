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
import DetailDocumentUploadPanel from '../../components/uploads/DetailDocumentUploadPanel'
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
import { submitProvincialExemptionCreate } from '@/service/create-submit-service'
import { requiredLabel } from '@/utils/required-label'
import { displayAuditIdentity, displayValue } from '@/utils/text'
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

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
  placement?: 'inline'
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
  const author = displayAuditIdentity(capabilities?.principal)
  // M, O, and B creation uses a system-selected initial status, so it is a payload invariant,
  // not a required user input.
  const canEditInitialExemptionStatus =
    optionsLoaded && !optionsUnavailable && !['M', 'O', 'B'].includes(normalizedTypeCode)
  const availableExemptionTypes = useMemo(
    () =>
      exemptionTypes.filter((option) => option.value.toUpperCase() !== 'B' || canCreateBlanketOic),
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

  const fieldError = (field: ProvincialExemptionCreateField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, {}, showAllValidationErrors)

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
        approvalDate: typeCode === 'M' ? '' : current.approvalDate,
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

      setStatus({
        kind: 'error',
        title: 'Save failed',
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
        title: 'Save failed',
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
    setFormEdited(false)
    setShowAllValidationErrors(false)
    setStatus(null)
  }

  const isCreateDraftDirty = formEdited && !formValuesEqual(form, draftBaselineRef.current)

  return (
    <Grid fullWidth className="default-grid create-page-grid provincial-exemption-create-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader
          title="Create new exemption"
          subtitle="Enter exemption details and save a new exemption."
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
          title={showApplications ? 'Applications, documents and permits' : 'Documents and permits'}
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
                          <SearchableSelect
                            id="exemptionStatusCode"
                            labelText={requiredLabel(
                              'Exemption status',
                              canEditInitialExemptionStatus,
                            )}
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
                                setForm((current) => ({
                                  ...current,
                                  exemptionNumber: event.target.value,
                                }))
                              }}
                            />
                          </RecordFieldCell>
                        )}
                      </RecordFieldRow>
                      <RecordFieldRow>
                        <RecordFieldCell>
                          <IsoDatePicker
                            id="approvalDate"
                            labelText={requiredLabel('Approval date (YYYY-MM-DD)', oicLike)}
                            required={oicLike}
                            value={form.approvalDate}
                            disabled={normalizedTypeCode === 'M'}
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
                            labelText={requiredLabel(
                              'Expiry date (YYYY-MM-DD)',
                              oicLike || !!form.approvalDate,
                            )}
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
                <TabPanel key="applications" className="application-detail-tab-panel">
                  <Tile
                    className="create-form-tile application-detail-section"
                    role="region"
                    aria-label="Applications"
                  >
                    <p className="detail-empty-message">
                      Applications can be added after you save the exemption.
                    </p>
                  </Tile>
                </TabPanel>
              ),
              <TabPanel key="documents" className="application-detail-tab-panel">
                <Tile
                  className="create-form-tile application-detail-section"
                  role="region"
                  aria-label="Documents"
                >
                  <p className="detail-empty-message">
                    Save the exemption before uploading documents.
                  </p>
                  <DetailDocumentUploadPanel
                    workflowType="exemption"
                    targetNumber=""
                    inputId="exemptionCreateDocumentUpload"
                    disabled
                    disabledReason="Save the exemption before uploading documents."
                  />
                </Tile>
              </TabPanel>,
              <TabPanel key="permits" className="application-detail-tab-panel">
                <Tile
                  className="create-form-tile application-detail-section"
                  role="region"
                  aria-label="Permits"
                >
                  <p className="detail-empty-message">
                    Save the exemption before adding or viewing permits.
                  </p>
                </Tile>
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
                      <RadioButtonGroup
                        legendText="Override fee rate?"
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
                      {form.enableRateOverride && (
                        <TextInput
                          id="exemptionFeeRate"
                          labelText={requiredLabel('Fee rate ($/m³)')}
                          aria-required="true"
                          value={form.feeRate}
                          invalid={!!fieldError('feeRate')}
                          invalidText={fieldError('feeRate')}
                          onChange={(event) => {
                            markFormEdited()
                            setForm((current) => ({ ...current, feeRate: event.target.value }))
                          }}
                        />
                      )}
                    </fieldset>
                  </Tile>
                </TabPanel>
              ),
            ].filter(Boolean)}
          </TabPanels>
        </Tabs>
        <div className="legacy-form-footer">
          <RecordFieldGrid>
            <RecordFieldRow>
              <RecordField label="Exemption number" value={displayValue(form.exemptionNumber)} />
              <RecordField
                label="Status"
                value={displayValue(
                  exemptionStatuses.find((option) => option.value === form.exemptionStatusCode)
                    ?.label ?? form.exemptionStatusCode,
                )}
              />
              <RecordField label="Author" value={author} />
            </RecordFieldRow>
          </RecordFieldGrid>
        </div>
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
