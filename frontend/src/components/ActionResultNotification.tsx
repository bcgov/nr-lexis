import { Link } from 'react-router-dom'
import { AppNotification } from './AppNotification'
import { actionResultTitle, type ActionResult } from '@/utils/action-result'

type ActionResultNotificationProps = {
  result: ActionResult
  /** Omit for feedback that stays until the next attempt, such as an error inside a dialog. */
  onClose?: () => void
  className?: string
  /** Moves focus to the result when it appears, such as after the dialog that made it closes. */
  focusOnReveal?: boolean
}

/** Shows the single latest action result for the page, form, or dialog that owns it. */
export function ActionResultNotification({
  result,
  onClose,
  className,
  focusOnReveal = false,
}: ActionResultNotificationProps) {
  return (
    <AppNotification
      kind={result.kind}
      title={actionResultTitle(result)}
      subtitle={result.message || undefined}
      className={className}
      lowContrast
      onCloseButtonClick={onClose}
      focusOnReveal={focusOnReveal}
      revealKey={focusOnReveal ? result : undefined}
    >
      {result.items?.length ? (
        <ul className="action-result-notification__items">
          {result.items.map((item) => (
            <li key={item.id}>
              {item.to ? (
                <Link className="cds--link" to={item.to} state={item.state}>
                  {item.id}
                </Link>
              ) : (
                item.id
              )}
              {item.text}
              {item.details?.length ? (
                <ul className="action-result-notification__details">
                  {[...new Set(item.details)].map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </AppNotification>
  )
}

type ActionResultNotificationsProps = {
  results: ActionResult[]
  /** Dismisses one result; the other outcome of the same action stays. */
  onClose: (result: ActionResult) => void
  className?: string
  /** Moves focus to the first outcome when the outcomes appear. */
  focusOnReveal?: boolean
}

/** A multi-record action's outcomes: at most one success and one failure notification. */
export function ActionResultNotifications({
  results,
  onClose,
  className,
  focusOnReveal = false,
}: ActionResultNotificationsProps) {
  return (
    <>
      {results.map((result, index) => (
        <ActionResultNotification
          key={result.kind}
          result={result}
          className={className}
          onClose={() => onClose(result)}
          focusOnReveal={focusOnReveal && index === 0}
        />
      ))}
    </>
  )
}
