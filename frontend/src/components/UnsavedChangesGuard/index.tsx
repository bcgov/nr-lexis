import { use, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Button, Checkbox, InlineNotification, Modal } from '@carbon/react'
import { UNSAFE_DataRouterContext, useBeforeUnload, useBlocker } from 'react-router-dom'
import type { BlockerFunction } from 'react-router-dom'
import { isPageUnloadAuthorized } from '@/utils/page-unload'

import './UnsavedChangesGuard.css'

export type UnsavedChangesGuardProps = {
  isDirty: boolean
  isBusy?: boolean
  onSave: () => Promise<boolean>
  onDiscard: () => void
  subject?: string
  saveUnavailableReason?: string
  saveAcknowledgement?: {
    description: string
    label: string
  }
}

export const formValuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const RouterNavigationGuard = ({
  isDirty,
  isBusy = false,
  onSave,
  onDiscard,
  subject = 'this record',
  saveUnavailableReason,
  saveAcknowledgement,
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
  const internalSaveInProgressRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [saveAcknowledged, setSaveAcknowledged] = useState(false)
  const generatedId = useId().replaceAll(':', '')
  const stayButtonId = `lexis-unsaved-changes-stay-${generatedId}`
  const descriptionId = `lexis-unsaved-changes-description-${generatedId}`
  const acknowledgementId = `lexis-unsaved-changes-acknowledgement-${generatedId}`
  const isOpen = blocker.state === 'blocked'
  const navigationActionsDisabled = isSaving || isBusy
  const busyWithoutDirtyChanges = isBusy && !isDirty
  const modalHeading = busyWithoutDirtyChanges ? 'Change in progress' : 'Unsaved changes'

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
    if (isDirty || isBusy || internalSaveInProgressRef.current || blocker.state !== 'blocked') {
      return
    }
    blocker.reset()
    restoreInvokingFocus()
  }, [blocker, isBusy, isDirty, restoreInvokingFocus])

  useEffect(() => {
    if (!isOpen) return
    const modalNode = modalRef.current
    const dialog = modalNode?.matches('[role="dialog"]')
      ? modalNode
      : modalNode?.querySelector<HTMLElement>('[role="dialog"]')
    dialog?.setAttribute('aria-describedby', descriptionId)
    return () => dialog?.removeAttribute('aria-describedby')
  }, [descriptionId, isOpen])

  const blockedTargetIdentity = (): string | null => {
    const currentBlocker = blockerRef.current
    if (currentBlocker.state !== 'blocked') return null
    const { key, pathname, search, hash } = currentBlocker.location
    return `${key}|${pathname}|${search}|${hash}`
  }

  const stay = () => {
    if (isSaving || blocker.state !== 'blocked') return
    setSaveFailed(false)
    setSaveAcknowledged(false)
    blocker.reset()
    restoreInvokingFocus()
  }

  const discardAndLeave = () => {
    if (navigationActionsDisabled || blocker.state !== 'blocked') return
    const targetIdentity = blockedTargetIdentity()
    setSaveFailed(false)
    setSaveAcknowledged(false)
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

  const saveAndLeave = async () => {
    if (
      navigationActionsDisabled ||
      blocker.state !== 'blocked' ||
      (saveAcknowledgement && !saveAcknowledged)
    ) {
      return
    }

    const targetIdentity = blockedTargetIdentity()
    internalSaveInProgressRef.current = true
    setIsSaving(true)
    setSaveFailed(false)
    try {
      const saved = await onSave()
      const latestBlocker = blockerRef.current
      if (saved) {
        if (
          targetIdentity &&
          latestBlocker.state === 'blocked' &&
          blockedTargetIdentity() === targetIdentity
        ) {
          latestBlocker.proceed()
        } else if (latestBlocker.state === 'blocked') {
          latestBlocker.reset()
        }
      } else {
        setSaveFailed(true)
      }
    } catch {
      setSaveFailed(true)
    } finally {
      internalSaveInProgressRef.current = false
      setIsSaving(false)
      setSaveAcknowledged(false)
    }
  }

  return isOpen ? (
    <Modal
      ref={modalRef}
      open={isOpen}
      passiveModal
      size="sm"
      modalHeading={modalHeading}
      aria-label={modalHeading}
      className={`lexis-unsaved-changes-modal${isSaving ? ' lexis-unsaved-changes-modal--saving' : ''}`}
      selectorPrimaryFocus={`#${stayButtonId}`}
      preventCloseOnClickOutside
      onRequestClose={stay}
    >
      <div className="lexis-unsaved-changes-modal__body">
        <p id={descriptionId} className="lexis-unsaved-changes-modal__description">
          {busyWithoutDirtyChanges
            ? `A change to ${subject} is still being completed. Stay on this page until it finishes.`
            : saveUnavailableReason
              ? `You have unsaved changes to ${subject}. ${saveUnavailableReason}`
              : `You have unsaved changes to ${subject}. Save them before leaving, discard them and leave, or stay on this page.`}
        </p>
        {saveFailed && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Could not finish saving changes"
            subtitle="Some changes may already have been saved. Review the page messages, then correct any remaining problem and try again or stay on this page."
          />
        )}
        {saveAcknowledgement && !busyWithoutDirtyChanges && !saveUnavailableReason && (
          <div className="lexis-unsaved-changes-modal__acknowledgement">
            <p>{saveAcknowledgement.description}</p>
            <Checkbox
              id={acknowledgementId}
              labelText={saveAcknowledgement.label}
              checked={saveAcknowledged}
              disabled={navigationActionsDisabled}
              onChange={(_, { checked }) => setSaveAcknowledged(Boolean(checked))}
            />
          </div>
        )}
      </div>
      <div className="lexis-unsaved-changes-modal__actions">
        <Button id={stayButtonId} kind="secondary" disabled={isSaving} onClick={stay}>
          Stay
        </Button>
        {!busyWithoutDirtyChanges && (
          <>
            <Button
              kind="danger--tertiary"
              disabled={navigationActionsDisabled}
              onClick={discardAndLeave}
            >
              Discard and leave
            </Button>
            {!saveUnavailableReason && (
              <Button
                kind="primary"
                disabled={
                  navigationActionsDisabled || Boolean(saveAcknowledgement && !saveAcknowledged)
                }
                onClick={() => void saveAndLeave()}
              >
                {isSaving ? 'Saving...' : 'Save and leave'}
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  ) : null
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
