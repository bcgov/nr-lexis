export const normalizeFilterText = (value: string): string => value.trim().toLowerCase()

export const normalizeTrimmedText = (value: string): string => value.trim()

export const normalizeUpperText = (value: string): string => value.trim().toUpperCase()

export const joinNonBlankText = (values: string[], separator: string): string =>
  values.filter((value) => value.trim().length > 0).join(separator)

export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
