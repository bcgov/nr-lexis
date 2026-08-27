export const isValidIsoDate = (value: string): boolean => {
  if (!value.trim()) return true
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year === 0) return false

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]
}

export const hasInvalidIsoDateValue = (...values: string[]): boolean =>
  values.some((value) => !isValidIsoDate(value))

const isPositiveNumeric = (value: string): boolean => {
  if (!value.trim()) return true
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
}

const NON_NEGATIVE_DECIMAL_PATTERN = /^\d+(\.\d+)?$/

const normalizeText = (value: string): string => value.trim()

export type FieldErrors<TField extends string> = Partial<Record<TField, string>>

export type TouchedFields<TField extends string> = Partial<Record<TField, boolean>>

type CreateSubmitMessageSource = {
  message?: string
  errors?: string[]
  warnings?: string[]
}

export const joinCreateSubmitMessages = ({
  message = '',
  errors = [],
  warnings = [],
}: CreateSubmitMessageSource): string =>
  [message, ...errors, ...warnings].filter((value) => normalizeText(value).length > 0).join(' ')

export const firstValidationError = (
  ...validators: Array<() => string | null>
): string | undefined => {
  for (const validator of validators) {
    const error = validator()
    if (error) {
      return error
    }
  }

  return undefined
}

export const requiredFieldError = (value: string, label = 'This field'): string | null => {
  return normalizeText(value) ? null : `${label} is required.`
}

export const maxLengthFieldError = (
  value: string,
  maxLength: number,
  label = 'This field',
): string | null => {
  const unit = maxLength === 1 ? 'character' : 'characters'
  return normalizeText(value).length <= maxLength
    ? null
    : `${label} must be ${maxLength} ${unit} or fewer.`
}

export const requiredMaxLengthFieldError = (
  value: string,
  maxLength: number,
  label = 'This field',
  requiredLabel = label,
): string | null =>
  firstValidationError(
    () => requiredFieldError(value, requiredLabel),
    () => maxLengthFieldError(value, maxLength, label),
  ) ?? null

export const positiveNumericFieldError = (value: string): string | null => {
  return isPositiveNumeric(value) ? null : 'Use a positive numeric value.'
}

export const maxNumericValueFieldError = (
  value: string,
  maxValue: number,
  label = 'Value',
): string | null => {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed <= maxValue
    ? null
    : `${label} must be ${maxValue} or less.`
}

export const atMostOneDecimalFieldError = (value: string, label = 'Value'): string | null => {
  if (!value.trim()) return null
  return /^\d+(\.\d)?$/.test(value.trim())
    ? null
    : `${label} must have no more than one decimal place.`
}

export const atMostTwoDecimalFieldError = (value: string, label = 'Value'): string | null => {
  if (!value.trim()) return null
  return /^\d+(\.\d{1,2})?$/.test(value.trim())
    ? null
    : `${label} must have no more than two decimal places.`
}

export const numericFieldError = (value: string, label = 'Value'): string | null => {
  if (!value.trim()) return null
  return NON_NEGATIVE_DECIMAL_PATTERN.test(value.trim()) ? null : `${label} must be numeric.`
}

export const requiredNumericFieldError = (value: string, label = 'Value'): string | null =>
  firstValidationError(
    () => requiredFieldError(value, label),
    () => numericFieldError(value, label),
  ) ?? null

export const requiredPositiveNumericFieldError = (value: string, label = 'Value'): string | null =>
  firstValidationError(
    () => requiredFieldError(value, label),
    () => numericFieldError(value, label),
    () => positiveNumericFieldError(value),
  ) ?? null

export const parseNonNegativeDecimalFieldValue = (value: string): number | null => {
  const normalizedValue = value.trim()
  if (!normalizedValue || !NON_NEGATIVE_DECIMAL_PATTERN.test(normalizedValue)) {
    return null
  }

  const parsed = Number(normalizedValue)
  return Number.isFinite(parsed) ? parsed : null
}

export const integerFieldError = (value: string, label = 'Value'): string | null => {
  if (!value.trim() || !/^\d+$/.test(value.trim())) {
    return `${label} must be a whole number.`
  }

  return null
}

export const greaterThanFieldError = (
  value: string,
  label: string,
  minimum: number,
): string | null => {
  const parsed = parseNonNegativeDecimalFieldValue(value)
  if (parsed === null) {
    return null
  }

  return parsed > minimum ? null : `${label} must be greater than ${minimum}.`
}

export const greaterThanOrEqualFieldError = (
  value: string,
  label: string,
  minimum: number,
): string | null => {
  const parsed = parseNonNegativeDecimalFieldValue(value)
  if (parsed === null) {
    return null
  }

  return parsed >= minimum ? null : `${label} must be greater than or equal to ${minimum}.`
}

export const lessThanOrEqualFieldError = (
  value: string,
  label: string,
  maximum: number,
): string | null => {
  const parsed = parseNonNegativeDecimalFieldValue(value)
  if (parsed === null) {
    return null
  }

  return parsed <= maximum ? null : `${label} must be ${maximum} or less.`
}

export const isoDateFieldError = (value: string): string | null => {
  return isValidIsoDate(value) ? null : 'Date must be YYYY-MM-DD.'
}

export const getVisibleFieldError = <TField extends string>(
  field: TField,
  fieldErrors: FieldErrors<TField>,
  touchedFields: TouchedFields<TField>,
  showAllErrors: boolean,
): string | undefined => {
  if (!showAllErrors && !touchedFields[field]) {
    return undefined
  }

  return fieldErrors[field]
}
