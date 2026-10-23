import type { CarbonIconType } from '@carbon/icons-react'
import type { ReactNode } from 'react'

type OfferFormSectionProps = {
  icon: CarbonIconType
  title: string
  children: ReactNode
}

/** One titled section of the offer card, set apart from the one before it by a divider. */
const OfferFormSection = ({ icon: Icon, title, children }: OfferFormSectionProps) => (
  <fieldset className="legacy-form-fieldset offer-form-section">
    <legend className="detail-tile-title">
      <Icon size={24} aria-hidden="true" />
      {title}
    </legend>
    {children}
  </fieldset>
)

export default OfferFormSection
