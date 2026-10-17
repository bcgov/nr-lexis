import { useEffect, type RefObject } from 'react'

/** Disables a Carbon modal's close icon, which has no prop for it, while `disabled` is true. */
export const useModalCloseDisabled = (
  modalRef: RefObject<HTMLElement | null>,
  disabled: boolean,
): void => {
  useEffect(() => {
    const closeButton = modalRef.current?.querySelector<HTMLButtonElement>('.cds--modal-close')
    if (!closeButton) return
    closeButton.disabled = disabled
    return () => {
      closeButton.disabled = false
    }
  }, [disabled, modalRef])
}
