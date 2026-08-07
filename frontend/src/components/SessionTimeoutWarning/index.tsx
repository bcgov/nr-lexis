import { WarningFilled } from '@carbon/icons-react'
import { Button } from '@carbon/react'
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import './SessionTimeoutWarning.css'

const URGENT_COUNTDOWN_SECONDS = 30

export type SessionTimeoutWarningProps = {
  open: boolean
  expiresAt: number | null
  launcherButtonRef: RefObject<HTMLElement | null>
  onStayLoggedIn: () => void | Promise<void>
  onLogOut: () => void
}

export const formatSessionCountdown = (remainingSeconds: number): string => {
  const safeRemainingSeconds = Math.max(0, remainingSeconds)
  const minutes = Math.floor(safeRemainingSeconds / 60)
  const seconds = safeRemainingSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const getRemainingSeconds = (expiresAt: number): number => {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
}

const SessionTimeoutWarning = ({
  open,
  expiresAt,
  launcherButtonRef,
  onStayLoggedIn,
  onLogOut,
}: SessionTimeoutWarningProps) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const countdownRef = useRef<HTMLSpanElement>(null)
  const urgencyIconRef = useRef<HTMLSpanElement>(null)
  const logOutButtonRef = useRef<HTMLButtonElement>(null)
  const stayLoggedInButtonRef = useRef<HTMLButtonElement>(null)
  const stayLoggedInPendingRef = useRef(false)

  useLayoutEffect(() => {
    if (!open) {
      return undefined
    }

    const launcher = launcherButtonRef.current
    dialogRef.current?.focus()

    return () => {
      if (launcher?.isConnected) {
        launcher.focus()
      }
    }
  }, [launcherButtonRef, open])

  useEffect(() => {
    if (!open || expiresAt === null) {
      return undefined
    }

    const updateCountdown = () => {
      const remainingSeconds = getRemainingSeconds(expiresAt)
      const isUrgent = remainingSeconds <= URGENT_COUNTDOWN_SECONDS

      if (countdownRef.current) {
        countdownRef.current.textContent = formatSessionCountdown(remainingSeconds)
        countdownRef.current.classList.toggle(
          'lexis-session-timeout-warning__countdown--urgent',
          isUrgent,
        )
      }
      if (urgencyIconRef.current) {
        urgencyIconRef.current.hidden = !isUrgent
      }
    }

    updateCountdown()
    const intervalId = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(intervalId)
  }, [expiresAt, open])

  const handleStayLoggedIn = async () => {
    if (stayLoggedInPendingRef.current) {
      return
    }

    stayLoggedInPendingRef.current = true
    try {
      await onStayLoggedIn()
    } finally {
      stayLoggedInPendingRef.current = false
    }
  }

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.key !== 'Tab') {
      return
    }

    const firstButton = logOutButtonRef.current
    const lastButton = stayLoggedInButtonRef.current
    if (!firstButton || !lastButton) {
      return
    }

    const activeElement = document.activeElement
    if (event.shiftKey && (activeElement === firstButton || activeElement === dialogRef.current)) {
      event.preventDefault()
      lastButton.focus()
    } else if (!event.shiftKey && activeElement === lastButton) {
      event.preventDefault()
      firstButton.focus()
    }
  }

  if (!open) {
    return null
  }

  const initialCountdown =
    expiresAt === null ? '5:00' : formatSessionCountdown(getRemainingSeconds(expiresAt))
  const portalTheme =
    document.documentElement.getAttribute('data-carbon-theme') === 'g100' ? 'g100' : 'white'

  return createPortal(
    <div className={`lexis-session-timeout-warning__overlay cds--${portalTheme}`}>
      <div
        ref={dialogRef}
        className="lexis-session-timeout-warning"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lexis-session-timeout-warning-title"
        aria-describedby="lexis-session-timeout-warning-description"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <h2
          id="lexis-session-timeout-warning-title"
          className="lexis-session-timeout-warning__title"
        >
          You’re about to be logged out
        </h2>
        <div
          id="lexis-session-timeout-warning-description"
          className="lexis-session-timeout-warning__body"
        >
          <p>
            For your security, you’ll be logged out in{' '}
            <span
              className="lexis-session-timeout-warning__countdown-wrapper"
              aria-live="polite"
              aria-atomic="true"
            >
              <span ref={countdownRef} className="lexis-session-timeout-warning__countdown">
                {initialCountdown}
              </span>
              <span
                ref={urgencyIconRef}
                className="lexis-session-timeout-warning__urgency-icon"
                aria-hidden="true"
                hidden
              >
                <WarningFilled />
              </span>
            </span>{' '}
            unless you choose to stay logged in.
          </p>
          <p>Any unsaved changes may be lost.</p>
        </div>
        <div className="lexis-session-timeout-warning__actions">
          <Button ref={logOutButtonRef} kind="tertiary" size="md" onClick={onLogOut}>
            Log out
          </Button>
          <Button
            ref={stayLoggedInButtonRef}
            kind="primary"
            size="md"
            onClick={() => void handleStayLoggedIn()}
          >
            Stay logged in
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default SessionTimeoutWarning
