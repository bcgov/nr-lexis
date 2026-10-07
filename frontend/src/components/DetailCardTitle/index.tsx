import type { CarbonIconType } from '@carbon/icons-react'
import type { ComponentPropsWithoutRef } from 'react'

type DetailCardTitleProps = ComponentPropsWithoutRef<'h2'> & {
  /** The icon of the tab the card sits in. */
  icon?: CarbonIconType
}

/** A record card's title: an h2 in heading-03, led by its tab's 24px icon. */
const DetailCardTitle = ({ icon: Icon, className, children, ...props }: DetailCardTitleProps) => (
  <h2 {...props} className={['detail-tile-title', className].filter(Boolean).join(' ')}>
    {Icon && <Icon size={24} aria-hidden="true" />}
    {children}
  </h2>
)

export default DetailCardTitle
