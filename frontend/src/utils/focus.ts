const EDITABLE_FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly])',
  'select:not([disabled])',
  'textarea:not([disabled]):not([readonly])',
  'button[role="combobox"]:not([disabled])',
].join(', ')

const FOCUSABLE_CONTROL_SELECTOR =
  'input, select, textarea, button, [contenteditable="true"], [tabindex="-1"][aria-invalid="true"]'

const INVALID_FIELD_SELECTOR = '[aria-invalid="true"], [data-invalid="true"]'

const isHidden = (element: HTMLElement): boolean =>
  Boolean(element.closest('[hidden], [inert], [aria-hidden="true"]'))

// A radio group takes focus on its checked option, like a keyboard user tabbing into it.
const focusTarget = (field: HTMLElement): HTMLElement => {
  if (!(field instanceof HTMLInputElement) || field.type !== 'radio' || field.checked) return field
  const group = field.form ?? field.closest('fieldset') ?? field.ownerDocument
  const checked = Array.from(
    group.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked'),
  ).find((radio) => radio.name === field.name)
  return checked ?? field
}

/** Focuses the first field the user can edit inside the container. */
export const focusFirstEditableField = (container: ParentNode | null | undefined): boolean => {
  const field = Array.from(
    container?.querySelectorAll<HTMLElement>(EDITABLE_FIELD_SELECTOR) ?? [],
  ).find((candidate) => !isHidden(candidate))
  if (!field) return false
  focusTarget(field).focus()
  return true
}

/** Waits for a closing panel to return focus before focusing its replacement. */
export const focusFirstEditableFieldAfterPanelChange = (
  container: () => ParentNode | null | undefined,
): void => {
  let frame = 0
  const cancel = () => {
    cancelAnimationFrame(frame)
    document.removeEventListener('pointerdown', cancel, true)
    document.removeEventListener('keydown', cancel, true)
  }
  document.addEventListener('pointerdown', cancel, true)
  document.addEventListener('keydown', cancel, true)
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      cancel()
      focusFirstEditableField(container())
    })
  })
}

/**
 * Focuses the first field marked invalid inside the container. Carbon marks some controls on a
 * wrapper (dropdowns on their list box), so the control inside the wrapper takes focus.
 */
export const focusFirstInvalidField = (container: ParentNode | null | undefined): boolean => {
  const invalid = Array.from(
    container?.querySelectorAll<HTMLElement>(INVALID_FIELD_SELECTOR) ?? [],
  ).find((candidate) => !isHidden(candidate))
  if (!invalid) return false
  const control = invalid.matches(FOCUSABLE_CONTROL_SELECTOR)
    ? invalid
    : invalid.querySelector<HTMLElement>(FOCUSABLE_CONTROL_SELECTOR)
  if (!control) return false
  control.focus()
  control.scrollIntoView?.({ block: 'nearest' })
  return true
}

/** Waits for the next render to commit, then focuses the first invalid field. */
export const focusFirstInvalidFieldAfterRender = (
  container: () => ParentNode | null | undefined,
): void => {
  requestAnimationFrame(() => {
    focusFirstInvalidField(container())
  })
}
