import { Modal as CarbonModal, type ModalProps } from '@carbon/react'
import { useEffect, type Ref } from 'react'

/** Matches FSPTS modal focus: prefer dialog content and never open on the close icon. */
const Modal = ({ ref, ...props }: ModalProps & { ref?: Ref<HTMLDivElement> }) => {
  useEffect(() => {
    if (!props.open) return

    const frame = requestAnimationFrame(() => {
      const activeElement = document.activeElement as HTMLElement | null
      if (activeElement?.classList.contains('cds--modal-close')) {
        activeElement.blur()
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [props.open])

  return (
    <CarbonModal
      selectorPrimaryFocus="input:not([type='hidden']), select, textarea, button:not(.cds--modal-close)"
      {...props}
      ref={ref}
    />
  )
}

export default Modal
