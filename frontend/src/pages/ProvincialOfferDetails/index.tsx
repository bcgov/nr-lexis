import {
  RecordField,
  RecordFieldCell,
  RecordFieldGrid,
  RecordFieldRow,
} from '@/pages/shared/RecordFieldGrid'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DataDefinition, Edit, Enterprise, Result, Stamp, Undo } from '@carbon/icons-react'
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Loading,
  RadioButton,
  RadioButtonGroup,
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
import UnsavedChangesGuard, { formValuesEqual } from '@/components/UnsavedChangesGuard'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialOfferDetail } from '@/interfaces/LexisDetails'
import {
  firstValidationError,
  isoDateFieldError,
  requiredFieldError,
} from '@/pages/shared/create-form-utils'
import { displayValue } from '@/pages/shared/detail-page-utils'
import OfferFormSection from '@/pages/shared/OfferFormSection'
import { offerSaveNotice, type OfferSaveNotice } from '@/pages/shared/offer-save-notice'
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
import { formatBusinessIsoDate } from '@/utils/date'
import { displayNumericDate, displayValueText } from '@/utils/display-value'
import { requiredLabel } from '@/utils/required-label'
import { displayVolume, formatVolumeInput } from '@/utils/volume'
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
  if (message.startsWith('Offer withdrawn date ')) return 'offerWithdrawalDate'
  if (message.startsWith('Offer conditions ')) return 'offerCondition'
  if (message.startsWith('Offer remarks ')) return 'offerRemark'
  if (message === 'A valid fair offer indicator is required.') return 'fairOfferIndicator'
  return undefined
}

const OFFER_NOT_SAVED_TITLE = 'Offer not saved.'
const FIELD_ERRORS_MESSAGE = 'Some fields have errors. Correct them and save again.'

type EditError = {
  title: string
  message: string
}

type OfferCreationNavigationState = Record<string, unknown> & {
  offerCreationNotice?: OfferSaveNotice
}

const creationNoticeFrom = (state: OfferCreationNavigationState | null): OfferSaveNotice | null => {
  const notice = state?.offerCreationNotice
  return notice &&
    (notice.kind === 'success' || notice.kind === 'warning') &&
    typeof notice.title === 'string' &&
    typeof notice.message === 'string'
    ? notice
    : null
}

const YES_NO_OPTIONS = [
  { value: 'Y', label: 'Yes' },
  { value: 'N', label: 'No' },
]

const yesNoLabel = (value: string): string | undefined =>
  YES_NO_OPTIONS.find((option) => option.value === value)?.label

const textValue = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value)

const OFFER_AMOUNT_FORMAT = new Intl.NumberFormat('en-CA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** An offer amount in dollars per cubic metre, always with two decimals (10.00). */
const displayOfferAmount = (value: string): ReactNode => {
  const amount = Number(value.trim())
  return value.trim() && Number.isFinite(amount)
    ? OFFER_AMOUNT_FORMAT.format(amount)
    : displayValue(value)
}

const buildOfferForm = (detail: ProvincialOfferDetail): ProvincialOfferUpdateSubmission => ({
  offerNumber: textValue(detail.offerNumber),
  applicationNumber: textValue(detail.applicationNumber),
  packageNumber: textValue(detail.packageNumber),
  offeringClientNumber: textValue(detail.offeringClientNumber),
  companyName: textValue(detail.companyName),
  contactName: textValue(detail.contactName),
  region: textValue(detail.region),
  offerVolume: formatVolumeInput(detail.offerVolume),
  purchaseOfferAmount:
    detail.purchaseOfferAmount === null ? '' : detail.purchaseOfferAmount.toFixed(2),
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
  const creationNotice = creationNoticeFrom(navigationState)
  // A new offer opens from Create offer, which no back link returns to.
  const [openedAfterCreate] = useState(() => !!creationNotice)
  const [detail, setDetail] = useState<ProvincialOfferDetail | null>(null)
  const [form, setForm] = useState<ProvincialOfferUpdateSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingSection, setEditingSection] = useState<'offer' | null>(null)
  const isEditing = editingSection === 'offer'
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  // A save result stays until it is closed, Edit offer opens the form again or the next save
  // replaces it, and belongs to its offer.
  const [savedOfferNotice, setSavedOfferNotice] = useState<{
    offerNumber: string | undefined
    notice: OfferSaveNotice
  } | null>(() => (creationNotice ? { offerNumber, notice: creationNotice } : null))
  const saveNotice =
    savedOfferNotice && savedOfferNotice.offerNumber === offerNumber
      ? savedOfferNotice.notice
      : null
  const [editError, setEditError] = useState<EditError | null>(null)
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
  // Only Administrators and Application Approvers edit the schedule dates; an offering client
  // withdraws on the day it saves the withdrawal, until the application's withdrawal deadline.
  const isOfferingClientEdit = !!currentDetail && !currentDetail.canEditScheduleDates
  const withdrawalDeadlinePassed =
    canEditOfferDetailFields &&
    isOfferingClientEdit &&
    !currentDetail?.canEditWithdrawFields &&
    !currentDetail?.offerWithdrawalDate
  const isOfferDirty = useMemo(
    () =>
      isEditing &&
      !!currentDetail &&
      !!form &&
      !formValuesEqual(form, buildOfferForm(currentDetail)),
    [currentDetail, form, isEditing],
  )
  // Edit mode shows every date as YYYY-MM-DD, as its date inputs do; view mode shows them in words.
  const dateValue = (value: string | null | undefined): ReactNode =>
    isEditing ? displayNumericDate(value) : displayValue(value)

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
    setEditError(null)
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
    if (!navigationState?.offerCreationNotice) {
      return
    }

    const nextNavigationState = { ...navigationState }
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
  }, [location.hash, location.pathname, location.search, navigate, navigationState])

  useEffect(() => {
    return () => {
      if (offerNumber) {
        void releaseOfferEditLock(offerNumber)
      }
    }
  }, [offerNumber])

  const validationErrors = useMemo<FieldErrors<ProvincialOfferDetailField>>(() => {
    // The server keeps up to 254 characters, so text saved before the screen's 250 limit still
    // saves unchanged; only a changed value has to fit.
    const changedText = (
      field: 'pickupLocation' | 'offerCondition' | 'offerRemark' | 'withdrawReason',
    ): boolean => (form?.[field] ?? '') !== textValue(detail?.[field])
    return {
      offerNumber: requiredFieldError(form?.offerNumber ?? '', 'Offer number') ?? undefined,
      applicationNumber:
        requiredFieldError(form?.applicationNumber ?? '', 'Application number') ?? undefined,
      companyName:
        offerTextStorageFieldError(
          form?.companyName ?? '',
          OFFER_COMPANY_NAME_MAX_LENGTH,
          'Company',
          true,
          textValue(detail?.companyName),
        ) ?? undefined,
      contactName:
        offerTextStorageFieldError(
          form?.contactName ?? '',
          OFFER_CONTACT_NAME_MAX_LENGTH,
          'Contact name',
          true,
          textValue(detail?.contactName),
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
          const originalVolume = detail ? formatVolumeInput(detail.offerVolume) : ''
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
        () => requiredFieldError(form?.purchaseOfferDate ?? '', 'Offer received date'),
        () => isoDateFieldError(form?.purchaseOfferDate ?? ''),
      ),
      offerWithdrawalDate: firstValidationError(
        () => isoDateFieldError(form?.offerWithdrawalDate ?? ''),
        () =>
          isOfferingClientEdit &&
          !!form?.offerWithdrawalDate.trim() &&
          form.offerWithdrawalDate !== textValue(detail?.offerWithdrawalDate) &&
          form.offerWithdrawalDate !== formatBusinessIsoDate()
            ? "Offer withdrawal date must be today's date."
            : null,
      ),
      withdrawReason: firstValidationError(
        () =>
          (form?.offerWithdrawalDate ?? '').trim().length > 0 &&
          !(form?.withdrawReason ?? '').trim()
            ? 'Offer withdrawal reason is required when there is an offer withdrawal date.'
            : null,
        () =>
          changedText('withdrawReason')
            ? offerTextStorageFieldError(
                form?.withdrawReason ?? '',
                OFFER_WITHDRAW_REASON_MAX_LENGTH,
                'Offer withdrawal reason',
                false,
                textValue(detail?.withdrawReason),
              )
            : null,
      ),
      teacReviewDate: isoDateFieldError(form?.teacReviewDate ?? '') ?? undefined,
      pickupLocation: firstValidationError(
        () => requiredFieldError(form?.pickupLocation ?? '', 'Pickup location'),
        () =>
          changedText('pickupLocation')
            ? offerTextStorageFieldError(
                form?.pickupLocation ?? '',
                OFFER_PICKUP_LOCATION_MAX_LENGTH,
                'Pickup location',
                false,
                textValue(detail?.pickupLocation),
              )
            : null,
      ),
      offerCondition: changedText('offerCondition')
        ? (offerTextStorageFieldError(
            form?.offerCondition ?? '',
            OFFER_CONDITION_MAX_LENGTH,
            'Offer conditions/remarks',
            false,
            textValue(detail?.offerCondition),
          ) ?? undefined)
        : undefined,
      offerRemark: changedText('offerRemark')
        ? (offerTextStorageFieldError(
            form?.offerRemark ?? '',
            OFFER_REMARK_MAX_LENGTH,
            'Offer remarks',
            false,
            textValue(detail?.offerRemark),
          ) ?? undefined)
        : undefined,
    }
  }, [detail, form, isOfferingClientEdit])

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
    setEditError(null)
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
      setEditError({
        title: OFFER_NOT_SAVED_TITLE,
        message:
          detail.lockMessage || 'This offer is currently locked for editing by another user.',
      })
      return false
    }

    if (!canEditAnyOfferField) return false
    if (!isOfferDirty) {
      discardOfferChanges()
      sections.finishEditing()
      return true
    }

    setSavedOfferNotice(null)
    const { fieldErrors, otherError } = splitOfferErrors(Object.entries(validationErrors))
    const fieldsValid = showFieldErrors(fieldErrors, () => offerContentRef.current)
    if (!fieldsValid || otherError) {
      setEditError({
        title: OFFER_NOT_SAVED_TITLE,
        message: otherError ?? FIELD_ERRORS_MESSAGE,
      })
      return false
    }

    setEditError(null)
    setIsSubmitting(true)
    try {
      const result = await submitProvincialOfferUpdate(form)
      if (result.success) {
        const withdrawalAdded =
          !detail.offerWithdrawalDate && form.offerWithdrawalDate.trim().length > 0
        resetFieldErrors()
        sections.finishEditing()
        setSavedOfferNotice({ offerNumber, notice: offerSaveNotice(result, withdrawalAdded) })
        setDetail(null)
        setForm(null)
        await loadOfferDetail()
        return true
      }

      const { fieldErrors: serverFieldErrors, otherError: serverError } = splitOfferErrors(
        result.errors.map((message) => [offerServerField(message) ?? '', message]),
      )
      showFieldErrors(serverFieldErrors, () => offerContentRef.current)
      setEditError({
        title: OFFER_NOT_SAVED_TITLE,
        message:
          serverError ||
          (hasFieldErrors(serverFieldErrors)
            ? FIELD_ERRORS_MESSAGE
            : result.message || 'Offer update failed. Please review the form and try again.'),
      })
      return false
    } catch (error) {
      console.error(error)
      setEditError({
        title: OFFER_NOT_SAVED_TITLE,
        message: 'Offer update failed. Please review the form and try again.',
      })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const yesNoField = (
    field: 'fairOfferIndicator' | 'validOfferIndicator' | 'approvalIndicator',
    id: string,
    label: string,
  ) => (
    <RecordField
      label={label}
      value={yesNoLabel(form?.[field] ?? '')}
      edit={
        canEditScheduleFields && form ? (
          <RadioButtonGroup
            legendText={label}
            name={id}
            orientation="horizontal"
            valueSelected={form[field]}
            {...invalidProps(field)}
            onChange={(value) => updateFormField(field, String(value))}
          >
            {YES_NO_OPTIONS.map((option) => (
              <RadioButton
                key={option.value}
                id={`${id}-${option.value}`}
                value={option.value}
                labelText={option.label}
              />
            ))}
          </RadioButtonGroup>
        ) : undefined
      }
    />
  )

  return (
    <Grid fullWidth className="default-grid detail-page-grid provincial-offer-detail-page">
      {!openedAfterCreate && (
        <Column sm={4} md={8} lg={16}>
          <DetailBreadcrumb
            label={fallbackReturnTo.label}
            to={fallbackReturnTo.to}
            returnTo={detailReturnTo}
          />
        </Column>
      )}
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <PageHeader
          title={offerPageTitle}
          focusTitle="whenFocusLost"
          subtitle={currentDetail ? `Author: ${displayValueText(currentDetail.author)}` : undefined}
          actionsLabel="Offer actions"
          actions={
            !loading && !isEditing && currentDetail && form && canEditAnyOfferField ? (
              <Button
                ref={sections.editButtonRef('offer')}
                kind="tertiary"
                size="md"
                renderIcon={Edit}
                onClick={() =>
                  sections.startEditing('offer', () => {
                    // A new edit replaces the notice from the last save.
                    setSavedOfferNotice(null)
                  })
                }
              >
                Edit offer
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

      {!loading && !!saveNotice && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <AppNotification
            kind={saveNotice.kind}
            role={saveNotice.kind === 'warning' ? 'alert' : 'status'}
            title={saveNotice.title}
            subtitle={saveNotice.message}
            revealKey={saveNotice}
            lowContrast
            onCloseButtonClick={() => setSavedOfferNotice(null)}
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
          <Tile ref={sections.sectionRef('offer')} className="create-form-tile offer-form-card">
            <OfferFormSection icon={Result} title="Application details">
              {isEditing && <RequiredFieldsLegend />}
              <RecordFieldGrid editing={isEditing}>
                <RecordFieldRow>
                  <RecordField
                    label="Application number"
                    value={
                      applicationDetailPath ? (
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
                        displayValue(form.applicationNumber)
                      )
                    }
                  />
                  <RecordField
                    label="Package number"
                    value={
                      currentDetail.packageNumber?.trim()
                        ? currentDetail.packageNumber
                        : 'No packages'
                    }
                  />
                  <RecordFieldCell
                    hidden={!currentDetail.packageNumber?.trim()}
                    className="offer-scale-detail-cell"
                  >
                    <OfferScaleDetailAction
                      target={{ offerNumber: String(currentDetail.offerNumber) }}
                    />
                  </RecordFieldCell>
                </RecordFieldRow>
              </RecordFieldGrid>
            </OfferFormSection>

            <OfferFormSection icon={Enterprise} title="Offering company details">
              <RecordFieldGrid editing={isEditing}>
                <RecordFieldRow>
                  <RecordField label="Company" value={form.companyName} />
                  <RecordField label="Contact name" value={form.contactName} />
                </RecordFieldRow>
              </RecordFieldGrid>
            </OfferFormSection>

            <OfferFormSection icon={DataDefinition} title="Offer details">
              <RecordFieldGrid editing={isEditing}>
                <RecordFieldRow>
                  <RecordField
                    label="Application/package volume (m³)"
                    value={displayVolume(detail.packageVolume)}
                  />
                  <RecordField
                    label="Offer volume (m³)"
                    value={displayVolume(form.offerVolume)}
                    edit={
                      canEditOfferDetailFields ? (
                        <TextInput
                          id="offerVolume"
                          labelText="Offer volume (m³)"
                          value={form.offerVolume}
                          {...invalidProps('offerVolume')}
                          onBlur={() => {
                            const originalVolume = formatVolumeInput(detail.offerVolume)
                            if (
                              form.offerVolume !== originalVolume &&
                              !offerVolumeContextFieldError(form.offerVolume, detail.packageVolume)
                            ) {
                              updateFormField(
                                'offerVolume',
                                formatLegacyOfferVolume(form.offerVolume),
                              )
                            }
                          }}
                          onChange={(event) => updateFormField('offerVolume', event.target.value)}
                        />
                      ) : undefined
                    }
                  />
                  <RecordField label="Species/grade" value={detail.speciesGradeCode} />
                  <RecordField
                    label="Offer amount ($/m³)"
                    value={displayOfferAmount(form.purchaseOfferAmount)}
                    edit={
                      canEditOfferDetailFields ? (
                        <TextInput
                          id="offerPurchaseOfferAmount"
                          labelText={requiredLabel('Offer amount ($/m³)')}
                          aria-required="true"
                          value={form.purchaseOfferAmount}
                          {...invalidProps('purchaseOfferAmount')}
                          onChange={(event) =>
                            updateFormField('purchaseOfferAmount', event.target.value)
                          }
                        />
                      ) : undefined
                    }
                  />
                </RecordFieldRow>
                <RecordFieldRow>
                  <RecordField label="List date" value={dateValue(detail.advertisingDate)} />
                  <RecordField
                    label="Offer received date"
                    value={dateValue(form.purchaseOfferDate)}
                  />
                  <RecordField
                    label="Offer in effect until"
                    value={dateValue(detail.offerEndDate)}
                  />
                </RecordFieldRow>
                <RecordFieldRow>
                  <RecordField
                    label="Pickup location"
                    span="wide"
                    value={form.pickupLocation}
                    edit={
                      canEditOfferDetailFields ? (
                        <TextArea
                          id="offerPickupLocation"
                          labelText={requiredLabel('Pickup location')}
                          aria-required="true"
                          enableCounter
                          maxCount={OFFER_PICKUP_LOCATION_MAX_LENGTH}
                          maxLength={OFFER_PICKUP_LOCATION_MAX_LENGTH}
                          value={form.pickupLocation}
                          {...invalidProps('pickupLocation')}
                          onChange={(event) =>
                            updateFormField('pickupLocation', event.target.value)
                          }
                        />
                      ) : undefined
                    }
                  />
                </RecordFieldRow>
                <RecordFieldRow>
                  <RecordField
                    label="Offer conditions/remarks"
                    span="wide"
                    value={form.offerCondition}
                    edit={
                      canEditOfferCondition ? (
                        <TextArea
                          id="offerCondition"
                          labelText="Offer conditions/remarks"
                          enableCounter
                          maxCount={OFFER_CONDITION_MAX_LENGTH}
                          maxLength={OFFER_CONDITION_MAX_LENGTH}
                          value={form.offerCondition}
                          {...invalidProps('offerCondition')}
                          onChange={(event) =>
                            updateFormField('offerCondition', event.target.value)
                          }
                        />
                      ) : undefined
                    }
                  />
                </RecordFieldRow>
              </RecordFieldGrid>
            </OfferFormSection>

            <OfferFormSection icon={Undo} title="Offer withdrawals">
              {withdrawalDeadlinePassed && (
                <p className="detail-read-only-note">
                  The withdrawal deadline for this offer has passed. To withdraw it, contact your
                  regional export office.
                </p>
              )}
              <RecordFieldGrid editing={isEditing}>
                <RecordFieldRow>
                  <RecordField
                    label="Offer withdrawal date"
                    value={dateValue(form.offerWithdrawalDate)}
                    edit={
                      canEditWithdrawFields || withdrawalDeadlinePassed ? (
                        <IsoDatePicker
                          id="offerWithdrawalDate"
                          labelText="Offer withdrawal date"
                          value={form.offerWithdrawalDate}
                          readOnly={withdrawalDeadlinePassed}
                          {...invalidProps('offerWithdrawalDate')}
                          onChange={(value) => updateFormField('offerWithdrawalDate', value)}
                        />
                      ) : undefined
                    }
                  />
                </RecordFieldRow>
                <RecordFieldRow>
                  <RecordField
                    label="Offer withdrawal reason"
                    span="wide"
                    value={form.withdrawReason}
                    edit={
                      canEditWithdrawFields || withdrawalDeadlinePassed ? (
                        <TextArea
                          id="offerWithdrawReason"
                          labelText={requiredLabel(
                            'Offer withdrawal reason',
                            form.offerWithdrawalDate.trim().length > 0,
                          )}
                          aria-required={
                            form.offerWithdrawalDate.trim().length > 0 ? 'true' : undefined
                          }
                          enableCounter
                          maxCount={OFFER_WITHDRAW_REASON_MAX_LENGTH}
                          maxLength={OFFER_WITHDRAW_REASON_MAX_LENGTH}
                          readOnly={withdrawalDeadlinePassed}
                          value={form.withdrawReason}
                          {...invalidProps('withdrawReason')}
                          onChange={(event) =>
                            updateFormField('withdrawReason', event.target.value)
                          }
                        />
                      ) : undefined
                    }
                  />
                </RecordFieldRow>
              </RecordFieldGrid>
            </OfferFormSection>

            <OfferFormSection icon={Stamp} title="Approval">
              <RecordFieldGrid editing={isEditing}>
                <RecordFieldRow>
                  <RecordField
                    label="TEAC review date"
                    hidden={!detail.canEditScheduleDates}
                    value={dateValue(form.teacReviewDate)}
                    edit={
                      canEditScheduleFields ? (
                        <IsoDatePicker
                          id="offerTeacReviewDate"
                          labelText="TEAC review date"
                          value={form.teacReviewDate}
                          {...invalidProps('teacReviewDate')}
                          onChange={(value) => updateFormField('teacReviewDate', value)}
                        />
                      ) : undefined
                    }
                  />
                  {yesNoField('fairOfferIndicator', 'offerFairOfferIndicator', 'Fair market value')}
                  {yesNoField('validOfferIndicator', 'offerValidOfferIndicator', 'Valid offer')}
                  {yesNoField('approvalIndicator', 'offerApprovalIndicator', 'Offer approved')}
                </RecordFieldRow>
                <RecordFieldRow hidden={!detail.canEditOfferRemarks}>
                  <RecordField
                    label="Offer remarks"
                    span="wide"
                    value={form.offerRemark}
                    edit={
                      canEditOfferRemarkFields ? (
                        <TextArea
                          id="offerRemark"
                          labelText="Offer remarks"
                          enableCounter
                          maxCount={OFFER_REMARK_MAX_LENGTH}
                          maxLength={OFFER_REMARK_MAX_LENGTH}
                          value={form.offerRemark}
                          {...invalidProps('offerRemark')}
                          onChange={(event) => updateFormField('offerRemark', event.target.value)}
                        />
                      ) : undefined
                    }
                  />
                </RecordFieldRow>
              </RecordFieldGrid>
            </OfferFormSection>

            {isEditing && !!editError && (
              <AppNotification
                kind="error"
                revealKey={editError}
                title={editError.title}
                subtitle={editError.message}
                lowContrast
                onCloseButtonClick={() => setEditError(null)}
              />
            )}
            {isEditing && (
              <div className="legacy-search-actions">
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
                  {isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            )}
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
