export const LEGACY_FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded'

export type LegacyFormPayload = Record<string, string | undefined>

export const toUrlEncodedParams = (payload: LegacyFormPayload): URLSearchParams => {
  const params = new URLSearchParams()

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value.trim().length > 0) {
      params.append(key, value)
    }
  })

  return params
}
