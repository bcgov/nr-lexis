const DEFAULT_TECHNICAL_ERROR_MESSAGE =
  'Something went wrong. Please try again. If the problem persists, contact your administrator.'

const TECHNICAL_ERROR_PATTERNS = [
  /\bHTTP\s*\d{3}\b/i,
  /\bstatus(?:Code)?["':\s]*\d{3}\b/i,
  /\bInternal Server Error\b/i,
  /\bBad Gateway\b/i,
  /\bGateway Timeout\b/i,
  /\bService Unavailable\b/i,
  /\b(?:SQLException|NullPointerException|IllegalStateException|RuntimeException|Exception)\b/i,
  /\bORA-\d{5}\b/i,
  /\b(?:trace|stacktrace|stack trace)\b/i,
  /"timestamp"\s*:/i,
  /"path"\s*:/i,
  /"error"\s*:/i,
  /\/(?:api|lexis)\//i,
]

export const isTechnicalErrorText = (value: string): boolean => {
  const normalized = value.trim()
  if (!normalized) {
    return false
  }

  if (
    (normalized.startsWith('{') && normalized.endsWith('}')) ||
    (normalized.startsWith('[') && normalized.endsWith(']'))
  ) {
    return true
  }

  return TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))
}

export const sanitizeNotificationText = (
  value: string,
  fallbackMessage = DEFAULT_TECHNICAL_ERROR_MESSAGE,
): string => {
  const normalized = value.trim()
  if (!normalized) {
    return ''
  }

  return isTechnicalErrorText(normalized) ? fallbackMessage : normalized
}

export const sanitizeNotificationTextList = (
  values: string[],
  fallbackMessage = DEFAULT_TECHNICAL_ERROR_MESSAGE,
): string[] => {
  const sanitized = values
    .map((value) => sanitizeNotificationText(value, fallbackMessage))
    .filter((value) => value.length > 0)

  return [...new Set(sanitized)]
}

export const genericActionFailureMessage = DEFAULT_TECHNICAL_ERROR_MESSAGE
