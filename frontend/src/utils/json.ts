export const parseJsonValue = (
  value: string | null,
  onError?: (error: unknown) => void,
): unknown | null => {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as unknown
  } catch (error) {
    onError?.(error)
    return null
  }
}
