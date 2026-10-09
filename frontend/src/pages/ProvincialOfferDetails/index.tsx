import {
  RecordField,
  RecordFieldCell,
  RecordFieldGrid,
  RecordFieldRow,
} from '@/pages/shared/RecordFieldGrid'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Loading,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppNotification } from '../../components/AppNotification'
import ContentLoadingOverlay from '@/components/ContentLoadingOverlay'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import DetailLoadError from '@/components/DetailLoadError'
import IsoDatePicker from '../../components/IsoDatePicker'
import OfferScaleDetailAction from '@/components/OfferScaleDetailAction'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import SearchableSelect from '../../components/SearchableSelect'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialOfferDetail } from '@/interfaces/LexisDetails'
import {
  firstValidationError,
  isoDateFieldError,
  requiredFieldError,
} from '@/pages/shared/create-form-utils'
import { displayValue } from '@/pages/shared/detail-page-utils'
import { useEditSections } from '@/pages/shared/useEditSections'
import { hasFieldErrors, useFieldErrors, type FieldErrors } from '@/pages/shared/useFieldErrors'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  locationPath,
  readDetailReturnTo,
  withDetailReturnTo,
} from '@/pages/shared/detail-navigation'
import { fetchProvincialOfferDetail, releaseOfferEditLock } from '@/service/lexis-detail-service'
import {
  submitProvincialOfferUpdate,
  type ProvincialOfferUpdateSubmission,
} from '@/service/create-submit-service'
import {
  OFFER_COMPANY_NAME_MAX_LENGTH,
  OFFER_CONDITION_MAX_LENGTH,
  OFFER_CONTACT_NAME_MAX_LENGTH,
  OFFER_PICKUP_LOCATION_MAX_LENGTH,
  OFFER_REMARK_MAX_LENGTH,
  OFFER_VOLUME_MAX,
  OFFER_WITHDRAW_REASON_MAX_LENGTH,
  PURCHASE_OFFER_AMOUNT_MAX,
  formatLegacyOfferVolume,
  offerDecimalStorageFieldError,
  offerTextStorageFieldError,
  offerVolumeContextFieldError,
} from '@/pages/shared/offer-storage-validation'
import { requiredLabel } from '@/utils/required-label'
import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'

type ProvincialOfferDetailField = keyof ProvincialOfferUpdateSubmission & string

// Server messages that name one offer field.
const offerServerField = (message: string): ProvincialOfferDetailField | undefined => {
  if (message.startsWith('Offer volume ')) return 'offerVolume'
  if (/^(The purchase|Purchase) offer amount /.test(message)) return 'purchaseOfferAmount'
  if (
    message === 'A valid pickup location is required.' ||
    message.startsWith('Pickup location ')
  ) {
    return 'pickupLocation'
  }
  if (
    message === 'A valid withdraw reason is required.' ||
    message.startsWith('Withdraw reason ')
  ) {
    return 'withdrawReason'
  }
  if (message.startsWith('Offer conditions ')) return 'offerCondition'
  if (message.startsWith('Offer remarks ')) return 'offerRemark'
  if (message === 'A valid fair offer indicator is required.') return 'fairOfferIndicator'
  return undefined
}

type PageStatus = {
  kind: 'success' | 'error' | 'warning'
  title: string
  message: string
  placement?: 'inline'
}

type OfferCreationNavigationState = Record<string, unknown> & {
  offerCreationNotice?: {
    warnings: string[]
  }
}

const YES_NO_OPTIONS = [
  { value: 'Y', label: 'Yes' },
  { value: 'N', label: 'No' },
]

const textValue = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value)

const buildOfferForm = (detail: ProvincialOfferDetail): ProvincialOfferUpdateSubmission => ({
  offerNumber: textValue(detail.offerNumber),
  applicationNumber: textValue(detail.applicationNumber),
  packageNumber: textValue(detail.packageNumber),
  offeringClientNumber: textValue(detail.offeringClientNumber),
  companyName: textValue(detail.companyName),
  contactName: textValue(detail.contactName),
  region: textValue(detail.region),
  offerVolume: textValue(detail.offerVolume),
  purchaseOfferAmount: textValue(detail.purchaseOfferAmount),
  purchaseOfferDate: textValue(detail.purchaseOfferDate),
  offerWithdrawalDate: textValue(detail.offerWithdrawalDate),
  withdrawReason: textValue(detail.withdrawReason),
  teacReviewDate: textValue(detail.teacReviewDate),
  fairOfferIndicator: textValue(detail.fairOfferIndicator),
  validOfferIndicator: textValue(detail.validOfferIndicator),
  approvalIndicator: textValue(detail.approvalIndicator),
  offerRemark: textValue(detail.offerRemark),
  pickupLocation: textValue(detail.pickupLocation),
  offerCondition: textValue(detail.offerCondition),
})

const ProvincialOfferDetailsPage = () => {
  const { offerNumber } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { canPerform, defaultRoute } = useAuth()
  const navigationState = location.state as OfferCreationNavigationState | null
  const fallbackReturnTo = canPerform('/offersSearch')
    ? { label: 'Offer search', to: '/provincial/offers' }
    : { label: 'Your landing page', to: defaultRoute }
  const detailReturnTo = readDetailReturnTo(navigationState) ?? fallbackReturnTo
  const creationWarningMessage =
    navigationState?.offerCreationNotice?.warnings
      .map((warning) => warning.trim())
      .filter(Boolean)
      .join(' ') ?? ''
  const preserveStatusOnNextLoadRef = useRef(Boolean(creationWarningMessage))
  const [detail, setDetail] = useState<ProvincialOfferDetail | null>(null)
  const [form, setForm] = useState<ProvincialOfferUpdateSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingSection, setEditingSection] = useState<'offer' | null>(null)
  const isEditing = editingSection === 'offer'
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [status, setStatus] = useState<PageStatus | null>(() =>
    creationWarningMessage
      ? {
          kind: 'warning',
          title: 'Offer saved with warning',
          message: creationWarningMessage,
        }
      : null,
  )
  const { clearFieldError, resetFieldErrors, showFieldErrors, invalidProps } =
    useFieldErrors<ProvincialOfferDetailField>()
  const offerContentRef = useRef<HTMLDivElement>(null)
  const beginDetailRequest = useLatestRequestGuard()
  const currentDetail = detail && String(detail.offerNumber) === offerNumber ? detail : null
  // Pages opened from this one name it by its title in their back link or breadcrumb.
  const offerPageTitle = `Offer ${currentDetail?.offerNumber ?? offerNumber ?? ''}`.trim()
  const applicationNumber = form?.applicationNumber.trim() ?? ''
  const applicationDetailPath = applicationNumber
    ? `${currentDetail?.exportJurisdictionCode?.trim().toUpperCase() === 'F' ? '/federal/application' : '/provincial/application'}/${encodeURIComponent(applicationNumber)}`
    : ''
  const isRefreshingDetail = loading && !!currentDetail
  const offerEditLocked = currentDetail?.locked === true
  const canEditAnyOfferField =
    !!currentDetail &&
    !offerEditLocked &&
    (currentDetail.canEditOfferDetails ||
      currentDetail.canEditWithdrawFields ||
      currentDetail.canEditScheduleDates ||
      currentDetail.canEditOfferRemarks)
  const canEditOfferDetailFields =
    isEditing && !offerEditLocked && !!currentDetail?.canEditOfferDetails
  const canEditWithdrawFields =
    isEditing && !offerEditLocked && !!currentDetail?.canEditWithdrawFields
  const canEditOfferCondition = canEditOfferDetailFields || canEditWithdrawFields
  const canEditScheduleFields =
    isEditing && !offerEditLocked && !!currentDetail?.canEditScheduleDates
  const canEditOfferRemarkFields =
    isEditing && !offerEditLocked && !!currentDetail?.canEditOfferRemarks
  const isOfferDirty = useMemo(
    () =>
      isEditing &&
      !!currentDetail &&
      !!form &&
      !formValuesEqual(form, buildOfferForm(currentDetail)),
    [currentDetail, form, isEditing],
  )

  const loadOfferDetail = useCallback(async () => {
    const isLatestRequest = beginDetailRequest()
    if (!offerNumber) {
      setErrorMessage('Offer number is missing from the route.')
      setDetail(null)
      setForm(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setErrorMessage('')
    if (preserveStatusOnNextLoadRef.current) {
      preserveStatusOnNextLoadRef.current = false
    } else {
      setStatus(null)
    }
    try {
      const response = await fetchProvincialOfferDetail(offerNumber)
      if (!isLatestRequest()) {
        return
      }
      setDetail(response)
      setForm(response ? buildOfferForm(response) : null)
      if (!response) {
        setErrorMessage(`No provincial offer found for ${offerNumber}.`)
      }
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setErrorMessage('Unable to retrieve provincial offer detail.')
      }
    } finally {
      if (isLatestRequest()) {
        setLoading(false)
      }
    }
  }, [beginDetailRequest, offerNumber])

  useEffect(() => {
    void loadOfferDetail()
  }, [loadOfferDetail])

  useEffect(() => {
    if (!creationWarningMessage) {
      return
    }

    const nextNavigationState = { ...(navigationState ?? {}) }
    delete nextNavigationState.offerCreationNotice
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      {
        replace: true,
        state: Object.keys(nextNavigationState).length > 0 ? nextNavigationState : null,
      },
    )
  }, [
    creationWarningMessage,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    navigationState,
  ])

  useEffect(() => {
    return () => {
      if (offerNumber) {
        void releaseOfferEditLock(offerNumber)
      }
    }
  }, [offerNumber])

  const validationErrors = useMemo<FieldErrors<ProvincialOfferDetailField>>(
    () => ({
      offerNumber: requiredFieldError(form?.offerNumber ?? '', 'Offer number') ?? undefined,
      applicationNumber:
        requiredFieldError(form?.applicationNumber ?? '', 'Application number') ?? undefined,
      companyName:
        offerTextStorageFieldError(
          form?.companyName ?? '',
          OFFER_COMPANY_NAME_MAX_LENGTH,
          'Company name',
          true,
        ) ?? undefined,
      contactName:
        offerTextStorageFieldError(
          form?.contactName ?? '',
          OFFER_CONTACT_NAME_MAX_LENGTH,
          'Contact name',
          true,
        ) ?? undefined,
      offerVolume: firstValidationError(
        () =>
          offerDecimalStorageFieldError(
            form?.offerVolume ?? '',
            OFFER_VOLUME_MAX,
            'Offer volume',
            false,
            true,
          ),
        () => {
          const currentVolume = form?.offerVolume ?? ''
          const originalVolume = detail?.offerVolume == null ? '' : String(detail.offerVolume)
          return currentVolume === originalVolume
            ? null
            : offerVolumeContextFieldError(currentVolume, detail?.packageVolume)
        },
      ),
      purchaseOfferAmount:
        offerDecimalStorageFieldError(
          form?.purchaseOfferAmount ?? '',
          PURCHASE_OFFER_AMOUNT_MAX,
          'Offer amount',
          true,
        ) ?? undefined,
      purchaseOfferDate: firstValidationError(
        () => requiredFieldError(form?.purchaseOfferDate ?? '', 'Offer date'),
        () => isoDateFieldError(form?.purchaseOfferDate ?? ''),
      ),
      offerWithdrawalDate: isoDateFieldError(form?.offerWithdrawalDate ?? '') ?? undefined,
      withdrawReason: firstValidationError(
        () =>
          (form?.offerWithdrawalDate ?? '').trim().length > 0
            ? requiredFieldError(form?.withdrawReason ?? '', 'Withdraw reason')
            : null,
        () =>
          offerTextStorageFieldError(
            form?.withdrawReason ?? '',
            OFFER_WITHDRAW_REASON_MAX_LENGTH,
            'Withdraw reason',
          ),
      ),
      teacReviewDate: isoDateFieldError(form?.teacReviewDate ?? '') ?? undefined,
      pickupLocation: firstValidationError(
        () => requiredFieldError(form?.pickupLocation ?? '', 'Pickup location'),
        () =>
          offerTextStorageFieldError(
            form?.pickupLocation ?? '',
            OFFER_PICKUP_LOCATION_MAX_LENGTH,
            'Pickup location',
          ),
      ),
      offerCondition:
        offerTextStorageFieldError(
          form?.offerCondition ?? '',
          OFFER_CONDITION_MAX_LENGTH,
          'Offer conditions / remarks',
        ) ?? undefined,
      offerRemark:
        offerTextStorageFieldError(
          form?.offerRemark ?? '',
          OFFER_REMARK_MAX_LENGTH,
          'Offer remarks',
        ) ?? undefined,
    }),
    [detail, form],
  )

  const isEditableOfferField = (field: ProvincialOfferDetailField): boolean => {
    switch (field) {
      case 'offerVolume':
      case 'purchaseOfferAmount':
      case 'pickupLocation':
        return canEditOfferDetailFields
      case 'offerCondition':
        return canEditOfferCondition
      case 'offerWithdrawalDate':
      case 'withdrawReason':
        return canEditWithdrawFields
      case 'teacReviewDate':
      case 'fairOfferIndicator':
        return canEditScheduleFields
      case 'offerRemark':
        return canEditOfferRemarkFields
      default:
        return false
    }
  }

  /** Splits errors into the ones shown on editable fields and the first one that is not. */
  const splitOfferErrors = (
    errors: Array<[string, string | null | undefined]>,
  ): { fieldErrors: FieldErrors<ProvincialOfferDetailField>; otherError?: string } => {
    const fieldErrors: FieldErrors<ProvincialOfferDetailField> = {}
    let otherError: string | undefined
    for (const [field, error] of errors) {
      if (!error) continue
      if (field && isEditableOfferField(field as ProvincialOfferDetailField)) {
        fieldErrors[field as ProvincialOfferDetailField] ??= error
      } else {
        otherError ??= error
      }
    }
    return { fieldErrors, otherError }
  }

  const updateFormField = (field: ProvincialOfferDetailField, value: string): void => {
    setForm((current) => (current ? { ...current, [field]: value } : current))
    clearFieldError(field)
  }

  const discardOfferChanges = (): void => {
    if (detail) {
      setForm(buildOfferForm(detail))
    }
    resetFieldErrors()
    setStatus(null)
  }

  const sections = useEditSections<'offer'>({
    isDirty: isOfferDirty,
    onDiscard: discardOfferChanges,
    state: [editingSection, setEditingSection],
  })

  const onSave = async (): Promise<boolean> => {
    if (!form || !detail || isSubmitting) {
      return false
    }

    if (offerEditLocked) {
      setStatus({
        kind: 'error',
        title: 'Offer locked',
        message:
          detail.lockMessage || 'This offer is currently locked for editing by another user.',
        placement: 'inline',
      })
      return false
    }

    if (!canEditAnyOfferField) return false
    if (!isOfferDirty) {
      discardOfferChanges()
      sections.finishEditing()
      return true
    }

    const { fieldErrors, otherError } = splitOfferErrors(Object.entries(validationErrors))
    const fieldsValid = showFieldErrors(fieldErrors, () => offerContentRef.current)
    if (otherError) {
      setStatus({
        kind: 'error',
        title: 'Validation error',
        message: otherError,
        placement: 'inline',
      })
    }
    if (!fieldsValid || otherError) {
      return false
    }

    setStatus(null)
    setIsSubmitting(true)
    try {
      const result = await submitProvincialOfferUpdate(form)
      if (result.success) {
        const warningMessage = result.warnings
          .map((warning) => warning.trim())
          .filter(Boolean)
          .join(' ')
        resetFieldErrors()
        sections.finishEditing()
        setStatus({
          kind: warningMessage ? 'warning' : 'success',
          title: warningMessage ? 'Offer saved with warning' : 'Offer saved',
          message: warningMessage || result.message || 'Offer saved successfully.',
        })
        preserveStatusOnNextLoadRef.current = true
        setDetail(null)
        setForm(null)
        await loadOfferDetail()
        return true
      }

      const { fieldErrors: serverFieldErrors, otherError: serverError } = splitOfferErrors(
        result.errors.map((message) => [offerServerField(message) ?? '', message]),
      )
      showFieldErrors(serverFieldErrors, () => offerContentRef.current)
      if (serverError || !hasFieldErrors(serverFieldErrors)) {
        setStatus({
          kind: 'error',
          title: 'Save failed',
          message:
            serverError ||
            result.message ||
            'Offer update failed. Please review the form and try again.',
        })
      }
      return false
    } catch (error) {
      console.error(error)
      setStatus({
        kind: 'error',
        title: 'Save failed',
        message: 'Offer update failed. Please review the form and try again.',
      })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Grid fullWidth className="default-grid detail-page-grid">
      <Column sm={4} md={8} lg={16}>
        <DetailBreadcrumb
          label={fallbackReturnTo.label}
          to={fallbackReturnTo.to}
          returnTo={detailReturnTo}
        />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <PageHeader
          title={offerPageTitle}
          subtitle="Check and manage this provincial offer"
          actions={
            !loading && !isEditing && currentDetail && form && canEditAnyOfferField ? (
              <Button
                ref={sections.editButtonRef('offer')}
                kind="tertiary"
                size="md"
                onClick={() => sections.startEditing('offer')}
              >
                Edit
              </Button>
            ) : undefined
          }
        />
      </Column>

      {loading && !currentDetail && (
        <Column
          sm={4}
          md={8}
          lg={16}
          className="detail-page-loading"
          role="status"
          aria-live="polite"
        >
          <Loading description="Loading provincial offer detail…" withOverlay={false} />
        </Column>
      )}

      {!loading && !!errorMessage && <DetailLoadError message={errorMessage} />}

      {!loading && !!status && status.placement !== 'inline' && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <AppNotification
            kind={status.kind}
            title={status.title}
            subtitle={status.message}
            lowContrast
            onCloseButtonClick={() => setStatus(null)}
          />
        </Column>
      )}

      {!loading && currentDetail?.locked && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <InlineNotification
            className="detail-context-notification"
            kind="warning"
            title="Offer locked"
            subtitle={
              currentDetail.lockMessage ||
              'This offer is currently locked for editing by another user.'
            }
            lowContrast
            hideCloseButton
          />
        </Column>
      )}

      {detail && currentDetail && form && (
        <Column
          ref={offerContentRef}
          sm={4}
          md={8}
          lg={16}
          className={`content-loading-region${isRefreshingDetail ? ' is-loading' : ''}`}
          inert={isRefreshingDetail ? true : undefined}
          aria-busy={isRefreshingDetail}
        >
          <ContentLoadingOverlay
            loading={isRefreshingDetail}
            loadingDescription="Refreshing provincial offer detail…"
          />
          {status?.placement === 'inline' && (
            <AppNotification
              className="detail-context-notification"
              kind="error"
              revealKey={status}
              title={status.title}
              subtitle={status.message}
              lowContrast
              onCloseButtonClick={() => setStatus(null)}
            />
          )}
          <Tile
            ref={sections.sectionRef('offer')}
            className="provincial-offer-create provincial-offer-sections"
          >
            {isEditing && <RequiredFieldsLegend />}
            <fieldset className="legacy-form-fieldset offer-form-section">
              <legend>Application details</legend>
              <RecordFieldGrid editing>
                <RecordFieldRow>
                  <RecordFieldCell>
                    <div className="offer-application-link-field">
                      <span className="cds--label">Application number</span>
                      {applicationDetailPath ? (
                        <Link
                          className="cds--link"
                          to={applicationDetailPath}
                          state={withDetailReturnTo(
                            navigationState,
                            {
                              label: offerPageTitle,
                              to: locationPath(location),
                            },
                            detailReturnTo,
                          )}
                        >
                          {form.applicationNumber}
                        </Link>
                      ) : (
                        <span>{displayValue(form.applicationNumber)}</span>
                      )}
                    </div>
                  </RecordFieldCell>
                  <RecordFieldCell>
                    <TextInput
                      id="offerPackageNumber"
                      labelText="Package number"
                      value={form.packageNumber}
                      readOnly
                    />
                  </RecordFieldCell>
                  <RecordFieldCell span="wide">
                    <TextInput id="offerRegion" labelText="Region" value={form.region} readOnly />
                  </RecordFieldCell>
                </RecordFieldRow>
                <RecordFieldRow>
                  <RecordFieldCell>
                    <TextInput
                      id="offerAdvertisingDate"
                      labelText="Listing date"
                      value={textValue(detail.advertisingDate)}
                      readOnly
                    />
                  </RecordFieldCell>
                  <RecordFieldCell>
                    <TextInput
                      id="offerEndDate"
                      labelText="Offer in effect until"
                      value={textValue(detail.offerEndDate)}
                      readOnly
                    />
                  </RecordFieldCell>
                </RecordFieldRow>
              </RecordFieldGrid>
              <div className="legacy-search-actions">
                <OfferScaleDetailAction
                  target={{ offerNumber: String(currentDetail.offerNumber) }}
                  disabled={!currentDetail.packageNumber?.trim()}
                />
              </div>
            </fieldset>

            <fieldset className="legacy-form-fieldset offer-form-section">
              <legend>Offering company details</legend>
              <RecordFieldGrid editing>
                <RecordFieldRow>
                  <RecordFieldCell>
                    <TextInput
                      id="offerOfferingClientNumber"
                      labelText="Offering client number"
                      value={form.offeringClientNumber}
                      readOnly
                    />
                  </RecordFieldCell>
                  <RecordFieldCell>
                    <TextInput
                      id="offerCompanyName"
                      labelText={requiredLabel('Company')}
                      aria-required="true"
                      value={form.companyName}
                      readOnly
                      maxLength={OFFER_COMPANY_NAME_MAX_LENGTH}
                    />
                  </RecordFieldCell>
                  <RecordFieldCell>
                    <TextInput
                      id="offerContactName"
                      labelText={requiredLabel('Contact name')}
                      aria-required="true"
                      value={form.contactName}
                      readOnly
                      maxLength={OFFER_CONTACT_NAME_MAX_LENGTH}
                    />
                  </RecordFieldCell>
                </RecordFieldRow>
              </RecordFieldGrid>
            </fieldset>

            <fieldset className="legacy-form-fieldset offer-form-section">
              <legend>Offer details</legend>
              <RecordFieldGrid editing>
                <RecordFieldRow>
                  <RecordFieldCell>
                    <TextInput
                      id="offerPackageVolume"
                      labelText="Application/package volume (m³)"
                      value={textValue(detail.packageVolume)}
                      readOnly
                    />
                  </RecordFieldCell>
                  <RecordFieldCell>
                    <TextInput
                      id="offerSpeciesGradeCode"
                      labelText="Species/grade"
                      value={textValue(detail.speciesGradeCode)}
                      readOnly
                    />
                  </RecordFieldCell>
                  <RecordFieldCell>
                    <TextInput
                      id="offerVolume"
                      labelText="Offer volume (m³)"
                      value={form.offerVolume}
                      readOnly={!canEditOfferDetailFields}
                      {...invalidProps('offerVolume')}
                      onBlur={() => {
                        const originalVolume =
                          detail.offerVolume == null ? '' : String(detail.offerVolume)
                        if (
                          form.offerVolume !== originalVolume &&
                          !offerVolumeContextFieldError(form.offerVolume, detail.packageVolume)
                        ) {
                          updateFormField('offerVolume', formatLegacyOfferVolume(form.offerVolume))
                        }
                      }}
                      onChange={(event) => updateFormField('offerVolume', event.target.value)}
                    />
                  </RecordFieldCell>
                  <RecordFieldCell>
                    <TextInput
                      id="offerPurchaseOfferAmount"
                      labelText={requiredLabel('Offer amount ($/m³)')}
                      aria-required="true"
                      value={form.purchaseOfferAmount}
                      readOnly={!canEditOfferDetailFields}
                      {...invalidProps('purchaseOfferAmount')}
                      onChange={(event) =>
                        updateFormField('purchaseOfferAmount', event.target.value)
                      }
                    />
                  </RecordFieldCell>
                </RecordFieldRow>
                <RecordFieldRow>
                  <RecordFieldCell>
                    <IsoDatePicker
                      id="offerPurchaseOfferDate"
                      labelText={requiredLabel('Offer received date')}
                      required
                      value={form.purchaseOfferDate}
                      disabled
                      {...invalidProps('purchaseOfferDate')}
                      onChange={(value) => updateFormField('purchaseOfferDate', value)}
                    />
                  </RecordFieldCell>
                  <RecordFieldCell>
                    <TextArea
                      id="offerPickupLocation"
                      labelText={requiredLabel('Pickup location')}
                      aria-required="true"
                      value={form.pickupLocation}
                      readOnly={!canEditOfferDetailFields}
                      maxLength={OFFER_PICKUP_LOCATION_MAX_LENGTH}
                      {...invalidProps('pickupLocation')}
                      onChange={(event) => updateFormField('pickupLocation', event.target.value)}
                    />
                  </RecordFieldCell>
                </RecordFieldRow>
                <RecordFieldRow>
                  <RecordFieldCell span="full">
                    <TextArea
                      id="offerCondition"
                      labelText="Offer conditions / remarks"
                      value={form.offerCondition}
                      readOnly={!canEditOfferCondition}
                      maxLength={OFFER_CONDITION_MAX_LENGTH}
                      {...invalidProps('offerCondition')}
                      onChange={(event) => updateFormField('offerCondition', event.target.value)}
                    />
                  </RecordFieldCell>
                </RecordFieldRow>
              </RecordFieldGrid>
            </fieldset>

            <fieldset className="legacy-form-fieldset offer-form-section">
              <legend>Offer withdrawals</legend>
              <RecordFieldGrid editing>
                <RecordFieldRow>
                  <RecordFieldCell>
                    <IsoDatePicker
                      id="offerWithdrawalDate"
                      labelText="Offer withdrawal date"
                      value={form.offerWithdrawalDate}
                      disabled={!canEditWithdrawFields}
                      {...invalidProps('offerWithdrawalDate')}
                      onChange={(value) => updateFormField('offerWithdrawalDate', value)}
                    />
                  </RecordFieldCell>
                </RecordFieldRow>
                <RecordFieldRow>
                  <RecordFieldCell span="full">
                    <TextArea
                      id="offerWithdrawReason"
                      labelText={requiredLabel(
                        'Offer withdrawal reason',
                        form.offerWithdrawalDate.trim().length > 0,
                      )}
                      aria-required={
                        form.offerWithdrawalDate.trim().length > 0 ? 'true' : undefined
                      }
                      value={form.withdrawReason}
                      readOnly={!canEditWithdrawFields}
                      maxLength={OFFER_WITHDRAW_REASON_MAX_LENGTH}
                      {...invalidProps('withdrawReason')}
                      onChange={(event) => updateFormField('withdrawReason', event.target.value)}
                    />
                  </RecordFieldCell>
                </RecordFieldRow>
              </RecordFieldGrid>
            </fieldset>

            <fieldset className="legacy-form-fieldset offer-form-section">
              <legend>Approval</legend>
              <RecordFieldGrid editing>
                <RecordFieldRow>
                  {detail.canEditScheduleDates && (
                    <RecordFieldCell>
                      <IsoDatePicker
                        id="offerTeacReviewDate"
                        labelText="TEAC review date"
                        value={form.teacReviewDate}
                        disabled={!canEditScheduleFields}
                        {...invalidProps('teacReviewDate')}
                        onChange={(value) => updateFormField('teacReviewDate', value)}
                      />
                    </RecordFieldCell>
                  )}
                  <RecordFieldCell>
                    <SearchableSelect
                      id="offerFairOfferIndicator"
                      labelText="Fair market value"
                      value={form.fairOfferIndicator}
                      placeholder="Select value"
                      options={YES_NO_OPTIONS}
                      disabled={!canEditScheduleFields}
                      {...invalidProps('fairOfferIndicator')}
                      onChange={(value) => updateFormField('fairOfferIndicator', value)}
                    />
                  </RecordFieldCell>
                  <RecordFieldCell>
                    <SearchableSelect
                      id="offerValidOfferIndicator"
                      labelText="Valid offer"
                      value={form.validOfferIndicator}
                      placeholder="Select value"
                      options={YES_NO_OPTIONS}
                      disabled={!canEditScheduleFields}
                      onChange={(value) => updateFormField('validOfferIndicator', value)}
                    />
                  </RecordFieldCell>
                  <RecordFieldCell>
                    <SearchableSelect
                      id="offerApprovalIndicator"
                      labelText="Offer approved"
                      value={form.approvalIndicator}
                      placeholder="Select value"
                      options={YES_NO_OPTIONS}
                      disabled={!canEditScheduleFields}
                      onChange={(value) => updateFormField('approvalIndicator', value)}
                    />
                  </RecordFieldCell>
                </RecordFieldRow>
                <RecordFieldRow>
                  {detail.canEditOfferRemarks && (
                    <RecordFieldCell span="full">
                      <TextArea
                        id="offerRemark"
                        labelText="Offer remarks"
                        value={form.offerRemark}
                        readOnly={!canEditOfferRemarkFields}
                        maxLength={OFFER_REMARK_MAX_LENGTH}
                        {...invalidProps('offerRemark')}
                        onChange={(event) => updateFormField('offerRemark', event.target.value)}
                      />
                    </RecordFieldCell>
                  )}
                </RecordFieldRow>
              </RecordFieldGrid>
            </fieldset>

            <div className="legacy-form-footer">
              <RecordFieldGrid>
                <RecordFieldRow>
                  <RecordField label="Offer number" value={displayValue(detail.offerNumber)} />
                  <RecordField label="Author" value={displayValue(detail.author)} />
                  <RecordField
                    label="Manufacturing facility"
                    value={displayValue(detail.manufacturingFacilityInfo)}
                  />
                  <RecordField
                    label="Export jurisdiction"
                    value={displayValue(detail.exportJurisdictionCode)}
                  />
                </RecordFieldRow>
              </RecordFieldGrid>
              <div className="legacy-search-actions">
                {isEditing ? (
                  <>
                    <Button
                      kind="tertiary"
                      size="md"
                      onClick={sections.cancelEditing}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      kind="primary"
                      size="md"
                      onClick={() => void onSave()}
                      disabled={isSubmitting}
                      renderIcon={isSubmitting ? PendingIcon : undefined}
                    >
                      {isSubmitting ? 'Saving…' : 'Save'}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </Tile>
        </Column>
      )}
      <UnsavedChangesGuard
        isDirty={isOfferDirty}
        isBusy={isSubmitting}
        onDiscard={() => {
          discardOfferChanges()
          setEditingSection(null)
        }}
        subject="this purchase offer"
      />
      {sections.discardModal}
    </Grid>
  )
}

export default ProvincialOfferDetailsPage
