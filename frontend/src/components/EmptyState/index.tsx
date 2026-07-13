import { useId, type ReactNode } from 'react'

import './EmptyState.css'

const DefaultEmptyStatePictogram = () => (
  <svg
    className="lexis-empty-state__default-pictogram"
    width="80"
    height="80"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M11 29H2V1h16l6 6v5M18 1v6h6M6 13h10M6 19h5"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="21" cy="22" r="7" stroke="currentColor" strokeWidth="1.25" />
    <path
      d="m26.25 27.25 4.25 4.25"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
    />
  </svg>
)

export type EmptyStateProps = {
  title: ReactNode
  description: ReactNode
  icon?: ReactNode
  iconLabel?: string
  action?: ReactNode
  className?: string
  headingLevel?: 1 | 2 | 3 | 4
  role?: 'region' | 'status' | 'alert'
}

/** Centered empty-result treatment shared by search, list, and detail surfaces. */
const EmptyState = ({
  title,
  description,
  icon,
  iconLabel,
  action,
  className,
  headingLevel = 2,
  role,
}: EmptyStateProps) => {
  const generatedId = useId().replaceAll(':', '')
  const titleId = `lexis-empty-state-title-${generatedId}`
  const descriptionId = `lexis-empty-state-description-${generatedId}`
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3' | 'h4'

  return (
    <section
      className={['lexis-empty-state', className].filter(Boolean).join(' ')}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        className="lexis-empty-state__pictogram"
        role={icon && iconLabel ? 'img' : undefined}
        aria-label={icon && iconLabel ? iconLabel : undefined}
        aria-hidden={icon && iconLabel ? undefined : true}
      >
        {icon ?? <DefaultEmptyStatePictogram />}
      </div>
      <Heading id={titleId} className="lexis-empty-state__title">
        {title}
      </Heading>
      <div id={descriptionId} className="lexis-empty-state__description">
        {description}
      </div>
      {action ? <div className="lexis-empty-state__action">{action}</div> : null}
    </section>
  )
}

export default EmptyState
