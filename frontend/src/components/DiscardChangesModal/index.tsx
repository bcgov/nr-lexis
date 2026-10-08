import { useCallback, useRef, useState, type ReactNode } from 'react'
import ConfirmationModal from '@/components/ConfirmationModal'

export const DISCARD_CHANGES_TITLE = 'Discard changes?'
export const DISCARD_CHANGES_DESCRIPTION = 'Your changes will be lost.'

export type DiscardChangesCopy = {
  title?: string
  description?: string
  confirmLabel?: string
}

/** Leaving a create page before its first save discards the whole new record. */
export const discardNewRecordCopy = (recordNoun: string): DiscardChangesCopy => ({
  title: `Discard this ${recordNoun}?`,
  description: `The ${recordNoun} hasn't been created yet. Everything you've entered will be lost.`,
  confirmLabel: 'Discard',
})

type DiscardChangesModalProps = DiscardChangesCopy & {
  open: boolean
  confirmDisabled?: boolean
  /** Where Keep editing returns focus. Discard leaves focus to the action it completes. */
  returnFocusRef: { current: HTMLElement | null }
  onDiscard: () => void
  onKeepEditing: () => void
}

const DiscardChangesModal = ({
  open,
  title = DISCARD_CHANGES_TITLE,
  description = DISCARD_CHANGES_DESCRIPTION,
  confirmLabel = 'Discard changes',
  confirmDisabled,
  returnFocusRef,
  onDiscard,
  onKeepEditing,
}: DiscardChangesModalProps) => {
  const discardedRef = useRef(false)

  return (
    <ConfirmationModal
      open={open}
      danger
      title={title}
      description={description}
      cancelLabel="Keep editing"
      confirmLabel={confirmLabel}
      confirmDisabled={confirmDisabled}
      launcherButtonRef={returnFocusRef}
      onConfirm={() => {
        discardedRef.current = true
        returnFocusRef.current = null
        onDiscard()
      }}
      onClose={() => {
        if (discardedRef.current) {
          discardedRef.current = false
          return
        }
        onKeepEditing()
      }}
    />
  )
}

export default DiscardChangesModal

const activeElement = (): HTMLElement | null =>
  document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement
    : null

/**
 * Runs an action straight away when nothing has changed, and asks "Discard changes?" first when
 * something has. Render `discardModal` once on the page.
 */
export const useDiscardPrompt = (
  isDirty: boolean,
  copy?: DiscardChangesCopy,
  getReturnFocus?: () => HTMLElement | null,
): {
  confirmDiscard: (action: () => void) => void
  discardModal: ReactNode
} => {
  const [pendingAction, setPendingAction] = useState<{ run: () => void } | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const confirmDiscard = useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action()
        return
      }
      returnFocusRef.current = getReturnFocus?.() ?? activeElement()
      setPendingAction({ run: action })
    },
    [getReturnFocus, isDirty],
  )

  const discardModal = pendingAction ? (
    <DiscardChangesModal
      open
      {...copy}
      returnFocusRef={returnFocusRef}
      onDiscard={() => {
        setPendingAction(null)
        pendingAction.run()
      }}
      onKeepEditing={() => setPendingAction(null)}
    />
  ) : null

  return { confirmDiscard, discardModal }
}
