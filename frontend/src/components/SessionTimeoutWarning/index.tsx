import { WarningFilled } from '@carbon/icons-react'
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import Modal from '@/components/Modal'

import './SessionTimeoutWarning.css'

const URGENT_COUNTDOWN_SECONDS = 30

export type SessionTimeoutWarningProps = {
  open: boolean
  expiresAt: number | null
  launcherButtonRef: RefObject<HTMLElement | null>
  onStayLoggedIn: () => void
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

const ignoreCloseRequest = (event: React.SyntheticEvent<HTMLElement>) => {
  event.preventDefault()
}

const SessionTimeoutWarning = ({
  open,
  expiresAt,
  launcherButtonRef,
  onStayLoggedIn,
  onLogOut,
}: SessionTimeoutWarningProps) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const countdownRef = useRef<HTMLSpanElement>(null)
  const urgencyIconRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const closeButton = modalRef.current?.querySelector<HTMLElement>('.cds--modal-close-button')
    closeButton?.setAttribute('hidden', '')
  }, [open])

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

  const initialCountdown =
    expiresAt === null ? '5:00' : formatSessionCountdown(getRemainingSeconds(expiresAt))

  return (
    <Modal
      ref={modalRef}
      open={open}
      alert
      size="sm"
      modalHeading="You’re about to be logged out"
      aria-label="You’re about to be logged out"
      className="lexis-session-timeout-warning"
      launcherButtonRef={launcherButtonRef}
      primaryButtonText="Stay logged in"
      secondaryButtonText="Log out"
      selectorPrimaryFocus=".cds--modal-footer .cds--btn--primary"
      preventCloseOnClickOutside
      onRequestClose={ignoreCloseRequest}
      onRequestSubmit={onStayLoggedIn}
      onSecondarySubmit={onLogOut}
    >
      <p className="lexis-session-timeout-warning__description">
        For your security, you’ll be logged out in{' '}
        <span className="lexis-session-timeout-warning__countdown-wrapper">
          <span
            ref={countdownRef}
            className="lexis-session-timeout-warning__countdown"
            aria-live="polite"
            aria-atomic="true"
          >
            {initialCountdown}
          </span>
          <span
            ref={urgencyIconRef}
            className="lexis-session-timeout-warning__urgency-icon"
            aria-hidden="true"
            hidden
          >
            <WarningFilled size={20} />
          </span>
        </span>{' '}
        unless you choose to stay logged in.
      </p>
      <p className="lexis-session-timeout-warning__description">Any unsaved changes may be lost.</p>
    </Modal>
  )
}

export default SessionTimeoutWarning
