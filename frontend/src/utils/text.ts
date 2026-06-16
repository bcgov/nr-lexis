export const normalizeFilterText = (value: string): string => value.trim().toLowerCase()

export const joinNonBlankText = (values: string[], separator: string): string =>
  values.filter((value) => value.trim().length > 0).join(separator)
