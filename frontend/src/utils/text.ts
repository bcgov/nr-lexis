export const normalizeFilterText = (value: string): string => value.trim().toLowerCase()

export const normalizeTrimmedText = (value: string): string => value.trim()

export const normalizeUpperText = (value: string): string => value.trim().toUpperCase()

export const joinNonBlankText = (values: string[], separator: string): string =>
  values.filter((value) => value.trim().length > 0).join(separator)

export const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

export const ownerClientLabel = (clientNumber: string | null | undefined): string =>
  clientNumber ? `Owner ${clientNumber}` : ''

export const regionLabel = (region: string | null | undefined): string =>
  region ? `Region ${region}` : ''

export const searchResultOptionLabel = ({
  primary,
  status,
  ownerClientNumber,
  region,
  date,
}: {
  primary: string
  status: string
  ownerClientNumber: string
  region: string
  date: string
}): string =>
  joinNonBlankText(
    [primary, status, ownerClientLabel(ownerClientNumber), regionLabel(region), date],
    ' - ',
  )

export const leadingDigits = (value: string): string => value.match(/^\d+/)?.[0] ?? ''

export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
