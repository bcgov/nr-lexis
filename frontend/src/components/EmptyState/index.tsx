import { useId, type ReactNode } from 'react'

import './EmptyState.css'

const DefaultEmptyStatePictogram = () => (
  <svg
    className="lexis-empty-state__default-pictogram"
    width="48"
    height="48"
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth="0.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M3 1.5H27L36 10.5V43.5H3Z" vectorEffect="non-scaling-stroke" />
    <path d="M27 1.5V10.5H36" vectorEffect="non-scaling-stroke" />
    <path d="M9 19.5H24" vectorEffect="non-scaling-stroke" />
    <path d="M9 28.5H16.5" vectorEffect="non-scaling-stroke" />
    <circle cx="31.5" cy="34.5" r="11.5" vectorEffect="non-scaling-stroke" />
    <path d="M40 43L46 48" vectorEffect="non-scaling-stroke" />
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
