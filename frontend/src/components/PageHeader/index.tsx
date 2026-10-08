import { useEffect, useId, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'

import './PageHeader.css'

// The router's key for the current history entry. A header that remounts during one visit (for
// example after its page loads) takes focus back only when focus was lost with the old header.
let focusedTitleVisit: string | undefined
const historyEntryKey = (): string | undefined => {
  const state: unknown = window.history.state
  return state && typeof state === 'object' && 'key' in state && typeof state.key === 'string'
    ? state.key
    : undefined
}

type PageHeaderProps = Omit<ComponentPropsWithoutRef<'header'>, 'title'> & {
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  actions?: ReactNode
  headingId?: string
  actionsLabel?: string
  /** Moves focus to the title when the page opens, as create pages do instead of a field. */
  focusTitle?: boolean
}

/**
 * Consistent top-level heading for application pages.
 *
 * The title always renders as the page's single h1. Status and action content
 * remain adjacent visually while retaining their own semantic containers.
 */
const PageHeader = ({
  title,
  subtitle,
  status,
  actions,
  headingId,
  actionsLabel = 'Page actions',
  focusTitle = false,
  className,
  'aria-describedby': ariaDescribedBy,
  ...headerProps
}: PageHeaderProps) => {
  const generatedId = useId().replaceAll(':', '')
  const resolvedHeadingId = headingId ?? `lexis-page-title-${generatedId}`
  const subtitleId = `lexis-page-subtitle-${generatedId}`
  const describedBy = [ariaDescribedBy, subtitle ? subtitleId : undefined].filter(Boolean).join(' ')
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!focusTitle) return
    const visit = historyEntryKey()
    const active = document.activeElement
    const focusLost = !active || active === document.body
    if (visit && visit === focusedTitleVisit && !focusLost) return
    focusedTitleVisit = visit
    titleRef.current?.focus()
  }, [focusTitle])

  return (
    <header
      {...headerProps}
      className={['lexis-page-header', className].filter(Boolean).join(' ')}
      aria-labelledby={resolvedHeadingId}
      aria-describedby={describedBy || undefined}
    >
      <div className="lexis-page-header__top">
        <div className="lexis-page-header__title-group">
          <h1
            ref={titleRef}
            id={resolvedHeadingId}
            className="lexis-page-header__title"
            tabIndex={focusTitle ? -1 : undefined}
          >
            {title}
          </h1>
          {status ? <div className="lexis-page-header__status">{status}</div> : null}
        </div>

        {actions ? (
          <div className="lexis-page-header__actions" role="group" aria-label={actionsLabel}>
            {actions}
          </div>
        ) : null}
      </div>

      {subtitle ? (
        <p id={subtitleId} className="lexis-page-header__subtitle">
          {subtitle}
        </p>
      ) : null}
    </header>
  )
}

export default PageHeader
