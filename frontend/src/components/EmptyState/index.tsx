import { DesignResearch } from '@carbon/pictograms-react'
import { useId, type ReactNode } from 'react'

import './EmptyState.css'

const DefaultEmptyStatePictogram = () => (
  <DesignResearch className="lexis-empty-state__default-pictogram" width={48} height={48} />
)

type EmptyStateProps = {
  title: ReactNode
  description: ReactNode
  icon?: ReactNode
  iconLabel?: string
  action?: ReactNode
  className?: string
  headingLevel?: 1 | 2 | 3 | 4
  role?: 'region' | 'status' | 'alert'
  /** "tab" fills an empty tab: no card, centred on the tab's own background. */
  variant?: 'default' | 'tab'
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
  variant = 'default',
}: EmptyStateProps) => {
  const generatedId = useId().replaceAll(':', '')
  const titleId = `lexis-empty-state-title-${generatedId}`
  const descriptionId = `lexis-empty-state-description-${generatedId}`
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3' | 'h4'

  return (
    <section
      className={[
        'lexis-empty-state',
        variant === 'tab' ? 'lexis-empty-state--tab' : undefined,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
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
