import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Column, Grid, Loading, TextArea, TextInput, Tile } from '@carbon/react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppNotification } from '../../components/AppNotification'
import ContentLoadingOverlay from '@/components/ContentLoadingOverlay'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import IsoDatePicker from '../../components/IsoDatePicker'
import PageHeader from '@/components/PageHeader'
import SearchableSelect from '../../components/SearchableSelect'
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import type { ProvincialOfferDetail } from '@/interfaces/LexisDetails'
import {
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { displayValue } from '@/pages/shared/detail-page-utils'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
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
} from '@/pages/shared/offer-storage-validation'

type ProvincialOfferDetailField = keyof ProvincialOfferUpdateSubmission & string

type PageStatus = {
  kind: 'success' | 'error'
  title: string
  message: string
}

const YES_NO_OPTIONS = [
  { value: 'Y', label: 'Yes' },
  { value: 'N', label: 'No' },
]

const textValue = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value)

const nullableNumber = (value: string): number | null => {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

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

const mergeOfferFormIntoDetail = (
  detail: ProvincialOfferDetail,
  form: ProvincialOfferUpdateSubmission,
): ProvincialOfferDetail => ({
  ...detail,
  companyName: form.companyName.trim() || null,
  contactName: form.contactName.trim() || null,
  purchaseOfferAmount: nullableNumber(form.purchaseOfferAmount),
  purchaseOfferDate: form.purchaseOfferDate.trim() || null,
  offerWithdrawalDate: form.offerWithdrawalDate.trim() || null,
  teacReviewDate: form.teacReviewDate.trim() || null,
  fairOfferIndicator: form.fairOfferIndicator.trim() || null,
  validOfferIndicator: form.validOfferIndicator.trim() || null,
  approvalIndicator: form.approvalIndicator.trim() || null,
  offerRemark: form.offerRemark.trim() || null,
  withdrawReason: form.withdrawReason.trim() || null,
  offeringClientNumber: form.offeringClientNumber.trim() || null,
  pickupLocation: form.pickupLocation.trim() || null,
  offerCondition: form.offerCondition.trim() || null,
  offerVolume: nullableNumber(form.offerVolume),
  region: form.region.trim() || null,
})

const ProvincialOfferDetailsPage = () => {
  const { offerNumber } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<ProvincialOfferDetail | null>(null)
  const [form, setForm] = useState<ProvincialOfferUpdateSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [status, setStatus] = useState<PageStatus | null>(null)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<ProvincialOfferDetailField>>({})
  const [showAllValidationErrors, setShowAllValidationErrors] = useState(false)
  const beginDetailRequest = useLatestRequestGuard()
  const currentDetail = detail && String(detail.offerNumber) === offerNumber ? detail : null
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
    setStatus(null)
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
    return () => {
      if (offerNumber) {
        void releaseOfferEditLock(offerNumber)
      }
    }
  }, [offerNumber])

  const fieldErrors = useMemo<FieldErrors<ProvincialOfferDetailField>>(
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
      offerVolume:
        offerDecimalStorageFieldError(form?.offerVolume ?? '', OFFER_VOLUME_MAX, 'Offer volume') ??
        undefined,
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
    [form],
  )
  const hasValidationError = Object.values(fieldErrors).some((error) => !!error)

  const markFieldTouched = (field: ProvincialOfferDetailField): void => {
    setTouchedFields((current) => ({ ...current, [field]: true }))
  }

  const fieldError = (field: ProvincialOfferDetailField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showAllValidationErrors)

  const updateFormField = (field: ProvincialOfferDetailField, value: string): void => {
    setForm((current) => (current ? { ...current, [field]: value } : current))
  }

  const onCancelEdit = (): void => {
    if (detail) {
      setForm(buildOfferForm(detail))
    }
    setTouchedFields({})
    setShowAllValidationErrors(false)
    setStatus(null)
    setIsEditing(false)
  }

  const onViewScaleDetail = (): void => {
    const applicationNumber = form?.applicationNumber.trim()
    const packageNumber = form?.packageNumber.trim()
    if (!applicationNumber || !packageNumber) {
      return
    }
    const isFederal = detail?.exportJurisdictionCode?.trim().toUpperCase() === 'F'
    const params = new URLSearchParams(
      isFederal
        ? { packageFilter: packageNumber }
        : { tab: 'items', packageNumber, section: 'scales' },
    )
    const applicationPath = isFederal
      ? `/federal/application/${applicationNumber}`
      : `/provincial/application/${applicationNumber}`
    navigate(`${applicationPath}?${params}`)
  }

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
      })
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
      const result = await submitProvincialOfferUpdate(form)
      if (result.success) {
        const updatedDetail = mergeOfferFormIntoDetail(detail, form)
        setDetail(updatedDetail)
        setForm(buildOfferForm(updatedDetail))
        setTouchedFields({})
        setShowAllValidationErrors(false)
        setIsEditing(false)
        setStatus({
          kind: 'success',
          title: 'Offer saved',
          message: result.message || 'Offer saved successfully.',
        })
        return true
      }

      setStatus({
        kind: 'error',
        title: 'Save failed',
        message:
          result.errors[0] ||
          result.message ||
          'Offer update failed. Please review the form and try again.',
      })
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
        <DetailBreadcrumb label="Provincial offer search" to="/provincial/offers" />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <PageHeader
          title={`Offer ${currentDetail?.offerNumber ?? offerNumber ?? ''}`.trim()}
          subtitle="Check and manage this provincial offer"
          actions={
            !loading && !isEditing && currentDetail && form && canEditAnyOfferField ? (
              <Button kind="tertiary" size="sm" onClick={() => setIsEditing(true)}>
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
          <Loading description="Loading provincial offer detail..." withOverlay={false} />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <AppNotification
            kind="error"
            title="Detail unavailable"
            subtitle={errorMessage}
            lowContrast
            onCloseButtonClick={() => setErrorMessage('')}
          />
        </Column>
      )}

      {!loading && !!status && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
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

      {!loading && currentDetail?.locked && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <AppNotification
            kind="warning"
            title="Offer locked"
            subtitle={
              currentDetail.lockMessage ||
              'This offer is currently locked for editing by another user.'
            }
            lowContrast
          />
        </Column>
      )}

      {detail && currentDetail && form && (
        <Column
          sm={4}
          md={8}
          lg={16}
          className={`content-loading-region${isRefreshingDetail ? ' is-loading' : ''}`}
          inert={isRefreshingDetail ? true : undefined}
          aria-busy={isRefreshingDetail}
        >
          <ContentLoadingOverlay
            loading={isRefreshingDetail}
            loadingDescription="Refreshing provincial offer detail..."
          />
          <Tile className="provincial-offer-create provincial-offer-sections">
            <fieldset className="legacy-form-fieldset offer-form-section">
              <legend>Application details</legend>
              <div className="legacy-search-grid">
                <div className="offer-application-link-field">
                  <span className="cds--label">Application number</span>
                  {applicationDetailPath ? (
                    <Link className="cds--link" to={applicationDetailPath}>
                      {form.applicationNumber}
                    </Link>
                  ) : (
                    <span>{displayValue(form.applicationNumber)}</span>
                  )}
                </div>
                <TextInput
                  id="offerPackageNumber"
                  labelText="Package number"
                  value={form.packageNumber}
                  readOnly
                />
                <TextInput id="offerRegion" labelText="Region" value={form.region} readOnly />
                <TextInput
                  id="offerAdvertisingDate"
                  labelText="Listing date"
                  value={textValue(detail.advertisingDate)}
                  readOnly
                />
                <TextInput
                  id="offerEndDate"
                  labelText="Offer in effect until"
                  value={textValue(detail.offerEndDate)}
                  readOnly
                />
              </div>
              <div className="legacy-search-actions">
                <Button
                  kind="ghost"
                  size="sm"
                  disabled={!form.applicationNumber.trim() || !form.packageNumber.trim()}
                  onClick={onViewScaleDetail}
                >
                  See Scale Detail
                </Button>
              </div>
            </fieldset>

            <fieldset className="legacy-form-fieldset offer-form-section">
              <legend>Offering company details</legend>
              <div className="legacy-search-grid">
                <TextInput
                  id="offerOfferingClientNumber"
                  labelText="Offering client number"
                  value={form.offeringClientNumber}
                  readOnly
                />
                <TextInput
                  id="offerCompanyName"
                  labelText="Company"
                  value={form.companyName}
                  readOnly
                  maxLength={OFFER_COMPANY_NAME_MAX_LENGTH}
                />
                <TextInput
                  id="offerContactName"
                  labelText="Contact name"
                  value={form.contactName}
                  readOnly
                  maxLength={OFFER_CONTACT_NAME_MAX_LENGTH}
                />
              </div>
            </fieldset>

            <fieldset className="legacy-form-fieldset offer-form-section">
              <legend>Offer details</legend>
              <div className="legacy-search-grid">
                <TextInput
                  id="offerPackageVolume"
                  labelText="Application/package volume (m³)"
                  value={textValue(detail.packageVolume)}
                  readOnly
                />
                <TextInput
                  id="offerSpeciesGradeCode"
                  labelText="Species/grade"
                  value={textValue(detail.speciesGradeCode)}
                  readOnly
                />
                <TextInput
                  id="offerVolume"
                  labelText="Offer volume (m³)"
                  value={form.offerVolume}
                  readOnly={!canEditOfferDetailFields}
                  invalid={canEditOfferDetailFields && !!fieldError('offerVolume')}
                  invalidText={fieldError('offerVolume')}
                  onBlur={() => {
                    markFieldTouched('offerVolume')
                    updateFormField('offerVolume', formatLegacyOfferVolume(form.offerVolume))
                  }}
                  onChange={(event) => updateFormField('offerVolume', event.target.value)}
                />
                <TextInput
                  id="offerPurchaseOfferAmount"
                  labelText="Offer amount ($/m³)"
                  value={form.purchaseOfferAmount}
                  readOnly={!canEditOfferDetailFields}
                  invalid={canEditOfferDetailFields && !!fieldError('purchaseOfferAmount')}
                  invalidText={fieldError('purchaseOfferAmount')}
                  onBlur={() => markFieldTouched('purchaseOfferAmount')}
                  onChange={(event) => updateFormField('purchaseOfferAmount', event.target.value)}
                />
                <IsoDatePicker
                  id="offerPurchaseOfferDate"
                  labelText="Offer received date"
                  value={form.purchaseOfferDate}
                  invalid={canEditOfferDetailFields && !!fieldError('purchaseOfferDate')}
                  invalidText={fieldError('purchaseOfferDate')}
                  onBlur={() => markFieldTouched('purchaseOfferDate')}
                  onChange={(value) => updateFormField('purchaseOfferDate', value)}
                  disabled
                />
                <TextArea
                  id="offerPickupLocation"
                  labelText="Pickup location"
                  value={form.pickupLocation}
                  readOnly={!canEditOfferDetailFields}
                  invalid={canEditOfferDetailFields && !!fieldError('pickupLocation')}
                  invalidText={fieldError('pickupLocation')}
                  onBlur={() => markFieldTouched('pickupLocation')}
                  onChange={(event) => updateFormField('pickupLocation', event.target.value)}
                  maxLength={OFFER_PICKUP_LOCATION_MAX_LENGTH}
                />
                <TextArea
                  id="offerCondition"
                  labelText="Offer conditions / remarks"
                  value={form.offerCondition}
                  readOnly={!canEditOfferCondition}
                  invalid={canEditOfferCondition && !!fieldError('offerCondition')}
                  invalidText={fieldError('offerCondition')}
                  onBlur={() => markFieldTouched('offerCondition')}
                  onChange={(event) => updateFormField('offerCondition', event.target.value)}
                  maxLength={OFFER_CONDITION_MAX_LENGTH}
                />
              </div>
            </fieldset>

            <fieldset className="legacy-form-fieldset offer-form-section">
              <legend>Offer withdrawals</legend>
              <div className="legacy-search-grid">
                <IsoDatePicker
                  id="offerWithdrawalDate"
                  labelText="Offer withdrawal date"
                  value={form.offerWithdrawalDate}
                  invalid={canEditWithdrawFields && !!fieldError('offerWithdrawalDate')}
                  invalidText={fieldError('offerWithdrawalDate')}
                  onBlur={() => markFieldTouched('offerWithdrawalDate')}
                  onChange={(value) => updateFormField('offerWithdrawalDate', value)}
                  disabled={!canEditWithdrawFields}
                />
                <TextArea
                  id="offerWithdrawReason"
                  labelText="Offer withdrawal reason"
                  value={form.withdrawReason}
                  readOnly={!canEditWithdrawFields}
                  invalid={canEditWithdrawFields && !!fieldError('withdrawReason')}
                  invalidText={fieldError('withdrawReason')}
                  onBlur={() => markFieldTouched('withdrawReason')}
                  onChange={(event) => updateFormField('withdrawReason', event.target.value)}
                  maxLength={OFFER_WITHDRAW_REASON_MAX_LENGTH}
                />
              </div>
            </fieldset>

            <fieldset className="legacy-form-fieldset offer-form-section">
              <legend>Approval</legend>
              <div className="legacy-search-grid">
                <IsoDatePicker
                  id="offerTeacReviewDate"
                  labelText="TEAC review date"
                  value={form.teacReviewDate}
                  invalid={canEditScheduleFields && !!fieldError('teacReviewDate')}
                  invalidText={fieldError('teacReviewDate')}
                  onBlur={() => markFieldTouched('teacReviewDate')}
                  onChange={(value) => updateFormField('teacReviewDate', value)}
                  disabled={!canEditScheduleFields}
                />
                <SearchableSelect
                  id="offerFairOfferIndicator"
                  labelText="Fair market value"
                  value={form.fairOfferIndicator}
                  placeholder="Select value"
                  options={YES_NO_OPTIONS}
                  disabled={!canEditScheduleFields}
                  onChange={(value) => updateFormField('fairOfferIndicator', value)}
                />
                <SearchableSelect
                  id="offerValidOfferIndicator"
                  labelText="Valid offer"
                  value={form.validOfferIndicator}
                  placeholder="Select value"
                  options={YES_NO_OPTIONS}
                  disabled={!canEditScheduleFields}
                  onChange={(value) => updateFormField('validOfferIndicator', value)}
                />
                <SearchableSelect
                  id="offerApprovalIndicator"
                  labelText="Offer approved"
                  value={form.approvalIndicator}
                  placeholder="Select value"
                  options={YES_NO_OPTIONS}
                  disabled={!canEditScheduleFields}
                  onChange={(value) => updateFormField('approvalIndicator', value)}
                />
                {detail.canEditOfferRemarks && (
                  <TextArea
                    id="offerRemark"
                    labelText="Offer remarks"
                    value={form.offerRemark}
                    readOnly={!canEditOfferRemarkFields}
                    invalid={canEditOfferRemarkFields && !!fieldError('offerRemark')}
                    invalidText={fieldError('offerRemark')}
                    onBlur={() => markFieldTouched('offerRemark')}
                    onChange={(event) => updateFormField('offerRemark', event.target.value)}
                    maxLength={OFFER_REMARK_MAX_LENGTH}
                  />
                )}
              </div>
            </fieldset>

            <div className="legacy-form-footer">
              <dl className="detail-field-grid">
                <div className="detail-field-item">
                  <dt className="detail-field-label">Offer number</dt>
                  <dd className="detail-field-value">{displayValue(detail.offerNumber)}</dd>
                </div>
                <div className="detail-field-item">
                  <dt className="detail-field-label">Author</dt>
                  <dd className="detail-field-value">{displayValue(detail.author)}</dd>
                </div>
                <div className="detail-field-item">
                  <dt className="detail-field-label">Manufacturing facility</dt>
                  <dd className="detail-field-value">
                    {displayValue(detail.manufacturingFacilityInfo)}
                  </dd>
                </div>
                <div className="detail-field-item">
                  <dt className="detail-field-label">Export jurisdiction</dt>
                  <dd className="detail-field-value">
                    {displayValue(detail.exportJurisdictionCode)}
                  </dd>
                </div>
              </dl>
              <div className="legacy-search-actions">
                {isEditing ? (
                  <>
                    <Button
                      kind="primary"
                      size="sm"
                      onClick={() => void onSave()}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      kind="tertiary"
                      size="sm"
                      onClick={onCancelEdit}
                      disabled={isSubmitting}
                    >
                      Cancel
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
        onSave={onSave}
        onDiscard={onCancelEdit}
        subject="this purchase offer"
      />
    </Grid>
  )
}

export default ProvincialOfferDetailsPage
