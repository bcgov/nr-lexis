export const nonNegativeWholeNumberFieldError = (value: string, label = 'Value'): string | null => {
  const normalized = value.trim()
  if (!normalized || /^\d+$/.test(normalized)) {
    return null
  }

  return `${label} must be zero or a positive whole number.`
}
