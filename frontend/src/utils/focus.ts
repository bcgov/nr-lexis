const EDITABLE_FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly])',
  'select:not([disabled])',
  'textarea:not([disabled]):not([readonly])',
  'button[role="combobox"]:not([disabled])',
].join(', ')

const FOCUSABLE_CONTROL_SELECTOR =
  'input, select, textarea, button, [contenteditable="true"], [tabindex="-1"][aria-invalid="true"]'

const INVALID_FIELD_SELECTOR = '[aria-invalid="true"], [data-invalid="true"]'

/** The element that has focus, or null when nothing on the page does. */
export const focusedElement = (): HTMLElement | null =>
  document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement
    : null

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

type DateCalendar = {
  isOpen: boolean
  open: () => void
  close: () => void
  changeMonth: (offset: number) => void
  calendarContainer: HTMLElement
}
export type DateInput = HTMLInputElement & { _flatpickr?: DateCalendar }

/** Moves focus from a date field into its calendar, on the preferred day when there is one. */
export const focusDateCalendarDay = (calendar: DateCalendar, preferredDay?: string): boolean => {
  // Carbon's Escape hides the calendar without closing it, so it is closed before opening again.
  if (calendar.isOpen && !calendar.calendarContainer.classList.contains('open')) calendar.close()
  if (!calendar.isOpen) calendar.open()
  const days = calendar.calendarContainer
  const day =
    (preferredDay ? days.querySelector<HTMLElement>(preferredDay) : null) ??
    days.querySelector<HTMLElement>('.flatpickr-day.selected') ??
    days.querySelector<HTMLElement>('.flatpickr-day.today') ??
    days.querySelector<HTMLElement>('.flatpickr-day[tabindex]')
  day?.focus()
  // A calendar that has just opened keeps its days hidden until its open animation ends.
  if (day && document.activeElement !== day) {
    days.addEventListener('animationend', () => day.focus(), { once: true })
  }
  return !!day
}

// Carbon names an open calendar's month on open and month changes only, not when its date changes.
export const refreshOpenCalendarMonthName = (input: DateInput | null | undefined): void => {
  const calendar = input?._flatpickr
  if (calendar?.isOpen) calendar.changeMonth(0)
}

// Focusing a date field opens its calendar, which would cover what is under the field.
export const closeDateCalendar = (control: HTMLElement): void => {
  control
    .closest('.cds--date-picker')
    ?.querySelectorAll<DateInput>('input')
    .forEach((input) => {
      if (input._flatpickr?.isOpen) input._flatpickr.close()
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
  closeDateCalendar(control)
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
