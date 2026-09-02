const TERM_MONTH_DAYS = 30
const TERM_YEAR_DAYS = 365

const parseWholeNumberOrZero = (value: string): number => {
  const normalized = value.trim()
  if (!normalized || !/^\d+$/.test(normalized)) {
    return 0
  }

  return Number.parseInt(normalized, 10)
}

export const nonNegativeWholeNumberFieldError = (value: string, label = 'Value'): string | null => {
  const normalized = value.trim()
  if (!normalized || /^\d+$/.test(normalized)) {
    return null
  }

  return `${label} must be zero or a positive whole number.`
}

export const calculateApplicationTermDays = (
  days: string,
  months: string,
  years: string,
): string => {
  const totalDays =
    parseWholeNumberOrZero(days) +
    parseWholeNumberOrZero(months) * TERM_MONTH_DAYS +
    parseWholeNumberOrZero(years) * TERM_YEAR_DAYS

  return totalDays > 0 ? String(totalDays) : ''
}
