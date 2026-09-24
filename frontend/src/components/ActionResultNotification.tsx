import { AppNotification } from './AppNotification'
import { actionResultTitle, type ActionResult } from '@/utils/action-result'

type ActionResultNotificationProps = {
  result: ActionResult
  onClose: () => void
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
    />
  )
}
