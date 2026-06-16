import { type FC, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { InlineNotification, type InlineNotificationProps } from '@carbon/react'

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
  ...notificationProps
}) => {
  const [isPaused, setIsPaused] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  const clearAutoDismiss = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!onCloseButtonClick || !autoDismissMs) {
      clearAutoDismiss()
      return
    }
    if (isPaused) {
      clearAutoDismiss()
      return
    }

    timeoutRef.current = window.setTimeout(() => {
      onCloseButtonClick()
    }, autoDismissMs)

    return () => clearAutoDismiss()
  }, [autoDismissMs, clearAutoDismiss, isPaused, onCloseButtonClick])

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
        onCloseButtonClick={onCloseButtonClick}
        {...notificationProps}
      />
    </div>
  )
}
