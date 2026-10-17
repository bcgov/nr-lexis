import { use, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@carbon/react'
import { UNSAFE_DataRouterContext, useBeforeUnload, useBlocker } from 'react-router-dom'
import type { Blocker, BlockerFunction } from 'react-router-dom'
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
  const focusInvokerOnCloseRef = useRef(false)
  const generatedId = useId().replaceAll(':', '')
  const stayButtonId = `lexis-unsaved-changes-stay-${generatedId}`
  const descriptionId = `lexis-unsaved-changes-description-${generatedId}`
  // The router commits a reset in a transition, so the dialog closes on its own state first.
  // Focus then returns to the control that opened it without the open dialog pulling it back.
  const [stayedBlocker, setStayedBlocker] = useState<Blocker | null>(null)
  const isOpen = blocker.state === 'blocked' && blocker !== stayedBlocker
  const busyWithoutDirtyChanges = isBusy && !isDirty

  useLayoutEffect(() => {
    if (!isOpen) return
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && !modalRef.current?.contains(activeElement)) {
      invokingElementRef.current = activeElement
    }
  }, [isOpen])

  useLayoutEffect(() => {
    if (isOpen || !focusInvokerOnCloseRef.current) return
    focusInvokerOnCloseRef.current = false
    const invokingElement = invokingElementRef.current
    if (invokingElement?.isConnected) invokingElement.focus()
  }, [isOpen])

  // Cancels the blocked navigation. The discard dialog returns focus itself on Keep editing.
  const stayOnPage = useCallback((currentBlocker: Blocker, focusInvoker: boolean) => {
    if (currentBlocker.state !== 'blocked') return
    focusInvokerOnCloseRef.current = focusInvoker
    setStayedBlocker(currentBlocker)
    currentBlocker.reset()
  }, [])

  // A change that finishes while leaving waits cancels the navigation. Focus returns once the
  // router commits the reset and the dialog closes.
  useEffect(() => {
    if (isDirty || isBusy || blocker.state !== 'blocked') return
    focusInvokerOnCloseRef.current = true
    blocker.reset()
  }, [blocker, isBusy, isDirty])

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

  const stay = () => stayOnPage(blocker, true)

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
        onKeepEditing={() => stayOnPage(blocker, false)}
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
