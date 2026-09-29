import { isRecord } from './record'

export const getResponseStatus = (error: unknown): number | undefined => {
  if (!isRecord(error) || !isRecord(error.response)) {
    return undefined
  }

  const { status } = error.response
  return typeof status === 'number' ? status : undefined
}

/**
 * True only when the server rejected the request (4xx). A 5xx can come from a proxy after the
 * server committed the work, so it leaves the outcome as unknown as a lost response does.
 */
export const isClientErrorResponse = (error: unknown): boolean => {
  const status = getResponseStatus(error)
  return status !== undefined && status >= 400 && status < 500
}

export const getResponseMessage = (error: unknown): string | undefined => {
  if (!isRecord(error) || !isRecord(error.response) || !isRecord(error.response.data)) {
    return undefined
  }

  const { message } = error.response.data
  return typeof message === 'string' && message.trim() ? message.trim() : undefined
}
