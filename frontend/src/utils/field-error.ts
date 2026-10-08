/**
 * Text for an error shown under a field. A one-sentence message drops its closing period so the
 * field reads as a phrase. A message with more than one sentence (a ". ", "? " or "! " before
 * the end) keeps it, as does a closing ellipsis. Anything other than a string passes through
 * unchanged.
 */
export const fieldErrorText = <T>(message: T): T =>
  typeof message === 'string' &&
  message.endsWith('.') &&
  !message.endsWith('..') &&
  !/[.?!]\s/.test(message)
    ? (message.slice(0, -1) as T)
    : message

/** fieldErrorText for each error in a set of field errors. */
export const fieldErrorTexts = <E extends Partial<Record<string, string | null | undefined>>>(
  errors: E,
): E =>
  Object.fromEntries(
    Object.entries(errors).map(([field, message]) => [field, fieldErrorText(message)]),
  ) as E
