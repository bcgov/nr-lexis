import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react'

import './PageHeader.css'

type PageHeaderProps = Omit<ComponentPropsWithoutRef<'header'>, 'title'> & {
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  actions?: ReactNode
  headingId?: string
  actionsLabel?: string
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
  className,
  'aria-describedby': ariaDescribedBy,
  ...headerProps
}: PageHeaderProps) => {
  const generatedId = useId().replaceAll(':', '')
  const resolvedHeadingId = headingId ?? `lexis-page-title-${generatedId}`
  const subtitleId = `lexis-page-subtitle-${generatedId}`
  const describedBy = [ariaDescribedBy, subtitle ? subtitleId : undefined].filter(Boolean).join(' ')

  return (
    <header
      {...headerProps}
      className={['lexis-page-header', className].filter(Boolean).join(' ')}
      aria-labelledby={resolvedHeadingId}
      aria-describedby={describedBy || undefined}
    >
      <div className="lexis-page-header__top">
        <div className="lexis-page-header__title-group">
          <h1 id={resolvedHeadingId} className="lexis-page-header__title">
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
