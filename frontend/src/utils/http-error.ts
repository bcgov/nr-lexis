import { isRecord } from './record'

export const getResponseStatus = (error: unknown): number | undefined => {
  if (!isRecord(error) || !isRecord(error.response)) {
    return undefined
  }

  const { status } = error.response
  return typeof status === 'number' ? status : undefined
}
