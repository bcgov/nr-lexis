export const isValidIsoDate = (value: string): boolean => {
  if (!value.trim()) return true
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)
}

export const isPositiveNumeric = (value: string): boolean => {
  if (!value.trim()) return true
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
}

export const normalizeText = (value: string): string => value.trim()

export type FieldErrors<TField extends string> = Partial<Record<TField, string>>

export type TouchedFields<TField extends string> = Partial<Record<TField, boolean>>

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

export const positiveNumericFieldError = (value: string): string | null => {
  return isPositiveNumeric(value) ? null : 'Use a positive numeric value.'
}

export const numericFieldError = (value: string, label = 'Value'): string | null => {
  if (!value.trim()) return null
  return /^\d+(\.\d+)?$/.test(value.trim()) ? null : `${label} must be numeric.`
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
