import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { SidePanel, type SidePanelProps } from '@carbon/ibm-products'
import './DetailSidePanel.scss'

const SLIDE_IN_QUERY = '(min-width: 1312px)'

type DetailSidePanelProps = {
  open: boolean
  title: string
  className?: string
  contentSelector: string
  initialFocusSelector: string
  launcherRef: RefObject<HTMLElement | null>
  fallbackFocusSelector: string
  loading?: boolean
  busy?: boolean
  actions: SidePanelProps['actions']
  onClose: () => void
  children: ReactNode
}

/** Uses IBM's slide-in panel where the page has room, and its overlay on narrower screens. */
export default function DetailSidePanel({
  open,
  title,
  className,
  contentSelector,
  initialFocusSelector,
  launcherRef,
  fallbackFocusSelector,
  loading = false,
  busy = false,
  actions,
  onClose,
  children,
}: DetailSidePanelProps) {
  const [slideIn, setSlideIn] = useState(() => window.matchMedia(SLIDE_IN_QUERY).matches)
  const panelRef = useRef<HTMLDivElement>(null)
  const needsFocusReturnRef = useRef(false)

  useEffect(() => {
    const query = window.matchMedia(SLIDE_IN_QUERY)
    const update = () => setSlideIn(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!open || loading) return
    const frame = requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>(initialFocusSelector)?.focus(),
    )
    return () => cancelAnimationFrame(frame)
  }, [open, loading, initialFocusSelector])

  useEffect(() => {
    if (open) {
      needsFocusReturnRef.current = true
      return
    }
    // A successful save closes the form before reloading the table and enabling its actions.
    if (busy || !needsFocusReturnRef.current) return
    needsFocusReturnRef.current = false
    const frame = requestAnimationFrame(() => {
      const launcher = launcherRef.current
      const target = launcher?.isConnected
        ? launcher
        : document.querySelector<HTMLElement>(fallbackFocusSelector)
      target?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open, busy, launcherRef, fallbackFocusSelector])

  useLayoutEffect(() => {
    const content = document.querySelector<HTMLElement>(contentSelector)
    // IBM applies these inline styles for slide-in. Restore them on close or breakpoint change.
    return () => {
      content?.style.removeProperty('margin-inline-end')
      content?.style.removeProperty('inline-size')
      content?.style.removeProperty('transition')
    }
  }, [contentSelector, open, slideIn])

  if (!open) return null

  const requestClose = () => {
    if (!busy) onClose()
  }

  return (
    <div
      className="detail-side-panel-host"
      onKeyDown={(event) => {
        if (slideIn && event.key === 'Escape' && !event.defaultPrevented) {
          event.stopPropagation()
          requestClose()
        }
      }}
    >
      <SidePanel
        ref={panelRef}
        open
        title={title}
        size="md"
        className={`detail-side-panel ${className ?? ''}`}
        slideIn={slideIn}
        selectorPageContent={contentSelector}
        selectorPrimaryFocus={initialFocusSelector}
        includeOverlay={!slideIn}
        preventCloseOnClickOutside
        hideCloseButton
        animateTitle={false}
        actions={actions}
        onRequestClose={requestClose}
      >
        {children}
      </SidePanel>
    </div>
  )
}
