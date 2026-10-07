import type { ReactNode } from 'react'

/**
 * The required marker: a plain red asterisk before the label ("* Status"). The stylesheet
 * draws it, so it stays out of the label text, and screen readers skip it; every required
 * input also sets aria-required (or native required).
 */
export const requiredLabel = (label: ReactNode, required = true): NonNullable<ReactNode> =>
  required ? (
    <span className="required-label">
      <span className="required-label__marker" aria-hidden="true" />
      {label}
    </span>
  ) : (
    (label ?? '')
  )

/**
 * Ref for a required Carbon Dropdown. Dropdown doesn't forward aria-required, but its ref is
 * the combobox button.
 */
export const markRequired = (button: HTMLButtonElement | null) =>
  button?.setAttribute('aria-required', 'true')
