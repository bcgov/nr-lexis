import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const ProvincialOfferCreatePage: FC = () => {
  return (
    <LegacyModulePage
      title="Create Provincial Offer"
      description="Creation flow shell for provincial offer details and approval workflow."
      legacySourcePath="src/main/webapp/WEB-INF/jsp/provincial/offers/offers.jsp"
    />
  )
}

export default ProvincialOfferCreatePage
