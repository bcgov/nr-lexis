import {
  firstValidationError,
  requiredMaxLengthFieldError,
  requiredPositiveNumericFieldError,
} from '@/pages/shared/create-form-utils'

export const INVOICE_NUMBER_MAX_LENGTH = 9
export const INVOICE_AMOUNT_MAX = 9_999_999.99
export const INVOICE_AMOUNT_DECIMAL_PLACES = 2
export const INVOICE_CONVERSION_RATE_MAX = 9.99999
export const INVOICE_CONVERSION_RATE_DECIMAL_PLACES = 5

const PRINTABLE_US_ASCII_PATTERN = /^[\x20-\x7e]*$/

const exceedsRoundedMaximum = (
  value: string,
  maximumValue: number,
  decimalPlaces: number,
): boolean => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (!match) return Number(value) > maximumValue

  const factor = 10n ** BigInt(decimalPlaces)
  const fraction = (match[2] ?? '').padEnd(decimalPlaces + 1, '0')
  let roundedValue = BigInt(match[1]) * factor
  roundedValue += BigInt(fraction.slice(0, decimalPlaces) || '0')
  if (fraction[decimalPlaces] >= '5') roundedValue += 1n

  const maximumScaled = BigInt(Math.round(maximumValue * 10 ** decimalPlaces))
  return roundedValue > maximumScaled
}

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
    () => {
      return exceedsRoundedMaximum(value, maximumValue, maximumDecimalPlaces)
        ? `${label} must round to ${maximumValue} or less.`
        : null
    },
  )
