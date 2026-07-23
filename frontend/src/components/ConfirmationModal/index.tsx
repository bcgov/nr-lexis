import { Button, Loading, Modal } from '@carbon/react'
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import './ConfirmationModal.css'

const PendingIcon = () => <Loading small withOverlay={false} description="" />

export type ConfirmationModalProps = {
  open: boolean
  title: string
  description?: ReactNode
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  pendingLabel?: string
  confirmDisabled?: boolean
  danger?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  onConfirm: () => Promise<void> | void
  onClose: () => void
  onError?: (error: unknown) => void
}

/**
 * Controlled confirmation dialog that waits for async work before requesting
 * close. Rejected work leaves the dialog open and delegates notification to
 * the caller through onError, preserving LEXIS's existing notification flow.
 */
const ConfirmationModal = ({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  pendingLabel = 'Working…',
  confirmDisabled = false,
  danger = false,
  size = 'sm',
  className,
  onConfirm,
  onClose,
  onError,
}: ConfirmationModalProps) => {
  const [pending, setPending] = useState(false)
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

  const requestClose = () => {
    if (!pending) onClose()
  }

  const confirm = async () => {
    if (pending || confirmDisabled) return

    setPending(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      onError?.(error)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      ref={modalRef}
      open={open}
      passiveModal
      size={size}
      modalHeading={title}
      aria-label={title}
      aria-describedby={description ? descriptionId : undefined}
      className={['lexis-confirmation-modal', className].filter(Boolean).join(' ')}
      selectorPrimaryFocus={`#${cancelButtonId}`}
      preventCloseOnClickOutside={pending}
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
        <Button id={cancelButtonId} kind="secondary" disabled={pending} onClick={requestClose}>
          {cancelLabel}
        </Button>
        <Button
          kind={danger ? 'danger' : 'primary'}
          disabled={pending || confirmDisabled}
          renderIcon={pending ? PendingIcon : undefined}
          onClick={() => void confirm()}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export default ConfirmationModal
