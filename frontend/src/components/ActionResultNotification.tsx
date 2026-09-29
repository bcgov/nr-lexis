import { Link } from 'react-router-dom'
import { AppNotification } from './AppNotification'
import { actionResultTitle, type ActionResult } from '@/utils/action-result'

type ActionResultNotificationProps = {
  result: ActionResult
  /** Omit for feedback that stays until the next attempt, such as an error inside a dialog. */
  onClose?: () => void
  className?: string
}

/** Shows the single latest action result for the page, form, or dialog that owns it. */
export function ActionResultNotification({
  result,
  onClose,
  className,
}: ActionResultNotificationProps) {
  return (
    <AppNotification
      kind={result.kind}
      title={actionResultTitle(result)}
      subtitle={result.message || undefined}
      className={className}
      lowContrast
      onCloseButtonClick={onClose}
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
            </li>
          ))}
        </ul>
      ) : null}
    </AppNotification>
  )
}
