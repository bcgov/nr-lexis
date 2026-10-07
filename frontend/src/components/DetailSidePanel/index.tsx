import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { SidePanel, type SidePanelProps } from '@carbon/ibm-products'
import './DetailSidePanel.scss'

const BESIDE_PAGE_QUERY = '(min-width: 1312px)'
// IBM slides over the page when its page content selector matches nothing it can push aside, but
// warns about it, so narrow screens point it at an empty marker instead.
const SLIDE_OVER_MARKER = 'data-detail-side-panel-slide-over'

// An open menu's trigger keeps aria-expanded until its own Escape handler has re-rendered it.
const closesOpenMenu = (target: Element): boolean =>
  target.getAttribute('aria-expanded') === 'true' &&
  (target.getAttribute('role') === 'combobox' || target.hasAttribute('aria-haspopup'))

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

/**
 * A non-modal side panel: the page stays visible and usable, with no overlay and no focus trap.
 * Where the page has room the panel sits beside it; on narrower screens it slides over part of it.
 */
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
  const [besidePage, setBesidePage] = useState(() => window.matchMedia(BESIDE_PAGE_QUERY).matches)
  const panelRef = useRef<HTMLDivElement>(null)
  const needsFocusReturnRef = useRef(false)

  useEffect(() => {
    const query = window.matchMedia(BESIDE_PAGE_QUERY)
    const update = () => setBesidePage(query.matches)
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
    // IBM pushes the page aside with these inline styles. Only the panel that pushed it restores
    // them, on close or when it moves over the page, so a closed panel can't undo an open one.
    if (!open || !besidePage) return
    const content = document.querySelector<HTMLElement>(contentSelector)
    return () => {
      content?.style.removeProperty('margin-inline-end')
      content?.style.removeProperty('inline-size')
      content?.style.removeProperty('transition')
    }
  }, [contentSelector, open, besidePage])

  if (!open) return null

  const requestClose = () => {
    if (!busy) onClose()
  }

  const panelEscapeTarget = (event: KeyboardEvent<HTMLDivElement>): Element | null => {
    const target = event.target
    return event.key === 'Escape' &&
      !event.defaultPrevented &&
      target instanceof Element &&
      panelRef.current?.contains(target) &&
      !target.closest('[role="dialog"], [role="alertdialog"]')
      ? target
      : null
  }

  // Carbon's ListBox stops native Escape from bubbling even when its menu is closed.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = panelEscapeTarget(event)
    if (
      target?.getAttribute('role') !== 'combobox' ||
      target.getAttribute('aria-expanded') !== 'false'
    ) {
      return
    }
    event.stopPropagation()
    requestClose()
  }

  // Escape closes the panel from its own fields, but not when it closes a menu or a dialog above
  // the panel. Carbon's Modal handles Escape on the document, after this handler runs.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = panelEscapeTarget(event)
    if (!target || closesOpenMenu(target)) {
      return
    }
    event.stopPropagation()
    requestClose()
  }

  return (
    <div
      className="detail-side-panel-host"
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
    >
      {!besidePage && <span hidden {...{ [SLIDE_OVER_MARKER]: '' }} />}
      <SidePanel
        ref={panelRef}
        open
        title={title}
        size="md"
        className={[
          'detail-side-panel',
          besidePage ? undefined : 'detail-side-panel--over-page',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        slideIn
        selectorPageContent={besidePage ? contentSelector : `[${SLIDE_OVER_MARKER}]`}
        selectorPrimaryFocus={initialFocusSelector}
        preventCloseOnClickOutside
        animateTitle={false}
        // The footer uses standard buttons; the stylesheet sizes them to md.
        actions={actions?.map((action) => ({ ...action, isExpressive: false }))}
        onRequestClose={requestClose}
      >
        {children}
      </SidePanel>
    </div>
  )
}
