import { type FC, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { InlineNotification, type InlineNotificationProps } from '@carbon/react'
import {
  genericActionFailureMessage,
  sanitizeNotificationText,
} from '@/utils/notification-messages'

const MINIMUM_SUCCESS_AUTO_DISMISS_MS = 8000
const PERSISTENT_NOTIFICATION_KINDS = new Set(['error', 'warning', 'warning-alt'])

type AppNotificationProps = PropsWithChildren<
  Omit<InlineNotificationProps, 'onCloseButtonClick' | 'hideCloseButton'> & {
    onCloseButtonClick?: () => void
    autoDismissMs?: number
    pauseAutoDismissOnInteraction?: boolean
  }
>

export const AppNotification: FC<AppNotificationProps> = ({
  onCloseButtonClick,
  autoDismissMs,
  pauseAutoDismissOnInteraction = true,
  children,
  kind,
  subtitle,
  title,
  ...notificationProps
}) => {
  const [isPaused, setIsPaused] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const normalizedKind = typeof kind === 'string' ? kind : ''
  const isPersistentNotification = PERSISTENT_NOTIFICATION_KINDS.has(normalizedKind)
  const hasNotificationAction = Boolean(
    (notificationProps as { actionButtonLabel?: unknown; onActionButtonClick?: unknown })
      .actionButtonLabel ||
    (notificationProps as { actionButtonLabel?: unknown; onActionButtonClick?: unknown })
      .onActionButtonClick,
  )
  const requestedAutoDismissMs =
    autoDismissMs ?? (normalizedKind === 'success' ? MINIMUM_SUCCESS_AUTO_DISMISS_MS : undefined)
  const effectiveAutoDismissMs =
    !isPersistentNotification && !hasNotificationAction && requestedAutoDismissMs
      ? Math.max(requestedAutoDismissMs, MINIMUM_SUCCESS_AUTO_DISMISS_MS)
      : undefined
  const resolvedTitle =
    typeof title === 'string' ? sanitizeNotificationText(title, 'Notification') : title
  const resolvedSubtitle =
    typeof subtitle === 'string'
      ? sanitizeNotificationText(subtitle, genericActionFailureMessage)
      : subtitle

  const clearAutoDismiss = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!onCloseButtonClick || !effectiveAutoDismissMs) {
      clearAutoDismiss()
      return
    }
    if (isPaused) {
      clearAutoDismiss()
      return
    }

    timeoutRef.current = window.setTimeout(() => {
      onCloseButtonClick()
    }, effectiveAutoDismissMs)

    return () => clearAutoDismiss()
  }, [clearAutoDismiss, effectiveAutoDismissMs, isPaused, onCloseButtonClick])

  const handleMouseEnter = useCallback(() => {
    if (pauseAutoDismissOnInteraction) {
      setIsPaused(true)
    }
  }, [pauseAutoDismissOnInteraction])

  const handleMouseLeave = useCallback(() => {
    if (pauseAutoDismissOnInteraction) {
      setIsPaused(false)
    }
  }, [pauseAutoDismissOnInteraction])

  const handleFocus = useCallback(() => {
    if (pauseAutoDismissOnInteraction) {
      setIsPaused(true)
    }
  }, [pauseAutoDismissOnInteraction])

  const handleBlur = useCallback(() => {
    if (pauseAutoDismissOnInteraction) {
      setIsPaused(false)
    }
  }, [pauseAutoDismissOnInteraction])

  return (
    <div
      onBlur={handleBlur}
      onFocus={handleFocus}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <InlineNotification
        hideCloseButton={false}
        kind={kind}
        onCloseButtonClick={onCloseButtonClick}
        subtitle={resolvedSubtitle}
        title={resolvedTitle}
        {...notificationProps}
      >
        {children}
      </InlineNotification>
    </div>
  )
}
