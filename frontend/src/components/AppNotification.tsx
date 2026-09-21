import { useEffect, useRef } from 'react'
import { InlineNotification, type InlineNotificationProps } from '@carbon/react'
import {
  genericActionFailureMessage,
  sanitizeNotificationText,
} from '@/utils/notification-messages'

type AppNotificationProps = Omit<
  InlineNotificationProps,
  'onClose' | 'onCloseButtonClick' | 'hideCloseButton'
> & {
  onCloseButtonClick?: () => void
}

/** Persistent feedback in the page, form, or dialog that owns the action. */
export function AppNotification({
  onCloseButtonClick,
  kind,
  subtitle,
  title,
  className,
  lowContrast = true,
  role = 'status',
  ...notificationProps
}: AppNotificationProps) {
  const notificationRef = useRef<HTMLDivElement>(null)
  const isActionFeedback = Boolean(onCloseButtonClick)

  useEffect(() => {
    if (!isActionFeedback) return
    const frame = requestAnimationFrame(() => {
      const notification = notificationRef.current
      if (!notification || notification.getClientRects().length === 0) return
      // A page banner must not scroll the page behind an active dialog.
      if (
        document.querySelector('.cds--modal.is-visible') &&
        !notification.closest('[role="dialog"]')
      )
        return
      const bounds = notification.getBoundingClientRect()
      const headerHeight =
        document.querySelector('.cds--header')?.getBoundingClientRect().height ?? 0
      if (bounds.top < headerHeight + 16 || bounds.bottom > window.innerHeight) {
        notification.scrollIntoView({ block: 'nearest', behavior: 'instant' })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [isActionFeedback, kind, subtitle, title])

  return (
    <div className="app-notification-container" ref={notificationRef}>
      <InlineNotification
        {...notificationProps}
        className={['app-inline-notification', className].filter(Boolean).join(' ')}
        hideCloseButton={!onCloseButtonClick}
        kind={kind}
        lowContrast={lowContrast}
        onClose={() => false}
        onCloseButtonClick={onCloseButtonClick}
        role={role}
        subtitle={
          typeof subtitle === 'string'
            ? sanitizeNotificationText(subtitle, genericActionFailureMessage)
            : subtitle
        }
        title={typeof title === 'string' ? sanitizeNotificationText(title, 'Notification') : title}
      />
    </div>
  )
}
