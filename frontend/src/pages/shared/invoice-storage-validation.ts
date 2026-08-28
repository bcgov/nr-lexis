import {
  firstValidationError,
  maxNumericValueFieldError,
  requiredMaxLengthFieldError,
  requiredPositiveNumericFieldError,
} from '@/pages/shared/create-form-utils'

export const INVOICE_NUMBER_MAX_LENGTH = 9
export const INVOICE_AMOUNT_MAX = 9_999_999.99
export const INVOICE_AMOUNT_DECIMAL_PLACES = 2
export const INVOICE_CONVERSION_RATE_MAX = 9.99999
export const INVOICE_CONVERSION_RATE_DECIMAL_PLACES = 5

const PRINTABLE_US_ASCII_PATTERN = /^[\x20-\x7e]*$/

export const invoiceNumberStorageFieldError = (value: string): string | undefined =>
  firstValidationError(
    () => requiredMaxLengthFieldError(value, INVOICE_NUMBER_MAX_LENGTH, 'Invoice number'),
    () =>
      PRINTABLE_US_ASCII_PATTERN.test(value.trim())
        ? null
        : 'Invoice number must use US-ASCII characters.',
  )

export const invoiceDecimalStorageFieldError = (
  value: string,
  label: string,
  maximumValue: number,
  maximumDecimalPlaces: number,
): string | undefined =>
  firstValidationError(
    () => requiredPositiveNumericFieldError(value, label),
    () => maxNumericValueFieldError(value, maximumValue, label),
    () => {
      const normalized = value.trim()
      if (!/^\d+(\.\d+)?$/.test(normalized)) return null
      const decimalPlaces = normalized.split('.')[1]?.length ?? 0
      return decimalPlaces <= maximumDecimalPlaces
        ? null
        : `${label} must have no more than ${maximumDecimalPlaces} decimal places.`
    },
  )
