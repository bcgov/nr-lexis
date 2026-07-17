import { useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'

export type TableFrameProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'aria-label' | 'role' | 'tabIndex'
> & {
  ariaLabel: string
  children: ReactNode
}

/** Provides a bordered card edge and a keyboard-focusable viewport when the table overflows. */
const TableFrame = ({ ariaLabel, children, className, ...frameProps }: TableFrameProps) => {
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const updateScrollability = () => {
      if (frame.scrollWidth > frame.clientWidth + 1) {
        frame.tabIndex = 0
      } else {
        frame.removeAttribute('tabindex')
      }
    }

    updateScrollability()
    window.addEventListener('resize', updateScrollability)

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScrollability)
    resizeObserver?.observe(frame)
    const table = frame.querySelector('table')
    if (table) resizeObserver?.observe(table)

    return () => {
      window.removeEventListener('resize', updateScrollability)
      resizeObserver?.disconnect()
    }
  }, [])

  return (
    <div
      {...frameProps}
      ref={frameRef}
      className={['lexis-table-frame', className].filter(Boolean).join(' ')}
      role="region"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  )
}

export default TableFrame
