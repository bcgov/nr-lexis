import { useCallback, useState } from 'react'
import { fieldErrorText } from '@/utils/field-error'
import { focusFirstInvalidFieldAfterRender } from '@/utils/focus'

export type FieldErrors<F extends string> = Partial<Record<F, string | null | undefined>>

export const hasFieldErrors = <F extends string>(errors: FieldErrors<F>): boolean =>
  Object.values(errors).some(Boolean)

/**
 * Field errors for a form that validates when the user saves. Each error shows on its field,
 * replacing the helper text, and clears once the user changes that field.
 */
export const useFieldErrors = <F extends string>() => {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<F>>({})

  const clearFieldError = useCallback((field: F) => {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }, [])

  const resetFieldErrors = useCallback(() => setFieldErrors({}), [])

  /** Shows the errors and focuses the first one. Returns whether the form can be saved. */
  const showFieldErrors = useCallback(
    (errors: FieldErrors<F>, container: () => ParentNode | null | undefined): boolean => {
      setFieldErrors(errors)
      if (!hasFieldErrors(errors)) return true
      focusFirstInvalidFieldAfterRender(container)
      return false
    },
    [],
  )

  const invalidProps = (field: F) => ({
    invalid: Boolean(fieldErrors[field]),
    invalidText: fieldErrorText(fieldErrors[field] || undefined),
  })

  return {
    fieldErrors,
    setFieldErrors,
    clearFieldError,
    resetFieldErrors,
    showFieldErrors,
    invalidProps,
  }
}
