import { type FC, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { createPortal } from 'react-dom'
import { ToastNotification, type ToastNotificationProps } from '@carbon/react'
import {
  genericActionFailureMessage,
  sanitizeNotificationText,
} from '@/utils/notification-messages'

const MINIMUM_SUCCESS_AUTO_DISMISS_MS = 8000
const PERSISTENT_NOTIFICATION_KINDS = new Set(['error', 'warning', 'warning-alt'])
const NOTIFICATION_REGION_ID = 'lexis-toast-notification-region'

type AppNotificationProps = PropsWithChildren<
  Omit<ToastNotificationProps, 'onCloseButtonClick' | 'hideCloseButton' | 'timeout'> & {
    onCloseButtonClick?: () => void
    autoDismissMs?: number
    pauseAutoDismissOnInteraction?: boolean
  }
>

const getNotificationRegion = (): HTMLElement | null => {
  if (typeof document === 'undefined') {
    return null
  }

  const existingRegion = document.getElementById(NOTIFICATION_REGION_ID)
  if (existingRegion) {
    return existingRegion
  }

  const region = document.createElement('div')
  region.id = NOTIFICATION_REGION_ID
  region.className = 'app-notification-region'
  region.setAttribute('aria-live', 'polite')
  document.body.appendChild(region)
  return region
}

export const AppNotification: FC<AppNotificationProps> = ({
  onCloseButtonClick,
  autoDismissMs,
  pauseAutoDismissOnInteraction = true,
  children,
  kind,
  subtitle,
  title,
  className,
  ...notificationProps
}) => {
  const [notificationRegion, setNotificationRegion] = useState<HTMLElement | null>(null)
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

  useEffect(() => {
    setNotificationRegion(getNotificationRegion())
  }, [])

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

  const notification = (
    <div
      className="app-notification"
      onBlur={handleBlur}
      onFocus={handleFocus}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <ToastNotification
        className={['app-notification__toast', className].filter(Boolean).join(' ')}
        hideCloseButton={false}
        kind={kind}
        onCloseButtonClick={onCloseButtonClick}
        subtitle={resolvedSubtitle}
        timeout={0}
        title={resolvedTitle}
        {...notificationProps}
      >
        {children}
      </ToastNotification>
    </div>
  )

  return notificationRegion ? createPortal(notification, notificationRegion) : null
}
