import { isRecord } from './record'

export const getResponseStatus = (error: unknown): number | undefined => {
  if (!isRecord(error) || !isRecord(error.response)) {
    return undefined
  }

  const { status } = error.response
  return typeof status === 'number' ? status : undefined
}

export const getResponseMessage = (error: unknown): string | undefined => {
  if (!isRecord(error) || !isRecord(error.response) || !isRecord(error.response.data)) {
    return undefined
  }

  const { message } = error.response.data
  return typeof message === 'string' && message.trim() ? message.trim() : undefined
}
