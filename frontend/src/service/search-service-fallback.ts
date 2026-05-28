export const toSearchServiceError = (message: string, error: unknown): Error => {
  if (error instanceof Error) {
    return error
  }
  return new Error(message)
}
