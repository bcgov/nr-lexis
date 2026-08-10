import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react'
import { createPortal } from 'react-dom'
import { ToastNotification, type ToastNotificationProps } from '@carbon/react'
import {
  genericActionFailureMessage,
  sanitizeNotificationText,
} from '@/utils/notification-messages'

const DEFAULT_SUCCESS_AUTO_DISMISS_MS = 6000
const NOTIFICATION_EXIT_ANIMATION_MS = 300
const PERSISTENT_NOTIFICATION_KINDS = new Set(['error', 'warning', 'warning-alt'])
export const APP_NOTIFICATION_REGION_ID = 'lexis-toast-notification-region'

let nextNotificationId = 0
let activeNotificationId: number | null = null
const activeNotificationListeners = new Set<() => void>()

const subscribeToActiveNotification = (listener: () => void) => {
  activeNotificationListeners.add(listener)
  return () => activeNotificationListeners.delete(listener)
}

const getActiveNotificationId = () => activeNotificationId

const setActiveNotificationId = (notificationId: number | null) => {
  if (activeNotificationId === notificationId) return
  activeNotificationId = notificationId
  activeNotificationListeners.forEach((listener) => listener())
}

export type AppNotificationProps = PropsWithChildren<
  Omit<ToastNotificationProps, 'onClose' | 'onCloseButtonClick' | 'hideCloseButton' | 'timeout'> & {
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
  const [notificationId] = useState(() => ++nextNotificationId)
  const [notificationRegion] = useState<HTMLElement | null>(() => getNotificationRegion())
  const [isPaused, setIsPaused] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)
  const currentActiveNotificationId = useSyncExternalStore(
    subscribeToActiveNotification,
    getActiveNotificationId,
    getActiveNotificationId,
  )
  const normalizedKind = typeof kind === 'string' ? kind : ''
  const isPersistentNotification = PERSISTENT_NOTIFICATION_KINDS.has(normalizedKind)
  const hasNotificationAction = Boolean(
    (notificationProps as { actionButtonLabel?: unknown; onActionButtonClick?: unknown })
      .actionButtonLabel ||
    (notificationProps as { actionButtonLabel?: unknown; onActionButtonClick?: unknown })
      .onActionButtonClick,
  )
  const requestedAutoDismissMs =
    autoDismissMs ?? (normalizedKind === 'success' ? DEFAULT_SUCCESS_AUTO_DISMISS_MS : undefined)
  const effectiveAutoDismissMs =
    !isPersistentNotification && !hasNotificationAction && requestedAutoDismissMs
      ? requestedAutoDismissMs
      : undefined
  const resolvedTitle =
    typeof title === 'string' ? sanitizeNotificationText(title, 'Notification') : title
  const resolvedSubtitle =
    typeof subtitle === 'string'
      ? sanitizeNotificationText(subtitle, genericActionFailureMessage)
      : subtitle

  useLayoutEffect(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    // A new payload supersedes any exit animation still attached to this instance.
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setIsExiting(false)
    setActiveNotificationId(notificationId)

    return () => {
      if (activeNotificationId === notificationId) {
        setActiveNotificationId(null)
      }
    }
  }, [kind, notificationId, subtitle, title])

  useEffect(
    () => () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current)
      }
    },
    [],
  )

  const closeNotification = useCallback(() => {
    if (!onCloseButtonClick || isExiting) return

    setIsExiting(true)
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null
      onCloseButtonClick()
    }, NOTIFICATION_EXIT_ANIMATION_MS)
  }, [isExiting, onCloseButtonClick])

  useEffect(() => {
    if (
      currentActiveNotificationId !== notificationId ||
      !onCloseButtonClick ||
      !effectiveAutoDismissMs ||
      isPaused ||
      isExiting
    ) {
      return undefined
    }

    const timeoutId = window.setTimeout(
      () => {
        closeNotification()
      },
      Math.max(0, effectiveAutoDismissMs - NOTIFICATION_EXIT_ANIMATION_MS),
    )

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    closeNotification,
    currentActiveNotificationId,
    effectiveAutoDismissMs,
    isExiting,
    isPaused,
    notificationId,
    onCloseButtonClick,
  ])

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
      className={['app-notification', isExiting ? 'app-notification--exiting' : '']
        .filter(Boolean)
        .join(' ')}
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
        onClose={() => false}
        onCloseButtonClick={closeNotification}
        role="status"
        subtitle={resolvedSubtitle}
        timeout={0}
        title={resolvedTitle}
        {...notificationProps}
      >
        {children}
      </ToastNotification>
    </div>
  )

  return notificationRegion && currentActiveNotificationId === notificationId
    ? createPortal(notification, notificationRegion)
    : null
}
