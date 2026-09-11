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

export const displayTableValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return '—'
  }
  return String(value)
}

// Display padding explicitly without changing the exact package key used in requests.
export const formatPackageNumberLabel = (packageNumber: string): string => {
  const leadingSpaces = packageNumber.length - packageNumber.trimStart().length
  const trailingSpaces = packageNumber.length - packageNumber.trimEnd().length
  const padding: string[] = []
  if (leadingSpaces > 0) {
    padding.push(`${leadingSpaces} leading space${leadingSpaces === 1 ? '' : 's'}`)
  }
  if (trailingSpaces > 0) {
    padding.push(`${trailingSpaces} trailing space${trailingSpaces === 1 ? '' : 's'}`)
  }
  return padding.length > 0 ? `${packageNumber.trim()} (${padding.join(', ')})` : packageNumber
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const displayAuditIdentity = (value: string | null | undefined): string => {
  const normalized = value?.trim()
  if (!normalized) {
    return 'Not provided'
  }

  const separatorIndex = normalized.lastIndexOf('\\')
  const identity = separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized
  if (!UUID_PATTERN.test(identity)) {
    return normalized
  }

  const provider = separatorIndex >= 0 ? normalized.slice(0, separatorIndex).trim() : ''
  return provider ? `${provider} user` : 'Not available'
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
