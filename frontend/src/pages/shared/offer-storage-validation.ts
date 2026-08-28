import {
  firstValidationError,
  maxLengthFieldError,
  requiredFieldError,
} from '@/pages/shared/create-form-utils'

export const OFFER_COMPANY_NAME_MAX_LENGTH = 52
export const OFFER_CONTACT_NAME_MAX_LENGTH = 120
export const OFFER_REMARK_MAX_LENGTH = 254
export const OFFER_WITHDRAW_REASON_MAX_LENGTH = 254
export const OFFER_PICKUP_LOCATION_MAX_LENGTH = 250
export const OFFER_CONDITION_MAX_LENGTH = 254
export const PURCHASE_OFFER_AMOUNT_MAX = 99_999.99
export const OFFER_VOLUME_MAX = 9_999_999.99

const ORACLE_SCALE_TWO_DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/
const ASCII_PATTERN = /^[\u0000-\u007f]*$/

export const formatLegacyOfferVolume = (value: string): string => {
  const normalized = value.trim()
  if (!ORACLE_SCALE_TWO_DECIMAL_PATTERN.test(normalized)) {
    return value
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed.toFixed(1) : value
}

export const offerVolumeContextFieldError = (
  offerVolume: string,
  contextVolume: string | number | null | undefined,
): string | null => {
  const normalizedOfferVolume = offerVolume.trim()
  if (!ORACLE_SCALE_TWO_DECIMAL_PATTERN.test(normalizedOfferVolume)) return null
  const normalizedContextVolume = String(contextVolume ?? '').trim()
  if (!normalizedContextVolume) return null

  const parsedOfferVolume = Number(normalizedOfferVolume)
  const parsedContextVolume = Number(normalizedContextVolume)
  if (!Number.isFinite(parsedOfferVolume) || !Number.isFinite(parsedContextVolume)) return null

  return parsedOfferVolume > parsedContextVolume
    ? 'Offer volume cannot exceed the application/package volume.'
    : null
}

export const offerTextStorageFieldError = (
  value: string,
  maximumLength: number,
  label: string,
  required = false,
): string | null =>
  firstValidationError(
    () => (required ? requiredFieldError(value, label) : null),
    () =>
      ASCII_PATTERN.test(value.trim()) ? null : `${label} must contain ASCII characters only.`,
    () => maxLengthFieldError(value, maximumLength, label),
  ) ?? null

export const offerDecimalStorageFieldError = (
  value: string,
  maximumValue: number,
  label: string,
  required = false,
): string | null => {
  const normalized = value.trim()
  if (!normalized) {
    return required ? `${label} is required.` : null
  }
  if (!ORACLE_SCALE_TWO_DECIMAL_PATTERN.test(normalized)) {
    return `${label} must be a number with up to two decimal places.`
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 'Use a positive numeric value.'
  }
  return parsed <= maximumValue ? null : `${label} must be ${maximumValue} or less.`
}
