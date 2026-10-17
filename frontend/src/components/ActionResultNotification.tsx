import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppNotification } from './AppNotification'
import {
  actionResultTitle,
  type ActionResult,
  type ActionResultRecord,
} from '@/utils/action-result'

const recordLink = ({ id, to, state }: ActionResultRecord): ReactNode =>
  to ? (
    <Link className="cds--link" to={to} state={state}>
      {id}
    </Link>
  ) : (
    id
  )

/** The title, with the identifier of the record it names linked to that record. */
const resultTitle = (result: ActionResult): ReactNode => {
  const title = actionResultTitle(result)
  const record = result.titleRecord
  const at = record?.to ? title.indexOf(record.id) : -1
  if (!record || at < 0) return title
  return (
    <>
      {title.slice(0, at)}
      {recordLink(record)}
      {title.slice(at + record.id.length)}
    </>
  )
}

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
  const records = result.records?.length ? (
    <p className="action-result-notification__records">
      {result.records.map((record, index) => (
        <Fragment key={record.id}>
          {index > 0 ? ', ' : null}
          {recordLink(record)}
        </Fragment>
      ))}
    </p>
  ) : null
  const items = result.items?.length ? (
    <ul className="action-result-notification__items">
      {result.items.map((item) => (
        <li key={item.id}>
          {recordLink(item)}
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
  ) : null
  return (
    <AppNotification
      kind={result.kind}
      title={resultTitle(result)}
      subtitle={result.message || undefined}
      className={className}
      lowContrast
      onCloseButtonClick={onClose}
      focusOnReveal={focusOnReveal}
      revealKey={focusOnReveal || result.titleRecord ? result : undefined}
    >
      {records || items ? (
        <>
          {records}
          {items}
        </>
      ) : undefined}
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
