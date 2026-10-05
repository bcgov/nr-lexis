export type ActionResultKind = 'error' | 'success' | 'warning'

/** One record in a multi-record outcome, shown as a list item that starts with its identifier. */
export type ActionResultItem = {
  id: string
  /** Follows the identifier, including its leading separator (" to …" or ": …"). */
  text: string
  /** Links the identifier; omit it inside a dialog or for the page's own record. */
  to?: string
  state?: unknown
  /** Separate points about this record, listed under it. */
  details?: string[]
}

/** The latest action outcome owned by one page, form, or dialog. */
export type ActionResult = {
  kind: ActionResultKind
  message: string
  title?: string
  items?: ActionResultItem[]
}

const DEFAULT_ACTION_RESULT_TITLES: Record<ActionResultKind, string> = {
  error: 'Action failed',
  success: 'Action completed',
  warning: 'Action needs attention',
}

export const actionResultTitle = (result: ActionResult): string =>
  result.title ?? DEFAULT_ACTION_RESULT_TITLES[result.kind]

/** A result as one line of text, for a place that can't list its records. */
export const actionResultText = ({ message, items = [] }: ActionResult): string =>
  [message, ...items.map(({ id, text, details = [] }) => [`${id}${text}`, ...details].join(' '))]
    .filter(Boolean)
    .join(' ')

/**
 * State updater for leaving an edit or draft: the failed attempt no longer applies, but a
 * committed success or warning still describes the record.
 */
export const withoutActionError = <T extends ActionResult>(current: T | null): T | null =>
  current?.kind === 'error' ? null : current

/**
 * Folds one single-record flow's success and failure messages into a single result. A flow that
 * both committed work and failed part of it, such as a save whose refresh failed, reports a
 * warning so neither half is lost.
 */
export const combineActionMessages = (
  successMessage: string,
  errorMessage: string,
  titles: Record<ActionResultKind, string>,
): ActionResult | null => {
  if (successMessage && errorMessage) {
    return { kind: 'warning', title: titles.warning, message: `${successMessage} ${errorMessage}` }
  }
  if (errorMessage) {
    return { kind: 'error', title: titles.error, message: errorMessage }
  }
  if (successMessage) {
    return { kind: 'success', title: titles.success, message: successMessage }
  }
  return null
}

/**
 * A multi-record flow's results: at most one success and one failure notification. A multi-record action
 * that committed some records and failed others shows both, so neither half is lost.
 */
export const actionMessageResults = (
  successMessage: string,
  errorMessage: string,
  titles: { success: string; error: string },
): ActionResult[] => [
  ...(successMessage
    ? [{ kind: 'success' as const, title: titles.success, message: successMessage }]
    : []),
  ...(errorMessage ? [{ kind: 'error' as const, title: titles.error, message: errorMessage }] : []),
]
