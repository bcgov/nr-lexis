import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useDiscardPrompt } from '@/components/DiscardChangesModal'
import { focusFirstEditableField } from '@/utils/focus'

// Edit forms can wait on options or a lock before their fields render, and a save can reload the
// record before its Edit button returns. Any user input first cancels the wait.
const FOCUS_WAIT_MS = 15_000

type FocusIntent<S> = {
  target: 'field' | 'edit-button'
  section: S
  until: number
  launcher?: HTMLElement | null
}

type UseEditSectionsOptions<S extends string> = {
  /** Whether the section being edited differs from the values it started with. */
  isDirty: boolean
  /** Resets the section's draft to its saved values. */
  onDiscard: (section: S) => void
  /**
   * State declared earlier on the page, when code above the hook needs to know which section
   * edits. Defaults to the hook's own state.
   */
  state?: readonly [S | null, (section: S | null) => void]
  /** Drafts outside the edit section also guard leaving or replacing it. */
  leaveGuard?: {
    isDirty: boolean
    isBusy?: boolean
    onDiscard: () => void
  }
}

export type EditSections<S extends string> = {
  editingSection: S | null
  setEditingSection: (section: S | null) => void
  isEditing: (section: S) => boolean
  /** Enters edit mode, after asking to discard the page's unsaved changes. */
  startEditing: (section: S, prepare?: () => void) => void
  /** Leaves edit mode, after asking to discard changes. Focus returns to the Edit button. */
  cancelEditing: () => void
  /** Leaves edit mode after a save. Focus returns to the Edit button. */
  finishEditing: () => void
  /** Runs an action that leaves the section (a tab switch, a panel), asking to discard first. */
  confirmLeave: (action: () => void) => void
  /** Marks an element that holds the fields of one or more sections in edit mode. */
  sectionRef: (...sections: S[]) => ElementRef
  /** Marks the section's Edit button, which takes focus back after Save or Cancel. */
  editButtonRef: (section: S) => ElementRef
  discardModal: ReactNode
}

type ElementRef = (element: HTMLElement | null) => (() => void) | undefined

const focusWasLost = (
  allowed: ReadonlySet<HTMLElement> | undefined,
  launcher?: HTMLElement | null,
): boolean => {
  const active = document.activeElement
  return (
    !active ||
    active === document.body ||
    !active.isConnected ||
    active === launcher ||
    (active instanceof HTMLElement && !!allowed?.has(active))
  )
}

// A section can have an Edit button on more than one tab; only the visible one takes focus.
const visibleEditButton = (buttons: ReadonlySet<HTMLElement> | undefined) =>
  Array.from(buttons ?? []).find(
    (button) =>
      button.isConnected &&
      !(button as HTMLButtonElement).disabled &&
      !button.closest('[hidden], [inert], [aria-hidden="true"]'),
  )

const registerElement = <S,>(
  elements: Map<S, Set<HTMLElement>>,
  section: S,
  element: HTMLElement | null,
) => {
  if (!element) return undefined
  const sectionElements = elements.get(section) ?? new Set<HTMLElement>()
  sectionElements.add(element)
  elements.set(section, sectionElements)
  return () => {
    sectionElements.delete(element)
  }
}

/**
 * Page-level edit mode where only one section edits at a time. Entering edit mode focuses the
 * section's first field; Save or Cancel returns focus to its Edit button.
 */
export const useEditSections = <S extends string>({
  isDirty,
  onDiscard,
  state,
  leaveGuard,
}: UseEditSectionsOptions<S>): EditSections<S> => {
  const [ownSection, setOwnSection] = useState<S | null>(null)
  const [editingSection, setEditingSection] = state ?? [ownSection, setOwnSection]
  const { confirmDiscard, discardModal: editDiscardModal } = useDiscardPrompt(
    editingSection !== null && isDirty,
  )
  const { confirmDiscard: confirmLeaveDiscard, discardModal: leaveDiscardModal } = useDiscardPrompt(
    leaveGuard?.isDirty ?? (editingSection !== null && isDirty),
  )
  const sectionElementsRef = useRef(new Map<S, Set<HTMLElement>>())
  const editButtonsRef = useRef(new Map<S, Set<HTMLElement>>())
  const sectionRefCallbacksRef = useRef(new Map<string, ElementRef>())
  const editButtonRefCallbacksRef = useRef(new Map<S, ElementRef>())
  const previousSectionRef = useRef<S | null>(null)
  const leavingRef = useRef(false)
  const focusIntentRef = useRef<FocusIntent<S> | null>(null)
  const fieldLauncherRef = useRef<HTMLElement | null>(null)
  const onDiscardRef = useRef(onDiscard)
  onDiscardRef.current = onDiscard
  const onLeaveDiscardRef = useRef(leaveGuard?.onDiscard)
  onLeaveDiscardRef.current = leaveGuard?.onDiscard

  const tryFocus = useCallback((): boolean => {
    const intent = focusIntentRef.current
    if (!intent) return true
    if (Date.now() > intent.until) {
      focusIntentRef.current = null
      return true
    }
    const editButtons = editButtonsRef.current.get(intent.section)
    if (intent.target === 'field') {
      if (!focusWasLost(editButtons, intent.launcher)) {
        focusIntentRef.current = null
        return true
      }
      const containers = Array.from(sectionElementsRef.current.get(intent.section) ?? [])
      if (!containers.some((container) => focusFirstEditableField(container))) return false
    } else {
      const editButton = visibleEditButton(editButtons)
      if (!editButton) return false
      if (focusWasLost(undefined)) editButton.focus()
    }
    focusIntentRef.current = null
    return true
  }, [])

  useEffect(() => {
    const previous = previousSectionRef.current
    previousSectionRef.current = editingSection
    if (previous === editingSection) return
    const leaving = leavingRef.current
    leavingRef.current = false
    const launcher = fieldLauncherRef.current
    fieldLauncherRef.current = null
    if (editingSection) {
      focusIntentRef.current = {
        target: 'field',
        section: editingSection,
        until: Date.now() + FOCUS_WAIT_MS,
        launcher,
      }
    } else if (previous && !leaving) {
      focusIntentRef.current = {
        target: 'edit-button',
        section: previous,
        until: Date.now() + FOCUS_WAIT_MS,
      }
    } else {
      focusIntentRef.current = null
      return
    }

    let frame = 0
    const attempt = () => {
      if (!tryFocus()) frame = requestAnimationFrame(attempt)
    }
    // The user moving on first cancels the pending focus.
    const cancel = () => {
      focusIntentRef.current = null
    }
    frame = requestAnimationFrame(attempt)
    document.addEventListener('pointerdown', cancel, true)
    document.addEventListener('keydown', cancel, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', cancel, true)
      document.removeEventListener('keydown', cancel, true)
    }
  }, [editingSection, tryFocus])

  const startEditing = useCallback(
    (section: S, prepare?: () => void) => {
      if (leaveGuard?.isBusy) return
      const active = document.activeElement
      const launcher =
        active instanceof HTMLElement && editButtonsRef.current.get(section)?.has(active)
          ? active
          : null
      const confirm = onLeaveDiscardRef.current ? confirmLeaveDiscard : confirmDiscard
      confirm(() => {
        // An Edit button can keep its DOM node when it becomes the form's Cancel button.
        fieldLauncherRef.current = launcher
        if (editingSection && editingSection !== section) onDiscardRef.current(editingSection)
        onLeaveDiscardRef.current?.()
        prepare?.()
        setEditingSection(section)
      })
    },
    [confirmDiscard, confirmLeaveDiscard, editingSection, leaveGuard?.isBusy, setEditingSection],
  )

  const cancelEditing = useCallback(() => {
    if (leaveGuard?.isBusy) return
    confirmDiscard(() => {
      if (editingSection) onDiscardRef.current(editingSection)
      setEditingSection(null)
    })
  }, [confirmDiscard, editingSection, leaveGuard?.isBusy, setEditingSection])

  const finishEditing = useCallback(() => {
    setEditingSection(null)
  }, [setEditingSection])

  const confirmLeave = useCallback(
    (action: () => void) => {
      if (leaveGuard?.isBusy) return
      if (!editingSection && !onLeaveDiscardRef.current) {
        action()
        return
      }
      confirmLeaveDiscard(() => {
        leavingRef.current = editingSection !== null
        if (editingSection) onDiscardRef.current(editingSection)
        onLeaveDiscardRef.current?.()
        setEditingSection(null)
        action()
      })
    },
    [confirmLeaveDiscard, editingSection, leaveGuard?.isBusy, setEditingSection],
  )

  const sectionRef = useCallback((...sections: S[]) => {
    const key = sections.join(' ')
    let ref = sectionRefCallbacksRef.current.get(key)
    if (!ref) {
      ref = (element: HTMLElement | null) => {
        const cleanups = sections.map((section) =>
          registerElement(sectionElementsRef.current, section, element),
        )
        return element ? () => cleanups.forEach((cleanup) => cleanup?.()) : undefined
      }
      sectionRefCallbacksRef.current.set(key, ref)
    }
    return ref
  }, [])

  const editButtonRef = useCallback((section: S) => {
    let ref = editButtonRefCallbacksRef.current.get(section)
    if (!ref) {
      ref = (element: HTMLElement | null) =>
        registerElement(editButtonsRef.current, section, element)
      editButtonRefCallbacksRef.current.set(section, ref)
    }
    return ref
  }, [])

  const isEditing = useCallback((section: S) => editingSection === section, [editingSection])

  return {
    editingSection,
    setEditingSection,
    isEditing,
    startEditing,
    cancelEditing,
    finishEditing,
    confirmLeave,
    sectionRef,
    editButtonRef,
    discardModal: (
      <>
        {editDiscardModal}
        {leaveDiscardModal}
      </>
    ),
  }
}
