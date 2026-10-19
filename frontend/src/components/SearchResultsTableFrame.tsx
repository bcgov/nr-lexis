import { DataTableSkeleton, InlineLoading, TableToolbar, TableToolbarContent } from '@carbon/react'
import {
  useEffect,
  useImperativeHandle,
  useRef,
  type FocusEvent as ReactFocusEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { formatSearchResultCount } from '@/pages/shared/deferred-search-total'
import TableFrame from './TableFrame'

type PagerControl = 'forward' | 'backward' | 'pageSize' | 'page'

/** Where focus was inside the results when a search started, so it can return once they reload. */
type FocusLocator =
  | { kind: 'sortHeader'; column: number }
  | { kind: 'pager'; control: PagerControl }

const PAGER_SELECTORS: Record<PagerControl, string> = {
  forward: '.cds--pagination__button--forward',
  backward: '.cds--pagination__button--backward',
  pageSize: '.cds--select__item-count select',
  page: '.cds--select__page-number select',
}

const pagerControlFor = (element: Element): PagerControl | null => {
  if (element.closest(PAGER_SELECTORS.forward)) return 'forward'
  if (element.closest(PAGER_SELECTORS.backward)) return 'backward'
  if (element.closest('.cds--select__item-count')) return 'pageSize'
  if (element.closest('.cds--select__page-number')) return 'page'
  return null
}

const locateControl = (element: Element): FocusLocator | null => {
  const header = element.closest('.cds--table-sort')?.closest('th')
  if (header?.parentElement) {
    return { kind: 'sortHeader', column: Array.from(header.parentElement.children).indexOf(header) }
  }
  const control = pagerControlFor(element)
  return control ? { kind: 'pager', control } : null
}

const isUsable = (element: HTMLElement | null): element is HTMLElement =>
  element !== null &&
  !(element as HTMLButtonElement).disabled &&
  element.getAttribute('aria-disabled') !== 'true'

/** Focuses the control the locator names; failing that, the other pager button, then the frame. */
const restoreFocus = (frame: HTMLElement, locator: FocusLocator) => {
  const find = (selector: string) => frame.querySelector<HTMLElement>(selector)
  const candidates =
    locator.kind === 'sortHeader'
      ? [find(`thead th:nth-child(${locator.column + 1}) .cds--table-sort`)]
      : [
          find(PAGER_SELECTORS[locator.control]),
          find(PAGER_SELECTORS.forward),
          find(PAGER_SELECTORS.backward),
        ]
  const target = candidates.find(isUsable) ?? frame
  target.focus()
}

type SearchResultsTableFrameProps = {
  /** The results container; it takes programmatic focus when nothing in the results can. */
  ref?: Ref<HTMLDivElement>
  children: ReactNode
  loading: boolean
  loadingDescription: string
  totalItems?: number
  totalItemsLabel?: ReactNode
  resultName?: string
  actions?: ReactNode
  /** The number of result columns; the loading skeleton shows a grey bar in each header. */
  columnCount?: number
  /** With no results, the toolbar is hidden from view but still announces the count. */
  hideZeroCount?: boolean
}

function SearchResultsTableFrame({
  ref,
  children,
  loading,
  loadingDescription,
  totalItems,
  totalItemsLabel,
  resultName = 'result',
  actions,
  columnCount = 6,
  hideZeroCount = false,
}: SearchResultsTableFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => frameRef.current as HTMLDivElement, [])
  // The control holding focus, noted as focus moves because the skeleton that replaces the results
  // removes it without any event. Focus that moves elsewhere, or is released, forgets it.
  const focusedControlRef = useRef<FocusLocator | null>(null)
  const controlToRestoreRef = useRef<FocusLocator | null>(null)

  const noteFocus = (event: ReactFocusEvent<HTMLDivElement>) => {
    focusedControlRef.current = locateControl(event.target)
  }
  const forgetFocusLeft = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget || event.target.isConnected) focusedControlRef.current = null
  }

  useEffect(() => {
    if (!loading) {
      const locator = controlToRestoreRef.current
      if (!locator) return
      const request = requestAnimationFrame(() => {
        controlToRestoreRef.current = null
        focusedControlRef.current = null
        const frame = frameRef.current
        const active = document.activeElement
        if (frame && (!active || active === document.body || active === frame)) {
          restoreFocus(frame, locator)
        }
      })
      return () => cancelAnimationFrame(request)
    }

    controlToRestoreRef.current = focusedControlRef.current
    if (!controlToRestoreRef.current) return
    // A user who moves on during the request keeps their new place when the results arrive.
    const cancel = () => {
      controlToRestoreRef.current = null
      focusedControlRef.current = null
    }
    const cancelOnKey = (event: KeyboardEvent) => {
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) cancel()
    }
    const cancelOnFocus = (event: FocusEvent) => {
      if (event.target !== document.body && !frameRef.current?.contains(event.target as Node)) {
        cancel()
      }
    }
    document.addEventListener('pointerdown', cancel, true)
    document.addEventListener('keydown', cancelOnKey, true)
    document.addEventListener('focusin', cancelOnFocus)
    return () => {
      document.removeEventListener('pointerdown', cancel, true)
      document.removeEventListener('keydown', cancelOnKey, true)
      document.removeEventListener('focusin', cancelOnFocus)
    }
  }, [loading])

  const toolbarHidden = hideZeroCount && !loading && totalItems === 0 && !actions
  return (
    <div
      ref={frameRef}
      tabIndex={-1}
      className="legacy-search-table-frame"
      onFocus={noteFocus}
      onBlur={forgetFocusLeft}
    >
      {(loading || totalItems !== undefined || actions) && (
        <div
          className={`legacy-search-table-toolbar${actions ? ' legacy-search-table-toolbar--with-actions' : ''}${toolbarHidden ? ' cds--visually-hidden' : ''}`}
        >
          <TableToolbar>
            <TableToolbarContent>
              {loading && (
                <div className="legacy-search-result-loading">
                  <InlineLoading description={loadingDescription} />
                </div>
              )}
              {/* Stays mounted so the new count is announced after each search. */}
              <div className="legacy-search-result-count" aria-live="polite" aria-atomic="true">
                {!loading && totalItems !== undefined
                  ? (totalItemsLabel ?? formatSearchResultCount(totalItems, resultName))
                  : null}
              </div>
              {actions ? (
                <div className="legacy-search-table-toolbar__actions">{actions}</div>
              ) : null}
            </TableToolbarContent>
          </TableToolbar>
        </div>
      )}
      <TableFrame
        ariaLabel="Search results table"
        className="legacy-search-table-content"
        aria-busy={loading}
      >
        {loading ? (
          <DataTableSkeleton
            aria-label={loadingDescription}
            columnCount={columnCount}
            rowCount={5}
            showHeader={false}
            showToolbar={false}
          />
        ) : (
          children
        )}
      </TableFrame>
    </div>
  )
}

export default SearchResultsTableFrame
