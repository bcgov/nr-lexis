import { Button, Loading } from '@carbon/react'
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AppNotification } from '@/components/AppNotification'
import Modal from '@/components/Modal'
import { genericActionFailureMessage } from '@/utils/notification-messages'

import './ConfirmationModal.css'

const PendingIcon = () => <Loading small withOverlay={false} description="" />

type ConfirmationModalProps = {
  open: boolean
  title: string
  description?: ReactNode
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  pendingLabel?: string
  confirmDisabled?: boolean
  cancelDanger?: boolean
  danger?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  launcherButtonRef?: RefObject<HTMLElement | null>
  errorTitle?: string
  onConfirm: () => Promise<void> | void
  onCancel?: () => void
  onClose: () => void
  onError?: (error: unknown) => void
}

/**
 * Controlled confirmation dialog that waits for async work before requesting
 * close. Rejected work leaves the dialog open for retry and shows the failure
 * while still delegating any caller-specific error handling through onError.
 */
const ConfirmationModal = ({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  pendingLabel,
  confirmDisabled = false,
  cancelDanger = false,
  danger = false,
  size = 'sm',
  className,
  launcherButtonRef,
  errorTitle = 'Action failed',
  onConfirm,
  onCancel,
  onClose,
  onError,
}: ConfirmationModalProps) => {
  const [pending, setPending] = useState(false)
  const [failureMessage, setFailureMessage] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const generatedId = useId().replaceAll(':', '')
  const cancelButtonId = `lexis-confirmation-cancel-${generatedId}`
  const descriptionId = `lexis-confirmation-description-${generatedId}`

  useLayoutEffect(() => {
    if (!open || !description) return
    const modalNode = modalRef.current
    const dialog = modalNode?.matches('[role="dialog"]')
      ? modalNode
      : modalNode?.querySelector<HTMLElement>('[role="dialog"]')
    dialog?.setAttribute('aria-describedby', descriptionId)
    return () => dialog?.removeAttribute('aria-describedby')
  }, [description, descriptionId, open])

  const closeAndRestoreFocus = () => {
    const launcherButton = launcherButtonRef?.current
    onClose()
    if (launcherButton) {
      window.setTimeout(() => launcherButton.focus())
    }
  }

  const requestClose = () => {
    if (pending) return
    setFailureMessage('')
    closeAndRestoreFocus()
  }

  const requestCancel = () => {
    if (pending) return
    setFailureMessage('')
    onCancel?.()
    closeAndRestoreFocus()
  }

  const confirm = async () => {
    if (pending || confirmDisabled) return

    setFailureMessage('')
    setPending(true)
    try {
      await onConfirm()
      closeAndRestoreFocus()
    } catch (error) {
      if (onError) {
        onError(error)
      } else {
        setFailureMessage(
          error instanceof Error && error.message ? error.message : genericActionFailureMessage,
        )
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Modal
        ref={modalRef}
        open={open}
        passiveModal
        size={size}
        modalHeading={title}
        aria-label={title}
        aria-describedby={description ? descriptionId : undefined}
        className={['lexis-confirmation-modal', className].filter(Boolean).join(' ')}
        launcherButtonRef={launcherButtonRef}
        selectorPrimaryFocus={`#${cancelButtonId}`}
        preventCloseOnClickOutside
        onRequestClose={requestClose}
      >
        <div className="lexis-confirmation-modal__body">
          {description ? (
            <p id={descriptionId} className="lexis-confirmation-modal__description">
              {description}
            </p>
          ) : null}
          {children}
        </div>
        <div className="lexis-confirmation-modal__actions">
          <Button
            id={cancelButtonId}
            kind={cancelDanger ? 'danger--tertiary' : 'tertiary'}
            disabled={pending}
            onClick={requestCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            kind={danger ? 'danger' : 'primary'}
            disabled={pending || confirmDisabled}
            renderIcon={pending ? PendingIcon : undefined}
            onClick={() => void confirm()}
          >
            {pending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
          </Button>
        </div>
      </Modal>
      {failureMessage ? (
        <AppNotification
          kind="error"
          title={errorTitle}
          subtitle={failureMessage}
          onCloseButtonClick={() => setFailureMessage('')}
        />
      ) : null}
    </>
  )
}

export default ConfirmationModal
