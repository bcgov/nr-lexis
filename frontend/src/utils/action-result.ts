export type ActionResultKind = 'error' | 'success' | 'warning'

/** The latest action outcome owned by one page, form, or dialog. */
export type ActionResult = {
  kind: ActionResultKind
  message: string
  title?: string
}

const DEFAULT_ACTION_RESULT_TITLES: Record<ActionResultKind, string> = {
  error: 'Action failed',
  success: 'Action completed',
  warning: 'Action needs attention',
}

export const actionResultTitle = (result: ActionResult): string =>
  result.title ?? DEFAULT_ACTION_RESULT_TITLES[result.kind]

/**
 * State updater for leaving an edit or draft: the failed attempt no longer applies, but a
 * committed success or warning still describes the record.
 */
export const withoutActionError = <T extends ActionResult>(current: T | null): T | null =>
  current?.kind === 'error' ? null : current

/**
 * Folds one flow's success and failure messages into a single result. A flow that both
 * committed work and failed part of it reports a warning so neither half is lost.
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
