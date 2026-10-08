import { use, useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react'
import { Button } from '@carbon/react'
import { UNSAFE_DataRouterContext, useBeforeUnload, useBlocker } from 'react-router-dom'
import type { BlockerFunction } from 'react-router-dom'
import DiscardChangesModal, { type DiscardChangesCopy } from '@/components/DiscardChangesModal'
import Modal from '@/components/Modal'
import { isPageUnloadAuthorized } from '@/utils/page-unload'

import './UnsavedChangesGuard.css'

type UnsavedChangesGuardProps = {
  isDirty: boolean
  isBusy?: boolean
  onDiscard: () => void
  discardCopy?: DiscardChangesCopy
  subject?: string
}

export const formValuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

/**
 * Leaving the record with unsaved changes asks "Discard changes?". While a change is still being
 * saved, leaving waits instead.
 */
const RouterNavigationGuard = ({
  isDirty,
  isBusy = false,
  onDiscard,
  discardCopy,
  subject = 'this record',
}: UnsavedChangesGuardProps) => {
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      (isDirty || isBusy) && currentLocation.pathname !== nextLocation.pathname,
    [isBusy, isDirty],
  )
  const blocker = useBlocker(shouldBlock)
  const blockerRef = useRef(blocker)
  blockerRef.current = blocker
  const modalRef = useRef<HTMLDivElement>(null)
  const invokingElementRef = useRef<HTMLElement | null>(null)
  const generatedId = useId().replaceAll(':', '')
  const stayButtonId = `lexis-unsaved-changes-stay-${generatedId}`
  const descriptionId = `lexis-unsaved-changes-description-${generatedId}`
  const isOpen = blocker.state === 'blocked'
  const busyWithoutDirtyChanges = isBusy && !isDirty

  useLayoutEffect(() => {
    if (!isOpen) return
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && !modalRef.current?.contains(activeElement)) {
      invokingElementRef.current = activeElement
    }
  }, [isOpen])

  const restoreInvokingFocus = useCallback(() => {
    const invokingElement = invokingElementRef.current
    queueMicrotask(() => {
      if (invokingElement?.isConnected) invokingElement.focus()
    })
  }, [])

  useEffect(() => {
    if (isDirty || isBusy || blocker.state !== 'blocked') return
    blocker.reset()
    restoreInvokingFocus()
  }, [blocker, isBusy, isDirty, restoreInvokingFocus])

  useEffect(() => {
    if (!isOpen || !busyWithoutDirtyChanges) return
    const modalNode = modalRef.current
    const dialog = modalNode?.matches('[role="dialog"]')
      ? modalNode
      : modalNode?.querySelector<HTMLElement>('[role="dialog"]')
    dialog?.setAttribute('aria-describedby', descriptionId)
    return () => dialog?.removeAttribute('aria-describedby')
  }, [busyWithoutDirtyChanges, descriptionId, isOpen])

  const blockedTargetIdentity = (): string | null => {
    const currentBlocker = blockerRef.current
    if (currentBlocker.state !== 'blocked') return null
    const { key, pathname, search, hash } = currentBlocker.location
    return `${key}|${pathname}|${search}|${hash}`
  }

  const stay = () => {
    if (blocker.state !== 'blocked') return
    blocker.reset()
    restoreInvokingFocus()
  }

  const discardAndLeave = () => {
    if (isBusy || blocker.state !== 'blocked') return
    const targetIdentity = blockedTargetIdentity()
    onDiscard()
    const latestBlocker = blockerRef.current
    if (
      targetIdentity &&
      latestBlocker.state === 'blocked' &&
      blockedTargetIdentity() === targetIdentity
    ) {
      latestBlocker.proceed()
    }
  }

  if (!isOpen) return null

  if (!busyWithoutDirtyChanges) {
    return (
      <DiscardChangesModal
        open
        {...discardCopy}
        confirmDisabled={isBusy}
        returnFocusRef={invokingElementRef}
        onDiscard={discardAndLeave}
        onKeepEditing={() => {
          if (blocker.state === 'blocked') blocker.reset()
        }}
      />
    )
  }

  return (
    <Modal
      ref={modalRef}
      open
      passiveModal
      size="sm"
      modalHeading="Change in progress"
      aria-label="Change in progress"
      className="lexis-unsaved-changes-modal"
      selectorPrimaryFocus={`#${stayButtonId}`}
      preventCloseOnClickOutside
      onRequestClose={stay}
    >
      <div className="lexis-unsaved-changes-modal__body">
        <p id={descriptionId} className="lexis-unsaved-changes-modal__description">
          A change to {subject} is still being completed. Stay on this page until it finishes.
        </p>
      </div>
      <div className="lexis-unsaved-changes-modal__actions">
        <Button id={stayButtonId} kind="tertiary" size="md" onClick={stay}>
          Stay
        </Button>
      </div>
    </Modal>
  )
}

const UnsavedChangesGuard = (props: UnsavedChangesGuardProps) => {
  const dataRouterContext = use(UNSAFE_DataRouterContext)

  useBeforeUnload(
    useCallback(
      (event) => {
        if (isPageUnloadAuthorized() || (!props.isDirty && !props.isBusy)) return
        event.preventDefault()
        event.returnValue = ''
      },
      [props.isBusy, props.isDirty],
    ),
  )

  return dataRouterContext ? <RouterNavigationGuard {...props} /> : null
}

export default UnsavedChangesGuard
