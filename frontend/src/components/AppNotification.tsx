import { useCallback, useEffect, useState, type PropsWithChildren } from 'react'
import { createPortal } from 'react-dom'
import { ToastNotification, type ToastNotificationProps } from '@carbon/react'
import {
  genericActionFailureMessage,
  sanitizeNotificationText,
} from '@/utils/notification-messages'

const MINIMUM_SUCCESS_AUTO_DISMISS_MS = 8000
const PERSISTENT_NOTIFICATION_KINDS = new Set(['error', 'warning', 'warning-alt'])
export const APP_NOTIFICATION_REGION_ID = 'lexis-toast-notification-region'

export type AppNotificationProps = PropsWithChildren<
  Omit<ToastNotificationProps, 'onCloseButtonClick' | 'hideCloseButton' | 'timeout'> & {
    onCloseButtonClick?: () => void
    autoDismissMs?: number
    pauseAutoDismissOnInteraction?: boolean
  }
>

export const syncAppNotificationRegionTheme = (isDarkTheme: boolean): HTMLElement | null => {
  if (typeof document === 'undefined') {
    return null
  }

  let region = document.getElementById(APP_NOTIFICATION_REGION_ID)
  if (!region) {
    region = document.createElement('div')
    region.id = APP_NOTIFICATION_REGION_ID
    document.body.appendChild(region)
  }

  region.classList.add('app-notification-region')
  region.classList.toggle('cds--g100', isDarkTheme)
  region.classList.toggle('cds--white', !isDarkTheme)
  region.setAttribute('aria-live', 'polite')
  return region
}

const getNotificationRegion = (): HTMLElement | null => {
  const isDarkTheme =
    typeof document !== 'undefined' && Boolean(document.querySelector('.cds--g100 .app-shell'))
  return syncAppNotificationRegionTheme(isDarkTheme)
}

export function AppNotification({
  onCloseButtonClick,
  autoDismissMs,
  pauseAutoDismissOnInteraction = true,
  children,
  kind,
  subtitle,
  title,
  className,
  lowContrast = true,
  ...notificationProps
}: AppNotificationProps) {
  const [notificationRegion] = useState<HTMLElement | null>(() => getNotificationRegion())
  const [isPaused, setIsPaused] = useState(false)
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
    if (!onCloseButtonClick || !effectiveAutoDismissMs || isPaused) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      onCloseButtonClick()
    }, effectiveAutoDismissMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [effectiveAutoDismissMs, isPaused, onCloseButtonClick])

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
        hideCloseButton={!onCloseButtonClick}
        kind={kind}
        lowContrast={lowContrast}
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
